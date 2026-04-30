import { Skeleton } from '@/components/ui/skeleton'

export default function ReadyDeliveryLoading() {
  return (
    <div className="space-y-6">
      {/* Stat cards skeleton */}
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card px-4 py-3">
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="mt-2 h-2.5 w-32" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-border/50 bg-card">
        <div className="border-b border-border/50 px-4 py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-1 h-3 w-64" />
        </div>
        <div className="divide-y divide-border/30">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-2.5 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
