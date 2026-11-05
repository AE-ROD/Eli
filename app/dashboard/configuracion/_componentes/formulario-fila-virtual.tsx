"use client"

import { useId, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ListOrdered, MonitorPlay, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { TOPE_DE_FILA_MAXIMO, TOPE_DE_FILA_MINIMO } from "@/lib/fila-virtual"
import { pedir, conJson, type Resultado } from "@/lib/peticiones"
import { cn } from "@/lib/utils"

interface FilaVirtual {
  activa: boolean
  tope: number
}

/** PUT /api/configuracion/fila-virtual: encender, apagar o cambiar el tope. */
function guardarFilaVirtual(cambios: Partial<FilaVirtual>): Promise<Resultado<FilaVirtual>> {
  return pedir<FilaVirtual>("/api/configuracion/fila-virtual", "No se pudo guardar la fila virtual", conJson("PUT", cambios))
}

/** El origen de la página no cambia mientras está abierta: no hay a qué suscribirse. */
const sinSuscripcion = () => () => {}

interface PropsDeFormularioFilaVirtual {
  slug: string
  activaInicial: boolean
  topeInicial: number
}

/**
 * La tarjeta "Fila virtual": el interruptor (se guarda al tocarlo), el tope
 * de personas esperando a la vez y el enlace que se comparte para anotarse.
 * Sólo la dueña llega acá (`SeccionFilaVirtual`).
 */
export function FormularioFilaVirtual({ slug, activaInicial, topeInicial }: PropsDeFormularioFilaVirtual) {
  const idDelTitulo = useId()
  const idDelTope = useId()
  const [activa, setActiva] = useState(activaInicial)
  const [texto, setTexto] = useState(String(topeInicial))
  const [topeGuardado, setTopeGuardado] = useState(topeInicial)
  const [guardando, setGuardando] = useState<"interruptor" | "tope" | null>(null)
  const [error, setError] = useState("")
  const [anuncio, setAnuncio] = useState("")
  // La dirección completa sólo se conoce en el navegador; en el servidor, la ruta.
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => "")
  const enlace = `${origen}/fila/${slug}`

  const tope = Number(texto)
  const topeValido =
    texto.trim() !== "" && Number.isInteger(tope) && tope >= TOPE_DE_FILA_MINIMO && tope <= TOPE_DE_FILA_MAXIMO
  const topePendiente = topeValido && tope !== topeGuardado

  const cambiar = async (nueva: boolean) => {
    if (guardando) return
    setError("")
    setAnuncio("")
    setGuardando("interruptor")
    setActiva(nueva)
    const resultado = await guardarFilaVirtual({ activa: nueva })
    setGuardando(null)
    if (!resultado.ok) {
      setActiva(!nueva)
      return setError(resultado.error)
    }
    setActiva(resultado.datos.activa)
    setAnuncio(`Fila virtual ${resultado.datos.activa ? "encendida" : "apagada"}`)
  }

  const guardarTope = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    setAnuncio("")
    if (!topeValido) {
      return setError(`Escribe un número entero de personas, de ${TOPE_DE_FILA_MINIMO} a ${TOPE_DE_FILA_MAXIMO}.`)
    }
    setGuardando("tope")
    const resultado = await guardarFilaVirtual({ tope })
    setGuardando(null)
    if (!resultado.ok) return setError(resultado.error)
    setTopeGuardado(resultado.datos.tope)
    setAnuncio("Tope guardado")
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Fila virtual"
        subtitulo="Para atender por orden de llegada sin que esperen en el local"
        icono={{ figura: ListOrdered }}
      />

      <div className="mt-5">
        <Interruptor
          etiqueta="Fila virtual"
          descripcion="Tus clientes se anotan desde su celular mientras el local está abierto, ven cuántas personas tienen adelante y les avisamos por correo cuando ya casi es su turno."
          activo={activa}
          alCambiar={cambiar}
        />
      </div>

      <form onSubmit={guardarTope} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 space-y-2">
          <label htmlFor={idDelTope} className={CLASES_DE_ETIQUETA}>
            Máximo de personas esperando
          </label>
          <input
            id={idDelTope}
            type="number"
            inputMode="numeric"
            min={TOPE_DE_FILA_MINIMO}
            max={TOPE_DE_FILA_MAXIMO}
            step={1}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            aria-describedby={`${idDelTope}-ayuda`}
            className={cn(CAMPO, "w-32")}
          />
        </div>
        <BotonPrimario
          type="submit"
          tamaño="sm"
          icono={<Save className="h-4 w-4" />}
          cargando={guardando === "tope"}
          variante={topePendiente ? "primario" : "secundario"}
        >
          Guardar
        </BotonPrimario>
      </form>
      <p id={`${idDelTope}-ayuda`} className="mt-3 text-sm text-texto-2">
        Cuando hay tantas personas esperando, nadie más se puede anotar hasta que avance la fila. De {TOPE_DE_FILA_MINIMO} a{" "}
        {TOPE_DE_FILA_MAXIMO}.
      </p>

      {activa && (
        <div className="mt-5 rounded-[20px] bg-superficie p-4 squircle sm:p-5">
          <p className="text-sm font-medium text-navy">Enlace para anotarse</p>
          <p className="mt-1 font-mono text-sm break-all text-texto-2">{enlace}</p>
          <Link
            href="/dashboard/fila"
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-navy underline-offset-4 hover:underline anillo-foco rounded-boton"
          >
            <MonitorPlay aria-hidden="true" className="size-4" strokeWidth={2} />
            Abrir la pantalla de la fila
          </Link>
          <p className="mt-2 text-sm text-texto-2">
            La pantalla usa la sesión de quien la abre: en el televisor o la tablet del local queda abierto el panel de esa
            cuenta. Déjala en pantalla completa y no dejes el panel a mano de los clientes en ese equipo.
          </p>
        </div>
      )}

      <p role="status" className="sr-only">
        {anuncio}
      </p>
      {error && <Aviso className="mt-4">{error}</Aviso>}
    </section>
  )
}
