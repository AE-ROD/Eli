"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import type { AccionDeEtapa, EtapaRespuesta, PlanRespuesta, PrestacionRespuesta } from "@/lib/edicion-del-plan"
import { textoDeCaras } from "@/lib/odontograma"
import { ESTADOS_DE_PRESTACION, nombreDeEstadoDeEtapa, nombreDeEstadoDePrestacion, type EstadoDePrestacion } from "@/lib/plan-de-tratamiento"
import { cn } from "@/lib/utils"
import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"
import { accionDeEtapa, borrarEtapa, borrarPrestacion, cambiarEstadoDePrestacion } from "../_datos"
import { cuandoEsLaCita, fechaCorta, pesos, porcentajeRealizado } from "../_formato"
import type { UsuarioDeLaFicha } from "./ficha-del-paciente"
import { ModalAgendar, ModalNuevaEtapa, ModalNuevaVersion, ModalPrestacion, ModalValor } from "./modales-del-plan"

interface PropsDePestanaPlan {
  pacienteId: string
  plan: PlanRespuesta
  alCambiar: (plan: PlanRespuesta) => void
  /** Si quien mira ve el odontograma: sólo entonces se ofrece armar el plan desde él. */
  conOdontograma: boolean
  zona: string
  hoy: string
  usuario: UsuarioDeLaFicha
}

/** Lo que se está por hacer y pide un modal. */
type Pendiente =
  | { tipo: "version" }
  | { tipo: "etapa" }
  | { tipo: "prestacion"; etapa: EtapaRespuesta }
  | { tipo: "agendar"; prestacion: PrestacionRespuesta }
  | { tipo: "valor"; prestacion: PrestacionRespuesta }
  | { tipo: "borrar-etapa"; etapa: EtapaRespuesta }
  | { tipo: "borrar-prestacion"; prestacion: PrestacionRespuesta }

/** Los colores de cada estado, siempre con el nombre escrito: el de una cita, lima lo hecho y azul lo agendado. */
const FONDO_DE_PRESTACION: Record<EstadoDePrestacion, string> = {
  "por-agendar": "bg-borde",
  agendada: "bg-azul-suave",
  realizada: "bg-lima-suave",
}

/** "16" o "Boca". */
const piezaDe = (prestacion: PrestacionRespuesta) => (prestacion.pieza === null ? "Boca" : String(prestacion.pieza))

/** "Restauración (pieza 16)": para nombrar una prestación en un botón o un modal. */
const nombreDePrestacion = (prestacion: PrestacionRespuesta) =>
  `${prestacion.nombre} (${prestacion.pieza === null ? "boca completa" : `pieza ${prestacion.pieza}`})`

/**
 * El plan de tratamiento y su presupuesto (`Plan.dc.html`, sin pagos ni
 * abonos ni PDF): la versión vigente con sus etapas, cada una con su estado,
 * su subtotal y sus prestaciones, y la tarjeta de totales.
 *
 * Quien puede editar (`puedeEditar` de la respuesta: dueño y odontólogos)
 * arma versiones, agrega etapas y prestaciones, cambia estados, registra que
 * una etapa se le presentó al paciente y la aprueba. El encargado lo ve igual,
 * sin ningún botón. Cada acción devuelve el plan entero, que reemplaza al que
 * se ve.
 */
