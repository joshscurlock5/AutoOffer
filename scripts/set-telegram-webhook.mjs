// One-time setup: points the Telegram bot's webhook at the live site so it can
// receive the /usage command. Re-run it any time the URL or secret changes.
//
//   node --env-file=.env.local scripts/set-telegram-webhook.mjs
//
// Requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local (the
// SAME secret must be set in the Amplify console so the running site can verify
// Telegram's calls). Override the URL with TELEGRAM_WEBHOOK_URL if needed.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url =
  process.env.TELEGRAM_WEBHOOK_URL || "https://www.driveoffer.ca/api/telegram/webhook";

if (!token) {
  console.error("✗ Missing TELEGRAM_BOT_TOKEN in .env.local");
  process.exit(1);
}
if (!secret) {
  console.error("✗ Missing TELEGRAM_WEBHOOK_SECRET in .env.local");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "channel_post", "callback_query"],
  }),
});
const data = await res.json();

if (data.ok) {
  console.log(`✓ Webhook set to: ${url}`);
} else {
  console.error("✗ Telegram rejected setWebhook:");
}
console.log(JSON.stringify(data, null, 2));

// Show the current webhook status for confirmation.
const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
console.log("\nCurrent webhook info:");
console.log(JSON.stringify(info.result ?? info, null, 2));
