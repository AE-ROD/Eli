"use client"

import { motion, useInView } from "framer-motion"
import { useRef, useEffect, useState } from "react"
import { Scissors, Stethoscope, Dumbbell } from "lucide-react"

const audiences = [
  {
    icon: Scissors,
    title: "Salones y Spas",
    examples: "Salon de belleza, barberia, spa, centro de unas",
    need: "Agenda multiple por estilista/terapeuta",
    color: "bg-pink-50 text-pink-600",
  },
  {
    icon: Stethoscope,
    title: "Consultorios de Salud",
    examples: "Dentista, psicologo, nutricionista, fisioterapeuta",
    need: "Historial clinico basico por paciente",
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: Dumbbell,
    title: "Estudios Fitness/Yoga",
    examples: "Gym boutique, estudio de pilates, yoga, crossfit",
    need: "Clases grupales con cupo limitado",
    color: "bg-orange-50 text-orange-600",
  },
]

// Duplicate for infinite scroll effect
const duplicatedAudiences = [...audiences, ...audiences, ...audiences]

const CARD_WIDTH = 380
const GAP = 32
const SLIDE_DURATION = 3

export function TargetSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  const [isPaused, setIsPaused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate total width for one set of cards
  const singleSetWidth = audiences.length * (CARD_WIDTH + GAP)

  return (
    <section id="para-quien" className="py-24 bg-secondary/30 overflow-hidden" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-sm font-medium text-primary uppercase tracking-wider">
            Para quien
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Disenado para negocios de bienestar y salud
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Si actualmente gestionas tus citas por WhatsApp, Instagram DM o una libreta fisica, 
            Eli es para ti. Profesionaliza tu operacion sin complicaciones.
          </p>
        </motion.div>
      </div>

      {/* Infinite Carousel */}
      <div 
        className="relative w-full"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <motion.div
          ref={containerRef}
          className="flex"
          style={{ gap: GAP }}
          animate={{
            x: isPaused ? undefined : [0, -singleSetWidth],
          }}
          transition={{
            x: {
              duration: SLIDE_DURATION * audiences.length,
              repeat: Infinity,
              ease: "linear",
              repeatType: "loop",
            },
          }}
        >
          {duplicatedAudiences.map((audience, i) => (
            <motion.div
              key={`${audience.title}-${i}`}
              className="flex-shrink-0 bg-card rounded-2xl p-8 border border-border/50 hover:border-primary/20 transition-all duration-300 hover:shadow-xl"
              style={{ 
                width: CARD_WIDTH,
                height: 280,
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: (i % audiences.length) * 0.15 }}
            >
              <div className={`w-14 h-14 rounded-xl ${audience.color} flex items-center justify-center mb-6`}>
                <audience.icon className="h-7 w-7" />
              </div>
              
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {audience.title}
              </h3>
              
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {audience.examples}
              </p>
              
              <div className="pt-4 border-t border-border/50">
                <span className="text-xs font-medium text-primary uppercase tracking-wider">
                  Necesidad clave
                </span>
                <p className="mt-1 text-sm text-foreground font-medium line-clamp-1">
                  {audience.need}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Gradient overlays for smooth edges */}
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-secondary/30 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-secondary/30 to-transparent pointer-events-none" />
      </div>

      {/* Ideal User Profile */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mt-16 bg-card rounded-2xl p-8 md:p-12 border border-border/50"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-foreground mb-4">
              Perfil del usuario ideal
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Dueno(a) o administrador(a) de un negocio independiente con{" "}
              <span className="text-foreground font-medium">1 a 15 empleados</span>. 
              Tiene entre 25 y 45 anos. Busca profesionalizar su operacion sin invertir 
              en software costoso ni complejo. Valora la{" "}
              <span className="text-foreground font-medium">simplicidad</span> y la{" "}
              <span className="text-foreground font-medium">apariencia profesional</span>{" "}
              de sus herramientas.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
