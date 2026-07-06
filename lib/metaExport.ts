import type { Profile } from "./types";

// ===========================================================================
//  Meta Custom Audience CSV export — client-safe, zero server code.
//
//  Generates a customer-list CSV in Meta's upload template
//  (email, phone, fn, ln, ct, st, country, value) from the profiles ALREADY in
//  the dashboard's browser memory. Values are plain text on purpose: Ads
//  Manager hashes every field in-browser during upload (SHA-256), so nothing
//  readable reaches Meta. Preset segments cover the retargeting playbook —
//  see docs/meta-audiences.md for the click-by-click.
// ===========================================================================

export type MetaSegment = "abandoned" | "offer_no_booking" | "closed" | "all";

export const META_SEGMENTS: { key: MetaSegment; label: string; hint: string }[] = [
  {
    key: "abandoned",
    label: "Abandoned form",
    hint: "Started the offer form but never submitted — retarget with a “finish your offer” ad.",
  },
  {
    key: "offer_no_booking",
    label: "Offer sent, no booking",
    hint: "Got an offer but never booked an inspection — nudge them back.",
  },
  {
    key: "closed",
    label: "Closed winners",
    hint: "People we bought from (sale value included) — the seed for a lookalike audience.",
  },
  {
    key: "all",
    label: "All contacts",
    hint: "Everyone in the pipeline — upload as an EXCLUSION so acquisition ads skip them.",
  },
];

/** The profiles a segment covers (spam + opted-out/bounced contacts always excluded). */
export function segmentProfiles(profiles: Profile[], seg: MetaSegment): Profile[] {
  const ok = profiles.filter(
    (p) => p.stage !== "spam" && !p.emailOptOut && !p.smsOptOut && !p.emailBounced && (p.emails[0] || p.phones[0]),
  );
  switch (seg) {
    case "abandoned":
      return ok.filter((p) => p.stage === "partial");
    case "offer_no_booking":
      return ok.filter((p) => p.offer && !p.appointmentAt && p.stage !== "closed" && p.stage !== "lost");
    case "closed":
      return ok.filter((p) => p.stage === "closed");
    case "all":
      return ok;
  }
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function splitName(name?: string): { fn: string; ln: string } {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return { fn: parts[0] || "", ln: parts.slice(1).join(" ") };
}

/** Meta matches best on E.164-ish digits with country code. */
function phoneDigits(p?: string): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 10) return `1${d}`;
  return d;
}

/** Build the CSV for a segment. `value` (used by value-based audiences) is the
 * margin (sale minus cost) and only fills on the closed segment. */
export function buildMetaCsv(
  profiles: Profile[],
  seg: MetaSegment,
): { filename: string; csv: string; rows: number } {
  const ps = segmentProfiles(profiles, seg);
  const lines = ["email,phone,fn,ln,ct,st,country,value"];
  for (const p of ps) {
    const { fn, ln } = splitName(p.name);
    lines.push(
      [
        (p.emails[0] || "").trim().toLowerCase(),
        phoneDigits(p.phones[0]),
        fn.toLowerCase(),
        ln.toLowerCase(),
        (p.geo?.city || "").toLowerCase(),
        (p.geo?.region || "").toLowerCase(),
        (p.geo?.countryCode || "CA").toLowerCase(),
        seg === "closed" && p.margin ? String(p.margin) : "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  return { filename: `meta-audience-${seg}-${date}.csv`, csv: lines.join("\r\n"), rows: lines.length - 1 };
}
