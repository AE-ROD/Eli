"use client"

import { useEffect, useId, useRef, useState } from "react"
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
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { EncabezadoDeReserva } from "./encabezado-de-reserva"
import { IndicadorDePasos, PASOS_DE_RESERVA } from "./indicador-de-pasos"
import { ResumenDeReserva } from "./resumen-de-reserva"
import { SelectorServicio, type ServicioPublico } from "./selector-servicio"
import { SelectorFechaHora } from "./selector-fecha-hora"
import { confirmarReserva } from "../_datos"

interface HorarioPublico {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface PropsDeFormularioReserva {
  slug: string
  nombreNegocio: string
  servicios: ServicioPublico[]
  horarios: HorarioPublico[]
}

type Paso = 1 | 2 | 3

/**
 * Un fundido corto al cambiar de paso. En un formulario, el de 600ms de la
 * landing hace esperar; con movimiento reducido se queda igual, porque es
 * sólo opacidad.
 */
const FUNDIDO = { duration: DURACION.pildora, ease: CURVA.fundido }

export function FormularioReserva({ slug, nombreNegocio, servicios, horarios }: PropsDeFormularioReserva) {
  const [paso, setPaso] = useState<Paso>(1)
  const [servicioSeleccionado, setServicioSeleccionado] = useState<ServicioPublico | null>(null)
  const [fecha, setFecha] = useState("")
  const [hora, setHora] = useState("")
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [cedula, setCedula] = useState("")
  const [email, setEmail] = useState("")
  const [telefono, setTelefono] = useState("")
  const [comentarios, setComentarios] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [error, setError] = useState("")

  const idDeComentarios = useId()
  const idDelResumen = useId()
  const idDelError = useId()

  const diasDisponibles = horarios.map((horario) => horario.dayOfWeek)

  const puedeAvanzarPaso1 = !!servicioSeleccionado
  const puedeAvanzarPaso2 = !!fecha && !!hora
  const puedeEnviar = !!nombre && !!apellido

  const confirmar = async () => {
    setEnviando(true)
    setError("")
    const resultado = await confirmarReserva(slug, {
      servicioId: servicioSeleccionado!.id,
      fecha,
      hora,
      nombre,
      apellido,
      cedula,
      email,
      telefono,
      comentarios,
    })
    setEnviando(false)

    if (resultado.ok) setConfirmado(true)
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

  if (confirmado) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FUNDIDO}>
        <EncabezadoDeReserva
          ref={titulo}
          antetitulo={nombreNegocio}
          titulo="¡Reserva confirmada!"
          bajada={`Te esperamos, ${nombre}. ¡Hasta pronto!`}
        />
        <Tarjeta className="mx-auto mt-8 max-w-xl px-6 py-8 sm:p-10 md:mt-12">
          <div className="flex items-center gap-4">
            <CuadroDeIcono icono={CalendarCheck} color="azul" tamano="lg" activo />
            <p className="titulo-3 min-w-0 break-words text-navy">{servicioSeleccionado?.name}</p>
          </div>
          <ResumenDeReserva
            className="mt-6 border-t border-borde pt-3"
            servicio={servicioSeleccionado}
            fecha={fecha}
            hora={hora}
            sinServicio
          />
        </Tarjeta>
      </motion.div>
    )
  }

  // La primera vista (el paso 1 sin nada elegido) es la que pinta el servidor:
  // entra sin fundido, para no quedar invisible hasta que cargue JavaScript.
  const esLaPrimeraVista = paso === 1 && !servicioSeleccionado

  return (
    <div>
      <EncabezadoDeReserva
        antetitulo="Reserva tu cita"
        titulo={nombreNegocio}
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
              <div className="mt-5">
                <SelectorServicio
                  servicios={servicios}
                  seleccionado={servicioSeleccionado}
                  onSeleccionar={setServicioSeleccionado}
                />
              </div>
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
              {servicioSeleccionado && <ServicioElegido servicio={servicioSeleccionado} />}
              <div className="mt-6">
                <SelectorFechaHora
                  slug={slug}
                  servicioId={servicioSeleccionado!.id}
                  diasDisponibles={diasDisponibles}
                  fechaSeleccionada={fecha}
                  horaSeleccionada={hora}
                  onFecha={setFecha}
                  onHora={setHora}
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
                  placeholder="+52 555 123 4567"
                  autoComplete="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
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
                <ResumenDeReserva className="mt-4" servicio={servicioSeleccionado} fecha={fecha} hora={hora} />
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
    <h2 ref={ref} tabIndex={-1} className="titulo-3 text-navy outline-none">
      <span className="sr-only">
        Paso {paso} de {PASOS_DE_RESERVA.length}:{" "}
      </span>
      {children}
    </h2>
  )
}

/** El servicio que se eligió en el paso 1, a la vista mientras se busca el día. */
function ServicioElegido({ servicio }: { servicio: ServicioPublico }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-boton-lg bg-superficie px-4 py-3 squircle sm:px-5">
      <div className="min-w-0">
        <p className="font-medium break-words text-navy">{servicio.name}</p>
        <p className="text-sm text-texto-2">{formatearDuracionDeServicio(servicio.duration)}</p>
      </div>
      {servicio.price != null && (
        <p className="shrink-0 font-medium text-navy tabular-nums">{formatearMonto(servicio.price)}</p>
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