export function PestanaPlan({ pacienteId, plan: respuesta, alCambiar, conOdontograma, zona, hoy, usuario }: PropsDePestanaPlan) {
  const { plan, versionesAnteriores, puedeEditar } = respuesta
  // La columna de quién hace cada prestación: "Odontólogo".
  const quienAtiende = conMayuscula(vocabularioDe(usuario.rubro).profesional)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [listo, setListo] = useState("")
  const idDelTitulo = useId()
  const idDelPresupuesto = useId()
  const idDeLaNota = useId()
  /**
   * Los mensajes de lo que pasó. Si el botón que se usó desaparece con el
   * cambio ("Marcar aprobada" en una etapa que ya quedó aprobada, el de borrar
   * una prestación que ya no está), el foco caería al <body>: va acá, y el
   * mensaje se lee al llegar.
   */
  const resultado = useRef<HTMLDivElement>(null)
  const rescatarFoco = () => {
    const activo = document.activeElement
    if (!activo || activo === document.body) resultado.current?.focus()
  }
  /** Lo que abrió el modal ya no va a estar al cerrarse (la fila o la etapa borradas, "Armar plan"). */
  const sinQuienLoAbrio = useRef(false)
  const alCerrarseElModal = () => {
    if (sinQuienLoAbrio.current) {
      sinQuienLoAbrio.current = false
      resultado.current?.focus()
    }
  }
  // Después de cada cambio del plan (no al abrir la página); con modal, además
  // cuando termina de cerrarse (abajo).
  const respuestaAnterior = useRef(respuesta)
  useEffect(() => {
    if (respuestaAnterior.current === respuesta) return
    respuestaAnterior.current = respuesta
    rescatarFoco()
  }, [respuesta])

  const abrir = (nuevo: Pendiente) => {
    setAvisoDelModal("")
    setPendiente(nuevo)
  }

  /** Después de una acción del modal: el plan nuevo y, si se quiere, qué salió bien. */
  const alTerminar = (nuevo: PlanRespuesta, mensaje = "") => {
    alCambiar(nuevo)
    setPendiente(null)
    setAviso("")
    setListo(mensaje)
  }

  /** Una acción sin modal (aprobar, presentar, cambiar un estado): `clave` marca qué botón trabaja. */
  const hacer = async (clave: string, accion: () => Promise<{ ok: true; datos: PlanRespuesta } | { ok: false; error: string }>, mensaje: string) => {
    setAviso("")
    setListo("")
    setTrabajando(clave)
    const resultado = await accion()
    setTrabajando(null)
    if (!resultado.ok) return setAviso(resultado.error)
    alCambiar(resultado.datos)
    setListo(mensaje)
  }

  const accionEnEtapa = (etapa: EtapaRespuesta, accion: AccionDeEtapa) => {
    const mensajes: Record<AccionDeEtapa, string> = {
      presentar: `Se registró que «${etapa.nombre}» se le presentó al paciente. No se le envió nada.`,
      aprobar: `«${etapa.nombre}» quedó aprobada.`,
      "volver-a-por-aprobar": `«${etapa.nombre}» volvió a por aprobar.`,
    }
    void hacer(`${etapa.id}:${accion}`, () => accionDeEtapa(pacienteId, etapa.id, accion), mensajes[accion])
  }

  const cambiarEstado = (prestacion: PrestacionRespuesta, estado: EstadoDePrestacion) => {
    if (estado === prestacion.estado) return
    // Agendada pide elegir la cita: se pregunta antes de mandar nada.
    if (estado === "agendada") return abrir({ tipo: "agendar", prestacion })
    void hacer(
      prestacion.id,
      () => cambiarEstadoDePrestacion(pacienteId, prestacion.id, estado),
      `${nombreDePrestacion(prestacion)}: ${nombreDeEstadoDePrestacion(estado).toLocaleLowerCase("es-CL")}.`
    )
  }

  const confirmarBorrado = async () => {
    if (pendiente?.tipo !== "borrar-etapa" && pendiente?.tipo !== "borrar-prestacion") return
    setAvisoDelModal("")
    setTrabajando("borrar")
    const resultado =
      pendiente.tipo === "borrar-etapa"
        ? await borrarEtapa(pacienteId, pendiente.etapa.id)
        : await borrarPrestacion(pacienteId, pendiente.prestacion.id)
    setTrabajando(null)
    if (!resultado.ok) return setAvisoDelModal(resultado.error)
    sinQuienLoAbrio.current = true
    alTerminar(resultado.datos, pendiente.tipo === "borrar-etapa" ? "Etapa borrada." : "Prestación borrada.")
  }

  const aprobadas = plan?.etapas.filter((etapa) => etapa.estado === "aprobada").length ?? 0
  const realizado = plan ? porcentajeRealizado(plan.totales) : null

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "min-w-0 flex-[999_1_640px] p-4 sm:p-6")}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id={idDelTitulo} className={TITULO_DE_TARJETA}>
                Plan de tratamiento
              </h2>
              {plan && plan.etapas.length > 0 && (
                <Insignia tono={aprobadas > 0 ? "lima" : "gris"}>
                  {aprobadas === plan.etapas.length
                    ? plan.etapas.length === 1
                      ? "Etapa aprobada"
                      : "Todas las etapas aprobadas"
                    : `${aprobadas} de ${plan.etapas.length} etapas aprobadas`}
                </Insignia>
              )}
            </div>
            {plan && (
              <p className="mt-1.5 text-sm text-texto-2">
                Versión {plan.version} · armada el {fechaCorta(plan.createdAt, zona)} por {plan.creadoPorNombre}
              </p>
            )}
          </div>
          {puedeEditar && (
            <div className="flex flex-wrap gap-2">
              {plan && (
                <Boton type="button" variante="secundario" tamano="sm" onClick={() => abrir({ tipo: "version" })}>
                  Nueva versión
                </Boton>
              )}
              {plan && (
                <Boton type="button" tamano="sm" icono={<Plus aria-hidden="true" />} onClick={() => abrir({ tipo: "etapa" })}>
                  Agregar etapa
                </Boton>
              )}
            </div>
          )}
        </div>

        <div ref={resultado} tabIndex={-1} className="mt-4 space-y-3 rounded-campo anillo-foco">
          {aviso && <Aviso>{aviso}</Aviso>}
          {listo && (
            <Aviso tono="listo" rol="status">
              {listo}
            </Aviso>
          )}
        </div>

        {!plan ? (
          <EstadoVacio
            className="mt-4"
            titulo="Sin plan de tratamiento"
            icono={<ClipboardList className="size-6 text-texto-2" aria-hidden="true" strokeWidth={1.75} />}
          >
            {puedeEditar ? (
              <span className="flex flex-col items-center gap-3">
                <span>Ármalo desde el odontograma, con lo que pide cada pieza, o empieza uno vacío.</span>
                <Boton type="button" tamano="sm" onClick={() => abrir({ tipo: "version" })}>
                  Armar plan
                </Boton>
              </span>
            ) : (
              "Todavía no se armó un plan para este paciente."
            )}
          </EstadoVacio>
        ) : plan.etapas.length === 0 ? (
          <EstadoVacio className="mt-4" titulo="El plan no tiene etapas">
            {puedeEditar ? "Agrega la primera con «Agregar etapa»." : "Todavía no se le agregó ninguna etapa."}
          </EstadoVacio>
        ) : (
          <div className="mt-5 space-y-4">
            {plan.etapas.map((etapa) => (
              <Etapa
                key={etapa.id}
                etapa={etapa}
                puedeEditar={puedeEditar}
                trabajando={trabajando}
                zona={zona}
                hoy={hoy}
                idDeLaNota={idDeLaNota}
                alAccion={(accion) => accionEnEtapa(etapa, accion)}
                alAgregar={() => abrir({ tipo: "prestacion", etapa })}
                alBorrar={() => abrir({ tipo: "borrar-etapa", etapa })}
                quienAtiende={quienAtiende}
                alCambiarEstado={cambiarEstado}
                alCambiarValor={(prestacion) => abrir({ tipo: "valor", prestacion })}
                alBorrarPrestacion={(prestacion) => abrir({ tipo: "borrar-prestacion", prestacion })}
              />
            ))}
          </div>
        )}

        {puedeEditar && plan && plan.etapas.some((etapa) => etapa.estado === "por-aprobar") && (
          <p id={idDeLaNota} className="mt-4 text-xs text-pretty text-texto-2">
            «Presentar al paciente» sólo registra que se le mostró la etapa: no se le envía nada por ningún canal.
          </p>
        )}
      </section>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
        <section aria-labelledby={idDelPresupuesto} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
          <h2 id={idDelPresupuesto} className={TITULO_DE_TARJETA}>
            Presupuesto
          </h2>
          <dl className="mt-3.5 tabular-nums">
            <Fila texto="Total del plan" valor={pesos(plan?.totales.totalCents ?? 0)} />
            <Fila texto="Aprobado" valor={pesos(plan?.totales.aprobadoCents ?? 0)} />
            <Fila texto="Realizado" valor={pesos(plan?.totales.realizadoCents ?? 0)} destacada />
          </dl>
          <div className="mt-3.5">
            <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-superficie">
              <div className="h-full rounded-full bg-lima" style={{ width: `${realizado ?? 0}%` }} />
            </div>
            <p className="mt-2 text-[13px] text-texto-2">
              {realizado === null ? "Todavía no hay nada aprobado." : `${realizado}% de lo aprobado está realizado.`}
            </p>
          </div>
        </section>

        {versionesAnteriores.length > 0 && (
          <section aria-label="Versiones anteriores" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
            <h2 className="font-semibold">Versiones anteriores</h2>
            <ul className="mt-2 space-y-1 text-sm text-texto-2">
              {versionesAnteriores.map((version) => (
                <li key={version.version}>
                  Versión {version.version} · {fechaCorta(version.createdAt, zona)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* El modal devuelve el foco a lo que lo abrió; si eso ya no está, va a los mensajes. */}
      <AnimatePresence onExitComplete={alCerrarseElModal}>
        {pendiente?.tipo === "version" && (
          <ModalNuevaVersion
            pacienteId={pacienteId}
            versionVigente={plan?.version ?? null}
            conOdontograma={conOdontograma}
            alTerminar={(nuevo) => {
              // Sin plan, lo abrió "Armar plan", que con el plan armado ya no está.
              sinQuienLoAbrio.current = !plan
              alTerminar(nuevo, `Versión ${nuevo.plan?.version ?? ""} armada.`)
            }}
            alCerrar={() => setPendiente(null)}
          />
        )}
        {pendiente?.tipo === "etapa" && (
          <ModalNuevaEtapa pacienteId={pacienteId} alTerminar={(nuevo) => alTerminar(nuevo, "Etapa agregada.")} alCerrar={() => setPendiente(null)} />
        )}
        {pendiente?.tipo === "prestacion" && (
          <ModalPrestacion
            pacienteId={pacienteId}
            etapa={pendiente.etapa}
            usuario={usuario}
            alTerminar={(nuevo) => alTerminar(nuevo, "Prestación agregada.")}
            alCerrar={() => setPendiente(null)}
          />
        )}
        {pendiente?.tipo === "agendar" && (
          <ModalAgendar
            pacienteId={pacienteId}
            prestacion={pendiente.prestacion}
            nombre={nombreDePrestacion(pendiente.prestacion)}
            zona={zona}
            hoy={hoy}
            alTerminar={(nuevo) => alTerminar(nuevo, `${nombreDePrestacion(pendiente.prestacion)}: agendada.`)}
            alCerrar={() => setPendiente(null)}
          />
        )}
        {pendiente?.tipo === "valor" && (
          <ModalValor
            pacienteId={pacienteId}
            prestacion={pendiente.prestacion}
            nombre={nombreDePrestacion(pendiente.prestacion)}
            alTerminar={(nuevo) => alTerminar(nuevo, `${nombreDePrestacion(pendiente.prestacion)}: valor guardado.`)}
            alCerrar={() => setPendiente(null)}
          />
        )}
        {(pendiente?.tipo === "borrar-etapa" || pendiente?.tipo === "borrar-prestacion") && (
          <ModalConfirmar
            titulo={pendiente.tipo === "borrar-etapa" ? `¿Borrar «${pendiente.etapa.nombre}»?` : `¿Borrar ${nombreDePrestacion(pendiente.prestacion)}?`}
            descripcion={
              pendiente.tipo === "borrar-etapa"
                ? "Se borra la etapa con sus prestaciones. No se puede deshacer."
                : "Se borra del plan. No se puede deshacer."
            }
            textoConfirmar={pendiente.tipo === "borrar-etapa" ? "Borrar etapa" : "Borrar prestación"}
            textoCancelar="No borrar"
            peligro
            trabajando={trabajando === "borrar"}
            aviso={avisoDelModal}
            onConfirmar={() => void confirmarBorrado()}
            onCerrar={() => setPendiente(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Fila({ texto, valor, destacada = false }: { texto: string; valor: string; destacada?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-borde py-2.5">
      <dt className={destacada ? "font-semibold" : "text-texto-2"}>{texto}</dt>
      <dd className={cn("font-medium", destacada && "text-2xl tracking-[-0.5px]")}>{valor}</dd>
    </div>
  )
}

interface PropsDeEtapa {
  etapa: EtapaRespuesta
  puedeEditar: boolean
  /** Qué acción está en curso, para mostrar su botón trabajando. */
  trabajando: string | null
  zona: string
  hoy: string
  idDeLaNota: string
  /** El título de la columna de quién la hace: "Odontólogo". */
  quienAtiende: string
  alAccion: (accion: AccionDeEtapa) => void
  alAgregar: () => void
  alBorrar: () => void
  alCambiarEstado: (prestacion: PrestacionRespuesta, estado: EstadoDePrestacion) => void
  alCambiarValor: (prestacion: PrestacionRespuesta) => void
  alBorrarPrestacion: (prestacion: PrestacionRespuesta) => void
}

/** Una etapa: su nombre, su estado, su subtotal, la tabla de prestaciones y lo que se puede hacer con ella. */
function Etapa({
  etapa,
  puedeEditar,
  trabajando,
  zona,
  hoy,
  idDeLaNota,
  quienAtiende,
  alAccion,
  alAgregar,
  alBorrar,
  alCambiarEstado,
  alCambiarValor,
  alBorrarPrestacion,
}: PropsDeEtapa) {
  const idDelTitulo = useId()
  const idDeFaltaElValor = useId()
  const porAprobar = etapa.estado === "por-aprobar"
  const conPrestaciones = etapa.prestaciones.length > 0
  /** Cuántas quedaron en $0: "Desde el odontograma" sin un servicio de la clínica que les corresponda. */
  const sinValor = etapa.prestaciones.filter((prestacion) => prestacion.valorCents === 0).length
  const sePuedeBorrar = porAprobar && etapa.prestaciones.every((prestacion) => prestacion.estado === "por-agendar")

  return (
    <section aria-labelledby={idDelTitulo} className="rounded-[24px] bg-superficie p-3 squircle sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 id={idDelTitulo} className="text-lg font-semibold break-words">
              Etapa {etapa.orden} · {etapa.nombre}
            </h3>
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2.5 text-[13px] font-medium",
                porAprobar ? "border-[1.5px] border-texto-2 bg-tarjeta" : "bg-lima-suave"
              )}
            >
              {nombreDeEstadoDeEtapa(etapa.estado)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-texto-2">
            {etapa.estado === "aprobada" && etapa.aprobadaEn
              ? `Aprobada el ${fechaCorta(etapa.aprobadaEn, zona)}${etapa.aprobadaPorNombre ? `, registrado por ${etapa.aprobadaPorNombre}` : ""}`
              : etapa.presentadaEn
                ? `Presentada al paciente el ${fechaCorta(etapa.presentadaEn, zona)}: esperando su respuesta`
                : "Todavía no se le presentó al paciente"}
          </p>
        </div>
        <p className="font-semibold tabular-nums">
          <span className="sr-only">Subtotal: </span>
          {pesos(etapa.subtotalCents)}
        </p>
      </div>

      {conPrestaciones ? (
        // La tabla no se aprieta: en el teléfono se desplaza de lado dentro de la etapa, no la página.
        // `relative`: lo `sr-only` de la tabla (absoluto) queda adentro y no estira la página.
        <div className="relative mt-3 overflow-x-auto rounded-[14px] anillo-foco" role="region" aria-label={`Prestaciones de la etapa ${etapa.orden}`} tabIndex={0}>
          <table className="w-full min-w-[620px] border-separate border-spacing-y-1.5 text-sm">
            <caption className="sr-only">Prestaciones de la etapa {etapa.orden}</caption>
            <thead>
              <tr className="text-left text-[13px] text-texto-2">
                <th scope="col" className="px-3 font-medium">
                  Pieza
                </th>
                <th scope="col" className="px-3 font-medium">
                  Prestación
                </th>
                <th scope="col" className="px-3 font-medium">
                  {quienAtiende}
                </th>
                <th scope="col" className="px-3 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-3 text-right font-medium">
                  Valor
                </th>
                {puedeEditar && porAprobar && (
                  <th scope="col" className="w-12 px-1">
                    <span className="sr-only">Borrar</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {etapa.prestaciones.map((prestacion) => (
                <FilaDePrestacion
                  key={prestacion.id}
                  prestacion={prestacion}
                  puedeEditar={puedeEditar}
                  conColumnaDeBorrar={puedeEditar && porAprobar}
                  trabajando={trabajando === prestacion.id}
                  zona={zona}
                  hoy={hoy}
                  idDeFaltaElValor={puedeEditar && sinValor > 0 ? idDeFaltaElValor : undefined}
                  alCambiarEstado={(estado) => alCambiarEstado(prestacion, estado)}
                  alCambiarValor={puedeEditar && porAprobar ? () => alCambiarValor(prestacion) : undefined}
                  alBorrar={() => alBorrarPrestacion(prestacion)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-[16px] border-2 border-dashed border-borde px-4 py-4 text-center text-sm text-texto-2 squircle">
          La etapa no tiene prestaciones.
        </p>
      )}

      {/* Quien puede editar ve cómo completar lo que falta; mientras, suma $0. */}
      {puedeEditar && sinValor > 0 && (
        <p id={idDeFaltaElValor} className="mt-2 px-1 text-[13px] text-pretty text-texto-2">
          {sinValor === 1 ? "A una prestación le falta el valor" : `A ${sinValor} prestaciones les falta el valor`}: mientras, suma $0 a
          la etapa.{" "}
          {porAprobar
            ? "Toca «Falta el valor» en la tabla para completarlo."
            : "Para completarlo, vuelve la etapa a por aprobar: en una aprobada el valor ya no se cambia."}
        </p>
      )}

      {puedeEditar && (
        <div className="mt-3 flex flex-wrap gap-2 px-1">
          {porAprobar && (
            <Boton type="button" variante="secundario" tamano="sm" icono={<Plus aria-hidden="true" />} onClick={alAgregar}>
              Agregar prestación
            </Boton>
          )}
          {porAprobar && conPrestaciones && (
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              aria-describedby={idDeLaNota}
              cargando={trabajando === `${etapa.id}:presentar`}
              onClick={() => alAccion("presentar")}
            >
              {etapa.presentadaEn ? "Presentar de nuevo" : "Presentar al paciente"}
            </Boton>
          )}
          {porAprobar && conPrestaciones && (
            <Boton type="button" tamano="sm" cargando={trabajando === `${etapa.id}:aprobar`} onClick={() => alAccion("aprobar")}>
              Marcar aprobada
            </Boton>
          )}
          {!porAprobar && (
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              cargando={trabajando === `${etapa.id}:volver-a-por-aprobar`}
              onClick={() => alAccion("volver-a-por-aprobar")}
            >
              Volver a por aprobar
            </Boton>
          )}
          {sePuedeBorrar && (
            <Boton
              type="button"
              variante="fantasma"
              tamano="sm"
              className="text-error hover:text-error"
              icono={<Trash2 aria-hidden="true" />}
              onClick={alBorrar}
            >
              Borrar etapa
            </Boton>
          )}
        </div>
      )}
    </section>
  )
}

interface PropsDeFilaDePrestacion {
  prestacion: PrestacionRespuesta
  puedeEditar: boolean
  conColumnaDeBorrar: boolean
  trabajando: boolean
  zona: string
  hoy: string
  /** La nota de la etapa que explica cómo completar un valor que falta, si se muestra. */
  idDeFaltaElValor?: string
  alCambiarEstado: (estado: EstadoDePrestacion) => void
  /** Sólo si el valor se puede cambiar: quien edita, en una etapa por aprobar. */
  alCambiarValor?: () => void
  alBorrar: () => void
}

const CELDA = "bg-tarjeta px-3 py-3 align-top"

/** "Falta el valor": en palabras y en el naranja de lo incompleto (el tono `atencion` de `Aviso`), no sólo $0. */
const FALTA_EL_VALOR = "inline-flex h-6 items-center gap-1.5 rounded-full bg-naranja-suave px-2.5 text-[13px] font-medium whitespace-nowrap text-navy"

function FilaDePrestacion({
  prestacion,
  puedeEditar,
  conColumnaDeBorrar,
  trabajando,
  zona,
  hoy,
  idDeFaltaElValor,
  alCambiarEstado,
  alCambiarValor,
  alBorrar,
}: PropsDeFilaDePrestacion) {
  const falta = prestacion.valorCents === 0
  const dondeEs = prestacion.pieza === null ? "boca completa" : `pieza ${prestacion.pieza}`
  const detalle = [
    prestacion.caras.length > 0 ? `${prestacion.caras.length === 1 ? "Cara" : "Caras"} ${textoDeCaras(prestacion.caras)}` : null,
    prestacion.estado === "agendada" && prestacion.cita ? `Cita: ${cuandoEsLaCita(prestacion.cita.startTime, zona, hoy)}` : null,
    prestacion.estado === "agendada" && !prestacion.cita ? "Agendada en una cita de otro odontólogo" : null,
    prestacion.estado === "realizada" && prestacion.realizadaEn ? `Realizada el ${fechaCorta(prestacion.realizadaEn, zona)}` : null,
  ].filter(Boolean)

  return (
    <tr>
      <td className={cn(CELDA, "rounded-l-[14px] font-semibold whitespace-nowrap tabular-nums")}>{piezaDe(prestacion)}</td>
      <td className={CELDA}>
        <span className="block font-medium">
          {prestacion.nombre}
        </span>
        {detalle.length > 0 && <span className="block text-[13px] text-texto-2">{detalle.join(" · ")}</span>}
      </td>
      <td className={cn(CELDA, "whitespace-nowrap")}>{prestacion.profesionalNombre ?? <span className="text-texto-2">Sin asignar</span>}</td>
      <td className={cn(CELDA, "whitespace-nowrap")}>
        {puedeEditar ? (
          <select
            value={prestacion.estado}
            onChange={(e) => alCambiarEstado(e.target.value as EstadoDePrestacion)}
            disabled={trabajando}
            aria-label={`Estado de ${prestacion.nombre}, ${dondeEs}`}
            aria-busy={trabajando || undefined}
            className={cn(CAMPO, "min-h-10 w-auto cursor-pointer py-1.5 pr-8", FONDO_DE_PRESTACION[prestacion.estado])}
          >
            {ESTADOS_DE_PRESTACION.map((estado) => (
              <option key={estado.id} value={estado.id}>
                {estado.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[13px] font-medium", FONDO_DE_PRESTACION[prestacion.estado])}>
            {nombreDeEstadoDePrestacion(prestacion.estado)}
          </span>
        )}
      </td>
      <td className={cn(CELDA, "text-right font-medium whitespace-nowrap tabular-nums", !conColumnaDeBorrar && "rounded-r-[14px]")}>
        {alCambiarValor ? (
          // El valor se toca para cambiarlo; el que falta, para completarlo.
          <button
            type="button"
            onClick={alCambiarValor}
            aria-label={`${falta ? "Completar" : "Cambiar"} el valor de ${prestacion.nombre}, ${dondeEs}${falta ? ": falta el valor" : `: ${pesos(prestacion.valorCents)}`}`}
            aria-describedby={falta ? idDeFaltaElValor : undefined}
            className={cn(
              "group/valor -my-2 -mr-2 inline-flex min-h-10 items-center gap-1.5 rounded-[12px] px-2 squircle anillo-foco",
              !falta && "hover:bg-superficie"
            )}
          >
            {falta ? (
              <span className={cn(FALTA_EL_VALOR, "transition-colors duration-150 ease-suave group-hover/valor:bg-naranja")}>
                Falta el valor
                <Pencil className="size-3.5" aria-hidden="true" strokeWidth={2} />
              </span>
            ) : (
              <>
                {pesos(prestacion.valorCents)}
                <Pencil className="size-3.5 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
              </>
            )}
          </button>
        ) : falta ? (
          <span className={FALTA_EL_VALOR}>Falta el valor</span>
        ) : (
          pesos(prestacion.valorCents)
        )}
      </td>
      {conColumnaDeBorrar && (
        <td className={cn(CELDA, "rounded-r-[14px] px-1 py-1.5 text-right")}>
          {prestacion.estado === "por-agendar" && (
            <button
              type="button"
              onClick={alBorrar}
              aria-label={`Borrar ${prestacion.nombre}, ${dondeEs}`}
              className="grid size-11 place-items-center rounded-[12px] text-error squircle anillo-foco hover:bg-error/6"
            >
              <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
            </button>
          )}
        </td>
      )}
    </tr>
  )
}
