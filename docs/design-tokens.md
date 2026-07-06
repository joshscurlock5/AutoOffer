# DriveOffer Design Tokens

A semantic color system **reverse-engineered from the existing site** — same look,
now maintainable and WCAG-AA. Two layers, both defined in `app/globals.css :root`:

1. **Primitives** (`--brand-600`, `--navy`, `--slate-200`, …) hold the real hexes.
2. **Semantic aliases** (`--color-primary`, `--color-surface`, `--color-text-primary`,
   `--color-success`, …) are what components use. Exposed as Tailwind classes via
   `tailwind.config.ts` (`bg-primary`, `bg-surface`, `text-content`, `border-line`,
   `text-success`, `bg-scrim`, …). The old `brand`/`navy`/`muted`/`cream` classes
   are kept for back-compat, so migration is incremental and safe.

The primary brand color is the **logo blue** (`brand-700 #1D4FD0` identity /
`brand-600 #2563EB` action). Everything else derives from the discovered palette.

## Accessibility — 4 real AA fixes (applied in the token values)

These only take visual effect when a component migrates to the token:

| # | Problem | Was | Now | Ratio |
|---|---------|-----|-----|-------|
| 1 | **Focus ring** invisible (biggest issue) | `ring-brand/40` ~1.6:1 | solid `brand-600` | 5.17:1 |
| 2 | Field focus border / nav-hover link | `brand-500` 3.68:1 | `brand-600` | 5.17:1 |
| 3 | Warning text on white | `amber-600` 3.19:1 | `amber-700` | 4.52:1 |
| 4 | Error text on red tint | `red-600` on red-50 4.41:1 | `red-700` on red-50 | 5.91:1 |

Plus a cosmetic nudge: the "lost/cool" badge text `slate-500` → `slate-600`.

## 2 discretionary decisions (your call — defaults preserve the current look)

- **Selection tint** (`--color-selection`): default keeps the exact current
  `rgba(59,130,246,0.18)`. Switch to a `brand-600` base for a hair more contrast.
- **Offer-price green**: `--color-success` = `green-700` unifies the two greens
  (admin used `green-700`, the offer price used `emerald-700`). Both pass AA, but
  this shifts the offer-price number from teal-green to true green. To keep the
  original teal on that prominent number, use `--color-success-money`
  (`emerald-700`, already defined) there instead.

Third-party brand marks are intentionally **not** tokenized: Google "G" colors
(`components/icons.tsx`) and Cloudflare orange `#F6821F` (`TurnstileBox.tsx`).

## Migration map — hardcoded color → semantic token

> Nothing below is applied yet. This is the checklist for the incremental migration.

