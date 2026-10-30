import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { esEstadoActivo } from "@/lib/atenciones"

/**
 * Quién puede hacer qué. Única fuente de verdad: ningún endpoint compara roles
 * por su cuenta.
 *
 * Jerarquía: owner (dueño) > admin (encargado) > worker (profesional).
 * El encargado gestiona la operación; el dinero es sólo del dueño.
 */

export type Rol = "owner" | "admin" | "worker"

export interface Actor {
  rol: Rol
  businessId: string
  /** El dueño no es miembro del equipo, así que no tiene memberId. */
  memberId: string | null
}

/** Miembro sobre el que se decide algo. Trae su negocio para poder validarlo. */
export interface Miembro {
  id: string
  businessId: string
}

const ROLES: readonly string[] = ["owner", "admin", "worker"]

/**
 * Traduce la sesión a un actor. Valida en runtime y no sólo por tipos: un token
 * viejo o mal formado no debe producir un actor.
 */
export function actorDeSesion(session: Pick<Session, "user"> | null | undefined): Actor | null {
  const { role, businessId, memberId } = (session?.user ?? {}) as Record<string, unknown>

  if (typeof role !== "string" || !ROLES.includes(role)) return null
  if (typeof businessId !== "string" || !businessId) return null

  return {
    rol: role as Rol,
    businessId,
    memberId: typeof memberId === "string" && memberId ? memberId : null,
  }
}

// ─── Quién es ────────────────────────────────────────────────────────────────

export const esDueño = (actor: Actor | null): boolean => actor?.rol === "owner"

/** Dueño y encargado: los que gestionan el negocio. */
export const gestionaElNegocio = (actor: Actor | null): boolean =>
  actor?.rol === "owner" || actor?.rol === "admin"

/** El recurso es del mismo negocio que el actor. Base del aislamiento. */
export const mismoNegocio = (actor: Actor | null, businessId: string | null | undefined): boolean =>
  !!actor && !!businessId && actor.businessId === businessId

// ─── Qué puede hacer ─────────────────────────────────────────────────────────

export const puedeGestionarEquipo = gestionaElNegocio
export const puedeVerTodaLaAgenda = gestionaElNegocio
export const puedeGestionarServicios = gestionaElNegocio

/** Facturación del negocio: el profesional ve lo suyo, no el total. */
export const puedeVerIngresosDelNegocio = gestionaElNegocio

/** Dinero. El encargado gestiona la operación pero no define cuánto cobra cada uno. */
export const puedeEditarComisiones = esDueño

/** Plan y período de prueba de Eli: los paga el dueño, así que sólo él ve el aviso y los planes. */
export const puedeGestionarSuscripcion = esDueño

/**
 * La lista "Deja tu negocio listo" del inicio y marcar el enlace como
 * compartido: es la puesta en marcha de la prueba, que es del dueño.
 */
export const veLaListaDeInicio = esDueño

/**
 * El enlace de invitación a otros negocios y su estado: el premio son días de
 * la prueba de Eli, que es del dueño (`puedeGestionarSuscripcion`).
 */
export const puedeInvitarNegocios = esDueño

/**
 * Elegir a qué profesional va una cita. Es la otra cara de `memberIdParaCita`:
 * a quien no puede, el servidor lo asigna a sí mismo mande lo que mande.
 */
export const puedeAsignarCitasAOtros = gestionaElNegocio

/**
 * El inicio del panel muestra el día propio (F-014) en vez del tablero del
 * negocio. Es para quien no ve toda la agenda: el profesional.
 *
 * Sin actor devuelve `false` y no `true`: así se comportaba la comparación a
 * mano que reemplaza (`role === "worker"`). No abre datos: el tablero del
 * negocio se llena desde `/api/dashboard/stats`, que sin actor responde 401.
 */
export const veElPanelDeSuDia = (actor: Actor | null): boolean =>
  !!actor && !puedeVerTodaLaAgenda(actor)

