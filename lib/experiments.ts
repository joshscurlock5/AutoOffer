import "server-only";
import type { Lead, SiteEvent, ExperimentVariant } from "./types";
import { DEFAULT_VARIANT, EXPERIMENT_VARIANTS } from "./types";
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
  key: ExperimentVariant;
  label: string;
  /** On-page session funnel: Visited → … → Submitted (from computeEventAnalytics). */
  funnel: { label: string; count: number }[];
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

const isRealLead = (l: Lead) => l.status !== "partial" && l.status !== "spam" && l.status !== "lost";
const isBooked = (l: Lead) => l.status === "scheduled" || l.status === "closed";
const isClosed = (l: Lead) => l.status === "closed";

/** Fold an unknown/absent stamp into the default variant. */
function variantOf(v: ExperimentVariant | undefined): ExperimentVariant {
  return v && EXPERIMENT_VARIANTS.some((x) => x.key === v) ? v : DEFAULT_VARIANT;
}

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export function computeExperiments(
  leads: Lead[],
  events: SiteEvent[],
  activeVariant: ExperimentVariant,
): ExperimentAnalytics {
  const variants: VariantStats[] = EXPERIMENT_VARIANTS.map((meta) => {
    const vEvents = events.filter((e) => variantOf(e.variant) === meta.key);
    const vLeads = leads.filter((l) => variantOf(l.experimentVariant) === meta.key);
    const ea = computeEventAnalytics(vEvents);
    const visitors = ea.funnel[0]?.count ?? 0;
    const submitted = ea.funnel[ea.funnel.length - 1]?.count ?? 0;
    const leadsN = vLeads.filter(isRealLead).length;
    const booked = vLeads.filter(isBooked).length;
    const closed = vLeads.filter(isClosed).length;
    return {
      key: meta.key,
      label: meta.label,
      funnel: ea.funnel,
      visitors,
      submitted,
      leads: leadsN,
      booked,
      closed,
      visitorToLead: pct(leadsN, visitors),
      leadToBooked: pct(booked, leadsN),
      leadToClosed: pct(closed, leadsN),
    };
  });
  return { activeVariant, variants };
}
