export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col animate-pulse">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="space-y-2">
            <div className="h-6 w-36 bg-muted rounded-md" />
            <div className="h-4 w-48 bg-muted/60 rounded-md" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-muted rounded-lg" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <div className="w-full border-r border-border/50 flex flex-col lg:w-80">
          <div className="p-4 border-b border-border/50">
            <div className="h-10 bg-muted rounded-xl" />
          </div>
          <div className="flex-1 p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-card border border-border/50 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="hidden flex-1 items-center justify-center bg-muted/30 lg:flex">
          <div className="h-20 w-20 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}
