import type { AreaDeSoporte } from "@/lib/soporte"
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

/**
 * Las preguntas frecuentes del centro de ayuda (/dashboard/ayuda y /soporte),
 * agrupadas por las mismas áreas que una solicitud de soporte
 * (`lib/soporte.ts`).
 *
 * Cada respuesta cuenta solo lo que el producto hace hoy (`docs/PRODUCTO.md`):
 * nada de WhatsApp, pagos en línea, app nativa, elegir profesional al reservar
 * ni comisiones. Los precios y los días se leen de `lib/precios.ts` y de
 * `lib/reserva-publica.ts`: escritos a mano quedarían viejos cuando cambien.
 */

export interface PreguntaFrecuente {
  /** Único y estable: es el `id` del acordeón en la página. */
  id: string
  area: AreaDeSoporte
  pregunta: string
  /** Párrafos de la respuesta, en el orden en que se leen. */
  respuesta: readonly string[]
  /** Otras formas de decirlo que la búsqueda también encuentra ("contraseña" → "clave"). */
  palabrasClave: readonly string[]
  /**
   * Si responde a un problema típico ("no aparecen horas", "no me llega el
   * correo"), no a cómo se usa algo. Son las que se sugieren en el camino
   * "Algo no funciona", antes del formulario.
   */
  paraFallas?: true
}

