"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import QRCode from "qrcode"
import { ArrowLeft, Maximize } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { MarcaDeEli } from "@/components/comunes/marca-de-eli"
import { POLLING_DE_LA_PANTALLA_MS } from "@/lib/fila-virtual"
import { pedir } from "@/lib/peticiones"
import { cn } from "@/lib/utils"

interface TurnoEnPantalla {
  numero: number
  nombre: string
}

interface Pantalla {
  negocio: { nombre: string; slug: string }
  activa: boolean
  tope: number
  enEspera: TurnoEnPantalla[]
  enAtencion: TurnoEnPantalla[]
}

/** El origen de la página no cambia mientras está abierta: no hay a qué suscribirse. */
const sinSuscripcion = () => () => {}

/** Cuántos turnos en espera entran en la pantalla; el resto se cuenta. */
const TURNOS_VISIBLES = 12

/**
 * La pantalla del local: tapa el panel entero (va por encima de la barra
 * lateral) para ponerla en un televisor o una tablet. A la izquierda, quiénes
 * están en atención y la fila de espera, con número y nombre con inicial; a
 * la derecha, el QR y el enlace para anotarse, en grande. Se refresca sola
 * cada ~15 s; si un refresco falla, deja lo último que tenía y lo dice.
 */
export function PantallaDeFila() {
  const [pantalla, setPantalla] = useState<Pantalla | null>(null)
  const [error, setError] = useState("")
  const [qr, setQr] = useState<string | null>(null)
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => "")

  const cargar = useCallback(async () => {
    const resultado = await pedir<Pantalla>("/api/fila-virtual/pantalla", "No se pudo actualizar la fila")
    if (resultado.ok) {
      setPantalla(resultado.datos)
      setError("")
    } else {
      setError(resultado.error)
    }
  }, [])

  useEffect(() => {
    let vigente = true
    const tick = () => {
      if (vigente) void cargar()
    }
    tick()
    const intervalo = window.setInterval(tick, POLLING_DE_LA_PANTALLA_MS)
    return () => {
      vigente = false
      window.clearInterval(intervalo)
    }
  }, [cargar])

  const slug = pantalla?.negocio.slug
  const enlace = slug && origen ? `${origen}/fila/${slug}` : ""
  const enlaceCorto = enlace.replace(/^https?:\/\//, "")

  useEffect(() => {
    if (!enlace) return
    let vigente = true
    QRCode.toString(enlace, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#071A31", light: "#FFFFFF" } })
      .then((svg) => {
        if (vigente) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      })
      .catch(() => {
        // Sin QR queda el enlace escrito en grande.
      })
    return () => {
      vigente = false
    }
  }, [enlace])

  const pantallaCompleta = () => {
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const enEspera = pantalla?.enEspera ?? []
  const enAtencion = pantalla?.enAtencion ?? []
  const ocultos = Math.max(0, enEspera.length - TURNOS_VISIBLES)

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-crema text-navy">
      <div className="flex items-center justify-between gap-3 px-6 pt-4">
        <Link href="/dashboard/tablero" className={clasesDeBoton({ variante: "fantasma", tamano: "sm" })}>
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
          Volver al Tablero
        </Link>
        <Boton variante="fantasma" tamano="sm" onClick={pantallaCompleta}>
          <Maximize aria-hidden="true" className="size-4" strokeWidth={2} />
          Pantalla completa
        </Boton>
      </div>

      <div className="grid flex-1 gap-8 px-6 pt-4 pb-8 lg:grid-cols-[1.4fr_1fr] lg:px-12">
        <section aria-labelledby="titulo-de-la-fila" className="flex min-w-0 flex-col gap-8">
          <header>
            <Antetitulo>{pantalla?.negocio.nombre ?? " "}</Antetitulo>
            <h1 id="titulo-de-la-fila" className="mt-2 font-serif text-5xl leading-none font-medium tracking-[-1.5px] lg:text-6xl">
              Fila de hoy
            </h1>
          </header>

          {pantalla && !pantalla.activa && (
            <p className="rounded-[20px] bg-superficie px-5 py-4 text-lg text-texto-2 squircle">
              La fila virtual está apagada: nadie nuevo se puede anotar. La dueña la enciende en Configuración.
            </p>
          )}
          {error && (
            <p role="status" className="text-base font-medium text-error">
              {error}. Se vuelve a intentar solo.
            </p>
          )}

          <div>
            <h2 className="text-xl font-medium text-texto-2">Atendiendo</h2>
            {enAtencion.length === 0 ? (
              <p className="mt-3 text-2xl text-texto-2">—</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-3">
                {enAtencion.map((turno) => (
                  <li key={turno.numero} className="flex items-baseline gap-3 rounded-[20px] bg-navy px-5 py-3 text-white squircle">
                    <span className="font-serif text-4xl font-medium tabular-nums">{turno.numero}</span>
                    <span className="text-2xl">{turno.nombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div aria-live="polite">
            <h2 className="text-xl font-medium text-texto-2">
              En espera{enEspera.length > 0 ? ` · ${enEspera.length}` : ""}
            </h2>
            {enEspera.length === 0 ? (
              <p className="mt-3 text-2xl text-texto-2">No hay nadie esperando.</p>
            ) : (
              <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                {enEspera.slice(0, TURNOS_VISIBLES).map((turno, indice) => (
                  <li
                    key={turno.numero}
                    className={cn(
                      "flex items-baseline gap-4 rounded-[20px] bg-tarjeta px-5 py-3 shadow-sm squircle",
                      indice === 0 && "shadow-[inset_0_0_0_2px_var(--color-navy)]"
                    )}
                  >
                    <span className="font-serif text-4xl font-medium tabular-nums">{turno.numero}</span>
                    <span className="min-w-0 truncate text-2xl">{turno.nombre}</span>
                  </li>
                ))}
              </ol>
            )}
            {ocultos > 0 && <p className="mt-3 text-lg text-texto-2">y {ocultos} más</p>}
          </div>
        </section>

        <aside className="flex flex-col items-center justify-center gap-5 rounded-[32px] bg-tarjeta p-8 text-center shadow-sm squircle">
          <p className="font-serif text-4xl leading-tight font-medium tracking-[-1px] text-balance">Anótate desde tu celular</p>
          {pantalla?.activa !== false && (
            <>
              <div className="w-full max-w-[22rem] rounded-[24px] bg-white p-3 shadow-[inset_0_0_0_2px_var(--color-navy)]">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- un data: generado en el navegador
                  <img src={qr} alt={`Código QR para anotarse en la fila: ${enlace}`} className="block aspect-square w-full" />
                ) : (
                  <div className="aspect-square w-full" />
                )}
              </div>
              <p className="text-xl text-texto-2">Escanea el código o entra a</p>
              <p className="font-mono text-2xl font-medium break-all lg:text-3xl">{enlaceCorto}</p>
            </>
          )}
          <p className="mt-auto inline-flex items-center gap-2 pt-4 text-base text-texto-2">
            <MarcaDeEli />
            Fila virtual con Eli
          </p>
        </aside>
      </div>
    </div>
  )
}
