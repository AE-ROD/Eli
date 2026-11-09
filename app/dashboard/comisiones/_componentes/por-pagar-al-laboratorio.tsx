"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { AnimatePresence } from "framer-motion"
import { Ban, FlaskConical, History, RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { deCentavos } from "@/lib/atenciones"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora } from "@/lib/fechas"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { fechaDelNegocio, fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import {
  anularPagoAlLaboratorio,
  leerPagosAlLaboratorio,
  leerPorPagarAlLaboratorio,
  pagarAlLaboratorio,
  type LaboratorioPorPagar,
  type PagoAlLaboratorio,
  type PorPagarAlLaboratorio,
} from "../_datos"

const pesos = (centavos: number) => formatearMonto(deCentavos(centavos))

/** "9 nov 2026": el día de un instante en la zona del negocio, como en la liquidación y la ficha. */
const dia = (iso: string | null, zona: string) => (iso ? fechaParaLeer(fechaDelNegocio(new Date(iso), zona)) : "—")

/** "9 nov 2026, 14:05", con la hora en 24 h, en la zona del negocio. */
const momento = (iso: string, zona: string) => `${dia(iso, zona)}, ${formatearHora(iso, zona)}`

/** "Abono prótesis · Removible parcial · Acrílico (45, 46)" → la prótesis, sin el "Abono prótesis". */
const nombreDeLaProtesis = (detalle: string) => detalle.replace(/^Abono prótesis · /, "")

interface Datos {
  porPagar: PorPagarAlLaboratorio
  pagos: PagoAlLaboratorio[]
}

async function leerTodo(): Promise<{ ok: true; datos: Datos } | { ok: false; error: string }> {
  const [porPagar, pagos] = await Promise.all([leerPorPagarAlLaboratorio(), leerPagosAlLaboratorio()])
  if (!porPagar.ok) return porPagar
  if (!pagos.ok) return pagos
  return { ok: true, datos: { porPagar: porPagar.datos, pagos: pagos.datos } }
}

/** Lo que se va a marcar pagado: todo lo del laboratorio o las líneas elegidas, con su monto (el que se ve). */
interface Pagando {
  laboratorio: LaboratorioPorPagar["laboratorio"]
  lineas: string[] | "todo"
  cantidad: number
  montoCents: number
}

/**
 * Comisiones › Por pagar al laboratorio (clínica dental, sólo la dueña): la
 * parte del laboratorio de cada abono de prótesis, desde que la prótesis se
 * entregó. "Marcar pagado" registra el pago (todo lo pendiente de un
 * laboratorio o las líneas elegidas, con quién, cuándo y el medio); no sale
 * de la caja del día. El historial guarda cada pago y deja anularlo: sus
 * abonos vuelven a quedar por pagar.
 *
 * Los envíos que crean o anulan un pago van una sola vez: un candado
 * (`enviado`) frena el doble clic antes de que el botón se vea cargando.
 */
export function PorPagarAlLaboratorioConfig({ zona }: { zona: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState("")
  const [anuncio, setAnuncio] = useState("")
  /** Por laboratorio, las líneas marcadas para pagar sólo esas. */
  const [elegidas, setElegidas] = useState<Record<string, string[]>>({})
  const [pagando, setPagando] = useState<Pagando | null>(null)
  const [anulando, setAnulando] = useState<PagoAlLaboratorio | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const enviado = useRef(false)
  /** Adonde va el foco si el botón que abrió el modal ya no está (se pagó todo, el pago quedó anulado). */
  const regionDelAnuncio = useRef<HTMLDivElement>(null)
  const idTotal = useId()
  const idHistorial = useId()

  useEffect(() => {
    let vigente = true
    leerTodo().then((resultado) => {
      if (!vigente) return
      if (resultado.ok) setDatos(resultado.datos)
      else setError(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [])

  const recargar = async () => {
    setError("")
    const resultado = await leerTodo()
    if (!resultado.ok) return setError(resultado.error)
    setDatos(resultado.datos)
    // Lo elegido que ya no está por pagar (se pagó, se anuló la atención) se suelta.
    const vigentes = new Set(resultado.datos.porPagar.laboratorios.flatMap((l) => l.lineas.map((linea) => linea.id)))
    setElegidas((previas) =>
      Object.fromEntries(Object.entries(previas).map(([lab, ids]) => [lab, ids.filter((id) => vigentes.has(id))]))
    )
  }

  const alternar = (laboratorioId: string, lineaId: string) =>
    setElegidas((previas) => {
      const actuales = previas[laboratorioId] ?? []
      return {
        ...previas,
        [laboratorioId]: actuales.includes(lineaId) ? actuales.filter((id) => id !== lineaId) : [...actuales, lineaId],
      }
    })

  const abrirPago = (deUno: LaboratorioPorPagar, soloElegidas: boolean) => {
    setAnuncio("")
    setAvisoDelModal("")
    const ids = elegidas[deUno.laboratorio.id] ?? []
    const lineas = soloElegidas ? deUno.lineas.filter((linea) => ids.includes(linea.id)) : deUno.lineas
    setPagando({
      laboratorio: deUno.laboratorio,
      lineas: soloElegidas ? lineas.map((linea) => linea.id) : "todo",
      cantidad: lineas.length,
      montoCents: lineas.reduce((suma, linea) => suma + linea.tecnicoCents, 0),
    })
  }

  const pagar = async (medio: string) => {
    if (!pagando || enviado.current) return
    enviado.current = true
    setTrabajando(true)
    setAvisoDelModal("")
    const resultado = await pagarAlLaboratorio({ laboratorioId: pagando.laboratorio.id, medio, lineas: pagando.lineas })
    if (!resultado.ok) {
      enviado.current = false
      setTrabajando(false)
      setAvisoDelModal(resultado.error)
      // Lo por pagar pudo cambiar (otro pago, una atención anulada): se vuelve a leer detrás del modal.
      void recargar()
      return
    }
    setElegidas((previas) => ({ ...previas, [pagando.laboratorio.id]: [] }))
    setAnuncio(
      `Se marcó pagado ${pesos(resultado.datos.montoCents)} a ${resultado.datos.laboratorio.nombre} (${resultado.datos.nombreMedio.toLowerCase()}).`
    )
    await recargar()
    enviado.current = false
    setTrabajando(false)
    setPagando(null)
    focoAlAnuncio()
  }

  const anular = async () => {
    if (!anulando || enviado.current) return
    enviado.current = true
    setTrabajando(true)
    setAvisoDelModal("")
    const resultado = await anularPagoAlLaboratorio(anulando.id)
    if (!resultado.ok) {
      enviado.current = false
      setTrabajando(false)
      setAvisoDelModal(resultado.error)
      void recargar()
      return
    }
    setAnuncio(`Se anuló el pago de ${pesos(anulando.montoCents)} a ${anulando.laboratorio.nombre}: sus abonos vuelven a estar por pagar.`)
    await recargar()
    enviado.current = false
    setTrabajando(false)
    setAnulando(null)
    focoAlAnuncio()
  }

  /** Después de cerrar: si el foco cayó al <body>, al anuncio de lo que pasó. */
  const focoAlAnuncio = () =>
    setTimeout(() => {
      const actual = document.activeElement
      if (!actual || actual === document.body) regionDelAnuncio.current?.focus({ preventScroll: false })
    }, 120)

  const cerrarModal = () => {
    if (trabajando) return
    setPagando(null)
    setAnulando(null)
    setAvisoDelModal("")
  }

  if (!datos) {
    return error ? (
      <Aviso
        accion={
          <Boton variante="secundario" tamano="sm" onClick={() => void recargar()}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
            Reintentar
          </Boton>
        }
      >
        {error}
      </Aviso>
    ) : (
      <div role="status" className="space-y-4">
        <span className="sr-only">Cargando lo por pagar al laboratorio…</span>
        {[0, 1].map((tarjeta) => (
          <div key={tarjeta} aria-hidden="true" className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
            <Esqueleto className="h-6 w-1/3" />
            <Esqueleto className="w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const { porPagar, pagos } = datos

  return (
    <div className="space-y-6">
      {error && <Aviso>{error}</Aviso>}
      <div ref={regionDelAnuncio} tabIndex={-1} aria-live="polite" className="rounded-campo anillo-foco">
        {anuncio && (
          <Aviso tono="listo" rol="status">
            {anuncio}
          </Aviso>
        )}
      </div>

      <section aria-labelledby={idTotal} className={cn(TARJETA_DEL_PANEL, "space-y-2 p-5 sm:p-6")}>
        <h2 id={idTotal} className="text-sm text-texto-2">
          Por pagar al laboratorio
        </h2>
        <p className="font-serif text-4xl tabular-nums">{pesos(porPagar.totalCents)}</p>
        <p className="text-sm text-pretty text-texto-2">
          La parte del laboratorio de cada abono cobrado, desde que la prótesis se entregó. Marcar pagado sólo lo
          registra: no sale de la caja del día.
        </p>
      </section>

      {porPagar.laboratorios.length === 0 ? (
        <EstadoVacio titulo="Nada por pagar">
          Cuando se entregue una prótesis con abonos cobrados, la parte de su laboratorio aparece aquí.
        </EstadoVacio>
      ) : (
        porPagar.laboratorios.map((deUno) => (
          <TarjetaDeLaboratorio
            key={deUno.laboratorio.id}
            deUno={deUno}
            zona={zona}
            elegidas={elegidas[deUno.laboratorio.id] ?? []}
            onAlternar={(lineaId) => alternar(deUno.laboratorio.id, lineaId)}
            onPagar={(soloElegidas) => abrirPago(deUno, soloElegidas)}
          />
        ))
      )}

      <section aria-labelledby={idHistorial} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EncabezadoDeTarjeta
          id={idHistorial}
          titulo="Pagos al laboratorio"
          subtitulo="Cada pago con quién lo registró, cuándo y con qué medio. Anular uno devuelve sus abonos a por pagar."
          icono={{ figura: History }}
        />
        {pagos.length === 0 ? (
          <EstadoVacio className="mt-4">Todavía no hay pagos al laboratorio.</EstadoVacio>
        ) : (
          <ul className="mt-4 divide-y divide-borde/60">
            {pagos.map((pago) => {
              const anulado = pago.anuladoEn !== null
              return (
                <li key={pago.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 text-sm">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium break-words">{pago.laboratorio.nombre}</span>
                      {anulado && <Insignia>Anulado</Insignia>}
                    </p>
                    <p className="text-texto-2">
                      {momento(pago.pagadoEn, zona)} · {pago.nombreMedio} · por {pago.pagadoPorNombre}
                      {!anulado && ` · ${pago.lineas === 1 ? "1 abono" : `${pago.lineas} abonos`}`}
                    </p>
                    {anulado && pago.anuladoEn && (
                      <p className="text-texto-2">
                        Anulado el {momento(pago.anuladoEn, zona)}
                        {pago.anuladoPorNombre ? ` por ${pago.anuladoPorNombre}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium tabular-nums", anulado && "text-texto-2")}>
                      {anulado ? (
                        <s>
                          <span className="sr-only">Anulado: </span>
                          {pesos(pago.montoCents)}
                        </s>
                      ) : (
                        pesos(pago.montoCents)
                      )}
                    </span>
                    {!anulado && (
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        className="text-error hover:bg-error/8"
                        aria-label={`Anular el pago de ${pesos(pago.montoCents)} a ${pago.laboratorio.nombre} del ${momento(pago.pagadoEn, zona)}`}
                        onClick={() => {
                          setAnuncio("")
                          setAvisoDelModal("")
                          setAnulando(pago)
                        }}
                      >
                        <Ban aria-hidden="true" className="size-4" strokeWidth={2} />
                        Anular pago
                      </Boton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <AnimatePresence>
        {pagando && (
          <ModalDePago key="pago" pagando={pagando} trabajando={trabajando} aviso={avisoDelModal} onPagar={pagar} onCerrar={cerrarModal} />
        )}
        {anulando && (
          <ModalConfirmar
            key="anular"
            titulo={`¿Anular el pago de ${pesos(anulando.montoCents)} a ${anulando.laboratorio.nombre}?`}
            descripcion={`Lo registró ${anulando.pagadoPorNombre} el ${momento(anulando.pagadoEn, zona)}, con ${anulando.nombreMedio.toLowerCase()}. ${
              anulando.lineas === 1 ? "Su abono vuelve" : `Sus ${anulando.lineas} abonos vuelven`
            } a estar por pagar, y el pago queda en el historial como anulado.`}
            textoConfirmar="Anular pago"
            textoCancelar="No anular"
            peligro
            trabajando={trabajando}
            aviso={avisoDelModal}
            onConfirmar={() => void anular()}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface PropsDeTarjetaDeLaboratorio {
  deUno: LaboratorioPorPagar
  /** La zona del negocio, para las fechas. */
  zona: string
  elegidas: readonly string[]
  onAlternar: (lineaId: string) => void
  onPagar: (soloElegidas: boolean) => void
}

/** Un laboratorio: lo que se le debe, línea por línea, con "Marcar pagado" para todo o para lo elegido. */
function TarjetaDeLaboratorio({ deUno, zona, elegidas, onAlternar, onPagar }: PropsDeTarjetaDeLaboratorio) {
  const idTitulo = useId()
  const { laboratorio, lineas, totalCents } = deUno
  const elegidasAca = lineas.filter((linea) => elegidas.includes(linea.id))
  const montoElegido = elegidasAca.reduce((suma, linea) => suma + linea.tecnicoCents, 0)

  return (
    <section aria-labelledby={idTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idTitulo}
        titulo={
          <>
            {laboratorio.nombre}
            {!laboratorio.activo && <span className="text-texto-2"> (inactivo)</span>}
          </>
        }
        subtitulo={`${pesos(totalCents)} por pagar · ${lineas.length === 1 ? "1 abono" : `${lineas.length} abonos`}`}
        icono={{ figura: FlaskConical }}
      />

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm text-texto-2">
          Marca las líneas para pagar sólo esas, o paga todo.
        </legend>
        <ul className="divide-y divide-borde/60 border-y border-borde text-sm">
          {lineas.map((linea) => (
            <li key={linea.id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={elegidas.includes(linea.id)}
                  onChange={() => onAlternar(linea.id)}
                  className="mt-0.5 size-5 shrink-0 accent-navy"
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words">
                    <span className="font-medium">{linea.paciente}</span> · {nombreDeLaProtesis(linea.detalle)}
                  </span>
                  <span className="block text-[13px] text-texto-2">
                    Cobrado el {dia(linea.cobradoEn, zona)} · Entregada el {dia(linea.entregadaEn, zona)} · Abono de {pesos(linea.abonoCents)}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="sr-only">Para el laboratorio: </span>
                  {pesos(linea.tecnicoCents)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Boton variante="secundario" tamano="sm" disabled={elegidasAca.length === 0} onClick={() => onPagar(true)}>
          {elegidasAca.length === 0
            ? "Marcar pagado lo elegido"
            : `Marcar pagado lo elegido (${pesos(montoElegido)})`}
        </Boton>
        <Boton tamano="sm" onClick={() => onPagar(false)}>
          Marcar pagado todo ({pesos(totalCents)})
        </Boton>
      </div>
    </section>
  )
}

interface PropsDeModalDePago {
  pagando: Pagando
  trabajando: boolean
  aviso: string
  onPagar: (medio: string) => void
  onCerrar: () => void
}

/** Confirmar el pago al laboratorio: cuánto, cuántos abonos y con qué medio. */
function ModalDePago({ pagando, trabajando, aviso, onPagar, onCerrar }: PropsDeModalDePago) {
  const idDelMedio = useId()
  const [medio, setMedio] = useState("transferencia")

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    onPagar(medio)
  }

  const cuantos = pagando.cantidad === 1 ? "1 abono" : `${pagando.cantidad} abonos`
  return (
    <MarcoDeModal
      antetitulo="Por pagar al laboratorio"
      titulo={`Marcar pagado a ${pagando.laboratorio.nombre}`}
      descripcion={
        pagando.lineas === "todo"
          ? `Todo lo pendiente: ${pesos(pagando.montoCents)} de ${cuantos}.`
          : `Lo elegido: ${pesos(pagando.montoCents)} de ${cuantos}.`
      }
      bloqueado={trabajando}
      alCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-5">
        <div>
          <label htmlFor={idDelMedio} className={ETIQUETA}>
            Medio de pago
          </label>
          <select
            id={idDelMedio}
            value={medio}
            disabled={trabajando}
            onChange={(evento) => setMedio(evento.target.value)}
            className={CAMPO}
          >
            {MEDIOS_DE_PAGO.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>
                {opcion.nombre}
              </option>
            ))}
          </select>
        </div>

        <Aviso tono="info">
          Queda registrado quién lo pagó, cuándo y con qué medio. No sale de la caja del día: es un pago por fuera, como
          un adelanto.
        </Aviso>

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={trabajando} onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={trabajando} aria-label={trabajando ? "Registrando el pago" : undefined}>
            Marcar pagado {pesos(pagando.montoCents)}
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