/**
 * Chats está escondido hasta que exista un canal real (WhatsApp; ver
 * PRODUCTO.md, sección 10): hoy los mensajes no le llegan al cliente. Que el
 * panel no lo muestre no alcanza, porque la API seguía respondiendo a
 * cualquier sesión. Mientras tanto, nadie lo usa, ni el dueño. Pide el actor
 * para que el día que vuelva se decida por rol sin tocar los endpoints.
 */
export const puedeUsarChats = (_actor: Actor | null): boolean => false

/**
 * Clientes (PRODUCTO.md, sección 10, decidido). Todo rol los ve y los crea:
 * el profesional los necesita para anotar a quien llega. También escribe sus
 * notas. Cambiar los datos (nombre, teléfono, email, etiquetas...) y borrar
 * un cliente es de dueño y encargado. Que el cliente sea del negocio lo
 * verifica el endpoint antes, con `whereDeClientes`: lo ajeno es 404.
 */
export const puedeEditarDatosDeCliente = gestionaElNegocio
export const puedeBorrarCliente = gestionaElNegocio

/**
 * Importar clientes desde un CSV y exportar a CSV los clientes y las
 * atenciones. Dueño y encargado. El profesional crea clientes de a uno (para
 * anotar a quien llega), pero no carga ni se lleva la base entera: la
 * exportación trae los datos de contacto de todos y, en las atenciones, lo
 * cobrado, que es facturación del negocio (`puedeVerIngresosDelNegocio`).
 */
export const puedeImportarExportarClientes = gestionaElNegocio

/**
 * La mini página pública del negocio (`/reservar/[slug]`): dirección, comuna,
 * WhatsApp, Instagram, color, medios de pago y la especialidad de cada
 * profesional. Es la cara del negocio, así que la editan dueño y encargado;
 * el profesional la ve en Configuración sin poder cambiarla. La categoría de
 * cada servicio va con el catálogo (`puedeGestionarServicios`).
 */
export const puedeEditarPaginaDelNegocio = gestionaElNegocio

/**
 * A quién se asigna una cita. Sólo quien puede asignar citas a otros (dueño y
 * encargado) elige: se respeta lo pedido, incluido `null` ("sin asignar").
 * Cualquier otro —el profesional, o un rol desconocido— no elige: termina
 * asignado a sí mismo, mande lo que mande (o sin asignar si no tiene
 * `memberId`). Falla cerrado: se pregunta quién puede, no quién no puede.
 *
 * Pide un `Actor` y no `Actor | null` a propósito: sin sesión no hay cita, y
 * el endpoint ya cortó con 401 antes de llegar acá.
 */
export function memberIdParaCita(actor: Actor, memberIdPedido: string | null): string | null {
  return puedeAsignarCitasAOtros(actor) ? memberIdPedido : actor.memberId
}

/** Nadie se cambia el rol a sí mismo: evita autoascensos y quedarse sin acceso. */
export const puedeCambiarRolDe = (actor: Actor | null, miembro: Miembro): boolean =>
  puedeGestionarEquipo(actor) &&
  mismoNegocio(actor, miembro.businessId) &&
  actor?.memberId !== miembro.id

/** El profesional ve su liquidación; dueño y encargado, la de cualquiera. */
export const puedeVerLiquidacionDe = (actor: Actor | null, miembro: Miembro): boolean =>
  mismoNegocio(actor, miembro.businessId) &&
  (gestionaElNegocio(actor) || actor?.memberId === miembro.id)

/**
 * Horarios son operación, no dinero: dueño y encargado editan el de cualquiera.
 * `miembro` en null es el horario general del negocio.
 */
export const puedeEditarHorarioDe = (actor: Actor | null, miembro: Miembro | null): boolean => {
  if (!actor) return false
  if (miembro && !mismoNegocio(actor, miembro.businessId)) return false
  if (gestionaElNegocio(actor)) return true
  return !!actor.memberId && actor.memberId === miembro?.id
}

/**
 * Bloqueos de horario (`TimeBlock`: almuerzo, trámite, feriado). Son
 * operación, como los horarios: dueño y encargado bloquean a cualquiera y a
 * todo el negocio (`miembro` en null); el profesional, sólo su propia agenda.
 * Un profesional sin `memberId` no bloquea nada (falla cerrado). El miembro
 * tiene que ser del negocio del actor: el endpoint lo lee de la base y lo
 * ajeno responde 404 antes de preguntar acá.
 */
