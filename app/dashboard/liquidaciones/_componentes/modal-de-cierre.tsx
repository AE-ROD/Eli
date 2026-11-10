"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { NOMBRES_DE_MOVIMIENTO } from "@/lib/movimientos"
import { avisoDeCierreAnticipado, fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import type { Resultado } from "@/lib/peticiones"
import { cerrarLiquidacion, leerVistaPrevia, type VistaPrevia } from "../_datos"
import { FilaDeTotal, pesos, porcentaje } from "./piezas"
import { ListaDeProtesis } from "./protesis-en-liquidacion"

interface Props {
  miembro: { id: string; nombre: string }
  alCerrar: () => void
}

/**
 * La próxima liquidación de alguien, calculada en el servidor sin guardar, y
 * el botón para cerrarla. Lo pendiente con % ya configurado dice a cuánto se
 * congelará; lo que no tiene % frena el cierre. Los adelantos, vales y
 * ajustes se pueden dejar para la siguiente (por ejemplo, si el total queda
 * negativo). Sólo la dueña llega acá.
 *
 * Cerrar pide confirmación (QA#5): congela comisiones y saca lo incluido de
 * las próximas, y si el período todavía no termina, lo dice. Se cierra con el
 * total que se confirmó: si entretanto se cobró o se anuló algo, el servidor
 * responde 409 ("cambió mientras confirmabas") y la vista previa se recalcula. Mientras se
 * confirma, este componente sigue montado y guarda lo elegido (excluidos y
 * nota): cancelar vuelve a la vista previa tal como estaba.
 */
export function ModalDeCierre({ miembro, alCerrar }: Props) {
  const router = useRouter()
  const idDeLaNota = useId()
  const [excluidos, setExcluidos] = useState<string[]>([])
  const [respuesta, setRespuesta] = useState<{ clave: string; resultado: Resultado<VistaPrevia> } | null>(null)
  const [nota, setNota] = useState("")
  const [cerrando, setCerrando] = useState(false)
  const [errorAlCerrar, setErrorAlCerrar] = useState("")
  const [reintentos, setReintentos] = useState(0)
  const [confirmando, setConfirmando] = useState(false)
  const enviado = useRef(false)
  // Lo que abrió la vista previa ("Próxima liquidación", en Equipo). Al pasar
  // a la confirmación y volver, los dos modales se reemplazan y cada uno anota
  // como abridor un botón del otro, que ya no existe: al cerrar, el foco caía
  // al <body> (#158). Se anota acá una sola vez, en el primer render.
  const [quienLoAbrio] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null
  )
  useEffect(
    () => () => {
      // Después de que el marco devuelva el foco a lo suyo: si no pudo y quedó en el <body>, vuelve acá.
      setTimeout(() => {
        const actual = document.activeElement
        if ((!actual || actual === document.body) && quienLoAbrio?.isConnected) quienLoAbrio.focus({ preventScroll: true })
      }, 0)
    },
    [quienLoAbrio]
  )

  const clave = JSON.stringify({ excluidos, reintentos })
  useEffect(() => {
    let vigente = true
    leerVistaPrevia(miembro.id, excluidos).then((resultado) => {
      if (vigente) setRespuesta({ clave, resultado })
    })
    return () => {
      vigente = false
    }
  }, [miembro.id, excluidos, clave])

  const cargando = !respuesta || respuesta.clave !== clave
  const vista = respuesta?.resultado.ok ? respuesta.resultado.datos : null

  const alternar = (id: string) => {
    setErrorAlCerrar("")
    setExcluidos((previos) => (previos.includes(id) ? previos.filter((otro) => otro !== id) : [...previos, id]))
  }

  const cerrar = async () => {
    if (!vista || enviado.current) return
    enviado.current = true
    setCerrando(true)
    setErrorAlCerrar("")
    const resultado = await cerrarLiquidacion({
      miembroId: miembro.id,
      desde: vista.periodo.desde,
      // El total que se vio al confirmar: si cambió entretanto, 409 y se recalcula.
      totalEsperadoCents: vista.totales.totalCents,
      excluirMovimientos: excluidos,
      nota: nota.trim(),
    })
    enviado.current = false
    setCerrando(false)
    if (!resultado.ok) {
      // Vuelve a la vista previa, que se recalcula: lo que hizo fallar el
      // cierre (algo cambió mientras tanto) se ve ahí.
      setConfirmando(false)
      setErrorAlCerrar(resultado.error)
      setReintentos((n) => n + 1)
      return
    }
    router.push(`/dashboard/liquidaciones/${resultado.datos.id}`)
  }

  if (confirmando && vista) {
    const anticipado = avisoDeCierreAnticipado(vista.periodo, vista.hoy)
    return (
      <ModalConfirmar
        titulo={`¿Cerrar la liquidación de ${miembro.nombre}?`}
        descripcion={`${vista.periodo.texto}, con ${pesos(vista.totales.totalCents)} a pagar. Las comisiones pendientes se congelan y lo incluido ya no entra en otra liquidación. Se puede anular mientras no esté pagada.`}
        textoConfirmar="Cerrar liquidación"
        textoCancelar="Volver a la vista previa"
        trabajando={cerrando}
        onConfirmar={cerrar}
        onCerrar={() => setConfirmando(false)}
      >
        {anticipado && (
          <Aviso tono="atencion" rol="status">
            {anticipado}
          </Aviso>
        )}
      </ModalConfirmar>
    )
  }

  return (
    <MarcoDeModal
      titulo={`Liquidación de ${miembro.nombre}`}
      descripcion={vista ? `${vista.periodo.texto}. Hoy es ${fechaParaLeer(vista.hoy)}.` : "Calculando lo que se le debe…"}
      antetitulo="Vista previa"
      ancho="lg"
      bloqueado={cerrando}
      alCerrar={alCerrar}
    >
      {respuesta && !respuesta.resultado.ok ? (
        <Aviso accion={<BotonPrimario tamaño="sm" variante="secundario" onClick={() => setReintentos((n) => n + 1)}>Reintentar</BotonPrimario>}>
          {respuesta.resultado.error}
        </Aviso>
      ) : !vista ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Calculando…</span>
          {[0, 1, 2, 3].map((fila) => (
            <Esqueleto key={fila} />
          ))}
        </div>
      ) : (
        <div className={cargando ? "space-y-6 opacity-60" : "space-y-6"} aria-busy={cargando}>
          <section className="space-y-2">
            <h3 className="font-medium">Servicios y productos ({vista.lineas.length})</h3>
            {vista.lineas.length === 0 ? (
              <p className="text-sm text-texto-2">Nada cobrado en este período.</p>
            ) : (
              <ul className="divide-y divide-borde/60 text-sm">
                {vista.lineas.map((linea) => (
                  <li key={linea.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <span className="min-w-0">
                      <span className="text-texto-2">{fechaParaLeer(linea.fecha)} · </span>
                      {linea.detalle}
                      <span className="text-texto-2"> · {linea.cliente}</span>
                    </span>
                    <span className="tabular-nums">
                      {linea.estado === "sin-porcentaje" ? (
                        <span className="font-medium text-error">Sin porcentaje</span>
                      ) : (
                        <>
                          <span className="text-texto-2">
                            {linea.estado === "se-congelara" ? "se congelará al " : ""}
                            {porcentaje(linea.porcentaje ?? 0)} de {pesos(linea.precioCents)} ={" "}
                          </span>
                          {pesos(linea.comisionCents ?? 0)}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ListaDeProtesis protesis={vista.protesis} />

          {vista.propinas.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-medium">Propinas ({vista.propinas.length})</h3>
              <ul className="divide-y divide-borde/60 text-sm">
                {vista.propinas.map((propina) => (
                  <li key={propina.id} className="flex justify-between gap-4 py-2">
                    <span>
                      <span className="text-texto-2">{fechaParaLeer(propina.fecha)} · </span>
                      {propina.cliente}
                    </span>
                    <span className="tabular-nums">{pesos(propina.montoCents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vista.movimientos.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="font-medium">Adelantos, vales y ajustes</legend>
              <p className="text-sm text-texto-2">
                Los adelantos y vales que desmarques quedan para la próxima liquidación. Los ajustes entran siempre.
              </p>
              <ul className="divide-y divide-borde/60 text-sm">
                {vista.movimientos.map((movimiento) => {
                  const detalle = (
                    <span className="min-w-0 flex-1">
                      <span className="text-texto-2">{fechaParaLeer(movimiento.fecha)} · </span>
                      {NOMBRES_DE_MOVIMIENTO[movimiento.tipo]}
                      {movimiento.motivo && <span className="text-texto-2">: {movimiento.motivo}</span>}
                    </span>
                  )
                  const monto = (
                    <span className="tabular-nums">
                      {pesos(movimiento.tipo === "ajuste" ? movimiento.montoCents : -movimiento.montoCents)}
                    </span>
                  )
                  // Un ajuste corrige algo ya cobrado (§3.7): no se deja para la siguiente.
                  if (movimiento.tipo === "ajuste") {
                    return (
                      <li key={movimiento.id} className="flex min-h-11 items-center gap-3 py-2 pl-8">
                        {detalle}
                        {monto}
                      </li>
                    )
                  }
                  return (
                    <li key={movimiento.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                        <input
                          type="checkbox"
                          checked={movimiento.incluido}
                          onChange={() => alternar(movimiento.id)}
                          disabled={cerrando}
                          className="size-5 accent-navy"
                        />
                        {detalle}
                        {monto}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )}

          <dl className="space-y-2 rounded-campo bg-superficie p-4 squircle">
            <FilaDeTotal concepto="Comisión por servicios" centavos={vista.totales.comisionServiciosCents} />
            <FilaDeTotal concepto="Comisión por productos" centavos={vista.totales.comisionProductosCents} />
            {(vista.protesis.length > 0 || vista.totales.comisionProtesisCents !== 0) && (
              <FilaDeTotal concepto="Comisión por prótesis" centavos={vista.totales.comisionProtesisCents} />
            )}
            <FilaDeTotal concepto="Propinas" centavos={vista.totales.propinasCents} />
            <FilaDeTotal concepto="Adelantos y vales" centavos={-vista.totales.adelantosCents} />
            <FilaDeTotal concepto="Ajustes" centavos={vista.totales.ajustesCents} />
            <FilaDeTotal concepto="Total a pagar" centavos={vista.totales.totalCents} fuerte />
          </dl>

          <div className="space-y-2">
            <label htmlFor={idDeLaNota} className={CLASES_DE_ETIQUETA}>
              Nota (opcional)
            </label>
            <textarea
              id={idDeLaNota}
              value={nota}
              onChange={(evento) => setNota(evento.target.value)}
              maxLength={500}
              rows={2}
              className={CAMPO}
            />
          </div>

          {vista.noSePuedeCerrar && (
            <Aviso tono="atencion" rol="status">
              {vista.noSePuedeCerrar}
            </Aviso>
          )}
          {errorAlCerrar && <Aviso>{errorAlCerrar}</Aviso>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar} disabled={cerrando}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario
              type="button"
              anchoCompleto
              cargando={cerrando}
              disabled={cargando || !!vista.noSePuedeCerrar}
              onClick={() => {
                setErrorAlCerrar("")
                setConfirmando(true)
              }}
            >
              Cerrar liquidación
            </BotonPrimario>
          </div>
        </div>
      )}
    </MarcoDeModal>
  )
}
