"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, Clock, Zap, Users, Star, Building2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const VALOR_ELI = [
  { icono: Clock,  titulo: "2–4 horas/semana",      descripcion: "Tiempo que recuperas al dejar de coordinar citas por WhatsApp", color: "bg-blue-500/10 text-blue-400" },
  { icono: Zap,    titulo: "Cero doble-reservas",   descripcion: "El sistema bloquea horarios automáticamente en tiempo real",    color: "bg-amber-500/10 text-amber-400" },
  { icono: Star,   titulo: "Clientes que no faltan", descripcion: "Recordatorios automáticos por email 24h antes de cada cita",   color: "bg-rose-500/10 text-rose-400" },
  { icono: Users,  titulo: "Página profesional",    descripcion: "Tus clientes reservan solos, sin llamadas ni mensajes",         color: "bg-violet-500/10 text-violet-400" },
]

const PLANES = [
  {
    id: "free",
    nombre: "Free",
    icono: Zap,
    descripcion: "Para profesionales independientes",
    mensual: 0,
    anual: 0,
    ahorroAnual: 0,
    colorIcono: "bg-blue-500/10 text-blue-400",
    destacado: false,
    features: [
      { texto: "1 trabajador", incluido: true },
      { texto: "Reservas en español", incluido: true },
      { texto: "Email de confirmación", incluido: true },
      { texto: "Página de reservas básica", incluido: true },
      { texto: "3 idiomas (ES/EN/PT)", incluido: false },
      { texto: "WhatsApp notifications", incluido: false },
      { texto: "Analytics dashboard", incluido: false },
      { texto: "Equipo de trabajadores", incluido: false },
    ],
  },
  {
    id: "pro",
    nombre: "Pro",
    icono: Users,
    descripcion: "Para negocios en crecimiento",
    mensual: 19,
    anual: 190,
    ahorroAnual: 38,
    colorIcono: "bg-primary/10 text-primary",
    destacado: true,
    features: [
      { texto: "5 trabajadores", incluido: true },
      { texto: "3 idiomas (ES/EN/PT)", incluido: true },
      { texto: "WhatsApp notifications", incluido: true },
      { texto: "Analytics dashboard", incluido: true },
      { texto: "Perfil SEO + Open Graph", incluido: true },
      { texto: "Trabajadores ilimitados", incluido: false },
      { texto: "Exportación de datos", incluido: false },
    ],
  },
  {
    id: "team",
    nombre: "Team",
    icono: Building2,
    descripcion: "Para clínicas y salones grandes",
    mensual: 49,
    anual: 490,
    ahorroAnual: 98,
    colorIcono: "bg-purple-500/10 text-purple-400",
    destacado: false,
    features: [
      { texto: "Trabajadores ilimitados", incluido: true },
      { texto: "Todo lo del plan Pro", incluido: true },
      { texto: "Soporte prioritario", incluido: true },
      { texto: "Exportación de datos", incluido: true },
    ],
  },
]

