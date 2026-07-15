import "server-only";
import crypto from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, PHOTOS_BUCKET } from "./aws";
import { site } from "./site-config";

// ---------------------------------------------------------------------------
//  Outbound media hosting — for MMS. When the owner sends a photo in a customer's
//  Replies topic and the customer is text-only, Twilio needs a PUBLIC URL to fetch
//  the image from. We stash it in S3 under a random key and serve it back through
//  /api/media?id=<key> (see app/api/media/route.ts). The random key is the only
//  guard — it's unguessable, and these are just images the owner chose to send.
//
//  Dormant alongside the rest of the SMS stack: only the MMS path calls this, and
//  that path no-ops until Twilio is configured (lib/sms.ts).
// ---------------------------------------------------------------------------

const PREFIX = "outbound-media/";

/** Store an outbound image and return a public app URL Twilio can fetch, or null if
 * S3 isn't configured / the upload fails (best-effort — never throws). */
export async function uploadOutboundMedia(
  bytes: Uint8Array,
  contentType: string,
  ext: string,
): Promise<string | null> {
  if (!PHOTOS_BUCKET) return null;
  const id = `${crypto.randomUUID()}${ext ? `.${ext.replace(/[^a-z0-9]/gi, "")}` : ""}`;
  try {
    await s3.send(
      new PutObjectCommand({ Bucket: PHOTOS_BUCKET, Key: `${PREFIX}${id}`, Body: bytes, ContentType: contentType }),
    );
    return `${site.url}/api/media?id=${encodeURIComponent(id)}`;
  } catch (e) {
    console.error("[media] upload failed:", e);
    return null;
  }
}

/** Fetch a stored outbound-media object by its id. Returns bytes + content-type, or
 * null. The id is validated to a single path segment so it can't escape the prefix. */
export async function getOutboundMedia(id: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!PHOTOS_BUCKET || !id || !/^[a-zA-Z0-9._-]{1,120}$/.test(id) || id.includes("..")) return null;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: PHOTOS_BUCKET, Key: `${PREFIX}${id}` }));
    const body = await res.Body?.transformToByteArray();
    if (!body) return null;
    return { body, contentType: res.ContentType || "application/octet-stream" };
  } catch (e) {
    console.error("[media] fetch failed:", e);
    return null;
  }
}
