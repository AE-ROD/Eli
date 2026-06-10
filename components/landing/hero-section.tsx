"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  Sparkles,
  Star,
  Calendar,
  Clock,
  Check,
  Signal,
  Wifi,
  BatteryFull,
} from "lucide-react"
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
    <section className="hero">
      <div className="hero-glow glow-1" />
      <div className="hero-glow glow-2" />
      <div className="hero-glow glow-3" />
      <div className="hero-grid" />

      <div className="hero-inner">
        <div className="hero-left">

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium mb-8"
            style={{
              background: 'oklch(0.76 0.155 72 / 0.08)',
              borderColor: 'oklch(0.76 0.155 72 / 0.25)',
              color: 'oklch(0.52 0.14 72)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: 'oklch(0.65 0.155 72)' }} />
            3 días gratis · Sin tarjeta de crédito
          </motion.div>

          {/* Título */}
          <motion.h1
            className="text-4xl sm:text-5xl lg:text-[3.1rem] font-bold tracking-[-0.045em] text-foreground text-balance leading-[1.07]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            Simplifica tu agenda,{" "}
            <span className="relative">
              <span className="font-display italic font-normal text-primary">enfócate en tu talento</span>
              <motion.span
                className="absolute -bottom-2 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/0 via-primary/45 to-primary/0 rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: 0.55 }}
              />
            </span>
          </motion.h1>

          {/* Subtítulo con texto rotativo */}
          <motion.div
            className="mt-8 text-lg sm:text-xl text-muted-foreground leading-relaxed"
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
            className="mt-10 flex flex-col sm:flex-row gap-3 justify-start"
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

          {/* Social proof */}
          <motion.div
            className="mt-10 flex flex-wrap items-center justify-start gap-3"
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

          {/* Features — texto inline elegante */}
          <motion.div
            className="mt-8 flex items-center justify-start gap-0 flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.42 }}
          >
            {["Reservas 24/7", "Gestión de equipo", "Chat integrado", "Recordatorios"].map((item, i) => (
              <span key={item} className="flex items-center gap-0">
                {i > 0 && <span className="mx-3 w-[3px] h-[3px] rounded-full bg-muted-foreground/30 inline-block" />}
                <span className="text-xs text-muted-foreground/55 uppercase tracking-[0.16em] font-medium">{item}</span>
              </span>
            ))}
          </motion.div>

        </div>

        {/* Diagonal duo: dashboard browser card + booking page phone */}
        <div className="hero-right">
          <div className="browser-card">
            <div className="browser-bar">
              <div className="b-dots">
                <span style={{ background: "#ff5f56" }} />
                <span style={{ background: "#ffbd2e" }} />
                <span style={{ background: "#27c93f" }} />
              </div>
              <div className="b-url">app.useeli.com/dashboard</div>
            </div>
            <div className="b-body">
              <div className="dash-kpis">
                <div className="kpi">
                  <div className="kpi-val">8</div>
                  <div className="kpi-label">Citas hoy</div>
                </div>
                <div className="kpi">
                  <div className="kpi-val">$2.8k</div>
                  <div className="kpi-label">Este mes</div>
                </div>
                <div className="kpi">
                  <div className="kpi-val">91%</div>
                  <div className="kpi-label">Ocupación</div>
                </div>
                <div className="kpi">
                  <div className="kpi-val">34</div>
                  <div className="kpi-label">Clientes</div>
                </div>
              </div>
              <div className="mini-chart">
                <div className="chart-title">Reservas esta semana</div>
                <div className="chart-bars">
                  <div className="bar" style={{ height: "40%", background: "rgba(59,130,246,0.35)" }} />
                  <div className="bar" style={{ height: "65%", background: "rgba(59,130,246,0.35)" }} />
                  <div className="bar" style={{ height: "50%", background: "rgba(59,130,246,0.35)" }} />
                  <div className="bar" style={{ height: "80%", background: "rgba(59,130,246,0.35)" }} />
                  <div className="bar" style={{ height: "100%", background: "#3b82f6" }} />
                  <div className="bar" style={{ height: "70%", background: "rgba(59,130,246,0.35)" }} />
                  <div className="bar" style={{ height: "45%", background: "rgba(59,130,246,0.35)" }} />
                </div>
              </div>
              <div className="upcoming">
                <div className="apt-row">
                  <div className="apt-avi" style={{ background: "#3b82f6" }}>MG</div>
                  <div className="apt-info">
                    <div className="apt-name">Mario García</div>
                    <div className="apt-detail">Consulta inicial · 10:00 AM</div>
                  </div>
                  <div className="apt-badge c">Confirmada</div>
                </div>
                <div className="apt-row">
                  <div className="apt-avi" style={{ background: "#8b5cf6" }}>AL</div>
                  <div className="apt-info">
                    <div className="apt-name">Ana López</div>
                    <div className="apt-detail">Sesión estándar · 11:30 AM</div>
                  </div>
                  <div className="apt-badge p">Pendiente</div>
                </div>
              </div>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="phone-shell">
              <div className="phone-island" />
              <div className="phone-status">
                <span className="time">9:41</span>
                <div className="icons">
                  <Signal className="h-3.5 w-3.5" stroke="#111" strokeWidth={2} />
                  <Wifi className="h-3.5 w-3.5" stroke="#111" strokeWidth={2} />
                  <BatteryFull className="h-4 w-4" stroke="#111" strokeWidth={2} />
                </div>
              </div>
              <div className="bp">
                <div className="bp-header">
                  <div className="bp-biz">Mi Negocio</div>
                  <div className="bp-locale">
                    <span className="a">ES</span>
                    <span className="i">EN</span>
                    <span className="i">PT</span>
                  </div>
                </div>
                <div className="bp-steps">
                  <div className="bp-step">
                    <div className="bp-dot act">1</div>
                    <div className="bp-slabel act">Servicio</div>
                  </div>
                  <div className="bp-conn" />
                  <div className="bp-step">
                    <div className="bp-dot idl">2</div>
                    <div className="bp-slabel">Fecha</div>
                  </div>
                  <div className="bp-conn" />
                  <div className="bp-step">
                    <div className="bp-dot idl">3</div>
                    <div className="bp-slabel">Datos</div>
                  </div>
                </div>
                <div className="bp-content">
                  <div className="bp-stitle">Elige un servicio</div>
                  <div className="bp-svc sel">
                    <div className="bp-svc-ico">
                      <Calendar className="h-5 w-5" stroke="#fff" strokeWidth={2} />
                    </div>
                    <div className="bp-svc-body">
                      <div className="bp-svc-name">Consulta inicial</div>
                      <div className="bp-svc-meta">30 min</div>
                    </div>
                    <div className="bp-svc-price">$25</div>
                  </div>
                  <div className="bp-svc">
                    <div className="bp-svc-ico">
                      <Clock className="h-5 w-5" stroke="#9ca3af" strokeWidth={2} />
                    </div>
                    <div className="bp-svc-body">
                      <div className="bp-svc-name">Sesión estándar</div>
                      <div className="bp-svc-meta">60 min</div>
                    </div>
                    <div className="bp-svc-price">$45</div>
                  </div>
                  <div className="bp-svc">
                    <div className="bp-svc-ico">
                      <Star className="h-5 w-5" stroke="#9ca3af" strokeWidth={2} />
                    </div>
                    <div className="bp-svc-body">
                      <div className="bp-svc-name">Servicio premium</div>
                      <div className="bp-svc-meta">90 min</div>
                    </div>
                    <div className="bp-svc-price">$80</div>
                  </div>
                  <button type="button" className="bp-cta">
                    Continuar
                    <ArrowRight className="h-4 w-4" stroke="#fff" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="phone-home" />
              </div>
            </div>

            <div className="notif-a">
              <div className="n-ico">
                <Check className="h-4 w-4" stroke="#16a34a" strokeWidth={3} />
              </div>
              <div className="n-txt">
                <div className="nt">Nueva reserva</div>
                <div className="ns">Carlos R. · Sesión estándar · 3:00 PM</div>
              </div>
            </div>

            <div className="notif-b">
              <div className="n2-dot" />
              <div className="n2-txt">
                <strong>Recordatorio enviado</strong>
                Ana L. · mañana 10:00 AM
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Línea de gradiente animada */}
      <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden opacity-70 z-[2]">
        <motion.div
          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
        />
      </div>

      <style jsx>{`
        .hero {
          position: relative;
          overflow: hidden;
          min-height: 100vh;
          display: flex;
          align-items: center;
          padding: 64px 44px;
          background: linear-gradient(180deg, #07070d 0%, #07070d 70%, #0b0f1e 100%);
        }
        .hero-glow {
          position: absolute;
          pointer-events: none;
          border-radius: 50%;
          filter: blur(80px);
        }
        .glow-1 { width: 500px; height: 400px; top: -80px; right: -60px; background: rgba(59, 130, 246, 0.12); }
        .glow-2 { width: 350px; height: 300px; bottom: 0; left: -80px; background: rgba(124, 58, 237, 0.08); }
        .glow-3 { width: 280px; height: 280px; top: 40%; right: 30%; background: rgba(16, 185, 129, 0.05); }
        .hero-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(ellipse 75% 65% at 65% 40%, black 30%, transparent 100%);
        }
        .hero-inner {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 580px;
          gap: 48px;
          align-items: center;
        }
        .hero-right {
          position: relative;
          height: 720px;
        }

        /* Browser card (dashboard preview) */
        .browser-card {
          position: absolute;
          top: 30px;
          left: -50px;
          width: 480px;
          height: 340px;
          background: #0f1929;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          overflow: hidden;
          transform: rotate(-7deg);
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04);
          z-index: 1;
          animation: browserSlideIn 1s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
        }
        @keyframes browserSlideIn {
          from { opacity: 0; transform: rotate(-7deg) translateX(-60px); }
          to { opacity: 1; transform: rotate(-7deg) translateX(0); }
        }
        .browser-bar {
          background: #1a2435;
          padding: 9px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .b-dots { display: flex; gap: 5px; }
        .b-dots span { width: 8px; height: 8px; border-radius: 50%; display: block; }
        .b-url {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 3px 10px;
          font-size: 0.57rem;
          color: rgba(255, 255, 255, 0.25);
          font-family: 'SF Mono', monospace;
        }
        .b-body { padding: 14px; }
        .dash-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
        .kpi {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 10px;
        }
        .kpi-val { font-size: 1rem; font-weight: 800; color: #fff; line-height: 1; }
        .kpi-label { font-size: 0.52rem; color: rgba(255, 255, 255, 0.25); margin-top: 3px; }
        .mini-chart {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 10px 12px 8px;
          margin-bottom: 10px;
        }
        .chart-title { font-size: 0.52rem; color: rgba(255, 255, 255, 0.25); margin-bottom: 8px; }
        .chart-bars { display: flex; align-items: flex-end; gap: 4px; height: 48px; }
        .bar { flex: 1; border-radius: 2px 2px 0 0; }
        .upcoming { display: flex; flex-direction: column; gap: 5px; }
        .apt-row {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          padding: 6px 8px;
        }
        .apt-avi {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.5rem;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .apt-info { flex: 1; }
        .apt-name { font-size: 0.58rem; font-weight: 600; color: rgba(255, 255, 255, 0.7); }
        .apt-detail { font-size: 0.5rem; color: rgba(255, 255, 255, 0.28); margin-top: 1px; }
        .apt-badge { font-size: 0.48rem; font-weight: 700; padding: 2px 6px; border-radius: 100px; }
        .apt-badge.c { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
        .apt-badge.p { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

        /* Phone (booking page preview) */
        .phone-wrap {
          position: absolute;
          right: 0;
          bottom: 0;
          z-index: 10;
          width: 380px;
          transform: rotate(6deg);
          animation: phoneRise 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
        }
        @keyframes phoneRise {
          from { opacity: 0; transform: rotate(6deg) translateY(90px); }
          to { opacity: 1; transform: rotate(6deg) translateY(0); }
        }
        .phone-shell {
          position: relative;
          background: #0c0c14;
          border-radius: 56px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.05),
            0 50px 100px rgba(0, 0, 0, 0.65),
            0 0 90px rgba(59, 130, 246, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .phone-island {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          width: 110px;
          height: 32px;
          border-radius: 20px;
          background: #000;
          z-index: 30;
        }
        .phone-status {
          background: #fff;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
        }
        .phone-status .time { font-size: 1rem; font-weight: 700; color: #111; }
        .phone-status .icons { display: flex; gap: 4px; align-items: center; }

        .bp { background: #f7f8fb; }
        .bp-header {
          background: #fff;
          padding: 19px 26px 15px;
          border-bottom: 1px solid #e8eaed;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .bp-biz { font-size: 1.16rem; font-weight: 800; color: #1a2233; letter-spacing: -0.02em; }
        .bp-locale { display: flex; gap: 5px; }
        .bp-locale span { font-size: 0.88rem; font-weight: 700; padding: 4px 12px; border-radius: 100px; letter-spacing: 0.04em; }
        .bp-locale span.a { background: #1e3d6e; color: #fff; }
        .bp-locale span.i { border: 1px solid #ddd; color: #aaa; }
        .bp-steps {
          background: #fff;
          padding: 15px 26px 12px;
          border-bottom: 1px solid #e8eaed;
          display: flex;
          align-items: center;
        }
        .bp-step { flex: 1; display: flex; flex-direction: column; align-items: center; }
        .bp-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
        }
        .bp-dot.act { background: #1e3d6e; color: #fff; }
        .bp-dot.idl { background: #e8eaed; color: #9ca3af; }
        .bp-slabel { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; }
        .bp-slabel.act { color: #1e3d6e; }
        .bp-conn { flex: 0 0 38px; height: 1px; background: #e8eaed; align-self: flex-start; margin-top: 15px; }
        .bp-content { padding: 22px 24px 11px; }
        .bp-stitle { font-size: 0.97rem; font-weight: 700; color: #374151; margin-bottom: 16px; }
        .bp-svc {
          background: #fff;
          border: 1.5px solid #e2e6ed;
          border-radius: 15px;
          padding: 16px 19px;
          margin-bottom: 11px;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .bp-svc.sel { border-color: #1e3d6e; background: #f0f5ff; }
        .bp-svc-ico {
          width: 43px;
          height: 43px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .bp-svc.sel .bp-svc-ico { background: #1e3d6e; }
        .bp-svc:not(.sel) .bp-svc-ico { background: #f0f2f7; }
        .bp-svc-body { flex: 1; }
        .bp-svc-name { font-size: 1.05rem; font-weight: 700; color: #1a2233; }
        .bp-svc-meta { font-size: 0.89rem; color: #6b7280; margin-top: 1px; }
        .bp-svc-price { font-size: 1.08rem; font-weight: 700; color: #1e3d6e; }
        .bp-cta {
          background: #1e3d6e;
          color: #fff;
          border: none;
          border-radius: 15px;
          padding: 18px;
          width: 100%;
          font-size: 1.05rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          margin-top: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }
        .phone-home {
          background: #f7f8fb;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .phone-home::after {
          content: '';
          width: 148px;
          height: 5px;
          border-radius: 3px;
          background: #d1d5db;
        }

        /* Floating notifications */
        .notif-a {
          position: absolute;
          top: 18px;
          right: -90px;
          z-index: 20;
          min-width: 200px;
          background: rgba(255, 255, 255, 0.97);
          border-radius: 13px;
          padding: 10px 14px;
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.06);
          display: flex;
          align-items: center;
          gap: 10px;
          animation: floatA 4s ease-in-out infinite alternate;
        }
        @keyframes floatA {
          0% { transform: translateY(0) rotate(-6.5deg); }
          100% { transform: translateY(-8px) rotate(-5.5deg); }
        }
        .n-ico {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          flex-shrink: 0;
          background: #dcfce7;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .n-txt .nt { font-size: 0.66rem; font-weight: 700; color: #111; line-height: 1.3; }
        .n-txt .ns { font-size: 0.61rem; color: #6b7280; margin-top: 1px; }

        .notif-b {
          position: absolute;
          bottom: 60px;
          left: -90px;
          z-index: 20;
          min-width: 185px;
          background: rgba(255, 255, 255, 0.97);
          border-radius: 11px;
          padding: 10px 14px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.06);
          display: flex;
          align-items: center;
          gap: 8px;
          animation: floatB 3.5s ease-in-out infinite alternate;
        }
        @keyframes floatB {
          0% { transform: translateY(0) rotate(-6deg); }
          100% { transform: translateY(7px) rotate(-6deg); }
        }
        .n2-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
          animation: notifPulse 2s infinite;
        }
        @keyframes notifPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
        .n2-txt { font-size: 0.63rem; color: #6b7280; }
        .n2-txt strong { color: #111; display: block; font-size: 0.66rem; margin-bottom: 2px; }
      `}</style>
    </section>
  )
}
