import { NextRequest, NextResponse } from "next/server";
import { getOutboundMedia } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read-only endpoint that streams an outbound-media image back out of S3 for
// Twilio to fetch when MMSing a photo to a text-only customer (lib/media.ts). The id
// is a random unguessable key; only images the owner sent live here. No auth by design
// — Twilio fetches it unauthenticated — but the random key gates it against enumeration.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  const media = await getOutboundMedia(id);
  if (!media) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(media.body), {
    status: 200,
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=86400",
      // Defense-in-depth for a public file endpoint: never let the browser MIME-sniff,
      // and never render inline as a document (uploads are always raster images anyway).
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
