"use client"

import { useState } from "react"

const LOCALES = [
  { value: "es", label: "Español", flag: "🇲🇽" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "pt", label: "Português (BR)", flag: "🇧🇷" },
] as const

interface SeccionIdiomaProps {
  localeInicial: string
}

export function SeccionIdioma({ localeInicial }: SeccionIdiomaProps) {
  const [locale, setLocale] = useState(localeInicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function handleChange(nuevoLocale: string) {
    setLocale(nuevoLocale)
    setGuardando(true)
    setGuardado(false)
    try {
      await fetch("/api/dashboard/configuracion/idioma", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nuevoLocale }),
      })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-base text-foreground">Idioma de la página de reservas</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Idioma predeterminado para clientes que visiten tu página sin preferencia detectada.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap">
        {LOCALES.map((l) => (
          <button
            key={l.value}
            type="button"
            disabled={guardando}
            onClick={() => handleChange(l.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
              locale === l.value
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border hover:border-primary/40 text-muted-foreground"
            }`}
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
      {guardado && (
        <p className="text-sm text-success font-medium">Guardado</p>
      )}
    </div>
  )
}
