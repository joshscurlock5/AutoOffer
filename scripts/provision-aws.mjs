// One-time setup: creates the DynamoDB tables + S3 bucket your site needs.
// Run from the project folder with:
//   node --env-file=.env.local scripts/provision-aws.mjs
//
// It is safe to run more than once (it skips anything that already exists).

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

const region = process.env.APP_AWS_REGION || "us-east-1";
const credentials = {
  accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
};

if (!credentials.accessKeyId || !credentials.secretAccessKey) {
  console.error(
    "\n✗ Missing keys. Make sure APP_AWS_ACCESS_KEY_ID and APP_AWS_SECRET_ACCESS_KEY are filled in .env.local,\n  and run with:  node --env-file=.env.local scripts/provision-aws.mjs\n",
  );
  process.exit(1);
}

const LEADS = process.env.LEADS_TABLE || "AutoOfferLeads";
const REFS = process.env.REFERRALS_TABLE || "AutoOfferReferrals";
const MARKET_CACHE = process.env.MARKET_CACHE_TABLE || "AutoOfferMarketCache";
const BUCKET = process.env.PHOTOS_BUCKET;

const ddb = new DynamoDBClient({ region, credentials });
const s3 = new S3Client({ region, credentials });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureTable(name) {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: name }));
    console.log(`✓ table already exists: ${name}`);
    return;
  } catch {
    /* doesn't exist — create it */
  }
  await ddb.send(
    new CreateTableCommand({
      TableName: name,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  for (let i = 0; i < 40; i++) {
    try {
      const d = await ddb.send(new DescribeTableCommand({ TableName: name }));
      if (d.Table?.TableStatus === "ACTIVE") break;
    } catch {}
    await sleep(1000);
  }
  console.log(`✓ created table: ${name}`);
}

async function ensureBucket(name) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    console.log(`✓ bucket already exists: ${name}`);
  } catch {
    const params = { Bucket: name };
    if (region !== "us-east-1") {
      params.CreateBucketConfiguration = { LocationConstraint: region };
    }
    await s3.send(new CreateBucketCommand(params));
    console.log(`✓ created bucket: ${name}`);
  }
  // Keep customer photos private (served only through the admin-gated route).
  try {
    await s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: name,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
  } catch {}
}

async function enableTtl(name) {
  try {
    await ddb.send(
      new UpdateTimeToLiveCommand({
        TableName: name,
        TimeToLiveSpecification: { Enabled: true, AttributeName: "ttl" },
      }),
    );
    console.log(`✓ TTL enabled on: ${name}`);
  } catch (e) {
    // Already enabled (or enabling) — DynamoDB rejects re-enabling; that's fine.
    console.log(`• TTL already set on: ${name}`);
  }
}

console.log(`\nProvisioning Auto Offer storage in ${region}...\n`);
await ensureTable(LEADS);
await ensureTable(REFS);
await ensureTable(MARKET_CACHE);
await enableTtl(MARKET_CACHE);
if (!BUCKET) {
  console.error("✗ Missing PHOTOS_BUCKET in .env.local");
  process.exit(1);
}
await ensureBucket(BUCKET);
console.log("\nProvisioning complete ✅\n");
