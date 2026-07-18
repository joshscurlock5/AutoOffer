// Validate the Meta insights field set against THIS account + API tier.
//   node scripts/probe-meta-fields.mjs
// Needs META_MARKETING_TOKEN + META_AD_ACCOUNT_ID in .env.local. Reports which
// candidate fields Meta accepts, which it rejects, the real conversion
// action_types present in your data, and whether each breakdown works — so
// lib/metaInsights.ts can be trimmed to exactly what's available.
import fs from "node:fs";

try {
  const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch { /* rely on ambient env */ }

const TOKEN = process.env.META_MARKETING_TOKEN;
const RAW = process.env.META_AD_ACCOUNT_ID;
if (!TOKEN || !RAW) {
  console.error("Missing META_MARKETING_TOKEN or META_AD_ACCOUNT_ID in .env.local — add them and re-run.");
  process.exit(2);
}
const acct = RAW.startsWith("act_") ? RAW : `act_${RAW}`;
const API = "https://graph.facebook.com/v21.0";

// Keep in sync with FULL_METRIC_FIELDS in lib/metaInsights.ts
const CANDIDATE = [
  "spend","impressions","reach","frequency","cpm",
  "clicks","ctr","cpc",
  "inline_link_clicks","inline_link_click_ctr","cost_per_inline_link_click",
  "outbound_clicks","outbound_clicks_ctr","cost_per_outbound_click","website_ctr",
  "inline_post_engagement","cost_per_inline_post_engagement",
  "quality_ranking","engagement_rate_ranking","conversion_rate_ranking",
  "objective","optimization_goal","buying_type","attribution_setting",
  "actions","action_values","cost_per_action_type",
  "conversions","conversion_values","cost_per_conversion",
  "video_play_actions","video_thruplay_watched_actions","cost_per_thruplay",
  "video_p25_watched_actions","video_p50_watched_actions","video_p75_watched_actions",
  "video_p100_watched_actions","video_avg_time_watched_actions",
];
const BREAKDOWNS = [
  { key: "age", params: "age" },
  { key: "gender", params: "gender" },
  { key: "region", params: "region" },
  { key: "placement", params: "publisher_platform,platform_position" },
  { key: "device", params: "impression_device" },
];

async function call({ level = "ad", fields, breakdowns, preset = "last_30d" }) {
  const url =
    `${API}/${acct}/insights?level=${level}&date_preset=${preset}` +
    (breakdowns ? `&breakdowns=${encodeURIComponent(breakdowns)}` : "") +
    `&fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(TOKEN)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, error: j?.error, data: j?.data };
}

async function main() {
  console.log(`account=${acct}\n`);

  // 1) Try the whole candidate set at once.
  console.log("── Field validation (level=ad, last_30d) ──");
  const dims = "ad_id,ad_name,campaign_name,date_start";
  const whole = await call({ fields: `${dims},${CANDIDATE.join(",")}` });
  const good = [], bad = [];
  if (whole.ok) {
    console.log(`✓ Full candidate set accepted (${CANDIDATE.length} fields).`);
    good.push(...CANDIDATE);
  } else {
    console.log(`✗ Full set rejected: ${whole.error?.message}\n  Testing each field individually...`);
    for (const f of CANDIDATE) {
      const one = await call({ fields: `${dims},${f}` });
      if (one.ok) good.push(f); else bad.push(`${f} — ${one.error?.message?.slice(0, 80)}`);
    }
  }
  console.log(`\nVALID (${good.length}): ${good.join(", ")}`);
  if (bad.length) console.log(`\nREJECTED (${bad.length}):\n  ${bad.join("\n  ")}`);

  // 2) Discover the real conversion action_types in your data.
  console.log("\n── Conversion action_types present in your data ──");
  const conv = await call({ fields: `${dims},spend,actions,action_values,cost_per_action_type` });
  const types = new Set();
  for (const row of conv.data || []) for (const a of row.actions || []) types.add(a.action_type);
  console.log(types.size ? [...types].sort().map((t) => `  action.${t}`).join("\n") : "  (none found in last_30d)");

  // 3) Breakdown availability.
  console.log("\n── Breakdown checks (level=campaign, last_30d) ──");
  for (const bd of BREAKDOWNS) {
    const res = await call({ level: "campaign", fields: "spend,impressions,inline_link_clicks,actions", breakdowns: bd.params });
    console.log(`  ${res.ok ? "✓" : "✗"} ${bd.key}${res.ok ? ` (${res.data?.length || 0} rows)` : ` — ${res.error?.message?.slice(0, 90)}`}`);
  }

  // 4) One flattened sample so we can confirm the shape end-to-end.
  console.log("\n── Sample raw row keys (level=ad) ──");
  console.log("  " + Object.keys((whole.data && whole.data[0]) || conv.data?.[0] || {}).join(", "));

  console.log("\nDone. Paste this output back and I'll lock the field list.");
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });
