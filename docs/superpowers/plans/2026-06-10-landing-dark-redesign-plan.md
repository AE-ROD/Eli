# Landing Dark/Navy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public landing page's light/blob visual identity with the approved dark/navy "diagonal duo" identity from `docs/superpowers/specs/2026-06-10-landing-dark-redesign-design.md`, scoped entirely to `app/page.tsx` and `components/landing/*` via a new `.eli-landing-dark` CSS scope.

**Architecture:** A new `.eli-landing-dark` class (sibling to `:root`/`.dark` in `app/globals.css`) overrides the shadcn CSS custom properties (`--background`, `--foreground`, `--card`, `--primary`, etc.) with the dark/navy palette. `app/page.tsx` wraps Header + `<main>` in this class (Footer stays outside it, using the existing root theme, which already renders as a dark-navy footer). Each section component is ported from `.superpowers/brainstorm/79282-1781021156/content/landing-v2.html` using `<style jsx>` (styled-jsx) for layout/animation CSS that can't be expressed with Tailwind utilities, combined with Tailwind utilities + CSS variables for anything that already adapts via the new scope. Two new sections (`WhyEliSection`, `LiveFeedSection`) replace `WhatIsSection`/`TargetSection`, which are deleted. `HeroSection` and `HowItWorksSection` are fully rewritten. `PreciosSection`, `ContactSection`, `Header`, `EliLoader` get small palette/contrast fixes. `SectionDivider` and the old fixed blob background are removed.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS v4 (CSS-variable theme via `@theme inline`), framer-motion, lucide-react, styled-jsx (`<style jsx>`).

---

## Task 1: Add `.eli-landing-dark` CSS variable scope

**Files:**
- Modify: `app/globals.css:76-78`

- [ ] **Step 1: Insert the new CSS scope after `.dark` and before `@theme inline`**

In `app/globals.css`, find the end of the `.dark { ... }` block (line 76, the closing `}`) immediately followed by a blank line and `@theme inline {` (line 78). Insert the new block between them:

```css
  --sidebar-ring: oklch(0.439 0 0);
}

/* Identidad dark/navy del landing público (app/page.tsx) */
.eli-landing-dark {
  --background: #07070d;
  --foreground: oklch(0.98 0 0);
  --card: #0f1929;
  --card-foreground: oklch(0.98 0 0);
  --popover: #0f1929;
  --popover-foreground: oklch(0.98 0 0);
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --secondary: rgba(255, 255, 255, 0.06);
  --secondary-foreground: #ffffff;
  --muted: rgba(255, 255, 255, 0.04);
  --muted-foreground: rgba(255, 255, 255, 0.4);
  --accent: rgba(59, 130, 246, 0.1);
  --accent-foreground: #60a5fa;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.08);
  --ring: #3b82f6;
}

@theme inline {
```

- [ ] **Step 2: Commit**

This change is inert until `.eli-landing-dark` is applied in Task 10 — there's nothing to visually verify yet.

```bash
git add app/globals.css
git commit -m "feat: add eli-landing-dark CSS variable scope for dark landing redesign"
```

---

## Task 2: Create `components/landing/why-eli-section.tsx`

**Files:**
- Create: `components/landing/why-eli-section.tsx`

- [ ] **Step 1: Create the file**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `why-eli-section.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/landing/why-eli-section.tsx
git commit -m "feat: add WhyEliSection (dark redesign 'Por qué Eli' strip)"
```

---

## Task 3: Create `components/landing/live-feed-section.tsx`

**Files:**
- Create: `components/landing/live-feed-section.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client"

import { motion } from "framer-motion"
import { ArrowRight, Check } from "lucide-react"

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
          <button type="button" className="stream-cta">
            Ver el dashboard
            <ArrowRight className="h-[13px] w-[13px]" strokeWidth={2.5} />
          </button>
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `live-feed-section.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/landing/live-feed-section.tsx
git commit -m "feat: add LiveFeedSection (dark redesign 'En tiempo real' feed)"
```

---

## Task 4: Rewrite `components/landing/hero-section.tsx`

**Files:**
- Modify: `components/landing/hero-section.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `hero-section.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/landing/hero-section.tsx
git commit -m "feat: redesign HeroSection with diagonal duo (browser card + phone)"
```

---

## Task 5: Rewrite `components/landing/how-it-works-section.tsx`