export const puedeGestionarBloqueoDe = (actor: Actor | null, miembro: Miembro | null): boolean => {
  if (!actor) return false
  if (miembro && !mismoNegocio(actor, miembro.businessId)) return false
  if (gestionaElNegocio(actor)) return true
  return !!miembro && !!actor.memberId && actor.memberId === miembro.id
}

/**
 * Qué servicios hace cada profesional (`MemberService`; sin filas = hace
 * todos). Es operación, como el catálogo de servicios: dueño y encargado, de
 * cualquier miembro del negocio. El profesional no se los define a sí mismo:
 * decide qué se le ofrece a sus clientes en la reserva pública. El miembro
 * tiene que ser del negocio del actor: el endpoint lo lee de la base y lo
 * ajeno responde 404 antes de preguntar acá.
 */
export const puedeDefinirServiciosDe = (actor: Actor | null, miembro: Miembro): boolean =>
  gestionaElNegocio(actor) && mismoNegocio(actor, miembro.businessId)

/**
 * Hasta cuántas horas antes el cliente puede cancelar o reagendar con su
 * enlace (`Business.cancelacionHorasAntes`). Es una regla del negocio con sus
 * clientes, como los servicios: dueño y encargado.
 */
export const puedeEditarPlazoDeCambios = gestionaElNegocio

// ─── Tablero de atenciones (docs/PRODUCTO.md, sección 7) ─────────────────────

/** Todas las atenciones con todas sus líneas, pagos y totales. El profesional ve lo suyo. */
export const puedeVerTodoElTablero = gestionaElNegocio

/** Anotar una línea a nombre de otro miembro o del dueño. El profesional sólo a su nombre. */
export const puedeAsignarLineasAOtros = gestionaElNegocio

/**
 * La caja del día. Es dinero, pero no reparto: el dueño decidió que el
 * encargado cobre (PRODUCTO.md, sección 3.4). Lo que no hace es anular lo cobrado.
 */
export const puedeCobrar = gestionaElNegocio

/**
 * Anotar a alguien que llegó sin reserva. El profesional también, pero la
 * atención queda a su nombre: sin `memberId` no hay a quién asignarla, y
 * crearía una atención que ni él podría ver.
 */
export const puedeAnotarSinReserva = (actor: Actor | null): boolean =>
  gestionaElNegocio(actor) || !!actor?.memberId

/**
 * El historial de lo anulado: totales y pagos de atenciones que dejaron de
 * sumar, y quién las anuló. Es facturación del negocio, así que lo ve quien
 * ve los ingresos.
 */
export const puedeVerAnuladas = puedeVerIngresosDelNegocio

/** Cita sobre la que se decide algo, ya leída. */
export interface CitaDelNegocio {
  businessId: string
  memberId: string | null
}

/**
 * Si el actor ve una cita que llegó por otro camino que una consulta de
 * agenda (la reserva de la que nació una atención). La misma regla que
 * `whereDeAgenda`: dueño y encargado, todas las del negocio; el profesional,
 * sólo las suyas. Un profesional ve la atención de la cita de un colega si
 * tiene una línea en ella, y eso no le abre la cita del colega.
 */
export const puedeVerCita = (actor: Actor | null, cita: CitaDelNegocio): boolean => {
  if (!mismoNegocio(actor, cita.businessId)) return false
  if (puedeVerTodaLaAgenda(actor)) return true
  return !!actor?.memberId && actor.memberId === cita.memberId
}

/**
 * Deshacer una llegada marcada por error: la atención en espera se borra y la
 * reserva vuelve a "Reservas de hoy". Dueño y encargado, la de cualquier
 * reserva del negocio; el profesional, sólo la de una reserva suya
 * (PRODUCTO.md, sección 7), con la misma regla que `puedeVerCita`.
 *
 * Ver la atención no alcanza: el profesional ve la de la cita de una colega
 * si tiene una línea en ella, y deshacerla borraría las líneas de la colega y
 * le cambiaría la cita.
 *
 * `cita` es la reserva de la que nació la atención, leída del negocio. Es
 * obligatoria, aunque sea `null`: quien pregunta dice de quién es la reserva
 * o que no lo sabe (la pantalla no la recibe si quien mira no ve esa cita).
 * En `null` sólo pueden dueño y encargado, a quienes eso no les cambia nada;
 * el profesional, no (falla cerrado). Un profesional sin `memberId` nunca:
 * ninguna reserva es suya.
 */
