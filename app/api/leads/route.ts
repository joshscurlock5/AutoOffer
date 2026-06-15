import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addLead, savePhotos } from "@/lib/store";
import { estimateOffer } from "@/lib/offer";
import type { Lead, UploadedPhoto, VehicleInfo, OfferEstimate } from "@/lib/types";

export const runtime = "nodejs";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const kind = str(form.get("kind")) === "inquiry" ? "inquiry" : "vehicle";
    const name = str(form.get("name"));
    const email = str(form.get("email"));
    const phone = str(form.get("phone"));
    const cmRaw = str(form.get("contactMethod"));
    const contactMethod = (["call", "text", "email"].includes(cmRaw) ? cmRaw : "call") as
      | "call"
      | "text"
      | "email";
    const bestTime = str(form.get("bestTime")) || undefined;

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Name and phone are required." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    let vehicle: VehicleInfo | undefined;
    let estimate: OfferEstimate | undefined;
    let photos: UploadedPhoto[] = [];

    if (kind === "vehicle") {
      const year = str(form.get("year"));
      const make = str(form.get("make"));
      const model = str(form.get("model"));
      const trim = str(form.get("trim"));
      const mileageKm = Number(str(form.get("mileageKm"))) || 0;

      vehicle = { year, make, model, trim: trim || undefined, mileageKm };
      // Re-compute the estimate server-side (never trust the client).
      estimate = estimateOffer({ year, make, model, mileageKm });

      const files = form
        .getAll("photos")
        .filter((f): f is File => f instanceof File && f.size > 0);
      photos = await savePhotos(id, files);
    }

    const lead: Lead = {
      id,
      kind,
      createdAt: new Date().toISOString(),
      status: "new",
      contact: { name, email, phone, contactMethod, bestTime },
      vehicle,
      estimate,
      photos,
      message: str(form.get("message")) || undefined,
      referralCode: str(form.get("referralCode")) || undefined,
      source: "web",
    };

    await addLead(lead);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("POST /api/leads failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
