"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { Plus, Trash2 } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ANILLO_DE_FOCO, CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO } from "@/components/panel/estilos"
import { MAXIMO_DE_PAGOS, aCentavos, deCentavos, type PagoPedido } from "@/lib/atenciones"
import { errorDeMontoDePago, estadoDelCobro, filaDePagoSugerida, type FilaDePago } from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import type { Atencion } from "../_datos"

let pagosAgregados = 0

interface ModalCobroProps {
  /**
   * La atención como se la conoce. Si el servidor rechaza el cobro porque el
   * total cambió, la pantalla la reemplaza por la recién leída: el total y la
   * lista se actualizan y los pagos escritos se conservan.
   */
  atencion: Atencion
  mediosDePago: { id: string; nombre: string }[]
  /** Por qué no se pudo cobrar, si falló. */
  aviso: string
  guardando: boolean
  onCobrar: (pagos: PagoPedido[]) => void
  /** Se tocó un pago: el aviso del intento anterior ya no es de lo que se ve. */
  onCambiarPagos: () => void
  onCerrar: () => void
}

/**
 * El total de la atención, en centavos. Dueño y encargado, que son quienes
 * cobran, siempre lo reciben; si no llegara, se suma de las líneas igual que
 * en el servidor.
 */
function totalEnCentavosDe(atencion: Atencion): number {
  if (atencion.total !== undefined) return aCentavos(atencion.total)
  return atencion.lineas.reduce((suma, linea) => suma + aCentavos(linea.precio), 0)
}

/**
 * Cobrar una atención: el resumen de lo que se hizo y los pagos, que pueden
 * repartirse entre varios medios. Lo que falta o sobra se calcula en vivo y
 * en centavos, y "Cobrar" se habilita sólo cuando los pagos dan el total
 * exacto: con la misma regla que aplica el servidor (`errorDeCobro`).
 */