| Current | Replace with | Where |
|---------|-------------|-------|
| `bg-brand-600` (.btn-primary, selected fills) | `bg-primary` | globals.css:70; OfferFlow.tsx:574 |
| `hover:bg-brand-700` | `hover:bg-primary-hover` | globals.css:70 |
| `text-brand-700` (wordmark "Offer", footer link hover) | `text-primary-hover` | Header.tsx:61, Footer.tsx:88,36 |
| `hover:text-brand` (nav hover, brand-500) **FIX** | `hover:text-content-link` | Header.tsx:23 |
| `focus:border-brand` (.field, brand-500) **FIX** | `focus:border-line-focus` | globals.css:92 |
| `ring-brand/40`, `ring-brand/20` **FIX** | `ring-focus` (solid) | globals.css:67,87,92 |
| `::selection rgba(59,130,246,.18)` | `var(--color-selection)` | globals.css:14 |
| `bg-brand-50 text-brand` (icon chip, "new") | `bg-info-bg text-info` | ContactForm.tsx:70; AdminDashboard.tsx:33 |
| `bg-brand-50` (PhoneButton hover) | `hover:bg-primary-tint` | PhoneButton white variant |
| `text-brand-600` (consent link) | `text-content-link` | ConsentBanner.tsx:37 |
| `accent`/`accent-600`/`accent-700` | `secondary`/`-hover`/`-active` | Brands.tsx:42; OfferFlow.tsx:992; OfferGauge |
| `bg-navy` (.btn-dark/gold/accent) | `bg-surface-dark` | globals.css:73,76,79 |
| `hover:bg-navy-700` | `hover:bg-surface-dark-hover` | globals.css:73,76 |
| `bg-navy-900` (.card-spotlight) | `bg-surface-inverse` | globals.css:110 |
| `text-navy` (headings, labels) | `text-content` | globals.css:99,118; Footer.tsx:35; Header.tsx:60 |
| `text-navy/80` (nav rest) | `text-content/80` | Header.tsx:23 |
| `hover:border-navy` (.btn-ghost, sticky pill) | `hover:border-line-hover` | globals.css:82; StickyCTA.tsx |
| `text-ink` (body, field, article) | `text-content` | globals.css:10,92; car-selling-guide |
| `text-muted`, `.eyebrow` | `text-content-secondary` | globals.css:115; Section.tsx:49; Footer.tsx:90 |
| `bg-white`/`bg-cream` (page/section vs card) | `bg-canvas`/`bg-canvas-section` vs `bg-surface` | body & sections vs .card/.field/header |
| `text-white` on dark | `text-content-on-primary` | globals.css:70,73,110 |
| `bg-slate-50` (inset, disabled fill) | `bg-canvas-subtle` | OfferFlow.tsx:982,792,845 |
| `bg-slate-100` (admin shell, hover rows) | `bg-canvas-app` / `bg-canvas-hover` | AdminDashboard.tsx:316 |
| `border-slate-200` (fields, cards, dividers) | `border-line` | globals.css:92,104,107; Footer; Header:53 |
| `border-slate-300` (sticky pill) | `border-line-strong` | StickyCTA.tsx |
| `placeholder:text-slate-500` | `placeholder:text-content-placeholder` | globals.css:92 |
| `disabled:text-slate-400` | `disabled:text-content-disabled` | OfferFlow.tsx:792,845 |
| `bg-slate-200/70` (.skeleton) | `bg-[--color-skeleton]` | globals.css:45 |
| `bg-slate-800` (tooltip) | `bg-surface-tooltip` | AnalyticsDashboard.tsx:129 |
| `text-red-600`/`bg-red-50` on tint **FIX** | `text-error-on-bg` + `bg-error-bg` | ContactForm.tsx:109; OfferFlow.tsx:675,768,808,874 |
| `text-red-600` on white | `text-error` (unchanged) | AdminDashboard.tsx:829,837; ChatWidget.tsx:341 |
| `bg-red-100 text-red-700` (deleted badge) | `bg-error-bg-strong text-error-strong` | AdminDashboard.tsx:684 |
| `text-emerald-700` / `text-green-700` (offer, profit) | `text-success` (see decision above) | OfferFlow.tsx:913; AdminDashboard.tsx:443,855 |
| `bg-green-50 text-green-700` (badges) | `bg-success-bg text-success` | AdminDashboard.tsx:695,732 |
| `bg-emerald-100 text-emerald-800` | `bg-success-bg-strong text-success-strong` | AdminDashboard.tsx:700 |
| `text-amber-600` (needs-quote) **FIX** | `text-warning` | AdminDashboard.tsx:740,741,1448 |
| `bg-amber-50 text-amber-700` | `bg-warning-bg text-warning` | AdminDashboard.tsx:34; AnalyticsDashboard.tsx:1072 |
| `bg-amber-100 text-amber-800` | `bg-warning-bg-strong text-warning-strong` | AnalyticsDashboard.tsx:30,58 |
| `text-amber-400` (stars) | `text-star` | page.tsx:37; Testimonials; WhySell; ValueWidget |
| `bg-blue-100 text-blue-800` ("new") | `bg-[--color-badge-new-bg] text-[--color-badge-new-text]` | AnalyticsDashboard.tsx:31 |
| `bg-indigo-100 text-indigo-800` ("contacted") | badge-contacted tokens | AnalyticsDashboard.tsx:32 |
| `bg-purple-50 text-purple-700` ("scheduled") | badge-scheduled tokens | AdminDashboard.tsx; AnalyticsDashboard.tsx:33 |
| `bg-slate-100 text-slate-500` ("lost/cool") | `bg-badge-neutral-bg text-badge-neutral-text` | AdminDashboard.tsx; AnalyticsDashboard.tsx:95 |
| `bg-black/60` (modals) | `bg-scrim` | AdminDashboard.tsx:1028,1079,1140; ExitIntent.tsx:79 |
| `bg-black/70` (lightbox) | `bg-scrim-strong` | AdminDashboard.tsx:945 |
| `shadow-card/soft/lift` inline rgba | keep classes; already read `--shadow-*` | GuideMegaMenu.tsx:103; StickyMobileBar.tsx:70 |
| `radial-gradient(rgba(16,42,76,.07))` (.bg-grid) | `var(--color-bg-grid-dot)` | globals.css:123 |
| inline `#16181D` gradient (ReferralBanner) | `var(--navy)` | ReferralBanner.tsx:19 |
| inline `#22C55E` (ReferralBanner) | `text-success` | ReferralBanner.tsx:69 |
| OfferGauge SVG hexes | `secondary` / `primary-emphasis` / local `--gauge-*` | OfferGauge.tsx:70-104 |
| heatmap `rgba(37,99,235,a)` + `#f1f5f9` | `--color-primary-rgb` + `var(--slate-100)` | AnalyticsDashboard.tsx:261 |
| **`bg-bg`** (dead class — resolves to nothing) | `bg-canvas-app` or remove | AnalyticsDashboard.tsx:648 |
