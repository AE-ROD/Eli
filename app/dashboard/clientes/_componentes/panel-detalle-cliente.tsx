"use client"

import { useEffect, useEffectEvent, useId, useRef, type ReactNode, type RefObject } from "react"
import { motion } from "framer-motion"
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ClipboardList,
  Clock,
  Mail,
  MailCheck,
  MailX,
  MessageCircle,
  Pencil,
  Phone,
  Trash2,
  X,
} from "lucide-react"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { CAMPO } from "@/components/panel/estilos"
import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { ESTADOS_DE_CITA } from "@/lib/campos-del-panel"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, duracionParaMostrar } from "@/lib/fechas"
import { sigueSinConfirmar } from "@/lib/por-confirmar"
import { cn } from "@/lib/utils"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { Aviso } from "@/components/panel/aviso"
import { EtiquetaDeCliente, type ClienteEnTarjeta } from "./tarjeta-cliente"
import type { CitaDeCliente } from "../_datos"
import { asuntoDelSaludo, enlaceDeCorreo, enlaceDeWhatsapp, saludoSugerido } from "../_escribirle"
import { frasesDeClientes } from "../_frases"

/** Las palabras de un rubro sin palabras propias: lo que dice la ficha si quien la usa no pasa las suyas. */
const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/** Un fundido corto al abrir y al cerrar: la ficha no se desliza. */
const FUNDIDO = { duration: DURACION.sombra, ease: CURVA.suave }

/** Cada bloque de la ficha: una tarjeta blanca sobre la isla gris. */
const BLOQUE = "rounded-[24px] bg-tarjeta p-4 shadow-sm squircle"

/** Lo que se puede enfocar con Tab dentro de la hoja. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Las alergias del paciente para la alerta (clínica dental), mientras se
 * leen, si no se pudieron leer, o lo que hay anotado (`null`: nada). Que no se
 * hayan podido leer no es lo mismo que "sin alergias": se dice.
 */
export type AlergiasDelPanel = { estado: "cargando" } | { estado: "error" } | { estado: "listo"; alergias: string | null }

function mapearCitaParaTarjeta(cita: CitaDeCliente, nombreCliente: string, zona: string): CitaEnTarjeta {
  const estado = (ESTADOS_DE_CITA as readonly string[]).includes(cita.status)
    ? (cita.status as CitaEnTarjeta["estado"])
    : "pendiente"
  return {
    id: cita.id,
    nombreCliente,
    servicio: cita.title,
    horaInicio: formatearHora(cita.startTime, zona),
    horaFin: formatearHora(cita.endTime ?? cita.startTime, zona),
    duracion: duracionParaMostrar(cita.startTime, cita.endTime ?? cita.startTime),
    estado,
    porConfirmar: sigueSinConfirmar(cita),
  }
}

/**
 * `6 de octubre de 2026`: el día de una cita del historial, en la zona del
 * negocio (como la agenda), no en la del dispositivo: una cita de las 22:00
 * vista desde otro huso caía en otro día. La tarjeta dice la hora, no el día.
 */
function fechaDeLaCita(iso: string, zona: string): string {
  const opciones = { day: "numeric", month: "long", year: "numeric" } as const
  try {
    return new Date(iso).toLocaleDateString("es-CL", { ...opciones, timeZone: zona })
  } catch {
    // Una zona que el navegador no conoce lanza: queda la del dispositivo antes que nada.
    return new Date(iso).toLocaleDateString("es-CL", opciones)
  }
}

