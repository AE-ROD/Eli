"use client"

import { useEffect, useId, useRef } from "react"
import { motion } from "framer-motion"
import { CalendarClock, CalendarDays, Clock, Mail, Pencil, Phone, Trash2, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { CAMPO } from "@/components/panel/estilos"
import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, duracionParaMostrar } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { Aviso } from "@/components/panel/aviso"
import { EtiquetaDeCliente, type ClienteEnTarjeta } from "./tarjeta-cliente"
import type { CitaDeCliente } from "../_datos"

/** Un fundido corto al abrir y al cerrar: la ficha no se desliza. */
const FUNDIDO = { duration: DURACION.sombra, ease: CURVA.suave }

/** Cada bloque de la ficha: una tarjeta blanca sobre la isla gris. */
const BLOQUE = "rounded-[24px] bg-tarjeta p-4 shadow-sm squircle"

function mapearCitaParaTarjeta(cita: CitaDeCliente, nombreCliente: string): CitaEnTarjeta {
  const estadosValidos = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada"] as const
  const estado = estadosValidos.includes(cita.status as (typeof estadosValidos)[number])
    ? (cita.status as CitaEnTarjeta["estado"])
    : "pendiente"
  return {
    id: cita.id,
    nombreCliente,
    servicio: cita.title,
    horaInicio: formatearHora(cita.startTime),
    horaFin: formatearHora(cita.endTime ?? cita.startTime),
    duracion: duracionParaMostrar(cita.startTime, cita.endTime ?? cita.startTime),
    estado,
  }
}

/** `6 de octubre de 2026`: el día de una cita del historial. La tarjeta dice la hora, no el día. */
function fechaDeLaCita(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
}

interface PropsDePanelDetalleCliente {
  cliente: ClienteEnTarjeta
  /** Sus últimas citas, de la más reciente a la más vieja. */
  citas: CitaDeCliente[]
  notas: string
  guardandoNotas: boolean
  /**
   * Por qué no se guardaron las notas, si falló. Se muestra bajo el campo: el
   * guardado sale de su blur, y un aviso arriba de la página quedaría fuera de
   * la vista.
   */
  avisoDeNotas: string
  /**
   * Si quien mira puede cambiar los datos y eliminar al cliente (dueño y
   * encargado, `puedeEditarDatosDeCliente` y `puedeBorrarCliente`). El
   * servidor lo vuelve a verificar: esto sólo decide qué botones se ven.
   */
  puedeEditar: boolean
  puedeEliminar: boolean
  onEditar: () => void
  onEliminar: () => void
  onCerrar: () => void
  onCambiarNotas: (notas: string) => void
  onNotasBlur: () => void
}

/**
 * La ficha del cliente elegido, al lado de la lista: una isla gris, como las
 * columnas del tablero, con un bloque blanco para los datos, otro para sus
 * últimas citas y otro para las notas. Desde `lg` queda fija al bajar por la
 * página y, si no entra en el alto, se desplaza adentro.
 *
 * Al cerrarla, el foco vuelve a la tarjeta que la abrió; si no, el botón de
 * cerrar desaparecía con el foco adentro y el teclado volvía al principio.
 */
