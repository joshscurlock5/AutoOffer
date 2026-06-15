# Auto Offer

Canada's easy way to sell a car. Customers enter their vehicle details + photos,
get an **instant estimated offer range**, accept it, and leave their contact info.
Every submission lands in a private **admin panel** where the team can call leads
as they come in.

Built with **Next.js 14 (App Router)** + **Tailwind CSS** + a lightweight
JSON-file database (no external services required). Runs with one command.

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

- Public site: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`  (password in `.env.local`)

To build for production:

```bash
npm run build
npm start
```

---

## Where to put YOUR info (one file)

All business details — phone number, email, address, hours, Google Map pin,
social links, referral reward amount — live in:

```
lib/site-config.ts
```

Search for the word **PLACEHOLDER** and replace each value. The phone number,
email and address automatically update everywhere on the site (header, footer,
contact page, floating call button, etc.).

### Google Map

In `lib/site-config.ts`, set `mapEmbedSrc` to a Google Maps embed URL for your
real address. The simplest no-API-key way:

```
https://www.google.com/maps?q=YOUR+FULL+ADDRESS&output=embed
```

Replace `YOUR+FULL+ADDRESS` with your address (spaces become `+`).

---

## Admin panel

- URL: `/admin`
- Password: set `ADMIN_PASSWORD` in `.env.local`
- Shows every lead (vehicle offers **and** general inquiries) with date/time,
  vehicle details, mileage, photos, customer name, click-to-call phone, email,
  and notes. Update each lead's status (New → Contacted → Scheduled → Paid).
- A separate **Referrals** tab shows $100-referral submissions.

Leads are stored in `data/leads.json`, referrals in `data/referrals.json`, and
uploaded photos in `data/uploads/` (served only to logged-in admins).

---

## How the estimated offer works

`lib/offer.ts` produces a believable price *range* from year / make / model /
mileage using a depreciation + mileage model (`lib/vehicles.ts` holds the
vehicle data and base values). It is intentionally an **estimate** — the firm
offer is made by a human by phone/email, exactly matching the real process:

1. We make an offer over the phone or email after receiving photos + info.
2. We schedule a time and place and send a specialist to inspect the vehicle.
3. You get paid.

Tune the numbers at the top of `lib/offer.ts`.

---

## Going to production later

This app writes uploads to local disk (`data/uploads`) and stores leads in JSON
files — perfect for running on your own PC or a VPS. To deploy on a serverless
host (e.g. Vercel) you'd swap the JSON store + disk uploads for a hosted
database and object storage (S3 / Supabase / UploadThing). The storage calls are
isolated in `lib/store.ts`, so that's the only file you'd change.
