"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { FormEvent, ReactNode, Ref } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight, CalendarCheck, CalendarX2, Check, TriangleAlert } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CLASES_DE_CAMPO, CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { formatearMonto } from "@/lib/dinero"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import {
  avisoDeUrgencia,
  avisoSinCambiosDespuesDeReservar,
  avisoSinCambiosPorElEnlace,
  AVISO_DIA_SIN_ATENCION,
  diasDelCalendarioDeReserva,
  duracionDeLaReserva,
  elDiaElegidoQuedoSinAtencion,
  esDiaReservable,
  esReservaDeUrgencia,
  MENSAJE_URGENCIA_SIN_HORAS,
  MINUTOS_DE_PRIMERA_VEZ,
  quedaSinCambiosPorElEnlace,
} from "@/lib/reserva-publica"
import { esRubroDental } from "@/lib/rubros"
import { MAX_SERVICIOS_POR_RESERVA, resumenDeLaReserva } from "@/lib/servicios-de-la-reserva"
import { haceAlgunServicio } from "@/lib/servicios-del-profesional"
import { cn } from "@/lib/utils"
import { fechaYMinutosEn } from "@/lib/zona-horaria"
import { EncabezadoDeReserva } from "./encabezado-de-reserva"
import { IndicadorDePasos, PASOS_DE_RESERVA, pasosDeLaReserva } from "./indicador-de-pasos"
import { AgregarAlCalendario } from "./agregar-al-calendario"
import { InvitacionAEli } from "./pie-de-eli"
import { frasesDelFormulario } from "../_frases"
import type { PrecioDeLaHora } from "@/lib/hora-valle"
import { ResumenDeReserva } from "./resumen-de-reserva"
import { SelectorServicio, type ServicioPublico } from "./selector-servicio"
import { SelectorFechaHora, fechaParaLeer } from "./selector-fecha-hora"
import { FormularioListaDeEspera } from "./formulario-lista-de-espera"
import { SelectorProfesional } from "./selector-profesional"
import {
  avisoDeServiciosQuitados,
  erroresDeTusDatos,
  haceElServicio,
  haceTodos,
  ORDEN_DE_TUS_DATOS,
  profesionalDeLaUrl,
  profesionalSigueValiendo,
  separarLosQueNoHace,
  servicioDeUrgenciaQueVe,
  serviciosQueNoSePuedenSumar,
  serviciosQueVe,
  type ErroresDeTusDatos,
  type TusDatos,
} from "./reglas-de-la-reserva"
import {
  confirmarReserva,
  leerProfesionales,
  type ProfesionalDelEquipo,
  type ProfesionalPublico,
} from "../_datos"
import { useCargarHoras } from "./use-cargar-horas"