export function PanelDetalleCliente({
  cliente,
  citas,
  notas,
  guardandoNotas,
  avisoDeNotas,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onEliminar,
  onCerrar,
  onCambiarNotas,
  onNotasBlur,
}: PropsDePanelDetalleCliente) {
  const idDelNombre = useId()
  const idDelHistorial = useId()
  const idDeNotas = useId()
  const idDelCampoDeNotas = useId()
  const idDeLaAyuda = useId()
  const panel = useRef<HTMLElement>(null)
  const abridor = useRef<HTMLElement | null>(null)
  const avisoDeLasNotas = useRef<HTMLDivElement>(null)

  // Lo que tiene el foco al abrir la ficha, o al pasar a otro cliente, es lo que la abrió.
  useEffect(() => {
    const enfocado = document.activeElement
    if (enfocado instanceof HTMLElement && !panel.current?.contains(enfocado)) abridor.current = enfocado
  }, [cliente.id])

  // La ficha se desplaza por dentro, y el aviso aparece debajo del campo, que
  // puede haber quedado justo en el borde: se trae a la vista, lo mínimo.
  useEffect(() => {
    if (avisoDeNotas) avisoDeLasNotas.current?.scrollIntoView({ block: "nearest" })
  }, [avisoDeNotas])

  const cerrar = () => {
    const destino = abridor.current
    onCerrar()
    if (destino?.isConnected) destino.focus({ preventScroll: true })
  }

  return (
    <motion.aside
      ref={panel}
      aria-labelledby={idDelNombre}
      className="hidden w-96 shrink-0 flex-col gap-3 rounded-panel bg-superficie p-3 text-navy squircle lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FUNDIDO}
    >
      {/* Cabecera */}
      <div className="flex items-start gap-3 pt-1 pl-2">
        <AvatarUsuario nombre={cliente.nombre} tamaño="xl" />
        <div className="min-w-0 flex-1 pt-1">
          <p className="antetitulo">Ficha del cliente</p>
          <h2 id={idDelNombre} className="titulo-3 mt-1 font-serif text-balance break-words">
            {cliente.nombre}
          </h2>
          {cliente.etiqueta && <EtiquetaDeCliente etiqueta={cliente.etiqueta} className="mt-2" />}
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar la ficha"
          className="grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-borde"
        >
          <X className="size-5" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      {/* Datos de contacto */}
      <section aria-label="Datos del cliente" className={BLOQUE}>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <Mail className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            <span className="min-w-0 wrap-anywhere">{cliente.email}</span>
          </li>
          <li className="flex items-start gap-3">
            <Phone className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            <span className="min-w-0 wrap-anywhere">{cliente.telefono}</span>
          </li>
          <li className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            <span>{cliente.visitas === 1 ? "1 visita registrada" : `${cliente.visitas} visitas registradas`}</span>
          </li>
          <li className="flex items-start gap-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            <span className="text-texto-2">Última visita: {cliente.ultimaVisita}</span>
          </li>
          {cliente.proximaCita && (
            <li className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
              <span className="text-texto-2">Próxima cita: {cliente.proximaCita}</span>
            </li>
          )}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Boton tamano="sm" className="w-full">
            Agendar cita
          </Boton>
          <Boton variante="secundario" tamano="sm" className="w-full">
            Enviar mensaje
          </Boton>
        </div>

        {(puedeEditar || puedeEliminar) && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {puedeEditar && (
              <Boton variante="fantasma" tamano="sm" className="w-full" icono={<Pencil className="size-4" aria-hidden="true" />} onClick={onEditar}>
                Editar
              </Boton>
            )}
            {puedeEliminar && (
              <Boton
                variante="fantasma"
                tamano="sm"
                className="w-full text-error hover:text-error"
                icono={<Trash2 className="size-4" aria-hidden="true" />}
                onClick={onEliminar}
              >
                Eliminar cliente
              </Boton>
            )}
          </div>
        )}
      </section>

      {/* Historial, con la tarjeta compacta de las citas */}
      <section aria-labelledby={idDelHistorial} className={BLOQUE}>
        <h3 id={idDelHistorial} className="font-semibold">
          Últimas citas
        </h3>
        {citas.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {citas.map((cita) => (
              <li key={cita.id}>
                <p className="mb-1.5 flex items-baseline justify-between gap-3 px-1 text-xs text-texto-2">
                  <span>{fechaDeLaCita(cita.startTime)}</span>
                  {cita.price != null && <span className="tabular-nums">{formatearMonto(cita.price)}</span>}
                </p>
                <TarjetaCita cita={mapearCitaParaTarjeta(cita, cliente.nombre)} compacta />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-[20px] border-2 border-dashed border-borde px-4 py-5 text-center text-sm text-texto-2 squircle">
            Sin citas registradas
          </p>
        )}
      </section>

      {/* Notas */}
      <section aria-labelledby={idDeNotas} className={BLOQUE}>
        <h3 id={idDeNotas} className="font-semibold">
          <label htmlFor={idDelCampoDeNotas}>Notas</label>
        </h3>
        {/* 16px de letra: con menos, el teléfono acerca la pantalla al tocar el campo. */}
        <textarea
          id={idDelCampoDeNotas}
          value={notas}
          onChange={(e) => onCambiarNotas(e.target.value)}
          onBlur={onNotasBlur}
          placeholder="Agregar notas sobre el cliente..."
          aria-describedby={idDeLaAyuda}
          className={cn(CAMPO, "mt-2 h-28 resize-none px-4 py-3 text-base")}
        />
        <p id={idDeLaAyuda} className="mt-1.5 text-xs text-texto-2">
          Se guardan al salir del campo.
        </p>
        {/* Siempre en la página, aunque vacío: una región que aparece recién con el texto no se anuncia. */}
        <p role="status" className="text-xs text-texto-2">
          {guardandoNotas ? "Guardando..." : ""}
        </p>
        <div ref={avisoDeLasNotas}>{avisoDeNotas && <Aviso className="mt-2">{avisoDeNotas}</Aviso>}</div>
      </section>
    </motion.aside>
  )
}
