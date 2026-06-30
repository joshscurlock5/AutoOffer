// ===========================================================================
//  DriveOffer — Car Selling Guide content (SINGLE SOURCE OF TRUTH)
//  The mega menu, the /car-selling-guide hub, and every /car-selling-guide/[slug]
//  article all read from this one file, so they can never drift apart.
//
//  To add an article: drop a new entry in the right category's `articles` array.
//  It automatically appears in the mega menu, on the hub, and gets its own
//  statically-generated, indexable page with title/description metadata.
// ===========================================================================

import { site } from "@/lib/site-config";
import { ENRICHMENT } from "@/lib/guidesSeo";

// A single content block. A block may carry an optional heading (`h`) plus
// either paragraphs (`p`) and/or a bullet list (`ul`).
export type GuideBlock = { h?: string; p?: string[]; ul?: string[] };

export type GuideFaq = { q: string; a: string };

export type GuideArticle = {
  slug: string;
  title: string; // menu label, page <h1>, and <title>
  blurb: string; // hub card text + meta description
  body: GuideBlock[];
  // ---- E-E-A-T / SEO enrichment (optional; populated by the enrichment pass) ----
  published?: string; // ISO yyyy-mm-dd
  updated?: string; // ISO yyyy-mm-dd
  metaDescription?: string; // overrides blurb for <meta> + Article schema description
  primaryKeyword?: string;
  keywords?: string[];
  keyTakeaways?: string[];
  faqs?: GuideFaq[];
  experienceSignal?: string; // one honest, first-hand experience line
  relatedSlugs?: string[]; // curated cross-links (slugs)
};

export type GuideCategory = {
  key: string; // also the hub anchor id (e.g. #areas)
  title: string;
  blurb: string; // shown under the category heading on the hub
  articles: GuideArticle[];
};

// Shared closing CTA wording reused by the page templates (kept out of `body`
// so every article ends with a consistent, on-brand call to action).
export const GUIDE_CTA = {
  title: "Ready to skip the hassle?",
  text: `Tell us about your car and a ${site.name} specialist will prepare your free offer — no obligation, no haggling.`,
  button: "Get a Free Offer",
};

// Editorial byline/author for the guide articles (E-E-A-T). A named, credentialed
// human is the strongest YMYL signal. (Add a real headshot when available.)
export const GUIDE_AUTHOR = {
  name: "Samir Osman",
  jobTitle: "Owner & AMVIC-Licensed Wholesaler, DriveOffer (Edmonton, AB)",
  knowsAbout: [
    "Selling a car in Alberta",
    "Vehicle wholesaling",
    "AMVIC licensing",
    "Bill of sale & registry transfer",
  ],
  bio: "Samir Osman is the owner of DriveOffer, an AMVIC-licensed vehicle wholesaler (licence B2036941) based in Edmonton, Alberta. Over the past five years he has bought more than 5,000 cars directly from the public, coming to sellers across Edmonton and surrounding Alberta. That hands-on volume gives him a first-hand read on what private vehicles are actually worth in the local wholesale market.",
};

// Fallback dates when an article doesn't carry its own (ISO yyyy-mm-dd).
export const GUIDE_DEFAULT_PUBLISHED = "2026-06-22";
export const GUIDE_DEFAULT_UPDATED = "2026-06-22";

