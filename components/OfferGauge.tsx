import { cad } from "@/lib/format";

/**
 * "Where your offer sits" graphic. Faint tails = below/above average, the blue
 * band = the DriveOffer range. Full bell curve on sm+, a legible bar on phones.
 */
export default function OfferGauge({
  low,
  high,
}: {
  low: number;
  high: number;
}) {
  const W = 520;
  const H = 300;
  const base = 235;
  const cx = 260;
  const sigma = 72;
  const amp = 175;
  const left = 30;
  const right = 490;

  const f = (x: number) =>
    base - amp * Math.exp(-((x - cx) ** 2) / (2 * sigma * sigma));

  const N = 120;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = left + ((right - left) * i) / N;
    pts.push([x, f(x)]);
  }
  const curve = pts
    .map(([x, y], i) =>
      i ? `L${x.toFixed(1)} ${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join(" ");
  const area = `${curve} L${right} ${base} L${left} ${base} Z`;

  const bandL = 196;
  const bandR = 324;

  return (
    <div className="animate-fade-up">
      {/* Phone: a clear stacked bar (the SVG legend is illegible this small) */}
      <div className="sm:hidden">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-brand">
          Your estimated range
        </p>
        <p className="mt-1 text-center font-display text-3xl font-extrabold text-navy">
          {cad(low)} – {cad(high)}
        </p>
        <div className="mt-4 h-3.5 overflow-hidden rounded-full bg-brand" />
        <p className="mt-2 text-center text-xs text-muted">
          A real buyer confirms your firm offer — free, no obligation.
        </p>
      </div>

      {/* sm+: the full bell curve */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="hidden h-auto w-full sm:block"
        role="img"
        aria-label={`Your estimated range is ${cad(low)} to ${cad(high)}.`}
      >
        <defs>
          <clipPath id="ao-band">
            <rect x={bandL} y={0} width={bandR - bandL} height={base} />
          </clipPath>
          <linearGradient id="ao-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2E90FA" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
        </defs>

        <path d={area} fill="#DCE8FC" opacity={0.92} />
        <g clipPath="url(#ao-band)">
          <path d={area} fill="url(#ao-blue)" />
        </g>

        <line x1={left} y1={base} x2={right} y2={base} stroke="#1E4A7E" strokeOpacity={0.25} strokeWidth={2} />

        <line x1={bandL} y1={f(bandL)} x2={bandL} y2={base} stroke="#fff" strokeWidth={2} strokeDasharray="4 4" />
        <line x1={bandR} y1={f(bandR)} x2={bandR} y2={base} stroke="#fff" strokeWidth={2} strokeDasharray="4 4" />
        <circle cx={bandL} cy={f(bandL)} r={5} fill="#fff" stroke="#3B82F6" strokeWidth={2} />
        <circle cx={bandR} cy={f(bandR)} r={5} fill="#fff" stroke="#3B82F6" strokeWidth={2} />

        <g>
          <rect x={cx - 100} y={18} width={200} height={48} rx={10} fill="#1E4A7E" />
          <text x={cx} y={38} textAnchor="middle" fill="#BDD3FB" fontSize="12" fontWeight="700" style={{ textTransform: "uppercase", letterSpacing: "1px" }}>
            Estimated range
          </text>
          <text x={cx} y={56} textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800">
            {cad(low)} – {cad(high)}
          </text>
          <path d={`M${cx} 66 L${cx} ${f(cx) - 6}`} stroke="#1E4A7E" strokeWidth={2} strokeDasharray="3 3" />
        </g>

        <text x={(left + bandL) / 2} y={base + 28} textAnchor="middle" fill="#475569" fontSize="11" fontWeight="700" style={{ letterSpacing: "0.5px" }}>
          BELOW AVERAGE
        </text>
        <text x={cx} y={base + 28} textAnchor="middle" fill="#3B82F6" fontSize="11" fontWeight="800" style={{ letterSpacing: "0.5px" }}>
          ESTIMATE
        </text>
        <text x={(bandR + right) / 2} y={base + 28} textAnchor="middle" fill="#475569" fontSize="11" fontWeight="700" style={{ letterSpacing: "0.5px" }}>
          ABOVE AVERAGE
        </text>
      </svg>
    </div>
  );
}
