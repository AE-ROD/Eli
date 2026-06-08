"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { User, Mail, Phone, CreditCard, MessageSquare, CheckCircle2, ChevronRight, ChevronLeft, Check, CalendarPlus, MessageCircle, AlertTriangle } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"
import { SelectorServicio, type ServicioPublico } from "./selectorServicio"
import { SelectorFechaHora } from "./selectorFechaHora"
import { t } from "@/lib/i18n/booking"

interface HorarioPublico {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface FormularioReservaProps {
  slug: string
  nombreNegocio: string
  servicios: ServicioPublico[]
  horarios: HorarioPublico[]
  locale?: string
}

type Paso = 1 | 2 | 3

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25 } },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0, transition: { duration: 0.2 } }),
}

function saludo(locale: string): string {
  const h = new Date().getHours()
  if (h < 12) return t(locale, "greeting_morning")
  if (h < 19) return t(locale, "greeting_afternoon")
  return t(locale, "greeting_evening")
}

function buildCalendarUrl(servicio: string, negocio: string, fecha: string, hora: string, duracion: number): string {
  const start = new Date(`${fecha}T${hora}:00`)
  const end = new Date(start.getTime() + duracion * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(".000", "")
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${servicio} — ${negocio}`,
    dates: `${fmt(start)}/${fmt(end)}`,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function buildWhatsAppText(locale: string, servicio: string, negocio: string, fecha: string, hora: string): string {
  const dateLabel = new Intl.DateTimeFormat(
    locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-MX",
    { weekday: "long", day: "numeric", month: "long" }
  ).format(new Date(`${fecha}T12:00:00`))

  const msgs: Record<string, string> = {
    es: `¡Reservé ${servicio} en ${negocio} para el ${dateLabel} a las ${hora}!`,
    en: `I booked ${servicio} at ${negocio} for ${dateLabel} at ${hora}!`,
    pt: `Reservei ${servicio} em ${negocio} para ${dateLabel} às ${hora}!`,
  }
  return encodeURIComponent(msgs[locale] ?? msgs.es)
}

export function FormularioReserva({ slug, nombreNegocio, servicios, horarios, locale = "es" }: FormularioReservaProps) {
  const [paso, setPaso] = useState<Paso>(1)
  const [dir, setDir] = useState(1)
  const [servicioSel, setServicioSel] = useState<ServicioPublico | null>(null)
  const [fecha, setFecha] = useState("")
  const [hora, setHora] = useState("")
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [cedula, setCedula] = useState("")
  const [email, setEmail] = useState("")
  const [telefono, setTelefono] = useState("")
  const [comentarios, setComentarios] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [citaId, setCitaId] = useState<string | null>(null)
  const [slotTakenToast, setSlotTakenToast] = useState(false)
  const [error, setError] = useState("")

  // T-DR2: set html lang attribute for this booking session
  useEffect(() => {
    const intlLocale = locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-MX"
    document.documentElement.lang = intlLocale
    return () => { document.documentElement.lang = "es" }
  }, [locale])

  // Auto-dismiss SLOT_TAKEN toast after 5s
  useEffect(() => {
    if (!slotTakenToast) return
    const timer = setTimeout(() => setSlotTakenToast(false), 5000)
    return () => clearTimeout(timer)
  }, [slotTakenToast])

  const diasDisponibles = horarios.map((h) => h.dayOfWeek)

  const puedeAvanzarPaso1 = !!servicioSel
  const puedeAvanzarPaso2 = !!fecha && !!hora
  const puedeEnviar = !!nombre && !!apellido

  function navPaso(siguiente: Paso) {
    setDir(siguiente > paso ? 1 : -1)
    setPaso(siguiente)
  }

  const confirmar = async () => {
    setEnviando(true)
    setError("")
    try {
      const res = await fetch(`/api/reservar/${slug}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicioId: servicioSel!.id,
          fecha,
          hora,
          nombre,
          apellido,
          cedula: cedula || undefined,
          email: email || undefined,
          telefono: telefono || undefined,
          comentarios: comentarios || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCitaId(data.citaId)
        setConfirmado(true)
      } else if (data.error === "SLOT_TAKEN") {
        // T-DR1: reset to step 2, clear slot, show toast
        setHora("")
        setDir(-1)
        setPaso(2)
        setSlotTakenToast(true)
      } else {
        setError(data.error ?? "Error al confirmar la reserva")
      }
    } finally {
      setEnviando(false)
    }
  }

  const steps = [
    { id: 1, label: t(locale, "step_service") },
    { id: 2, label: t(locale, "step_datetime") },
    { id: 3, label: t(locale, "step_details") },
  ]

  if (confirmado && servicioSel) {
    const calUrl = buildCalendarUrl(servicioSel.name, nombreNegocio, fecha, hora, servicioSel.duration)
    const waText = buildWhatsAppText(locale, servicioSel.name, nombreNegocio, fecha, hora)
    const fechaFormateada = new Intl.DateTimeFormat(
      locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-MX",
      { weekday: "long", day: "numeric", month: "long" }
    ).format(new Date(`${fecha}T12:00:00`))

    return (
      <motion.div
        className="text-center py-12"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t(locale, "bookingConfirmed")}</h2>
        <p className="text-muted-foreground mb-1">
          <span className="font-medium text-foreground">{servicioSel.name}</span>{" "}
          {t(locale, "at")}{" "}
          <span className="font-medium text-foreground">{nombreNegocio}</span>
        </p>
        <p className="text-muted-foreground capitalize">
          {fechaFormateada} · <span className="font-medium text-foreground">{hora}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          {t(locale, "seeYouSoon")}
        </p>

        {/* T-DR5: Post-booking actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={calUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium text-foreground"
          >
            <CalendarPlus className="h-4 w-4" />
            {t(locale, "addToCalendar")}
          </a>
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium text-foreground"
          >
            <MessageCircle className="h-4 w-4 text-green-600" />
            {t(locale, "shareWhatsApp")}
          </a>
        </div>
      </motion.div>
    )
  }

  return (
    <div>
      {/* SLOT_TAKEN toast (T-DR1) */}
      <AnimatePresence>
        {slotTakenToast && (
          <motion.div
            role="alert"
            aria-live="assertive"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {t(locale, "slotTaken")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Greeting */}
      <div className="mb-8">
        <p className="text-muted-foreground text-lg">{saludo(locale)},</p>
        <h1 className="text-3xl font-bold text-foreground">{t(locale, "bookYourAppointment")}</h1>
        <p className="text-muted-foreground mt-1">
          {t(locale, "at")} <span className="font-semibold text-foreground">{nombreNegocio}</span>
        </p>
      </div>

      {/* Step indicator (R2 — labels always visible) */}
      <nav aria-label="Booking progress" className="mb-8">
        <ol role="list" className="flex items-center gap-0">
          {steps.map((step, i) => (
            <li key={step.id} aria-current={paso === step.id ? "step" : undefined} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  paso === step.id ? "bg-primary text-primary-foreground" :
                  paso > step.id ? "bg-success/20 text-success" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {paso > step.id ? <Check size={12} /> : step.id}
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                  paso === step.id ? "text-primary" :
                  paso > step.id ? "text-success" :
                  "text-muted-foreground"
                }`}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 w-10 mx-1 mb-4 transition-all ${paso > step.id ? "bg-success/40" : "bg-muted"}`} />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <AnimatePresence mode="wait" custom={dir}>
        {/* Step 1: Service */}
        {paso === 1 && (
          <motion.div key="paso1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
            <h2 className="font-semibold text-foreground mb-4">{t(locale, "whatService")}</h2>
            <SelectorServicio servicios={servicios} seleccionado={servicioSel} onSeleccionar={setServicioSel} locale={locale} />
            <div className="mt-6 flex justify-end">
              <BotonPrimario
                disabled={!puedeAvanzarPaso1}
                icono={<ChevronRight className="h-4 w-4" />}
                iconoDerecha
                onClick={() => navPaso(2)}
              >
                {t(locale, "continue")}
              </BotonPrimario>
            </div>
          </motion.div>
        )}

        {/* Step 2: Date & time */}
        {paso === 2 && (
          <motion.div key="paso2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
            <h2 className="font-semibold text-foreground mb-4">{t(locale, "whenCome")}</h2>
            <SelectorFechaHora
              slug={slug}
              servicioId={servicioSel!.id}
              diasDisponibles={diasDisponibles}
              fechaSeleccionada={fecha}
              horaSeleccionada={hora}
              onFecha={setFecha}
              onHora={setHora}
              locale={locale}
            />
            <div className="mt-6 flex justify-between">
              <BotonPrimario variante="secundario" icono={<ChevronLeft className="h-4 w-4" />} onClick={() => navPaso(1)}>
                {t(locale, "back")}
              </BotonPrimario>
              <BotonPrimario
                disabled={!puedeAvanzarPaso2}
                icono={<ChevronRight className="h-4 w-4" />}
                iconoDerecha
                onClick={() => navPaso(3)}
              >
                {t(locale, "continue")}
              </BotonPrimario>
            </div>
          </motion.div>
        )}

        {/* Step 3: Client details */}
        {paso === 3 && (
          <motion.div key="paso3" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
            <h2 className="font-semibold text-foreground mb-4">{t(locale, "yourDetails")}</h2>

            {/* Booking summary (T-DR4 date formatting) */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-5 space-y-1.5 text-sm">
              <p className="font-semibold text-foreground mb-2">{t(locale, "bookingSummary")}</p>
              <p className="text-muted-foreground">{t(locale, "service")}: <span className="text-foreground font-medium">{servicioSel?.name}</span></p>
              <p className="text-muted-foreground capitalize">
                {t(locale, "date")}: <span className="text-foreground font-medium">
                  {new Intl.DateTimeFormat(
                    locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-MX",
                    { weekday: "long", day: "numeric", month: "long" }
                  ).format(new Date(`${fecha}T12:00:00`))}
                </span>
              </p>
              <p className="text-muted-foreground">{t(locale, "time")}: <span className="text-foreground font-medium">{hora}</span></p>
              {servicioSel?.price != null && (
                <p className="text-muted-foreground">{t(locale, "price")}: <span className="text-foreground font-medium tabular-nums">${servicioSel.price.toLocaleString("es-ES")}</span></p>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <CampoFormulario
                  etiqueta={t(locale, "firstName")}
                  placeholder={t(locale, "firstNamePlaceholder")}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  icono={<User className="h-4 w-4" />}
                  required
                />
                <CampoFormulario
                  etiqueta={t(locale, "lastName")}
                  placeholder={t(locale, "lastNamePlaceholder")}
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  icono={<User className="h-4 w-4" />}
                  required
                />
              </div>
              <CampoFormulario
                etiqueta={t(locale, "document")}
                placeholder={t(locale, "documentPlaceholder")}
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                icono={<CreditCard className="h-4 w-4" />}
              />
              <CampoFormulario
                etiqueta={t(locale, "email")}
                type="email"
                placeholder={t(locale, "emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icono={<Mail className="h-4 w-4" />}
              />
              <CampoFormulario
                etiqueta={t(locale, "phone")}
                type="tel"
                placeholder={t(locale, "phonePlaceholder")}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                icono={<Phone className="h-4 w-4" />}
              />
              <div>
                <label htmlFor="comentarios" className="block text-sm font-medium text-foreground mb-1.5">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    {t(locale, "comments")}
                  </span>
                </label>
                <textarea
                  id="comentarios"
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  placeholder={t(locale, "commentsPlaceholder")}
                  className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}
            </div>

            <div className="mt-6 flex justify-between">
              <BotonPrimario variante="secundario" icono={<ChevronLeft className="h-4 w-4" />} onClick={() => navPaso(2)}>
                {t(locale, "back")}
              </BotonPrimario>
              <BotonPrimario
                disabled={!puedeEnviar}
                cargando={enviando}
                onClick={confirmar}
              >
                {enviando ? t(locale, "confirming") : t(locale, "confirmBooking")}
              </BotonPrimario>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
