"use client"

import { motion } from "framer-motion"
import { ArrowRight, Check } from "lucide-react"
import Link from "next/link"

const FEATURES = [
  "Confirmación automática al cliente por email",
  "WhatsApp de recordatorio 24h antes",
  "Cancelación y reagendamiento en un clic",
  "Notas internas por cada cita",
]

const BOOKINGS = [
  {
    id: "mario",
    status: "new",
    avatarBg: "#3b82f6",
    initials: "MG",
    name: "Mario García",
    detail: "Consulta inicial · Hoy 3:00 PM",
    badge: "Nueva",
    time: "hace 2 min",
  },
  {
    id: "ana",
    status: "conf",
    avatarBg: "#8b5cf6",
    initials: "AL",
    name: "Ana López",
    detail: "Sesión estándar · Hoy 4:30 PM",
    badge: "Confirmada",
    time: "hace 18 min",
  },
  {
    id: "carlos",
    status: "remind",
    avatarBg: "#10b981",
    initials: "CR",
    name: "Carlos Ruiz",
    detail: "Servicio premium · Hoy 5:00 PM",
    badge: "Recordatorio",
    time: "hace 1 h",
  },
  {
    id: "sofia",
    status: "new",
    avatarBg: "#f59e0b",
    initials: "SN",
    name: "Sofia Nunes",
    detail: "Consulta inicial · Viernes 11:00 AM",
    badge: "Nueva",
    time: "hace 2 h",
  },
]

export function LiveFeedSection() {
  return (
    <section className="stream-section">
      <div className="stream-inner">
        <div className="stream-left">
          <div className="eyebrow">En tiempo real</div>
          <h2>
            Cada reserva,
            <br />
            en tu bolsillo
          </h2>
          <p>
            Cuando un cliente confirma una cita desde tu página, tu equipo recibe la notificación al instante.
          </p>
          <ul className="stream-feature-list">
            {FEATURES.map((feature) => (
              <li key={feature}>
                <Check className="h-[14px] w-[14px] mt-0.5 flex-shrink-0" stroke="#22c55e" strokeWidth={2.5} />
                {feature}
              </li>
            ))}
          </ul>
          <Link href="/crear-cuenta" className="stream-cta">
            Ver el dashboard
            <ArrowRight className="h-[13px] w-[13px]" strokeWidth={2.5} />
          </Link>
        </div>

        <div>
          <div className="feed-header">
            <div className="live-dot" />
            Actividad de hoy
          </div>
          {BOOKINGS.map((booking, i) => (
            <motion.div
              key={booking.id}
              className={`booking-item ${booking.status}`}
              initial={{ opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.16 }}
            >
              <div className="bi-avi" style={{ background: booking.avatarBg }}>
                {booking.initials}
              </div>
              <div className="bi-info">
                <div className="bi-name">{booking.name}</div>
                <div className="bi-detail">{booking.detail}</div>
              </div>
              <div className="bi-right">
                <div className={`bi-badge ${booking.status}`}>{booking.badge}</div>
                <div className="bi-time">{booking.time}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .stream-section {
          background: linear-gradient(180deg, #0d1425 0%, #0a0d1a 100%);
          padding: 80px 44px;
          position: relative;
          overflow: hidden;
        }
        .stream-section::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 50% 60% at 75% 40%, rgba(59, 130, 246, 0.07), transparent 60%);
          pointer-events: none;
        }
        .stream-inner {
          position: relative;
          z-index: 1;
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 72px;
          align-items: center;
        }
        .stream-left .eyebrow {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #60a5fa;
          margin-bottom: 12px;
        }
        .stream-left h2 {
          font-size: 2rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.04em;
          line-height: 1.1;
          margin-bottom: 14px;
        }
        .stream-left p {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.7;
          margin-bottom: 8px;
        }
        .stream-feature-list {
          list-style: none;
          margin: 16px 0 28px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .stream-feature-list li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.83rem;
          color: rgba(255, 255, 255, 0.5);
        }
        .stream-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.12);
          cursor: pointer;
          padding: 11px 22px;
          border-radius: 8px;
          font-size: 0.86rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.2s;
        }
        .stream-cta:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        .feed-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          font-size: 0.7rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          animation: liveDotPulse 2s infinite;
        }
        @keyframes liveDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
        .booking-item {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 13px 16px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-left: 3px solid transparent;
        }
        .booking-item.new { border-left-color: #22c55e; }
        .booking-item.conf { border-left-color: #3b82f6; }
        .booking-item.remind { border-left-color: #f59e0b; }
        .bi-avi {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 800;
          color: #fff;
        }
        .bi-info { flex: 1; }
        .bi-name { font-size: 0.82rem; font-weight: 600; color: rgba(255, 255, 255, 0.82); }
        .bi-detail { font-size: 0.72rem; color: rgba(255, 255, 255, 0.35); margin-top: 2px; }
        .bi-right { text-align: right; }
        .bi-badge {
          display: inline-block;
          font-size: 0.63rem;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 100px;
          margin-bottom: 3px;
        }
        .bi-badge.new { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
        .bi-badge.conf { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .bi-badge.remind { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .bi-time { font-size: 0.68rem; color: rgba(255, 255, 255, 0.2); }
      `}</style>
    </section>
  )
}