**Files:**
- Modify: `components/landing/how-it-works-section.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `how-it-works-section.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/landing/how-it-works-section.tsx
git commit -m "feat: rewrite HowItWorksSection as 3-step split panel + integrations strip"
```

---

## Task 6: Restyle `components/landing/precios-section.tsx`

**Files:**
- Modify: `components/landing/precios-section.tsx:10-13,25,66,148,206`

- [ ] **Step 1: Update `VALOR_ELI` color classes (lines 10-13)**

```ts
  { icono: Clock,  titulo: "2–4 horas/semana",      descripcion: "Tiempo que recuperas al dejar de coordinar citas por WhatsApp", color: "bg-blue-500/10 text-blue-400" },
  { icono: Zap,    titulo: "Cero doble-reservas",   descripcion: "El sistema bloquea horarios automáticamente en tiempo real",    color: "bg-amber-500/10 text-amber-400" },
  { icono: Star,   titulo: "Clientes que no faltan", descripcion: "Recordatorios automáticos por email 24h antes de cada cita",   color: "bg-rose-500/10 text-rose-400" },
  { icono: Users,  titulo: "Página profesional",    descripcion: "Tus clientes reservan solos, sin llamadas ni mensajes",         color: "bg-violet-500/10 text-violet-400" },
```

Use Edit with `old_string`:
```
  { icono: Clock,  titulo: "2–4 horas/semana",      descripcion: "Tiempo que recuperas al dejar de coordinar citas por WhatsApp", color: "bg-blue-50 text-blue-600" },
  { icono: Zap,    titulo: "Cero doble-reservas",   descripcion: "El sistema bloquea horarios automáticamente en tiempo real",    color: "bg-amber-50 text-amber-600" },
  { icono: Star,   titulo: "Clientes que no faltan", descripcion: "Recordatorios automáticos por email 24h antes de cada cita",   color: "bg-rose-50 text-rose-600" },
  { icono: Users,  titulo: "Página profesional",    descripcion: "Tus clientes reservan solos, sin llamadas ni mensajes",         color: "bg-violet-50 text-violet-600" },
```

- [ ] **Step 2: Update `PLANES[0].colorIcono` (Free plan, line 25)**

Edit `old_string`:
```
    colorIcono: "bg-blue-100 text-blue-600",
```
`new_string`:
```
    colorIcono: "bg-blue-500/10 text-blue-400",
```

- [ ] **Step 3: Update `PLANES[2].colorIcono` (Team plan, line 66)**

Edit `old_string`:
```
    colorIcono: "bg-purple-100 text-purple-600",
```
`new_string`:
```
    colorIcono: "bg-purple-500/10 text-purple-400",
```

- [ ] **Step 4: Update the "Ahorra hasta 32%" badge (line 148)**

Edit `old_string`:
```
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
              Ahorra hasta 32%
            </span>
```
`new_string`:
```
            <span className="text-xs bg-green-500/15 text-green-400 font-semibold px-2 py-0.5 rounded-full">
              Ahorra hasta 32%
            </span>
```

- [ ] **Step 5: Update the per-plan "ahorro" badge (line 206)**

Edit `old_string`:
```
                              className="mb-1 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full"
```
`new_string`:
```
                              className="mb-1 text-xs bg-green-500/15 text-green-400 font-semibold px-2 py-0.5 rounded-full"
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `precios-section.tsx`

- [ ] **Step 7: Commit**

```bash
git add components/landing/precios-section.tsx
git commit -m "style: adapt PreciosSection accent colors to dark landing palette"
```

---

## Task 7: Restyle `components/landing/contact-section.tsx`

**Files:**
- Modify: `components/landing/contact-section.tsx:15,22,29`

- [ ] **Step 1: Update `contactInfo[0]` (Email, line 15)**

Edit `old_string`:
```
    color: "bg-blue-50 text-blue-600",
```
`new_string`:
```
    color: "bg-blue-500/10 text-blue-400",
```

- [ ] **Step 2: Update `contactInfo[1]` (Ubicación, line 22)**

Edit `old_string`:
```
    color: "bg-emerald-50 text-emerald-600",
```
`new_string`:
```
    color: "bg-emerald-500/10 text-emerald-400",
```

- [ ] **Step 3: Update `contactInfo[2]` (Horario, line 29)**

Edit `old_string`:
```
    color: "bg-violet-50 text-violet-600",
```
`new_string`:
```
    color: "bg-violet-500/10 text-violet-400",
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `contact-section.tsx`

- [ ] **Step 5: Commit**

```bash
git add components/landing/contact-section.tsx
git commit -m "style: adapt ContactSection accent colors to dark landing palette"
```

---

## Task 8: Restyle `components/landing/header.tsx`

**Files:**
- Modify: `components/landing/header.tsx:10-16,31`

- [ ] **Step 1: Remove the dead "Qué es Eli" / "Para quién" nav links**

Edit `old_string`:
```ts
const navLinks = [
  { href: "#que-es", label: "Qué es Eli" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#para-quien", label: "Para quién" },
  { href: "#precios", label: "Precios" },
  { href: "#contacto", label: "Contacto" },
]
```
`new_string`:
```ts
const navLinks = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#precios", label: "Precios" },
  { href: "#contacto", label: "Contacto" },
]
```

- [ ] **Step 2: Force the Eli logo to render in white**

The new `.eli-landing-dark` scope makes both `EliLogo` variants (`inverted` and default) hard to read; pass an explicit white text color.

Edit `old_string`:
```tsx
          <Link href="/" className="flex items-center">
            <EliLogo size="md" />
          </Link>
