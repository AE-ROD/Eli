"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { User, Mail, Phone, CreditCard, MessageSquare, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"
import { SelectorServicio, type ServicioPublico } from "./selectorServicio"
import { SelectorFechaHora } from "./selectorFechaHora"

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
}

type Paso = 1 | 2 | 3

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return "Buenos días"
  if (h < 19) return "Buenas tardes"
  return "Buenas noches"
}

export function FormularioReserva({ slug, nombreNegocio, servicios, horarios }: FormularioReservaProps) {
  const [paso, setPaso] = useState<Paso>(1)
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
  const [error, setError] = useState("")

  const diasDisponibles = horarios.map((h) => h.dayOfWeek)

  const puedeAvanzarPaso1 = !!servicioSel
  const puedeAvanzarPaso2 = !!fecha && !!hora
  const puedeEnviar = !!nombre && !!apellido

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
      if (res.ok) {
        setConfirmado(true)
      } else {
        const data = await res.json()
        setError(data.error ?? "Error al confirmar la reserva")
      }
    } finally {
      setEnviando(false)
    }
  }

  if (confirmado) {
    return (
      <motion.div
        className="text-center py-12"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">¡Reserva confirmada!</h2>
        <p className="text-muted-foreground mb-1">
          <span className="font-medium text-foreground">{servicioSel?.name}</span> con <span className="font-medium text-foreground">{nombreNegocio}</span>
        </p>
        <p className="text-muted-foreground">
          {fecha} a las <span className="font-medium text-foreground">{hora}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Te esperamos, {nombre}. ¡Hasta pronto!
        </p>
      </motion.div>
    )
  }

  return (
    <div>
      {/* Saludo */}
      <div className="mb-8">
        <p className="text-muted-foreground text-lg">{saludo()},</p>
        <h1 className="text-3xl font-bold text-foreground">Reserva tu cita</h1>
        <p className="text-muted-foreground mt-1">en <span className="font-semibold text-foreground">{nombreNegocio}</span></p>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Paso[]).map((p) => (
          <div key={p} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
              paso === p ? "bg-primary text-primary-foreground" :
              paso > p ? "bg-green-500 text-white" :
              "bg-muted text-muted-foreground"
            }`}>
              {paso > p ? "✓" : p}
            </div>
            {p < 3 && <div className={`h-0.5 w-8 transition-all ${paso > p ? "bg-green-500" : "bg-muted"}`} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {paso === 1 ? "Servicio" : paso === 2 ? "Fecha y hora" : "Tus datos"}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* Paso 1: Servicio */}
        {paso === 1 && (
          <motion.div key="paso1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <h2 className="font-semibold text-foreground mb-4">¿Qué servicio necesitas?</h2>
            <SelectorServicio servicios={servicios} seleccionado={servicioSel} onSeleccionar={setServicioSel} />
            <div className="mt-6 flex justify-end">
              <BotonPrimario
                disabled={!puedeAvanzarPaso1}
                icono={<ChevronRight className="h-4 w-4" />}
                iconoDerecha
                onClick={() => setPaso(2)}
              >
                Continuar
              </BotonPrimario>
            </div>
          </motion.div>
        )}

        {/* Paso 2: Fecha y hora */}
        {paso === 2 && (
          <motion.div key="paso2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <h2 className="font-semibold text-foreground mb-4">¿Cuándo quieres venir?</h2>
            <SelectorFechaHora
              slug={slug}
              servicioId={servicioSel!.id}
              diasDisponibles={diasDisponibles}
              fechaSeleccionada={fecha}
              horaSeleccionada={hora}
              onFecha={setFecha}
              onHora={setHora}
            />
            <div className="mt-6 flex justify-between">
              <BotonPrimario variante="secundario" icono={<ChevronLeft className="h-4 w-4" />} onClick={() => setPaso(1)}>
                Atrás
              </BotonPrimario>
              <BotonPrimario
                disabled={!puedeAvanzarPaso2}
                icono={<ChevronRight className="h-4 w-4" />}
                iconoDerecha
                onClick={() => setPaso(3)}
              >
                Continuar
              </BotonPrimario>
            </div>
          </motion.div>
        )}

        {/* Paso 3: Datos del cliente */}
        {paso === 3 && (
          <motion.div key="paso3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <h2 className="font-semibold text-foreground mb-4">Tus datos</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <CampoFormulario
                  etiqueta="Nombre"
                  placeholder="Tu nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  icono={<User className="h-4 w-4" />}
                  required
                />
                <CampoFormulario
                  etiqueta="Apellido"
                  placeholder="Tu apellido"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  icono={<User className="h-4 w-4" />}
                  required
                />
              </div>
              <CampoFormulario
                etiqueta="Cédula / Documento (opcional)"
                placeholder="Número de documento"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                icono={<CreditCard className="h-4 w-4" />}
              />
              <CampoFormulario
                etiqueta="Correo electrónico (opcional)"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icono={<Mail className="h-4 w-4" />}
              />
              <CampoFormulario
                etiqueta="Teléfono (opcional)"
                type="tel"
                placeholder="+52 555 123 4567"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                icono={<Phone className="h-4 w-4" />}
              />
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Comentarios o requisitos especiales (opcional)
                  </span>
                </label>
                <textarea
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  placeholder="¿Algo que debamos saber antes de tu cita?"
                  className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Resumen */}
              <div className="bg-muted/50 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-foreground mb-2">Resumen de tu reserva</p>
                <p className="text-muted-foreground">Servicio: <span className="text-foreground font-medium">{servicioSel?.name}</span></p>
                <p className="text-muted-foreground">Fecha: <span className="text-foreground font-medium">{fecha}</span></p>
                <p className="text-muted-foreground">Hora: <span className="text-foreground font-medium">{hora}</span></p>
                {servicioSel?.price != null && (
                  <p className="text-muted-foreground">Precio: <span className="text-foreground font-medium">${servicioSel.price.toLocaleString("es-ES")}</span></p>
                )}
              </div>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            </div>

            <div className="mt-6 flex justify-between">
              <BotonPrimario variante="secundario" icono={<ChevronLeft className="h-4 w-4" />} onClick={() => setPaso(2)}>
                Atrás
              </BotonPrimario>
              <BotonPrimario
                disabled={!puedeEnviar}
                cargando={enviando}
                onClick={confirmar}
              >
                Confirmar reserva
              </BotonPrimario>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
