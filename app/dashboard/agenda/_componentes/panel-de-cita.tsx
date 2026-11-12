"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { formatearMonto } from "@/lib/dinero"
import { duracionParaMostrar } from "@/lib/fechas"
import { formatearTiempoLibre as formatearDuracion } from "@/lib/horario-dia"
import { sePuedeMover, type Advertencia } from "@/lib/mover-cita"
import { puedeMarcarseNoVino } from "@/lib/campos-del-panel"
import {
  actorDeSesion,
  esClinicaDental,
  puedeAsignarCitasAOtros,
  puedeAsignarSillon,
  puedeReactivarCita,
  puedeResolverPorConfirmar,
} from "@/lib/permisos"
import type { Resultado } from "@/lib/peticiones"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  ESTADO_AL_REACTIVAR,
  citaPorConfirmar,
  destacaSinProfesional,
  leerDetalleDeLaClinica,
  nombreDeCliente,
  nombreDelProfesional,
  quienCancelo,
  reactivarCita,
  type Cita,
  type DetalleDeLaClinica,
  type SillonDeLaAgenda,
  type SillonDeLaCita,
} from "../_datos"
import { frasesDeLaAgenda } from "../_frases"
import { sedeParaMostrar } from "../_sedes"
import { AsignarSillon } from "./asignar-sillon"
import { estiloDeEstado } from "./estados-de-cita"
import { useSedesDeLaAgenda } from "./sedes-de-la-agenda"
import { useAhora } from "./usar-ahora"
import { useZonaDelNegocio } from "./zona-del-negocio"
import { useEsEscritorio } from "./usar-escritorio"
import { diaLargoEn, horaEn } from "../_hora-del-negocio"

/** Un fundido corto al abrir y al cerrar: el panel no se desliza. */
const FUNDIDO = { duration: DURACION.sombra, ease: CURVA.suave }

interface PropsDePanelDeCita {
  cita: Cita
  onCerrar: () => void
  /** Cambia el estado en el servidor. Devuelve el error, o vacío si salió bien. */
  onCambiarEstado: (id: string, estado: string) => Promise<string>
  /** Abre el modal para cambiar la fecha, la hora y (si se puede) el profesional. */
  onMover: (cita: Cita) => void
  /** La cita ya se reactivó en el servidor: la agenda la muestra con su estado nuevo. */
  onReactivada: (id: string, estado: string) => void
  /** Abre el modal para elegirle profesional a una cita sin asignar (#103). */
  onAsignar: (cita: Cita) => void
  /** Si hay profesionales a quien asignar: entonces se dice que la cita no tiene y se ofrece asignarla. */
  destacarSinProfesional?: boolean
  /**
   * El error de la última acción sobre la cita. En el celular el detalle tapa
   * la página y el aviso de arriba no se ve: se repite adentro.
   */
  aviso?: string
  /**
   * Clínica dental: los sillones, para "Asignar sillón". `null` (o sin dato)
   * fuera de una clínica: el panel se ve como siempre.
   */
  sillones?: SillonDeLaAgenda[] | null
  /** Clínica dental: el sillón ya se asignó en el servidor; la agenda muestra la cita con el nuevo. */
  onSillonAsignado?: (id: string, sillonId: string | null, sillon: SillonDeLaCita | null) => void
}

/**
 * El detalle de la cita elegida, al lado del calendario: una isla gris, como
 * las columnas del tablero, con los datos en una tarjeta blanca y las
 * acciones debajo. Desde `lg` queda fija al bajar por la página.
 *
 * Más angosto no cabe al lado: se abre encima, como diálogo (`MarcoDeModal`,
 * que atrapa el foco y cierra con Escape), con los mismos datos y las mismas
 * acciones (#136). Antes en el celular no se veía, y no se podía confirmar
 * una reserva desde el teléfono.
 *
 * Al cerrarlo, el foco vuelve a la cita que lo abrió; si no, el botón de
 * cerrar desaparecía con el foco adentro y el teclado volvía al principio.
 */
