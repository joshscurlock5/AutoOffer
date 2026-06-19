import { Section } from "./Section";
import { Check, Banknote } from "./icons";
import { site } from "@/lib/site-config";

const steps = [
  { title: "Agree on your offer", body: "Your firm offer is in writing — no surprises." },
  { title: "Quick inspection", body: "About 15 minutes, at your home or work." },
  { title: "Get paid on the spot", body: "By bank draft, before we ever take the keys." },
];

export default function GetPaid() {
  return (
    <Section className="bg-cream">
      <h2 className="h-section">How you get paid</h2>

      <div className="mt-10 grid items-stretch gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Steps — numbered rows in a single bordered box (dark numbers, not blue).
            The box stretches to the card's height; rows grow evenly to fill it. */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ol className="flex flex-1 flex-col divide-y divide-slate-200">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-1 items-stretch gap-6 px-8 py-9">
                <span className="flex w-16 shrink-0 items-center justify-center font-display text-6xl font-extrabold text-navy">
                  {i + 1}
                </span>
                <div className="w-px shrink-0 self-stretch bg-slate-200" />
                <div className="flex flex-col justify-center">
                  <p className="text-xl font-bold text-navy">{s.title}</p>
                  <p className="mt-1.5 text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* "You just got paid" card sitting in a soft grey tray, right-aligned so
            its right edge stays on the same line as the other sections. The tray
            adds height; the steps box stretches to match it. */}
        <div className="mx-auto flex w-full max-w-md items-center rounded-3xl bg-slate-100 p-5 shadow-lift sm:p-6 lg:ml-auto">
          <div className="w-full rounded-2xl bg-white p-7 shadow-card sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="h-6 w-6" />
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Example
              </span>
            </div>
            <p className="mt-5 font-display text-2xl font-bold text-navy">You just got paid!</p>
            <div className="mt-6 border-t border-slate-100 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Amount</p>
              <p className="mt-1 font-display text-4xl font-extrabold text-navy">$28,450</p>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
                <Banknote className="h-4 w-4" /> Paid by bank draft
              </span>
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">From</p>
                <p className="mt-1 font-semibold text-navy">{site.name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
