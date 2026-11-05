"use client"

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { ArrowLeft, Ban, Download, Printer, Share2, Wallet } from "lucide-react"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Selector } from "@/components/comunes/selector"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import type { EstadoDeLiquidacion } from "@/lib/liquidacion"
import { anularLiquidacion, marcarPagada } from "../_datos"

interface Props {
  id: string
  estado: EstadoDeLiquidacion
  /** Lo que se comparte: quién, qué período y cuánto. */
  resumen: string
  volverA: string
  puedePagar: boolean
  puedeAnular: boolean
}

type Modal = "pagar" | "anular" | null

/**
 * Lo que se hace con un comprobante: imprimirlo (o guardarlo como PDF desde
 * el diálogo de impresión, sin librerías), compartirlo, bajarlo en CSV y,
 * la dueña, marcarlo pagado o anularlo. Compartir manda el resumen y el
 * enlace interno del panel: no hay enlace público, quien lo abre necesita
 * sesión y ver esa liquidación.
 */
export function AccionesDelComprobante({ id, estado, resumen, volverA, puedePagar, puedeAnular }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<Modal>(null)
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null)
  const cerrada = estado === "cerrada"

  const compartir = async () => {
    setAviso(null)
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: "Comprobante de liquidación", text: resumen, url })
        return
      }
      await navigator.clipboard.writeText(`${resumen}\n${url}`)
      setAviso({ texto: "Copiamos el resumen y el enlace. Quien lo abra tiene que entrar con su cuenta.", error: false })
    } catch (error) {
      // Cerrar la hoja de compartir no es un error.
      if (error instanceof DOMException && error.name === "AbortError") return
      setAviso({ texto: "No se pudo compartir desde este navegador.", error: true })
    }
  }

  const listo = (texto: string) => {
    setModal(null)
    setAviso({ texto, error: false })
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Boton href={volverA} variante="fantasma" tamano="sm" icono={<ArrowLeft />}>
          Volver
        </Boton>
        <span className="flex-1" />
        <Boton variante="secundario" tamano="sm" icono={<Printer />} onClick={() => window.print()}>
          Imprimir o guardar PDF
        </Boton>
        <Boton variante="secundario" tamano="sm" icono={<Share2 />} onClick={compartir}>
          Compartir
        </Boton>
        {/* Un `<a>` común y no `Link`: es una descarga, no una página del panel. */}
        <a href={`/api/liquidaciones/${id}/comprobante`} download className={clasesDeBoton({ variante: "secundario", tamano: "sm" })}>
          <Download aria-hidden="true" className="size-4" />
          Descargar CSV
        </a>
        {cerrada && puedePagar && (
          <Boton tamano="sm" icono={<Wallet />} onClick={() => setModal("pagar")}>
            Marcar pagada
          </Boton>
        )}
        {cerrada && puedeAnular && (
          <Boton variante="fantasma" tamano="sm" icono={<Ban />} onClick={() => setModal("anular")}>
            Anular
          </Boton>
        )}
      </div>
      {aviso && (
        <Aviso tono={aviso.error ? "error" : "listo"} rol="status">
          {aviso.texto}
        </Aviso>
      )}

      <AnimatePresence>
        {modal === "pagar" && (
          <ModalPagar key="pagar" id={id} alCerrar={() => setModal(null)} alTerminar={() => listo("Liquidación marcada como pagada.")} />
        )}
        {modal === "anular" && (
          <ModalAnularLiquidacion
            key="anular"
            id={id}
            alCerrar={() => setModal(null)}
            alTerminar={() => listo("Liquidación anulada: lo que incluía vuelve a la próxima.")}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ModalPagar({ id, alCerrar, alTerminar }: { id: string; alCerrar: () => void; alTerminar: () => void }) {
  const [medio, setMedio] = useState("transferencia")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const enviado = useRef(false)

  const confirmar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (enviado.current) return
    enviado.current = true
    setGuardando(true)
    setError("")
    const resultado = await marcarPagada(id, medio)
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alTerminar()
  }

  return (
    <MarcoDeModal
      titulo="Marcar pagada"
      descripcion="Queda registrado con qué se pagó, quién lo marcó y cuándo. Después no se puede anular."
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form onSubmit={confirmar} className="space-y-5">
        <Selector
          etiqueta="Con qué se pagó"
          value={medio}
          onChange={(evento) => setMedio(evento.target.value)}
          opciones={MEDIOS_DE_PAGO.map((m) => ({ valor: m.id, texto: m.nombre }))}
        />
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            Marcar pagada
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}

function ModalAnularLiquidacion({ id, alCerrar, alTerminar }: { id: string; alCerrar: () => void; alTerminar: () => void }) {
  const idDelMotivo = useId()
  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const enviado = useRef(false)

  const confirmar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (enviado.current) return
    if (!motivo.trim()) return setError("Escribe por qué se anula.")
    enviado.current = true
    setGuardando(true)
    setError("")
    const resultado = await anularLiquidacion(id, motivo.trim())
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alTerminar()
  }

  return (
    <MarcoDeModal
      titulo="Anular liquidación"
      descripcion="Los servicios, propinas y movimientos que incluía vuelven a quedar pendientes para la próxima. Lo que se congeló al cerrarla sigue congelado."
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form onSubmit={confirmar} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={idDelMotivo} className={CLASES_DE_ETIQUETA}>
            Motivo
          </label>
          <textarea
            id={idDelMotivo}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={500}
            rows={3}
            className={CAMPO}
            autoFocus
          />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" variante="peligro" anchoCompleto cargando={guardando}>
            Anular
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
