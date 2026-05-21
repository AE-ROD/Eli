"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import { Scissors, Stethoscope, Dumbbell, Music, Camera, BookOpen, Palette, Smile } from "lucide-react"

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
    title: "Estudios Fitness",
    examples: "Gym boutique, pilates, yoga, crossfit, artes marciales",
    need: "Clases grupales con cupo limitado",
    color: "bg-orange-50 text-orange-600",
  },
  {
    icon: Music,
    title: "Estudios de Musica",
    examples: "Clases de guitarra, piano, canto, produccion musical",
    need: "Horarios por profesor e instrumento",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Camera,
    title: "Fotografia y Video",
    examples: "Fotografo, videoasta, estudio de grabacion, podcast",
    need: "Reserva de sesiones y uso de equipos",
    color: "bg-slate-50 text-slate-600",
  },
  {
    icon: BookOpen,
    title: "Tutores y Academias",
    examples: "Tutoria escolar, idiomas, refuerzo academico, coaching",
    need: "Seguimiento de sesiones por alumno",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Palette,
    title: "Arte y Creatividad",
    examples: "Clases de pintura, ceramica, manualidades, tatuajes",
    need: "Gestion de talleres y materiales incluidos",
    color: "bg-rose-50 text-rose-600",
  },
  {
    icon: Smile,
    title: "Estetica y Bienestar",
    examples: "Masajista, terapeuta holistica, reiki, acupuntura",
    need: "Privacidad y notas por cliente",
    color: "bg-emerald-50 text-emerald-600",
  },
]

// Triplicar para que el loop sea continuo sin saltos
const duplicatedAudiences = [...audiences, ...audiences, ...audiences]

const CARD_WIDTH = 380
const GAP = 32
// Ancho de un set: 3 tarjetas × (380 + 32) = 1236px — coincide con la keyframe en CSS
const DURATION = 48 // segundos para recorrer un set completo (8 tarjetas × 412px / ~68px/s)

export function TargetSection() {
  const [isPaused, setIsPaused] = useState(false)

  return (
    <section id="para-quien" className="py-24 bg-muted/20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
        >
          <div className="inline-flex items-center gap-2.5 mb-1">
            <div className="h-px w-5 bg-primary/60 rounded-full" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.12em]">Para quién</span>
            <div className="h-px w-5 bg-primary/60 rounded-full" />
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Diseñado para{" "}
            <span className="font-display italic font-normal text-primary">negocios de bienestar y salud</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Si actualmente gestionas tus citas por WhatsApp, Instagram DM o una libreta fisica,
            Eli es para ti. Profesionaliza tu operacion sin complicaciones.
          </p>
        </motion.div>
      </div>

      {/* Carousel — animado con CSS para máxima fluidez (corre en el compositor) */}
      <div
        className="relative w-full"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          className="flex carousel-track"
          style={{
            gap: `${GAP}px`,
            animationDuration: `${DURATION}s`,
            animationPlayState: isPaused ? "paused" : "running",
          }}
        >
          {duplicatedAudiences.map((audience, i) => (
            <div
              key={`${audience.title}-${i}`}
              className="flex-shrink-0 bg-card rounded-2xl p-7 border border-border/40 hover:border-primary/15 transition-all duration-300 hover:shadow-xl overflow-hidden relative"
              style={{ width: CARD_WIDTH, height: 260 }}
            >
              {/* Watermark icon */}
              <audience.icon className="absolute -right-4 -bottom-4 h-32 w-32 text-foreground opacity-[0.045] pointer-events-none" />

              <div className="relative z-10 h-full flex flex-col">
                {/* Header: icono pequeño + título inline */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-lg ${audience.color} flex items-center justify-center flex-shrink-0`}>
                    <audience.icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground leading-tight">
                    {audience.title}
                  </h3>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                  {audience.examples}
                </p>

                <div className="pt-4 border-t border-border/40 mt-4">
                  <p className="text-xs font-semibold text-primary/60 uppercase tracking-[0.1em] mb-1">Necesidad clave</p>
                  <p className="text-sm text-foreground font-medium line-clamp-1">
                    {audience.need}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Degradados en los bordes */}
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-secondary/30 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-secondary/30 to-transparent pointer-events-none" />
      </div>

    </section>
  )
}