export const puedeDeshacerLlegada = (actor: Actor | null, cita: CitaDelNegocio | null): boolean =>
  cita ? puedeVerCita(actor, cita) : gestionaElNegocio(actor)

/** Atención sobre la que se decide algo. Trae su negocio para poder validarlo. */
export interface AtencionDelNegocio {
  businessId: string
  status: string
}

/**
 * Anular. Antes de cobrar, dueño y encargado: alguien se fue sin ser atendido
 * o se anotó por error. Ya cobrada, sólo el dueño: es plata que deja de sumar
 * y es la única forma de corregir un cobro.
 *
 * Falla cerrado: cualquier estado que no sea uno activo conocido se trata como
 * ya cobrado, así que un estado inesperado en la base pide al dueño.
 */
export const puedeAnular = (actor: Actor | null, atencion: AtencionDelNegocio): boolean => {
  if (!mismoNegocio(actor, atencion.businessId)) return false
  return esEstadoActivo(atencion.status) ? gestionaElNegocio(actor) : esDueño(actor)
}

/**
 * A quién queda asignada una línea. `byOwner` y no un `memberId` nulo para el
 * dueño: un `memberId` nulo es también el de alguien que dejó el equipo.
 */
export interface ProfesionalDeLinea {
  memberId: string | null
  byOwner: boolean
}

/**
 * Como `memberIdParaCita`: el profesional no elige. Sus líneas quedan a su
 * nombre, mande lo que mande, y nunca a nombre del dueño; así no puede
 * cargarle a otro lo que hizo él ni sumarse lo que hizo otro. Dueño y
 * encargado asignan a cualquier miembro o al dueño; que el miembro sea del
 * negocio lo verifica el endpoint contra la base.
 */
export function profesionalParaLinea(actor: Actor, pedido: ProfesionalDeLinea): ProfesionalDeLinea {
  if (!puedeAsignarLineasAOtros(actor)) return { memberId: actor.memberId, byOwner: false }
  if (pedido.byOwner) return { memberId: null, byOwner: true }
  return { memberId: pedido.memberId, byOwner: false }
}

// ─── La plata del equipo (etapa 2) ───────────────────────────────────────────
//
// El reparto es de la dueña: porcentajes, período, cerrar, pagar y
// anular liquidaciones, ajustes. El encargado opera la caja: cobra, registra
// propinas, adelantos y vales, cierra la caja y gestiona el catálogo de
// productos (sin su %). El profesional ve lo suyo y nada más.

/** El historial de cambios de porcentaje (`CommissionChange`). Como fijarlos: sólo la dueña. */
export const puedeVerHistorialDeComisiones = esDueño

/** Catálogo de productos: nombre, precio y activo. El % de comisión de cada uno, no. */
export const puedeGestionarProductos = gestionaElNegocio

/**
 * El % de comisión de un producto. Es comisión: sólo la dueña, como
 * `puedeEditarComisiones`. Un % que mande el encargado se rechaza, no se ignora
 * en silencio.
 */
export const puedeFijarComisionDeProducto = puedeEditarComisiones

/** Las propinas se anotan al cobrar, así que las registra quien cobra. */
export const puedeRegistrarPropina = puedeCobrar

/** Tipo de período de liquidación del negocio (y su día de inicio de semana). */
export const puedeConfigurarLiquidacion = esDueño

/**
 * Las liquidaciones de todo el equipo (la sección Liquidaciones). El
 * profesional ve las suyas desde Mi plata; una puntual, con
 * `puedeVerLiquidacionDe`.
 */
export const puedeVerLiquidacionesDelEquipo = gestionaElNegocio

