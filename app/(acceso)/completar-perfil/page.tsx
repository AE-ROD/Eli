"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { LogoEli } from "@/components/comunes/logo-eli"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { RUBROS, type RubroId } from "@/lib/rubros"
import { Building2, ArrowRight, User, Users } from "lucide-react"
import { completarPerfil } from "../_datos"

const opcionesEquipo = [
  { valor: 1, label: "Solo yo", icono: User },
  { valor: 2, label: "2 – 5 personas", icono: Users },
  { valor: 6, label: "6 o más", icono: Users },
]

export default function PaginaCompletarPerfil() {
  const router = useRouter()
  const { update } = useSession()
  const [cargando, setCargando] = useState(false)
  const [nombreNegocio, setNombreNegocio] = useState("")
  const [tipoNegocio, setTipoNegocio] = useState<RubroId | "">("")
  const [teamSize, setTeamSize] = useState<number>(1)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (!tipoNegocio) {
      setError("Selecciona el tipo de negocio")
      return
    }

    setCargando(true)

    const resultado = await completarPerfil({ nombreNegocio, tipoNegocio, teamSize })

    if (!resultado.ok) {
      setError(resultado.error)
      setCargando(false)
      return
    }

    await update()
    router.push("/dashboard")
    router.refresh()
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
          <LogoEli tamaño="lg" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Un último paso</h1>
          <p className="mt-2 text-muted-foreground">
            Cuéntanos sobre tu negocio para personalizar tu experiencia
          </p>
        </div>

        <form onSubmit={manejarEnvio} className="space-y-6">
          <CampoFormulario
            etiqueta="Nombre de tu negocio"
            type="text"
            placeholder="Ej: Salón María"
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            icono={<Building2 className="h-4 w-4" />}
            required
          />

          {/* Tipo de negocio */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Tipo de negocio</label>
            {/* Tres rubros, tres columnas: en un celular angosto el padding
                lateral se achica para que entren sin cortar los nombres. */}
            <div className="grid grid-cols-3 gap-3">
              {RUBROS.map((rubro) => (
                <motion.button
                  key={rubro.id}
                  type="button"
                  className={`px-2 py-4 sm:px-4 rounded-xl border-2 text-left break-words transition-all ${
                    tipoNegocio === rubro.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setTipoNegocio(rubro.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-2xl mb-2 block">{rubro.icono}</span>
                  <span className="text-sm font-medium text-foreground">{rubro.nombre}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Tamaño del equipo */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              ¿Cuántas personas trabajan contigo?
            </label>
            <div className="flex gap-3">
              {opcionesEquipo.map((op) => {
                const Icono = op.icono
                const seleccionado = teamSize === op.valor
                return (
                  <motion.button
                    key={op.valor}
                    type="button"
                    className={`flex-1 flex flex-col items-center gap-2 py-3 px-2 rounded-xl border-2 transition-all ${
                      seleccionado
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setTeamSize(op.valor)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icono className={`h-5 w-5 ${seleccionado ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium text-center leading-tight ${seleccionado ? "text-primary" : "text-foreground"}`}>
                      {op.label}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-red-500 text-center">{error}</p>}

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
