"use client"

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { HandCoins, Plus } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Selector } from "@/components/comunes/selector"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { leerMonto } from "@/lib/dinero"
import { NOMBRES_DE_MOVIMIENTO, errorDeMonto, type TipoDeMovimiento } from "@/lib/movimientos"
import { fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { anularMovimiento, registrarMovimiento, type MovimientoParaMostrar } from "../_datos"
import { pesos } from "./piezas"

interface Props {
  miembros: { id: string; nombre: string }[]
  pendientes: MovimientoParaMostrar[]
  /** Los tipos que quien mira puede registrar y anular: adelanto y vale (gestión), ajuste (dueña). */
  tipos: TipoDeMovimiento[]
  hoy: string
}

/**
 * Adelantos, vales y ajustes que todavía no entraron en una liquidación.
 * Se registran acá y se descuentan (o suman) en la próxima de cada uno.
 */
export function SeccionMovimientos({ miembros, pendientes, tipos, hoy }: Props) {
  const router = useRouter()
  const idDelTitulo = useId()
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState<MovimientoParaMostrar | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [errorAlAnular, setErrorAlAnular] = useState("")
  const [aviso, setAviso] = useState("")

  const anular = async () => {
    if (!anulando || trabajando) return
    setTrabajando(true)
    setErrorAlAnular("")
    const resultado = await anularMovimiento(anulando.id)
    setTrabajando(false)
    if (!resultado.ok) return setErrorAlAnular(resultado.error)
    setAnulando(null)
    setAviso("Movimiento anulado.")
    router.refresh()
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Adelantos, vales y ajustes"
        subtitulo="Entran en la próxima liquidación de cada uno"
        icono={{ figura: HandCoins }}
        accion={
          tipos.length > 0 && miembros.length > 0 ? (
            <Boton tamano="sm" icono={<Plus />} onClick={() => setRegistrando(true)}>
              Registrar
            </Boton>
          ) : undefined
        }
      />
      {aviso && (
        <Aviso tono="listo" rol="status" className="mt-4">
          {aviso}
        </Aviso>
      )}
      {pendientes.length === 0 ? (
        <EstadoVacio className="mt-5">No hay nada pendiente de descontar ni de sumar.</EstadoVacio>
      ) : (
        <ul className="mt-5 divide-y divide-borde/60">
          {pendientes.map((movimiento) => (
            <li key={movimiento.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{movimiento.miembro}</span> · {NOMBRES_DE_MOVIMIENTO[movimiento.tipo]}
                  {movimiento.motivo && <span className="text-texto-2">: {movimiento.motivo}</span>}
                </p>
                <p className="text-texto-2">
                  {fechaParaLeer(movimiento.fecha)} · registró {movimiento.registradoPor}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium">
                  {pesos(movimiento.tipo === "ajuste" ? movimiento.montoCents : -movimiento.montoCents)}
                </span>
                {tipos.includes(movimiento.tipo) && (
                  <Boton variante="fantasma" tamano="sm" onClick={() => setAnulando(movimiento)}>
                    Anular
                  </Boton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {registrando && (
          <ModalRegistrar
            key="registrar"
            miembros={miembros}
            tipos={tipos}
            hoy={hoy}
            alCerrar={() => setRegistrando(false)}
            alTerminar={(texto) => {
              setRegistrando(false)
              setAviso(texto)
              router.refresh()
            }}
          />
        )}
        {anulando && (
          <ModalConfirmar
            key="anular"
            titulo="Anular movimiento"
            descripcion={`${NOMBRES_DE_MOVIMIENTO[anulando.tipo]} de ${anulando.miembro} por ${pesos(Math.abs(anulando.montoCents))}. No se descontará ni sumará en su liquidación.`}
            textoConfirmar="Anular"
            textoCancelar="Volver"
            peligro
            trabajando={trabajando}
            aviso={errorAlAnular}
            onConfirmar={anular}
            onCerrar={() => {
              setAnulando(null)
              setErrorAlAnular("")
            }}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

function ModalRegistrar({
  miembros,
  tipos,
  hoy,
  alCerrar,
  alTerminar,
}: {
  miembros: { id: string; nombre: string }[]
  tipos: TipoDeMovimiento[]
  hoy: string
  alCerrar: () => void
  alTerminar: (texto: string) => void
}) {
  const idDelMonto = useId()
  const idDeLaFecha = useId()
  const idDelMotivo = useId()
  const [miembroId, setMiembroId] = useState(miembros[0]?.id ?? "")
  const [tipo, setTipo] = useState<TipoDeMovimiento>(tipos[0])
  const [montoTexto, setMontoTexto] = useState("")
  const [fecha, setFecha] = useState(hoy)
  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const enviado = useRef(false)

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (enviado.current) return
    setError("")
    const monto = leerMonto(montoTexto)
    if (monto === null) return setError("Escribe el monto.")
    const errorDelMonto = errorDeMonto(tipo, monto)
    if (errorDelMonto) return setError(errorDelMonto)
    if (tipo === "ajuste" && !motivo.trim()) return setError("Escribe el motivo del ajuste.")

    enviado.current = true
    setGuardando(true)
    const resultado = await registrarMovimiento({ miembroId, tipo, monto, fecha, motivo: motivo.trim() })
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alTerminar(`${NOMBRES_DE_MOVIMIENTO[tipo]} registrado para ${resultado.datos.miembro}.`)
  }

  return (
    <MarcoDeModal
      titulo="Registrar"
      descripcion="Los adelantos y vales se descuentan; un ajuste suma o resta (escribe -5000 para restar)."
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} className="space-y-4">
        <Selector
          etiqueta="Para quién"
          value={miembroId}
          onChange={(evento) => setMiembroId(evento.target.value)}
          opciones={miembros.map((m) => ({ valor: m.id, texto: m.nombre }))}
        />
        <Selector
          etiqueta="Qué es"
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value as TipoDeMovimiento)}
          opciones={tipos.map((t) => ({ valor: t, texto: NOMBRES_DE_MOVIMIENTO[t] }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={idDelMonto} className={CLASES_DE_ETIQUETA}>
              Monto
            </label>
            <input
              id={idDelMonto}
              inputMode="decimal"
              value={montoTexto}
              onChange={(evento) => setMontoTexto(evento.target.value)}
              className={CAMPO}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={idDeLaFecha} className={CLASES_DE_ETIQUETA}>
              Fecha
            </label>
            <input id={idDeLaFecha} type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} className={CAMPO} />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor={idDelMotivo} className={CLASES_DE_ETIQUETA}>
            {tipo === "ajuste" ? "Motivo" : "Motivo (opcional)"}
          </label>
          <input id={idDelMotivo} value={motivo} onChange={(evento) => setMotivo(evento.target.value)} maxLength={300} className={CAMPO} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            Registrar
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
