export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="space-y-2">
            <div className="h-6 w-24 bg-muted rounded-md" />
            <div className="h-4 w-40 bg-muted/60 rounded-md" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block h-9 w-48 bg-muted rounded-lg" />
            <div className="h-9 w-9 bg-muted rounded-lg" />
            <div className="hidden sm:block h-9 w-32 bg-muted rounded-lg" />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Export button */}
        <div className="flex justify-end">
          <div className="h-9 w-full bg-muted rounded-lg sm:w-28" />
        </div>
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="h-10 flex-1 bg-muted rounded-xl" />
          <div className="h-10 w-32 bg-muted rounded-xl" />
          <div className="h-10 w-20 bg-muted rounded-xl" />
        </div>
        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-32 bg-card border border-border/50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
