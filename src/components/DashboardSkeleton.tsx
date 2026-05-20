import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="pb-4 border-b border-border/60">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-3 w-64" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-border/60 border-l-2 border-l-border">
            <CardContent className="p-4">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-14" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="border-border/60">
            <div className="px-4 py-3 border-b border-border/40">
              <Skeleton className="h-4 w-32" />
            </div>
            <CardContent className="pt-4">
              <Skeleton className="h-[180px] w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
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
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
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
        <Card key={i} className="border-border/60 border-l-2 border-l-border">
          <div className="px-4 py-4">
            <Skeleton className="h-5 w-40 mb-2" />
            <Skeleton className="h-4 w-64 mb-2" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
