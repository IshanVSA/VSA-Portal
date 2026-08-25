import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="pb-4 border-b border-border/60">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-3 w-64" />
      </div>

      {/* Status strip skeleton */}
      <div className="flex flex-wrap items-center gap-6 sm:gap-10">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Department chips skeleton */}
      <div className="flex flex-wrap gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-36 rounded-full" />
        ))}
      </div>

      {/* Pipeline + chart skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <Skeleton className="h-[200px] lg:col-span-3 rounded-2xl" />
      </div>

      {/* Activity timeline skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-5 w-5 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-[260px] rounded-lg" />
          <Skeleton className="h-10 w-[200px] rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px border border-border/60 rounded-xl overflow-hidden bg-border/60">
        {[...Array(7)].map((_, i) => (
          <div key={`h-${i}`} className="bg-muted/30 p-2 text-center">
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}
        {[...Array(35)].map((_, i) => (
          <div key={i} className="bg-card min-h-[80px] p-2">
            <Skeleton className="h-3 w-5 mb-2" />
            {i % 5 === 0 && <Skeleton className="h-5 w-full rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="pb-4 border-b border-border/60">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-3 w-72" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="border-l-2 border-border/60 px-4 py-3">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-4 w-64 mb-2" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
      ))}
    </div>
  );
}