/** Cerrar una liquidación: congela lo que se le paga a alguien. Sólo la dueña. */
export const puedeCerrarLiquidacion = esDueño

/** Marcar pagada una liquidación cerrada. Sólo la dueña. */
export const puedePagarLiquidacion = esDueño

/** Anular una liquidación cerrada y no pagada (libera lo que incluía). Sólo la dueña. */
export const puedeAnularLiquidacion = esDueño

/** Ajustes con signo a lo que se le paga a alguien. Sólo la dueña. */
export const puedeRegistrarAjuste = esDueño

/** Adelantos y vales: plata que sale de la caja hacia alguien del equipo. Dueña y encargado. */
export const puedeRegistrarAdelanto = gestionaElNegocio

/**
 * Mi plata: lo que ganó quien atiende. Es para quien tiene `memberId`
 * (encargado y profesional); la dueña no es miembro y no la ve. Sin actor,
 * no (falla cerrado).
 */
export const veMiPlata = (actor: Actor | null): boolean => !!actor?.memberId

/** Cerrar la caja: es la caja del día, como cobrar. Dueña y encargado. */
export const puedeCerrarCaja = puedeCobrar

/** Ver los cierres de caja (montos de todo el negocio). Dueña y encargado. */
export const puedeVerCierresDeCaja = gestionaElNegocio

/**
 * Reactivar una cita cancelada o devolver a confirmada una completada o
 * marcada como no asistió. Dueña y encargado; el profesional no saca una cita
 * de esos estados.
 */
export const puedeReactivarCita = gestionaElNegocio

// ─── Avisos por correo a clientes (etapa 3) ──────────────────────────────────
//
// Encender los mensajes a clientes es de la dueña (con WhatsApp van a costar);
// el encargado ve los interruptores y el contador en solo lectura. La lista de
// espera y los clientes que se están yendo son operación: dueña y encargado.
// El profesional no ve ninguno de los dos, por el mismo criterio que exportar:
// son contactos de toda la base.

/** "Clientes que se están yendo" (#76): dueña y encargado. */
export const puedeVerClientesQueSeVan = gestionaElNegocio

/** "Escribirle" a un cliente que se está yendo (wa.me o mailto, registrado). Quien lo ve. */
export const puedeEscribirAClienteQueSeVa = puedeVerClientesQueSeVan

/**
 * Encender o apagar la lista de espera, "te toca" y las reseñas. Sólo la
 * dueña; el encargado los ve sin poder cambiarlos (`puedeVerMensajesAClientes`).
 */
export const puedeActivarMensajesAClientes = esDueño

/** Ver los interruptores y el contador "Mensajes de este mes". Dueña y encargado. */
export const puedeVerMensajesAClientes = gestionaElNegocio

/** El enlace de reseñas de Google es parte de la página del negocio. */
export const puedeEditarEnlaceDeResenas = puedeEditarPaginaDelNegocio

/** Ver quién está en la lista de espera de un día. Dueña y encargado. */
export const puedeVerListaDeEspera = gestionaElNegocio

/** Quitar a alguien de la lista de espera. Dueña y encargado. */
export const puedeQuitarDeListaDeEspera = gestionaElNegocio

/**
 * Marcar o desmarcar en la ficha el consentimiento promocional por correo
 * (desmarcarlo es la baja pedida en el local). Es un dato del cliente: quien
 * edita sus datos.
 */
export const puedeEditarConsentimientoPromocional = puedeEditarDatosDeCliente

// ─── Reservas seguras y fila virtual (etapa 4) ───────────────────────────────
//
// Las dos configuraciones son de la dueña: deciden a quién se le pide
// confirmación y cuánta gente se anota sola. Lo diario (confirmar o cancelar
// una reserva por confirmar, mirar la pantalla de la fila) es operación: dueña
// y encargado.

/** Con cuántas faltas una reserva pública entra por confirmar (#84). Sólo la dueña. */
export const puedeConfigurarPorConfirmar = esDueño

/** Encender o apagar la fila virtual y fijar su tope (#85). Sólo la dueña. */
export const puedeActivarFilaVirtual = esDueño

