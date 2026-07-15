import "server-only";
import crypto from "crypto";
import {
  PutCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { ddb, s3, LEADS_TABLE, EVENTS_TABLE, REFERRALS_TABLE, CHATS_TABLE, LOOKUPS_TABLE, PHOTOS_BUCKET } from "./aws";
import type { Lead, Referral, ChatConversation, ChatMessage, Lookup, SiteEvent } from "./types";
import { toE164 } from "./sms";

// ---- Leads (DynamoDB) -----------------------------------------------------

export async function getLeads(): Promise<Lead[]> {
  const leads: Lead[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: LEADS_TABLE, ExclusiveStartKey: lastKey }),
    );
    leads.push(...((res.Items || []) as Lead[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return leads.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function addLead(lead: Lead): Promise<Lead> {
  await ddb.send(new PutCommand({ TableName: LEADS_TABLE, Item: lead }));
  return lead;
}

export async function updateLead(
  id: string,
  patch: Partial<Lead>,
): Promise<Lead | null> {
  const cur = await ddb.send(new GetCommand({ TableName: LEADS_TABLE, Key: { id } }));
  if (!cur.Item) return null;
  const updated = { ...(cur.Item as Lead), ...patch, id };
  await ddb.send(new PutCommand({ TableName: LEADS_TABLE, Item: updated }));
  return updated;
}

/**
 * Atomically update a lead's engagement fields (email/SMS receipt counters,
 * flags, and the commsEvents log) via a single UpdateCommand — the webhook
 * (Resend/Twilio) and cron/admin writers all race on the same lead, and the
 * get→merge→put in updateLead() would let a slow writer clobber a faster one's
 * counter bump. `set` overwrites paths outright; `increment` bumps a (possibly
 * nested) numeric path, seeding it to 0 first via if_not_exists so a lead that's
 * never had e.g. emailEngagement.opensCount still increments correctly;
 * `appendCommsEvent` list_appends one entry onto commsEvents (uncapped here —
 * the 100-entry cap is enforced on read, or by the legacy fallback below, per
 * the comment on that path).
 *
 * Nested increment paths (emailEngagement.opensCount) need their PARENT map to
 * already exist for DynamoDB's `if_not_exists` on the leaf to work — rather
 * than pre-checking, we just attempt the update and on ANY failure (e.g. a
 * ValidationException because the map doesn't exist yet) fall back to the
 * legacy updateLead() get→merge→put path, so behavior is never worse than
 * before this function existed.
 */
export async function atomicLeadEngagement(
  id: string,
  opts: {
    set?: Record<string, string | number | boolean>;
    increment?: Record<string, number>;
    appendCommsEvent?: object;
  },
): Promise<void> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  let n = 0;

  const pathExpr = (path: string): string =>
    path
      .split(".")
      .map((seg) => {
        n += 1;
        const alias = `#p${n}`;
        names[alias] = seg;
        return alias;
      })
      .join(".");

  for (const [path, val] of Object.entries(opts.set || {})) {
    const vAlias = `:v${n + 1}`;
    values[vAlias] = val;
    sets.push(`${pathExpr(path)} = ${vAlias}`);
  }
  for (const [path, delta] of Object.entries(opts.increment || {})) {
    const zeroAlias = `:z${n + 1}`;
    const nAlias = `:n${n + 1}`;
    values[zeroAlias] = 0;
    values[nAlias] = delta;
    const expr = pathExpr(path);
    sets.push(`${expr} = if_not_exists(${expr}, ${zeroAlias}) + ${nAlias}`);
  }
  if (opts.appendCommsEvent) {
    values[":emptyList"] = [];
    values[":commsEntry"] = [opts.appendCommsEvent];
    sets.push("commsEvents = list_append(if_not_exists(commsEvents, :emptyList), :commsEntry)");
  }
  if (!sets.length) return;

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "SET " + sets.join(", "),
        ConditionExpression: "attribute_exists(id)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  } catch (e) {
    // Nested paths whose parent map doesn't exist yet raise a ValidationException
    // (and the lead-missing condition raises a ConditionalCheckFailedException) —
    // either way, fall back to the legacy whole-item path rather than losing the
    // write. Build the equivalent merge patch from the same opts.
    console.warn(`[store] atomicLeadEngagement fell back to updateLead for lead=${id}:`, e);
    const cur = await ddb.send(new GetCommand({ TableName: LEADS_TABLE, Key: { id } }));
    if (!cur.Item) return;
    const lead = cur.Item as Lead;
    const patch: Record<string, unknown> = {};
    for (const [path, val] of Object.entries(opts.set || {})) setPath(patch, lead, path, val);
    for (const [path, delta] of Object.entries(opts.increment || {})) {
      const before = (getPath(lead, path) as number | undefined) || 0;
      setPath(patch, lead, path, before + delta);
    }
    if (opts.appendCommsEvent) {
      const MAX_COMMS_EVENTS = 100;
      patch.commsEvents = [...(lead.commsEvents || []), opts.appendCommsEvent].slice(-MAX_COMMS_EVENTS);
    }
    await updateLead(id, patch as Partial<Lead>);
  }
}

/** Read a (possibly dotted) path off an object. Used only by atomicLeadEngagement's fallback. */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Set a (possibly dotted) path on `patch`, copying forward the existing nested
 * object from `base` first so sibling keys in the same map survive the merge.
 * Used only by atomicLeadEngagement's fallback. */
function setPath(patch: Record<string, unknown>, base: unknown, path: string, val: unknown): void {
  const segs = path.split(".");
  if (segs.length === 1) {
    patch[segs[0]] = val;
    return;
  }
  const [head, ...rest] = segs;
  const baseChild = base && typeof base === "object" ? (base as Record<string, unknown>)[head] : undefined;
  const patchChild = (patch[head] as Record<string, unknown> | undefined) || { ...(baseChild as object | undefined) };
  setPath(patchChild, baseChild, rest.join("."), val);
  patch[head] = patchChild;
}

/**
 * Atomically claim the one-time "offline Purchase sent to Meta" flag for a lead.
 * Returns true ONLY for the caller that wins the claim (conditional on the flag
 * being unset), so concurrent admin edits can never double-fire the Purchase
 * conversion. Uses an atomic conditional UpdateCommand (same pattern as
 * addChatMessage / markLookupConverted) rather than the clobbering whole-item
 * Put in updateLead, which would let a stale-snapshot writer erase the flag.
 */
export async function claimPurchaseSync(id: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "SET purchaseSyncedAt = :now",
        ConditionExpression: "attribute_exists(id) AND attribute_not_exists(purchaseSyncedAt)",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      }),
    );
    return true;
  } catch {
    // Condition failed (already claimed) or the lead is gone — do not fire again.
    return false;
  }
}

