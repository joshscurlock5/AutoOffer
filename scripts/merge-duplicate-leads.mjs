// One-time cleanup: collapse duplicate lead records for the same person + same
// vehicle down to a single surviving lead. Two sources of duplicates:
//   • the abandoned-cart beacon wrote a "partial" shadow next to every completed
//     lead (pre-submit capture), and
//   • a few people submitted the whole form twice (two real leads).
//
// Algorithm: group by shared email/phone (same union-find the app's profiles use),
// then WITHIN a person split by vehicle (year+make+model) so someone who sold two
// DIFFERENT cars is never collapsed. In each same-vehicle cluster of 2+ live leads:
//   survivor = most-progressed status (closed > scheduled > contacted > new >
//              lost > spam; ties broken by earliest createdAt)
//   → fold any field the survivor is MISSING from the others (never overwrites the
//     survivor's own data), set the survivor's createdAt to the earliest in the
//     cluster, then ARCHIVE the rest (soft delete — recoverable from the Deleted
//     tab). A vehicle-less partial is only attached when the person has exactly one
//     vehicle cluster (otherwise it's ambiguous and left alone).
//
// DRY RUN by default. Add --execute to apply.
//   node scripts/merge-duplicate-leads.mjs            # preview
//   node scripts/merge-duplicate-leads.mjs --execute  # apply

import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

// ---- load .env.local (values are never printed) ----------------------------
const env = {};
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
} catch {
  console.error("Could not read .env.local — run from the AutoOffer folder.");
  process.exit(1);
}

const REGION = env.APP_AWS_REGION || "us-east-1";
const TABLE = env.LEADS_TABLE || "AutoOfferLeads";
const EXECUTE = process.argv.includes("--execute");

if (!env.APP_AWS_ACCESS_KEY_ID || !env.APP_AWS_SECRET_ACCESS_KEY) {
  console.error("No APP_AWS_* credentials in .env.local — cannot reach DynamoDB.");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: REGION,
    credentials: { accessKeyId: env.APP_AWS_ACCESS_KEY_ID, secretAccessKey: env.APP_AWS_SECRET_ACCESS_KEY },
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

// ---- helpers ---------------------------------------------------------------
const digits = (s) => (s || "").replace(/\D/g, "");
const emailKey = (l) => (l?.contact?.email || "").trim().toLowerCase();
const phoneKey = (l) => {
  const d = digits(l?.contact?.phone);
  return d.length >= 10 ? d.slice(-10) : "";
};
const vehSig = (l) => {
  const v = l?.vehicle;
  if (!v) return "";
  return [v.year, v.make, v.model].map((x) => (x || "").toString().trim().toLowerCase()).join("|");
};
const vehText = (l) => {
  const v = l?.vehicle;
  return v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "(no vehicle)";
};
const who = (l) => emailKey(l) || phoneKey(l) || "(" + (l.id || "").slice(0, 8) + ")";
const short = (id) => (id || "").slice(0, 8);
const RANK = { spam: 0, lost: 1, partial: 2, new: 3, contacted: 4, scheduled: 5, closed: 6 };
const isEmpty = (v) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

// fields folded into the survivor only when the survivor is missing them
const FILL = [
  "notes", "message", "offer", "offerSentAt", "pendingOffer", "appointmentAt",
  "appointmentLocation", "attribution", "landingPath", "referrerUrl", "behavior",
  "touchHistory", "gaClientId", "gaSessionId", "meta", "referralCode",
  "emailEngagement", "smsEngagement", "commsEvents", "repliesCount", "lastReplyAt",
  "firstTouchAt", "contactedAt", "scheduledAt", "bookingToken", "nurtureStage",
];

async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function groupByPerson(leads) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const ensure = (k) => { if (!parent.has(k)) parent.set(k, k); };
  for (const l of leads) {
    const keys = [];
    if (emailKey(l)) keys.push("e:" + emailKey(l));
    if (phoneKey(l)) keys.push("p:" + phoneKey(l));
    if (!keys.length) keys.push("lead:" + l.id);
    keys.forEach(ensure);
    for (let i = 1; i < keys.length; i++) parent.set(find(keys[0]), find(keys[i]));
  }
  const groups = new Map();
  for (const l of leads) {
    const anchor = emailKey(l) ? "e:" + emailKey(l) : phoneKey(l) ? "p:" + phoneKey(l) : "lead:" + l.id;
    const root = find(anchor);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(l);
  }
  return [...groups.values()];
}

