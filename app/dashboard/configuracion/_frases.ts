/**
 * Las frases de Configuración (el horario, la página pública, los servicios, los
 * productos, los sillones y los mensajes a los clientes) con las palabras del
 * rubro (`vocabularioDe(rubro).palabras`, `lib/vocabulario.ts`) y la
 * concordancia de `lib/concordancia.ts`: "Servicios" en un salón, "Prestaciones"
 * en una clínica dental; "Tus pacientes reciben un enlace…"; "desactívala" en
 * vez de "desactívalo".
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeConfiguracion(palabras)` y no pegan un artículo, un pronombre ni un
 * adjetivo a ninguna palabra del vocabulario. Un rubro desconocido o `null`
 * recibe las palabras neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * Qué no se migra, a propósito:
 * - "Reserva" (por confirmar, página de reservas) es el acto de reservar.
 * - "Precios de hora valle", "Rebajar las horas valle" y "ven horas": hablan de
 *   la hora del reloj, la franja del día.
 * - "Dueña o dueño" de "Sólo la dueña o el dueño del negocio…": otra oleada
 *   reescribe el género de la dueña.
 * - "Mensajes de servicio" (la categoría de un correo) y "Pedir reseña".
 *
 * "hora" es también la hora del reloj: donde la reserva se llama hora, las
 * frases que repetirían la palabra ("antes de la hora", "la hora en que empieza
 * la hora") se escriben de otra forma (`seLlamaHora`, de `../_frases`).
 */

import { al, concordar, del, el, pronombreDe, un } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro, type Sustantivo } from "@/lib/vocabulario"
import { elLocal, seLlamaHora } from "../_frases"

/** El mismo sustantivo con un adjetivo antes, concordado: "nuevo servicio" / "nueva prestación". */
function conAdjetivoAntes(adjetivo: string, sustantivo: Sustantivo): Sustantivo {
  return {
    ...sustantivo,
    singular: `${concordar(adjetivo, sustantivo)} ${sustantivo.singular}`,
    plural: `${concordar(adjetivo, sustantivo, "plural")} ${sustantivo.plural}`,
  }
}

/**
 * "los marcados" / "las marcadas": el adjetivo solo, con el artículo del
 * sustantivo que ya se dijo. `el` pide un sustantivo, y el adjetivo hace de
 * uno: así el artículo sale del género y no se escribe a mano.
 */
function losQueSon(adjetivo: string, sustantivo: Sustantivo): string {
  return el({ singular: concordar(adjetivo, sustantivo), plural: concordar(adjetivo, sustantivo, "plural"), genero: sustantivo.genero }, "plural")
}