/** Release a Purchase-sync claim so a later edit retries it (used when the CAPI send failed). */
export async function releasePurchaseSync(id: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "REMOVE purchaseSyncedAt",
        ConditionExpression: "attribute_exists(id)",
      }),
    );
  } catch {
    /* best-effort: leaving the claim set just means we won't retry — never throws */
  }
}

/**
 * Atomically claim a lead's drafted offer for sending — conditionally REMOVEs
 * pendingOffer so only ONE caller wins. A double-tapped ✅ Send button (or
 * Telegram's at-least-once webhook redelivery) can't send the offer email twice:
 * the loser's condition fails. Returns true only for the winner. If the email
 * send then fails, the caller restores pendingOffer to allow a retry. Same
 * conditional-UpdateCommand pattern as claimPurchaseSync.
 */
export async function claimPendingOffer(id: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "REMOVE pendingOffer",
        ConditionExpression: "attribute_exists(id) AND attribute_exists(pendingOffer)",
      }),
    );
    return true;
  } catch {
    // Condition failed (already claimed/cleared) or the lead is gone — don't send.
    return false;
  }
}

/** Atomically claim a drafted info/message send (mirrors claimPendingOffer) so a
 * double-tapped ✅ Send can't email the customer twice. Returns true only for the
 * winner; the loser's condition fails. On send failure the caller restores the field. */
export async function claimPending(
  id: string,
  field: "pendingInfo" | "pendingMessage",
): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: `REMOVE ${field}`,
        ConditionExpression: `attribute_exists(id) AND attribute_exists(${field})`,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a lead by the short ID shown in the Telegram alert (the first block of
 * its UUID, e.g. "a1b2c3d4") — or by the full id if pasted. Lead volume is
 * modest, so a scan + match is fine. Reports `multiple` on the rare collision.
 */