interface HorarioPublico {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface PropsDeFormularioReserva {
  slug: string
  nombreNegocio: string
  /**
   * El rubro del negocio (`Business.type`, que la página lee de la base por
   * `slug`): pone las palabras de la reserva (`vocabularioDe`: "motivo" y
   * "odontólogo", "estilista", "servicio") y, en una clínica dental
   * (`esRubroDental`), pregunta si es la primera consulta (suma 15 minutos,
   * que calcula el servidor) y ofrece sólo horas de hoy para una urgencia. Un
   * rubro desconocido o `null`: la reserva de siempre.
   */
  rubro?: string | null
  /** La zona del negocio (IANA): el calendario cuenta "hoy" en su reloj. */
  zona: string
  servicios: ServicioPublico[]
  /**
   * El equipo que atiende, tal como lo leyó el servidor con la página
   * (`leerPaginaDelNegocio`): con qué servicios hace cada uno. Es lo que
   * permite elegir con quién y filtrar los servicios desde la primera pintura,
   * sin esperar a `/profesionales` (que además trae los días de cada uno).
   */
  equipo: ProfesionalDelEquipo[]
  horarios: HorarioPublico[]
  /** Si el negocio ofrece "Avísame si se libera una hora" (#74). */
  listaDeEsperaActiva: boolean
  /**
   * "Puedes cancelar o cambiar hasta 24 horas antes.", dicho antes de
   * confirmar (#83). Viene armado del servidor (`plazoParaQuienReserva`):
   * `lib/gestion-de-cita.ts` usa `node:crypto` y no entra al cliente.
   */
  plazoDeCambios: string
  /**
   * El mismo plazo en horas, ya validado (`plazoValido`): si la hora elegida
   * ya cae dentro, el paso de confirmar avisa que no se podrá cancelar ni
   * cambiar por el enlace (QA#8).
   */
  plazoDeCambiosHoras: number
  /**
   * Dónde queda el negocio ("Av. Italia 1234, Providencia"), para el evento
   * de "Agregar al calendario". Sin dirección, el evento va sin lugar.
   */
  direccion?: string | null
}

type Paso = 1 | 2 | 3

/**
 * A dónde lleva el foco un gesto en "¿Con quién?" del paso 2: `elegido`, al
 * botón de la persona ya elegida (o de "cualquiera") del selector que se abrió;
 * `cambiar`, al botón "Cambiar" que reemplazó al selector. Cada gesto crea uno
 * nuevo (un objeto, no un texto) para que el efecto corra aunque el destino sea el mismo.
 */
interface PedidoDeFoco {
  destino: "elegido" | "cambiar"
}

/**
 * Un fundido corto al cambiar de paso. En un formulario, el de 600ms de la
 * landing hace esperar; con movimiento reducido se queda igual, porque es
 * sólo opacidad.
 */
const FUNDIDO = { duration: DURACION.pildora, ease: CURVA.fundido }

/** Hace todos los elegidos (#89a): la reserva es con una sola persona. */
const haceLosServicios = (profesional: ProfesionalDelEquipo, elegidos: ServicioPublico[]) =>
  haceTodos(
    profesional,
    elegidos.map((servicio) => servicio.id)
  )

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
  rubro = null,
  zona,
  servicios,
  equipo: equipoDeLaPagina,
  horarios,
  listaDeEsperaActiva,
  plazoDeCambios,
  plazoDeCambiosHoras,
  direccion = null,
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
  // la lista de espera) lo deja elegido de entrada, ya en la primera pintura:
  // se revisa contra el equipo que trajo el servidor, no contra `/profesionales`.
  // Si no es de este negocio, no hace ninguno de los servicios que hay o no hace
  // el de `?servicio=`, se ignora: el servidor igual lo rechazaría. Vacío o de
  // puros espacios (`?profesional=`) es como no ponerlo: queda "cualquiera".
  const idDeLaUrl = profesionalDeLaUrl(parametros.get("profesional"))
  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([])
  // Si ya se leyó `/profesionales`: hasta entonces el calendario usa el horario
  // publicado (los días de cada uno vienen de esa lectura).
  const [equipoLeido, setEquipoLeido] = useState(false)
  // Quienes atienden: lo que trajo la página, y lo que responde `/profesionales` cuando llega.
  const equipo: ProfesionalDelEquipo[] = equipoLeido ? profesionales : equipoDeLaPagina
  const [profesionalId, setProfesionalId] = useState<string | null>(() =>
    profesionalSigueValiendo(
      idDeLaUrl,
      equipoDeLaPagina.filter((profesional) => haceAlgunServicio(profesional.servicioIds, servicios)),
      servicioDeLaUrl ? [servicioDeLaUrl.id] : []
    )
      ? idDeLaUrl
      : null
  )
  // En el segundo paso, con alguien ya elegido en el primero, se muestra "Con X · Cambiar";
  // el selector completo aparece al querer cambiar (o si todavía es "cualquiera").
  const [cambiandoProfesional, setCambiandoProfesional] = useState(false)
  // A dónde lleva el foco el siguiente gesto en "¿Con quién?" del paso 2 (ver el
  // efecto de `pedidoDeFoco`). Nace en `null`: al cargar la página o el paso no
  // se mueve el foco, sólo después de que quien reserva hace algo ahí.
  const [pedidoDeFoco, setPedidoDeFoco] = useState<PedidoDeFoco | null>(null)
  const botonCambiarProfesional = useRef<HTMLButtonElement>(null)
  const botonDelProfesionalElegido = useRef<HTMLButtonElement>(null)
  // Lo que se quitó del paso 1 al elegir a alguien que no lo hace (se dice, discreto).
  const [avisoDeServicios, setAvisoDeServicios] = useState("")
  const [profesionalAsignado, setProfesionalAsignado] = useState<string | null>(null)
  const [enlaceDeGestion, setEnlaceDeGestion] = useState<string | null>(null)
  // Si la cita quedó dentro del plazo, el enlace ya no la deja cambiar (QA#8).
  const [sePuedeCambiar, setSePuedeCambiar] = useState(true)
  // Si el cron alcanza a mandar el recordatorio (N4): lo dice `confirmar`, con la hora del servidor.
  const [conRecordatorio, setConRecordatorio] = useState(false)
  // El día elegido en el calendario. El que vale es `fecha` (abajo): con una
  // urgencia dental, siempre hoy.
  const [fechaElegida, setFecha] = useState(conFechaDeLaUrl ? fechaDeLaUrl : "")
  // Clínica dental: "¿Es tu primera vez en la clínica?". Sin responder
  // (`null`) no se piden horas: la respuesta cambia cuánto dura la cita.
  const [primeraVez, setPrimeraVez] = useState<boolean | null>(null)
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
  // Los errores de "Tus datos", por campo: aparecen al intentar confirmar y
  // se corrigen mientras se escribe. Antes del primer intento, ninguno.
  const [erroresDeDatos, setErroresDeDatos] = useState<ErroresDeTusDatos>({})
  const [intentoConfirmar, setIntentoConfirmar] = useState(false)
  const camposDeDatos = useRef<Partial<Record<keyof TusDatos, HTMLInputElement | null>>>({})
  const [enviando, setEnviando] = useState(false)
  /** El id de la cita creada: con él, la reserva está confirmada. */
  const [citaId, setCitaId] = useState<string | null>(null)
  const confirmado = citaId !== null
  const [error, setError] = useState("")

