import { NextRequest, NextResponse } from "next/server";
import {
  sendLeadConfirmation,
  sendOfferEmail,
  sendPostOfferFollowup,
  sendMoreInfo,
  sendAwaitingInfoReminder,
  sendBookingConfirmation,
  sendBookingDayOf,
  sendPartialRecovery,
  sendWinback,
  sendReferralConfirmation,
} from "@/lib/email";
import type { Lead, Referral } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY preview route — fires every customer/referral email template to a
// single address so the owner can eyeball the real renders. Guarded by
// CRON_SECRET. Delete after use.
const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!SECRET || (req.headers.get("authorization") || "") !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const to = (new URL(req.url).searchParams.get("to") || "").trim();
  if (!to) return NextResponse.json({ error: "missing ?to=" }, { status: 400 });

  const now = Date.now();
  const lead = {
    id: "5ea38cf0-dev0-prev-0000-000000000000",
    kind: "vehicle",
    status: "contacted",
    createdAt: new Date(now).toISOString(),
    contact: { name: "Preview", contactMethod: "email", email: to, phone: "(780) 952-4504" },
    vehicle: { year: 2020, make: "Toyota", model: "RAV4" },
    infoQuestions: [
      "Is it automatic or manual?",
      "How many keys does it come with?",
      "Any accident history?",
    ],
    appointmentAt: new Date(now + 2 * 86400000).toISOString(),
    appointmentLocation: "123 Example St, Edmonton",
    bookingToken: "devpreviewtoken123",
  } as unknown as Lead;

  const ref = {
    id: "dev-ref-0000",
    code: "FRIEND-AB12",
    referrer: { name: "Jane Doe", email: to, phone: "(780) 952-4504" },
    friend: { name: "Bob Smith" },
    createdAt: new Date(now).toISOString(),
  } as unknown as Referral;

  const results: string[] = [];
  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      results.push("ok  " + label);
    } catch (e) {
      results.push("ERR " + label + ": " + (e as Error).message);
    }
  };

  await run("01 confirmation", () => sendLeadConfirmation(lead));
  await run("02 offer", () => sendOfferEmail(lead, 22000, 22000));
  await run("03 offer-reminder-day2", () => sendPostOfferFollowup(lead, 0));
  await run("04 offer-reminder-day5", () => sendPostOfferFollowup(lead, 1));
  await run("05 offer-reminder-day10", () => sendPostOfferFollowup(lead, 2));
  await run("06 more-info", () => sendMoreInfo(lead, lead.infoQuestions || []));
  await run("07 awaiting-info-reminder", () => sendAwaitingInfoReminder(lead));
  await run("08 booking-confirmation", () => sendBookingConfirmation(lead));
  await run("09 booking-day-of", () => sendBookingDayOf(lead));
  await run("10 abandoned-cart", () => sendPartialRecovery(lead));
  await run("11 winback", () => sendWinback(lead));
  await run("12 referral", () => sendReferralConfirmation(ref));

  return NextResponse.json({ ok: true, to, count: results.length, results });
}