// ─── Reservas a medida (etapa 5) ────────────────────────────────────────────

/**
 * Encender o apagar los precios de hora valle, sus franjas y qué servicios
 * quedan fuera (#89c). Es precio, o sea dinero: sólo la dueña.
 */
export const puedeConfigurarHoraValle = esDueño

/**
 * Confirmar o cancelar una reserva que entró por confirmar por faltas
 * (`Appointment.confirmacionPorFaltas` con status "pendiente"). Dueña y
 * encargado: aceptar a un cliente que viene faltando es una decisión del
 * negocio, como reactivar una cita (`puedeReactivarCita`). El profesional no:
 * es el más interesado en llenar su agenda, y la marca existe justamente para
 * que lo decida alguien con la vista de todo el negocio. Una reserva pendiente
 * SIN la marca sigue como hasta ahora (la confirma quien la ve). Que la cita
 * sea del negocio lo verifica el endpoint antes, con `whereDeAgenda`.
 */
export const puedeResolverPorConfirmar = gestionaElNegocio

/**
 * La pantalla de la fila en el local (ruta del panel, a pantalla completa):
 * número de turno, nombre con inicial y QR, sin correo ni teléfono. Dueña y
 * encargado. El profesional no: la fila es de todo el negocio y él no ve el
 * Tablero entero (`puedeVerTodoElTablero`); la pantalla la deja abierta en el
 * equipo del local quien gestiona el negocio. Falla cerrado.
 */
export const puedeVerPantallaDeFila = gestionaElNegocio

/**
 * "Vaciar la fila de hoy": anula de una vez a todos los que esperan en la
 * fila virtual del día (si alguien la llenó con nombres inventados, o al
 * cerrar). Dueña y encargado, los mismos que ven la fila entera. El
 * profesional no: la fila es de todo el negocio. Falla cerrado.
 */
export const puedeVaciarFilaVirtual = gestionaElNegocio

// ─── Filtros para consultas ──────────────────────────────────────────────────

/**
 * No matchea nada. Va dentro de `AND` porque el llamador combina el filtro con
 * spread (`{ ...filtro, id }`): cualquier clave suelta que use puede pisarla y
 * la negación desaparece sin que nadie lo note.
 */
const NADA = { AND: [{ id: { in: [] as string[] } }] }

/**
 * Filtro de agenda para el `where` de Prisma. **Siempre acota al negocio del
 * actor**: si devolviera sólo el miembro, un endpoint que lo usara tal cual
 * traería las citas de todos los negocios.
 *
 * No se exporta: es la primitiva cuyo spread causó la fuga dos veces (F-001
 * con `id`, F-002 con `AND`). La única forma de armar un `where` con esto es
 * a través de `whereDeAgenda`, que la combina de forma segura.
 */
function filtroDeAgenda(actor: Actor | null): Prisma.AppointmentWhereInput {
  if (!actor) return NADA
  if (puedeVerTodaLaAgenda(actor)) return { businessId: actor.businessId }
  if (!actor.memberId) return { businessId: actor.businessId, ...NADA }
  return { businessId: actor.businessId, memberId: actor.memberId }
}

/**
 * Los clientes son del negocio, no del profesional: todo rol ve los mismos.
 * No se exporta por el mismo motivo que `filtroDeAgenda`: sólo se usa a
 * través de `whereDeClientes`.
 */
function filtroDeClientes(actor: Actor | null): Prisma.CustomerWhereInput {
  if (!actor) return NADA
  return { businessId: actor.businessId }
}

/**
 * Combina el filtro de agenda con condiciones adicionales del endpoint
 * (`customerId`, rango de fechas, etc.) sin que puedan pisarlo.
 *
 * `{ ...filtroDeAgenda(actor), ...extra }` es inseguro: si `extra` trae una
 * clave que el filtro también usa (pasó con `id` en F-001 y con `AND` en
 * F-002), el spread la sobrescribe y la negación desaparece en silencio.
 * Envolver ambos en `AND` hace que combinarlos nunca pueda anular el filtro,
 * sin depender de que el llamador se acuerde de no repetir una clave.
 */
