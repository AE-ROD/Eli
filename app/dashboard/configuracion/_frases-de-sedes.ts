/**
 * Las frases de «Sedes y horarios» (plan Independiente) con las palabras del
 * rubro (`vocabularioDe(rubro).palabras`) y la concordancia de
 * `lib/concordancia.ts`: «Tus clientes eligen la sede…» / «Tus pacientes
 * eligen…», «3 horas agendadas por delante» / «3 citas agendadas por
 * delante». Ninguna pega un artículo, un pronombre ni un adjetivo a una
 * palabra del vocabulario.
 *
 * Es lógica sin pantalla: `_frases.ts` las suma a
 * `frasesDeConfiguracion(...).sedes`. Y como los avisos de un pedido que falló
 * dependen del código con que respondió el servidor, `error` elige el mensaje
 * por código (como `errorDeLote` de `_frases-de-servicios.ts`): el 401, el
 * 404, el 429 y los 5xx siempre con un texto nuestro, porque el del servidor
 * ("No autorizado", "Error interno") no le dice nada a quien lo lee; el 400 y
 * el 409 con el motivo del servidor, que sí es claro.
 *
 * Cuidado con «hora»: en un salón la reserva se llama «hora» y «3 horas
 * futuras» se lee como reloj; por eso siempre «horas agendadas».
 */

import { cantidadDe, concordar, del, el, numeroDe } from "@/lib/concordancia"
import { MAX_SEDES } from "@/lib/sedes"
import type { PalabrasDelRubro } from "@/lib/vocabulario"

/** Qué se intentaba hacer cuando el servidor respondió con un error. */
export type AccionDeSedes =
  | "leer"
  | "agregar"
  | "convertir"
  | "editar"
  | "activar"
  | "desactivar"
  | "ordenar"
  | "borrar"
  | "guardar-horario"
  | "cambiar-de-plan"

