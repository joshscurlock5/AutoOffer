import "server-only";
import crypto from "crypto";
import {
  PutCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { ddb, s3, LEADS_TABLE, REFERRALS_TABLE, CHATS_TABLE, PHOTOS_BUCKET } from "./aws";
import type { Lead, Referral, UploadedPhoto, ChatConversation, ChatMessage } from "./types";

// ---- Leads (DynamoDB) -----------------------------------------------------

export async function getLeads(): Promise<Lead[]> {
  const res = await ddb.send(new ScanCommand({ TableName: LEADS_TABLE }));
  const leads = (res.Items || []) as Lead[];
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
  const res = await ddb.send(new ScanCommand({ TableName: REFERRALS_TABLE }));
  const refs = (res.Items || []) as Referral[];
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

export async function savePhotos(
  leadId: string,
  files: File[],
): Promise<UploadedPhoto[]> {
  const saved: UploadedPhoto[] = [];
  if (!files.length || !PHOTOS_BUCKET) return saved;

  let i = 0;
  for (const f of files) {
    if (!f || typeof f.arrayBuffer !== "function" || f.size === 0) continue;
    i += 1;
    const ext = (f.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const safeExt = ext.length > 0 && ext.length <= 5 ? ext : "jpg";
    const stored = `photo-${i}.${safeExt}`;
    const buf = Buffer.from(await f.arrayBuffer());
    await s3.send(
      new PutObjectCommand({
        Bucket: PHOTOS_BUCKET,
        Key: `${leadId}/${stored}`,
        Body: buf,
        ContentType: f.type || "image/jpeg",
      }),
    );
    saved.push({ name: f.name, file: stored, size: f.size, type: f.type });
  }
  return saved;
}

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
  const res = await ddb.send(new ScanCommand({ TableName: CHATS_TABLE }));
  const items = (res.Items || []) as ChatConversation[];
  return items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getConversation(id: string): Promise<ChatConversation | null> {
  const res = await ddb.send(new GetCommand({ TableName: CHATS_TABLE, Key: { id } }));
  return (res.Item as ChatConversation) || null;
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
          "SET messages = list_append(if_not_exists(messages, :empty), :m), updatedAt = :now, lastSender = :ls, createdAt = if_not_exists(createdAt, :now), #nm = if_not_exists(#nm, :name), #ct = if_not_exists(#ct, :contact)",
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
