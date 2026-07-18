// One-time provisioning for the Meta ad-insight time-series table.
//   node scripts/create-meta-insights-table.mjs
// Reads AWS creds from .env.local (APP_AWS_*) the same way the app does. Safe to
// re-run: if the table already exists it just ensures TTL is enabled and exits.
//
// Schema: pk (HASH) + sk (RANGE), on-demand billing, TTL on `ttl`.
//   pk = `${level}#${breakdownKey}`   sk = `${date}#${entityId}#${breakdownValue}`
import fs from "node:fs";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

// ---- load .env.local (don't clobber already-set vars) ----
try {
  const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch { /* no .env.local — rely on ambient AWS creds */ }

const region = process.env.APP_AWS_REGION || "us-east-1";
const credentials =
  process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID, secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY }
    : undefined;
const TABLE = process.env.META_INSIGHTS_TABLE || "AutoOfferMetaInsights";
const db = new DynamoDBClient({ region, credentials });

async function tableExists() {
  try { await db.send(new DescribeTableCommand({ TableName: TABLE })); return true; }
  catch (e) { if (e.name === "ResourceNotFoundException") return false; throw e; }
}

async function ensureTtl() {
  try {
    await db.send(new UpdateTimeToLiveCommand({
      TableName: TABLE,
      TimeToLiveSpecification: { Enabled: true, AttributeName: "ttl" },
    }));
    console.log("✓ TTL enabled on `ttl`");
  } catch (e) {
    // Already-enabled throws a validation error — treat as success.
    if (/TimeToLive is already enabled/i.test(e.message || "")) console.log("✓ TTL already enabled");
    else console.warn("! could not set TTL:", e.message);
  }
}

async function main() {
  console.log(`region=${region} table=${TABLE} creds=${credentials ? "APP_AWS_*" : "default chain"}`);
  if (await tableExists()) {
    console.log("Table already exists — ensuring TTL only.");
    await ensureTtl();
    return;
  }
  console.log("Creating table...");
  await db.send(new CreateTableCommand({
    TableName: TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ],
  }));
  console.log("Waiting for ACTIVE...");
  await waitUntilTableExists({ client: db, maxWaitTime: 120 }, { TableName: TABLE });
  await ensureTtl();
  console.log("✓ Done. Set META_INSIGHTS_TABLE in Amplify only if you used a non-default name.");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