  // Las palabras del rubro (`lib/vocabulario.ts`, con la concordancia de
  // `lib/concordancia.ts`): "motivo" y "odontólogo" en una clínica dental,
  // "estilista" en un salón, las de siempre en cualquier otro. Las frases
  // salen de `_frases.ts`: acá no se pega ningún artículo a una palabra.
  const frases = frasesDelFormulario(rubro)
  const clinicaDental = esRubroDental(rubro)
  const urgencia = esReservaDeUrgencia(clinicaDental, seleccionados)

  const idDeComentarios = useId()
  const idDelResumen = useId()
  const idDelError = useId()

  // El equipo se pide al montar. Si falla, la reserva sigue: sin elegir con
  // quién, el servidor asigna (o es un negocio sin equipo).
  useEffect(() => {
    let vigente = true
    leerProfesionales(slug).then((resultado) => {
      if (!vigente || !resultado.ok) return
      setProfesionales(resultado.datos)
      setEquipoLeido(true)
    })
    return () => {
      vigente = false
    }
  }, [slug])

  // Un profesional elegido que no es del equipo, o que no hace todo lo
  // elegido (el equipo que llegó de `/profesionales` después de elegir), no
  // queda elegido: vuelve a "cualquiera". Se ajusta al renderizar.
  const servicioIds = seleccionados.map((servicio) => servicio.id)
  if (!profesionalSigueValiendo(profesionalId, equipo, servicioIds)) setProfesionalId(null)

  const profesionalElegido = equipo.find((profesional) => profesional.id === profesionalId) ?? null
  // Con un profesional elegido, sólo los servicios que hace (`serviciosQueVe`).
  const serviciosVisibles = serviciosQueVe(profesionalElegido, servicios)
  // El servicio de urgencia de la clínica, para el aviso "¿Tienes dolor fuerte?":
  // sólo si está entre los motivos que ve quien reserva. Con un odontólogo que
  // no hace urgencias el aviso mandaría a elegir algo que no está en la lista.
  const servicioDeUrgencia = servicioDeUrgenciaQueVe(clinicaDental, serviciosVisibles)
  // Entre quienes se elige en el paso 1: el equipo, menos quien no hace ninguno
  // de los servicios que hay (elegirlo dejaría la lista de servicios vacía).
  const profesionalesParaElegir = equipo.filter((profesional) => haceAlgunServicio(profesional.servicioIds, servicios))
  // Con varios, sólo quienes hacen todos: los hace una sola persona, seguidos.
  const profesionalesDelServicio =
    seleccionados.length > 0 ? equipo.filter((profesional) => haceLosServicios(profesional, seleccionados)) : []

  // Lo que no se puede sumar a lo ya elegido: nadie (o no quien se eligió)
  // hace la combinación. Se deshabilita en el paso 1 con el motivo a la vista,
  // en vez de llegar a un calendario sin días.
  const sinCombinacion = serviciosQueNoSePuedenSumar(
    serviciosVisibles.map((servicio) => servicio.id),
    servicioIds,
    profesionalElegido ? [profesionalElegido] : equipo
  )
  const motivoSinCombinacion = frases.paso1.sinCombinacion(profesionalElegido?.nombre ?? null)

  const alternarServicio = (servicio: ServicioPublico) => {
    const yaEstaba = seleccionados.some((elegido) => elegido.id === servicio.id)
    if (!yaEstaba && seleccionados.length >= MAX_SERVICIOS_POR_RESERVA) return
    setSeleccionados(
      yaEstaba ? seleccionados.filter((elegido) => elegido.id !== servicio.id) : [...seleccionados, servicio]
    )
    // Si el profesional elegido no hace el que se suma, vuelve a "cualquiera".
    if (!yaEstaba && profesionalElegido && !haceElServicio(profesionalElegido, servicio.id)) setProfesionalId(null)
    // El aviso de lo que se quitó ya se leyó: sigue otra elección.
    setAvisoDeServicios("")
    // Otra combinación es otra duración: la hora elegida puede no caber.
    elegirHora("", null)
  }

  /*
   * Elegir con quién, en el paso 1 o en el 2. Elegir a alguien que no hace
   * algo de lo ya elegido lo quita (en lugar de dejar una reserva que el
   * servidor rechazaría) y lo dice, discreto, en una región `status`.
   * "Cualquiera" no quita nada.
   */
  const elegirProfesional = (id: string | null) => {
    const profesional = equipo.find((candidato) => candidato.id === id) ?? null
    const { quedan, quitados } = separarLosQueNoHace(profesional, seleccionados)
    setProfesionalId(profesional?.id ?? null)
    setCambiandoProfesional(false)
    // En el paso 2, elegir a alguien pliega el selector a "Con X · Cambiar": el
    // botón que se tocó desaparece, y el foco va al "Cambiar" nuevo. En el paso
    // 1 el selector sigue y el botón tocado conserva el foco.
    if (paso === 2 && profesional) setPedidoDeFoco({ destino: "cambiar" })
    setAvisoDeServicios(profesional ? avisoDeServiciosQuitados(profesional.nombre, quitados, frases.servicioElegido) : "")
    if (quitados.length > 0) {
      setSeleccionados(quedan)
      // Otra combinación es otra duración: la hora elegida puede no caber.
      elegirHora("", null)
    }
  }

