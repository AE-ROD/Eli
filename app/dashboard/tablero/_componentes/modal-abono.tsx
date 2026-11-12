"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { aCentavos } from "@/lib/atenciones"
import { errorDeMontoDePago } from "@/lib/acciones-del-tablero"
import { formatearMonto, leerMonto, montoParaEscribir } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { leerProtesisParaAbonar, type Atencion, type ProtesisParaAbonar } from "../_datos"
import { frasesDelTablero } from "../_frases"

interface PropsDeModalAbono {
  atencion: Atencion
  /** Por qué no se pudo agregar, si falló: el mensaje del servidor, tal cual. */
  aviso: string
  guardando: boolean
  /**
   * Cambia cada vez que el abono falla: las prótesis se vuelven a leer, porque
   * el saldo pudo cambiar (otro abono en otra atención, un cobro).
   */
  version: number
  onAbonar: (protesisId: string, monto: number) => void
  onCerrar: () => void
}

/** El error del monto contra el saldo de la prótesis elegida, o `null`. */
function errorDelMonto(texto: string, saldo: number): string | null {
  if (texto.trim() === "") return "Escribe el monto del abono."
  const deFormato = errorDeMontoDePago(texto)
  if (deFormato) return deFormato
  const monto = leerMonto(texto)
  if (monto !== null && aCentavos(monto) > aCentavos(saldo)) {
    return `No puede pasar el saldo: quedan ${formatearMonto(saldo)}.`
  }
  return null
}

/**
 * "Abonar a prótesis" (clínica dental): el paciente paga una parte de una de
 * sus prótesis en esta atención. Se elige la prótesis (con su valor, lo
 * pagado, lo que ya está por cobrar en la Sala de espera y el saldo) y el
 * monto, que arranca en el saldo y se puede bajar. El abono queda como una
 * línea más de la atención: se cobra con ella y, antes de cobrar, se puede
 * quitar desde la tarjeta.
 *
 * El candado contra el doble clic es el de la pantalla (`desdeUnModal`): el
 * segundo envío se descarta mientras el primero no vuelve.
 */
