"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Clock, Stethoscope, Link2, CheckCircle2, Copy, Check, ArrowRight } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { useRouter } from "next/navigation"

const STORAGE_KEY = "eli_onboarding_completado"

const PASOS = [
  {
    icono: Clock,
    color: "bg-blue-100 text-blue-600",
    titulo: "Configura tu horario",
    descripcion: "Define los días y horas en que atiendes. Así tus clientes solo podrán reservar en tu disponibilidad real.",
    accion: "Ir a configuración",
    ruta: "/dashboard/configuracion",
  },
  {
    icono: Stethoscope,
    color: "bg-purple-100 text-purple-600",
    titulo: "Agrega tus servicios",
    descripcion: "Crea el catálogo de servicios que ofreces con su duración y precio. Esto aparecerá en tu página de reservas.",
    accion: "Agregar servicios",
    ruta: "/dashboard/configuracion",
  },
  {
    icono: Link2,
    color: "bg-green-100 text-green-600",
    titulo: "Comparte tu enlace",
    descripcion: "Este es tu link único de reservas. Compártelo con tus clientes por WhatsApp, redes sociales o donde quieras.",
    accion: null,
    ruta: null,
  },
]

interface ModalBienvenidaProps {
  nombreNegocio: string
  slug: string
}

export function ModalBienvenida({ nombreNegocio, slug }: ModalBienvenidaProps) {
  const [visible, setVisible] = useState(false)
  const [paso, setPaso] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const router = useRouter()

  const enlace = typeof window !== "undefined"
    ? `${window.location.origin}/reservar/${slug}`
    : `/reservar/${slug}`

  useEffect(() => {
    const completado = localStorage.getItem(STORAGE_KEY)
    if (!completado) setVisible(true)
  }, [])

  const cerrar = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  const copiar = async () => {
    await navigator.clipboard.writeText(enlace)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const irYCerrar = (ruta: string) => {
    cerrar()
    router.push(ruta)
  }

  const pasoActual = PASOS[paso]
  const IconoPaso = pasoActual.icono

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={cerrar} />

          <motion.div
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
          >
            {/* Header */}
            <div className="bg-primary/5 px-6 pt-6 pb-4 border-b border-border/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">Paso {paso + 1} de {PASOS.length}</p>
                <button onClick={cerrar} className="p-1 rounded-lg hover:bg-muted transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <h2 className="text-xl font-bold text-foreground">
                ¡Bienvenido a Eli, <span className="text-primary">{nombreNegocio}</span>! 🎉
              </h2>

              {/* Barra de progreso */}
              <div className="flex gap-1.5 mt-4">
                {PASOS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      i <= paso ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Contenido del paso */}
            <AnimatePresence mode="wait">
              <motion.div
                key={paso}
                className="px-6 py-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className={`w-14 h-14 rounded-2xl ${pasoActual.color} flex items-center justify-center mb-4`}>
                  <IconoPaso className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{pasoActual.titulo}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">{pasoActual.descripcion}</p>

                {/* Enlace en el último paso */}
                {paso === 2 && (
                  <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-3 mb-4">
                    <p className="text-sm text-foreground flex-1 truncate font-mono">{enlace}</p>
                    <button
                      onClick={copiar}
                      className="p-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors flex-shrink-0"
                    >
                      {copiado ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
                )}

                {/* Botones */}
                <div className="flex gap-3">
                  {paso > 0 && (
                    <BotonPrimario variante="secundario" onClick={() => setPaso(paso - 1)} tamaño="sm">
                      Atrás
                    </BotonPrimario>
                  )}

                  {paso < PASOS.length - 1 ? (
                    <>
                      {pasoActual.ruta && (
                        <BotonPrimario
                          variante="secundario"
                          tamaño="sm"
                          onClick={() => irYCerrar(pasoActual.ruta!)}
                        >
                          {pasoActual.accion}
                        </BotonPrimario>
                      )}
                      <BotonPrimario
                        tamaño="sm"
                        anchoCompleto
                        icono={<ArrowRight className="h-4 w-4" />}
                        iconoDerecha
                        onClick={() => setPaso(paso + 1)}
                      >
                        Siguiente
                      </BotonPrimario>
                    </>
                  ) : (
                    <BotonPrimario
                      anchoCompleto
                      tamaño="sm"
                      icono={<CheckCircle2 className="h-4 w-4" />}
                      onClick={cerrar}
                    >
                      ¡Entendido, empecemos!
                    </BotonPrimario>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