export function frasesDeLasSedes(palabras: PalabrasDelRubro) {
  const { cliente, cita, negocio } = palabras
  const agendadas = concordar("agendado", cita, "plural")

  /** Lo que se dice cuando no hay un motivo mejor, por acción. */
  const porDefecto = (accion: AccionDeSedes): string => {
    switch (accion) {
      case "leer":
        return "No se pudieron cargar las sedes. Recarga la página para verlas al día."
      case "agregar":
        return "No se pudo agregar la sede. Inténtalo de nuevo."
      case "convertir":
        return "No se pudieron crear las sedes. Inténtalo de nuevo."
      case "editar":
        return "No se pudo guardar la sede. Inténtalo de nuevo."
      case "activar":
        return "No se pudo activar la sede. Inténtalo de nuevo."
      case "desactivar":
        return "No se pudo desactivar la sede. Inténtalo de nuevo."
      case "ordenar":
        return "No se pudo cambiar el orden. Inténtalo de nuevo."
      case "borrar":
        return "No se pudo borrar la sede. Inténtalo de nuevo."
      case "guardar-horario":
        return "No se pudo guardar el horario. Inténtalo de nuevo."
      case "cambiar-de-plan":
        return "No se pudo cambiar el plan. Inténtalo de nuevo."
    }
  }

  /** El 409 sin un motivo del servidor: lo más probable para cada acción. */
  const conflicto = (accion: AccionDeSedes): string => {
    switch (accion) {
      case "borrar":
        return `Esta sede ya tuvo ${cita.plural}, así que no se puede borrar. Desactívala y deja de ofrecerse.`
      case "desactivar":
        return `Esta sede tiene ${cita.plural} ${agendadas} por delante. Muévelas o cancélalas antes de desactivarla.`
      case "activar":
        return `No se pudo activar la sede: su horario se pisaría con el de otra sede activa, o ya tienes ${MAX_SEDES} sedes activas.`
      case "agregar":
      case "convertir":
        return `Ya tienes una sede con ese nombre, o ya tienes ${MAX_SEDES} sedes activas.`
      case "editar":
        return "Ya tienes otra sede con ese nombre."
      case "guardar-horario":
        return "El horario de esta sede se pisa con el de otra sede el mismo día. Revisa los días y las horas."
      case "cambiar-de-plan":
        return "Por ahora no se puede cambiar de plan. Revisa tu equipo y tus sedes e inténtalo de nuevo."
      case "leer":
      case "ordenar":
        return "Algo cambió mientras mirabas. Recarga la página e inténtalo de nuevo."
    }
  }

  /**
   * El aviso de un pedido que falló, por código. Sin respuesta (`null`) vale lo
   * que dijo la red ("Sin conexión con el servidor"). Un 2xx es una respuesta
   * que no se pudo leer: el texto por defecto.
   */
  const error = (codigo: number | null, delServidor: string, accion: AccionDeSedes): string => {
    const mensaje = delServidor.trim()
    if (codigo === null) return mensaje || porDefecto(accion)
    if (codigo === 401) {
      return "Tu sesión terminó o no tienes permiso para hacer este cambio. Vuelve a entrar e inténtalo de nuevo."
    }
    if (codigo === 404) return "No se encontró lo que querías cambiar. Recarga la página e inténtalo de nuevo."
    if (codigo === 429) return "Hiciste varios cambios seguidos. Espera un momento e inténtalo de nuevo."
    if (codigo === 503) return "Por ahora no se puede hacer este cambio. Inténtalo más tarde."
    if (codigo >= 500) return porDefecto(accion)
    if (codigo === 409) return mensaje || conflicto(accion)
    if (codigo === 400 || codigo === 422) {
      return mensaje || "Algo de lo que enviaste no se pudo leer. Revisa los datos e inténtalo de nuevo."
    }
    return porDefecto(accion)
  }

  return {
    titulo: "Sedes y horarios",
    subtitulo: `Tus ${cliente.plural} eligen la sede al reservar y ven qué días y a qué horas estás en cada una.`,
    /** La regla que el servidor hace respetar, dicha una vez. */
    regla:
      "Dos sedes no pueden tener franjas que se pisen el mismo día, porque no puedes estar en dos lugares a la vez. Que una termine justo cuando empieza la otra sí se puede.",

    /** «2 de 5 sedes activas». */
    cupo: (activas: number): string => `${activas} de ${MAX_SEDES} sedes activas`,
    sinCupo: `Ya tienes ${MAX_SEDES} sedes activas. Desactiva una para agregar otra.`,
    agregar: "Agregar sede",

    fila: {
      lugar: (lugar: number, total: number): string => `Lugar ${lugar} de ${total}`,
      desactivada: "Desactivada",
      sinHorario: `Sin horario cargado: tus ${cliente.plural} no ven ${cita.plural} en esta sede hasta que lo cargues.`,
      /** «Sin horas agendadas por delante» / «1 cita agendada por delante» / «3 horas agendadas por delante». */
      horasPorDelante: (cantidad: number): string =>
        cantidad === 0
          ? `Sin ${cita.plural} ${agendadas} por delante`
          : `${cantidadDe(cantidad, cita)} ${concordar("agendado", cita, numeroDe(cantidad))} por delante`,
      verHorario: "Horario de la semana",
      cerrarHorario: "Cerrar el horario",
      subir: (nombre: string): string => `Subir ${nombre}`,
      bajar: (nombre: string): string => `Bajar ${nombre}`,
      editar: (nombre: string): string => `Editar ${nombre}`,
      borrar: (nombre: string): string => `Borrar ${nombre}`,
      activa: (nombre: string): string => `Sede activa: ${nombre}`,
    },

    /** Lo que lee el lector de pantalla después de cada cambio. */
    anuncios: {
      activada: (nombre: string): string => `${nombre} quedó activa.`,
      desactivada: (nombre: string): string => `${nombre} quedó desactivada.`,
      lugar: (nombre: string, lugar: number, total: number): string => `${nombre} quedó en el lugar ${lugar} de ${total}.`,
      agregada: (nombre: string): string => `Se agregó ${nombre}.`,
      editada: (nombre: string): string => `Se guardaron los cambios de ${nombre}.`,
      borrada: (nombre: string): string => `Se borró ${nombre}.`,
      horarioGuardado: (nombre: string): string => `Se guardó el horario de ${nombre}.`,
    },

    borrar: {
      titulo: (nombre: string): string => `¿Borrar ${nombre}?`,
      descripcion: `Se borra la sede con su horario y no se puede deshacer. Si alguna vez tuvo ${cita.plural}, no se puede borrar: desactívala y queda guardada.`,
      confirmar: "Borrar sede",
      cancelar: "No borrar",
    },

    modal: {
      tituloAgregar: "Nueva sede",
      tituloEditar: "Editar sede",
      ayudaAgregar: "Se agrega activa y sin horario: después cargas los días y las horas.",
      nombre: "Nombre de la sede",
      nombreAyuda: `Como la verán tus ${cliente.plural}. Por ejemplo, “Consulta Providencia”.`,
      nombreEjemplo: "Ej.: Consulta Providencia",
      direccion: "Dirección",
      direccionEjemplo: "Av. Providencia 1234, oficina 5",
      comuna: "Comuna",
      comunaEjemplo: "Providencia",
      telefono: "Teléfono (opcional)",
      telefonoEjemplo: "+56 9 1234 5678",
      agregar: "Agregar sede",
      guardar: "Guardar",
      cancelar: "Cancelar",
    },

    editor: {
      titulo: (nombre: string): string => `Horario de ${nombre}`,
      ayuda: "Marca los días en que estás en esta sede y elige de qué hora a qué hora. Si atiendes en dos tramos, agrega otra franja.",
      sinAtencion: "No disponible",
      franja: (dia: string, numero: number, total: number): string => (total > 1 ? `${dia}, franja ${numero}` : dia),
      agregarFranja: (dia: string): string => `Agregar otra franja el ${dia.toLowerCase()}`,
      agregarFranjaVisible: "Otra franja",
      sinLugar: "No queda lugar para otra franja este día",
      quitarFranja: (dia: string, numero: number): string => `Quitar la franja ${numero} de ${dia}`,
      guardar: "Guardar horario",
      guardado: "Guardado",
      cerrar: "Cerrar",
      sinGuardar: "Tienes cambios sin guardar.",
      sinDias: `Sin ningún día marcado: tus ${cliente.plural} no verán ${cita.plural} en esta sede.`,
      choques: {
        titulo: (cantidad: number): string =>
          cantidad === 1 ? "Este horario se pisa con el de otra sede" : "Este horario se pisa con el de otras sedes",
        ayuda: "No se puede guardar así: cambia las horas o quita el día. Que una franja termine justo cuando empieza la otra sí se puede.",
        /** Para el lector de pantalla, cada vez que cambia: «Se pisa con otra sede el lunes y el martes.» */
        anuncio: (dias: string[]): string =>
          dias.length === 0
            ? ""
            : `Se pisa con otra sede: ${dias.join(", ")}. No se puede guardar así.`,
        delServidor: "Días que se pisan",
      },
      descartar: {
        titulo: "¿Descartar los cambios sin guardar?",
        descripcion: (nombre: string): string =>
          `Cambiaste el horario de ${nombre} y no lo guardaste. Si sigues, esos cambios se pierden.`,
        confirmar: "Descartar cambios",
        cancelar: "Seguir editando",
      },
    },

    /** «Trabajo en más de un lugar»: pasar de cero sedes a dos. */
    convertir: {
      titulo: "Trabajo en más de un lugar",
      descripcion: `Hoy atiendes sólo en la dirección ${del(negocio)}. Si trabajas en más de un lugar, agrega cada sede con su dirección y los días y las horas en que estás ahí. Tus ${cliente.plural} eligen dónde reservar.`,
      boton: "Trabajo en más de un lugar",
      modal: {
        descripcion: `Tus ${cliente.plural} van a ver dónde atiendes y cuándo estás en cada lugar.`,
        principal: {
          leyenda: "Donde atiendes hoy",
          ayuda: `Le damos nombre a la dirección ${del(negocio)} que ya tienes. Su horario es el que tienes cargado hoy, y ${el(cita, "plural")} ${agendadas} por delante quedan en ella.`,
        },
        nueva: {
          leyenda: "El otro lugar",
          ayuda: "Parte sin horario: después cargas sus días y horas.",
        },
        crear: "Crear las dos sedes",
        cancelar: "Cancelar",
      },
      listo: "Listo: ahora tienes dos sedes. Carga los días y las horas de la nueva.",
    },

    error,
  }
}