export async function getLeadByShortId(
  code: string,
): Promise<{ lead: Lead | null; multiple: boolean }> {
  const norm = code.trim().toLowerCase();
  if (!norm) return { lead: null, multiple: false };
  const leads = await getLeads();
  const matches = leads.filter(
    (l) => l.id.toLowerCase() === norm || l.id.split("-")[0].toLowerCase() === norm,
  );
  return { lead: matches[0] || null, multiple: matches.length > 1 };
}

/** Find a lead by its unguessable self-booking token (used by /book/<token>). */
export async function getLeadByBookingToken(token: string): Promise<Lead | null> {
  const norm = (token || "").trim();
  if (!norm) return null;
  const leads = await getLeads();
  return leads.find((l) => l.bookingToken === norm) || null;
}

/** Find the most-recent lead with this E.164 phone (inbound SMS → topic routing).
 * getLeads() is pre-sorted newest-first, so [0] is the latest. */
export async function findLeadByPhone(e164: string): Promise<Lead | null> {
  if (!e164) return null;
  const leads = await getLeads();
  return leads.filter((l) => toE164(l.contact.phone) === e164)[0] || null;
}

/** Find the most-recent lead with this email (inbound email → topic routing).
 * Email is NOT unique (repeat sellers), so this returns the latest match; there's
 * no {multiple} disambiguation like getLeadByShortId. */
export async function findLeadByEmail(email: string): Promise<Lead | null> {
  const norm = (email || "").trim().toLowerCase();
  if (!norm) return null;
  const leads = await getLeads();
  return leads.filter((l) => (l.contact.email || "").trim().toLowerCase() === norm)[0] || null;
}

/** Find the lead that owns a given Replies-group forum topic (message_thread_id) —
 * used to route an owner's in-topic reply back to the right customer. */
export async function getLeadByReplyThreadId(threadId: number): Promise<Lead | null> {
  if (!threadId) return null;
  const leads = await getLeads();
  return leads.find((l) => l.replyTopicId === threadId) || null;
}

/** The forum topic for a CUSTOMER, keyed by email: the reply-topic already on ANY
 * lead that shares this email. Drives "one thread per customer" — a repeat form or
 * any email from this address reuses the same thread instead of opening a new one.
 * getLeads() is newest-first, so the newest topic'd lead's thread wins. */
export async function findCustomerTopic(
  email: string,
): Promise<{ threadId: number; chatId: string } | null> {
  const norm = (email || "").trim().toLowerCase();
  if (!norm) return null;
  const leads = await getLeads();
  for (const l of leads) {
    if (l.replyTopicId != null && (l.contact.email || "").trim().toLowerCase() === norm) {
      return { threadId: l.replyTopicId, chatId: String(l.replyTopicChatId ?? "") };
    }
  }
  return null;
}

/** Atomically claim the right to create THIS lead's Replies topic — a transient
 * lock so a burst of near-simultaneous inbound messages creates ONE topic, not
 * many. Returns true only for the winner, who MUST either persist replyTopicId
 * (success) or call releaseReplyTopic (failure). Mirrors claimPurchaseSync. */
export async function claimReplyTopic(id: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "SET replyTopicPending = :t",
        ConditionExpression:
          "attribute_exists(id) AND attribute_not_exists(replyTopicId) AND attribute_not_exists(replyTopicPending)",
        ExpressionAttributeValues: { ":t": true },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Release the transient replyTopicPending lock (call when topic creation fails,
 * so a failed create can never permanently lock a lead out of ever getting one). */
export async function releaseReplyTopic(id: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "REMOVE replyTopicPending",
        ConditionExpression: "attribute_exists(id)",
      }),
    );
  } catch {
    /* best-effort */
  }
}

/** Claim an in-topic owner message for relay-to-customer, deduping a Telegram
 * redelivery. Telegram message_ids are per-chat monotonic, so we advance a
 * high-water mark and only proceed for a genuinely newer id — a redelivered
 * (or out-of-order) message with id ≤ the mark fails the condition and is
 * skipped, so the customer can never be texted/emailed the same reply twice. */