export function ModalCobro({ atencion, mediosDePago, aviso, guardando, onCobrar, onCambiarPagos, onCerrar }: ModalCobroProps) {
  const idBase = useId()
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const totalCentavos = totalEnCentavosDe(atencion)

  // Arranca con todo en el primer medio, que es el caso de todos los días.
  // Con total cero no hay nada que pagar: se cobra sin pagos.
  const [filas, setFilas] = useState<FilaDePago[]>(() =>
    totalCentavos > 0 ? [filaDePagoSugerida(mediosDePago, [], totalCentavos, "pago-inicial")] : []
  )

  const cobro = estadoDelCobro(totalCentavos, filas)
  const listo = cobro.error === null
  const hayMontoInvalido = filas.some((fila) => errorDeMontoDePago(fila.monto) !== null)

  const cambiarFila = (clave: string, cambios: Partial<FilaDePago>) => {
    setFilas((previas) => previas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))
    onCambiarPagos()
  }

  // Al agregar, el foco va al monto nuevo, que es lo que se ajusta; al
  // quitar, al botón de agregar, porque el que se apretó desaparece.
  const agregar = () => {
    pagosAgregados += 1
    const clave = `pago-${pagosAgregados}`
    setFilas((previas) => [...previas, filaDePagoSugerida(mediosDePago, previas, totalCentavos, clave)])
    onCambiarPagos()
    requestAnimationFrame(() => document.getElementById(`${idBase}-${clave}-monto`)?.focus())
  }

  const quitar = (clave: string) => {
    setFilas((previas) => previas.filter((fila) => fila.clave !== clave))
    onCambiarPagos()
    requestAnimationFrame(() => botonAgregar.current?.focus())
  }

  const cobrar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (listo) onCobrar(cobro.pagos)
  }

  const nombreDeMedio = (id: string) => mediosDePago.find((medio) => medio.id === id)?.nombre ?? "medio"

  return (
    <MarcoDeModal
      titulo={`Cobrar a ${atencion.cliente.nombre}`}
      descripcion={`Total: ${formatearMonto(deCentavos(totalCentavos))}`}
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={cobrar} noValidate className="space-y-5">
        <section aria-labelledby={`${idBase}-resumen`} className="rounded-lg bg-muted/50 p-3">
          <h3 id={`${idBase}-resumen`} className="text-sm font-semibold text-foreground mb-2">
            Lo que se hizo
          </h3>
          <ul className="space-y-1.5">
            {atencion.lineas.map((linea) => (
              <li key={linea.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {linea.servicio} <span className="text-muted-foreground">· {linea.profesional.nombre}</span>
                </span>
                <span className="tabular-nums shrink-0">{formatearMonto(linea.precio)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between gap-3 border-t border-border/70 mt-2 pt-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatearMonto(deCentavos(totalCentavos))}</span>
          </p>
        </section>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground mb-2">Cómo pagó</legend>

          {totalCentavos === 0 && filas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              El total es {formatearMonto(0)}: se registra como cortesía, sin pagos.
            </p>
          )}

          {filas.map((fila, indice) => {
            const numero = indice + 1
            const error = errorDeMontoDePago(fila.monto)
            return (
              <div
                key={fila.clave}
                role="group"
                aria-label={`Pago ${numero}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start"
              >
                <div>
                  <label htmlFor={`${idBase}-${fila.clave}-medio`} className="block text-xs font-medium text-muted-foreground mb-1">
                    Medio
                  </label>
                  <select
                    id={`${idBase}-${fila.clave}-medio`}
                    value={fila.medio}
                    disabled={guardando}
                    onChange={(evento) => cambiarFila(fila.clave, { medio: evento.target.value })}
                    className={CAMPO}
                  >
                    {mediosDePago.map((medio) => (
                      <option key={medio.id} value={medio.id}>
                        {medio.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${idBase}-${fila.clave}-monto`} className="block text-xs font-medium text-muted-foreground mb-1">
                    Monto
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
                      $
                    </span>
                    {/* Texto y no número, igual que el precio: así la coma decimal no se pierde. */}
                    <input
                      id={`${idBase}-${fila.clave}-monto`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={fila.monto}
                      disabled={guardando}
                      required
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${idBase}-${fila.clave}-error` : undefined}
                      onChange={(evento) => cambiarFila(fila.clave, { monto: evento.target.value })}
                      className={cn(CAMPO, "pl-7 tabular-nums", error && CAMPO_CON_ERROR)}
                    />
                  </div>
                  {error && (
                    <p id={`${idBase}-${fila.clave}-error`} className={ERROR_DE_CAMPO}>
                      {error}
                    </p>
                  )}
                </div>
                <div className="pt-5">
                  <button
                    type="button"
                    onClick={() => quitar(fila.clave)}
                    disabled={guardando}
                    aria-label={`Quitar el pago ${numero}: ${nombreDeMedio(fila.medio)}`}
                    title="Quitar"
                    className={cn(
                      "rounded-lg p-2.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50",
                      ANILLO_DE_FOCO
                    )}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}

          <button
            ref={botonAgregar}
            type="button"
            onClick={agregar}
            disabled={guardando || filas.length >= MAXIMO_DE_PAGOS || mediosDePago.length === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              ANILLO_DE_FOCO
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar medio de pago
          </button>
        </fieldset>

        {/* En vivo, para que se lea mientras se escribe: cuánto falta o sobra. */}
        <div aria-live="polite" className="text-sm font-medium">
          {cobro.diferenciaCentavos > 0 && (
            <p className="text-amber-700">Falta {formatearMonto(deCentavos(cobro.diferenciaCentavos))}</p>
          )}
          {cobro.diferenciaCentavos < 0 && (
            <p className="text-red-600">Sobra {formatearMonto(deCentavos(-cobro.diferenciaCentavos))}</p>
          )}
          {/* Nunca a la vez que un aviso del servidor: se leería que está todo bien y que no. */}
          {cobro.diferenciaCentavos === 0 && filas.length > 0 && !hayMontoInvalido && cobro.error === null && !aviso && (
            <p className="text-green-700">Los pagos cuadran con el total.</p>
          )}
          {/* Lo que no es una diferencia (un monto en cero, por ejemplo) lo dice la regla del servidor. */}
          {cobro.diferenciaCentavos === 0 && cobro.error !== null && !hayMontoInvalido && (
            <p className="text-red-500">{cobro.error}</p>
          )}
        </div>

        {aviso && (
          <p role="alert" className="text-sm text-red-500">
            {aviso}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          <BotonPrimario
            type="button"
            variante="secundario"
            anchoCompleto
            onClick={onCerrar}
            disabled={guardando}
            className={ANILLO_DE_FOCO}
          >
            Cancelar
          </BotonPrimario>
          <BotonPrimario
            type="submit"
            anchoCompleto
            disabled={!listo}
            cargando={guardando}
            aria-label={guardando ? "Cobrando" : undefined}
            className={ANILLO_DE_FOCO}
          >
            Cobrar {formatearMonto(deCentavos(totalCentavos))}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
