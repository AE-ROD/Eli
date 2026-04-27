"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Check, X as XIcon, Zap, Users, Building2, Clock, Star, ArrowRight, Sparkles } from "lucide-react"
import { BotonPrimario } from "./boton-primario"

const VALOR_ELI = [
  { icono: Clock, texto: "Ahorra 2–4 horas por semana en coordinación de citas" },
  { icono: Zap, texto: "Cero doble-reservas — el sistema bloquea horarios automáticamente" },
  { icono: Users, texto: "Tus clientes llegan con recordatorio por email, no te olvidan" },
  { icono: Star, texto: "Página profesional de reservas — sin WhatsApp, sin llamadas" },
]

const PLANES = [
  {
    id: "starter",
    nombre: "Starter",
    icono: Zap,
    descripcion: "Para profesionales independientes",
    mensual: 12,
    anual: 99,
    ahorroAnual: 45,
    color: "border-border",
    colorIcono: "bg-blue-100 text-blue-600",
    destacado: false,
    features: [
      { texto: "1 profesional", incluido: true },
      { texto: "Agenda y calendario completo", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes (pacientes)", incluido: true },
      { texto: "Emails de confirmación automáticos", incluido: true },
      { texto: "Recordatorios 24h antes de la cita", incluido: true },
      { texto: "Modal de onboarding guiado", incluido: true },
      { texto: "Equipo de trabajadores", incluido: false },
      { texto: "Reportes exportables PDF/CSV", incluido: false },
      { texto: "Estadísticas avanzadas", incluido: false },
    ],
  },
  {
    id: "equipo",
    nombre: "Equipo",
    icono: Users,
    descripcion: "Para negocios con hasta 5 personas",
    mensual: 29,
    anual: 239,
    ahorroAnual: 109,
    color: "border-primary",
    colorIcono: "bg-primary/10 text-primary",
    destacado: true,
    features: [
      { texto: "Hasta 5 trabajadores", incluido: true },
      { texto: "Agenda y calendario completo", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes (pacientes)", incluido: true },
      { texto: "Emails de confirmación automáticos", incluido: true },
      { texto: "Recordatorios 24h antes de la cita", incluido: true },
      { texto: "Horarios independientes por trabajador", incluido: true },
      { texto: "Panel de equipo e invitaciones", incluido: true },
      { texto: "Reportes exportables PDF/CSV", incluido: true },
      { texto: "Estadísticas avanzadas", incluido: false },
    ],
  },
  {
    id: "pro",
    nombre: "Pro",
    icono: Building2,
    descripcion: "Para clínicas y salones grandes",
    mensual: 59,
    anual: 479,
    ahorroAnual: 229,
    color: "border-purple-400",
    colorIcono: "bg-purple-100 text-purple-600",
    destacado: false,
    features: [
      { texto: "Trabajadores ilimitados", incluido: true },
      { texto: "Agenda y calendario completo", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes (pacientes)", incluido: true },
      { texto: "Emails de confirmación automáticos", incluido: true },
      { texto: "Recordatorios 24h antes de la cita", incluido: true },
      { texto: "Horarios independientes por trabajador", incluido: true },
      { texto: "Panel de equipo e invitaciones", incluido: true },
      { texto: "Reportes exportables PDF/CSV", incluido: true },
      { texto: "Estadísticas avanzadas + horarios pico", incluido: true },
    ],
  },
]

interface ModalPreciosProps {
  abierto: boolean
  onCerrar: () => void
  diasTrialRestantes?: number
  onSeleccionarPlan?: (planId: string, periodo: "mensual" | "anual") => void
}

export function ModalPrecios({
  abierto,
  onCerrar,
  diasTrialRestantes,
  onSeleccionarPlan,
}: ModalPreciosProps) {
  const [periodo, setPeriodo] = useState<"mensual" | "anual">("anual")

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onCerrar} />

          <motion.div
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-4xl my-4"
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 20, stiffness: 280 }}
          >
            {/* Botón cerrar */}
            <button
              onClick={onCerrar}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted transition-colors z-10"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="p-6 md:p-8">
              {/* Banner trial */}
              {diasTrialRestantes !== undefined && (
                <motion.div
                  className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-6 text-sm"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="text-amber-800 font-medium">
                    {diasTrialRestantes > 0
                      ? `Tu prueba gratuita vence en ${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""}`
                      : "Tu prueba gratuita ha terminado — elige un plan para continuar"}
                  </span>
                </motion.div>
              )}

              {/* Header — valor que entrega Eli */}
              <div className="text-center mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                  Eli trabaja para que tú no tengas que hacerlo
                </h2>
                <p className="text-muted-foreground text-sm">
                  Miles de profesionales ya dejaron de coordinar citas por WhatsApp
                </p>
              </div>

              {/* Valor que entrega */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {VALOR_ELI.map((v, i) => {
                  const Icono = v.icono
                  return (
                    <motion.div
                      key={i}
                      className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-muted/40"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icono className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xs text-muted-foreground leading-tight">{v.texto}</p>
                    </motion.div>
                  )
                })}
              </div>

              {/* Toggle mensual / anual */}
              <div className="flex items-center justify-center gap-3 mb-8">
                <span className={`text-sm font-medium ${periodo === "mensual" ? "text-foreground" : "text-muted-foreground"}`}>
                  Mensual
                </span>
                <button
                  onClick={() => setPeriodo(p => p === "mensual" ? "anual" : "mensual")}
                  className={`relative w-12 h-6 rounded-full transition-colors ${periodo === "anual" ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <motion.span
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
                    animate={{ left: periodo === "anual" ? "calc(100% - 22px)" : "2px" }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  />
                </button>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${periodo === "anual" ? "text-foreground" : "text-muted-foreground"}`}>
                    Anual
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                    Ahorra hasta 32%
                  </span>
                </div>
              </div>

              {/* Planes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANES.map((plan, i) => {
                  const Icono = plan.icono
                  const precio = periodo === "mensual" ? plan.mensual : Math.round(plan.anual / 12)
                  const precioTotal = periodo === "anual" ? plan.anual : null

                  return (
                    <motion.div
                      key={plan.id}
                      className={`relative rounded-2xl border-2 p-5 flex flex-col ${plan.color} ${plan.destacado ? "bg-primary/5" : "bg-card"}`}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.07 }}
                    >
                      {plan.destacado && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                            Más popular
                          </span>
                        </div>
                      )}

                      {/* Cabecera plan */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2 rounded-xl ${plan.colorIcono}`}>
                          <Icono className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{plan.nombre}</p>
                          <p className="text-xs text-muted-foreground">{plan.descripcion}</p>
                        </div>
                      </div>

                      {/* Precio */}
                      <div className="mb-4">
                        <div className="flex items-end gap-1">
                          <span className="text-3xl font-bold text-foreground">${precio}</span>
                          <span className="text-muted-foreground text-sm mb-1">USD/mes</span>
                        </div>
                        {precioTotal && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ${precioTotal} USD/año · ahorras ${plan.ahorroAnual}
                          </p>
                        )}
                      </div>

                      {/* Features */}
                      <ul className="space-y-2 flex-1 mb-5">
                        {plan.features.map((f, j) => (
                          <li key={j} className="flex items-start gap-2">
                            {f.incluido ? (
                              <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <XIcon className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                            )}
                            <span className={`text-xs leading-tight ${f.incluido ? "text-foreground" : "text-muted-foreground/50"}`}>
                              {f.texto}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      <BotonPrimario
                        anchoCompleto
                        variante={plan.destacado ? "primario" : "secundario"}
                        icono={<ArrowRight className="h-4 w-4" />}
                        iconoDerecha
                        onClick={() => onSeleccionarPlan?.(plan.id, periodo)}
                      >
                        Elegir {plan.nombre}
                      </BotonPrimario>
                    </motion.div>
                  )
                })}
              </div>

              {/* Footer */}
              <p className="text-center text-xs text-muted-foreground mt-6">
                3 días de prueba gratuita sin tarjeta · Cancela cuando quieras · Pagos procesados por Stripe
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