export function frasesDeConfiguracion(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, cita, negocio, tablero, etiquetas } = palabras
  const local = elLocal(palabras)
  const nuevoServicio = conAdjetivoAntes("nuevo", servicio)
  // "primer" se acorta ante un sustantivo masculino y `concordar` no lo sabe: "primer servicio" / "primera prestación".
  const primerServicio: Sustantivo = { ...servicio, singular: `${servicio.genero === "f" ? "primera" : "primer"} ${servicio.singular}` }
  const loDelServicio = pronombreDe(servicio)

  return {
    /** La página: el subtítulo según quien la mira y el nombre del negocio cuando no tiene. */
    pagina: {
      /** "Gestiona horarios, servicios y equipo" / "Gestiona tu horario de atención". */
      subtitulo: (gestionaElNegocio: boolean): string =>
        gestionaElNegocio ? `Gestiona horarios, ${servicio.plural} y equipo` : "Gestiona tu horario de atención",
      /** El nombre de la pestaña del horario general si el negocio no tiene nombre: "El negocio" / "El salón". */
      negocioSinNombre: conMayuscula(el(negocio)),
    },

    /** El horario. */
    horario: {
      /** "Horario general del negocio" / "…del salón" / "…de la clínica". */
      general: `Horario general ${del(negocio)}`,
      /** El aviso de quien no tiene horario propio: su título, y su texto según si el negocio guardó el suyo. */
      usaElDelNegocio: `Usa el horario ${del(negocio)}`,
      negocioSinHorario: `No tiene horario propio y ${el(negocio)} todavía no guardó el suyo, así que no ofrece horas. Marca sus días y guarda para darle un horario propio.`,
      atiendeEnElDelNegocio: `No tiene horario propio: atiende en el ${del(negocio)}, que es el que ves. Si lo cambias y guardas, pasa a tener el suyo.`,
      /** El aviso del horario sin guardar. */
      sinGuardar: `Tus ${cliente.plural} no ven horas hasta que lo guardes. Revisa los días y las horas, y toca “Guardar horario”.`,
    },

    /** El nombre del negocio, editable en el lugar (Tu negocio). */
    nombreDelNegocio: {
      /** "Nombre del negocio" / "Nombre del salón" / "Nombre de la clínica": el título de la tarjeta y la etiqueta del campo. */
      etiqueta: `Nombre ${del(negocio)}`,
      /** Lo que se tranquiliza al cambiarlo: la dirección de la página no se mueve. */
      ayuda: "La dirección de tu página pública no cambia: los enlaces que ya compartiste siguen funcionando.",
      /** Lo que lee el lector de pantalla al guardar. */
      guardado: "Nombre guardado",
    },

    /** La zona horaria (sólo la dueña). */
    zonaHoraria: {
      /** "La hora con que se leen la agenda y las horas que ofrece tu página de reservas." */
      subtitulo: "La hora con que se leen la agenda y las horas que ofrece tu página de reservas.",
      /** "Elige dónde está el local." / "…la clínica." */
      ayuda: `Elige dónde está ${el(local)}.`,
      /** Una zona guardada que no está en la lista (un dato puesto a mano): se dice cuál es en vez de marcar otra. */
      otraZona: (zona: string): string =>
        `Tu ${negocio.singular} tiene guardada la zona ${zona}, que no está en la lista. Elige una para cambiarla.`,
      confirmar: {
        titulo: "¿Cambiar la zona horaria?",
        /**
         * Qué cambia y qué no. Lo agendado son instantes: no se mueven, cambia
         * a qué hora se leen. Donde la reserva se llama "hora" no se repite
         * la palabra ("las horas ya guardadas" se lee como reloj).
         */
        descripcion: seLlamaHora(cita)
          ? "Cambia el reloj con que se leen la agenda y los horarios que ofrece la reserva pública. Lo que ya está agendado no se mueve en el tiempo: cambia cómo se lee."
          : `Cambia a qué hora se muestran ${el(cita, "plural")} y qué horas ofrece la reserva pública. ${conMayuscula(el(cita, "plural"))} ya ${concordar("guardado", cita, "plural")} no se mueven en el tiempo: cambia cómo se leen.`,
        /** "Pasas de Chile continental a Isla de Pascua." */
        cambio: (de: string, a: string): string => `Pasas de ${de} a ${a}.`,
        confirmar: "Cambiar zona horaria",
        cancelar: "No cambiar",
      },
      guardado: "Zona horaria guardada",
    },

    /** Tu página pública. */
    paginaPublica: {
      subtitulo: `Lo que ven tus ${cliente.plural} al reservar.`,
      /** "WhatsApp del negocio" / "WhatsApp del salón". */
      whatsapp: `WhatsApp ${del(negocio)}`,
      fotos: `Las fotos se guardan al subirlas: no hace falta apretar “Guardar”. La foto de cada ${profesional.singular} se sube en Equipo, o en “Mi foto” por quien atiende.`,
      /** "Especialidad de cada profesional" / "…de cada estilista". */
      especialidad: `Especialidad de cada ${profesional.singular}`,
      /** La ayuda del enlace de reseñas; nombra la sección "Mensajes a clientes" / "Mensajes a pacientes". */
      ayudaDeLasResenas: `Lo copias desde tu Perfil de Empresa en Google, en «Pedir reseñas». Se usa en el correo que pide una reseña el día después de la visita, si lo activas en Mensajes a ${cliente.plural}.`,
    },

    /** Mi foto: quién la ve. */
    miFoto: {
      subtitulo: (apareceEnLaPagina: boolean): string =>
        apareceEnLaPagina
          ? `Es la que ven tus ${cliente.plural} en la página de reservas, junto a tu nombre.`
          : "Se ve en la lista del equipo. En la página de reservas sólo salen quienes atienden.",
    },

    /** La fila virtual: se anotan los clientes desde su celular mientras el local está abierto. */
    filaVirtual: {
      /** "Para atender por orden de llegada sin que esperen en el local" / "…en el salón" / "…en la clínica". */
      subtitulo: `Para atender por orden de llegada sin que esperen en ${el(local)}`,
      descripcion: `Tus ${cliente.plural} se anotan desde su celular mientras ${el(local)} está ${concordar("abierto", local)}, ven cuántas personas tienen adelante y les avisamos por correo cuando ya casi es su turno.`,
      /** Sobre la pantalla del televisor. */
      pantalla: `La pantalla usa la sesión de quien la abre: en el televisor o la tablet ${del(local)} queda abierto el panel de esa cuenta. Déjala en pantalla completa y no dejes el panel a mano ${del(cliente, "plural")} en ese equipo.`,
    },

    /** El plazo para cancelar o reagendar. */
    plazoDeCambios: {
      subtitulo: `Tus ${cliente.plural} reciben un enlace en el correo de confirmación`,
      /** "Hasta cuántas horas antes de la cita pueden hacerlo solos…"; en un salón, sin "de la hora": "horas antes de la hora" se lee como reloj. */
      ayuda: `Hasta cuántas horas antes ${seLlamaHora(cita) ? "" : `${del(cita)} `}pueden hacerlo ${concordar("solo", cliente, "plural")}, de 0 a 72. Después, el enlace les pide que te contacten.`,
    },

    /** Las faltas para pedir confirmación. */
    porConfirmar: {
      /** "Cuentan las citas marcadas “No vino” con el mismo correo…" / "…las horas marcadas…" / "…“No asistió”…". */
      ayuda: (minimo: number, maximo: number): string =>
        `De ${minimo} a ${maximo}. Cuentan ${el(cita, "plural")} ${concordar("marcado", cita, "plural")} “${etiquetas.noVino}” con el mismo correo de quien reserva; el teléfono no cuenta, y una reserva sin correo nunca entra por confirmar.`,
    },

    /** Los precios de hora valle (no existe en la clínica dental). */
    horaValle: {
      /** Quién lo ve y qué cuenta; en un salón, "la hora en que empieza la hora" se evita. */
      descripcion: `Quien reserva por tu página a una hora de estas franjas paga menos: lo ve en las horas y en el resumen. Cuenta ${seLlamaHora(cita) ? "la hora de inicio" : `la hora en que empieza ${el(cita)}`}. ${conMayuscula(el(cita, "plural"))} que anotas en la agenda no se rebajan ${concordar("solo", cita, "plural")}.`,
      /** "Servicios sin rebaja" / "Prestaciones sin rebaja". */
      sinRebaja: `${conMayuscula(servicio.plural)} sin rebaja`,
      /** "Los marcados cuestan lo mismo a cualquier hora." */
      sinRebajaAyuda: `${conMayuscula(losQueSon("marcado", servicio))} cuestan lo mismo a cualquier hora.`,
    },

    /** El catálogo. */
    servicios: {
      /** "Servicios" / "Prestaciones": el título de la tarjeta y del modal. */
      titulo: conMayuscula(servicio.plural),
      subtitulo: `${conMayuscula(el(servicio, "plural"))} que ofreces a tus ${cliente.plural}`,
      /** "Nuevo servicio" / "Nueva prestación": el botón y el título del modal. */
      nuevo: conMayuscula(nuevoServicio.singular),
      sinServicios: {
        titulo: `Sin ${servicio.plural} aún`,
        /** "Agrega el primer servicio que ofreces" / "Agrega la primera prestación que ofreces". */
        ayuda: `Agrega ${el(primerServicio)} que ofreces`,
      },
      /** El nombre accesible del interruptor de la fila: "Servicio activo: Corte" / "Prestación activa: Limpieza". */
      activo: (nombre: string): string => `${conMayuscula(servicio.singular)} ${concordar("activo", servicio)}: ${nombre}`,
      eliminar: {
        /** "…desactívalo con su interruptor: sale de la página pública y lo vuelves a encender cuando quieras." */
        descripcion: `No se puede deshacer. Si sólo quieres dejar de ofrecer${loDelServicio} por un tiempo, desactíva${loDelServicio} con su interruptor: sale de la página pública y ${loDelServicio} vuelves a encender cuando quieras.`,
        confirmar: `Eliminar ${servicio.singular}`,
      },
      modal: {
        titulo: (editando: boolean): string => (editando ? `Editar ${servicio.singular}` : conMayuscula(nuevoServicio.singular)),
        antetitulo: conMayuscula(servicio.plural),
        nombre: `Nombre ${del(servicio)}`,
        descripcionPlaceholder: `Describe brevemente ${el(servicio)}...`,
        crear: `Crear ${servicio.singular}`,
        /** "Cada cuántos días vuelve un cliente (opcional)". */
        frecuencia: `Cada cuántos días vuelve ${un(cliente)} (opcional)`,
        /** Sólo en una clínica dental: la casilla y lo que cambia al marcarla. */
        urgencia: "Es una urgencia",
        urgenciaAyuda: "En la reserva pública sólo ofrece horas de hoy.",
      },
    },

    /** Los productos. */
    productos: {
      subtitulo: `Lo que vendes además de tus ${servicio.plural}`,
      /** "Agrega lo que vendes en el local para anotarlo en el tablero" / "…en la clínica para anotarlo en la sala de espera". */
      vacio: `Agrega lo que vendes en ${el(local)} para anotarlo en ${el(tablero)}`,
    },

    /** Los sillones (sólo existen en la clínica dental). */
    sillones: {
      /** "Uno desactivado no se ofrece para citas nuevas, y las citas que ya lo tienen lo conservan." */
      desactivados: `Los sillones no se borran: se desactivan. Uno desactivado no se ofrece para ${cita.plural} ${concordar("nuevo", cita, "plural")}, y ${el(cita, "plural")} que ya lo tienen lo conservan.`,
      vacio: `Agrega los sillones ${del(negocio)} para ver la agenda por sillón y asignárselos ${al(cita, "plural")}.`,
    },

    /** Mensajes a los clientes. */
    mensajes: {
      /** "Mensajes a clientes" / "Mensajes a pacientes": el título de la tarjeta y de la sección. */
      titulo: `Mensajes a ${cliente.plural}`,
      listaDeEspera: `Si un día no tiene horas, tus ${cliente.plural} se anotan y les avisamos por correo cuando se libere una.`,
      /** El aviso de vuelta: "Te toca volver" o, en una clínica, "Control". */
      avisoDeVuelta: {
        etiqueta: etiquetas.seguimiento,
        descripcion: `Un correo cuando a ${un(cliente)} ya le toca volver, según cada cuánto viene o la frecuencia de su ${servicio.singular}.`,
      },
      /** El aviso de arriba: a quiénes les llegan los mensajes promocionales. */
      soloConConsentimiento: `“${etiquetas.seguimiento}” y “Pedir reseña” sólo les llegan a quienes aceptaron recibir avisos y novedades de tu ${negocio.singular} por correo, y cada correo trae cómo darse de baja. La lista de espera le llega a quien se anotó.`,
    },

    /** Lo que dicen los pedidos al servidor cuando algo falla, con las palabras del rubro. */
    errores: {
      crearServicio: `No se pudo crear ${el(servicio)}`,
      guardarServicio: `No se pudo guardar ${el(servicio)}`,
      activarServicio: `No se pudo activar ${el(servicio)}`,
      desactivarServicio: `No se pudo desactivar ${el(servicio)}`,
      borrarServicio: `No se pudo borrar ${el(servicio)}`,
    },
  }
}
