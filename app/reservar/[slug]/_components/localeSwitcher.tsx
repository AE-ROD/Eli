"use client"

import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"

const LOCALES = ["es", "en", "pt"] as const

interface LocaleSwitcherProps {
  locale: string
}

export function LocaleSwitcher({ locale }: LocaleSwitcherProps) {
  const router = useRouter()

  const switchLocale = (l: string) => {
    document.cookie = `eli-locale=${l}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <nav aria-label="Language selector" className="flex gap-1.5">
      {LOCALES.map((l) => (
        <Badge
          key={l}
          variant={locale === l ? "default" : "outline"}
          className="cursor-pointer uppercase text-[11px] px-2.5 py-1 rounded-full select-none"
          onClick={() => switchLocale(l)}
          aria-pressed={locale === l}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && switchLocale(l)}
        >
          {l}
        </Badge>
      ))}
    </nav>
  )
}
