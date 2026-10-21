"use client"

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react"
import { CircleAlert, CircleCheck, CircleDashed, Plus, Trash2, type LucideIcon } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { MAXIMO_DE_PAGOS, aCentavos, deCentavos, type PagoPedido } from "@/lib/atenciones"
import { errorDeMontoDePago, estadoDelCobro, filaDePagoSugerida, type FilaDePago } from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import type { Atencion } from "../_datos"
import { Aviso } from "@/components/panel/aviso"

let pagosAgregados = 0

interface PropsDeModalCobro {
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
export function ModalCobro({ atencion, mediosDePago, aviso, guardando, onCobrar, onCambiarPagos, onCerrar }: PropsDeModalCobro) {
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
      antetitulo="Tablero"
      titulo={`Cobrar a ${atencion.cliente.nombre}`}
      descripcion={`Total: ${formatearMonto(deCentavos(totalCentavos))}`}
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={cobrar} noValidate className="space-y-6">
        <section aria-labelledby={`${idBase}-resumen`} className="rounded-[24px] bg-superficie p-4 squircle sm:p-5">
          <h3 id={`${idBase}-resumen`} className="mb-3 text-sm font-semibold">
            Lo que se hizo
          </h3>
          <ul className="space-y-2">
            {atencion.lineas.map((linea) => (
              <li key={linea.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">
                  {linea.servicio} <span className="text-texto-2">· {linea.profesional.nombre}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatearMonto(linea.precio)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-borde pt-3 font-semibold">
            <span>Total</span>
            <span className="text-lg tabular-nums">{formatearMonto(deCentavos(totalCentavos))}</span>
          </p>
        </section>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">Cómo pagó</legend>

          {totalCentavos === 0 && filas.length === 0 && (
            <p className="text-sm text-texto-2">El total es {formatearMonto(0)}: se registra como cortesía, sin pagos.</p>
          )}

          {filas.map((fila, indice) => {
            const numero = indice + 1
            const error = errorDeMontoDePago(fila.monto)
            return (
              <div
                key={fila.clave}
                role="group"
                aria-label={`Pago ${numero}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 sm:gap-3"
              >
                <div>
                  <label htmlFor={`${idBase}-${fila.clave}-medio`} className={ETIQUETA}>
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
                  <label htmlFor={`${idBase}-${fila.clave}-monto`} className={ETIQUETA}>
                    Monto
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2" aria-hidden="true">
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
                {/* A la altura del campo: baja lo que mide la etiqueta y mide lo mismo que él, 44 px. */}
                <Boton
                  variante="fantasma"
                  onClick={() => quitar(fila.clave)}
                  disabled={guardando}
                  aria-label={`Quitar el pago ${numero}: ${nombreDeMedio(fila.medio)}`}
                  title="Quitar"
                  className="mt-6.5 size-11 px-0 text-texto-2 hover:bg-error/8 hover:text-error"
                >
                  <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                </Boton>
              </div>
            )
          })}

          <Boton
            ref={botonAgregar}
            variante="secundario"
            tamano="sm"
            onClick={agregar}
            disabled={guardando || filas.length >= MAXIMO_DE_PAGOS || mediosDePago.length === 0}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            Agregar medio de pago
          </Boton>
        </fieldset>

        {/*
          En vivo, para que se lea mientras se escribe: cuánto falta o sobra.
          Con ícono además del color, como los errores.
        */}
        <div aria-live="polite" className="text-sm font-medium">
          {cobro.diferenciaCentavos > 0 && (
            <EstadoDelCobro icono={CircleDashed}>
              Falta {formatearMonto(deCentavos(cobro.diferenciaCentavos))}
            </EstadoDelCobro>
          )}
          {cobro.diferenciaCentavos < 0 && (
            <EstadoDelCobro icono={CircleAlert} error>
              Sobra {formatearMonto(deCentavos(-cobro.diferenciaCentavos))}
            </EstadoDelCobro>
          )}
          {/* Nunca a la vez que un aviso del servidor: se leería que está todo bien y que no. */}
          {cobro.diferenciaCentavos === 0 && filas.length > 0 && !hayMontoInvalido && cobro.error === null && !aviso && (
            <EstadoDelCobro icono={CircleCheck}>Los pagos cuadran con el total.</EstadoDelCobro>
          )}
          {/* Lo que no es una diferencia (un monto en cero, por ejemplo) lo dice la regla del servidor. */}
          {cobro.diferenciaCentavos === 0 && cobro.error !== null && !hayMontoInvalido && (
            <EstadoDelCobro icono={CircleAlert} error>
              {cobro.error}
            </EstadoDelCobro>
          )}
        </div>

        {aviso && (
          <Aviso tono="error" rol="alert">
            {aviso}
          </Aviso>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando} className="w-full">
            Cancelar
          </Boton>
          <Boton
            type="submit"
            disabled={!listo}
            cargando={guardando}
            aria-label={guardando ? "Cobrando" : undefined}
            className="w-full"
          >
            Cobrar {formatearMonto(deCentavos(totalCentavos))}
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}

/** Una línea del estado del cobro: falta, sobra o cuadra. */
function EstadoDelCobro({ icono: Icono, error = false, children }: { icono: LucideIcon; error?: boolean; children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2", error ? "text-error" : "text-navy")}>
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
