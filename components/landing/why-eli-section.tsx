"use client"

import { motion } from "framer-motion"
import { Calendar, Globe, Phone, Users } from "lucide-react"

const REASONS = [
  {
    icon: Calendar,
    title: "Sin doble-bookings",
    description:
      "El sistema bloquea el slot en tiempo real. Dos clientes no pueden reservar la misma hora al mismo tiempo.",
  },
  {
    icon: Globe,
    title: "Turistas que no hablan español",
    description:
      "Tu booking page detecta el idioma del visitante automáticamente. ES, EN y PT-BR sin configuración extra.",
  },
  {
    icon: Phone,
    title: "Recordatorios que reducen no-shows",
    description:
      "Email + WhatsApp automático 24h antes. El recordatorio evita que el cliente olvide su cita.",
  },
  {
    icon: Users,
    title: "Equipo completo desde día 1",
    description:
      "Asigna citas por trabajador, define disponibilidad individual y ve toda la agenda del equipo en un solo lugar.",
  },
]

export function WhyEliSection() {
  return (
    <section id="por-que-eli" className="why-eli">
      <div className="why-eli-inner">
        <div className="why-eli-label">Por qué Eli</div>
        <div className="why-eli-grid">
          {REASONS.map((reason, i) => {
            const Icon = reason.icon
            return (
              <motion.div
                key={reason.title}
                className="why-eli-card"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="why-eli-card-ico">
                  <Icon className="h-[18px] w-[18px]" stroke="#60a5fa" strokeWidth={1.75} />
                </div>
                <h3>{reason.title}</h3>
                <p>{reason.description}</p>
              </motion.div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .why-eli {
          background: linear-gradient(180deg, #0b0f1e 0%, #0d1425 100%);
          padding: 56px 44px;
          position: relative;
          overflow: hidden;
        }
        .why-eli::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.4) 30%, rgba(124, 58, 237, 0.4) 60%, transparent 100%);
        }
        .why-eli-inner {
          position: relative;
          max-width: 1120px;
          margin: 0 auto;
        }
        .why-eli-label {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(59, 130, 246, 0.7);
          margin-bottom: 36px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .why-eli-label::before {
          content: '';
          width: 24px;
          height: 1px;
          background: rgba(59, 130, 246, 0.5);
        }
        .why-eli-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        .why-eli-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 14px;
          padding: 24px 20px;
          transition: border-color 0.2s, background 0.2s;
        }
        .why-eli-card:hover {
          border-color: rgba(59, 130, 246, 0.2);
          background: rgba(59, 130, 246, 0.05);
        }
        .why-eli-card-ico {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.14);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }
        .why-eli-card h3 {
          font-size: 0.88rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 6px;
        }
        .why-eli-card p {
          font-size: 0.77rem;
          color: rgba(255, 255, 255, 0.36);
          line-height: 1.6;
        }
      `}</style>
    </section>
  )
}
