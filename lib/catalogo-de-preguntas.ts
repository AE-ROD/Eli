import { al, articuloDe, concordar, del, el, ese, pronombreDe, un } from "@/lib/concordancia"
import {
  DIAS_DE_PRUEBA,
  DIAS_EXTRA_POR_REFERIDO,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
  formatearPesos,
} from "@/lib/precios"
import { DIAS_MAXIMOS_DE_ANTICIPACION } from "@/lib/reserva-publica"
import type { AreaDeSoporte } from "@/lib/soporte"
import { conMayuscula, vocabularioDe, type PalabrasDelRubro, type Sustantivo } from "@/lib/vocabulario"

/**
 * El catálogo de preguntas frecuentes del centro de ayuda (/dashboard/ayuda y
 * /soporte), agrupadas por las mismas áreas que una solicitud de soporte
 * (`lib/soporte.ts`). `lib/preguntas-frecuentes.ts` lo resuelve para un rubro y
 * lo busca.
 *
 * Cada pregunta es una función de las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`): "Tablero" es "Sala de espera" en una
 * clínica dental, "cliente" es "paciente", "profesional" es "estilista" en un
 * salón. El artículo, el demostrativo, el pronombre y el adjetivo salen del
 * género y el número de la palabra (`lib/concordancia.ts`); ninguna pregunta
 * pega uno a mano. Las que no nombran nada del rubro son texto fijo. Con las
 * palabras neutras (un rubro desconocido o ninguno: la página pública
 * /soporte), cada pregunta dice exactamente lo que decía antes del vocabulario.
 *
 * Cada respuesta cuenta solo lo que el producto hace hoy (`docs/PRODUCTO.md`):
 * nada de WhatsApp, pagos en línea ni app nativa, que no existen. Cuando el
 * producto cambie, se revisan acá también. Los precios y los días se leen de
 * `lib/precios.ts` y de `lib/reserva-publica.ts`: escritos a mano quedarían
 * viejos cuando cambien.
 *
 * Lo que NO se migra, porque no es una palabra del rubro: Agenda, Reportes,
 * Equipo, "Reserva" como acto ("reservas de hoy", "la reserva queda guardada"),
 * "turno" (la franja mañana/tarde/noche), "dueño", "encargado" y "negocio".
 *
 * Cuidado con "hora": en un salón, una barbería y un salón de uñas la reserva
 * se llama "hora", y "¿Qué horas ve cada estilista?" o "sus últimas horas" se
 * leen como minutos de reloj. Donde la palabra choca con el reloj, la frase se
 * escribe de otra forma (`seLlamaHora`); la hora del reloj ("la hora de
 * inicio", "elige otra hora libre") no se toca.
 *
 * Una pregunta que explica algo que la clínica dental ya no tiene (hora valle,
 * fila virtual, propinas) se declara `sinClinica` y no se muestra ahí. Si
 * mezcla un tema que sí existe con uno que no, se escribe por rubro (con
 * `enLaClinica`) en vez de ocultarla.
 */

/** Lo que sabe una pregunta del rubro de quien la lee. */
export interface ContextoDeAyuda {
  palabras: PalabrasDelRubro
  /** El rubro es la clínica dental: para lo que se llama o funciona distinto ahí, más allá de las palabras. */
  enLaClinica: boolean
}

/** Un valor fijo, o uno que depende de las palabras del rubro. */
export type DePalabras<T> = T | ((contexto: ContextoDeAyuda) => T)

