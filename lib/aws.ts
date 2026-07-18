import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

// We use custom APP_AWS_* env var names because Lambda/Amplify reserve the
// standard AWS_* names. If these aren't set, the SDK falls back to the default
// credential chain (e.g. an attached IAM role).
const region = process.env.APP_AWS_REGION || "us-east-1";
const credentials =
  process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region, credentials }),
  { marshallOptions: { removeUndefinedValues: true } },
);

export const s3 = new S3Client({ region, credentials });

export const LEADS_TABLE = process.env.LEADS_TABLE || "AutoOfferLeads";
export const EVENTS_TABLE = process.env.EVENTS_TABLE || "AutoOfferEvents";
export const REFERRALS_TABLE =
  process.env.REFERRALS_TABLE || "AutoOfferReferrals";
export const CHATS_TABLE = process.env.CHATS_TABLE || "AutoOfferChats";
export const LOOKUPS_TABLE = process.env.LOOKUPS_TABLE || "AutoOfferLookups";
// Daily Meta ad-insight snapshots — the persisted time-series that powers the
// historical ad-analytics dashboard (Meta's own API only keeps rolling windows).
export const META_INSIGHTS_TABLE = process.env.META_INSIGHTS_TABLE || "AutoOfferMetaInsights";
export const PHOTOS_BUCKET = process.env.PHOTOS_BUCKET || "";
