"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { ReactNode, Ref } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight, CalendarCheck, Check } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CLASES_DE_CAMPO, CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { formatearMonto } from "@/lib/dinero"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import { MAX_SERVICIOS_POR_RESERVA, resumenDeLaReserva } from "@/lib/servicios-de-la-reserva"
import { cn } from "@/lib/utils"
import { EncabezadoDeReserva } from "./encabezado-de-reserva"
import { IndicadorDePasos, PASOS_DE_RESERVA } from "./indicador-de-pasos"
import { AgregarAlCalendario } from "./agregar-al-calendario"
import { InvitacionAEli } from "./pie-de-eli"
import type { PrecioDeLaHora } from "@/lib/hora-valle"
import { ResumenDeReserva } from "./resumen-de-reserva"
import { SelectorServicio, type ServicioPublico } from "./selector-servicio"
import { SelectorFechaHora, fechaParaLeer } from "./selector-fecha-hora"
import { FormularioListaDeEspera } from "./formulario-lista-de-espera"
import { SelectorProfesional } from "./selector-profesional"
import { confirmarReserva, leerDisponibilidad, leerProfesionales, type ProfesionalPublico } from "../_datos"

interface HorarioPublico {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface PropsDeFormularioReserva {
  slug: string
  nombreNegocio: string
  /** La zona del negocio (IANA): el calendario cuenta "hoy" en su reloj. */
  zona: string
  servicios: ServicioPublico[]
  horarios: HorarioPublico[]
  /** Si el negocio ofrece "Avísame si se libera una hora" (#74). */
  listaDeEsperaActiva: boolean
  /**
   * "Puedes cancelar o cambiar hasta 24 horas antes.", dicho antes de
   * confirmar (#83). Viene armado del servidor (`plazoParaQuienReserva`):
   * `lib/gestion-de-cita.ts` usa `node:crypto` y no entra al cliente.
   */
  plazoDeCambios: string
}

type Paso = 1 | 2 | 3

/**
 * Un fundido corto al cambiar de paso. En un formulario, el de 600ms de la
 * landing hace esperar; con movimiento reducido se queda igual, porque es
 * sólo opacidad.
 */
const FUNDIDO = { duration: DURACION.pildora, ease: CURVA.fundido }

/** Lo hace el profesional: sin servicios definidos, hace todos. */
const haceElServicio = (profesional: ProfesionalPublico, servicioId: string) =>
  profesional.servicioIds === null || profesional.servicioIds.includes(servicioId)

/** Hace todos los elegidos (#89a): la reserva es con una sola persona. */
const haceLosServicios = (profesional: ProfesionalPublico, elegidos: ServicioPublico[]) =>
  elegidos.every((servicio) => haceElServicio(profesional, servicio.id))

/**
 * Los elegidos como si fueran un solo servicio, para el resumen, el
 * calendario y la tarjeta del paso 2: los nombres unidos por " + ", la
 * duración y el precio sumados (`resumenDeLaReserva`, la misma cuenta que
 * hace el servidor, que es el que manda). `null` sin ninguno elegido.
 */
function comoUnServicio(elegidos: ServicioPublico[]): (ServicioPublico & { precioIncompleto: boolean }) | null {
  if (elegidos.length === 0) return null
  const resumen = resumenDeLaReserva(elegidos)
  return {
    id: elegidos.map((servicio) => servicio.id).join(","),
    name: resumen.titulo,
    description: null,
    duration: resumen.duracion,
    price: resumen.precio,
    precioIncompleto: resumen.precioIncompleto,
  }
}

export function FormularioReserva({
  slug,
  nombreNegocio,
  zona,
  servicios,
  horarios,
  listaDeEsperaActiva,
  plazoDeCambios,
}: PropsDeFormularioReserva) {
  const parametros = useSearchParams()
  // `?servicio=<id>&fecha=AAAA-MM-DD` (el enlace del aviso de la lista de
  // espera) deja la reserva llenada: el servicio elegido y el día puesto, en
  // el paso de la hora. Un servicio que no es de este negocio, o una fecha
  // que no es un día, se ignoran.
  const servicioDeLaUrl = servicios.find((servicio) => servicio.id === parametros.get("servicio")) ?? null
  const fechaDeLaUrl = parametros.get("fecha") ?? ""
  const conFechaDeLaUrl = servicioDeLaUrl !== null && deTexto(fechaDeLaUrl) !== null
  const [paso, setPaso] = useState<Paso>(servicioDeLaUrl ? 2 : 1)
  // Varios servicios (#89a): en el orden en que se eligen, que es el orden en que se hacen.
  const [seleccionados, setSeleccionados] = useState<ServicioPublico[]>(servicioDeLaUrl ? [servicioDeLaUrl] : [])
  const servicioSeleccionado = comoUnServicio(seleccionados)
  // `?profesional=<id>` (el "Reservar con …" de la mini página, y el aviso de
  // la lista de espera) lo deja elegido de entrada. Si no es de este negocio,
  // no aparece en la lista y se ignora: el servidor igual lo rechazaría.
  const profesionalDeLaUrl = parametros.get("profesional")
  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([])
  const [profesionalId, setProfesionalId] = useState<string | null>(profesionalDeLaUrl)
  const [profesionalAsignado, setProfesionalAsignado] = useState<string | null>(null)
  const [enlaceDeGestion, setEnlaceDeGestion] = useState<string | null>(null)
  const [fecha, setFecha] = useState(conFechaDeLaUrl ? fechaDeLaUrl : "")
  const [hora, setHora] = useState("")
  // Con hora valle (#89c), el precio de la hora elegida; `null` si es el de siempre.
  const [precioDeLaHora, setPrecioDeLaHora] = useState<PrecioDeLaHora | null>(null)
  const elegirHora = (nueva: string, precio: PrecioDeLaHora | null) => {
    setHora(nueva)
    setPrecioDeLaHora(precio)
  }
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [cedula, setCedula] = useState("")
  const [email, setEmail] = useState("")
  const [telefono, setTelefono] = useState("")
  const [whatsapp, setWhatsapp] = useState(false)
  const [correoPromo, setCorreoPromo] = useState(false)
  const [comentarios, setComentarios] = useState("")
  const [enviando, setEnviando] = useState(false)
  /** El id de la cita creada: con él, la reserva está confirmada. */
  const [citaId, setCitaId] = useState<string | null>(null)
  const confirmado = citaId !== null
  const [error, setError] = useState("")

  const idDeComentarios = useId()
  const idDelResumen = useId()
  const idDelError = useId()

  const diasDisponibles = horarios.map((horario) => horario.dayOfWeek)

  // El equipo se pide al montar. Si falla, la reserva sigue: sin elegir con
  // quién, el servidor asigna (o es un negocio sin equipo).
  useEffect(() => {
    let vigente = true
    leerProfesionales(slug).then((resultado) => {
      if (!vigente || !resultado.ok) return
      setProfesionales(resultado.datos)
      // Un profesional de la URL que no existe no queda elegido.
      setProfesionalId((actual) => (actual && resultado.datos.some((p) => p.id === actual) ? actual : null))
    })
    return () => {
      vigente = false
    }
  }, [slug])

  const profesionalElegido = profesionales.find((profesional) => profesional.id === profesionalId) ?? null
  // Con un profesional elegido, sólo los servicios que hace.
  const serviciosVisibles = profesionalElegido
    ? servicios.filter((servicio) => haceElServicio(profesionalElegido, servicio.id))
    : servicios
  // Con varios, sólo quienes hacen todos: los hace una sola persona, seguidos.
  const profesionalesDelServicio =
    seleccionados.length > 0 ? profesionales.filter((profesional) => haceLosServicios(profesional, seleccionados)) : []

  const alternarServicio = (servicio: ServicioPublico) => {
    const yaEstaba = seleccionados.some((elegido) => elegido.id === servicio.id)
    if (!yaEstaba && seleccionados.length >= MAX_SERVICIOS_POR_RESERVA) return
    setSeleccionados(
      yaEstaba ? seleccionados.filter((elegido) => elegido.id !== servicio.id) : [...seleccionados, servicio]
    )
    // Si el profesional elegido no hace el que se suma, vuelve a "cualquiera".
    if (!yaEstaba && profesionalElegido && !haceElServicio(profesionalElegido, servicio.id)) setProfesionalId(null)
    // Otra combinación es otra duración: la hora elegida puede no caber.
    elegirHora("", null)
  }

  const servicioIds = seleccionados.map((servicio) => servicio.id)
  const claveDeServicios = servicioIds.join(",")
  const cargarHoras = useCallback(
    (dia: string) => leerDisponibilidad(slug, dia, claveDeServicios ? claveDeServicios.split(",") : [], profesionalId),
    [slug, claveDeServicios, profesionalId]
  )

  const puedeAvanzarPaso1 = !!servicioSeleccionado
  const puedeAvanzarPaso2 = !!fecha && !!hora
  const puedeEnviar = !!nombre && !!apellido

  const confirmar = async () => {
    setEnviando(true)
    setError("")
    const resultado = await confirmarReserva(slug, {
      servicioIds,
      profesionalId,
      fecha,
      hora,
      nombre,
      apellido,
      cedula,
      email,
      telefono,
      whatsapp,
      correoPromo,
      comentarios,
    })
    setEnviando(false)

    if (resultado.ok) {
      setProfesionalAsignado(resultado.datos.profesional?.nombre ?? null)
      setEnlaceDeGestion(resultado.datos.enlaceDeGestion ?? null)
      setCitaId(resultado.datos.citaId)
    }
    else setError(resultado.error)
  }

  /*
   * Al cambiar de paso, el botón que se apretó desaparece y el foco caía al
   * <body>: con teclado había que volver a recorrer la página desde arriba.
   * Va al título de la pantalla nueva, que el lector de pantalla anuncia, y
   * el navegador la desplaza hasta él si quedó fuera de la vista. En la
   * carga de la página no se mueve: `pantallaAnterior` empieza igual.
   */
  const titulo = useRef<HTMLHeadingElement>(null)
  const pantalla = confirmado ? "confirmada" : paso
  const pantallaAnterior = useRef(pantalla)
  useEffect(() => {
    if (pantallaAnterior.current === pantalla) return
    pantallaAnterior.current = pantalla
    titulo.current?.focus()
  }, [pantalla])

  if (confirmado && servicioSeleccionado) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FUNDIDO}>
        <EncabezadoDeReserva
          ref={titulo}
          nivel={2}
          antetitulo={nombreNegocio}
          titulo="¡Reserva confirmada!"
          bajada={`Te esperamos, ${nombre}. ¡Hasta pronto!`}
        />
        <Tarjeta className="mx-auto mt-8 max-w-xl px-6 py-8 sm:p-10 md:mt-12">
          <div className="flex items-center gap-4">
            <CuadroDeIcono icono={CalendarCheck} color="azul" tamano="lg" activo />
            <p className="titulo-3 min-w-0 break-words text-navy">{servicioSeleccionado.name}</p>
          </div>
          <ResumenDeReserva
            className="mt-6 border-t border-borde pt-3"
            servicio={servicioSeleccionado}
            fecha={fecha}
            hora={hora}
            profesional={profesionalAsignado}
            precioDeLaHora={precioDeLaHora}
            sinServicio
          />
          <AgregarAlCalendario
            className="mt-7"
            cita={{
              id: citaId,
              servicio: servicioSeleccionado.name,
              negocio: nombreNegocio,
              fecha,
              hora,
              duracionMinutos: servicioSeleccionado.duration,
              zona,
            }}
          />
          {enlaceDeGestion && (
            <p className="mt-6 text-sm text-texto-2">
              ¿Necesitas cancelar o cambiar la hora?{" "}
              <a href={enlaceDeGestion} className="font-medium text-navy underline underline-offset-4 anillo-foco">
                Gestiona tu cita acá
              </a>
              . Guarda este enlace{email ? "; también te lo mandamos por correo" : ""}.
            </p>
          )}
        </Tarjeta>
        <InvitacionAEli />
      </motion.div>
    )
  }

  // La primera vista (el paso 1 sin nada elegido) es la que pinta el servidor:
  // entra sin fundido, para no quedar invisible hasta que cargue JavaScript.
  const esLaPrimeraVista = paso === 1 && !servicioSeleccionado

  return (
    <div>
      {/* La mini página ya lleva el <h1> con el nombre del negocio. */}
      <EncabezadoDeReserva
        nivel={2}
        antetitulo={nombreNegocio}
        titulo="Reserva tu hora"
        bajada="Elige el servicio, el día y la hora, y deja tus datos."
      />

      {/*
        El relleno está medido para el calendario: 16px a los lados en el teléfono,
        para que a 360px entren sus siete columnas de 44px, y 32px hasta lg, para que
        a 768px entre al lado de los horarios.
      */}
      <Tarjeta className="mt-8 px-4 py-6 sm:p-8 md:mt-12 lg:p-10">
        <IndicadorDePasos paso={paso} />

        <motion.div
          key={paso}
          initial={esLaPrimeraVista ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FUNDIDO}
          className="mt-8"
        >
          {/* Paso 1: Servicio */}
          {paso === 1 && (
            <>
              <TituloDelPaso ref={titulo} paso={1}>
                ¿Qué servicio necesitas?
              </TituloDelPaso>
              <p className="mt-2 text-sm text-texto-2">
                Puedes elegir hasta {MAX_SERVICIOS_POR_RESERVA}: te los hace la misma persona, uno después del otro.
              </p>
              {profesionalElegido && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-texto-2">
                  <span>
                    Reservando con <strong className="font-medium text-navy">{profesionalElegido.nombre}</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => setProfesionalId(null)}
                    className="font-medium text-navy underline underline-offset-4 anillo-foco"
                  >
                    Ver todos los servicios
                  </button>
                </p>
              )}
              <div className="mt-5">
                <SelectorServicio
                  servicios={serviciosVisibles}
                  seleccionados={seleccionados}
                  onAlternar={alternarServicio}
                  tope={MAX_SERVICIOS_POR_RESERVA}
                />
              </div>
              {servicioSeleccionado && seleccionados.length > 1 && (
                <div className="mt-5" aria-live="polite">
                  <ServicioElegido servicio={servicioSeleccionado} cantidad={seleccionados.length} />
                </div>
              )}
              <BarraDeAcciones>
                <Boton
                  icono={<ArrowRight />}
                  disabled={!puedeAvanzarPaso1}
                  onClick={() => setPaso(2)}
                  className="w-full sm:ml-auto sm:w-auto"
                >
                  Continuar
                </Boton>
              </BarraDeAcciones>
            </>
          )}

          {/* Paso 2: Fecha y hora */}
          {paso === 2 && (
            <>
              <TituloDelPaso ref={titulo} paso={2}>
                ¿Cuándo quieres venir?
              </TituloDelPaso>
              {servicioSeleccionado && (
                <ServicioElegido servicio={servicioSeleccionado} cantidad={seleccionados.length} />
              )}
              {/* Sin equipo (el dueño solo) no hay a quién elegir: no se muestra. */}
              {profesionalesDelServicio.length > 0 && (
                <div className="mt-6">
                  <SelectorProfesional
                    profesionales={profesionalesDelServicio}
                    elegido={profesionalId}
                    onElegir={setProfesionalId}
                  />
                </div>
              )}
              <div className="mt-6">
                <SelectorFechaHora
                  cargarHoras={cargarHoras}
                  claveDeHoras={`${claveDeServicios}|${profesionalId ?? ""}`}
                  diasDisponibles={diasDisponibles}
                  zona={zona}
                  fechaSeleccionada={fecha}
                  horaSeleccionada={hora}
                  onFecha={setFecha}
                  onHora={elegirHora}
                  sinHoras={
                    listaDeEsperaActiva && servicioSeleccionado
                      ? (dia) => (
                          <FormularioListaDeEspera
                            // Otro día, servicio o profesional es otra inscripción: empieza de cero.
                            // La lista de espera sigue con un solo servicio: el primero (#89a).
                            key={`${dia}|${seleccionados[0].id}|${profesionalId ?? ""}`}
                            slug={slug}
                            servicioId={seleccionados[0].id}
                            profesionalId={profesionalId}
                            fecha={dia}
                            fechaParaLeer={fechaParaLeer(deTexto(dia) ?? new Date())}
                          />
                        )
                      : undefined
                  }
                />
              </div>
              <BarraDeAcciones>
                <Boton
                  variante="secundario"
                  icono={<ArrowLeft />}
                  onClick={() => setPaso(1)}
                  className="w-full sm:w-auto"
                >
                  Atrás
                </Boton>
                <Boton
                  icono={<ArrowRight />}
                  disabled={!puedeAvanzarPaso2}
                  onClick={() => setPaso(3)}
                  className="w-full sm:w-auto"
                >
                  Continuar
                </Boton>
              </BarraDeAcciones>
            </>
          )}

          {/* Paso 3: Datos del cliente */}
          {paso === 3 && (
            <>
              <TituloDelPaso ref={titulo} paso={3}>
                Tus datos
              </TituloDelPaso>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <CampoFormulario
                  etiqueta="Nombre"
                  placeholder="Tu nombre"
                  autoComplete="given-name"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
                <CampoFormulario
                  etiqueta="Apellido"
                  placeholder="Tu apellido"
                  autoComplete="family-name"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  required
                />
                <CampoFormulario
                  etiqueta="Cédula / Documento (opcional)"
                  placeholder="Número de documento"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                />
                <CampoFormulario
                  etiqueta="Teléfono (opcional)"
                  type="tel"
                  placeholder="+56 9 1234 5678"
                  autoComplete="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
                {/* Sólo con teléfono: sin número no hay a dónde escribir. Nada viene marcado. */}
                {telefono.trim() && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-navy sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.checked)}
                      className="size-4 shrink-0 accent-navy anillo-foco"
                    />
                    Quiero recibir recordatorios por WhatsApp
                  </label>
                )}
                <div className="sm:col-span-2">
                  <CampoFormulario
                    etiqueta="Correo electrónico (opcional)"
                    type="email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {/* Sólo con correo: el consentimiento es para esa casilla. Nada viene marcado. */}
                {email.trim() && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-navy sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={correoPromo}
                      onChange={(e) => setCorreoPromo(e.target.checked)}
                      className="size-4 shrink-0 accent-navy anillo-foco"
                    />
                    Quiero recibir avisos y novedades de {nombreNegocio} por correo
                  </label>
                )}
                {/* No hay área de texto en `components/comunes/`: se arma con las mismas clases que los campos. */}
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor={idDeComentarios} className={CLASES_DE_ETIQUETA}>
                    Comentarios o requisitos especiales (opcional)
                  </label>
                  <textarea
                    id={idDeComentarios}
                    value={comentarios}
                    onChange={(e) => setComentarios(e.target.value)}
                    placeholder="¿Algo que debamos saber antes de tu cita?"
                    rows={3}
                    className={cn("block min-h-24 w-full resize-y px-4 py-3 text-base", CLASES_DE_CAMPO)}
                  />
                </div>
              </div>

              {/* Resumen */}
              <section aria-labelledby={idDelResumen} className="mt-8 rounded-panel bg-superficie p-5 squircle sm:p-6">
                <h3 id={idDelResumen} className="font-medium text-navy">
                  Resumen de tu reserva
                </h3>
                <ResumenDeReserva
                  className="mt-4"
                  servicio={servicioSeleccionado}
                  fecha={fecha}
                  hora={hora}
                  precioDeLaHora={precioDeLaHora}
                  profesional={profesionalElegido?.nombre ?? (profesionalesDelServicio.length > 0 ? "Cualquiera disponible" : null)}
                />
                <p className="mt-4 border-t border-borde pt-3 text-sm text-texto-2">
                  {plazoDeCambios}
                </p>
              </section>

              {error && (
                <div role="alert" className="mt-6">
                  <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
                </div>
              )}

              <BarraDeAcciones>
                <Boton
                  variante="secundario"
                  icono={<ArrowLeft />}
                  onClick={() => setPaso(2)}
                  className="w-full sm:w-auto"
                >
                  Atrás
                </Boton>
                <Boton
                  icono={<Check />}
                  disabled={!puedeEnviar}
                  cargando={enviando}
                  onClick={confirmar}
                  className="w-full sm:w-auto"
                >
                  Confirmar reserva
                </Boton>
              </BarraDeAcciones>
            </>
          )}
        </motion.div>
      </Tarjeta>
    </div>
  )
}

