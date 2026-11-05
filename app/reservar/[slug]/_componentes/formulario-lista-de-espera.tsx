"use client"

import { useId, useState, type FormEvent } from "react"
import { BellRing, Check } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { inscribirEnListaDeEspera } from "../_datos"

interface PropsDeFormularioListaDeEspera {
  slug: string
  servicioId: string
  /** `null`: con cualquiera. */
  profesionalId: string | null
  /** El día sin horas, `YYYY-MM-DD`. */
  fecha: string
  /** Cómo se lee ese día ("lunes 2 de noviembre"). */
  fechaParaLeer: string
}

/**
 * "Avísame si se libera una hora" (#74): cuando el día elegido no tiene horas
 * libres, quien reserva puede dejar su correo. Si una hora se libera, le
 * llega un aviso con la reserva ya llenada; la toma quien confirme primero.
 * Primero es un botón, para no llenar de campos a quien sólo quiere probar
 * otro día.
 */
export function FormularioListaDeEspera({
  slug,
  servicioId,
  profesionalId,
  fecha,
  fechaParaLeer,
}: PropsDeFormularioListaDeEspera) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [email, setEmail] = useState("")
  const [telefono, setTelefono] = useState("")
  const [whatsapp, setWhatsapp] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)
  const idDelError = useId()
  const idDelTitulo = useId()

  if (listo) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-boton-lg bg-superficie px-4 py-3 text-sm text-navy squircle">
        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        <span>
          Listo. Si se libera una hora el {fechaParaLeer}, te escribimos a <strong className="font-medium break-all">{email}</strong>.
        </span>
      </p>
    )
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" icono={<BellRing />} onClick={() => setAbierto(true)} className="w-full">
        Avísame si se libera una hora
      </Boton>
    )
  }

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError("")
    setEnviando(true)
    const resultado = await inscribirEnListaDeEspera(slug, {
      servicioId,
      profesionalId,
      fecha,
      nombre,
      apellido,
      email,
      telefono,
      whatsapp,
    })
    setEnviando(false)
    if (resultado.ok) setListo(true)
    else setError(resultado.error)
  }

  return (
    <form
      onSubmit={enviar}
      aria-labelledby={idDelTitulo}
      className="space-y-4 rounded-panel bg-superficie p-4 squircle sm:p-5"
    >
      <div>
        <h4 id={idDelTitulo} className="font-medium text-navy">
          Avísame si se libera una hora
        </h4>
        <p className="mt-1 text-sm text-texto-2">
          Si alguien cancela el {fechaParaLeer}, te mandamos un correo para que la reserves. Avisamos a todos los que esperan:
          la hora es de quien reserve primero.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
        <CampoFormulario
          etiqueta="Nombre"
          autoComplete="given-name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <CampoFormulario
          etiqueta="Apellido"
          autoComplete="family-name"
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          required
        />
      </div>
      <CampoFormulario
        etiqueta="Correo electrónico"
        type="email"
        placeholder="tu@correo.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <CampoFormulario
        etiqueta="Teléfono (opcional)"
        type="tel"
        placeholder="+56 9 1234 5678"
        autoComplete="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
      />
      {/* Sólo con teléfono: sin número no hay a dónde escribir. Nada viene marcado. */}
      {telefono.trim() && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-navy">
          <input
            type="checkbox"
            checked={whatsapp}
            onChange={(e) => setWhatsapp(e.target.checked)}
            className="size-4 shrink-0 accent-navy anillo-foco"
          />
          También quiero que me avisen por WhatsApp
        </label>
      )}
      {error && (
        <div role="alert">
          <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
        </div>
      )}
      <Boton type="submit" icono={<BellRing />} cargando={enviando} className="w-full">
        Avísame
      </Boton>
    </form>
  )
}