export const PREGUNTAS_FRECUENTES: readonly PreguntaFrecuente[] = [
  // ─── Agenda ────────────────────────────────────────────────────────────────
  {
    id: "agenda-nueva-cita",
    area: "agenda",
    pregunta: "¿Cómo agendo una cita desde el panel?",
    respuesta: [
      "En Agenda, toca \"Nueva cita\". Escribe el servicio, elige el cliente, la fecha y la hora de inicio y de término. El dueño y el encargado eligen además el profesional que atiende. El precio es opcional.",
      "Las reservas que tus clientes hacen desde tu página pública aparecen solas en la agenda.",
    ],
    palabrasClave: ["agendar", "crear cita", "reservar", "turno", "hora"],
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
    pregunta: "¿Cómo cancelo una cita?",
    respuesta: [
      "Abre la cita en la agenda y toca \"Cancelar cita\". No se borra: queda en la agenda marcada como cancelada.",
      "Desde el mismo detalle puedes marcarla como completada. Ojo: una cita marcada como completada en la agenda no suma ingresos en Reportes; lo que suma es lo que se cobra en el Tablero.",
    ],
    palabrasClave: ["anular", "eliminar", "borrar", "cancelada", "completada"],
  },
  {
    id: "agenda-cambiar-hora",
    area: "agenda",
    pregunta: "¿Puedo cambiar la hora de una cita?",
    respuesta: [
      "Hoy no hay un botón para mover una cita a otra hora. Cancela la cita y crea una nueva con \"Nueva cita\" en el horario correcto.",
    ],
    palabrasClave: ["reprogramar", "mover", "cambiar fecha", "reagendar"],
  },
  {
    id: "agenda-profesional-ve",
    area: "agenda",
    pregunta: "¿Qué citas ve cada profesional?",
    respuesta: [
      "Cada profesional ve su propia agenda. El dueño y el encargado ven la de todo el negocio.",
    ],
    palabrasClave: ["permisos", "rol", "ver citas", "profesional"],
  },
  {
    id: "agenda-no-veo-cita",
    area: "agenda",
    pregunta: "No veo una cita en la agenda",
    respuesta: [
      "Revisa la vista (Día, Semana o Mes) y la fecha en que estás parado: con las flechas pasas al día, la semana o el mes anterior o siguiente.",
      "Si eres profesional, ves solo las citas asignadas a ti. Las reservas que llegan desde tu página pública quedan sin asignar, así que no aparecen en tu agenda; el dueño y el encargado ven todas.",
    ],
    palabrasClave: ["no aparece", "no veo", "falta", "cita perdida", "reserva", "profesional"],
    paraFallas: true,
  },
  {
    id: "agenda-no-encuentro-cliente",
    area: "agenda",
    pregunta: "Al crear una cita no encuentro al cliente",
    respuesta: [
      "En \"Nueva cita\" el cliente se elige de la lista: escribe al menos 2 letras de su nombre, correo o teléfono y tócalo cuando aparezca.",
      "Si no aparece, todavía no está en Clientes. Agrégalo en Clientes con \"Nuevo cliente\" y vuelve a crear la cita.",
    ],
    palabrasClave: ["no aparece", "buscar cliente", "nueva cita", "no encuentro", "no me deja"],
    paraFallas: true,
  },

  // ─── Reservas en línea ─────────────────────────────────────────────────────
  {
    id: "reservas-enlace",
    area: "reservas",
    pregunta: "¿Dónde está mi enlace de reservas?",
    respuesta: [
      "En el inicio del panel, en \"Tu enlace de reservas\". Cópialo y compártelo donde te encuentren tus clientes, como tu Instagram.",
      "Ahí mismo tienes \"Tu QR para el local\": un código que lleva a la misma página, para imprimirlo y dejarlo a la vista.",
    ],
    palabrasClave: ["link", "página pública", "url", "compartir", "qr", "instagram"],
  },
  {
    id: "reservas-sin-cuenta",
    area: "reservas",
    pregunta: "¿Mis clientes necesitan una cuenta para reservar?",
    respuesta: [
      "No. En tu página eligen el servicio, el día y la hora, y dejan su nombre y apellido. El teléfono y el correo son opcionales.",
      "Si dejan su correo, les llega la confirmación de la reserva y un recordatorio el día anterior. También pueden agregar la cita a su calendario.",
    ],
    palabrasClave: ["registrarse", "cliente", "confirmación", "recordatorio", "correo"],
  },
  {
    id: "reservas-sin-horas",
    area: "reservas",
    pregunta: "¿Por qué mi página no muestra horas disponibles?",
    respuesta: [
      "La página ofrece solo los días y horas que caen dentro de tu horario de atención, y solo los servicios que tienes cargados. Revisa los dos en Configuración.",
      `Tampoco se ofrecen las horas que ya pasaron, las que ya están tomadas ni los días a más de ${DIAS_MAXIMOS_DE_ANTICIPACION} días desde hoy.`,
    ],
    palabrasClave: ["no aparecen horas", "disponibilidad", "horario", "servicios", "sin horarios"],
    paraFallas: true,
  },
  {
    id: "reservas-aviso",
    area: "reservas",
    pregunta: "¿Cómo me entero cuando alguien reserva?",
    respuesta: [
      "Te llega un correo con el cliente, el servicio, la fecha y la hora. La cita aparece en la Agenda y, el día que corresponde, en \"Reservas de hoy\" del Tablero.",
    ],
    palabrasClave: ["notificación", "aviso", "nueva reserva", "correo"],
  },
  {
    id: "reservas-no-llega-aviso",
    area: "reservas",
    pregunta: "No me llega el correo cuando alguien reserva",
    respuesta: [
      "El aviso va al correo de la cuenta del dueño del negocio. Revisa la carpeta de spam o correo no deseado.",
      "Aunque el correo no llegue, la reserva queda guardada: la ves en la Agenda y, el día que corresponde, en \"Reservas de hoy\" del Tablero.",
    ],
    palabrasClave: ["no llega", "no me llega", "spam", "aviso", "correo", "notificación"],
    paraFallas: true,
  },
  {
    id: "reservas-cancelar-cliente",
    area: "reservas",
    pregunta: "¿Un cliente puede cancelar o cambiar su reserva por su cuenta?",
    respuesta: [
      "Desde la página todavía no. Si un cliente necesita cancelar o cambiar su hora, tiene que avisarte, y tú la cancelas en la Agenda y, si hace falta, creas la nueva.",
    ],
    palabrasClave: ["cancelar reserva", "reprogramar", "cambiar hora", "cliente"],
  },

  // ─── Tablero del día ───────────────────────────────────────────────────────
  {
    id: "tablero-para-que",
    area: "tablero",
    pregunta: "¿Para qué sirve el Tablero?",
    respuesta: [
      "Es el día en columnas: Reservas de hoy, En espera, En atención, Por cobrar y Finalizado. Ahí anotas quién llegó, qué servicios se hicieron, quién los hizo y cuánto se cobró.",
      "Lo cobrado en el Tablero es lo que suma a los ingresos de Reportes.",
    ],
    palabrasClave: ["columnas", "atenciones", "día", "llegadas", "flujo"],
  },
  {
    id: "tablero-sin-reserva",
    area: "tablero",
    pregunta: "¿Cómo anoto a alguien que llegó sin reserva?",
    respuesta: [
      "En el Tablero, toca \"Anotar sin reserva\". Queda en la columna En espera y desde ahí sigue el mismo camino que una reserva. Un profesional lo anota asignado a sí mismo.",
    ],
    palabrasClave: ["walk in", "sin cita", "llegó sin reserva", "anotar"],
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
    pregunta: "Marqué \"Llegó\" por error, ¿cómo lo deshago?",
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
    respuesta: [
      "Lo cobrado no se edita, para que las cuentas cierren. El dueño puede anular el cobro, también días después desde Reportes. Deja de sumar a los ingresos y queda en el historial de anuladas.",
      "Antes de cobrar, en cambio, los servicios y los precios se pueden corregir.",
    ],
    palabrasClave: ["anular cobro", "error", "corregir", "devolución", "editar"],
    paraFallas: true,
  },
  {
    id: "tablero-quien-cobra",
    area: "tablero",
    pregunta: "¿Por qué no puedo cobrar una atención?",
    respuesta: [
      "Cobran el dueño y el encargado. Un profesional lleva sus atenciones hasta Por cobrar, y el cobro lo registra el dueño o el encargado.",
    ],
    palabrasClave: ["permisos", "rol", "cobrar", "profesional", "no me deja"],
    paraFallas: true,
  },

  // ─── Clientes ──────────────────────────────────────────────────────────────
  {
    id: "clientes-agregar",
    area: "clientes",
    pregunta: "¿Cómo agrego un cliente?",
    respuesta: [
      "En Clientes, toca \"Nuevo cliente\" y escribe su nombre, correo y teléfono.",
      "Quien reserva desde tu página pública queda guardado como cliente sin que hagas nada.",
    ],
    palabrasClave: ["crear cliente", "nuevo cliente", "registrar"],
  },
  {
    id: "clientes-buscar",
    area: "clientes",
    pregunta: "¿Cómo encuentro a un cliente?",
    respuesta: [
      "En Clientes, usa el buscador: busca por nombre, correo o teléfono. También puedes filtrar por etiqueta.",
    ],
    palabrasClave: ["buscar", "filtrar", "etiqueta", "encontrar"],
  },
  {
    id: "clientes-historial",
    area: "clientes",
    pregunta: "¿Dónde veo el historial y las notas de un cliente?",
    respuesta: [
      "Abre su ficha en Clientes: ahí están sus datos, sus últimas citas y sus notas.",
      "Un profesional ve en el historial solo las citas que atendió él, y de la ficha puede editar solo las notas.",
    ],
    palabrasClave: ["ficha", "notas", "historial", "visitas"],
  },
  {
    id: "clientes-no-puedo-editar",
    area: "clientes",
    pregunta: "No puedo cambiar los datos de un cliente",
    respuesta: [
      "Cambiar los datos de un cliente (nombre, teléfono, correo, etiquetas) y borrarlo lo hacen el dueño y el encargado. Un profesional, en la ficha, puede editar solo las notas.",
    ],
    palabrasClave: ["editar cliente", "no me deja", "permisos", "borrar cliente", "profesional"],
    paraFallas: true,
  },

  // ─── Reportes ──────────────────────────────────────────────────────────────
  {
    id: "reportes-que-muestra",
    area: "reportes",
    pregunta: "¿Qué muestra Reportes?",
    respuesta: [
      "El historial de todo lo cobrado, con un resumen: ingresos, cantidad de atenciones, ticket promedio y el desglose por medio de pago, por profesional y por servicio.",
      "Puedes filtrar por período (hoy, ayer, esta semana, este mes o un rango de fechas), por turno, por profesional, por servicio y por medio de pago.",
    ],
    palabrasClave: ["ingresos", "ventas", "filtros", "resumen", "ticket promedio"],
  },
  {
    id: "reportes-falta-ingreso",
    area: "reportes",
    pregunta: "¿Por qué un ingreso no aparece en Reportes?",
    respuesta: [
      "Reportes suma solo las atenciones cobradas en el Tablero. Una cita marcada como completada en la Agenda sin pasar por el cobro no suma: no queda registro de cuánto se cobró ni cómo.",
      "Revisa también los filtros: el período, el turno o un profesional elegido pueden estar dejándola fuera. Y si el cobro se anuló, aparece en Anuladas.",
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
    respuesta: ["Todavía no: los reportes se ven en el panel, pero no se descargan."],
    palabrasClave: ["excel", "descargar", "exportar", "pdf", "planilla"],
  },
  {
    id: "reportes-profesional",
    area: "reportes",
    pregunta: "¿Qué ve un profesional en Reportes?",
    respuesta: [
      "Solo lo suyo: los servicios que atendió y cuánto sumaron. No ve los totales del negocio ni los medios de pago.",
    ],
    palabrasClave: ["permisos", "rol", "profesional", "privacidad"],
  },

  // ─── Equipo ────────────────────────────────────────────────────────────────
  {
    id: "equipo-invitar",
    area: "equipo",
    pregunta: "¿Cómo invito a alguien a mi equipo?",
    respuesta: [
      "En Equipo, toca \"Invitar al equipo\" y escribe su nombre, su correo y su rol (encargado o profesional). Le llega un correo con un enlace para crear su cuenta.",
      "El enlace vale 7 días y sirve una sola vez.",
    ],
    palabrasClave: ["invitar", "agregar profesional", "sumar", "trabajador", "invitación"],
  },
  {
    id: "equipo-no-llego",
    area: "equipo",
    pregunta: "La invitación no le llegó a la persona que invité",
    respuesta: [
      "Pídele que revise su carpeta de spam o correo no deseado, y que el correo esté bien escrito.",
      "Si el enlace venció o no aparece, escríbenos desde aquí y lo revisamos.",
    ],
    palabrasClave: ["no llega", "spam", "correo", "invitación", "vencida"],
    paraFallas: true,
  },
  {
    id: "equipo-invitacion-pendiente",
    area: "equipo",
    pregunta: "Me dice que ya existe una invitación pendiente",
    respuesta: [
      "Ya invitaste a ese correo y la persona todavía no creó su cuenta. Pídele que busque el correo de la invitación, también en spam.",
      "Si el enlace venció, hoy no se puede invitar de nuevo al mismo correo desde el panel: escríbenos desde aquí y lo revisamos.",
    ],
    palabrasClave: ["invitación pendiente", "volver a invitar", "reenviar", "no me deja", "vencida"],
    paraFallas: true,
  },
  {
    id: "equipo-roles",
    area: "equipo",
    pregunta: "¿Qué puede hacer cada rol?",
    respuesta: [
      "Dueño: todo. Encargado: equipo, agenda, horarios, clientes y los cobros del Tablero. Profesional: su agenda, sus atenciones y lo que él atendió en Reportes; también ve los clientes del negocio y puede crearlos.",
    ],
    palabrasClave: ["permisos", "encargado", "profesional", "dueño", "rol"],
  },
  {
    id: "equipo-horarios",
    area: "equipo",
    pregunta: "¿Cada persona del equipo tiene su propio horario?",
    respuesta: [
      "Sí. En Configuración, el dueño y el encargado eligen a quién le editan el horario. Cada profesional puede editar el suyo.",
    ],
    palabrasClave: ["horario", "turnos", "disponibilidad", "configuración"],
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
    respuesta: [
      "Los profesionales, siempre, y el dueño si también atiende. El encargado no cuenta.",
    ],
    palabrasClave: ["personas", "profesionales", "plan equipo", "precio"],
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
      "En Iniciar sesión, toca \"¿Olvidaste tu contraseña?\" y escribe tu correo. Te llega un enlace para crear una nueva; vale una hora y sirve una sola vez. Al cambiarla se cierran las sesiones abiertas en otros dispositivos.",
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
    pregunta: "¿Mis clientes pueden pagar en línea al reservar?",
    respuesta: [
      "No. Eli no cobra a tus clientes: ellos reservan en tu página y te pagan en el local. En el Tablero registras cuánto y cómo te pagaron.",
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

/**
 * Un texto listo para comparar: sin tildes, diéresis ni la virgulilla de la ñ,
 * en minúsculas y con los espacios de más colapsados. "Contraseña",
 * "CONTRASEÑA" y "contrasena" son lo mismo para quien escribe apurado desde el
 * teléfono, que muchas veces no tiene a mano la ñ ni las tildes.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Todo lo que la búsqueda mira de una pregunta, ya normalizado. */
function textoBuscable(pregunta: PreguntaFrecuente): { titulo: string; resto: string } {
  return {
    titulo: normalizarTexto(pregunta.pregunta),
    resto: normalizarTexto([...pregunta.respuesta, ...pregunta.palabrasClave].join(" ")),
  }
}

interface OpcionesDeBusqueda {
  /** Solo las de esta área. Sin área, todas. */
  area?: AreaDeSoporte | null
  /** Por defecto, `PREGUNTAS_FRECUENTES`. */
  preguntas?: readonly PreguntaFrecuente[]
}

/**
 * Las preguntas que responden a lo que se escribió. Cada palabra tiene que
 * aparecer en la pregunta, la respuesta o sus palabras clave (sin importar
 * tildes ni mayúsculas); las que la tienen en la pregunta misma van primero.
 * Una consulta vacía devuelve todas las del área, en su orden.
 */
export function buscarPreguntas(consulta: string, opciones: OpcionesDeBusqueda = {}): PreguntaFrecuente[] {
  const { area = null, preguntas = PREGUNTAS_FRECUENTES } = opciones
  const delArea = area ? preguntas.filter((pregunta) => pregunta.area === area) : [...preguntas]

  const palabras = normalizarTexto(consulta).split(" ").filter(Boolean)
  if (palabras.length === 0) return delArea

  const conPuntaje = delArea.flatMap((pregunta, indice) => {
    const { titulo, resto } = textoBuscable(pregunta)
    let puntaje = 0
    for (const palabra of palabras) {
      if (titulo.includes(palabra)) puntaje += 2
      else if (resto.includes(palabra)) puntaje += 1
      else return []
    }
    return [{ pregunta, puntaje, indice }]
  })

  // A igual puntaje se respeta el orden original: `sort` es estable, pero el
  // índice lo deja explícito.
  conPuntaje.sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice)
  return conPuntaje.map(({ pregunta }) => pregunta)
}

/** Las primeras `cuantas` preguntas de un área, en su orden. */
export function preguntasDeArea(area: AreaDeSoporte, cuantas = 3): PreguntaFrecuente[] {
  return PREGUNTAS_FRECUENTES.filter((pregunta) => pregunta.area === area).slice(0, cuantas)
}

/**
 * Las de "Antes de escribirnos, revisa esto" en el camino "Algo no funciona":
 * hasta `cuantas` preguntas del área marcadas `paraFallas`. Un área sin
 * problemas típicos documentados (Otro) no sugiere ninguna.
 */
export function preguntasParaFallas(
  area: AreaDeSoporte,
  cuantas = 3,
  preguntas: readonly PreguntaFrecuente[] = PREGUNTAS_FRECUENTES,
): PreguntaFrecuente[] {
  return preguntas.filter((pregunta) => pregunta.area === area && pregunta.paraFallas).slice(0, cuantas)
}
