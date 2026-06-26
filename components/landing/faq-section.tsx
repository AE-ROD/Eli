"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"

const FAQS = [
  {
    pregunta: "¿Puedo cancelar en cualquier momento?",
    respuesta: "Sí. No hay contratos ni permanencias. Cancelas desde tu dashboard y tu cuenta vuelve al plan Free al terminar el período pagado. Sin penalizaciones.",
  },
  {
    pregunta: "¿Funciona con WhatsApp Business?",
    respuesta: "Sí. Los recordatorios de citas se envían vía WhatsApp y el cliente los recibe como un mensaje normal. No necesitas tener WhatsApp Business — lo gestionamos nosotros.",
  },
  {
    pregunta: "¿Qué pasa cuando termina el trial de 3 días?",
    respuesta: "Tu cuenta pasa automáticamente al plan Free (1 trabajador, solo español, sin WhatsApp). No se te cobra nada. Puedes seguir usando Eli gratis o elegir un plan de pago cuando quieras.",
  },
  {
    pregunta: "¿Mis clientes necesitan crear una cuenta para reservar?",
    respuesta: "No. Tus clientes entran a tu enlace personalizado, eligen el servicio, la fecha y la hora, y listo. Sin registro, sin app, sin fricción.",
  },
  {
    pregunta: "¿Puedo importar mis clientes existentes?",
    respuesta: "Sí. Eli tiene una función de importación que acepta archivos Excel (.xlsx) y CSV. Puedes subir tu lista de clientes con nombre, teléfono y email y quedarán disponibles de inmediato.",
  },
  {
    pregunta: "¿En qué idiomas funciona el sistema de reservas?",
    respuesta: "En Español, English y Português BR. El idioma se detecta automáticamente según el navegador del cliente. Los planes Pro y Team incluyen los 3 idiomas.",
  },
]

export function FaqSection() {
  const [abierto, setAbierto] = useState<number | null>(null)

  return (
    <section id="faq" className="py-24 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="h-px w-5 bg-primary/60 rounded-full" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.12em]">FAQ</span>
            <div className="h-px w-5 bg-primary/60 rounded-full" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Preguntas frecuentes
          </h2>
          <p className="text-muted-foreground">
            Si tienes más dudas, escríbenos a{" "}
            <a href="mailto:hola@useeli.com" className="text-primary hover:underline">
              hola@useeli.com
            </a>
          </p>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              className="bg-card border border-border/50 rounded-xl overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <button
                className="w-full flex items-center justify-between p-5 text-left"
                onClick={() => setAbierto(abierto === i ? null : i)}
                aria-expanded={abierto === i}
              >
                <span className="font-medium text-foreground text-sm pr-4">{faq.pregunta}</span>
                <motion.span
                  animate={{ rotate: abierto === i ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </motion.span>
              </button>
              <AnimatePresence>
                {abierto === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                      {faq.respuesta}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
