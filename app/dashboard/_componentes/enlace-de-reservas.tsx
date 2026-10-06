"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Link2, Copy, Check, ArrowRight } from "lucide-react"

interface EnlaceDeReservasProps {
  /** El slug del negocio: la página pública es `/reservar/<slug>`. */
  slug: string
}

/** El enlace público de reservas del negocio, para copiarlo o abrirlo. */
export function EnlaceDeReservas({ slug }: EnlaceDeReservasProps) {
  const [copiado, setCopiado] = useState(false)
  const enlace =
    typeof window !== "undefined" ? `${window.location.origin}/reservar/${slug}` : `/reservar/${slug}`

  const copiarEnlace = async () => {
    await navigator.clipboard.writeText(enlace)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
    >
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="p-3 rounded-xl bg-primary/10 flex-shrink-0">
          <Link2 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-0.5">Tu enlace de reservas</p>
          <p className="text-xs text-muted-foreground truncate font-mono">{enlace}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={copiarEnlace}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            {copiado ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
          <Link
            href={`/reservar/${slug}`}
            target="_blank"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Ver página
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </motion.section>
  )
}