interface PropsDePanelDetalleCliente {
  cliente: ClienteEnTarjeta
  /** Las palabras del rubro: "cliente" o, en una clínica dental, "paciente". Sin ellas, las de siempre. */
  palabras?: PalabrasDelRubro
  /**
   * Sólo en una clínica dental: el acceso a la ficha clínica del paciente y,
   * si las hay anotadas, sus alergias, que salen como alerta para todo rol de
   * la clínica (también el encargado: es lo único de la ficha que ve). Las
   * trae el detalle del paciente (`leerAlergiasDelPaciente`). En los demás
   * rubros no viene y el panel queda como siempre.
   */
  fichaClinica?: {
    ruta: string
    /** Sin ellas, quien mira no ve la alerta (`veAlertaDeAlergias`). */
    alergias?: AlergiasDelPanel
    alReintentarAlergias?: () => void
  }
  /** Sus últimas citas, de la más reciente a la más vieja. */
  citas: CitaDeCliente[]
  /** La zona horaria del negocio: el historial se lee en su hora, como la agenda. */
  zona: string
  /** El teléfono (E.164) y el correo como están guardados, para "Enviar mensaje". */
  contacto: { telefono: string | null; email: string | null }
  /** Para firmar el saludo: "Te escribimos de …". */
  nombreNegocio: string
  /** La agenda, con el formulario de cita nueva abierto para este cliente. */
  rutaParaAgendar: string
  /** Si tiene el consentimiento vigente para avisos y novedades por correo ("te toca", reseñas). */
  avisosPorCorreo?: boolean
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
  /**
   * Por debajo de `lg` no hay lugar al lado de la lista: la ficha se abre como
   * una hoja sobre la página (un diálogo), con lo mismo adentro.
   */
  comoHoja?: boolean
  /**
   * Mientras hay otro diálogo encima (editar o eliminar al cliente, abiertos
   * desde la hoja), la hoja no se puede tocar ni enfocar (`inert`) y no
   * atiende Escape: el de arriba es el activo.
   */
  enSegundoPlano?: boolean
}

/**
 * La ficha del cliente elegido, al lado de la lista: una isla gris, como las
 * columnas del tablero, con un bloque blanco para los datos, otro para sus
 * últimas citas y otro para las notas. Desde `lg` queda fija al bajar por la
 * página y, si no entra en el alto, se desplaza adentro. Por debajo de `lg`
 * (`comoHoja`) es la misma ficha en una hoja que sube desde abajo, con velo:
 * un diálogo que se cierra con Escape, con la X o tocando el velo, y del que
 * el foco no sale con Tab.
 *
 * Al cerrarla, el foco vuelve a la tarjeta que la abrió; si no, el botón de
 * cerrar desaparecía con el foco adentro y el teclado volvía al principio.
 */