```
`new_string`:
```tsx
          <Link href="/" className="flex items-center">
            <EliLogo size="md" className="text-white" />
          </Link>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `header.tsx`

- [ ] **Step 4: Commit**

```bash
git add components/landing/header.tsx
git commit -m "fix: drop dead nav anchors and force white logo for dark landing header"
```

---

## Task 9: Restyle `components/landing/loader.tsx`

**Files:**
- Modify: `components/landing/loader.tsx:9,20`

- [ ] **Step 1: Apply the dark scope to the loader overlay so it doesn't flash light before the dark page mounts**

Edit `old_string`:
```tsx
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
```
`new_string`:
```tsx
    <motion.div
      className="eli-landing-dark fixed inset-0 z-50 flex items-center justify-center bg-background"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
```

- [ ] **Step 2: Force the Eli logo to render in white**

Edit `old_string`:
```tsx
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <EliLogo size="xl" />
        </motion.div>
```
`new_string`:
```tsx
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <EliLogo size="xl" className="text-white" />
        </motion.div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `loader.tsx`

- [ ] **Step 4: Commit**

```bash
git add components/landing/loader.tsx
git commit -m "fix: render EliLoader in dark scope to avoid light flash before landing mounts"
```

---

## Task 10: Restructure `app/page.tsx`

**Files:**
- Modify: `app/page.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

This removes `SectionDivider`, the fixed blob/grid background, `WhatIsSection`/`TargetSection`, and applies `.eli-landing-dark` to Header + `<main>` (Footer stays outside the scope — it already renders as a dark-navy footer via `bg-foreground text-background` on the root theme).

```tsx
"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion, useScroll } from "framer-motion"
import { EliLoader } from "@/components/landing/loader"
import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { WhyEliSection } from "@/components/landing/why-eli-section"
import { LiveFeedSection } from "@/components/landing/live-feed-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { PreciosSection } from "@/components/landing/precios-section"
import { ContactSection } from "@/components/landing/contact-section"
import { Footer } from "@/components/landing/footer"

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const { scrollYProgress } = useScroll()

  useEffect(() => {
    const alreadyLoaded = sessionStorage.getItem("eli_loaded")
    if (alreadyLoaded) {
      setIsLoading(false)
      return
    }
    const timer = setTimeout(() => {
      setIsLoading(false)
      sessionStorage.setItem("eli_loaded", "1")
    }, 1200)

    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && <EliLoader key="loader" />}
      </AnimatePresence>

      <AnimatePresence>
        {!isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="eli-landing-dark">
              {/* Scroll progress */}
              <div className="fixed left-5 top-1/2 -translate-y-1/2 w-[1.5px] h-32 rounded-full bg-border/30 z-50 hidden lg:block">
                <motion.div
                  className="w-full rounded-full bg-primary/70 origin-top"
                  style={{ scaleY: scrollYProgress, height: "100%" }}
                />
              </div>

              <Header />
              <main>
                <HeroSection />
                <WhyEliSection />
                <LiveFeedSection />
                <HowItWorksSection />
                <PreciosSection />
                <ContactSection />
              </main>
            </div>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors about `WhatIsSection`/`TargetSection` being unused imports elsewhere are NOT expected here (this file no longer imports them). Any remaining errors should only point at `what-is-section.tsx`/`target-section.tsx` themselves if they have issues — those files are deleted in Task 11.

- [ ] **Step 3: Smoke-test the dev server**

Run: `npm run dev` (in the background)

```bash
npm run dev > /tmp/eli-dev.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

Expected: `200`

Then check the log for compile errors:

```bash
grep -i "error" /tmp/eli-dev.log || echo "no errors"
```

Expected: `no errors`

- [ ] **Step 4: Visual check**

