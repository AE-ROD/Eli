"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { formatearMonto } from "@/lib/dinero"
import { duracionParaMostrar } from "@/lib/fechas"
import { sePuedeMover, type Advertencia } from "@/lib/mover-cita"
import { puedeMarcarseNoVino } from "@/lib/campos-del-panel"
import { actorDeSesion, puedeAsignarCitasAOtros, puedeReactivarCita, puedeResolverPorConfirmar } from "@/lib/permisos"
import { conJson, pedirConCuerpo } from "@/lib/peticiones"
import { Aviso } from "@/components/panel/aviso"
import { cn } from "@/lib/utils"
import { citaPorConfirmar, destacaSinProfesional, nombreDeCliente, nombreDelProfesional, type Cita } from "../_datos"
import { estiloDeEstado } from "./estados-de-cita"
import { useAhora } from "./usar-ahora"
import { useZonaDelNegocio } from "./zona-del-negocio"
import { diaLargoEn, horaEn } from "../_hora-del-negocio"

/** Un fundido corto al abrir y al cerrar: el panel no se desliza. */
const FUNDIDO = { duration: DURACION.sombra, ease: CURVA.suave }

interface PropsDePanelDeCita {
  cita: Cita
  onCerrar: () => void
  onCambiarEstado: (id: string, estado: string) => void
  /** Abre el modal para cambiar la fecha, la hora y (si se puede) el profesional. */
  onMover: (cita: Cita) => void
  /** La cita ya se reactivó en el servidor: la agenda la muestra con su estado nuevo. */
  onReactivada: (id: string, estado: string) => void
  /** Abre el modal para elegirle profesional a una cita sin asignar (#103). */
  onAsignar: (cita: Cita) => void
  /** Si hay profesionales a quien asignar: entonces se dice que la cita no tiene y se ofrece asignarla. */
  destacarSinProfesional?: boolean
}

/** A qué estado vuelve una cita al reactivarla: una cancelada, o una completada o de alguien que no vino. */
const ESTADO_AL_REACTIVAR = "confirmada"

function sonAdvertencias(valor: unknown): valor is Advertencia[] {
  return Array.isArray(valor) && valor.length > 0 && valor.every((item) => typeof item?.mensaje === "string")
}

/**
 * Reactiva la cita (PUT de su estado). Si vuelve a ocupar un horario que
 * choca, el servidor responde 409 con las advertencias; `confirmar` es el
 * segundo envío, después de verlas.
 */
async function reactivar(id: string, confirmar: boolean) {
  const resultado = await pedirConCuerpo(
    `/api/citas/${encodeURIComponent(id)}`,
    "No se pudo reactivar la cita",
    conJson("PUT", { status: ESTADO_AL_REACTIVAR, ...(confirmar && { confirmarAdvertencias: true }) })
  )
  if (resultado.ok) return { tipo: "lista" as const }
  const advertencias = (resultado.cuerpo as { advertencias?: unknown } | null)?.advertencias
  if (resultado.codigo === 409 && sonAdvertencias(advertencias)) return { tipo: "advertencias" as const, advertencias }
  return { tipo: "error" as const, error: resultado.error }
}

