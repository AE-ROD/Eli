"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, CreditCard, Mail, NotebookText, Phone, User, UserRoundCheck } from "lucide-react"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"

interface Servicio {
  id: string
  name: string
  duration: number
  price: number | null
}

interface Miembro {
  id: string
  nombre: string
  email: string
  role: string
}

const METODOS_PAGO = ["Efectivo", "Tarjeta débito", "Tarjeta crédito", "Transferencia"]

const FORM_INICIAL = {
  nombreCliente: "",
  telefono: "",
  email: "",
  serviceId: "",
  memberId: "",
  precio: "",
  metodoPago: "Efectivo",
  notas: "",
}

export default function PaginaWalkIn() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [form, setForm] = useState(FORM_INICIAL)
  const [cargandoDatos, setCargandoDatos] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<{ nombre: string; citaId: string } | null>(null)

  const servicioSeleccionado = useMemo(
    () => servicios.find((servicio) => servicio.id === form.serviceId) ?? null,
    [servicios, form.serviceId]
  )

  useEffect(() => {
    async function cargarDatos() {
      setCargandoDatos(true)
      try {
        const [serviciosRes, miembrosRes] = await Promise.all([
          fetch("/api/walk-ins/servicios"),
          fetch("/api/walk-ins/miembros"),
        ])

        if (!serviciosRes.ok || !miembrosRes.ok) {
          setError("No pudimos cargar los datos necesarios para registrar el walk-in.")
          return
        }

        const serviciosData = await serviciosRes.json()
        const miembrosData = await miembrosRes.json()
        setServicios(serviciosData.servicios ?? [])
        setMiembros(miembrosData.miembros ?? [])
      } catch {
        setError("No pudimos cargar los datos. Revisa tu conexión e inténtalo nuevamente.")
      } finally {
        setCargandoDatos(false)
      }
    }

    cargarDatos()
  }, [])

  function actualizarCampo(campo: keyof typeof FORM_INICIAL, valor: string) {
    setForm((actual) => ({ ...actual, [campo]: valor }))
  }

  function seleccionarServicio(serviceId: string) {
    const servicio = servicios.find((s) => s.id === serviceId)
    setForm((actual) => ({
      ...actual,
      serviceId,
      precio: servicio?.price != null ? String(servicio.price) : "",
    }))
  }

  async function enviarFormulario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!form.nombreCliente.trim()) {
      setError("Ingresa el nombre del cliente.")
      return
    }

    if (!form.serviceId) {
      setError("Selecciona un servicio.")
      return
    }

    setGuardando(true)
    try {
      const res = await fetch("/api/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreCliente: form.nombreCliente.trim(),
          telefono: form.telefono.trim() || undefined,
          email: form.email.trim() || undefined,
          serviceId: form.serviceId,
          memberId: form.memberId || undefined,
          precio: form.precio ? Number(form.precio) : undefined,
          metodoPago: form.metodoPago,
          notas: form.notas.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "No pudimos registrar el walk-in.")
        return
      }

      setConfirmacion({ nombre: form.nombreCliente.trim(), citaId: data.citaId })
      setForm(FORM_INICIAL)
    } catch {
      setError("No pudimos registrar el walk-in. Revisa tu conexión e inténtalo nuevamente.")
    } finally {
      setGuardando(false)
    }
  }

  function registrarOtro() {
    setConfirmacion(null)
    setError(null)
  }

  if (confirmacion) {
    return (
      <div className="min-h-screen">
        <BarraSuperior
          titulo="Walk-in registrado"
          subtitulo="Cliente atendido sin reserva previa"
        />

        <div className="p-4 sm:p-6">
          <div className="mx-auto max-w-xl rounded-xl border border-border/50 bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Registro completado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmacion.nombre} quedó registrado como walk-in y la cita fue marcada como completada.
            </p>
            <BotonPrimario className="mt-6 w-full sm:w-auto" onClick={registrarOtro}>
              Registrar otro
            </BotonPrimario>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Registrar walk-in"
        subtitulo="Agrega rápidamente un cliente que llegó sin reserva"
      />

      <div className="p-4 sm:p-6">
        <form onSubmit={enviarFormulario} className="mx-auto max-w-4xl space-y-6">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <section className="rounded-xl border border-border/50 bg-card p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">Datos del cliente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Solo el nombre es obligatorio. Si agregas email, Eli lo usará para evitar duplicados.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CampoFormulario
                etiqueta="Nombre del cliente*"
                placeholder="Ej: Carlos Pérez"
                value={form.nombreCliente}
                onChange={(e) => actualizarCampo("nombreCliente", e.target.value)}
                icono={<User className="h-4 w-4" />}
                required
              />
              <CampoFormulario
                etiqueta="Teléfono"
                placeholder="+52 555 123 4567"
                value={form.telefono}
                onChange={(e) => actualizarCampo("telefono", e.target.value)}
                icono={<Phone className="h-4 w-4" />}
              />
              <CampoFormulario
                etiqueta="Email"
                type="email"
                placeholder="cliente@email.com"
                value={form.email}
                onChange={(e) => actualizarCampo("email", e.target.value)}
                icono={<Mail className="h-4 w-4" />}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border/50 bg-card p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">Servicio y cobro</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecciona qué se atendió y cuánto se cobró en el momento.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Servicio*</label>
                <select
                  value={form.serviceId}
                  onChange={(e) => seleccionarServicio(e.target.value)}
                  disabled={cargandoDatos}
                  required
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground transition-all duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">{cargandoDatos ? "Cargando servicios..." : "Selecciona un servicio"}</option>
                  {servicios.map((servicio) => (
                    <option key={servicio.id} value={servicio.id}>
                      {servicio.name} · {servicio.duration} min
                    </option>
                  ))}
                </select>
                {servicios.length === 0 && !cargandoDatos && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-center">
                    <p className="text-sm text-amber-800 font-medium">No hay servicios configurados</p>
                    <a
                      href="/dashboard/configuracion"
                      className="text-sm text-primary font-medium hover:underline mt-1 inline-block"
                    >
                      Crear primer servicio →
                    </a>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Atendido por</label>
                <select
                  value={form.memberId}
                  onChange={(e) => actualizarCampo("memberId", e.target.value)}
                  disabled={cargandoDatos}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground transition-all duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">Mi usuario</option>
                  {miembros.map((miembro) => (
                    <option key={miembro.id} value={miembro.id}>
                      {miembro.nombre} · {miembro.role}
                    </option>
                  ))}
                </select>
              </div>

              <CampoFormulario
                etiqueta="Precio cobrado"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.precio}
                onChange={(e) => actualizarCampo("precio", e.target.value)}
                icono={<CreditCard className="h-4 w-4" />}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Método de pago</label>
                <select
                  value={form.metodoPago}
                  onChange={(e) => actualizarCampo("metodoPago", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground transition-all duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {METODOS_PAGO.map((metodo) => (
                    <option key={metodo} value={metodo}>
                      {metodo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {servicioSeleccionado && (
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                {servicioSeleccionado.name} dura {servicioSeleccionado.duration} min
                {servicioSeleccionado.price != null
                  ? ` y tiene precio configurado de $${servicioSeleccionado.price.toLocaleString("es-ES")}.`
                  : "."}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border/50 bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <NotebookText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold text-foreground">Notas internas</h2>
            </div>
            <textarea
              value={form.notas}
              onChange={(e) => actualizarCampo("notas", e.target.value)}
              placeholder="Agrega detalles relevantes para el equipo..."
              className="h-28 w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRoundCheck className="h-4 w-4" />
              La cita se guardará como completada.
            </p>
            <BotonPrimario className="w-full sm:w-auto" type="submit" cargando={guardando} disabled={cargandoDatos || servicios.length === 0}>
              Registrar walk-in
            </BotonPrimario>
          </div>
        </form>
      </div>
    </div>
  )
}
