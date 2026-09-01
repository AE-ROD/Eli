"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, Clock, Zap, Users, Star, Building2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const VALOR_ELI = [
  { icono: Clock,  titulo: "2–4 horas/semana",      descripcion: "Tiempo que recuperas al dejar de coordinar citas por WhatsApp", color: "bg-blue-50 text-blue-600" },
  { icono: Zap,    titulo: "Cero doble-reservas",   descripcion: "El sistema bloquea horarios automáticamente en tiempo real",    color: "bg-amber-50 text-amber-600" },
  { icono: Star,   titulo: "Clientes que no faltan", descripcion: "Recordatorios automáticos por email 24h antes de cada cita",   color: "bg-rose-50 text-rose-600" },
  { icono: Users,  titulo: "Página profesional",    descripcion: "Tus clientes reservan solos, sin llamadas ni mensajes",         color: "bg-violet-50 text-violet-600" },
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
    colorIcono: "bg-blue-100 text-blue-600",
    destacado: false,
    features: [
      { texto: "1 profesional", incluido: true },
      { texto: "Agenda y calendario", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes", incluido: true },
      { texto: "Emails de confirmación", incluido: true },
      { texto: "Recordatorios automáticos 24h", incluido: true },
      { texto: "Equipo de trabajadores", incluido: false },
      { texto: "Reportes exportables", incluido: false },
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
    colorIcono: "bg-primary/10 text-primary",
    destacado: true,
    features: [
      { texto: "Hasta 5 trabajadores", incluido: true },
      { texto: "Agenda y calendario", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes", incluido: true },
      { texto: "Emails de confirmación", incluido: true },
      { texto: "Recordatorios automáticos 24h", incluido: true },
      { texto: "Horarios independientes por trabajador", incluido: true },
      { texto: "Reportes exportables", incluido: true },
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
    colorIcono: "bg-purple-100 text-purple-600",
    destacado: false,
    features: [
      { texto: "Trabajadores ilimitados", incluido: true },
      { texto: "Agenda y calendario", incluido: true },
      { texto: "Página pública de reservas", incluido: true },
      { texto: "Gestión de clientes", incluido: true },
      { texto: "Emails de confirmación", incluido: true },
      { texto: "Recordatorios automáticos 24h", incluido: true },
      { texto: "Horarios independientes por trabajador", incluido: true },
      { texto: "Reportes + estadísticas avanzadas", incluido: true },
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
          viewport={{ once: true }}
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
            Dejá de coordinar citas por WhatsApp. Empieza gratis 3 días, sin tarjeta.
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
                viewport={{ once: true }}
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
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
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
                viewport={{ once: true }}
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
                    <span className="text-4xl font-bold text-foreground">${precio}</span>
                    <span className="text-muted-foreground text-sm mb-1">USD/mes</span>
                    <AnimatePresence>
                      {periodo === "anual" && (
                        <motion.span
                          key="ahorro"
                          className="mb-1 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full"
                          initial={{ opacity: 0, scale: 0.7, x: -6 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.7, x: -6 }}
                          transition={{ type: "spring", damping: 18, stiffness: 300 }}
                        >
                          −${plan.ahorroAnual}/año
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  {precioTotal && (
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