  // Los días con atención para estos servicios y este profesional (o
  // cualquiera), los mismos que la disponibilidad (N3): no se puede elegir un
  // día que después diga "No hay atención ese día".
  const diasDisponibles = diasDelCalendarioDeReserva({
    diasPublicados: horarios.map((horario) => horario.dayOfWeek),
    equipo: equipoLeido ? profesionales : null,
    servicioIds,
    profesionalId,
  })

  // Urgencia dental: sólo hoy, en el reloj de la clínica (el servidor no
  // ofrece ni acepta otro día). Si hoy nadie que la haga atiende, ningún día.
  const ahora = new Date()
  const hoy = fechaYMinutosEn(ahora, zona).fecha
  const hoyConAtencion = esDiaReservable(hoy, diasDisponibles, ahora, zona)
  const fecha = urgencia ? (hoyConAtencion ? hoy : "") : fechaElegida

  // Si al cambiar de profesional o de servicios el día elegido deja de tener
  // atención, se limpian el día y la hora, con un aviso: si no, quedaba
  // elegido un día que el calendario ya no ofrece y que respondía "No hay
  // atención ese día". Se ajusta al renderizar, cuando cambian los días.
  const claveDeDias = diasDisponibles.join(",")
  const [diasAnteriores, setDiasAnteriores] = useState(claveDeDias)
  const [avisoDelDia, setAvisoDelDia] = useState("")
  if (claveDeDias !== diasAnteriores) {
    setDiasAnteriores(claveDeDias)
    if (elDiaElegidoQuedoSinAtencion(fecha, diasDisponibles)) {
      setFecha("")
      elegirHora("", null)
      setAvisoDelDia(AVISO_DIA_SIN_ATENCION)
    }
  }
  const elegirFecha = (nueva: string) => {
    setAvisoDelDia("")
    setFecha(nueva)
  }
  const claveDeServicios = servicioIds.join(",")
  // Sólo en una clínica dental: con "primera vez" la cita dura 15 minutos
  // más y las horas son otras. El servidor suma; acá sólo va la respuesta.
  const primeraVezQueSeManda = clinicaDental ? primeraVez : null
  const cargarHoras = useCargarHoras(slug, claveDeServicios, profesionalId, primeraVezQueSeManda)
  const claveDeHoras = `${claveDeServicios}|${profesionalId ?? ""}${clinicaDental ? `|${primeraVez ?? ""}` : ""}`
  // En una clínica, el calendario aparece cuando se respondió la pregunta.
  const faltaLaPrimeraVez = clinicaDental && primeraVez === null

  // La duración que se muestra (resumen, calendario): la misma cuenta que hace
  // el servidor (`duracionDeLaReserva`), que es el que manda.
  const servicioConDuracion = servicioSeleccionado && {
    ...servicioSeleccionado,
    duration: duracionDeLaReserva(servicioSeleccionado.duration, { clinicaDental, primeraVez: primeraVez === true }),
  }
  const detalleDeDuracion =
    clinicaDental && primeraVez === true ? `Incluye ${MINUTOS_DE_PRIMERA_VEZ} min para abrir tu ficha` : null
  const cualquiera = frases.cualquiera

  // Ningún día de la semana con atención para lo elegido (y con quien se
  // eligió): el calendario quedaría vacío. Se dice qué pasa y cómo salir. La
  // urgencia sin horas ya tiene su aviso.
  const sinDias = !urgencia && diasDisponibles.length === 0

  const puedeAvanzarPaso1 = !!servicioSeleccionado
  const puedeAvanzarPaso2 = !!fecha && !!hora && !faltaLaPrimeraVez

  const tusDatos = { nombre, apellido, email }
  // Después del primer intento, los errores se corrigen mientras se escribe.
  const cambiarDato = (campo: keyof TusDatos, valor: string, guardar: (valor: string) => void) => {
    guardar(valor)
    if (intentoConfirmar) setErroresDeDatos(erroresDeTusDatos({ ...tusDatos, [campo]: valor }))
  }