Open `http://localhost:3000` in a browser and confirm, against `docs/superpowers/specs/2026-06-10-landing-dark-redesign-design.md`:
- The whole page (Header through Contacto) renders on a dark `#07070d`/navy background.
- Hero shows the diagonal browser-card + phone mockup with floating notifications.
- "Por qué Eli" (4 cards) and "En tiempo real" (feed) sections appear between Hero and "Cómo funciona".
- "Cómo funciona" shows the 3-step split panel + integrations pill strip.
- Precios and Contacto sections use dark-compatible accent colors (no light/white boxes).
- Footer remains a dark-navy bar at the bottom (unchanged).
- No `SectionDivider` lines between sections.

Stop the dev server when done:

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: rewire landing page sections for dark redesign, drop dividers and blob bg"
```

---

## Task 11: Fix dead footer anchor link

**Files:**
- Modify: `components/landing/footer.tsx:8`

`WhatIsSection` (deleted in Task 12) had `id="que-es"`, which `Footer`'s "Características" link points to. `WhyEliSection` (Task 2) now has `id="por-que-eli"` and is the closest replacement section — repoint the footer link there so it doesn't point at a non-existent anchor.

- [ ] **Step 1: Update the footer link**

Edit `old_string`:
```tsx
    { label: "Características", href: "#que-es" },
```
`new_string`:
```tsx
    { label: "Características", href: "#por-que-eli" },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `footer.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/landing/footer.tsx
git commit -m "fix: repoint footer 'Características' link to #por-que-eli"
```

---

## Task 12: Delete unused section components

**Files:**
- Delete: `components/landing/what-is-section.tsx`
- Delete: `components/landing/target-section.tsx`

After Task 10, neither file is imported anywhere (`app/page.tsx` was the only consumer of `WhatIsSection`/`TargetSection`).

- [ ] **Step 1: Delete the files**

```bash
git rm components/landing/what-is-section.tsx components/landing/target-section.tsx
```

- [ ] **Step 2: Confirm no remaining references**

```bash
grep -rn "WhatIsSection\|TargetSection\|what-is-section\|target-section" app components --include="*.tsx" --include="*.ts"
```

Expected: no output

- [ ] **Step 3: Final type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove unused WhatIsSection and TargetSection from landing"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-10-landing-dark-redesign-design.md`):
- Section 3 (palette/shared tokens) → Task 1 (`.eli-landing-dark` vars), reused via `var(--primary)`, `var(--background)`, etc. across all Tailwind-based components. ✅
- Section 4 (Hero diagonal duo, Dynamic Island, notifications) → Task 4. ✅
- Section 5 (Cómo funciona split panel + integrations) → Task 5. ✅
- Section 6 (Por qué Eli / En tiempo real, new sections) → Tasks 2 & 3. ✅
- Section 7 (mapping table: Hero, Por qué Eli, En tiempo real, Cómo funciona, Precios, Contacto, Nav, delete WhatIs/Target) → Tasks 4, 2, 3, 5, 6, 7, 8, 12. ✅
- Section 8 (out of scope: no media queries, no copy changes beyond removing Qué es Eli/Para quién, no Precios/Contact mockup, no DESIGN.md/product changes) → respected: no `@media` anywhere in new CSS; Precios/Contact are palette-only edits; dashboard/booking pages untouched. ✅
- Footer/EliLoader/Header fixes (loader white-flash, dead nav anchors, logo contrast, dead footer anchor) → Tasks 8, 9, 11 — small additions needed to avoid regressions introduced by the redesign, kept minimal (no layout/copy changes).

**2. Placeholder scan:** No "TBD"/"TODO"/"similar to Task N" — every task has complete file contents or exact `old_string`/`new_string` edits.

**3. Type/prop consistency:**
- `WhyEliSection`/`LiveFeedSection`/`HowItWorksSection` are named-exported function components with no props, matching how `HeroSection`, `PreciosSection`, etc. are imported/used in `app/page.tsx` (Task 10).
- `id="por-que-eli"` (Task 2) matches the footer link target set in Task 11.
- `id="como-funciona"` is preserved on the new `HowItWorksSection` (Task 5), matching `Header`'s nav link (Task 8) and `Footer`'s "Cómo funciona" link (unchanged).
- `AccentStyle` CSS custom-property keys (`--accent`, `--accent-bg`, `--accent-border`) used in the `style` prop (Task 5) match the `var(--accent)`/`var(--accent-bg)`/`var(--accent-border)` references in `.how-circle` (same task).
- Lucide icon imports added to `hero-section.tsx` (Task 4: `Calendar`, `Clock`, `Check`, `Signal`, `Wifi`, `BatteryFull`) and `why-eli-section.tsx`/`live-feed-section.tsx` (Task 2/3: `Calendar`, `Globe`, `Phone`, `Users`, `ArrowRight`, `Check`) are all valid `lucide-react` exports.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-10-landing-dark-redesign-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
