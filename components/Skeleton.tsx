// Reusable shimmer skeleton placeholders.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden />;
}

/** Shown while the estimated offer "calculates" (get-offer step 2). */
export function OfferSkeleton() {
  return (
    <div
      className="grid gap-8 lg:grid-cols-2"
      role="status"
      aria-label="Calculating your offer"
    >
      <div className="card p-6 sm:p-8">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="mt-3 h-7 w-64" />
        {/* gauge placeholder: a row of bars suggesting the bell curve */}
        <div className="mt-8 flex items-end justify-center gap-2">
          {["h-10", "h-16", "h-24", "h-32", "h-40", "h-32", "h-24", "h-16", "h-10"].map(
            (h, i) => (
              <Skeleton key={i} className={`${h} w-6 rounded-t-lg`} />
            ),
          )}
        </div>
        <Skeleton className="mx-auto mt-4 h-3 w-56" />
      </div>

      <div className="flex flex-col">
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="mt-4 h-12 w-3/4" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <Skeleton className="mt-6 h-12 w-full rounded-full" />
        <Skeleton className="mt-3 h-12 w-48 rounded-full" />
        <div className="mt-7 space-y-3 rounded-2xl bg-slate-50 p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-10/12" />
        </div>
      </div>
    </div>
  );
}

/** A single lead card placeholder for the admin list. */
export function LeadCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[1fr_300px]">
        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="border-t border-slate-100 bg-slate-50 p-5 md:border-l md:border-t-0">
          <Skeleton className="h-4 w-24" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full admin dashboard placeholder (route-level loading.tsx). */
export function AdminSkeleton() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white">
        <div className="container-x flex h-16 items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="container-x py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="mt-5 space-y-4">
          {[0, 1, 2].map((i) => (
            <LeadCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Get-offer page placeholder (stepper + form). */
export function GetOfferSkeleton() {
  return (
    <div className="container-x max-w-4xl py-10 sm:py-14">
      <div className="mx-auto flex max-w-xl items-center justify-between">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
          </div>
        ))}
      </div>
      <div className="card mt-8 space-y-6 p-6 sm:p-9">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="ml-auto h-12 w-44 rounded-full" />
      </div>
    </div>
  );
}
