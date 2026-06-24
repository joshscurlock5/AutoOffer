import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addReferral } from "@/lib/store";
import { notifyNewReferral } from "@/lib/notify";
import type { Referral } from "@/lib/types";

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
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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
    return NextResponse.json({ ok: true, code: ref.code });
  } catch (err) {
    console.error("POST /api/referrals failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
