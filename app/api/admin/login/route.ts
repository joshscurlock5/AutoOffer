import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkPassword, createSession, SESSION_TTL } from "@/lib/auth";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Brute-force protection: cap login attempts per IP.
  const ip = clientIpFrom(req);
  if (!(await allowRequest(ip, "admin-login", 10, 900))) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({ password: "" }));

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createSession(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production", // off on localhost (http) dev
    maxAge: SESSION_TTL,
  });
  return res;
}
