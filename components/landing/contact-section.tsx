"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, MapPin, Clock, Send } from "lucide-react"

const contactInfo = [
  {
    icon: Mail,
    title: "Email",
    value: "hola@eli.app",
    description: "Respondemos en menos de 24h",
  },
  {
    icon: MapPin,
    title: "Ubicación",
    value: "Latinoamérica",
    description: "Servicio 100% remoto",
  },
  {
    icon: Clock,
    title: "Horario",
    value: "Lun - Vie, 9:00 - 18:00",
    description: "Hora de Ciudad de México",
  },
]

export function ContactSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section id="contacto" className="py-24 bg-secondary/30" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Left Column */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="text-sm font-medium text-primary uppercase tracking-wider">
              Contacto
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-foreground text-balance">
              ¿Tienes preguntas? Estamos aquí para ayudarte
            </h2>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Ya sea que quieras saber más sobre Eli, necesites ayuda con tu cuenta 
              o estés interesado en ser beta tester, contáctanos.
            </p>

            <div className="mt-10 space-y-6">
              {contactInfo.map((item, i) => (
                <motion.div
                  key={item.title}
                  className="flex items-start gap-4"
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    <p className="text-primary font-medium">{item.value}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Column - Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="bg-card rounded-2xl p-8 border border-border/50 shadow-xl shadow-primary/5">
              <h3 className="text-xl font-semibold text-foreground mb-6">
                Envíanos un mensaje
              </h3>
              
              <form className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Nombre
                    </label>
                    <Input 
                      placeholder="Tu nombre" 
                      className="bg-background border-border focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Negocio
                    </label>
                    <Input 
                      placeholder="Nombre de tu negocio" 
                      className="bg-background border-border focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email
                  </label>
                  <Input 
                    type="email"
                    placeholder="tu@email.com" 
                    className="bg-background border-border focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Tipo de negocio
                  </label>
                  <select className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="">Selecciona una opción</option>
                    <option value="salon">Salón de belleza / Spa</option>
                    <option value="health">Consultorio de salud</option>
                    <option value="fitness">Estudio fitness / Yoga</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Mensaje
                  </label>
                  <textarea 
                    rows={4}
                    placeholder="Cuéntanos cómo podemos ayudarte..."
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>

                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                  <Send className="h-4 w-4" />
                  Enviar mensaje
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