// build same-person, same-vehicle clusters of 2+ live leads
function buildClusters(personGroups) {
  const clusters = [];
  for (const g of personGroups) {
    const live = g.filter((l) => !l.archived);
    if (live.length < 2) continue;
    const byVeh = new Map();
    const noVehPartials = [];
    for (const l of live) {
      const sig = vehSig(l);
      if (!sig && l.status === "partial") { noVehPartials.push(l); continue; }
      if (!byVeh.has(sig)) byVeh.set(sig, []);
      byVeh.get(sig).push(l);
    }
    const realSigs = [...byVeh.keys()].filter(Boolean);
    if (noVehPartials.length && realSigs.length === 1) byVeh.get(realSigs[0]).push(...noVehPartials);
    for (const cluster of byVeh.values()) {
      if (cluster.length < 2) continue;
      const sorted = [...cluster].sort((a, b) => {
        const r = (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0);
        return r || (a.createdAt || "").localeCompare(b.createdAt || "");
      });
      clusters.push({ survivor: sorted[0], archive: sorted.slice(1) });
    }
  }
  return clusters;
}

function buildPatch(survivor, archiveList) {
  const patch = {};
  let earliest = survivor.createdAt || "";
  for (const a of archiveList) {
    if (a.createdAt && (!earliest || a.createdAt < earliest)) earliest = a.createdAt;
    for (const f of FILL) {
      if (isEmpty(survivor[f]) && isEmpty(patch[f]) && !isEmpty(a[f])) patch[f] = a[f];
    }
    if (survivor.vehicle && !survivor.vehicle.condition && a.vehicle?.condition) {
      patch.vehicle = { ...survivor.vehicle, condition: a.vehicle.condition };
    }
  }
  if (earliest && earliest !== survivor.createdAt) patch.createdAt = earliest;
  return patch;
}

// ---- run -------------------------------------------------------------------
const leads = await scanAll();
const clusters = buildClusters(groupByPerson(leads));

console.log(`\n${EXECUTE ? "=== EXECUTE (writing changes) ===" : "=== DRY RUN (no changes written) ==="}`);
console.log(`Table: ${TABLE}   Region: ${REGION}`);
console.log(`Scanned ${leads.length} leads.  ${clusters.length} duplicate cluster(s) to collapse.\n`);

let partialArchives = 0;
let realArchives = 0;
for (const c of clusters) {
  const patch = buildPatch(c.survivor, c.archive);
  const folded = Object.keys(patch);
  console.log(`• ${who(c.survivor)}  |  ${vehText(c.survivor)}`);
  console.log(`    KEEP    ${short(c.survivor.id)}  status=${c.survivor.status}${c.survivor.purchasePrice ? ` bought $${c.survivor.purchasePrice}` : ""}  created=${(c.survivor.createdAt || "").slice(0, 16)}`);
  for (const a of c.archive) {
    if (a.status === "partial") partialArchives++; else realArchives++;
    const flag = a.status === "partial" ? "partial" : `REAL(${a.status})`;
    console.log(`    ARCHIVE ${short(a.id)}  ${flag}  created=${(a.createdAt || "").slice(0, 16)}`);
  }
  console.log(`    fold into survivor: [${folded.join(", ") || "nothing new"}]`);
}
console.log(`\nSummary: keep ${clusters.length} survivor(s); archive ${partialArchives} partial(s) + ${realArchives} duplicate real lead(s).`);

if (!EXECUTE) {
  console.log(`\nNothing written. Re-run with  --execute  to apply.\n`);
  process.exit(0);
}

const now = new Date().toISOString();
let survivorsPatched = 0;
let archivedTotal = 0;
for (const c of clusters) {
  const patch = buildPatch(c.survivor, c.archive);
  if (Object.keys(patch).length) {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...c.survivor, ...patch, id: c.survivor.id } }));
    survivorsPatched++;
  }
  for (const a of c.archive) {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...a, archived: true, archivedAt: now } }));
    archivedTotal++;
  }
}
console.log(`\nDone. Updated ${survivorsPatched} survivor(s); archived ${archivedTotal} duplicate(s).`);
console.log(`Archived records are recoverable from the admin Deleted tab.\n`);
