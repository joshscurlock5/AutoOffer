import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ao_session";

/** Admin password (set ADMIN_PASSWORD in .env.local). */
export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "autooffer-admin";
}

/** Opaque session token derived from the password. */
export function sessionToken(): string {
  return crypto
    .createHash("sha256")
    .update("auto-offer::" + adminPassword())
    .digest("hex");
}

export function checkPassword(pw: unknown): boolean {
  return typeof pw === "string" && pw.length > 0 && pw === adminPassword();
}

/** Whether the current request has a valid admin session cookie. */
export function isAuthed(): boolean {
  const value = cookies().get(ADMIN_COOKIE)?.value;
  return !!value && value === sessionToken();
}
