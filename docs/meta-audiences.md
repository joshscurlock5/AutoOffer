# Meta retargeting audiences — owner playbook

Everything here is done in the Meta web dashboard — **no code, no deploys**. Two kinds of
audiences, both worth setting up now so they *fill up over time* even though they're small today.

> **The honest math first:** Meta won't deliver ads to a custom audience until it matches roughly
> **100+ people**, and lookalike audiences need a **100+ person seed** (500+ works much better).
> At current volume these will take months to fill. That's fine — set them up now, let them
> accumulate, and don't budget ad spend against them until the sizes are real.

---

## 1. Website audiences (free, automatic, works today)

These build themselves from the Meta Pixel already on the site — no uploads ever.

1. Go to **https://business.facebook.com** → menu (☰) → **Audiences**.
2. Click **Create audience** → **Custom audience** → **Website**.
3. Source: your Pixel (DriveOffer). Create one audience per row:

| Name | Rule | Retention | Use |
|---|---|---|---|
| `Visited site 90d` | All website visitors | 90 days | broad retargeting |
| `Entered vehicle details 30d` | Event: `ViewContent` | 30 days | mid-funnel retargeting |
| `Started contact form 30d` | Event: `InitiateCheckout` | 30 days | hottest retargeting — they almost finished |
| `Leads 180d` | Event: `Lead` | 180 days | **exclusion** — add as "Exclude" on acquisition campaigns so you stop paying to reach people already in your pipeline |

4. When building a campaign: Ad set → Audience → **Custom audiences** → include the retargeting
   one, and under **Exclude** add `Leads 180d`.

## 2. Customer-list audiences (CSV from your dashboard)

Your analytics dashboard (**/admin/analytics → "Retargeting — export audiences for Meta"**) exports
ready-to-upload CSVs. The filter bar applies — e.g. filter to Alberta first if you want a
province-only list.

| Export button | Who's in it | What to do with it |
|---|---|---|
| **Abandoned form** | started but never submitted | "Finish your offer" retargeting campaign |
| **Offer sent, no booking** | got an offer, never booked | nudge campaign ("your offer is waiting") |
| **Closed winners** | people we bought from (with sale value) | seed for a **Lookalike** / value-based audience |
| **All contacts** | everyone in the pipeline | upload as an **exclusion list** |

Upload steps:
1. **Audiences** → **Create audience** → **Custom audience** → **Customer list**.
2. Say the list includes a `value` column **only** for the Closed-winners file (that's the sale
   price — Meta uses it for value-based lookalikes); say "No" for the others.
3. Upload the CSV → Meta auto-maps the columns (email, phone, fn, ln, ct, st, country, value) →
   confirm → **Upload & create**. Meta hashes everything in your browser during upload.
4. Re-upload a fresh export every few weeks — the list doesn't sync itself (that's deliberate:
   automated syncing needs a write-scoped API token we decided against for security).

## 3. Lookalike audience (later, once Closed winners ≥ 100)

1. **Audiences** → **Create audience** → **Lookalike audience**.
2. Source: the `Closed winners` customer list → Location: **Canada** (or Alberta via ad-set
   targeting) → Size: **1%**.
3. Use it for acquisition campaigns — it targets people who resemble the ones who actually sold
   you their car, which usually beats interest targeting.

## Privacy note

The privacy policy (site → /privacy → "Advertising") discloses hashed list uploads, and anyone can
opt out by emailing us — the code now auto-excludes email/SMS opt-outs and bounces from every
export, so no manual row-deletion or `spam`/`lost` tagging is needed to honor an opt-out.