export function whereDeAgenda(
  actor: Actor | null,
  extra: Prisma.AppointmentWhereInput = {}
): Prisma.AppointmentWhereInput {
  return { AND: [filtroDeAgenda(actor), extra] }
}

/** Igual que `whereDeAgenda`, para consultas de clientes. */
export function whereDeClientes(
  actor: Actor | null,
  extra: Prisma.CustomerWhereInput = {}
): Prisma.CustomerWhereInput {
  return { AND: [filtroDeClientes(actor), extra] }
}

/**
 * Las atenciones que ve el actor. Dueño y encargado, todas las del negocio. El
 * profesional, las que tienen una línea suya o nacieron de una cita suya: la
 * segunda condición es la que le muestra a su cliente apenas llega, antes de
 * que nadie le anote un servicio. No se exporta, igual que `filtroDeAgenda`.
 */
function filtroDeAtenciones(actor: Actor | null): Prisma.VisitWhereInput {
  if (!actor) return NADA
  if (puedeVerTodoElTablero(actor)) return { businessId: actor.businessId }
  if (!actor.memberId) return { businessId: actor.businessId, ...NADA }
  return {
    businessId: actor.businessId,
    OR: [
      { services: { some: { memberId: actor.memberId } } },
      { appointment: { is: { memberId: actor.memberId } } },
    ],
  }
}

/**
 * Las líneas que el actor ve, y también las que puede reemplazar: dueño y
 * encargado, todas; el profesional, sólo las suyas. Va por la atención para
 * acotar al negocio, porque la línea no tiene `businessId` propio.
 */
function filtroDeLineas(actor: Actor | null): Prisma.VisitServiceWhereInput {
  if (!actor) return NADA
  const delNegocio = { visit: { is: { businessId: actor.businessId } } }
  if (puedeVerTodoElTablero(actor)) return delNegocio
  if (!actor.memberId) return { ...delNegocio, ...NADA }
  return { ...delNegocio, memberId: actor.memberId }
}

/**
 * Los pagos son facturación del negocio: el profesional no ve ninguno, ni
 * siquiera los de sus propias atenciones (PRODUCTO.md, secciones 7 y 8).
 */
function filtroDePagos(actor: Actor | null): Prisma.VisitPaymentWhereInput {
  if (!actor || !puedeVerIngresosDelNegocio(actor)) return NADA
  return { visit: { is: { businessId: actor.businessId } } }
}

/**
 * Los bloqueos que ve el actor: dueño y encargado, todos los del negocio; el
 * profesional, los suyos y los de todo el negocio (`memberId` null), que
 * también le cierran la agenda. Sin `memberId`, sólo los de todo el negocio.
 * No se exporta, igual que `filtroDeAgenda`.
 */
function filtroDeBloqueos(actor: Actor | null): Prisma.TimeBlockWhereInput {
  if (!actor) return NADA
  if (puedeVerTodaLaAgenda(actor)) return { businessId: actor.businessId }
  if (!actor.memberId) return { businessId: actor.businessId, memberId: null }
  return { businessId: actor.businessId, OR: [{ memberId: actor.memberId }, { memberId: null }] }
}

/** Igual que `whereDeAgenda`, para consultas de bloqueos de horario. */
export function whereDeBloqueos(
  actor: Actor | null,
  extra: Prisma.TimeBlockWhereInput = {}
): Prisma.TimeBlockWhereInput {
  return { AND: [filtroDeBloqueos(actor), extra] }
}

/** Igual que `whereDeAgenda`, para consultas de atenciones. */
export function whereDeAtenciones(
  actor: Actor | null,
  extra: Prisma.VisitWhereInput = {}
): Prisma.VisitWhereInput {
  return { AND: [filtroDeAtenciones(actor), extra] }
}

/** Igual que `whereDeAgenda`, para las líneas de una atención. */
export function whereDeLineas(
  actor: Actor | null,
  extra: Prisma.VisitServiceWhereInput = {}
): Prisma.VisitServiceWhereInput {
  return { AND: [filtroDeLineas(actor), extra] }
}