  const confirmar = async (evento: FormEvent) => {
    evento.preventDefault()
    setIntentoConfirmar(true)
    const errores = erroresDeTusDatos(tusDatos)
    setErroresDeDatos(errores)
    const primeroConError = ORDEN_DE_TUS_DATOS.find((campo) => errores[campo])
    if (primeroConError) {
      camposDeDatos.current[primeroConError]?.focus()
      return
    }
    setEnviando(true)
    setError("")
    const resultado = await confirmarReserva(slug, {
      servicioIds,
      profesionalId,
      fecha,
      hora,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      cedula,
      email: email.trim(),
      telefono,
      whatsapp,
      correoPromo,
      comentarios,
      primeraVez: primeraVezQueSeManda,
    })
    setEnviando(false)

    if (resultado.ok) {
      setProfesionalAsignado(resultado.datos.profesional?.nombre ?? null)
      setEnlaceDeGestion(resultado.datos.enlaceDeGestion ?? null)
      setSePuedeCambiar(resultado.datos.sePuedeCambiar !== false)
      setConRecordatorio(resultado.datos.recibiraRecordatorio === true)
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

  /*
   * "Cambiar" y el selector de "¿Con quién?" del paso 2 se reemplazan uno al
   * otro: al abrir el selector desaparece el botón "Cambiar", y al elegir a
   * alguien desaparece el selector. En ambos casos el foco caía al <body> y con
   * teclado había que volver a recorrer la página. Tras el gesto, el foco va al
   * botón de la persona ya elegida (o a "cualquiera") al abrir, y al nuevo
   * "Cambiar" al elegir. Sólo si el foco se perdió: si el botón tocado sigue ahí
   * (hay un selector abierto igual), el foco se queda donde está. Nace en `null`
   * y cada gesto trae un pedido nuevo, así que nunca corre en la primera pintura.
   */
  useEffect(() => {
    if (!pedidoDeFoco) return
    const enfocado = document.activeElement
    if (enfocado && enfocado !== document.body) return
    const boton = pedidoDeFoco.destino === "cambiar" ? botonCambiarProfesional : botonDelProfesionalElegido
    boton.current?.focus()
  }, [pedidoDeFoco])

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
            servicio={servicioConDuracion}
            fecha={fecha}
            hora={hora}
            profesional={profesionalAsignado}
            precioDeLaHora={precioDeLaHora}
            detalleDeDuracion={detalleDeDuracion}
            sinServicio
          />
          <AgregarAlCalendario
            className="mt-7"
            conRecordatorio={conRecordatorio}
            cita={{
              id: citaId,
              servicio: servicioSeleccionado.name,
              negocio: nombreNegocio,
              fecha,
              hora,
              duracionMinutos: servicioConDuracion?.duration ?? servicioSeleccionado.duration,
              zona,
              direccion,
            }}
          />
          {enlaceDeGestion && !sePuedeCambiar && (
            <p className="mt-6 text-sm text-texto-2">{avisoSinCambiosDespuesDeReservar(plazoDeCambiosHoras, rubro)}</p>
          )}
          {enlaceDeGestion && sePuedeCambiar && (
            <p className="mt-6 text-sm text-texto-2">
              {frases.confirmada.pregunta}{" "}
              <a href={enlaceDeGestion} className="font-medium text-navy underline underline-offset-4 anillo-foco">
                {frases.confirmada.enlace}
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
        titulo={frases.encabezado.titulo}
        bajada={frases.encabezado.bajada}
      />

      {/*
        El relleno está medido para el calendario: 16px a los lados en el teléfono,
        para que a 360px entren sus siete columnas de 44px, y 32px hasta lg, para que
        a 768px entre al lado de los horarios.
      */}
      <Tarjeta className="mt-8 px-4 py-6 sm:p-8 md:mt-12 lg:p-10">
        <IndicadorDePasos paso={paso} pasos={pasosDeLaReserva(frases.primerPaso)} />

        <motion.div
          key={paso}
          initial={esLaPrimeraVista ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FUNDIDO}
          className="mt-8"
        >
          {/* Paso 1: Servicio (en una clínica dental, el motivo) */}
          {paso === 1 && (
            <>
              <TituloDelPaso ref={titulo} paso={1}>
                {frases.paso1.titulo}
              </TituloDelPaso>
              {/*
                ¿Con quién?, arriba: elegir a alguien deja ver sólo lo que hace;
                "cualquiera" los muestra todos. Sin equipo (el dueño solo) no hay
                a quién elegir y no se muestra.
              */}
              {profesionalesParaElegir.length > 0 && (
                <div className="mt-5">
                  <SelectorProfesional
                    profesionales={profesionalesParaElegir}
                    elegido={profesionalId}
                    onElegir={elegirProfesional}
                    cualquiera={cualquiera}
                  />
                  {/* Siempre en la página: así el lector de pantalla anuncia lo que aparece. */}
                  <p role="status" className={cn("text-sm text-pretty text-texto-2", avisoDeServicios && "mt-3")}>
                    {avisoDeServicios}
                  </p>
                </div>
              )}
              <p className={cn("text-sm text-texto-2", profesionalesParaElegir.length > 0 ? "mt-6" : "mt-2")}>
                {frases.paso1.puedesElegirHasta(MAX_SERVICIOS_POR_RESERVA)}
              </p>
              {servicioDeUrgencia && !urgencia && <AvisoDeUrgencia className="mt-4" nombre={servicioDeUrgencia.name} />}
              <div className="mt-5">
                <SelectorServicio
                  servicios={serviciosVisibles}
                  seleccionados={seleccionados}
                  onAlternar={alternarServicio}
                  tope={MAX_SERVICIOS_POR_RESERVA}
                  sinCombinacion={sinCombinacion}
                  motivoSinCombinacion={motivoSinCombinacion}
                  frases={frases.paso1.catalogo}
                />
              </div>
              {servicioSeleccionado && seleccionados.length > 1 && (
                <div className="mt-5" aria-live="polite">
                  <ServicioElegido
                    servicio={servicioSeleccionado}
                    cantidad={seleccionados.length}
                    plural={frases.elegidosEnPlural}
                  />
                </div>
              )}
              <BarraDeAcciones>
                <Boton
                  icono={<ArrowRight />}
                  disabled={!puedeAvanzarPaso1}
                  onClick={() => {
                    // El aviso de lo que se quitó ya se leyó: al volver no se repite.
                    setAvisoDeServicios("")
                    setPaso(2)
                  }}
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
                <ServicioElegido
                  servicio={servicioSeleccionado}
                  cantidad={seleccionados.length}
                  plural={frases.elegidosEnPlural}
                />
              )}
              {clinicaDental && !sinDias && (
                <PreguntaPrimeraVez valor={primeraVez} onResponder={setPrimeraVez} rubro={rubro} />
              )}
              {/*
                Sin equipo (el dueño solo) no hay a quién elegir: no se muestra.
                Si en el paso 1 ya se eligió a alguien no se vuelve a preguntar:
                queda "Con X · Cambiar", y el selector (con X marcado) sólo
                aparece al querer cambiar, o si no hay días para X (el aviso de
                abajo manda a elegir con quién).
              */}
              {profesionalesDelServicio.length > 0 && (
                <div className="mt-6">
                  {profesionalElegido && !cambiandoProfesional && !sinDias ? (
                    <ProfesionalYaElegido
                      ref={botonCambiarProfesional}
                      nombre={profesionalElegido.nombre}
                      textoDelBoton={frases.cambiarDeProfesional(profesionalElegido.nombre)}
                      onCambiar={() => {
                        setCambiandoProfesional(true)
                        setPedidoDeFoco({ destino: "elegido" })
                      }}
                    />
                  ) : (
                    <SelectorProfesional
                      profesionales={profesionalesDelServicio}
                      elegido={profesionalId}
                      onElegir={elegirProfesional}
                      cualquiera={cualquiera}
                      refDelElegido={botonDelProfesionalElegido}
                    />
                  )}
                </div>
              )}
              {urgencia && (
                <p role="status" className="mt-6 rounded-boton-lg bg-naranja-suave px-4 py-3 text-sm text-navy squircle">
                  {hoyConAtencion ? (
                    <>
                      <strong className="font-semibold">Urgencia:</strong> te mostramos sólo las horas de hoy.
                    </>
                  ) : (
                    MENSAJE_URGENCIA_SIN_HORAS
                  )}
                </p>
              )}
              <p role="status" className={cn("text-sm text-texto-2", avisoDelDia && "mt-6")}>
                {avisoDelDia}
              </p>
              {sinDias ? (
                <SinDiasConAtencion
                  className="mt-6"
                  lo={frases.paso2.sinDias.lo(seleccionados.length)}
                  conQuien={profesionalElegido?.nombre ?? null}
                  hayOtros={profesionalesDelServicio.length > 1}
                  textoDelBoton={frases.paso2.sinDias.textoDelBoton(seleccionados.length)}
                  sinOtros={frases.paso2.sinDias.sinOtros}
                  onCambiar={() => setPaso(1)}
                />
              ) : faltaLaPrimeraVez ? (
                <p className="mt-6 text-sm text-texto-2">{frases.paso2.faltaLaPrimeraVez}</p>
              ) : urgencia && !hoyConAtencion ? null : (
                <div className="mt-6">
                  <SelectorFechaHora
                    cargarHoras={cargarHoras}
                    claveDeHoras={claveDeHoras}
                    soloHoy={urgencia}
                    textoSinHoras={urgencia ? MENSAJE_URGENCIA_SIN_HORAS : undefined}
                    diasDisponibles={diasDisponibles}
                    zona={zona}
                    fechaSeleccionada={fecha}
                    horaSeleccionada={hora}
                    onFecha={elegirFecha}
                    onHora={elegirHora}
                    // Una urgencia sin horas no se espera: se llama a la clínica (el texto de arriba).
                    sinHoras={
                      listaDeEsperaActiva && servicioSeleccionado && !urgencia
                        ? (dia) => (
                            <FormularioListaDeEspera
                              // Otro día, servicios o profesional es otra inscripción: empieza de cero.
                              // Se revisa con todos los servicios; se guarda el primero (#162).
                              key={`${dia}|${claveDeServicios}|${profesionalId ?? ""}|${primeraVezQueSeManda ?? ""}`}
                              slug={slug}
                              servicioIds={servicioIds}
                              profesionalId={profesionalId}
                              fecha={dia}
                              fechaParaLeer={fechaParaLeer(deTexto(dia) ?? new Date())}
                              primeraVez={primeraVezQueSeManda}
                              rubro={rubro}
                            />
                          )
                        : undefined
                    }
                  />
                </div>
              )}
              {servicioDeUrgencia && !urgencia && <AvisoDeUrgencia className="mt-8" nombre={servicioDeUrgencia.name} />}
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
              {/*
                Un formulario de verdad: Enter en un campo confirma. `noValidate`
                porque los errores los dice la página, por campo y en su idioma;
                el botón no se deshabilita: al apretarlo se dice qué falta.
              */}
              <form noValidate onSubmit={confirmar} aria-describedby={error ? idDelError : undefined}>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <CampoFormulario
                  ref={(campo) => {
                    camposDeDatos.current.nombre = campo
                  }}
                  etiqueta="Nombre"
                  placeholder="Tu nombre"
                  autoComplete="given-name"
                  value={nombre}
                  onChange={(e) => cambiarDato("nombre", e.target.value, setNombre)}
                  error={erroresDeDatos.nombre}
                  required
                />
                <CampoFormulario
                  ref={(campo) => {
                    camposDeDatos.current.apellido = campo
                  }}
                  etiqueta="Apellido"
                  placeholder="Tu apellido"
                  autoComplete="family-name"
                  value={apellido}
                  onChange={(e) => cambiarDato("apellido", e.target.value, setApellido)}
                  error={erroresDeDatos.apellido}
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
                    ref={(campo) => {
                      camposDeDatos.current.email = campo
                    }}
                    etiqueta="Correo electrónico (opcional)"
                    type="email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => cambiarDato("email", e.target.value, setEmail)}
                    error={erroresDeDatos.email}
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
                    placeholder={frases.paso3.pistaDeComentarios}
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
                  servicio={servicioConDuracion}
                  fecha={fecha}
                  hora={hora}
                  precioDeLaHora={precioDeLaHora}
                  terminoDelServicio={frases.terminoDelServicio}
                  detalleDeDuracion={detalleDeDuracion}
                  profesional={
                    profesionalElegido?.nombre ??
                    (profesionalesDelServicio.length > 0
                      ? frases.profesionalSinElegir
                      : null)
                  }
                />
                {quedaSinCambiosPorElEnlace(fecha, hora, zona, plazoDeCambiosHoras, new Date()) ? (
                  // La hora ya está dentro del plazo: se dice antes de confirmar, no después en el enlace.
                  <p className="mt-4 border-t border-borde pt-3 text-sm font-medium text-navy">
                    {avisoSinCambiosPorElEnlace(plazoDeCambiosHoras, rubro)}
                  </p>
                ) : (
                  <p className="mt-4 border-t border-borde pt-3 text-sm text-texto-2">
                    {plazoDeCambios}
                  </p>
                )}
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
                  type="submit"
                  icono={<Check />}
                  cargando={enviando}
                  aria-describedby={error ? idDelError : undefined}
                  className="w-full sm:w-auto"
                >
                  Confirmar reserva
                </Boton>
              </BarraDeAcciones>
              </form>
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
 * El profesional que se eligió en el paso 1, a la vista en el paso 2 en vez de
 * volver a preguntar "¿Con quién?": "Con Carla · Cambiar". "Cambiar" abre el
 * selector, con ella marcada. El botón mide 44px de alto para el pulgar.
 */
function ProfesionalYaElegido({
  nombre,
  textoDelBoton,
  onCambiar,
  ref,
}: {
  nombre: string
  /** Para el lector de pantalla: "Cambiar de estilista: ahora con Carla" (`frasesDelFormulario`). */
  textoDelBoton: string
  onCambiar: () => void
  /** Para llevarle el foco cuando vuelve a aparecer tras elegir a alguien. */
  ref: Ref<HTMLButtonElement>
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-texto-2">
      <span className="break-words">
        Con <strong className="font-medium text-navy">{nombre}</strong>
      </span>
      <button
        ref={ref}
        type="button"
        onClick={onCambiar}
        aria-label={textoDelBoton}
        className="inline-flex min-h-11 items-center font-medium text-navy underline underline-offset-4 anillo-foco"
      >
        Cambiar
      </button>
    </p>
  )
}

/**
 * Lo que se eligió en el paso 1, a la vista mientras se busca el día. Con
 * varios servicios, los nombres unidos y el total: duración y precio.
 */
function ServicioElegido({
  servicio,
  cantidad = 1,
  plural = "servicios",
}: {
  servicio: ServicioPublico & { precioIncompleto?: boolean }
  cantidad?: number
  /** "servicios", o "motivos" en una clínica dental. */
  plural?: string
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-boton-lg bg-superficie px-4 py-3 squircle sm:px-5">
      <div className="min-w-0">
        <p className="font-medium break-words text-navy">{servicio.name}</p>
        <p className="text-sm text-texto-2">
          {cantidad > 1 ? `${cantidad} ${plural} · en total ` : ""}
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

/*
 * Lo elegido en la pregunta de la primera vez, como "¿Con quién?": el azul
 * suave con borde navy de 2px. El color nunca va solo: `aria-pressed` dice
 * cuál está elegido y el elegido va en negrita.
 */
const RESPUESTA_ELEGIDA = "bg-azul-suave font-semibold text-navy inset-ring-2 inset-ring-navy"
const RESPUESTA_EN_REPOSO =
  "bg-tarjeta font-medium text-navy inset-ring-1 inset-ring-texto-2 hover:bg-azul-suave hover:inset-ring-navy"

/**
 * Clínica dental: "¿Es tu primera consulta en la clínica?". La primera
 * consulta suma 15 minutos para abrir la ficha; la cuenta la hace el
 * servidor. Sin respuesta no se muestran horas: cambia cuánto dura la cita.
 */
function PreguntaPrimeraVez({
  valor,
  onResponder,
  rubro,
}: {
  valor: boolean | null
  onResponder: (primeraVez: boolean) => void
  rubro: string | null
}) {
  const idDelTexto = useId()
  const { paso2 } = frasesDelFormulario(rubro)
  const respuestas = [
    { valor: true, texto: paso2.respuestaDePrimeraVez },
    { valor: false, texto: "Ya me he atendido" },
  ]
  return (
    <fieldset className="mt-6">
      <legend className="font-medium text-navy">{paso2.preguntaDePrimeraVez}</legend>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
        {respuestas.map((respuesta) => {
          const elegida = valor === respuesta.valor
          return (
            <button
              key={respuesta.texto}
              type="button"
              aria-pressed={elegida}
              aria-describedby={idDelTexto}
              onClick={() => onResponder(respuesta.valor)}
              className={cn(
                "min-h-12 rounded-campo px-3 text-sm squircle anillo-foco",
                "transition-[background-color,box-shadow] duration-150 ease-suave",
                elegida ? RESPUESTA_ELEGIDA : RESPUESTA_EN_REPOSO
              )}
            >
              {respuesta.texto}
            </button>
          )
        })}
      </div>
      <p id={idDelTexto} className="mt-2.5 text-sm text-texto-2">
        {paso2.notaDePrimeraVez}
      </p>
    </fieldset>
  )
}

/**
 * Clínica dental con un servicio de urgencia activo: "¿Tienes dolor fuerte?
 * Elige «Urgencia dental» como motivo y te mostramos horas de hoy.", con el
 * nombre que le dio la clínica. Es una nota, no un error: en el naranja suave.
 */
function AvisoDeUrgencia({ nombre, className }: { nombre: string; className?: string }) {
  const { destacado, resto } = avisoDeUrgencia(nombre)
  return (
    <div
      role="note"
      className={cn("flex items-start gap-3 rounded-boton-lg bg-naranja-suave px-4 py-3.5 text-navy squircle", className)}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
      <p className="text-sm text-pretty">
        <strong className="font-semibold">{destacado}</strong> {resto}
      </p>
    </div>
  )
}

/**
 * El paso 2 sin ningún día con atención para lo elegido: nadie que haga
 * todo eso atiende (o no quien se eligió). En vez de un calendario vacío, qué
 * pasa y cómo salir: elegir con quién (si hay otros) o cambiar lo elegido.
 */
function SinDiasConAtencion({
  lo,
  conQuien,
  hayOtros,
  textoDelBoton,
  sinOtros,
  onCambiar,
  className,
}: {
  /** "este servicio", "estos motivos juntos". */
  lo: string
  /** El profesional elegido, si hay uno. */
  conQuien: string | null
  /** Si arriba hay a quién más elegir. */
  hayOtros: boolean
  textoDelBoton: string
  /** Lo que se dice cuando no hay a quién más elegir: "…o escríbele al negocio" / "a la clínica". */
  sinOtros: string
  onCambiar: () => void
  className?: string
}) {
  const titulo = conQuien ? `${conQuien} no tiene días con atención para ${lo}.` : `No hay días con atención para ${lo}.`
  const detalle = conQuien && hayOtros ? "Elige con quién más arriba, o cambia lo que elegiste." : sinOtros
  return (
    <div role="status" className={cn("rounded-panel bg-superficie p-5 squircle sm:p-6", className)}>
      <div className="flex items-start gap-3">
        <CalendarX2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-navy" strokeWidth={1.75} />
        <div>
          <p className="font-medium text-navy">{titulo}</p>
          <p className="mt-1 text-sm text-pretty text-texto-2">{detalle}</p>
        </div>
      </div>
      <Boton variante="secundario" icono={<ArrowLeft />} onClick={onCambiar} className="mt-4 w-full sm:w-auto">
        {textoDelBoton}
      </Boton>
    </div>
  )
}