export function PanelDeCita({
  cita,
  onCerrar,
  onCambiarEstado,
  onMover,
  onReactivada,
  onAsignar,
  destacarSinProfesional = false,
  aviso = "",
  sillones = null,
  onSillonAsignado,
}: PropsDePanelDeCita) {
  const { data: sesion } = useSession()
  // Las palabras del rubro: cliente, profesional y cita ("hora" en un salón, "cita" en una clínica).
  const { palabras } = vocabularioDe(useRubroDelPanel())
  const frases = frasesDeLaAgenda(palabras)
  // Clínica dental: la alerta de alergias, el sillón y el enlace a la ficha.
  // Lo decide `lib/permisos.ts`; sin los sillones (otro rubro), nada de eso.
  const clinica = esClinicaDental(actorDeSesion(sesion)) && sillones !== null
  const [detalle, setDetalle] = useState<{ citaId: string; resultado: Resultado<DetalleDeLaClinica> } | null>(null)
  const escritorio = useEsEscritorio()
  // El día y las horas de la cita, en la zona del negocio (#99).
  const zona = useZonaDelNegocio()
  // Etapa 9: con varias sedes la ficha dice dónde se atiende; con una o ninguna, la de siempre.
  const sede = sedeParaMostrar(cita, useSedesDeLaAgenda().modo)
  const reactiva = puedeReactivarCita(actorDeSesion(sesion))
  // Por confirmar tras faltas (#84): la confirman o la cancelan dueña y
  // encargado. En una por confirmar, al profesional el servidor le responde
  // 401 a cualquier cambio de estado, así que en ésas no se le ofrece ninguno;
  // en sus demás citas, sí.
  const porConfirmar = citaPorConfirmar(cita)
  const resuelve = puedeResolverPorConfirmar(actorDeSesion(sesion))
  const [reactivando, setReactivando] = useState(false)
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([])
  const [errorAlReactivar, setErrorAlReactivar] = useState("")
  // La plata de su atención ya se rindió: no se reactiva, se corrige con un ajuste.
  const [seCorrigeConAjuste, setSeCorrigeConAjuste] = useState(false)
  // "Cancelar cita" pide confirmación: no se deshace sola (reactivarla es de
  // dueña y encargado, y sólo si no empezó).
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [errorAlCancelar, setErrorAlCancelar] = useState("")
  // Cancelada, el botón que abrió la confirmación ya no está: al terminar de
  // salir el modal, el foco va al título del detalle.
  const enfocarElTituloAlSalir = useRef(false)
  const idDelTitulo = useId()
  // El panel al lado del calendario o, en el celular, el contenido del diálogo.
  const panel = useRef<HTMLDivElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const abridor = useRef<HTMLElement | null>(null)
  const ultimaVista = useRef({ id: cita.id, estado: cita.status })
  // Con esta hora se decide si ya pasó la de la cita: se renueva al pasar a otra y cada medio minuto (#100).
  const ahora = useAhora(cita.id)
  const estado = estiloDeEstado(cita.status, porConfirmar, palabras)
  const duracion = duracionParaMostrar(cita.startTime, cita.endTime)

  // Clínica dental: la lista de la agenda no trae las alergias; se piden al
  // abrir cada cita. Lo que llega tarde de otra cita no se muestra en esta.
  useEffect(() => {
    if (!clinica) return
    let vigente = true
    leerDetalleDeLaClinica(cita.id).then((resultado) => {
      if (vigente) setDetalle({ citaId: cita.id, resultado })
    })
    return () => {
      vigente = false
    }
  }, [cita.id, clinica])
  const detalleDeEsta = clinica && detalle?.citaId === cita.id ? detalle.resultado : null

  // Lo que tiene el foco al abrir el panel, o al pasar a otra cita, es lo que lo abrió.
  useEffect(() => {
    const enfocado = document.activeElement
    if (enfocado instanceof HTMLElement && !panel.current?.contains(enfocado)) abridor.current = enfocado
  }, [cita.id])

  // Completar o cancelar la cita saca de la pantalla el botón que se apretó, y
  // el navegador tira el foco al <body>. Va al título del panel: no al otro
  // botón, que puede ser "Cancelar cita".
  useEffect(() => {
    const cambioDeEstado = ultimaVista.current.id === cita.id && ultimaVista.current.estado !== cita.status
    ultimaVista.current = { id: cita.id, estado: cita.status }
    const sinFoco = !document.activeElement || document.activeElement === document.body
    // En el diálogo el título es el del marco: va al contenido.
    if (cambioDeEstado && sinFoco) (titulo.current ?? panel.current)?.focus({ preventScroll: true })
  }, [cita.id, cita.status])

  const pedirCancelar = () => {
    setErrorAlCancelar("")
    setConfirmandoCancelar(true)
  }

  const cancelar = async () => {
    if (cancelando) return
    setCancelando(true)
    setErrorAlCancelar("")
    const error = await onCambiarEstado(cita.id, "cancelada")
    setCancelando(false)
    if (error) return setErrorAlCancelar(error)
    enfocarElTituloAlSalir.current = true
    setConfirmandoCancelar(false)
  }

  const alSalirLaConfirmacion = () => {
    if (!enfocarElTituloAlSalir.current) return
    enfocarElTituloAlSalir.current = false
    const sinFoco = !document.activeElement || document.activeElement === document.body
    if (sinFoco) (titulo.current ?? panel.current)?.focus({ preventScroll: true })
  }

  const cerrar = () => {
    const destino = abridor.current
    onCerrar()
    if (destino?.isConnected) destino.focus({ preventScroll: true })
  }

  // Lo que se avisó al reactivar era de esta cita en este estado.
  const vista = `${cita.id}:${cita.status}`
  const [vistaDelAviso, setVistaDelAviso] = useState(vista)
  if (vistaDelAviso !== vista) {
    setVistaDelAviso(vista)
    setAdvertencias([])
    setErrorAlReactivar("")
    setSeCorrigeConAjuste(false)
    // Otra cita, o ésta cambió de estado: la confirmación de cancelar era de lo de antes.
    if (!cancelando) setConfirmandoCancelar(false)
  }

  const cerrada = cita.status === "cancelada" || cita.status === "no-asistio"
  // Por confirmar, primero se confirma: no se completa ni se marca "no vino" de una.
  const puedeCompletarse = cita.status !== "completada" && !cerrada && !porConfirmar
  // Una completada ya no se cancela: si fue un error, se devuelve a confirmada.
  // Si el cliente ya llegó (atención viva en el Tablero), tampoco: el servidor
  // responde 409 y la atención se anula primero en el Tablero (#136).
  const puedeCancelarse =
    !cerrada && cita.status !== "completada" && cita.conAtencion !== true && (!porConfirmar || resuelve)
  const puedeConfirmarse = porConfirmar && resuelve
  // Reactivar es de dueña y encargado. Una cancelada, sólo si no empezó; el
  // servidor vuelve a mirar todo (y que no tenga una atención cobrada).
  const puedeReactivarse =
    reactiva &&
    !seCorrigeConAjuste &&
    ((cita.status === "cancelada" && new Date(cita.startTime).getTime() > ahora) ||
      cita.status === "completada" ||
      cita.status === "no-asistio")
  // "No vino" marcado por error se deshace acá (#96): vuelve a confirmada, con las reglas de reactivar.
  // Si al volver choca (una cancelada o de "No vino" había soltado su hora, #140), el segundo envío guarda igual.
  const reactivacion = frases.reactivar(cita.status)

  const pedirReactivar = async (confirmar: boolean) => {
    if (reactivando) return
    setReactivando(true)
    setErrorAlReactivar("")
    const resultado = await reactivarCita(cita.id, { confirmar }, palabras)
    setReactivando(false)
    if (resultado.tipo === "advertencias") return setAdvertencias(resultado.advertencias)
    setAdvertencias([])
    if (resultado.tipo === "corregir-con-ajuste") {
      setSeCorrigeConAjuste(true)
      return setErrorAlReactivar(resultado.error)
    }
    if (resultado.tipo === "error") return setErrorAlReactivar(resultado.error)
    onReactivada(cita.id, ESTADO_AL_REACTIVAR)
  }
  const puedeMoverse = sePuedeMover(cita.status)
  // Sin profesional habiendo equipo (#103): se dice, y quien puede editarla
  // (dueña y encargado, los que asignan) la asigna. El servidor vuelve a mirar
  // el permiso y avisa si choca, como al mover.
  const sinProfesional = destacaSinProfesional(cita, destacarSinProfesional)
  const asigna = sinProfesional && puedeAsignarCitasAOtros(actorDeSesion(sesion))
  const profesional = nombreDelProfesional(cita, frases.profesional.etiqueta)
  // Quién la canceló y cuándo (#134); nada en las canceladas de antes de guardarlo.
  const canceladaPor = quienCancelo(cita, palabras)
  // "No vino" cuando ya pasó la hora de empezar: antes, si avisó, se cancela.
  // Si ya llegó al Tablero no se ofrece, como "Cancelar cita"; el servidor
  // igual lo vuelve a verificar.
  const puedeNoVenir =
    puedeMarcarseNoVino(cita.status) &&
    new Date(cita.startTime).getTime() <= ahora &&
    !porConfirmar &&
    cita.conAtencion !== true

  // Clínica dental: asignar el sillón (todo rol de la clínica; el odontólogo
  // ve sólo sus citas) mientras la cita se puede mover.
  const asignaSillon = clinica && puedeAsignarSillon(actorDeSesion(sesion)) && sePuedeMover(cita.status)

  const contenido = (
    <>
      {/* La alerta de alergias va primero: es lo que hay que ver antes de atender. Mientras se revisa, se dice. */}
      {clinica && !detalleDeEsta && (
        <Aviso tono="info" rol="status">
          Revisando si tiene alergias anotadas…
        </Aviso>
      )}
      {detalleDeEsta?.ok && detalleDeEsta.datos.alergias && (
        <Aviso tono="atencion" rol="status" titulo="Alergias anotadas en su ficha">
          <span className="break-words whitespace-pre-line">{detalleDeEsta.datos.alergias}</span>
        </Aviso>
      )}
      {detalleDeEsta && !detalleDeEsta.ok && (
        <Aviso tono="atencion" rol="status" titulo="No se pudo revisar si tiene alergias">
          {detalleDeEsta.error}. Cierra y vuelve a abrir la cita, o mira su ficha antes de atender.
        </Aviso>
      )}

      <div
        className={cn(
          "rounded-[24px] bg-tarjeta p-4 squircle",
          // Sobre la tarjeta blanca del diálogo, con borde en vez de sombra.
          escritorio ? "shadow-sm" : "border border-borde"
        )}
      >
        <div className="flex items-center gap-3">
          <AvatarUsuario nombre={nombreDeCliente(cita, palabras.cliente.singular)} tamaño="lg" />
          <div className="min-w-0">
            <p className="font-semibold break-words">{nombreDeCliente(cita, palabras.cliente.singular)}</p>
            <p className="text-sm break-words text-texto-2">{cita.title}</p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-borde border-t border-borde text-sm">
          <Dato termino="Fecha">
            {/* `first-letter` y no `capitalize`, que ponía mayúscula en cada palabra. */}
            <span className="block first-letter:uppercase">{diaLargoEn(cita.startTime, zona)}</span>
          </Dato>
          <Dato termino="Horario">
            <span className="tabular-nums">
              {horaEn(cita.startTime, zona)} – {horaEn(cita.endTime, zona)}
            </span>
          </Dato>
          <Dato termino="Duración">{formatearDuracion(duracion)}</Dato>
          {sede && <Dato termino={frases.sede.etiqueta}>{sede}</Dato>}
          {(profesional || sinProfesional) && (
            <Dato termino={frases.profesional.etiqueta}>{profesional ?? "Sin asignar"}</Dato>
          )}
          {clinica && <Dato termino="Sillón">{cita.sillon?.nombre ?? "Sin sillón"}</Dato>}
          {cita.price != null && (
            <Dato termino="Precio">
              <span className="tabular-nums">{formatearMonto(cita.price)}</span>
            </Dato>
          )}
          <Dato termino="Estado">
            <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", estado.insignia)}>
              {estado.texto}
            </span>
          </Dato>
          {canceladaPor && <Dato termino={frases.cancelada.por}>{canceladaPor}</Dato>}
          {canceladaPor && cita.canceladaEn && (
            <Dato termino={frases.cancelada.el}>
              <span className="block first-letter:uppercase">
                {diaLargoEn(cita.canceladaEn, zona)}, <span className="tabular-nums">{horaEn(cita.canceladaEn, zona)}</span>
              </span>
            </Dato>
          )}
        </dl>

        {cita.notes && (
          <p className="mt-3 rounded-[16px] bg-superficie p-3 text-sm break-words text-texto-2 squircle">{cita.notes}</p>
        )}
        {/* Lo que el cliente escribió al reservar (#122): sólo se lee, y con su rótulo para no confundirlo con la nota del local. */}
        {cita.clientComments && (
          <div className="mt-3 rounded-[16px] bg-superficie p-3 text-sm squircle">
            <p className="text-xs font-medium text-texto-2">{frases.cliente.escribioAlReservar}</p>
            <p className="mt-1 break-words whitespace-pre-line">{cita.clientComments}</p>
          </div>
        )}
      </div>

      {porConfirmar && (
        <Aviso tono="atencion" rol="status" titulo="Por confirmar">
          {frases.avisoPorConfirmar(resuelve)}
        </Aviso>
      )}

      {sinProfesional && (
        <Aviso tono="atencion" rol="status" titulo={frases.profesional.sin}>
          {frases.profesional.avisoSinAsignar(asigna)}
        </Aviso>
      )}

      {asignaSillon && sillones && (
        <div className="px-1">
          <AsignarSillon
            key={cita.id}
            citaId={cita.id}
            sillonId={cita.sillonId ?? null}
            sillon={cita.sillon ?? null}
            sillones={sillones}
            onAsignado={(sillonId, sillon) => onSillonAsignado?.(cita.id, sillonId, sillon)}
          />
        </div>
      )}

      {/* La ficha del paciente (la página la hace la ficha clínica: ahí se decide qué ve cada rol). */}
      {clinica && cita.customerId && (
        <div className="px-1">
          <Boton
            href={`/dashboard/clientes/${encodeURIComponent(cita.customerId)}`}
            variante="secundario"
            tamano="sm"
            className="w-full"
          >
            Abrir ficha
          </Boton>
        </div>
      )}

      {errorAlReactivar &&
        (seCorrigeConAjuste ? (
          <Aviso tono="atencion" rol="status" titulo="Se corrige con un ajuste">
            {errorAlReactivar}
          </Aviso>
        ) : (
          <Aviso>{errorAlReactivar}</Aviso>
        ))}
      {advertencias.length > 0 && (
        <Aviso tono="atencion" rol="status" titulo={reactivacion.advertencias}>
          <ul className="list-disc space-y-1 pl-4">
            {advertencias.map((advertencia) => (
              <li key={advertencia.tipo}>{advertencia.mensaje}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {(puedeConfirmarse || asigna || puedeCompletarse || puedeCancelarse || puedeMoverse || puedeNoVenir || puedeReactivarse) && (
        <div className="grid gap-2 px-1 pb-1">
          {puedeConfirmarse && (
            <Boton tamano="sm" className="w-full" onClick={() => void onCambiarEstado(cita.id, "confirmada")}>
              Confirmar reserva
            </Boton>
          )}
          {puedeReactivarse && (
            <Boton
              tamano="sm"
              className="w-full"
              disabled={reactivando}
              aria-busy={reactivando}
              onClick={() => pedirReactivar(advertencias.length > 0)}
            >
              {advertencias.length > 0 ? reactivacion.botonIgual : reactivacion.boton}
            </Boton>
          )}
          {asigna && (
            <Boton tamano="sm" className="w-full" onClick={() => onAsignar(cita)}>
              {frases.profesional.asignar}
            </Boton>
          )}
          {puedeMoverse && (
            <Boton tamano="sm" variante="secundario" className="w-full" onClick={() => onMover(cita)}>
              Cambiar fecha y hora
            </Boton>
          )}
          {puedeCompletarse && (
            <Boton tamano="sm" className="w-full" onClick={() => void onCambiarEstado(cita.id, "completada")}>
              {frases.marcarCompletada}
            </Boton>
          )}
          {puedeNoVenir && (
            <Boton tamano="sm" variante="secundario" className="w-full" onClick={() => void onCambiarEstado(cita.id, "no-asistio")}>
              {frases.noVino}
            </Boton>
          )}
          {puedeCancelarse && (
            <BotonPrimario
              variante="peligro"
              anchoCompleto
              tamaño="sm"
              onClick={pedirCancelar}
            >
              {frases.cancelarCita}
            </BotonPrimario>
          )}
        </div>
      )}
    </>
  )

  // Fuera del panel y no adentro: en el teléfono el panel ya es un diálogo, y
  // la confirmación va encima, como un diálogo aparte (MarcoDeModal atiende
  // Escape y el foco sólo en el de arriba).
  const confirmacionDeCancelar = (
    <AnimatePresence onExitComplete={alSalirLaConfirmacion}>
      {confirmandoCancelar && (
        <ModalConfirmar
          titulo={frases.preguntaCancelar}
          descripcion={`${nombreDeCliente(cita, palabras.cliente.singular)}, ${diaLargoEn(cita.startTime, zona)} a las ${horaEn(cita.startTime, zona)}. Su hora queda libre para otra reserva.`}
          textoConfirmar={frases.cancelarCita}
          textoCancelar="No cancelar"
          peligro
          trabajando={cancelando}
          aviso={errorAlCancelar}
          onConfirmar={() => void cancelar()}
          onCerrar={() => setConfirmandoCancelar(false)}
        />
      )}
    </AnimatePresence>
  )

  if (!escritorio) {
    return (
      <>
        <MarcoDeModal titulo={frases.detalleDeLaCita} antetitulo="Agenda" alCerrar={onCerrar}>
          <div ref={panel} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
            {aviso && <Aviso>{aviso}</Aviso>}
            {contenido}
          </div>
        </MarcoDeModal>
        {confirmacionDeCancelar}
      </>
    )
  }

  return (
    <>
      <motion.aside
        ref={panel}
        aria-labelledby={idDelTitulo}
        className="flex w-80 shrink-0 flex-col gap-3 rounded-panel bg-superficie p-3 text-navy squircle lg:sticky lg:top-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FUNDIDO}
      >
        <div className="flex items-center justify-between gap-2 pl-3">
          <h2 ref={titulo} id={idDelTitulo} tabIndex={-1} className="antetitulo rounded-md anillo-foco">
            {frases.detalleDeLaCita}
          </h2>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar el detalle"
            className="grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-borde"
          >
            <X className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>

        {contenido}
      </motion.aside>
      {confirmacionDeCancelar}
    </>
  )
}

/** Un renglón del detalle: el nombre del dato a la izquierda, el valor a la derecha. */
function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-texto-2">{termino}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  )
}
