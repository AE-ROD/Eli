"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Check, X as XIcon, Zap, Users, Building2, Clock, Star, ArrowRight, Sparkles, type LucideIcon } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Insignia } from "@/components/comunes/insignia"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { cn } from "@/lib/utils"

/*
 * Ojo: los planes, los precios y las promesas de abajo son los de antes del
 * rediseño, que no salen de ninguna decisión del dueño (`docs/PRODUCTO.md`,
 * sección 10: el precio está pendiente). El rediseño sólo cambió cómo se ven.
 */

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
    destacado: false,
    features: [
      { texto: "1 profesional", incluido: true },
      { texto: "Agenda y calendario completo", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes", incluido: true },
      { texto: "Emails de confirmación automáticos", incluido: true },
      { texto: "Recordatorios 24h antes de la cita", incluido: true },
      { texto: "Modal de onboarding guiado", incluido: true },
      { texto: "Equipo de trabajadores", incluido: false },
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
    destacado: true,
    features: [
      { texto: "Hasta 5 trabajadores", incluido: true },
      { texto: "Agenda y calendario completo", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes", incluido: true },
      { texto: "Emails de confirmación automáticos", incluido: true },
      { texto: "Recordatorios 24h antes de la cita", incluido: true },
      { texto: "Horarios independientes por trabajador", incluido: true },
      { texto: "Panel de equipo e invitaciones", incluido: true },
    ],
  },
  {
    id: "pro",
    nombre: "Pro",
    icono: Building2,
    descripcion: "Para salones con equipo grande",
    mensual: 59,
    anual: 479,
    ahorroAnual: 229,
    destacado: false,
    features: [
      { texto: "Trabajadores ilimitados", incluido: true },
      { texto: "Agenda y calendario completo", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes", incluido: true },
      { texto: "Emails de confirmación automáticos", incluido: true },
      { texto: "Recordatorios 24h antes de la cita", incluido: true },
      { texto: "Horarios independientes por trabajador", incluido: true },
      { texto: "Panel de equipo e invitaciones", incluido: true },
    ],
  },
]

type Periodo = "mensual" | "anual"

interface ModalPreciosProps {
  abierto: boolean
  onCerrar: () => void
  diasTrialRestantes?: number
  onSeleccionarPlan?: (planId: string, periodo: Periodo) => void
}

/** Un ícono en un cuadro gris: los planes no son un módulo, no llevan pastel. */
function CuadroGris({ icono: Icono, className }: { icono: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-10 shrink-0 place-items-center rounded-[12px] bg-superficie text-navy squircle", className)}
    >
      <Icono className="size-5" strokeWidth={1.75} />
    </span>
  )
}

export function ModalPrecios({ abierto, onCerrar, diasTrialRestantes, onSeleccionarPlan }: ModalPreciosProps) {
  const [periodo, setPeriodo] = useState<Periodo>("anual")

  return (
    <AnimatePresence>
      {abierto && (
        <MarcoDeModal
          titulo="Eli trabaja para que tú no tengas que hacerlo"
          descripcion="Deja de coordinar citas por WhatsApp. Empieza gratis 3 días, sin tarjeta."
          ancho="xl"
          alCerrar={onCerrar}
        >
          {/* Lo que queda de la prueba */}
          {diasTrialRestantes !== undefined && (
            <p className="mb-6 flex items-start gap-2.5 rounded-campo bg-superficie px-4 py-3 text-sm font-medium squircle">
              <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
              {diasTrialRestantes > 0
                ? `Tu prueba gratuita vence en ${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""}`
                : "Tu prueba gratuita ha terminado — elige un plan para continuar"}
            </p>
          )}

          {/* Valor que entrega */}
          <ul className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {VALOR_ELI.map((valor) => (
              <li key={valor.texto} className="flex items-start gap-3 rounded-[20px] bg-superficie p-3 squircle sm:flex-col">
                <CuadroGris icono={valor.icono} className="size-9 bg-tarjeta" />
                <span className="text-[13px] leading-snug text-texto-2">{valor.texto}</span>
              </li>
            ))}
          </ul>

          {/* Mensual o anual: dos botones, el elegido en navy */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <div role="group" aria-label="Período de facturación" className="inline-flex rounded-full bg-superficie p-1">
              {(["mensual", "anual"] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={periodo === opcion}
                  onClick={() => setPeriodo(opcion)}
                  className={cn(
                    "h-10 rounded-full px-5 text-sm font-medium anillo-foco transition-colors duration-150 ease-suave",
                    periodo === opcion ? "bg-navy text-white" : "text-navy hover:bg-tarjeta"
                  )}
                >
                  {opcion === "mensual" ? "Mensual" : "Anual"}
                </button>
              ))}
            </div>
            <Insignia>Ahorra hasta 32%</Insignia>
          </div>

          {/* Planes */}
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {PLANES.map((plan) => {
              const precio = periodo === "mensual" ? plan.mensual : Math.round(plan.anual / 12)
              const precioTotal = periodo === "anual" ? plan.anual : null

              return (
                <li
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-panel p-5 squircle",
                    plan.destacado ? "bg-superficie inset-ring-2 inset-ring-navy" : "bg-tarjeta inset-ring-1 inset-ring-borde"
                  )}
                >
                  {plan.destacado && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-navy px-3 py-1 text-xs font-semibold whitespace-nowrap text-white">
                      Más popular
                    </span>
                  )}

                  {/* Cabecera del plan */}
                  <div className="mb-4 flex items-center gap-3">
                    <CuadroGris icono={plan.icono} className={plan.destacado ? "bg-tarjeta" : undefined} />
                    <div className="min-w-0">
                      <h3 className="font-semibold">{plan.nombre}</h3>
                      <p className="text-[13px] text-texto-2">{plan.descripcion}</p>
                    </div>
                  </div>

                  {/* Precio */}
                  <div className="mb-5">
                    <p className="flex items-end gap-1">
                      <span className="text-[2rem] leading-none font-medium tracking-[-1px] tabular-nums">${precio}</span>
                      <span className="mb-0.5 text-sm text-texto-2">USD/mes</span>
                    </p>
                    {precioTotal && (
                      <p className="mt-1.5 text-[13px] text-texto-2">
                        ${precioTotal} USD/año · ahorras ${plan.ahorroAnual}
                      </p>
                    )}
                  </div>

                  {/* Lo que incluye: lo que no, tachado y con una cruz, no sólo más claro. */}
                  <ul className="mb-6 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature.texto} className="flex items-start gap-2 text-[13px] leading-snug">
                        {feature.incluido ? (
                          <Check className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden="true" strokeWidth={2} />
                        ) : (
                          <XIcon className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={2} />
                        )}
                        <span className={feature.incluido ? "text-navy" : "text-texto-2 line-through"}>
                          {!feature.incluido && <span className="sr-only">No incluye: </span>}
                          {feature.texto}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <BotonPrimario
                    anchoCompleto
                    variante={plan.destacado ? "primario" : "secundario"}
                    icono={<ArrowRight className="size-4" aria-hidden="true" />}
                    iconoDerecha
                    onClick={() => onSeleccionarPlan?.(plan.id, periodo)}
                  >
                    Elegir {plan.nombre}
                  </BotonPrimario>
                </li>
              )
            })}
          </ul>

          <p className="mt-6 text-center text-[13px] text-texto-2">3 días de prueba gratuita sin tarjeta · Cancela cuando quieras</p>
        </MarcoDeModal>
      )}
    </AnimatePresence>
  )
}