/**
 * El título de cada paso. Empieza con "Paso 2 de 3" para el lector de
 * pantalla, que lo anuncia al recibir el foco. Se enfoca desde el código y
 * no con Tab, y no muestra contorno: no es un control.
 */
function TituloDelPaso({ paso, children, ref }: { paso: Paso; children: ReactNode; ref: Ref<HTMLHeadingElement> }) {
  return (
    <h3 ref={ref} tabIndex={-1} className="titulo-3 text-navy outline-none">
      <span className="sr-only">
        Paso {paso} de {PASOS_DE_RESERVA.length}:{" "}
      </span>
      {children}
    </h3>
  )
}

/**
 * Lo que se eligió en el paso 1, a la vista mientras se busca el día. Con
 * varios servicios, los nombres unidos y el total: duración y precio.
 */
function ServicioElegido({
  servicio,
  cantidad = 1,
}: {
  servicio: ServicioPublico & { precioIncompleto?: boolean }
  cantidad?: number
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-boton-lg bg-superficie px-4 py-3 squircle sm:px-5">
      <div className="min-w-0">
        <p className="font-medium break-words text-navy">{servicio.name}</p>
        <p className="text-sm text-texto-2">
          {cantidad > 1 ? `${cantidad} servicios · en total ` : ""}
          {formatearDuracionDeServicio(servicio.duration)}
        </p>
      </div>
      {servicio.price != null && (
        <p className="shrink-0 text-right font-medium text-navy tabular-nums">
          {cantidad > 1 && <span className="block text-xs font-normal text-texto-2">Total</span>}
          {formatearMonto(servicio.price)}
          {servicio.precioIncompleto && <span className="block text-xs font-normal text-texto-2">+ a consultar</span>}
        </p>
      )}
    </div>
  )
}

/**
 * Los botones de abajo. En el teléfono van apilados y a lo ancho, con la
 * acción principal última, cerca del pulgar; desde sm, en fila: "Atrás" a la
 * izquierda y la principal a la derecha. El orden del Tab es el mismo que se ve.
 */
function BarraDeAcciones({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:mt-10">{children}</div>
  )
}
