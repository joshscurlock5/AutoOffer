import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addReferral } from "@/lib/store";
import { notifyNewReferral } from "@/lib/notify";
import { sendReferralConfirmation } from "@/lib/email";
import type { Referral } from "@/lib/types";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendCapiLead, splitName } from "@/lib/metaCapi";

export const runtime = "nodejs";

function code(name: string): string {
  const prefix = (name.split(" ")[0] || "FRIEND")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8) || "FRIEND";
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "referrals", 6, 3600))) {
      return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    }
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    // Bot check (Cloudflare Turnstile). No-op until keys are configured.
    if (!(await verifyTurnstile(String(body.turnstileToken || ""), ip))) {
      return NextResponse.json(
        { error: "Verification failed. Please refresh the page and try again." },
        { status: 403 },
      );
    }

    const referrerName = String(body.referrerName || "").trim();
    const referrerEmail = String(body.referrerEmail || "").trim();

    if (!referrerName || !referrerEmail) {
      return NextResponse.json(
        { error: "Your name and email are required." },
        { status: 400 },
      );
    }

    const ref: Referral = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: "new",
      referrer: {
        name: referrerName,
        email: referrerEmail,
        phone: String(body.referrerPhone || "").trim() || undefined,
      },
      friend: {
        name: String(body.friendName || "").trim() || undefined,
        phone: String(body.friendPhone || "").trim() || undefined,
        email: String(body.friendEmail || "").trim() || undefined,
      },
      message: String(body.message || "").trim() || undefined,
      code: code(referrerName),
    };

    await addReferral(ref);
    // Telegram alert (best-effort; awaited so the Lambda doesn't freeze first).
    await notifyNewReferral(ref);
    // Thank-you email to the referrer (best-effort; no-op without RESEND config).
    await sendReferralConfirmation(ref);
    // Meta Conversions API "CompleteRegistration" event (best-effort; after the referral is saved).
    await sendCapiLead({
      eventId: String(body.metaEventId || "") || crypto.randomUUID(),
      eventName: "CompleteRegistration",
      eventSourceUrl: req.headers.get("referer"),
      user: {
        email: referrerEmail,
        phone: ref.referrer.phone,
        ...splitName(referrerName),
        externalId: ref.id,
        country: "ca",
        clientIp: ip,
        userAgent: req.headers.get("user-agent"),
        fbp: req.cookies.get("_fbp")?.value,
        fbc: req.cookies.get("_fbc")?.value,
      },
      customData: { currency: "CAD", value: 0, content_name: "Referral" },
    });
    return NextResponse.json({ ok: true, code: ref.code });
  } catch (err) {
    console.error("POST /api/referrals failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