/**
 * El detalle de la cita elegida, al lado del calendario: una isla gris, como
 * las columnas del tablero, con los datos en una tarjeta blanca y las
 * acciones debajo. Desde `lg` queda fija al bajar por la página.
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
}: PropsDePanelDeCita) {
  const { data: sesion } = useSession()
  // El día y las horas de la cita, en la zona del negocio (#99).
  const zona = useZonaDelNegocio()
  const reactiva = puedeReactivarCita(actorDeSesion(sesion))
  // Por confirmar tras faltas (#84): la confirman o la cancelan dueña y
  // encargado. Al profesional el servidor le responde 401 a cualquier cambio
  // de estado, así que no se le ofrece ninguno.
  const porConfirmar = citaPorConfirmar(cita)
  const resuelve = puedeResolverPorConfirmar(actorDeSesion(sesion))
  const [reactivando, setReactivando] = useState(false)
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([])
  const [errorAlReactivar, setErrorAlReactivar] = useState("")
  const idDelTitulo = useId()
  const panel = useRef<HTMLElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const abridor = useRef<HTMLElement | null>(null)
  const ultimaVista = useRef({ id: cita.id, estado: cita.status })
  // Con esta hora se decide si ya pasó la de la cita: se renueva al pasar a otra y cada medio minuto (#100).
  const ahora = useAhora(cita.id)
  const estado = estiloDeEstado(cita.status, porConfirmar)
  const duracion = duracionParaMostrar(cita.startTime, cita.endTime)

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
    if (cambioDeEstado && sinFoco) titulo.current?.focus({ preventScroll: true })
  }, [cita.id, cita.status])

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
    ((cita.status === "cancelada" && new Date(cita.startTime).getTime() > ahora) ||
      cita.status === "completada" ||
      cita.status === "no-asistio")
  // "No vino" marcado por error se deshace acá (#96): vuelve a confirmada, con las reglas de reactivar.
  const textoDeReactivar =
    cita.status === "cancelada" ? "Reactivar cita" : cita.status === "no-asistio" ? "Deshacer «No vino»" : "Devolver a confirmada"
  // Si al volver choca (una cancelada o de "No vino" había soltado su hora, #140), el segundo envío guarda igual.
  const textoDeReactivarIgual = cita.status === "no-asistio" ? "Deshacer igual" : "Reactivar igual"

  const pedirReactivar = async (confirmar: boolean) => {
    if (reactivando) return
    setReactivando(true)
    setErrorAlReactivar("")
    const resultado = await reactivar(cita.id, confirmar)
    setReactivando(false)
    if (resultado.tipo === "advertencias") return setAdvertencias(resultado.advertencias)
    setAdvertencias([])
    if (resultado.tipo === "error") return setErrorAlReactivar(resultado.error)
    onReactivada(cita.id, ESTADO_AL_REACTIVAR)
  }
  const puedeMoverse = sePuedeMover(cita.status)
  // Sin profesional habiendo equipo (#103): se dice, y quien puede editarla
  // (dueña y encargado, los que asignan) la asigna. El servidor vuelve a mirar
  // el permiso y avisa si choca, como al mover.
  const sinProfesional = destacaSinProfesional(cita, destacarSinProfesional)
  const asigna = sinProfesional && puedeAsignarCitasAOtros(actorDeSesion(sesion))
  const profesional = nombreDelProfesional(cita)
  // "No vino" cuando ya pasó la hora de empezar: antes, si avisó, se cancela.
  // El servidor lo vuelve a verificar (y que no haya llegado al Tablero).
  const puedeNoVenir =
    puedeMarcarseNoVino(cita.status) && new Date(cita.startTime).getTime() <= ahora && !porConfirmar

  return (
    <motion.aside
      ref={panel}
      aria-labelledby={idDelTitulo}
      className="hidden w-80 shrink-0 flex-col gap-3 rounded-panel bg-superficie p-3 text-navy squircle lg:sticky lg:top-6 lg:flex"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FUNDIDO}
    >
      <div className="flex items-center justify-between gap-2 pl-3">
        <h2 ref={titulo} id={idDelTitulo} tabIndex={-1} className="antetitulo rounded-md anillo-foco">
          Detalle de cita
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

      <div className="rounded-[24px] bg-tarjeta p-4 shadow-sm squircle">
        <div className="flex items-center gap-3">
          <AvatarUsuario nombre={nombreDeCliente(cita)} tamaño="lg" />
          <div className="min-w-0">
            <p className="font-semibold break-words">{nombreDeCliente(cita)}</p>
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
          <Dato termino="Duración">{duracion} minutos</Dato>
          {(profesional || sinProfesional) && <Dato termino="Profesional">{profesional ?? "Sin asignar"}</Dato>}
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
        </dl>

        {cita.notes && (
          <p className="mt-3 rounded-[16px] bg-superficie p-3 text-sm break-words text-texto-2 squircle">{cita.notes}</p>
        )}
      </div>

      {porConfirmar && (
        <Aviso tono="atencion" rol="status" titulo="Por confirmar">
          {resuelve
            ? "Este contacto faltó a citas anteriores. Confírmala si la aceptas, o cancélala: al confirmarla le avisamos por correo."
            : "Este contacto faltó a citas anteriores: la confirma o la cancela la dueña o el encargado."}
        </Aviso>
      )}

      {sinProfesional && (
        <Aviso tono="atencion" rol="status" titulo="Sin profesional">
          {asigna
            ? "Mientras no tenga profesional, en la reserva pública ocupa la hora de todo el equipo. Asígnala para liberar a los demás."
            : "Mientras no tenga profesional, en la reserva pública ocupa la hora de todo el equipo. La asigna la dueña o el encargado."}
        </Aviso>
      )}

      {errorAlReactivar && <Aviso>{errorAlReactivar}</Aviso>}
      {advertencias.length > 0 && (
        <Aviso tono="atencion" rol="status" titulo={cita.status === "no-asistio" ? "Al volver a confirmarla:" : "Al reactivarla:"}>
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
            <Boton tamano="sm" className="w-full" onClick={() => onCambiarEstado(cita.id, "confirmada")}>
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
              {advertencias.length > 0 ? textoDeReactivarIgual : textoDeReactivar}
            </Boton>
          )}
          {asigna && (
            <Boton tamano="sm" className="w-full" onClick={() => onAsignar(cita)}>
              Asignar profesional
            </Boton>
          )}
          {puedeMoverse && (
            <Boton tamano="sm" variante="secundario" className="w-full" onClick={() => onMover(cita)}>
              Cambiar fecha y hora
            </Boton>
          )}
          {puedeCompletarse && (
            <Boton tamano="sm" className="w-full" onClick={() => onCambiarEstado(cita.id, "completada")}>
              Marcar completada
            </Boton>
          )}
          {puedeNoVenir && (
            <Boton tamano="sm" variante="secundario" className="w-full" onClick={() => onCambiarEstado(cita.id, "no-asistio")}>
              No vino
            </Boton>
          )}
          {puedeCancelarse && (
            <BotonPrimario
              variante="peligro"
              anchoCompleto
              tamaño="sm"
              onClick={() => onCambiarEstado(cita.id, "cancelada")}
            >
              Cancelar cita
            </BotonPrimario>
          )}
        </div>
      )}
    </motion.aside>
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
