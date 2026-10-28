"use client"

import { useEffect, useState } from "react"
import { Download, Share, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { MarcaDeEli } from "@/components/comunes/marca-de-eli"
import {
  ALCANCE_DEL_SW,
  RUTA_DEL_SW,
  guardarPistaCerrada,
  leerPistaCerrada,
  pistaAMostrar,
  type PistaDeInstalacion,
} from "@/lib/pwa"

/**
 * El evento que Chrome (Android y escritorio) dispara cuando Eli se puede
 * instalar. No está en los tipos del DOM porque no es un estándar.
 */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function almacenLocal(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function abiertaComoApp(): boolean {
  const deIos = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return deIos || window.matchMedia("(display-mode: standalone)").matches
}

/**
 * Eli instalable en el teléfono (issue #81), montado una vez en el layout del
 * panel:
 *
 * 1. Registra el service worker (`public/sw.js`), sólo en producción y sólo
 *    con alcance `/dashboard`. En desarrollo no: se quedaría sirviendo la
 *    página "Sin conexión" cuando se cae el servidor de desarrollo.
 * 2. Muestra una pista discreta abajo: en Android, el botón que abre el
 *    diálogo de instalar del navegador; en iPhone, que no tiene ese diálogo,
 *    cómo hacerlo a mano (Compartir → Agregar a inicio). Cerrarla la deja
 *    cerrada en este dispositivo. Ya instalada, no aparece.
 */
export function AppInstalable() {
  const [pista, setPista] = useState<PistaDeInstalacion | null>(null)
  const [dialogo, setDialogo] = useState<EventoDeInstalacion | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    // Si falla, el panel funciona igual: sólo falta la página sin conexión.
    navigator.serviceWorker.register(RUTA_DEL_SW, { scope: ALCANCE_DEL_SW, updateViaCache: "none" }).catch(() => {})
  }, [])

  useEffect(() => {
    const situacionCon = (hayDialogoNativo: boolean) => ({
      userAgent: navigator.userAgent,
      puntosTactiles: navigator.maxTouchPoints ?? 0,
      instalada: abiertaComoApp(),
      cerrada: leerPistaCerrada(almacenLocal()),
      hayDialogoNativo,
    })

    // navigator y localStorage no existen en el servidor: se lee al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sólo se conoce el dispositivo en el navegador
    setPista(pistaAMostrar(situacionCon(false)))

    const alOfrecerInstalar = (evento: Event) => {
      // Sin esto Chrome muestra su propio cartel; el nuestro es más discreto.
      evento.preventDefault()
      setDialogo(evento as EventoDeInstalacion)
      setPista(pistaAMostrar(situacionCon(true)))
    }
    const alInstalar = () => {
      setDialogo(null)
      setPista(null)
    }

    window.addEventListener("beforeinstallprompt", alOfrecerInstalar)
    window.addEventListener("appinstalled", alInstalar)
    return () => {
      window.removeEventListener("beforeinstallprompt", alOfrecerInstalar)
      window.removeEventListener("appinstalled", alInstalar)
    }
  }, [])

  if (!pista) return null

  const cerrar = () => {
    guardarPistaCerrada(almacenLocal())
    setPista(null)
  }

  const instalar = async () => {
    if (!dialogo) return
    await dialogo.prompt()
    await dialogo.userChoice
    // El diálogo se usa una sola vez. Si dijo que no, la pista se va por
    // esta visita; si Chrome lo vuelve a ofrecer, vuelve.
    setDialogo(null)
    setPista(null)
  }

  return (
    <aside
      aria-label="Instalar Eli"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-panel bg-tarjeta p-4 pr-3 text-navy shadow-md squircle lg:left-auto lg:right-6 lg:bottom-6 lg:mx-0"
    >
      <MarcaDeEli className="mt-0.5 size-9 rounded-[12px] text-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Instala Eli en tu teléfono</p>
        {pista === "ios" ? (
          <p className="mt-1 text-sm text-texto-2">
            Toca <Share aria-hidden="true" className="inline size-4 align-[-2px]" /> Compartir y luego{" "}
            <span className="font-medium text-navy">Agregar a inicio</span>. Se abre como una app, sin la barra del
            navegador.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-texto-2">Ábrelo desde la pantalla de inicio, como una app.</p>
            <Boton tamano="sm" className="mt-3" icono={<Download />} onClick={instalar}>
              Instalar
            </Boton>
          </>
        )}
      </div>
      <BotonIcono tamano="sm" etiqueta="Cerrar" icono={<X />} onClick={cerrar} className="shadow-none" />
    </aside>
  )
}
