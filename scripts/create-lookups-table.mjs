// Create the AutoOfferLookups DynamoDB table (the admin "API Calls" log).
// Idempotent: does nothing if the table already exists.
// Run: node --env-file=.env.local scripts/create-lookups-table.mjs
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

const region = process.env.APP_AWS_REGION || "us-east-1";
const credentials =
  process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

const client = new DynamoDBClient({ region, credentials });
const TableName = process.env.LOOKUPS_TABLE || "AutoOfferLookups";

async function main() {
  try {
    await client.send(new DescribeTableCommand({ TableName }));
    console.log(`✓ ${TableName} already exists — nothing to do.`);
    return;
  } catch (e) {
    if (e?.name !== "ResourceNotFoundException") throw e;
  }

  await client.send(
    new CreateTableCommand({
      TableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    }),
  );
  console.log(`✓ Created ${TableName} (on-demand, partition key: id).`);
}

main().catch((err) => {
  console.error("Failed to create table:", err);
  process.exit(1);
});
