export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="space-y-2">
            <div className="h-6 w-28 bg-muted rounded-md" />
            <div className="h-4 w-44 bg-muted/60 rounded-md" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block h-9 w-48 bg-muted rounded-lg" />
            <div className="h-9 w-9 bg-muted rounded-lg" />
            <div className="hidden sm:block h-9 w-28 bg-muted rounded-lg" />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Calendar controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <div className="h-9 w-9 bg-muted rounded-lg" />
            <div className="h-9 w-32 bg-muted rounded-lg" />
            <div className="h-9 w-9 bg-muted rounded-lg" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            <div className="h-9 w-16 bg-muted rounded-lg" />
            <div className="hidden h-9 w-20 bg-muted rounded-lg lg:block" />
            <div className="h-9 w-14 bg-muted rounded-lg" />
          </div>
        </div>
        {/* Calendar grid */}
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border/50">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-12 border-r border-border/50 last:border-r-0 bg-muted/30" />
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ height: 480 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border-r border-border/50 last:border-r-0" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
