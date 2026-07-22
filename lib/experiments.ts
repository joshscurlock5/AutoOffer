import "server-only";
import type { Lead, SiteEvent, ExperimentVariant, SmsScenario } from "./types";
import { DEFAULT_VARIANT, EXPERIMENT_VARIANTS, SMS_SCENARIOS } from "./types";
import { computeEventAnalytics } from "./eventAnalytics";

// ===========================================================================
//  A/B experiment analytics — the same on-page funnel + lead outcomes the rest
//  of the dashboard shows, but split per contact-requirement variant so "Choose
//  either" can be compared head-to-head with "Phone required".
//
//  Rows with no variant stamp (everything from before the experiment shipped)
//  fold into the default "choose" bucket — that IS the variant the form has
//  always run, so the whole history is attributed correctly.
//
//  NOTE on units: the funnel counts SESSIONS reaching each on-page stage (from
//  the event stream, anonymous included). Leads / Booked / Closed count LEAD
//  RECORDS. The two meet at "Submitted" (≈ leads), so the conversion tiles use
//  the authoritative lead records, not the session estimate.
// ===========================================================================

export interface VariantStats {
  key: string;
  label: string;
  /** On-page session funnel: Visited → … → Submitted (from computeEventAnalytics). */
  funnel: { label: string; count: number }[];
  /** "Touched form" split by what came first — CTA click vs direct form touch. */
  formEngagement: { ctaFirst: number; touchedFirst: number };
  visitors: number;
  submitted: number;
  leads: number;
  booked: number;
  closed: number;
  /** Conversion rates as whole-ish percents (one decimal); null when denom is 0. */
  visitorToLead: number | null;
  leadToBooked: number | null;
  leadToClosed: number | null;
}

export interface ExperimentAnalytics {
  activeVariant: ExperimentVariant;
  variants: VariantStats[];
}

export interface SmsExperimentAnalytics {
  activeScenario: SmsScenario;
  scenarios: VariantStats[];
}

const DEFAULT_SMS: SmsScenario = "off";

const isRealLead = (l: Lead) => l.status !== "partial" && l.status !== "spam" && l.status !== "lost";
const isBooked = (l: Lead) => l.status === "scheduled" || l.status === "closed";
const isClosed = (l: Lead) => l.status === "closed";

/** Fold an unknown/absent stamp into the default contact variant. */
function variantOf(v: ExperimentVariant | undefined): ExperimentVariant {
  return v && EXPERIMENT_VARIANTS.some((x) => x.key === v) ? v : DEFAULT_VARIANT;
}

/** Fold an unknown/absent SMS stamp into "off" (no texting box) — the form's
 * behavior since launch, so all pre-experiment history lands in that bucket. */
function smsOf(v: SmsScenario | undefined): SmsScenario {
  return v && SMS_SCENARIOS.some((x) => x.key === v) ? v : DEFAULT_SMS;
}

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** Build one bucket's funnel + lead-outcome stats from its already-filtered
 * events and leads. Shared by BOTH A/B splits so the two stay identical in shape. */
function bucketStats(key: string, label: string, vEvents: SiteEvent[], vLeads: Lead[]): VariantStats {
  const ea = computeEventAnalytics(vEvents);
  const visitors = ea.funnel[0]?.count ?? 0;
  const submitted = ea.funnel[ea.funnel.length - 1]?.count ?? 0;
  const leadsN = vLeads.filter(isRealLead).length;
  const booked = vLeads.filter(isBooked).length;
  const closed = vLeads.filter(isClosed).length;
  return {
    key,
    label,
    funnel: ea.funnel,
    formEngagement: ea.formEngagement,
    visitors,
    submitted,
    leads: leadsN,
    booked,
    closed,
    visitorToLead: pct(leadsN, visitors),
    leadToBooked: pct(booked, leadsN),
    leadToClosed: pct(closed, leadsN),
  };
}

export function computeExperiments(
  leads: Lead[],
  events: SiteEvent[],
  activeVariant: ExperimentVariant,
): ExperimentAnalytics {
  const variants = EXPERIMENT_VARIANTS.map((meta) =>
    bucketStats(
      meta.key,
      meta.label,
      events.filter((e) => variantOf(e.variant) === meta.key),
      leads.filter((l) => variantOf(l.experimentVariant) === meta.key),
    ),
  );
  return { activeVariant, variants };
}

/** Same funnel + outcomes as computeExperiments, but split by the SMS opt-in
 * scenario (no texting box vs Twilio box). Events keyed by e.smsScenario, leads
 * by l.smsExperiment; both fold absent → "off" so the whole pre-experiment
 * history counts under "No texting box". */
export function computeSmsScenarios(
  leads: Lead[],
  events: SiteEvent[],
  activeScenario: SmsScenario,
): SmsExperimentAnalytics {
  const scenarios = SMS_SCENARIOS.map((meta) =>
    bucketStats(
      meta.key,
      meta.label,
      events.filter((e) => smsOf(e.smsScenario) === meta.key),
      leads.filter((l) => smsOf(l.smsExperiment) === meta.key),
    ),
  );
  return { activeScenario, scenarios };
}