export function PreciosSection() {
  const [periodo, setPeriodo] = useState<"mensual" | "anual">("anual")

  return (
    <section id="precios" className="py-24 px-4 bg-muted/20">
      <div className="max-w-6xl mx-auto">

        {/* Encabezado */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="h-px w-5 bg-primary/60 rounded-full" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.12em]">Precios</span>
            <div className="h-px w-5 bg-primary/60 rounded-full" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Eli trabaja para que tú<br className="hidden sm:block" />{" "}
            <span className="font-display italic font-normal text-primary">no tengas que hacerlo</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Miles de profesionales ya dejaron de coordinar citas por WhatsApp. Empieza gratis 3 días, sin tarjeta.
          </p>
        </motion.div>

        {/* Valor que entrega */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {VALOR_ELI.map((v, i) => {
            const Icono = v.icono
            return (
              <motion.div
                key={i}
                className="flex flex-col items-center text-center gap-3 p-5 rounded-2xl bg-card border border-border/50 hover:shadow-md transition-all duration-300"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
              >
                <div className={`p-3 rounded-xl ${v.color}`}>
                  <Icono className="h-5 w-5" />
                </div>
                <p className="font-semibold text-foreground text-sm">{v.titulo}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{v.descripcion}</p>
              </motion.div>
            )
          })}
        </div>

        {/* Toggle mensual / anual */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span className={`text-sm font-medium transition-colors ${periodo === "mensual" ? "text-foreground" : "text-muted-foreground"}`}>
            Mensual
          </span>
          <button
            onClick={() => setPeriodo(p => p === "mensual" ? "anual" : "mensual")}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${periodo === "anual" ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <motion.span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
              animate={{ left: periodo === "anual" ? "calc(100% - 22px)" : "2px" }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium transition-colors ${periodo === "anual" ? "text-foreground" : "text-muted-foreground"}`}>
              Anual
            </span>
            <span className="text-xs bg-green-500/15 text-green-400 font-semibold px-2 py-0.5 rounded-full">
              Ahorra hasta 32%
            </span>
          </div>
        </div>

        {/* Cards de planes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANES.map((plan, i) => {
            const Icono = plan.icono
            const precio = periodo === "mensual" ? plan.mensual : Math.round(plan.anual / 12)
            const precioTotal = periodo === "anual" ? plan.anual : null

            return (
              <motion.div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all duration-300 ${
                  plan.destacado
                    ? "border-primary/70 bg-gradient-to-b from-primary/8 to-primary/4 animate-glow-pulse shadow-xl shadow-primary/10"
                    : "border-border/60 bg-card hover:border-border hover:shadow-lg hover:shadow-foreground/[0.04]"
                }`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: 0.1 + i * 0.1, duration: 0.4 }}
              >
                {plan.destacado && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full shadow">
                      Más popular
                    </span>
                  </div>
                )}

                {/* Cabecera */}
                <div className="flex items-center gap-3 mb-5">
                  <div className={`p-2.5 rounded-xl ${plan.colorIcono}`}>
                    <Icono className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{plan.nombre}</p>
                    <p className="text-xs text-muted-foreground">{plan.descripcion}</p>
                  </div>
                </div>

                {/* Precio — I */}
                <div className="mb-6">
                  <div className="flex items-end gap-2">
                    {precio === 0 ? (
                      <span className="text-4xl font-bold text-foreground">Gratis</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground">${precio}</span>
                        <span className="text-muted-foreground text-sm mb-1">USD/mes</span>
                        <AnimatePresence>
                          {periodo === "anual" && plan.ahorroAnual > 0 && (
                            <motion.span
                              key="ahorro"
                              className="mb-1 text-xs bg-green-500/15 text-green-400 font-semibold px-2 py-0.5 rounded-full"
                              initial={{ opacity: 0, scale: 0.7, x: -6 }}
                              animate={{ opacity: 1, scale: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.7, x: -6 }}
                              transition={{ type: "spring", damping: 18, stiffness: 300 }}
                            >
                              −${plan.ahorroAnual}/año
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                  {precioTotal && precioTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ${precioTotal} USD/año facturado anualmente
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-7">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5">
                      {f.incluido
                        ? <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        : <X className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                      }
                      <span className={`text-sm ${f.incluido ? "text-foreground" : "text-muted-foreground/50"}`}>
                        {f.texto}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link href="/crear-cuenta" className="block">
                  <Button
                    className={`w-full ${plan.destacado ? "bg-primary hover:bg-primary/90" : ""}`}
                    variant={plan.destacado ? "default" : "outline"}
                  >
                    Empezar gratis 3 días
                  </Button>
                </Link>
              </motion.div>
            )
          })}
        </div>

        {/* Footer de precios */}
        <p className="text-center text-sm text-muted-foreground">
          Sin tarjeta de crédito para el trial · Cancela cuando quieras · Pagos seguros con Stripe
        </p>
      </div>
    </section>
  )
}