export async function claimRelayMessage(id: string, msgId: number): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LEADS_TABLE,
        Key: { id },
        UpdateExpression: "SET lastRelayMsgId = :m",
        ConditionExpression:
          "attribute_exists(id) AND (attribute_not_exists(lastRelayMsgId) OR lastRelayMsgId < :m)",
        ExpressionAttributeValues: { ":m": msgId },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteLead(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: LEADS_TABLE, Key: { id } }));
  // Best-effort cleanup of the lead's photos.
  if (!PHOTOS_BUCKET) return;
  try {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: PHOTOS_BUCKET, Prefix: `${id}/` }),
    );
    const objects = (listed.Contents || [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k)
      .map((Key) => ({ Key }));
    if (objects.length) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: PHOTOS_BUCKET,
          Delete: { Objects: objects },
        }),
      );
    }
  } catch {
    /* ignore cleanup failures */
  }
}

// ---- Referrals (DynamoDB) -------------------------------------------------

export async function getReferrals(): Promise<Referral[]> {
  const refs: Referral[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: REFERRALS_TABLE, ExclusiveStartKey: lastKey }),
    );
    refs.push(...((res.Items || []) as Referral[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return refs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function addReferral(ref: Referral): Promise<Referral> {
  await ddb.send(new PutCommand({ TableName: REFERRALS_TABLE, Item: ref }));
  return ref;
}

export async function updateReferral(
  id: string,
  patch: Partial<Referral>,
): Promise<Referral | null> {
  const cur = await ddb.send(
    new GetCommand({ TableName: REFERRALS_TABLE, Key: { id } }),
  );
  if (!cur.Item) return null;
  const updated = { ...(cur.Item as Referral), ...patch, id };
  await ddb.send(new PutCommand({ TableName: REFERRALS_TABLE, Item: updated }));
  return updated;
}

// ---- Photos (S3) ----------------------------------------------------------
// New leads no longer collect photos, but historical leads still have them in
// S3 — the admin reads them via readPhoto() below, and deleteLead() cleans them
// up. (savePhotos was removed when the upload step was retired.)

/** Read a single stored photo (admin-gated route streams this). */
export async function readPhoto(
  leadId: string,
  fileName: string,
): Promise<Buffer | null> {
  if (!PHOTOS_BUCKET) return null;
  const safeId = leadId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "");
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: PHOTOS_BUCKET,
        Key: `${safeId}/${safeName}`,
      }),
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

// ---- Live chat (DynamoDB) -------------------------------------------------

const MAX_CHAT_MESSAGES = 300;

export async function getConversations(): Promise<ChatConversation[]> {
  const items: ChatConversation[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: CHATS_TABLE, ExclusiveStartKey: lastKey }),
    );
    items.push(...((res.Items || []) as ChatConversation[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getConversation(id: string): Promise<ChatConversation | null> {
  const res = await ddb.send(new GetCommand({ TableName: CHATS_TABLE, Key: { id } }));
  return (res.Item as ChatConversation) || null;
}

/** Whole-item update of a conversation — used only for the admin archive/restore
 * toggle. Chats normally grow via addChatMessage's atomic list_append; this
 * get→merge→put is safe for the rare archive toggle (an archived chat isn't being
 * actively appended to). Returns null if the conversation is gone. */
export async function updateConversation(
  id: string,
  patch: Partial<ChatConversation>,
): Promise<ChatConversation | null> {
  const cur = await ddb.send(new GetCommand({ TableName: CHATS_TABLE, Key: { id } }));
  if (!cur.Item) return null;
  const updated = { ...(cur.Item as ChatConversation), ...patch, id };
  await ddb.send(new PutCommand({ TableName: CHATS_TABLE, Item: updated }));
  return updated;
}

/**
 * Append a message to a conversation (atomic list_append, so concurrent
 * visitor + admin sends can't clobber each other). Creates the conversation if
 * it doesn't exist when a visitor writes. Admins can only reply to an existing
 * one. Caps conversation length to guard against abuse.
 */
export async function addChatMessage(opts: {
  conversationId?: string;
  role: "visitor" | "admin";
  text: string;
  name?: string;
  contact?: string;
  visitorId?: string;
  sessionId?: string;
  startedOnPath?: string;
  attribution?: import("./types").Attribution;
  userAgent?: string;
  clientIp?: string;
}): Promise<ChatConversation | null> {
  const now = new Date().toISOString();
  const id = opts.conversationId || crypto.randomUUID();
  const msg: ChatMessage = { id: crypto.randomUUID(), role: opts.role, text: opts.text, at: now };

  if (opts.role === "admin") {
    const existing = await getConversation(id);
    if (!existing) return null;
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: CHATS_TABLE,
        Key: { id },
        UpdateExpression:
          "SET messages = list_append(if_not_exists(messages, :empty), :m), updatedAt = :now, lastSender = :ls, createdAt = if_not_exists(createdAt, :now), #nm = if_not_exists(#nm, :name), #ct = if_not_exists(#ct, :contact), visitorId = if_not_exists(visitorId, :vid), sessionId = if_not_exists(sessionId, :sid), startedOnPath = if_not_exists(startedOnPath, :sop), attribution = if_not_exists(attribution, :attr), userAgent = if_not_exists(userAgent, :ua), clientIp = if_not_exists(clientIp, :ip)",
        ConditionExpression: "attribute_not_exists(messages) OR size(messages) < :cap",
        ExpressionAttributeNames: { "#nm": "name", "#ct": "contact" },
        ExpressionAttributeValues: {
          ":empty": [],
          ":m": [msg],
          ":now": now,
          ":ls": opts.role,
          ":cap": MAX_CHAT_MESSAGES,
          ":name": opts.name ?? null,
          ":contact": opts.contact ?? null,
          ":vid": opts.visitorId ?? null,
          ":sid": opts.sessionId ?? null,
          ":sop": opts.startedOnPath ?? null,
          ":attr": opts.attribution ?? null,
          ":ua": opts.userAgent ?? null,
          ":ip": opts.clientIp ?? null,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return (res.Attributes as ChatConversation) || null;
  } catch {
    // Cap exceeded (or a conditional failure) — return current state unchanged.
    return await getConversation(id);
  }
}

// ---- Price-lookup log / "API Calls" (DynamoDB) ----------------------------

export async function getLookups(): Promise<Lookup[]> {
  const items: Lookup[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: LOOKUPS_TABLE, ExclusiveStartKey: lastKey }),
    );
    items.push(...((res.Items || []) as Lookup[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function addLookup(lookup: Lookup): Promise<void> {
  await ddb.send(new PutCommand({ TableName: LOOKUPS_TABLE, Item: lookup }));
}

// ---- First-party site events (DynamoDB, TTL-expired) -----------------------

/** Batch-write beacon events. DynamoDB caps BatchWrite at 25 items; the API
 * already enforces the same cap per request, but chunk defensively anyway.
 * Best-effort: swallows errors (incl. the table not existing yet) — analytics
 * writes must never surface to the visitor. */
export async function addEvents(items: SiteEvent[]): Promise<void> {
  try {
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      const res = await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [EVENTS_TABLE]: chunk.map((Item) => ({ PutRequest: { Item } })) },
        }),
      );
      let unprocessed = res.UnprocessedItems?.[EVENTS_TABLE];
      if (unprocessed && unprocessed.length) {
        // BatchWrite can throttle silently instead of throwing — retry once after a brief wait.
        await new Promise((r) => setTimeout(r, 200));
        const retry = await ddb.send(
          new BatchWriteCommand({ RequestItems: { [EVENTS_TABLE]: unprocessed } }),
        );
        unprocessed = retry.UnprocessedItems?.[EVENTS_TABLE];
        if (unprocessed && unprocessed.length) {
          console.error(`[events] ${unprocessed.length} rows dropped after retry`);
        }
      }
    }
  } catch (e) {
    console.error("[events] write failed:", e);
  }
}

/** Every stored event (TTL keeps the table to ~12 months). Paginated scan with
 * a hard cap so a runaway table can never OOM the admin dashboard. Returns []
 * until the AutoOfferEvents table exists — the dashboard renders without it. */
export async function getAllEvents(): Promise<SiteEvent[]> {
  const out: SiteEvent[] = [];
  try {
    let lastKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new ScanCommand({ TableName: EVENTS_TABLE, ExclusiveStartKey: lastKey }),
      );
      out.push(...((res.Items || []) as SiteEvent[]));
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey && out.length < 100_000);
  } catch {
    /* table not created yet (or transient) — the dashboard just shows no events */
  }
  return out;
}

/** Mark a lookup as converted (the visitor submitted contact info) + link the lead. */
export async function markLookupConverted(lookupId: string, leadId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: LOOKUPS_TABLE,
        Key: { id: lookupId },
        UpdateExpression: "SET converted = :t, leadId = :l",
        ConditionExpression: "attribute_exists(id)",
        ExpressionAttributeValues: { ":t": true, ":l": leadId },
      }),
    );
  } catch {
    /* best-effort: the lookup may not exist (logging disabled) — never affects the lead */
  }
}