/** Igual que `whereDeAgenda`, para los pagos de una atención. */
export function whereDePagos(
  actor: Actor | null,
  extra: Prisma.VisitPaymentWhereInput = {}
): Prisma.VisitPaymentWhereInput {
  return { AND: [filtroDePagos(actor), extra] }
}

/**
 * Lo del dinero de cada profesional (liquidaciones, movimientos, propinas):
 * dueña y encargado ven todo el negocio; el profesional, sólo lo suyo; sin
 * `memberId`, nada. Una sola regla para las tres tablas, que tienen
 * `businessId` y `memberId` propios. No se exporta, igual que `filtroDeAgenda`.
 */
function filtroDePlataDelEquipo(actor: Actor | null): { businessId: string; memberId?: string } | typeof NADA {
  if (!actor) return NADA
  if (gestionaElNegocio(actor)) return { businessId: actor.businessId }
  if (!actor.memberId) return NADA
  return { businessId: actor.businessId, memberId: actor.memberId }
}

/** Igual que `whereDeAgenda`, para liquidaciones. */
export function whereDeLiquidaciones(
  actor: Actor | null,
  extra: Prisma.LiquidacionWhereInput = {}
): Prisma.LiquidacionWhereInput {
  return { AND: [filtroDePlataDelEquipo(actor), extra] }
}

/** Igual que `whereDeAgenda`, para adelantos, vales y ajustes. */
export function whereDeMovimientos(
  actor: Actor | null,
  extra: Prisma.MovimientoDeLiquidacionWhereInput = {}
): Prisma.MovimientoDeLiquidacionWhereInput {
  return { AND: [filtroDePlataDelEquipo(actor), extra] }
}

/**
 * Igual que `whereDeAgenda`, para propinas. Las de la dueña (`byOwner`,
 * `memberId` null) sólo las ve la gestión.
 */
export function whereDePropinas(
  actor: Actor | null,
  extra: Prisma.PropinaDeAtencionWhereInput = {}
): Prisma.PropinaDeAtencionWhereInput {
  return { AND: [filtroDePlataDelEquipo(actor), extra] }
}

/**
 * La lista de espera tiene contactos de personas que quizá no son clientes:
 * sólo quien la puede ver. No se exporta, igual que `filtroDeAgenda`.
 */
function filtroDeListaDeEspera(actor: Actor | null): Prisma.InscripcionEnEsperaWhereInput {
  if (!actor || !puedeVerListaDeEspera(actor)) return NADA
  return { businessId: actor.businessId }
}

/** Igual que `whereDeAgenda`, para la lista de espera. */
export function whereDeListaDeEspera(
  actor: Actor | null,
  extra: Prisma.InscripcionEnEsperaWhereInput = {}
): Prisma.InscripcionEnEsperaWhereInput {
  return { AND: [filtroDeListaDeEspera(actor), extra] }
}

/** Los cierres de caja son montos de todo el negocio: sólo quien los puede ver. */
function filtroDeCierresDeCaja(actor: Actor | null): Prisma.CierreDeCajaWhereInput {
  if (!actor || !puedeVerCierresDeCaja(actor)) return NADA
  return { businessId: actor.businessId }
}

/** Igual que `whereDeAgenda`, para cierres de caja. */
export function whereDeCierresDeCaja(
  actor: Actor | null,
  extra: Prisma.CierreDeCajaWhereInput = {}
): Prisma.CierreDeCajaWhereInput {
  return { AND: [filtroDeCierresDeCaja(actor), extra] }
}

/**
 * El catálogo de productos es del negocio: todo rol lo ve, porque el
 * profesional anota en el tablero lo que vendió. Quién ve el % de comisión de
 * cada producto lo decide el `select` del endpoint, no este filtro.
 */
function filtroDeProductos(actor: Actor | null): Prisma.ProductoWhereInput {
  if (!actor) return NADA
  return { businessId: actor.businessId }
}

/** Igual que `whereDeAgenda`, para productos. */
export function whereDeProductos(
  actor: Actor | null,
  extra: Prisma.ProductoWhereInput = {}
): Prisma.ProductoWhereInput {
  return { AND: [filtroDeProductos(actor), extra] }
}
