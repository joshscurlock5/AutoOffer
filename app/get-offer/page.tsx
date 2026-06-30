import { Suspense } from "react";
import type { Metadata } from "next";
import OfferFlow from "./OfferFlow";
import { GetOfferSkeleton } from "@/components/Skeleton";

export const metadata: Metadata = {
  title: "Get Your Free Offer",
  description:
    "Enter your vehicle details and photos and a specialist will prepare your free, no-obligation offer and reach out by phone or email.",
};

export default function GetOfferPage() {
  return (
    <div className="min-h-[60vh] bg-slate-50">
      <Suspense fallback={<GetOfferSkeleton />}>
        <OfferFlow />
      </Suspense>
    </div>
  );
}
