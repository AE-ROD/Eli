"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { EliLogo } from "@/components/eli/eli-logo"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { Building2, ArrowRight } from "lucide-react"

const tiposNegocio = [
  { id: "salon", nombre: "Salón de belleza / Spa", icono: "💇" },
  { id: "salud", nombre: "Consultorio de salud", icono: "🏥" },
  { id: "fitness", nombre: "Estudio fitness / Yoga", icono: "🧘" },
  { id: "otro", nombre: "Otro tipo de negocio", icono: "📋" },
]

export default function CompletarPerfilPage() {
  const router = useRouter()
  const { update } = useSession()
  const [cargando, setCargando] = useState(false)
  const [nombreNegocio, setNombreNegocio] = useState("")
  const [tipoNegocio, setTipoNegocio] = useState("")
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (!tipoNegocio) {
      setError("Selecciona el tipo de negocio")
      return
    }

    setCargando(true)

    try {
      const res = await fetch("/api/auth/completar-perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreNegocio, tipoNegocio }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Error al guardar el negocio")
        setCargando(false)
        return
      }

      // Refresca el JWT para que incluya el nuevo businessId
      await update()
      router.push("/dashboard")
      router.refresh()
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.")
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex justify-center mb-8">
          <EliLogo size="lg" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            Un último paso
          </h1>
          <p className="mt-2 text-muted-foreground">
            Cuéntanos sobre tu negocio para personalizar tu experiencia
          </p>
        </div>

        <form onSubmit={manejarEnvio} className="space-y-5">
          <CampoFormulario
            etiqueta="Nombre de tu negocio"
            type="text"
            placeholder="Ej: Salón María"
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            icono={<Building2 className="h-4 w-4" />}
            required
          />

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Tipo de negocio
            </label>
            <div className="grid grid-cols-2 gap-3">
              {tiposNegocio.map((tipo) => (
                <motion.button
                  key={tipo.id}
                  type="button"
                  className={`
                    p-4 rounded-xl border-2 text-left transition-all
                    ${tipoNegocio === tipo.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                    }
                  `}
                  onClick={() => setTipoNegocio(tipo.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-2xl mb-2 block">{tipo.icono}</span>
                  <span className="text-sm font-medium text-foreground">
                    {tipo.nombre}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <BotonPrimario
            type="submit"
            anchoCompleto
            tamaño="lg"
            cargando={cargando}
            icono={<ArrowRight className="h-4 w-4" />}
            iconoDerecha
          >
            Entrar al dashboard
          </BotonPrimario>
        </form>
      </motion.div>
    </div>
  )
}