export function PanelDetalleCliente({
  cliente,
  palabras = PALABRAS_NEUTRAS,
  fichaClinica,
  citas,
  zona,
  contacto,
  nombreNegocio,
  rutaParaAgendar,
  avisosPorCorreo = false,
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
  comoHoja = false,
  enSegundoPlano = false,
}: PropsDePanelDetalleCliente) {
  const { ficha } = frasesDeClientes(palabras)
  const idDelNombre = useId()
  const idDelHistorial = useId()
  const idDeNotas = useId()
  const idDelCampoDeNotas = useId()
  const idDeLaAyuda = useId()
  const panel = useRef<HTMLDivElement>(null)
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

  const saludo = saludoSugerido({ nombre: cliente.nombre, nombreNegocio })
  const whatsapp = enlaceDeWhatsapp(contacto.telefono, saludo)
  const correo = enlaceDeCorreo(contacto.email, asuntoDelSaludo(nombreNegocio), saludo)
  const alergias = fichaClinica?.alergias

  const contenido = (
    <>
      {/* Cabecera */}
      <div className="flex items-start gap-3 pt-1 pl-2">
        <AvatarUsuario nombre={cliente.nombre} tamaño="xl" />
        <div className="min-w-0 flex-1 pt-1">
          <p className="antetitulo">{ficha.antetitulo}</p>
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

      {/* Clínica dental: la alerta de alergias y el acceso a la ficha clínica, lo primero. */}
      {fichaClinica && (
        <section aria-label="Ficha clínica" className={cn(BLOQUE, "space-y-3")}>
          {alergias?.estado === "cargando" && (
            <p role="status" className="text-sm text-texto-2">
              Revisando alergias...
            </p>
          )}
          {alergias?.estado === "error" && (
            <Aviso
              titulo="No se pudieron leer las alergias"
              accion={
                fichaClinica.alReintentarAlergias && (
                  <Boton type="button" variante="secundario" tamano="sm" onClick={fichaClinica.alReintentarAlergias}>
                    Reintentar
                  </Boton>
                )
              }
            >
              Antes de atender, míralas en la ficha clínica.
            </Aviso>
          )}
          {alergias?.estado === "listo" &&
            (alergias.alergias ? (
              <Aviso tono="atencion" titulo="Alergias">
                <span className="whitespace-pre-line">{alergias.alergias}</span>
              </Aviso>
            ) : (
              <p className="text-sm text-texto-2">Sin alergias anotadas.</p>
            ))}
          <Boton href={fichaClinica.ruta} tamano="sm" className="w-full" icono={<ClipboardList aria-hidden="true" />}>
            Abrir ficha clínica
          </Boton>
        </section>
      )}

      {/* Datos de contacto */}
      <section aria-label={ficha.datos} className={BLOQUE}>
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
            <CalendarX className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            <span className={cliente.inasistencias > 0 ? undefined : "text-texto-2"}>
              {ficha.inasistencias(cliente.inasistencias)}
            </span>
          </li>
          <li className="flex items-start gap-3">
            {avisosPorCorreo ? (
              <MailCheck className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <MailX className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            )}
            <span className={avisosPorCorreo ? undefined : "text-texto-2"}>
              {avisosPorCorreo ? "Recibe avisos y novedades por correo" : "No recibe avisos ni novedades por correo"}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
            <span className="text-texto-2">Última visita: {cliente.ultimaVisita}</span>
          </li>
          {cliente.proximaCita && (
            <li className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
              <span className="text-texto-2">{ficha.proxima}: {cliente.proximaCita}</span>
            </li>
          )}
        </ul>

        {/*
          Agendar abre la agenda con la cita nueva para este cliente. Escribirle
          abre WhatsApp o el correo de quien mira con un saludo listo para
          seguir, como "Escribirle" en "Se están yendo": lo manda la persona,
          no Eli. Sin teléfono ni correo con forma válida, no hay enlace.
        */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Boton href={rutaParaAgendar} tamano="sm" className="min-w-36 flex-1" icono={<CalendarPlus aria-hidden="true" strokeWidth={1.75} />}>
            {ficha.agendar}
          </Boton>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "min-w-36 flex-1" })}
            >
              <MessageCircle className="size-4" aria-hidden="true" strokeWidth={1.75} />
              <span>
                WhatsApp<span className="sr-only">: escribirle a {cliente.nombre}</span>
              </span>
            </a>
          )}
          {correo && (
            <a href={correo} className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "min-w-36 flex-1" })}>
              <Mail className="size-4" aria-hidden="true" strokeWidth={1.75} />
              <span>
                Correo<span className="sr-only">: escribirle a {cliente.nombre}</span>
              </span>
            </a>
          )}
        </div>
        {!whatsapp && !correo && (
          <p className="mt-2 text-xs text-texto-2">Sin teléfono ni correo para escribirle.</p>
        )}

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
                {ficha.eliminar}
              </Boton>
            )}
          </div>
        )}
      </section>

      {/* Historial, con la tarjeta compacta de las citas */}
      <section aria-labelledby={idDelHistorial} className={BLOQUE}>
        <h3 id={idDelHistorial} className="font-semibold">
          {ficha.historial}
        </h3>
        {citas.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {citas.map((cita) => (
              <li key={cita.id}>
                <p className="mb-1.5 flex items-baseline justify-between gap-3 px-1 text-xs text-texto-2">
                  <span>{fechaDeLaCita(cita.startTime, zona)}</span>
                  {cita.price != null && <span className="tabular-nums">{formatearMonto(cita.price)}</span>}
                </p>
                <TarjetaCita cita={mapearCitaParaTarjeta(cita, cliente.nombre, zona)} compacta />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-[20px] border-2 border-dashed border-borde px-4 py-5 text-center text-sm text-texto-2 squircle">
            {ficha.sinHistorial}
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
          placeholder={ficha.notasPlaceholder}
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
    </>
  )

  if (comoHoja) {
    return (
      <HojaDeLaFicha
        panelRef={panel}
        idDelTitulo={idDelNombre}
        enSegundoPlano={enSegundoPlano}
        abridorRef={abridor}
        alCerrar={cerrar}
      >
        {contenido}
      </HojaDeLaFicha>
    )
  }

  return (
    <motion.aside
      ref={panel}
      aria-labelledby={idDelNombre}
      className="flex w-96 shrink-0 flex-col gap-3 rounded-panel bg-superficie p-3 text-navy squircle lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FUNDIDO}
    >
      {contenido}
    </motion.aside>
  )
}

/** Lo que se ve y se enfoca con Tab: lo que está oculto o deshabilitado no cuenta. */
function enfocables(nodo: HTMLElement): HTMLElement[] {
  return Array.from(nodo.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
    (elemento) => !elemento.matches(":disabled") && elemento.getClientRects().length > 0
  )
}

/**
 * La ficha por debajo de `lg`: una hoja que sube desde abajo (en el teléfono,
 * de todo el ancho; desde `sm`, centrada), sobre un velo navy. Es un diálogo:
 * al abrirse el foco entra, Tab da la vuelta adentro, Escape y el velo la
 * cierran, y al cerrarse el foco vuelve a la tarjeta que la abrió. Va por
 * debajo de los modales del panel (z-40 contra z-50): editar o eliminar se
 * abren encima, y mientras tanto la hoja queda `inert`.
 *
 * Escape y Tab sólo cuentan con el foco en la hoja (o perdido en el <body>):
 * así no le pelean las teclas al modal que se abra encima.
 */
function HojaDeLaFicha({
  panelRef,
  idDelTitulo,
  enSegundoPlano,
  abridorRef,
  alCerrar,
  children,
}: {
  panelRef: RefObject<HTMLDivElement | null>
  idDelTitulo: string
  enSegundoPlano: boolean
  abridorRef: RefObject<HTMLElement | null>
  alCerrar: () => void
  children: ReactNode
}) {
  // Al abrirse, el foco entra a la hoja. Al desmontarse sin pasar por la X
  // (se eliminó el cliente, o la pantalla se agrandó), si el foco quedó
  // adentro o perdido, vuelve a lo que la abrió.
  useEffect(() => {
    const nodo = panelRef.current
    // Lo que tenía el foco es lo que la abrió. Se anota acá y no en el efecto
    // de la ficha: el de la hoja (hija) corre antes y ya movió el foco adentro.
    const previo = document.activeElement
    if (previo instanceof HTMLElement && previo !== document.body && !nodo?.contains(previo)) abridorRef.current = previo
    if (!nodo?.contains(document.activeElement)) nodo?.focus({ preventScroll: true })
    const destino = abridorRef
    return () => {
      const actual = document.activeElement
      const perdido = !actual || actual === document.body || nodo?.contains(actual)
      if (perdido && destino.current?.isConnected) destino.current.focus({ preventScroll: true })
    }
  }, [panelRef, abridorRef])

  // Escape y Tab se atienden en el documento, pero sólo cuando el foco está
  // en la hoja o perdido en el <body> (el botón que se tocó desapareció, como
  // "Reintentar"): con un modal encima, el foco está en él y la hoja no se
  // mete. Mientras está en segundo plano, nada.
  const cerrarConEscape = useEffectEvent(() => alCerrar())
  useEffect(() => {
    const nodo = panelRef.current
    if (!nodo || enSegundoPlano) return
    const alTeclear = (evento: globalThis.KeyboardEvent) => {
      const actual = document.activeElement
      const enLaHoja = !actual || actual === document.body || nodo.contains(actual)
      if (!enLaHoja || evento.defaultPrevented) return
      if (evento.key === "Escape") {
        evento.preventDefault()
        cerrarConEscape()
        return
      }
      if (evento.key !== "Tab") return
      const lista = enfocables(nodo)
      if (lista.length === 0) {
        evento.preventDefault()
        nodo.focus()
        return
      }
      const primero = lista[0]
      const ultimo = lista[lista.length - 1]
      if (!nodo.contains(actual)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
      } else if (evento.shiftKey && (actual === primero || actual === nodo)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && actual === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener("keydown", alTeclear)
    return () => document.removeEventListener("keydown", alTeclear)
  }, [panelRef, enSegundoPlano])

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FUNDIDO}
    >
      <div className="absolute inset-0 bg-navy/40" onClick={alCerrar} aria-hidden="true" inert={enSegundoPlano} />
      <div
        ref={panelRef}
        inert={enSegundoPlano}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDelTitulo}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-panel bg-superficie p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-navy shadow-md squircle focus:outline-none sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-panel"
      >
        {children}
      </div>
    </motion.div>
  )
}