export const guideCategories: GuideCategory[] = [
  // -------------------------------------------------------------------------
  {
    key: "selling",
    title: "Selling Your Car",
    blurb: "The basics of selling a car the easy way — your options, the steps, and how to stay safe.",
    articles: [
      {
        slug: "how-to-sell-a-car-in-alberta",
        title: "How to Sell a Car in Alberta",
        blurb:
          "A step-by-step guide to selling your car in Alberta — pricing, paperwork, the registry, and getting paid safely.",
        body: [
          {
            p: [
              "Selling a car in Alberta is simpler than most people expect. There's no provincial sales tax on private vehicle sales here, no mandatory safety inspection to sell a registered vehicle, and registry agents make the ownership transfer quick. Here's the whole process, start to finish.",
            ],
          },
          {
            h: "1. Find out what your car is worth",
            p: [
              "Start with a realistic number based on live market data for your exact year, make, model, trim, and mileage — not a sticker price you remember from years ago. A free online estimate takes about a minute and gives you a fair starting point.",
            ],
          },
          {
            h: "2. Gather your paperwork",
            ul: [
              "Your vehicle registration",
              "Valid government photo ID",
              "A bill of sale (date, price, both names, the VIN, and odometer reading)",
              "A loan payout / lien letter if the car is still financed",
              "Both sets of keys, the owner's manual, and any service records",
            ],
          },
          {
            h: "3. Choose how to sell",
            p: [
              "You have three realistic options: trade it in at a dealership (fast, lowest price), sell it privately (highest price, most hassle and risk), or take an instant offer from a buyer like DriveOffer (fast and fair, and we come to you).",
            ],
          },
          {
            h: "4. Transfer ownership and get paid",
            p: [
              "In Alberta the buyer registers the vehicle in their name at any registry agent. Hand over the signed bill of sale and registration, get paid by a secure method like a bank draft, and remove your plate — plates stay with you, not the car.",
            ],
          },
        ],
      },
      {
        slug: "trade-in-vs-private-sale",
        title: "Trade-In vs Private Sale",
        blurb:
          "Trade-in, private sale, or instant offer? Compare what each option really nets you — and the Alberta tax angle.",
        body: [
          {
            p: [
              "There's no single \"best\" way to sell a car — it's a trade-off between how much you get and how much hassle you take on. Here's how the three main options stack up.",
            ],
          },
          {
            h: "Trade-in",
            p: [
              "The easiest option: you hand the keys to a dealer and they knock the value off your next car. It's fast and low-effort, but you'll almost always get the least money, because the dealer needs to resell it at a profit.",
            ],
            ul: [
              "Best for: people buying another car the same day who value convenience over price.",
              "Alberta tax note: Alberta has no PST, so you don't get the PST-style trade-in break that Ontario or BC buyers do. The federal 5% GST still applies on a dealer purchase, but only on the price after your trade-in — so a trade-in does lower your GST a little (usually small next to the gap between trade-in and private-sale value).",
            ],
          },
          {
            h: "Private sale",
            p: [
              "Listing it yourself usually gets the highest price, but it's the most work and the most risk: photos, ads, tire-kickers, no-shows, strangers test-driving your car, and handling payment safely.",
            ],
          },
          {
            h: "Instant offer (DriveOffer)",
            p: [
              "An instant offer aims for the sweet spot — close to private-sale money without the work or the risk. You get a fair, data-backed number, we come to you to inspect and pay, and we handle the paperwork. No listings, no strangers, no waiting.",
            ],
          },
        ],
      },
      {
        slug: "sell-without-meeting-strangers",
        title: "Sell Your Car Without Meeting Strangers",
        blurb:
          "Skip the sketchy meetups. How to sell your car safely — without strangers in your driveway or cash handoffs.",
        body: [
          {
            p: [
              "The worst part of a private sale isn't the paperwork — it's inviting strangers to your home, handing your keys to someone for a test drive, and carrying around an envelope of cash. You can avoid all of it.",
            ],
          },
          {
            h: "Why private meetups go wrong",
            ul: [
              "No-shows and time-wasters who never intended to buy",
              "Safety risk of strangers at your home or a parking lot",
              "Test-drive theft and \"let me take it to my mechanic\" disappearances",
              "Fake bank drafts, e-transfer reversals, and cash-counting scams",
            ],
          },
          {
            h: "The safer way",
            p: [
              "Sell to a verified, established buyer instead of an anonymous stranger. With DriveOffer there's no public listing and no random meetups — a single insured buyer comes to your home or work at a scheduled time, inspects the car, and pays you with a secure bank draft on the spot.",
            ],
          },
        ],
      },
      {
        slug: "how-driveoffer-works",
        title: "How DriveOffer Works",
        blurb:
          "Three simple steps: tell us about your car, get a fair offer, and get paid — we come to you, anywhere in the area.",
        body: [
          {
            p: [
              `${site.name} is built to be the easiest way to sell a car. No listings, no haggling, no dealership runaround — just three steps.`,
            ],
          },
          {
            h: "1. Tell us about your car",
            p: [
              "Enter your car's year, make, and model (or just your VIN) and a few details about its condition. A specialist reviews it and prepares your fair, no-obligation offer — then reaches out by phone or email.",
            ],
          },
          {
            h: "2. We confirm the offer",
            p: [
              "We arrange a quick inspection at a time and place that works for you — your driveway, your workplace, wherever. We verify the car matches the details and confirm your offer. If there's still a loan on the car, we sort the lender payout as part of closing.",
            ],
          },
          {
            h: "3. Get paid",
            p: [
              "Accept the offer and we pay you with a secure bank draft, handle the ownership paperwork, and take the car away. You keep your plate. Done — usually the same day.",
            ],
          },
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: "payment",
    title: "Payment & Paperwork",
    blurb: "Get paid safely and handle the documents right — including financed cars and avoiding scams.",
    articles: [
      {
        slug: "how-bank-draft-payment-works",
        title: "How Bank Draft Payment Works",
        blurb:
          "What a bank draft is, why it's safer than cash for a car sale, and how to make sure the one you're handed is real.",
        body: [
          {
            p: [
              "When you're selling something worth thousands of dollars, how you get paid matters as much as the price. A bank draft is the standard, safe way to settle a car sale.",
            ],
          },
          {
            h: "What is a bank draft?",
            p: [
              "A bank draft is a payment the bank guarantees and pulls from its own funds, not from a personal account that could bounce. Because the money is set aside when the draft is issued, it's far more reliable than a personal cheque and safer to carry than a large amount of cash.",
            ],
          },
          {
            h: "How to make sure a draft is genuine",
            ul: [
              "Look for the issuing bank's name, branch, and security features",
              "If you have any doubt, call the issuing bank directly (using a number you look up yourself, not one printed on the draft) to verify it",
              "Be wary of any draft for more than the agreed price — overpayment is a classic scam",
            ],
          },
          {
            h: "Getting paid by DriveOffer",
            p: [
              "We pay with a bank draft at the time of pickup, so you're holding guaranteed funds before the car leaves with us. No waiting for an e-transfer to clear and no cash to count.",
            ],
          },
        ],
      },
      {
        slug: "paperwork-you-need",
        title: "What Paperwork Do You Need?",
        blurb:
          "The exact documents you need to sell your car in Alberta — registration, ID, bill of sale, and lien letters.",
        body: [
          {
            p: [
              "Having your documents ready makes a car sale fast and clean. Here's what you'll need in Alberta.",
            ],
          },
          {
            h: "The essentials",
            ul: [
              "Vehicle registration in your name",
              "Valid government-issued photo ID",
              "A bill of sale — the date, sale price, buyer and seller names, the VIN, and the odometer reading",
              "Both sets of keys, plus the owner's manual and any service records you have",
            ],
          },
          {
            h: "If your car is financed or leased",
            p: [
              "You'll also need a current payout (lien) letter from your lender showing the exact balance to clear the loan. The lien has to be cleared for ownership to transfer.",
            ],
          },
          {
            h: "Good to know in Alberta",
            ul: [
              "There's no mandatory safety inspection to sell a registered vehicle privately",
              "Plates stay with the seller — they don't transfer with the car",
              "The buyer completes the registration transfer at any Alberta registry agent",
            ],
          },
        ],
      },
      {
        slug: "selling-a-car-with-a-loan",
        title: "Selling a Car With a Loan",
        blurb:
          "Yes, you can sell a car you still owe money on. How to handle the loan payout and any negative equity.",
        body: [
          {
            p: [
              "Plenty of cars are sold before the loan is paid off — it's a normal, routine sale. The key is dealing with the lender's lien correctly so ownership can transfer cleanly.",
            ],
          },
          {
            h: "Step one: get a payout letter",
            p: [
              "Ask your lender for a payout or lien letter. It states the exact amount needed to close the loan, usually good for a set number of days. This is the number that has to be cleared at the sale.",
            ],
          },
          {
            h: "Positive vs negative equity",
            ul: [
              "Positive equity: your car is worth more than the loan balance — you pocket the difference.",
              "Negative equity: you owe more than it's worth — you'll need to cover the gap to clear the lien.",
            ],
          },
          {
            h: "How DriveOffer handles it",
            p: [
              "We can pay your lender directly to clear the lien as part of the sale, then pay you any remaining equity. You don't have to come up with the full payoff yourself first — we sort it out at closing.",
            ],
          },
        ],
      },
      {
        slug: "avoiding-private-sale-scams",
        title: "Avoiding Private Sale Scams",
        blurb:
          "Fake bank drafts, overpayment tricks, e-transfer reversals, curbsiders — the common car-selling scams and how to dodge them.",
        body: [
          {
            p: [
              "If you sell privately, you become the target. Car-selling scams are common and convincing. Here are the ones to watch for.",
            ],
          },
          {
            h: "Common scams",
            ul: [
              "Fake or altered bank drafts and cashier's cheques",
              "Overpayment: they \"accidentally\" pay too much and ask for a refund of the difference",
              "E-transfer reversals — a transfer that looks received but gets clawed back",
              "\"Shipping agent\" and out-of-country buyers who never inspect the car",
              "Curbsiders: unlicensed dealers posing as private sellers (a buying-side risk too)",
            ],
          },
          {
            h: "How to protect yourself",
            ul: [
              "Never refund an overpayment — a genuine buyer pays the agreed amount",
              "Verify any draft with the issuing bank before handing over the keys",
              "Don't ship a car or release it before guaranteed funds are in hand",
              "When in doubt, sell to an established, verified buyer instead of a stranger",
            ],
          },
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: "areas",
    title: "Areas We Serve",
    blurb: "We come to you across the Edmonton region — pick your city to learn more.",
    articles: [
      {
        slug: "sell-my-car-edmonton",
        title: "Sell My Car in Edmonton",
        blurb: "Sell your car in Edmonton the easy way — a free offer, we come to you, and you get paid the same day.",
        body: [
          {
            p: [
              "Selling a car in Edmonton doesn't have to mean weeks of Kijiji messages and no-shows. DriveOffer gives Edmonton sellers a fair, market-based offer and comes to you — anywhere from downtown to Mill Woods, Windermere, the west end, or north Edmonton.",
            ],
          },
          {
            h: "Why Edmonton sellers choose DriveOffer",
            ul: [
              "A free, no-obligation offer in about a minute",
              "We come to your home or workplace anywhere in the city",
              "Paid on the spot by secure bank draft — same day in most cases",
              "We buy financed, leased, and high-kilometre cars too",
            ],
          },
          {
            p: [
              "No listings, no strangers in your driveway, no haggling. Get your Edmonton car estimate and we'll handle the rest, including the paperwork and pickup.",
            ],
          },
        ],
      },
      {
        slug: "sell-my-car-sherwood-park",
        title: "Sell My Car in Sherwood Park",
        blurb: "Sell your car in Sherwood Park without the hassle — free offer, we come to you, paid the same day.",
        body: [
          {
            p: [
              "Sherwood Park and the rest of Strathcona County are well inside our service area. Whether you're in Summerwood, Clarkdale Meadows, or near Baseline Road, DriveOffer comes to you — no need to drive into Edmonton to sell your car.",
            ],
          },
          {
            h: "Why Sherwood Park sellers choose DriveOffer",
            ul: [
              "A free, market-based offer with no obligation",
              "We meet you at home or work anywhere in Strathcona County",
              "Secure bank-draft payment, usually the same day",
              "Financed and leased vehicles are welcome",
            ],
          },
          {
            p: [
              "Skip the private-sale runaround. Get your Sherwood Park estimate and we'll come to you to inspect, pay, and take care of the paperwork.",
            ],
          },
        ],
      },
      {
        slug: "sell-my-car-st-albert",
        title: "Sell My Car in St. Albert",
        blurb: "Sell your car in St. Albert the easy way — a fair offer, we come to you, and you get paid fast.",
        body: [
          {
            p: [
              "DriveOffer serves St. Albert and the communities just north of Edmonton. From Akinsdale and Lacombe Park to Erin Ridge and along St. Albert Trail, we'll come to you — no trip into the city required.",
            ],
          },
          {
            h: "Why St. Albert sellers choose DriveOffer",
            ul: [
              "A free, no-obligation offer based on live market data",
              "We come to your home or workplace anywhere in St. Albert",
              "Paid quickly and securely by bank draft",
              "We buy cars with loans, leases, and higher mileage",
            ],
          },
          {
            p: [
              "No ads, no test-drive risk, no waiting around. Get your St. Albert estimate and we'll do the heavy lifting.",
            ],
          },
        ],
      },
      {
        slug: "sell-my-car-leduc",
        title: "Sell My Car in Leduc",
        blurb: "Sell your car in Leduc without the stress — free offer, we come to you, paid the same day.",
        body: [
          {
            p: [
              "Leduc, Beaumont, Nisku, and the area south of Edmonton are all within our reach. DriveOffer comes to you in Leduc so you can sell your car without driving up to the city or dealing with strangers.",
            ],
          },
          {
            h: "Why Leduc sellers choose DriveOffer",
            ul: [
              "A free, fair offer in about a minute",
              "We meet you at home or work anywhere in Leduc and area",
              "Secure same-day payment by bank draft",
              "Financed, leased, and well-used cars are all welcome",
            ],
          },
          {
            p: [
              "Get your Leduc car estimate and we'll come to inspect, pay you, and handle every bit of the paperwork.",
            ],
          },
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: "value",
    title: "Vehicle Value",
    blurb: "What your car is really worth, and what moves the number up or down.",
    articles: [
      {
        slug: "what-affects-your-cars-value",
        title: "What Affects Your Car's Value?",
        blurb:
          "Mileage, condition, demand, history — the main factors that decide what your car is worth today.",
        body: [
          {
            p: [
              "Two cars of the same year and model can be worth very different amounts. These are the factors that move the number.",
            ],
          },
          {
            h: "The big drivers of value",
            ul: [
              "Make and model demand — how sought-after your car is right now",
              "Mileage — lower kilometres generally means higher value",
              "Age and overall condition, inside and out",
              "Trim and options — AWD, leather, tech and safety packages add value",
              "Accident and ownership history",
              "Service records and how well it's been maintained",
              "Season and local demand — trucks and AWD hold up well through an Alberta winter",
            ],
          },
          {
            p: [
              "An accurate offer weighs all of these against live wholesale market data. The more honest and complete your details, the more accurate your number.",
            ],
          },
        ],
      },
      {
        slug: "mileage-condition-and-trim",
        title: "Mileage, Condition, and Trim",
        blurb:
          "How kilometres, wear, and trim level change what your car is worth — with realistic expectations.",
        body: [
          {
            h: "Mileage",
            p: [
              "The average car in Canada covers roughly 15,000–20,000 km a year. Well below that average is a plus; well above it pulls the value down, because higher mileage means more wear and shorter remaining life.",
            ],
          },
          {
            h: "Condition",
            p: [
              "Buyers and appraisers think in tiers — from clean and well cared for, to average with normal wear, to rough with dents, mechanical issues, or interior damage. Honest condition matters: it's verified at inspection, so over-stating it just leads to a revised offer.",
            ],
          },
          {
            h: "Trim and options",
            p: [
              "Trim can swing value by thousands. All-wheel drive, a sunroof, leather, a tow package, and driver-assist tech all add up — especially the features that are in demand locally, like AWD and remote start for Alberta winters.",
            ],
          },
        ],
      },
      {
        slug: "accident-history-and-car-value",
        title: "Accident History and Car Value",
        blurb:
          "Does an accident tank your car's value? How history reports and repairs really factor into your offer.",
        body: [
          {
            p: [
              "An accident on the record usually lowers value, but how much depends entirely on the damage — and a clean repair is very different from structural damage.",
            ],
          },
          {
            h: "How history shows up",
            p: [
              "Reported claims and repairs appear on history reports like CARFAX. Minor cosmetic work has a small effect; structural or airbag damage has a much larger one. Cars with rebuilt or salvage titles are worth significantly less than clean-title equivalents.",
            ],
          },
          {
            h: "Be upfront about it",
            p: [
              "Disclose any history honestly. It comes out at inspection regardless, and being upfront keeps your offer firm. The good news: DriveOffer still buys cars with accident history — you don't need a spotless record to get a fair offer.",
            ],
          },
        ],
      },
      {
        slug: "how-online-car-offers-are-calculated",
        title: "How Online Car Offers Are Calculated",
        blurb:
          "What's behind an instant online car offer — market data, your details, and how to get the most accurate number.",
        body: [
          {
            p: [
              "An instant online offer isn't a guess. It combines real market data with the specifics of your car to produce a fair, current number.",
            ],
          },
          {
            h: "What goes into the number",
            ul: [
              "Live wholesale and retail market data for your exact vehicle",
              "Your year, make, model, and trim",
              "Mileage and condition",
              "Regional demand — what your car is worth in this market, not a national average",
            ],
          },
          {
            h: "Getting the most accurate offer",
            p: [
              "Accurate inputs produce an accurate offer, so enter your mileage and condition honestly and use your VIN when you can — it pins down the exact trim and options. The online figure is then confirmed with a quick inspection before you're paid.",
            ],
          },
        ],
      },
    ],
  },
];

// ---- Derived lookups (used by the [slug] route and the hub) ----------------

export type FlatArticle = GuideArticle & { category: string; categoryTitle: string };

// Merge the generated E-E-A-T/SEO enrichment (lib/guidesSeo.ts) onto each article.
export const allArticles: FlatArticle[] = guideCategories.flatMap((c) =>
  c.articles.map((a) => ({ ...a, ...ENRICHMENT[a.slug], category: c.key, categoryTitle: c.title }))
);

export function getArticle(slug: string): FlatArticle | undefined {
  return allArticles.find((a) => a.slug === slug);
}
