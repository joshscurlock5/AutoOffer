import { GetOfferSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-[60vh] bg-slate-50">
      <GetOfferSkeleton />
    </div>
  );
}
