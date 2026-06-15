// Original flat illustration for the hero — a clean car on a green "stage" with
// a floating estimate card. No stock photo, no fabricated claim — just brand art.
// The card is the focus and reads as an ESTIMATE (firm offer comes by phone).

export default function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 340"
      className={className}
      role="img"
      aria-label="Illustration of a car with an instant estimate"
    >
      <defs>
        <linearGradient id="ha-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1F8A5C" />
          <stop offset="1" stopColor="#114F35" />
        </linearGradient>
        <pattern id="ha-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="#ffffff" opacity="0.10" />
        </pattern>
        <linearGradient id="ha-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16341F" />
          <stop offset="1" stopColor="#0C2418" />
        </linearGradient>
      </defs>

      {/* stage */}
      <rect x="0" y="0" width="600" height="340" rx="28" fill="url(#ha-green)" />
      <rect x="0" y="0" width="600" height="340" rx="28" fill="url(#ha-dots)" />

      {/* ground shadow */}
      <ellipse cx="312" cy="274" rx="172" ry="15" fill="#000000" opacity="0.18" />

      {/* car — clean flat sedan */}
      <g>
        <rect x="168" y="190" width="296" height="50" rx="20" fill="#FAF6EE" />
        {/* greenhouse */}
        <path d="M226 192 L262 150 L372 150 L414 192 Z" fill="#FAF6EE" />
        {/* belt-line shadow */}
        <rect x="168" y="214" width="296" height="3" fill="#E7DFCC" />
        {/* windows */}
        <path d="M254 188 L276 158 L308 158 L308 188 Z" fill="url(#ha-glass)" />
        <path d="M318 158 L366 158 L392 188 L318 188 Z" fill="url(#ha-glass)" />
        {/* door seam */}
        <path d="M312 192 L312 230" stroke="#E4DCC9" strokeWidth="2" strokeLinecap="round" />
        {/* subtle headlight */}
        <rect x="452" y="202" width="9" height="10" rx="3" fill="#E7DFCC" />
        {/* wheels */}
        <g>
          <circle cx="234" cy="240" r="28" fill="#10291E" />
          <circle cx="234" cy="240" r="11" fill="#FAF6EE" />
          <circle cx="406" cy="240" r="28" fill="#10291E" />
          <circle cx="406" cy="240" r="11" fill="#FAF6EE" />
        </g>
      </g>

      {/* floating estimate card (the focus) */}
      <g>
        <rect x="42" y="46" width="216" height="98" rx="16" fill="#0A1C14" opacity="0.18" />
        <rect x="40" y="42" width="216" height="98" rx="16" fill="#FFFFFF" />
        <text x="62" y="74" fill="#156945" fontSize="12" fontWeight="700" letterSpacing="1.5">
          INSTANT ESTIMATE
        </text>
        <text x="62" y="106" fill="#10291E" fontSize="30" fontWeight="800" fontFamily="Bricolage Grotesque, sans-serif">
          $24,600
        </text>
        <text x="62" y="128" fill="#5B7A6A" fontSize="11.5" fontWeight="600">
          Firm offer confirmed by phone
        </text>
      </g>

      {/* subtle Canadian cue */}
      <path
        d="M556 292l2.4 5.6 4-2.4-.8 4.8 4.8-.8-3.2 4 4 2.4-4.8 1.6.4 3.2-3.2-2.4-.8 7.2-.8-7.2-3.2 2.4.4-3.2-4.8-1.6 4-2.4-3.2-4 4.8.8-.8-4.8 4 2.4 2.4-5.6z"
        fill="#FFFFFF"
        opacity="0.32"
      />
    </svg>
  );
}
