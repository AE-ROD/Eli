export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="space-y-2">
            <div className="h-6 w-36 bg-muted rounded-md" />
            <div className="h-4 w-52 bg-muted/60 rounded-md" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-muted rounded-lg" />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
            <div className="h-6 w-32 bg-muted rounded-md" />
            <div className="h-4 w-64 bg-muted/60 rounded-md" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-12 bg-muted rounded-lg" />
              <div className="h-12 bg-muted rounded-lg" />
              <div className="h-12 bg-muted rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
            <div className="h-6 w-36 bg-muted rounded-md" />
            <div className="h-4 w-56 bg-muted/60 rounded-md" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-12 bg-muted rounded-lg" />
              <div className="h-12 bg-muted rounded-lg" />
              <div className="h-12 bg-muted rounded-lg" />
              <div className="h-12 bg-muted rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-6 space-y-3">
            <div className="h-6 w-32 bg-muted rounded-md" />
            <div className="h-28 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
