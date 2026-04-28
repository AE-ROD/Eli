"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight, Calendar, Users, MessageSquare, Sparkles, Star } from "lucide-react"
import Link from "next/link"

const NEGOCIOS = [
  "salones de belleza",
  "consultorios médicos",
  "estudios de música",
  "academias de yoga",
  "barberías",
  "estudios de fotografía",
  "academias de idiomas",
]

const AVATARS = [
  { bg: "bg-blue-500",   letra: "M" },
  { bg: "bg-violet-500", letra: "A" },
  { bg: "bg-emerald-500",letra: "C" },
  { bg: "bg-rose-500",   letra: "L" },
  { bg: "bg-amber-500",  letra: "R" },
]

export function HeroSection() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % NEGOCIOS.length), 2400)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden bg-transparent">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-24 text-center">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-sm text-primary font-medium mb-8"
        >
          <Sparkles className="h-3.5 w-3.5" />
          3 días gratis · Sin tarjeta de crédito
        </motion.div>

        {/* Título */}
        <motion.h1
          className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-foreground text-balance leading-[1.08]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          Simplifica tu agenda,{" "}
          <br className="hidden sm:block" />
          <span className="relative">
            <span className="text-primary">enfócate en tu talento</span>
            <motion.span
              className="absolute -bottom-2 left-0 right-0 h-[3px] bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 rounded-full"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            />
          </span>
        </motion.h1>

        {/* Subtítulo con texto rotativo — A */}
        <motion.div
          className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
        >
          <span>El asistente que centraliza reservas, clientes y equipo para </span>
          <span className="inline-flex items-center h-7 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={idx}
                className="inline-block text-primary font-semibold"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.28 }}
              >
                {NEGOCIOS[idx]}
              </motion.span>
            </AnimatePresence>
          </span>
          <span>.</span>
        </motion.div>

        {/* CTAs */}
        <motion.div
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.26 }}
        >
          <Link href="/crear-cuenta">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-13 px-8 text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow">
              Comenzar gratis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#como-funciona">
            <Button size="lg" variant="outline" className="h-13 px-8 text-base border-border/70 hover:bg-muted/50 hover:border-primary/30 transition-all">
              Ver cómo funciona
            </Button>
          </Link>
        </motion.div>

        {/* Social proof — B */}
        <motion.div
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.34 }}
        >
          <div className="flex -space-x-2">
            {AVATARS.map((a, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full border-2 border-background ${a.bg} flex items-center justify-center text-white text-xs font-bold shadow-sm`}
              >
                {a.letra}
              </div>
            ))}
          </div>
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">+1,200 negocios confían en Eli</span>
        </motion.div>

        {/* Pills de características */}
        <motion.div
          className="mt-8 flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.42 }}
        >
          {[
            { icon: Calendar, text: "Reservas 24/7" },
            { icon: Users, text: "Gestión de equipo" },
            { icon: MessageSquare, text: "Chat integrado" },
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/60 px-4 py-2 text-sm text-muted-foreground shadow-sm"
            >
              <item.icon className="h-3.5 w-3.5 text-primary" />
              {item.text}
            </div>
          ))}
        </motion.div>

        {/* Línea de gradiente animada — C */}
        <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden opacity-70">
          <motion.div
            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
          />
        </div>

      </div>
    </section>
  )
}
