import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readPhoto } from "@/lib/store";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
};

// Serves uploaded customer photos — admins only.
export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  if (!isAuthed()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [leadId, fileName] = params.path || [];
  if (!leadId || !fileName) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buf = await readPhoto(leadId, fileName);
  if (!buf) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const type = MIME[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
