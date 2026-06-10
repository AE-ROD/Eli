"use client"

import type { CSSProperties } from "react"
import { motion } from "framer-motion"

type AccentStyle = CSSProperties & {
  "--accent": string
  "--accent-bg": string
  "--accent-border": string
}

const STEPS = [
  {
    number: "1",
    title: "Crea tu negocio",
    description: "Nombre, servicios, precios y horarios en un wizard guiado de 5 minutos.",
    accent: "#60a5fa",
    accentBg: "rgba(59, 130, 246, 0.1)",
    accentBorder: "rgba(59, 130, 246, 0.25)",
  },
  {
    number: "2",
    title: "Comparte tu enlace",
    description: "Una URL única para Instagram, WhatsApp o Google My Business.",
    accent: "#a78bfa",
    accentBg: "rgba(139, 92, 246, 0.1)",
    accentBorder: "rgba(139, 92, 246, 0.25)",
  },
  {
    number: "3",
    title: "Recibe y gestiona",
    description: "Reservas al calendario en tiempo real, confirmación automática.",
    accent: "#4ade80",
    accentBg: "rgba(34, 197, 94, 0.1)",
    accentBorder: "rgba(34, 197, 94, 0.25)",
  },
]

const INTEGRATIONS = [
  { label: "Email (Resend)", color: "#60a5fa" },
  { label: "WhatsApp (Twilio)", color: "#4ade80" },
  { label: "Stripe (pagos)", color: "#a78bfa" },
  { label: "Archivo .ics (calendario)", color: "#fbbf24" },
  { label: "SSL + datos seguros", color: "#22d3ee" },
]

export function HowItWorksSection() {
  return (
    <>
      <section id="como-funciona" className="how-section">
        <div className="sec-inner">
          <div className="sec-eyebrow">Cómo funciona</div>
          <h2 className="sec-h2">Lista en 5 minutos</h2>
          <p className="sec-sub">Sin configuración técnica, sin contratos largos</p>

          <div className="how-wrap">
            <div className="how-list">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.number}
                  className="how-item"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <div
                    className="how-circle"
                    style={{
                      "--accent": step.accent,
                      "--accent-bg": step.accentBg,
                      "--accent-border": step.accentBorder,
                    } as AccentStyle}
                  >
                    {step.number}
                  </div>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="how-visual"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <div className="how-vbar">
                <div className="how-vdot" style={{ background: "#ff5f56" }} />
                <div className="how-vdot" style={{ background: "#ffbd2e" }} />
                <div className="how-vdot" style={{ background: "#27c93f" }} />
                <div className="how-vurl">useeli.com/reservar/barberia-elite</div>
              </div>
              <div className="how-vbody">
                <div className="how-vheader">
                  <div className="how-vavatar" />
                  <div>
                    <div className="how-vname" />
                    <div className="how-vsub" />
                  </div>
                </div>
                <div className="how-vsvc">
                  <div className="how-vsvc-l" />
                  <div className="how-vsvc-p">$350</div>
                </div>
                <div className="how-vsvc">
                  <div className="how-vsvc-l" />
                  <div className="how-vsvc-p">$500</div>
                </div>
                <div className="how-vsvc">
                  <div className="how-vsvc-l" />
                  <div className="how-vsvc-p">$280</div>
                </div>
                <div className="how-vbtn">Reservar ahora</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <div className="integrations">
        <div className="int-inner">
          <motion.div
            className="how-int"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
          >
            <div className="how-int-label">Funciona con:</div>
            {INTEGRATIONS.map((integration) => (
              <div className="how-pill" key={integration.label}>
                <div className="how-pill-dot" style={{ background: integration.color }} />
                {integration.label}
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      <style jsx>{`
        .how-section {
          position: relative;
          background: linear-gradient(180deg, #0a0d1a 0%, #07070d 100%);
          padding: 80px 44px;
          overflow: hidden;
        }
        .how-section::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(124, 58, 237, 0.4) 30%, rgba(59, 130, 246, 0.4) 60%, transparent 100%);
        }
        .sec-inner {
          position: relative;
          max-width: 1120px;
          margin: 0 auto;
        }
        .sec-eyebrow {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #a78bfa;
          margin-bottom: 12px;
        }
        .sec-h2 {
          font-size: 1.85rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.03em;
          margin-bottom: 8px;
        }
        .sec-sub {
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 48px;
        }
        .how-wrap {
          display: grid;
          grid-template-columns: 0.85fr 1.15fr;
          gap: 60px;
          align-items: center;
        }
        .how-list { display: flex; flex-direction: column; gap: 28px; }
        .how-item { display: flex; gap: 18px; align-items: flex-start; }
        .how-circle {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 800;
          color: var(--accent);
          background: var(--accent-bg);
          border: 1px solid var(--accent-border);
        }
        .how-item h3 { font-size: 1.02rem; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .how-item p { font-size: 0.85rem; color: rgba(255, 255, 255, 0.4); line-height: 1.6; }
        .how-visual {
          background: #0f1929;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5), 0 0 60px rgba(59, 130, 246, 0.06);
        }
        .how-vbar {
          background: #1a2435;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .how-vdot { width: 9px; height: 9px; border-radius: 50%; }
        .how-vurl {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 4px 12px;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.3);
          font-family: 'SF Mono', monospace;
        }
        .how-vbody { padding: 28px; }
        .how-vheader { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
        .how-vavatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); }
        .how-vname { width: 120px; height: 12px; border-radius: 4px; background: rgba(255, 255, 255, 0.14); margin-bottom: 8px; }
        .how-vsub { width: 80px; height: 9px; border-radius: 4px; background: rgba(255, 255, 255, 0.07); }
        .how-vsvc {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 10px;
        }
        .how-vsvc-l { width: 140px; height: 11px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); }
        .how-vsvc-p { font-size: 0.95rem; font-weight: 700; color: #a78bfa; }
        .how-vbtn {
          margin-top: 18px;
          text-align: center;
          padding: 14px;
          border-radius: 10px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
        }

        .integrations {
          background: #07070d;
          padding: 48px 44px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .int-inner {
          max-width: 1120px;
          margin: 0 auto;
        }
        .how-int {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 20px 28px;
        }
        .how-int-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.5);
          margin-right: 4px;
        }
        .how-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 100px;
          padding: 7px 16px;
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.65);
        }
        .how-pill-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      `}</style>
    </>
  )
}