export interface PreguntaDelCatalogo {
  /** Único y estable: es el `id` del acordeón en la página. */
  id: string
  area: AreaDeSoporte
  pregunta: DePalabras<string>
  /** Párrafos de la respuesta, en el orden en que se leen. */
  respuesta: DePalabras<readonly string[]>
  /** Otras formas de decirlo que la búsqueda también encuentra ("contraseña" → "clave"). */
  palabrasClave: DePalabras<readonly string[]>
  /**
   * Si responde a un problema típico ("no aparecen horas", "no me llega el
   * correo"), no a cómo se usa algo. Son las que se sugieren en el camino
   * "Algo no funciona", antes del formulario.
   */
  paraFallas?: true
  /**
   * Lo que explica no existe en la clínica dental (hora valle, fila virtual,
   * propinas): ahí la pregunta no se muestra. En cualquier otro rubro, también
   * en uno desconocido, se muestra.
   */
  sinClinica?: true
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/**
 * Si la reserva se llama "hora". Choca con la hora del reloj: se evitan las
 * frases que se leerían como tiempo ("¿Qué horas ve cada estilista?"). Es la
 * misma regla de `app/dashboard/_frases.ts`.
 */
function seLlamaHora(cita: Sustantivo): boolean {
  return cita.singular === "hora"
}

/**
 * La reserva con su artículo, para una frase que ya habla de la hora del reloj:
 * "Abre la reserva… eliges la fecha y la hora" en un salón, "Abre la cita…" en
 * una clínica o sin rubro. Donde la frase no mezcla las dos "hora", se usa la
 * palabra del rubro tal cual.
 */
function laReserva(cita: Sustantivo): string {
  return seLlamaHora(cita) ? "la reserva" : el(cita)
}

/** La sección con su nombre propio, como se lee en el menú: "Tablero", "Sala de espera". */
function comoSeccion(sustantivo: Sustantivo): Sustantivo {
  return {
    ...sustantivo,
    singular: conMayuscula(sustantivo.singular),
    plural: conMayuscula(sustantivo.plural),
  }
}

/** "Nueva cita" / "Nueva hora" / "Nuevo cliente": el botón de crear, con el adjetivo concordado. */
function nuevo(sustantivo: Sustantivo): string {
  return `${conMayuscula(concordar("nuevo", sustantivo))} ${sustantivo.singular}`
}

/**
 * El negocio como lugar, para "Tu QR para el local": el rubro con palabras
 * propias lo nombra con ellas ("el salón", "la clínica") y el que no las tiene
 * sigue diciendo "local". Es la misma regla de `app/dashboard/_frases.ts`.
 */
function elLocal(palabras: PalabrasDelRubro): Sustantivo {
  const sinPalabrasPropias = palabras.negocio.singular === PALABRAS_NEUTRAS.negocio.singular
  return sinPalabrasPropias ? { singular: "local", plural: "locales", genero: "m" } : palabras.negocio
}

/** Formas sueltas que `lib/concordancia.ts` no tiene, elegidas por el género de la palabra. */
function segunElGenero(masculino: string, femenino: string): (sustantivo: Sustantivo) => string {
  return (sustantivo) => (sustantivo.genero === "f" ? femenino : masculino)
}

/** "él" / "ella": quien hace algo, cuando la palabra ya se dijo. */
const ellaOEl = segunElGenero("él", "ella")
/** "ellos" / "ellas". */
const ellasOEllos = segunElGenero("ellos", "ellas")
/** "los" / "las": el artículo plural solo, y el pronombre de varios ("asignarlas"). */
const lasOLos = segunElGenero("los", "las")

/** "del que" / "de la que": "a nombre de la estilista que eligió… o, con…, de la que estaba libre". */
function delQue(sustantivo: Sustantivo): string {
  const articulo = articuloDe(sustantivo)
  return articulo === "el" ? "del que" : `de ${articulo} que`
}

/** "o", o "u" ante una palabra que empieza con "o" o "ho": "encargado o estilista", "encargado u odontólogo". */
function oUAntesDe(siguiente: string): string {
  return /^h?o/i.test(siguiente) ? "u" : "o"
}

// ─── El catálogo ─────────────────────────────────────────────────────────────

export const CATALOGO: readonly PreguntaDelCatalogo[] = [
  // ─── Agenda ────────────────────────────────────────────────────────────────
  {
    id: "agenda-nueva-cita",
    area: "agenda",
    pregunta: ({ palabras: { cita } }) => `¿Cómo agendo ${un(cita)} desde el panel?`,
    respuesta: ({ palabras: { cliente, profesional, servicio, cita } }) => [
      `En Agenda, toca "${nuevo(cita)}". Escribe ${el(servicio)}, elige ${el(cliente)}, la fecha y la hora de inicio y de término. El dueño y el encargado eligen además ${el(profesional)} que atiende. El precio es opcional.`,
      `Las reservas que tus ${cliente.plural} hacen desde tu página pública aparecen solas en la agenda.`,
    ],
    palabrasClave: ({ palabras: { cita } }) => ["agendar", `crear ${cita.singular}`, "reservar", "turno", "hora"],
  },
  {
    id: "agenda-vistas",
    area: "agenda",
    pregunta: "¿Puedo ver la agenda por día, semana o mes?",
    respuesta: [
      "Sí. Arriba de la agenda eliges la vista Día, Semana o Mes, y con las flechas pasas al día, la semana o el mes anterior o siguiente.",
    ],
    palabrasClave: ["calendario", "vista", "semanal", "mensual", "diaria"],
  },
  {
    id: "agenda-cancelar-cita",
    area: "agenda",
    pregunta: ({ palabras: { cita } }) => `¿Cómo cancelo ${un(cita)}?`,
    respuesta: ({ palabras: { cita, tablero } }) => [
      `Abre ${el(cita)} en la agenda y toca "Cancelar ${cita.singular}". No se borra: queda en la agenda marcada como ${concordar("cancelado", cita)}.`,
      `Desde el mismo detalle puedes marcar${pronombreDe(cita)} como ${concordar("completado", cita)}. Ojo: ${un(cita)} ${concordar("marcado", cita)} como ${concordar("completado", cita)} en la agenda no suma ingresos en Reportes; lo que suma es lo que se cobra en ${el(comoSeccion(tablero))}.`,
    ],
    palabrasClave: ({ palabras: { cita } }) => [
      "anular",
      "eliminar",
      "borrar",
      concordar("cancelado", cita),
      concordar("completado", cita),
    ],
  },
  {
    id: "agenda-cambiar-hora",
    area: "agenda",
    // "¿Puedo cambiar la hora de una hora?" se lee como reloj: en un salón se pregunta por reprogramar.
    pregunta: ({ palabras: { cita } }) =>
      seLlamaHora(cita) ? `¿Puedo reprogramar ${un(cita)}?` : `¿Puedo cambiar la hora de ${un(cita)}?`,
    respuesta: ({ palabras: { cliente, profesional, cita } }) => [
      `Sí. Abre ${laReserva(cita)} en la agenda y toca "Cambiar fecha y hora": eliges la fecha, la hora de inicio y la de término y, si eres dueño o encargado, ${el(profesional)}.`,
      `Si a esa hora ya hay algo, está bloqueada o queda fuera del horario, Eli te avisa antes de guardar y puedes confirmar igual. Tus ${cliente.plural} también pueden cambiar su hora desde el enlace de su correo de confirmación, dentro del plazo que fijes.`,
    ],
    palabrasClave: ["reprogramar", "mover", "cambiar fecha", "reagendar"],
  },
  {
    id: "agenda-profesional-ve",
    area: "agenda",
    // "¿Qué horas ve cada estilista?" se lee como reloj: en un salón se pregunta por la agenda.
    pregunta: ({ palabras: { profesional, cita } }) =>
      seLlamaHora(cita)
        ? `¿Qué agenda ve cada ${profesional.singular}?`
        : `¿Qué ${cita.plural} ve cada ${profesional.singular}?`,
    respuesta: ({ palabras: { profesional } }) => [
      `Cada ${profesional.singular} ve su propia agenda. El dueño y el encargado ven la de todo el negocio.`,
    ],
    palabrasClave: ({ palabras: { profesional, cita } }) => [
      "permisos",
      "rol",
      `ver ${cita.plural}`,
      profesional.singular,
    ],
  },
  {
    id: "agenda-no-veo-cita",
    area: "agenda",
    pregunta: ({ palabras: { cita } }) => `No veo ${un(cita)} en la agenda`,
    respuesta: ({ palabras: { cliente, profesional, cita }, enLaClinica }) => {
      // El selector de la página pública se llama distinto en la clínica.
      const cualquiera = enLaClinica ? "La primera hora disponible" : "Cualquiera disponible"
      return [
        "Revisa la vista (Día, Semana o Mes) y la fecha en que estás parado: con las flechas pasas al día, la semana o el mes anterior o siguiente.",
        `Si eres ${profesional.singular}, ves solo ${el(cita, "plural")} ${concordar("asignado", cita, "plural")} a ti. Las reservas de la página pública llegan a nombre ${del(profesional)} que eligió ${el(cliente)} o, con "${cualquiera}", ${delQue(profesional)} estaba libre. ${conMayuscula(el(cita, "plural"))} sin ${profesional.singular} (por ejemplo, ${lasOLos(cita)} de antes de que se pudiera elegir) solo ${lasOLos(cita)} ven el dueño y el encargado, que pueden asignar${lasOLos(cita)} desde el detalle ${del(cita)}.`,
      ]
    },
    palabrasClave: ({ palabras: { profesional, cita } }) => [
      "no aparece",
      "no veo",
      "falta",
      `${cita.singular} ${concordar("perdido", cita)}`,
      "reserva",
      profesional.singular,
    ],
    paraFallas: true,
  },
  {
    id: "agenda-no-encuentro-cliente",
    area: "agenda",
    pregunta: ({ palabras: { cliente, cita } }) => `Al crear ${un(cita)} no encuentro ${al(cliente)}`,
    respuesta: ({ palabras: { cliente, cita } }) => [
      `En "${nuevo(cita)}" ${el(cliente)} se elige de la lista: escribe al menos 2 letras de su nombre, correo o teléfono y tóca${pronombreDe(cliente)} cuando aparezca.`,
      `Si no aparece, todavía no está en ${conMayuscula(cliente.plural)}. Agréga${pronombreDe(cliente)} en ${conMayuscula(cliente.plural)} con "${nuevo(cliente)}" y vuelve a crear ${el(cita)}.`,
    ],
    palabrasClave: ({ palabras: { cliente, cita } }) => [
      "no aparece",
      `buscar ${cliente.singular}`,
      `${concordar("nuevo", cita)} ${cita.singular}`,
      "no encuentro",
      "no me deja",
    ],
    paraFallas: true,
  },

  // ─── Reservas en línea ─────────────────────────────────────────────────────
  {
    id: "reservas-enlace",
    area: "reservas",
    pregunta: "¿Dónde está mi enlace de reservas?",
    respuesta: ({ palabras }) => [
      `En el inicio del panel, en "Tu enlace de reservas". Cópialo y compártelo donde te encuentren tus ${palabras.cliente.plural}, como tu Instagram.`,
      `Ahí mismo tienes "Tu QR para ${el(elLocal(palabras))}": un código que lleva a la misma página, para imprimirlo y dejarlo a la vista.`,
    ],
    palabrasClave: ["link", "página pública", "url", "compartir", "qr", "instagram"],
  },
  {
    id: "reservas-sin-cuenta",
    area: "reservas",
    pregunta: ({ palabras: { cliente } }) => `¿Mis ${cliente.plural} necesitan una cuenta para reservar?`,
    respuesta: ({ palabras: { servicioDeLaReserva, citaParaElCliente } }) => [
      `No. En tu página eligen ${el(servicioDeLaReserva)}, el día y la hora, y dejan su nombre y apellido. El teléfono y el correo son opcionales.`,
      `Si dejan su correo, les llega la confirmación de la reserva y un recordatorio el día anterior. También pueden agregar ${el(citaParaElCliente)} a su calendario.`,
    ],
    palabrasClave: ({ palabras: { cliente } }) => [
      "registrarse",
      cliente.singular,
      "confirmación",
      "recordatorio",
      "correo",
    ],
  },
  {
    id: "reservas-sin-horas",
    area: "reservas",
    pregunta: "¿Por qué mi página no muestra horas disponibles?",
    respuesta: ({ palabras: { servicio } }) => [
      `La página ofrece solo los días y horas que caen dentro de tu horario de atención, y solo ${el(servicio, "plural")} que tienes ${concordar("cargado", servicio, "plural")}. Revisa los dos en Configuración.`,
      `Tampoco se ofrecen las horas que ya pasaron, las que ya están tomadas ni los días a más de ${DIAS_MAXIMOS_DE_ANTICIPACION} días desde hoy.`,
    ],
    palabrasClave: ({ palabras: { servicio } }) => [
      "no aparecen horas",
      "disponibilidad",
      "horario",
      servicio.plural,
      "sin horarios",
    ],
    paraFallas: true,
  },
  {
    id: "reservas-aviso",
    area: "reservas",
    pregunta: "¿Cómo me entero cuando alguien reserva?",
    respuesta: ({ palabras: { cliente, servicio, cita, tablero } }) => [
      `Te llega un correo con ${el(cliente)}, ${el(servicio)}, la fecha y la hora. ${conMayuscula(laReserva(cita))} aparece en la Agenda y, el día que corresponde, en "Reservas de hoy" ${del(comoSeccion(tablero))}.`,
    ],
    palabrasClave: ["notificación", "aviso", "nueva reserva", "correo"],
  },
  {
    id: "reservas-no-llega-aviso",
    area: "reservas",
    pregunta: "No me llega el correo cuando alguien reserva",
    respuesta: ({ palabras: { profesional, cita, tablero } }) => [
      `El aviso va al correo con que entra a Eli el dueño del negocio y, si ${el(cita)} quedó a nombre de ${un(profesional)}, también al de ${ese(profesional)}. Revisa la carpeta de spam o correo no deseado.`,
      `Aunque el correo no llegue, la reserva queda guardada: la ves en la Agenda y, el día que corresponde, en "Reservas de hoy" ${del(comoSeccion(tablero))}.`,
    ],
    palabrasClave: ["no llega", "no me llega", "spam", "aviso", "correo", "notificación"],
    paraFallas: true,
  },
  {
    id: "reservas-cancelar-cliente",
    area: "reservas",
    pregunta: ({ palabras: { cliente } }) =>
      `¿${conMayuscula(un(cliente))} puede cancelar o cambiar su reserva por su cuenta?`,
    // El botón del correo y de la pantalla de reserva confirmada lo lee quien reservó: lleva la palabra de la reserva para él.
    respuesta: ({ palabras: { citaParaElCliente } }) => [
      `Sí, sin cuenta. El correo de confirmación (y la pantalla de reserva confirmada) trae "Cancelar o cambiar mi ${citaParaElCliente.singular}": desde ahí la cancela o elige otra hora libre. Cuando lo hace, te llega un correo.`,
      'Puede hacerlo hasta 24 horas antes, o el plazo que elijas en Configuración, en "Plazo para cancelar o reagendar (horas)" (de 0 a 72). Pasado el plazo, tiene que contactarte.',
    ],
    palabrasClave: ({ palabras: { cliente } }) => ["cancelar reserva", "reprogramar", "cambiar hora", cliente.singular],
  },

  // ─── Tablero del día ───────────────────────────────────────────────────────
  {
    id: "tablero-para-que",
    area: "tablero",
    pregunta: ({ palabras: { tablero } }) => `¿Para qué sirve ${el(comoSeccion(tablero))}?`,
    respuesta: ({ palabras: { servicio, tablero } }) => [
      `Es el día en columnas: Reservas de hoy, En espera, En atención, Por cobrar y Finalizado. Ahí anotas quién llegó, qué ${servicio.plural} se hicieron, quién ${lasOLos(servicio)} hizo y cuánto se cobró.`,
      `Lo cobrado en ${el(comoSeccion(tablero))} es lo que suma a los ingresos de Reportes.`,
    ],
    palabrasClave: ["columnas", "atenciones", "día", "llegadas", "flujo"],
  },
  {
    id: "tablero-sin-reserva",
    area: "tablero",
    pregunta: "¿Cómo anoto a alguien que llegó sin reserva?",
    respuesta: ({ palabras: { profesional, tablero } }) => [
      `En ${el(comoSeccion(tablero))}, toca "Anotar sin reserva". Queda en la columna En espera y desde ahí sigue el mismo camino que una reserva. ${conMayuscula(un(profesional))} lo anota ${concordar("asignado", profesional)} a sí ${concordar("mismo", profesional)}.`,
    ],
    palabrasClave: ({ palabras: { cita } }) => ["walk in", `sin ${cita.singular}`, "llegó sin reserva", "anotar"],
  },
  {
    id: "tablero-medios-de-pago",
    area: "tablero",
    pregunta: "¿Puedo registrar un cobro con varios medios de pago?",
    respuesta: [
      "Sí. Un cobro se puede repartir entre efectivo, tarjeta de débito, tarjeta de crédito, transferencia y billetera digital. Los montos tienen que sumar exactamente el total.",
      "Eli registra cómo te pagaron; el pago en sí lo recibes tú en el local, como siempre.",
    ],
    palabrasClave: ["pago dividido", "efectivo", "tarjeta", "transferencia", "cobrar"],
  },
  {
    id: "tablero-llego-por-error",
    area: "tablero",
    pregunta: 'Marqué "Llegó" por error, ¿cómo lo deshago?',
    respuesta: [
      "Mientras la atención no haya empezado, se deshace y la reserva vuelve a su columna. Si ya empezó, hay que anularla: queda el registro de quién, cuándo y por qué.",
    ],
    palabrasClave: ["deshacer", "error", "llegada", "anular"],
    paraFallas: true,
  },
  {
    id: "tablero-corregir-cobro",
    area: "tablero",
    pregunta: "Me equivoqué en un cobro, ¿cómo lo corrijo?",
    respuesta: ({ palabras: { servicio } }) => [
      "Lo cobrado no se edita, para que las cuentas cierren. El dueño puede anular el cobro, también días después desde Reportes. Deja de sumar a los ingresos y queda en el historial de anuladas.",
      `Antes de cobrar, en cambio, ${el(servicio, "plural")} y los precios se pueden corregir.`,
    ],
    palabrasClave: ["anular cobro", "error", "corregir", "devolución", "editar"],
    paraFallas: true,
  },
  {
    id: "tablero-quien-cobra",
    area: "tablero",
    pregunta: "¿Por qué no puedo cobrar una atención?",
    respuesta: ({ palabras: { profesional } }) => [
      `Cobran el dueño y el encargado. ${conMayuscula(un(profesional))} lleva sus atenciones hasta Por cobrar, y el cobro lo registra el dueño o el encargado.`,
    ],
    palabrasClave: ({ palabras: { profesional } }) => ["permisos", "rol", "cobrar", profesional.singular, "no me deja"],
    paraFallas: true,
  },

  // ─── Clientes ──────────────────────────────────────────────────────────────
  {
    id: "clientes-agregar",
    area: "clientes",
    pregunta: ({ palabras: { cliente } }) => `¿Cómo agrego ${un(cliente)}?`,
    respuesta: ({ palabras: { cliente } }) => [
      `En ${conMayuscula(cliente.plural)}, toca "${nuevo(cliente)}" y escribe su nombre, correo y teléfono.`,
      `Quien reserva desde tu página pública queda guardado como ${cliente.singular} sin que hagas nada.`,
    ],
    palabrasClave: ({ palabras: { cliente } }) => [
      `crear ${cliente.singular}`,
      `${concordar("nuevo", cliente)} ${cliente.singular}`,
      "registrar",
    ],
  },
  {
    id: "clientes-buscar",
    area: "clientes",
    pregunta: ({ palabras: { cliente } }) => `¿Cómo encuentro a ${un(cliente)}?`,
    respuesta: ({ palabras: { cliente } }) => [
      `En ${conMayuscula(cliente.plural)}, usa el buscador: busca por nombre, correo o teléfono. También puedes filtrar por etiqueta.`,
    ],
    palabrasClave: ["buscar", "filtrar", "etiqueta", "encontrar"],
  },
  {
    id: "clientes-historial",
    area: "clientes",
    pregunta: ({ palabras: { cliente } }) => `¿Dónde veo el historial y las notas de ${un(cliente)}?`,
    // "sus últimas horas" se lee como reloj: en un salón se habla de las últimas visitas.
    respuesta: ({ palabras: { cliente, profesional, cita } }) => [
      `Abre su ficha en ${conMayuscula(cliente.plural)}: ahí están sus datos, ${
        seLlamaHora(cita) ? "sus últimas visitas" : `sus ${concordar("último", cita, "plural")} ${cita.plural}`
      } y sus notas.`,
      `${conMayuscula(un(profesional))} ve en el historial solo ${el(cita, "plural")} que atendió ${ellaOEl(profesional)}, y de la ficha puede editar solo las notas.`,
    ],
    palabrasClave: ["ficha", "notas", "historial", "visitas"],
  },
  {
    id: "clientes-no-puedo-editar",
    area: "clientes",
    pregunta: ({ palabras: { cliente } }) => `No puedo cambiar los datos de ${un(cliente)}`,
    respuesta: ({ palabras: { cliente, profesional } }) => [
      `Cambiar los datos de ${un(cliente)} (nombre, teléfono, correo, etiquetas) y borrar${pronombreDe(cliente)} lo hacen el dueño y el encargado. ${conMayuscula(un(profesional))}, en la ficha, puede editar solo las notas.`,
    ],
    palabrasClave: ({ palabras: { cliente, profesional } }) => [
      `editar ${cliente.singular}`,
      "no me deja",
      "permisos",
      `borrar ${cliente.singular}`,
      profesional.singular,
    ],
    paraFallas: true,
  },

  // ─── Reportes ──────────────────────────────────────────────────────────────
  {
    id: "reportes-que-muestra",
    area: "reportes",
    pregunta: "¿Qué muestra Reportes?",
    respuesta: ({ palabras: { profesional, servicio } }) => [
      `El historial de todo lo cobrado, con un resumen: ingresos, cantidad de atenciones, ticket promedio y el desglose por medio de pago, por ${profesional.singular} y por ${servicio.singular}.`,
      `Puedes filtrar por período (hoy, ayer, esta semana, este mes o un rango de fechas), por turno, por ${profesional.singular}, por ${servicio.singular} y por medio de pago.`,
    ],
    palabrasClave: ["ingresos", "ventas", "filtros", "resumen", "ticket promedio"],
  },
  {
    id: "reportes-falta-ingreso",
    area: "reportes",
    pregunta: "¿Por qué un ingreso no aparece en Reportes?",
    respuesta: ({ palabras: { profesional, cita, tablero } }) => [
      `Reportes suma solo las atenciones cobradas en ${el(comoSeccion(tablero))}. ${conMayuscula(un(cita))} ${concordar("marcado", cita)} como ${concordar("completado", cita)} en la Agenda sin pasar por el cobro no suma: no queda registro de cuánto se cobró ni cómo.`,
      `Revisa también los filtros: el período, el turno o ${un(profesional)} ${concordar("elegido", profesional)} pueden estar dejándola fuera. Y si el cobro se anuló, aparece en Anuladas.`,
    ],
    palabrasClave: ["no aparece", "falta", "ingresos", "no suma", "anuladas"],
    paraFallas: true,
  },
  {
    id: "reportes-turnos",
    area: "reportes",
    pregunta: "¿Cómo se cuentan los turnos mañana, tarde y noche?",
    respuesta: [
      "Mañana es antes de las 12, tarde de 12 a 18 y noche desde las 18. El día y el turno se calculan con la hora del dispositivo con que miras el reporte.",
    ],
    palabrasClave: ["turno", "mañana", "tarde", "noche", "horario", "zona horaria"],
  },
  {
    id: "reportes-exportar",
    area: "reportes",
    pregunta: "¿Puedo exportar los reportes a Excel?",
    respuesta: ({ palabras: { cliente } }) => [
      "Los reportes se ven en el panel, pero no se descargan.",
      `Lo que sí se descarga, en un archivo CSV que abre Excel: ${el(cliente, "plural")} y las atenciones de un rango de fechas, desde ${conMayuscula(cliente.plural)} con "Exportar" (dueño y encargado), y el comprobante de cada liquidación.`,
    ],
    palabrasClave: ["excel", "descargar", "exportar", "pdf", "planilla"],
  },
  {
    id: "reportes-profesional",
    area: "reportes",
    pregunta: ({ palabras: { profesional } }) => `¿Qué ve ${un(profesional)} en Reportes?`,
    respuesta: ({ palabras: { servicio } }) => [
      `Solo lo suyo: ${el(servicio, "plural")} que atendió y cuánto sumaron. No ve los totales del negocio ni los medios de pago.`,
    ],
    palabrasClave: ({ palabras: { profesional } }) => ["permisos", "rol", profesional.singular, "privacidad"],
  },

  // ─── Equipo ────────────────────────────────────────────────────────────────
  {
    id: "equipo-invitar",
    area: "equipo",
    pregunta: "¿Cómo invito a alguien a mi equipo?",
    respuesta: ({ palabras: { profesional } }) => [
      `En Equipo, toca "Invitar al equipo" y escribe su nombre, su correo y su rol (encargado ${oUAntesDe(profesional.singular)} ${profesional.singular}). Le llega un correo con un enlace para crear su cuenta o, si ya tiene una en Eli (por ejemplo, porque trabaja en otro negocio), para sumarse con ella.`,
      `El enlace vale 7 días y sirve una sola vez. También puedes invitarte a ti mismo como ${profesional.singular} de tu negocio, si además de administrarlo atiendes.`,
    ],
    palabrasClave: ({ palabras: { profesional } }) => [
      "invitar",
      `agregar ${profesional.singular}`,
      "sumar",
      "trabajador",
      "invitación",
    ],
  },
  {
    id: "equipo-no-llego",
    area: "equipo",
    pregunta: "La invitación no le llegó a la persona que invité",
    respuesta: [
      "Pídele que revise su carpeta de spam o correo no deseado, y revisa que el correo esté bien escrito.",
      "Si no la encuentra o el enlace venció, reenvíala desde Equipo, en las invitaciones pendientes: le llega un enlace nuevo y el anterior deja de servir.",
    ],
    palabrasClave: ["no llega", "spam", "correo", "invitación", "vencida"],
    paraFallas: true,
  },
  {
    id: "equipo-invitacion-pendiente",
    area: "equipo",
    pregunta: "Me dice que ya existe una invitación pendiente",
    respuesta: [
      "Ya invitaste a ese correo y la invitación sigue vigente. En Equipo, en las invitaciones pendientes, puedes reenviarla (le llega un enlace nuevo y el anterior deja de servir) o anularla. Se puede reenviar hasta 3 veces por hora.",
      "Si la invitación venció, invitar de nuevo a ese correo la reemplaza por una nueva.",
    ],
    palabrasClave: ["invitación pendiente", "volver a invitar", "reenviar", "no me deja", "vencida"],
    paraFallas: true,
  },
  {
    id: "equipo-roles",
    area: "equipo",
    pregunta: "¿Qué puede hacer cada rol?",
    respuesta: ({ palabras: { cliente, profesional, tablero } }) => [
      `Dueño: todo. Encargado: equipo, agenda, horarios, ${cliente.plural} y los cobros ${del(comoSeccion(tablero))}. ${conMayuscula(profesional.singular)}: su agenda, sus atenciones y lo que ${ellaOEl(profesional)} atendió en Reportes; también ve ${el(cliente, "plural")} del negocio y puede crear${lasOLos(cliente)}.`,
    ],
    palabrasClave: ({ palabras: { profesional } }) => ["permisos", "encargado", profesional.singular, "dueño", "rol"],
  },
  {
    id: "equipo-horarios",
    area: "equipo",
    pregunta: "¿Cada persona del equipo tiene su propio horario?",
    respuesta: ({ palabras: { profesional } }) => [
      `Sí. En Configuración, el dueño y el encargado eligen a quién le editan el horario. Cada ${profesional.singular} puede editar el suyo.`,
    ],
    palabrasClave: ["horario", "turnos", "disponibilidad", "configuración"],
  },
  {
    id: "equipo-varios-negocios",
    area: "equipo",
    pregunta: "¿Puedo trabajar en más de un negocio con la misma cuenta?",
    // "ves tus horas" se lee como reloj: en un salón se habla de la agenda.
    respuesta: ({ palabras: { profesional, cita } }) => [
      `Sí. Una cuenta puede ser dueña de un negocio y trabajar en otros, y el dueño también puede ser ${profesional.singular} de su propio negocio. Al iniciar sesión eliges con qué negocio y con qué rol entras, y lo cambias cuando quieras con el botón de las flechas, junto a tu nombre en la barra lateral.`,
      `Cada vez ves solo lo de ese negocio y ese rol: como ${profesional.singular} ves ${
        seLlamaHora(cita) ? "tu agenda" : `tus ${cita.plural}`
      } y tu plata, y tus atenciones llevan comisión como las de cualquiera del equipo.`,
    ],
    palabrasClave: ["dos negocios", "otro negocio", "cambiar de negocio", "varios locales", "cuenta", "rol"],
  },

  // ─── Cuenta y plan ─────────────────────────────────────────────────────────
  {
    id: "cuenta-precios",
    area: "cuenta-y-plan",
    pregunta: "¿Cuánto cuesta Eli?",
    respuesta: [
      `Independiente: ${formatearPesos(PRECIO_INDEPENDIENTE)} al mes, para cuando solo tú atiendes. Equipo: ${formatearPesos(PRECIO_EQUIPO)} al mes con hasta ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden, y ${formatearPesos(PRECIO_PERSONA_ADICIONAL)} al mes por cada persona más.`,
      "Los precios incluyen IVA y se pagan mes a mes; no hay plan anual. Los dos planes traen todas las funciones.",
    ],
    palabrasClave: ["precio", "valor", "plan", "mensualidad", "suscripción", "costo", "independiente", "equipo"],
  },
  {
    id: "cuenta-prueba",
    area: "cuenta-y-plan",
    pregunta: "¿Cómo funciona la prueba gratis?",
    respuesta: [
      `Tienes ${DIAS_DE_PRUEBA} días gratis, sin tarjeta, contados desde que creas tu negocio.`,
      "Todavía no se cobra: cuando se pueda activar un plan desde el panel, te avisaremos.",
    ],
    palabrasClave: ["prueba gratis", "gratis", "días", "tarjeta", "cobro", "pagar"],
  },
  {
    id: "cuenta-quien-cuenta",
    area: "cuenta-y-plan",
    pregunta: "¿Quién cuenta como persona que atiende?",
    respuesta: ({ palabras: { profesional } }) => [
      `${conMayuscula(el(profesional, "plural"))}, siempre, y el dueño si también atiende. El encargado no cuenta.`,
    ],
    palabrasClave: ({ palabras: { profesional } }) => ["personas", profesional.plural, "plan equipo", "precio"],
  },
  {
    id: "cuenta-dias-extra",
    area: "cuenta-y-plan",
    pregunta: "¿Cómo sumo días a mi prueba?",
    respuesta: [
      `Invitando a otro negocio con tu enlace de invitación, que está en el inicio del panel. Cuando ese negocio recibe su primera reserva desde su página, sumas ${DIAS_EXTRA_POR_REFERIDO} días a tu prueba. Se gana una sola vez por negocio.`,
    ],
    palabrasClave: ["referidos", "invitar negocio", "días extra", "recomendar"],
  },
  {
    id: "cuenta-contrasena",
    area: "cuenta-y-plan",
    pregunta: "Olvidé mi contraseña",
    respuesta: [
      'En Iniciar sesión, toca "¿Olvidaste tu contraseña?" y escribe tu correo. Te llega un enlace para crear una nueva; vale una hora y sirve una sola vez. Al cambiarla se cierran las sesiones abiertas en otros dispositivos.',
      "Si creaste tu cuenta con Google, no tienes contraseña en Eli: entra con el botón de Google.",
    ],
    palabrasClave: ["clave", "contraseña", "recuperar", "restablecer", "no puedo entrar", "login"],
    paraFallas: true,
  },
  {
    id: "cuenta-google",
    area: "cuenta-y-plan",
    pregunta: "Entro con Google y me pide correo y contraseña",
    respuesta: [
      "Cada cuenta entra de una sola forma: la que se creó con correo y contraseña entra con ellos, y la que se creó con Google, con Google. Usa la forma con la que creaste tu cuenta.",
    ],
    palabrasClave: ["google", "gmail", "iniciar sesión", "no puedo entrar", "login"],
    paraFallas: true,
  },
  {
    id: "cuenta-no-llega-recuperacion",
    area: "cuenta-y-plan",
    pregunta: "No me llega el correo para recuperar la contraseña",
    respuesta: [
      "Revisa la carpeta de spam o correo no deseado, y que escribiste el mismo correo con el que creaste tu cuenta.",
      "Si creaste tu cuenta con Google, no te llega ningún correo: no tienes contraseña en Eli. Entra con el botón de Google.",
    ],
    palabrasClave: ["no llega", "no me llega", "recuperar", "contraseña", "clave", "spam", "correo"],
    paraFallas: true,
  },

  // ─── Otro ──────────────────────────────────────────────────────────────────
  {
    id: "otro-app",
    area: "otro",
    pregunta: "¿Eli tiene una app para instalar?",
    respuesta: [
      "No hay una app para descargar. Eli funciona en el navegador del teléfono, la tablet o el computador, con la misma cuenta.",
    ],
    palabrasClave: ["app", "aplicación", "celular", "teléfono", "android", "iphone", "descargar"],
  },
  {
    id: "otro-pago-en-linea",
    area: "otro",
    pregunta: ({ palabras: { cliente } }) => `¿Mis ${cliente.plural} pueden pagar en línea al reservar?`,
    respuesta: ({ palabras: { cliente, tablero } }) => [
      `No. Eli no cobra a tus ${cliente.plural}: ${ellasOEllos(cliente)} reservan en tu página y te pagan en el local. En ${el(comoSeccion(tablero))} registras cuánto y cómo te pagaron.`,
    ],
    palabrasClave: ["pago en línea", "pagar online", "abono", "webpay", "transferencia"],
  },
  {
    id: "otro-whatsapp",
    area: "otro",
    pregunta: "¿Eli se conecta con WhatsApp?",
    respuesta: [
      "No. Lo que sí puedes hacer es copiar tu enlace de reservas y mandarlo o publicarlo donde quieras.",
    ],
    palabrasClave: ["whatsapp", "mensajes", "chat", "integración"],
  },
  {
    id: "otro-respuesta",
    area: "otro",
    pregunta: "¿Cómo me responden después de escribirles?",
    respuesta: [
      "Cuando nos escribes desde aquí, tu mensaje queda registrado con un número de caso y te llega un correo con ese número. Te respondemos por correo.",
    ],
    palabrasClave: ["contacto", "soporte", "respuesta", "caso", "correo", "ayuda"],
  },
]
