"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Hourglass, Mail, Phone, X } from "lucide-react"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { comoTexto } from "@/lib/fechas"
import { pedir, type Resultado } from "@/lib/peticiones"

/** Una persona esperando, como la devuelve `GET /api/lista-de-espera`. */
interface Inscripcion {
  id: string
  nombre: string
  email: string
  telefono: string | null
  whatsapp: boolean
  servicio: string | null
  /** Null: con cualquiera. */
  profesional: string | null
  avisos: number
}

function leerListaDeEspera(fecha: string): Promise<Resultado<Inscripcion[]>> {
  return pedir<{ inscripciones: Inscripcion[] }>(
    `/api/lista-de-espera?fecha=${encodeURIComponent(fecha)}`,
    "No se pudo cargar la lista de espera"
  ).then((resultado) => (resultado.ok ? { ok: true, datos: resultado.datos.inscripciones } : resultado))
}

function quitarDeLaLista(id: string): Promise<Resultado> {
  return pedir(`/api/lista-de-espera?id=${encodeURIComponent(id)}`, "No se pudo quitar de la lista", { method: "DELETE" })
}

/**
 * Quién espera que se libere una hora el día que se mira en la Agenda (#74).
 * Sólo la ve la gestión (la página la monta con `puedeVerListaDeEspera`; el
 * servidor lo vuelve a verificar). No se ofrece nada a mano: cuando una hora
 * se libera, Eli les escribe solo. Acá se ve quién está y se puede quitar a
 * alguien. Si no hay nadie, no ocupa lugar.
 */
export function ListaDeEsperaDelDia({ fecha }: { fecha: Date }) {
  const dia = comoTexto(fecha)
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
  const [aviso, setAviso] = useState("")
  const [aQuitar, setAQuitar] = useState<Inscripcion | null>(null)
  const [quitando, setQuitando] = useState(false)
  const [avisoAlQuitar, setAvisoAlQuitar] = useState("")
  const idDelTitulo = useId()

  const cargar = useCallback(async (dia: string) => {
    const resultado = await leerListaDeEspera(dia)
    if (resultado.ok) {
      setInscripciones(resultado.datos)
      setAviso("")
    } else {
      setInscripciones([])
      setAviso(resultado.error)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga cuando cambia el día que se mira
  useEffect(() => { cargar(dia) }, [dia, cargar])

  const quitar = async () => {
    if (!aQuitar) return
    setAvisoAlQuitar("")
    setQuitando(true)
    const resultado = await quitarDeLaLista(aQuitar.id)
    setQuitando(false)
    if (!resultado.ok) return setAvisoAlQuitar(resultado.error)
    setAQuitar(null)
    cargar(dia)
  }

  if (!aviso && inscripciones.length === 0) return null

  return (
    <section aria-labelledby={idDelTitulo} className="rounded-panel bg-tarjeta p-5 text-navy shadow-sm squircle sm:p-6">
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Lista de espera"
        subtitulo={
          inscripciones.length > 0
            ? `${inscripciones.length} ${inscripciones.length === 1 ? "persona espera" : "personas esperan"} que se libere una hora este día. Si se libera, les avisamos por correo.`
            : undefined
        }
        icono={{ figura: Hourglass, color: "azul" }}
      />

      {aviso && (
        <div className="mt-4">
          <Aviso>{aviso}</Aviso>
        </div>
      )}

      {inscripciones.length > 0 && (
        <ul className="mt-4 divide-y divide-borde">
          {inscripciones.map((inscripcion) => (
            <li key={inscripcion.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium break-words">{inscripcion.nombre}</p>
                <p className="text-texto-2">
                  {inscripcion.servicio ?? "Servicio"} · {inscripcion.profesional ? `con ${inscripcion.profesional}` : "con cualquiera"}
                  {inscripcion.avisos > 0 && ` · avisada ${inscripcion.avisos} ${inscripcion.avisos === 1 ? "vez" : "veces"}`}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-texto-2">
                  <a href={`mailto:${inscripcion.email}`} className="inline-flex items-center gap-1 break-all underline-offset-4 hover:underline anillo-foco">
                    <Mail aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                    {inscripcion.email}
                  </a>
                  {inscripcion.telefono && (
                    <a href={`tel:${inscripcion.telefono}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline anillo-foco">
                      <Phone aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                      {inscripcion.telefono}
                      {inscripcion.whatsapp && <span className="sr-only">(acepta WhatsApp)</span>}
                    </a>
                  )}
                </p>
              </div>
              <BotonIcono
                etiqueta={`Quitar a ${inscripcion.nombre} de la lista de espera`}
                icono={<X />}
                tamano="sm"
                onClick={() => {
                  setAvisoAlQuitar("")
                  setAQuitar(inscripcion)
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {aQuitar && (
          <ModalConfirmar
            titulo="¿Quitar de la lista de espera?"
            descripcion={`${aQuitar.nombre} deja de esperar este día y no le avisaremos si se libera una hora.`}
            textoConfirmar="Quitar"
            textoCancelar="Dejarla"
            peligro
            trabajando={quitando}
            aviso={avisoAlQuitar}
            onConfirmar={quitar}
            onCerrar={() => setAQuitar(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
