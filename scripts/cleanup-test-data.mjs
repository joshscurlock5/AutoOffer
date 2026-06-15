// Deletes ONLY the records created by scripts/smoke-test.mjs, matched by their
// fixed test signatures (name/email). Never does a blanket clear — the leads
// table is shared with the live site and holds real leads.
//   node --env-file=.env.local scripts/cleanup-test-data.mjs
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.APP_AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
    },
  }),
);

const LEADS = process.env.LEADS_TABLE || "AutoOfferLeads";
const REFS = process.env.REFERRALS_TABLE || "AutoOfferReferrals";

const TEST_NAMES = new Set(["Test Seller", "Email Only Test"]);
const TEST_EMAILS = new Set(["test@example.com", "email-only-test@example.com"]);
const TEST_REF_EMAILS = new Set(["jane@example.com"]);

const leads = (await ddb.send(new ScanCommand({ TableName: LEADS }))).Items || [];
let dl = 0;
for (const l of leads) {
  if (TEST_NAMES.has(l?.contact?.name) || TEST_EMAILS.has(l?.contact?.email)) {
    await ddb.send(new DeleteCommand({ TableName: LEADS, Key: { id: l.id } }));
    dl++;
    console.log("deleted lead   ", l.id, "-", l?.contact?.name, l?.contact?.email);
  }
}

const refs = (await ddb.send(new ScanCommand({ TableName: REFS }))).Items || [];
let dr = 0;
for (const r of refs) {
  if (TEST_REF_EMAILS.has(r?.referrer?.email)) {
    await ddb.send(new DeleteCommand({ TableName: REFS, Key: { id: r.id } }));
    dr++;
    console.log("deleted referral", r.id, "-", r?.referrer?.email);
  }
}

console.log(`\nCleanup done: ${dl} test lead(s), ${dr} test referral(s) removed.`);