export function ModalAbono({ atencion, aviso, guardando, version, onAbonar, onCerrar }: PropsDeModalAbono) {
  const idBase = useId()
  // "Sala de espera" en una clínica dental.
  const deDonde = frasesDelTablero(vocabularioDe(useRubroDelPanel()).palabras).titulo
  const [lectura, setLectura] = useState<{ protesis: ProtesisParaAbonar[] } | { error: string } | null>(null)
  const [reintentos, setReintentos] = useState(0)
  const [elegida, setElegida] = useState("")
  /** `null` mientras no se escribió nada: el monto sugerido es el saldo de la elegida. */
  const [monto, setMonto] = useState<string | null>(null)
  const [intento, setIntento] = useState(false)
  const campoDelMonto = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vigente = true
    leerProtesisParaAbonar(atencion.id).then((resultado) => {
      if (!vigente) return
      setLectura(resultado.ok ? { protesis: resultado.datos } : { error: resultado.error })
    })
    return () => {
      vigente = false
    }
  }, [atencion.id, version, reintentos])

  const protesis = lectura && "protesis" in lectura ? lectura.protesis : null
  const abonables = protesis?.filter((p) => p.saldo > 0) ?? []
  // La elegida, si sigue siendo abonable con lo último que se leyó; si no, la
  // primera con saldo (la única, casi siempre).
  const actual = abonables.find((p) => p.id === elegida) ?? abonables[0] ?? null

  const texto = monto ?? (actual ? montoParaEscribir(actual.saldo) : "")

  const elegir = (p: ProtesisParaAbonar) => {
    setElegida(p.id)
    // Otra prótesis, otro saldo: se sugiere el suyo.
    setMonto(null)
    setIntento(false)
  }

  const error = actual ? errorDelMonto(texto, actual.saldo) : null
  const errorVisible = intento ? error : texto.trim() === "" ? null : error

  const abonar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setIntento(true)
    const leido = leerMonto(texto)
    if (!actual || error || leido === null) {
      campoDelMonto.current?.focus()
      return
    }
    onAbonar(actual.id, leido)
  }

  return (
    <MarcoDeModal
      antetitulo={deDonde}
      titulo="Abonar a prótesis"
      descripcion={`${atencion.cliente.nombre} paga una parte de una de sus prótesis. El abono se suma a esta atención y se cobra con ella; hasta cobrarla, se puede quitar desde la tarjeta.`}
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      {lectura === null ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Cargando las prótesis…</span>
          {[0, 1, 2].map((fila) => (
            <Esqueleto key={fila} />
          ))}
        </div>
      ) : "error" in lectura ? (
        <Aviso
          accion={
            <Boton variante="secundario" tamano="sm" onClick={() => setReintentos((n) => n + 1)}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
              Reintentar
            </Boton>
          }
        >
          {lectura.error}
        </Aviso>
      ) : protesis === null || protesis.length === 0 ? (
        <div className="space-y-5">
          <EstadoVacio titulo="Sin prótesis para abonar">
            {atencion.cliente.nombre} no tiene prótesis (o están anuladas). Se crean en la ficha, en la pestaña Prótesis.
          </EstadoVacio>
          <Boton type="button" variante="secundario" onClick={onCerrar} className="w-full">
            Cerrar
          </Boton>
        </div>
      ) : (
        <form onSubmit={abonar} noValidate className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">¿A qué prótesis?</legend>
            <ul className="space-y-2">
              {protesis.map((p) => {
                const id = `${idBase}-${p.id}`
                const pagada = p.saldo <= 0
                const marcada = actual?.id === p.id
                return (
                  <li key={p.id}>
                    <label
                      htmlFor={id}
                      className={cn(
                        "flex gap-3 rounded-[20px] border p-3 squircle sm:p-4",
                        pagada ? "cursor-default border-borde bg-superficie" : "cursor-pointer border-texto-2/40 bg-tarjeta",
                        marcada && "border-navy ring-1 ring-navy"
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={`${idBase}-protesis`}
                        value={p.id}
                        checked={marcada}
                        disabled={pagada || guardando}
                        onChange={() => elegir(p)}
                        className="mt-1 size-5 shrink-0 accent-navy"
                      />
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block text-sm font-medium break-words">{p.nombre}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-texto-2">
                          <Insignia tono={p.estado === "entregada" ? "lima" : "gris"} className="h-5 px-2">
                            {p.nombreDeEstado}
                          </Insignia>
                          <span className="break-words">Tratante: {p.tratante}</span>
                        </span>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
                          <Cifra concepto="Valor" monto={p.valor} />
                          <Cifra concepto="Pagado" monto={p.pagado} />
                          <Cifra concepto="Por cobrar" monto={p.porCobrar} />
                          <Cifra concepto="Saldo" monto={p.saldo} fuerte />
                        </dl>
                        {pagada && <span className="block text-[13px] text-texto-2">Pagada entera (contando lo por cobrar).</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {abonables.length === 0 && (
              <p className="mt-3 text-sm text-texto-2">Todas sus prótesis están pagadas enteras: no queda saldo para abonar.</p>
            )}
          </fieldset>

          {actual && (
            <div>
              <label htmlFor={`${idBase}-monto`} className={ETIQUETA}>
                Monto del abono
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2" aria-hidden="true">
                  $
                </span>
                {/* Texto y no número, como el cobro: así la coma decimal no se pierde. */}
                <input
                  ref={campoDelMonto}
                  id={`${idBase}-monto`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={texto}
                  disabled={guardando}
                  required
                  aria-invalid={errorVisible ? true : undefined}
                  aria-describedby={`${idBase}-ayuda${errorVisible ? ` ${idBase}-error` : ""}`}
                  onChange={(evento) => setMonto(evento.target.value)}
                  className={cn(CAMPO, "pl-7 tabular-nums", errorVisible && CAMPO_CON_ERROR)}
                />
              </div>
              <p id={`${idBase}-ayuda`} className="mt-1.5 text-[13px] text-texto-2">
                Hasta {formatearMonto(actual.saldo)}, el saldo. Puede ser menos: el resto queda para otro día.
              </p>
              {errorVisible && (
                <p id={`${idBase}-error`} className={ERROR_DE_CAMPO}>
                  {errorVisible}
                </p>
              )}
            </div>
          )}

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
              disabled={!actual}
              cargando={guardando}
              aria-label={guardando ? "Agregando el abono" : undefined}
              className="w-full"
            >
              Agregar abono
            </Boton>
          </div>
        </form>
      )}
    </MarcoDeModal>
  )
}

function Cifra({ concepto, monto, fuerte = false }: { concepto: string; monto: number; fuerte?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-texto-2">{concepto}</dt>
      <dd className={cn("tabular-nums [overflow-wrap:anywhere]", fuerte ? "font-semibold text-navy" : "text-navy")}>
        {formatearMonto(monto)}
      </dd>
    </div>
  )
}
