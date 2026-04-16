"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"

const steps = [
  {
    number: "01",
    title: "Crea tu cuenta",
    description: "Registra tu negocio en menos de 2 minutos. Configura tus servicios, horarios y profesionales.",
  },
  {
    number: "02",
    title: "Personaliza tu página",
    description: "Obtén tu link único donde tus clientes pueden ver servicios y agendar citas 24/7.",
  },
  {
    number: "03",
    title: "Conecta tu calendario",
    description: "Sincroniza con Google Calendar para que todas tus citas estén en un solo lugar.",
  },
  {
    number: "04",
    title: "Gestiona todo desde Eli",
    description: "Administra reservas, clientes, equipo y reportes desde una interfaz simple y profesional.",
  },
]

export function HowItWorksSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section id="como-funciona" className="py-24 bg-background" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-sm font-medium text-primary uppercase tracking-wider">
            Cómo funciona
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Comienza a usarlo en minutos
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Eli está diseñado para que no necesites capacitación. 
            Es tan simple que puedes empezar a usarlo hoy mismo.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection Line */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" />
          
          <div className="space-y-12 lg:space-y-0">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                className={`relative lg:grid lg:grid-cols-2 lg:gap-8 ${
                  i % 2 === 0 ? "" : "lg:direction-rtl"
                }`}
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.6, delay: i * 0.15 }}
              >
                <div
                  className={`lg:text-right ${
                    i % 2 === 0 ? "lg:pr-12" : "lg:col-start-2 lg:pl-12 lg:text-left"
                  }`}
                >
                  <div
                    className={`flex items-start gap-4 ${
                      i % 2 === 0 ? "lg:flex-row-reverse" : ""
                    }`}
                  >
                    <div className="flex-shrink-0 lg:hidden w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                      {step.number}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Center Circle for Desktop */}
                <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 top-0 w-14 h-14 rounded-full bg-primary text-primary-foreground items-center justify-center font-bold text-lg shadow-lg shadow-primary/20">
                  {step.number}
                </div>

                <div
                  className={`hidden lg:block ${
                    i % 2 === 0 ? "lg:col-start-2 lg:pl-12" : "lg:pr-12"
                  }`}
                />

                {i < steps.length - 1 && (
                  <div className="lg:hidden h-8 w-px bg-border ml-6" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
