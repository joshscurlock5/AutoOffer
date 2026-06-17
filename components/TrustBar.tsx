import { Shield, Calendar, Dollar } from "./icons";

const points = [
  {
    icon: Shield,
    title: "No obligation",
    sub: "Get your estimate free. No pressure to sell.",
  },
  {
    icon: Calendar,
    title: "We come to you",
    sub: "We inspect your car at your location, on your schedule.",
  },
  {
    icon: Dollar,
    title: "Paid same visit",
    sub: "Get paid the same day by e-transfer or bank draft.",
  },
];

export default function TrustBar() {
  return (
    <section className="border-y border-slate-100 bg-white">
      <div className="container-x py-10">
        <h2 className="text-center font-display text-xl font-bold text-navy">
          A safer, simpler way to sell — here&apos;s what you get
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {points.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="flex gap-3">
                <Icon className="h-7 w-7 shrink-0 text-brand" />
                <div>
                  <div className="font-bold text-navy">{p.title}</div>
                  <div className="mt-0.5 text-sm text-muted">{p.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
