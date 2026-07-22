import "server-only";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, LEADS_TABLE } from "./aws";
import { SMS_SCENARIOS, type SmsScenario } from "./types";

/**
 * SMS form scenario — the owner-picked A/B switch for the get-offer form's
 * texting setup. Flips the live form instantly:
 *
 *  - "off" (DEFAULT): the regular form — no SMS consent box, no automated texts.
 *    Exactly today's behavior.
 *  - "twilio": the SMS-consent checkbox is shown; box-checkers can receive the
 *    automated Twilio sequence once credentials are live. Non-checkers are still
 *    contacted manually.
 *
 * Lives as ONE sentinel row in the leads table (same pattern as the contact A/B
 * variant), so it needs no extra table and flips from the admin at any time.
 * Kept in its OWN module (not store.ts) because store.ts imports from sms.ts —
 * this avoids a store ⇄ sms import cycle. Type + labels live in ./types so the
 * (client) admin toggle can import them without pulling in this server module.
 *
 * Sending is belt-and-suspenders: an automated text needs ALL of (1) scenario =
 * "twilio", (2) Twilio creds present, (3) the lead's smsConsent. Any one missing
 * → silence. Default "off" → the whole channel is dormant.
 */
export const SMS_CONFIG_ID = "__sms_config__";

const KEYS = new Set<SmsScenario>(SMS_SCENARIOS.map((s) => s.key));
const CACHE_MS = 60_000;
let cache: { scenario: SmsScenario; at: number } | null = null;

/** True when the active scenario permits automated Twilio sends. */
export function isTwilioScenario(s: SmsScenario): boolean {
  return s === "twilio";
}

export async function getSmsScenario(): Promise<SmsScenario> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.scenario;
  let scenario: SmsScenario = "off";
  try {
    const res = await ddb.send(new GetCommand({ TableName: LEADS_TABLE, Key: { id: SMS_CONFIG_ID } }));
    const v = (res.Item as { smsScenario?: string } | undefined)?.smsScenario;
    if (v && KEYS.has(v as SmsScenario)) scenario = v as SmsScenario;
  } catch {
    /* fail soft — "off" (dormant) until the row/table is reachable */
  }
  cache = { scenario, at: Date.now() };
  return scenario;
}

export async function setSmsScenario(scenario: SmsScenario): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: LEADS_TABLE,
      Item: { id: SMS_CONFIG_ID, smsScenario: scenario, updatedAt: new Date().toISOString() },
    }),
  );
  cache = { scenario, at: Date.now() };
}
