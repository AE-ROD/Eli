import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { esEstadoActivo } from "@/lib/atenciones"
import { planConocido, type PlanId } from "@/lib/planes"
import { esRubroDental } from "@/lib/rubros"

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
  /**
   * El rubro del negocio (`Business.type`), de la sesión. Opcional: sin él el
   * negocio no es dental (`esClinicaDental` falla cerrado), así que un actor
   * armado sin rubro, o una sesión de antes de este campo, no ve nada clínico.
   */
  rubro?: string
  /**
   * El plan del negocio (`Business.plan`, `lib/planes.ts`), de la sesión.
   * `actorDeSesion` siempre lo trae: `null` si la sesión no lo tiene o no es un
   * plan conocido. Opcional en el tipo para los actores armados a mano
   * (pruebas): ausente cuenta igual que `null`. Sin plan no se habilita nada
   * que dependa de él (`puedeInvitarAlEquipo`, `puedeGestionarSedes`).
   */
  plan?: PlanId | null
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
  const { role, businessId, memberId, rubro, plan } = (session?.user ?? {}) as Record<string, unknown>

  if (typeof role !== "string" || !ROLES.includes(role)) return null
  if (typeof businessId !== "string" || !businessId) return null

  return {
    rol: role as Rol,
    businessId,
    memberId: typeof memberId === "string" && memberId ? memberId : null,
    // Sólo si es texto: lo demás queda fuera y el negocio no es dental.
    ...(typeof rubro === "string" && rubro ? { rubro } : {}),
    // Un plan que no es de la lista (o una sesión de antes del campo) es null.
    plan: planConocido(plan),
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
 * Las fotos de la página pública (logo y portada del negocio): son la cara
 * del negocio, como el resto de la página, así que dueño y encargado. El
 * profesional no las cambia.
 */
export const puedeEditarFotosDelNegocio = gestionaElNegocio

/**
 * El nombre del negocio (`Business.name`): es lo primero que lee quien abre la
 * página pública, así que lo cambia quien edita esa página (dueño y
 * encargado); el profesional lo ve sin botón. El `slug` no cambia con el
 * nombre: los enlaces ya compartidos siguen funcionando.
 */
export const puedeEditarNombreDelNegocio = puedeEditarPaginaDelNegocio

/**
 * La foto de un integrante del equipo (la que se ve en "Quiénes atienden").
 * Dueño y encargado cambian la de cualquiera del negocio; el profesional,
 * SÓLO la suya: su membresía (`memberId` de la sesión) tiene que ser la del
 * integrante. Un profesional sin `memberId` no cambia ninguna (`null` no es
 * "la suya"): falla cerrado.
 *
 * `businessId` es opcional para quien sólo tiene el id (la interfaz decide si
 * muestra el botón); el endpoint lo pasa siempre, leído de la base: si viene y
 * no es el del actor, niega aunque el actor gestione el negocio.
 */
export const puedeEditarFotoDelMiembro = (
  actor: Actor | null,
  miembro: { id: string; businessId?: string }
): boolean => {
  if (!actor) return false
  if (miembro.businessId !== undefined && !mismoNegocio(actor, miembro.businessId)) return false
  if (gestionaElNegocio(actor)) return true
  return actor.rol === "worker" && !!actor.memberId && actor.memberId === miembro.id
}

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

/**
 * La zona horaria del negocio (`Business.timezone`): con ella se leen las
 * citas en la agenda y se ofrecen las horas de la reserva pública. Cambiarla
 * mueve lo que ve cada cliente, así que es de la dueña. Vale en todos los
 * rubros (una clínica dental también la tiene).
 */
export const puedeConfigurarZonaHoraria = esDueño

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

/**
 * Las propinas se anotan al cobrar, así que las registra quien cobra. Una
 * clínica dental no trabaja con propinas (`rubroOfrecePropinas`): ahí nadie las
 * registra, ni el servidor las acepta aunque el navegador las mande.
 */
export const puedeRegistrarPropina = (actor: Actor | null): boolean => puedeCobrar(actor) && !esClinicaDental(actor)

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

/**
 * Encender o apagar la fila virtual y fijar su tope (#85). Sólo la dueña, y
 * no en una clínica dental, donde no hay fila virtual (`rubroOfreceFilaVirtual`).
 */
export const puedeActivarFilaVirtual = (actor: Actor | null): boolean => esDueño(actor) && !esClinicaDental(actor)

// ─── Reservas a medida (etapa 5) ────────────────────────────────────────────

/**
 * Encender o apagar los precios de hora valle, sus franjas y qué servicios
 * quedan fuera (#89c). Es precio, o sea dinero: sólo la dueña, y no en una
 * clínica dental, donde no hay hora valle (`rubroOfreceHoraValle`).
 */
export const puedeConfigurarHoraValle = (actor: Actor | null): boolean => esDueño(actor) && !esClinicaDental(actor)

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
export const puedeVerPantallaDeFila = (actor: Actor | null): boolean => gestionaElNegocio(actor) && !esClinicaDental(actor)

/**
 * "Vaciar la fila de hoy": anula de una vez a todos los que esperan en la
 * fila virtual del día (si alguien la llenó con nombres inventados, o al
 * cerrar). Dueña y encargado, los mismos que ven la fila entera. El
 * profesional no: la fila es de todo el negocio. Falla cerrado.
 */
export const puedeVaciarFilaVirtual = (actor: Actor | null): boolean => gestionaElNegocio(actor) && !esClinicaDental(actor)

// ─── Planes y sedes (etapa 9) ────────────────────────────────────────────────
//
// El plan viene de la sesión (`Actor.plan`), que `lib/auth.ts` arma desde la
// base: nunca de lo que mande el navegador. Un plan ausente (`null`, o un actor
// armado sin él) o desconocido no habilita nada que dependa del plan: se
// compara con `=== "equipo"` / `=== "independiente"`, nunca con `!== otro`.
// Una misma cuenta puede estar en una clínica Equipo y ser dueña de su negocio
// Independiente: son contextos distintos (`lib/contextos.ts`) y cada actor
// trae el plan de SU negocio.

/**
 * Invitar a alguien al equipo (crear la invitación, reenviarla): quien ya
 * gestiona el equipo (`puedeGestionarEquipo`) y sólo en un negocio del plan
 * Equipo. Un negocio Independiente atiende sólo la dueña y no invita a nadie.
 * Ver y gestionar la lista del equipo no depende del plan.
 */
export const puedeInvitarAlEquipo = (actor: Actor | null): boolean =>
  puedeGestionarEquipo(actor) && actor?.plan === "equipo"

/**
 * Si hay que explicar que el plan del negocio no incluye equipo ("Tu plan es
 * Independiente…" en Equipo y en los precios). Es para EXPLICAR, no para
 * habilitar nada: un plan ausente o desconocido no dice nada (`false`), así que
 * una sesión de antes del campo no muestra un aviso que podría estar mal.
 */
export const elPlanNoIncluyeEquipo = (actor: Actor | null): boolean => actor?.plan === "independiente"

/**
 * Crear, editar y desactivar las sedes del negocio y su horario por día: sólo
 * la dueña y sólo en el plan Independiente. El plan Equipo tiene una sola
 * sede, la dirección del negocio.
 */
export const puedeGestionarSedes = (actor: Actor | null): boolean => esDueño(actor) && actor?.plan === "independiente"

/** Cambiar el plan del negocio: lo paga la dueña, así que sólo ella. */
export const puedeCambiarDePlan = esDueño

// ─── Clínica dental (rubro "odontologia") ────────────────────────────────────
//
// Todo lo clínico existe sólo en un negocio dental: en un salón, una barbería
// o un salón de uñas cada una de estas funciones dice que no, y sus endpoints
// responden 404 (como lo ajeno: no se confirma que exista). El rubro viene de
// la sesión (`Actor.rubro`); sin él, nada es dental.
//
// Roles (decisión del dueño): dueño y odontólogos (`worker`) ven y escriben la
// ficha clínica de todos los pacientes: antecedentes, odontograma,
// evoluciones y plan. El encargado (`admin`, la recepción) sólo ve la alerta
// de alergias y el plan, sin editarlo; no ve el odontograma, los
// antecedentes ni las evoluciones.

/**
 * Un rol de la lista. El tipo ya lo dice, pero un token viejo o un objeto
 * armado a mano pueden traer otro: lo clínico no se le abre a un rol que no
 * se conoce.
 */
const tieneRolConocido = (actor: Actor | null): actor is Actor => !!actor && ROLES.includes(actor.rol)

/** El negocio del actor es una clínica dental. Falla cerrado sin actor, con un rol desconocido o sin rubro. */
export const esClinicaDental = (actor: Actor | null): boolean => tieneRolConocido(actor) && esRubroDental(actor.rubro)

// ─── Lo de salón que la clínica dental no usa ────────────────────────────────
//
// Las propinas, la hora valle y la fila virtual son costumbres de salón,
// barbería y salón de uñas. En una clínica dental no corresponden: no se ofrecen,
// sus secciones no aparecen y sus endpoints dicen que no. Sólo el rubro dental
// las niega; cualquier otro, también uno desconocido o ausente (una sesión de
// antes del rubro), sigue como siempre.
//
// Se pregunta de dos maneras que dicen lo mismo: con el actor, en los permisos
// del panel (`puedeRegistrarPropina`, `puedeConfigurarHoraValle`,
// `puedeActivarFilaVirtual`, `puedeVerPantallaDeFila`, `puedeVaciarFilaVirtual`),
// y con el rubro del negocio (`Business.type`), donde no hay sesión: la reserva
// pública, la fila y los archivos. Lo que ya está guardado no se borra ni se
// migra: la plata que exista se sigue mostrando y sumando (la pantalla sólo
// esconde la línea cuando vale cero, `veLaLineaDePropinas`); lo que cambia es
// qué se ofrece y qué se acepta de ahora en adelante.

/** El rubro trabaja con propinas. Todos menos la clínica dental. */
export const rubroOfrecePropinas = (rubro: unknown): boolean => !esRubroDental(rubro)

/** El rubro tiene precios de hora valle. Todos menos la clínica dental. */
export const rubroOfreceHoraValle = (rubro: unknown): boolean => !esRubroDental(rubro)

/** El rubro tiene fila virtual. Todos menos la clínica dental. */
export const rubroOfreceFilaVirtual = (rubro: unknown): boolean => !esRubroDental(rubro)

/**
 * Si una pantalla muestra la línea "Propinas" de un resumen de dinero (la
 * caja, una liquidación, Mi plata). Donde se trabaja con propinas, siempre,
 * también en $0, como siempre. En una clínica dental, sólo si hay plata: la
 * línea de $0 no tiene nada que decir, pero lo que exista (datos de antes) se
 * muestra y se suma. Nunca esconde dinero.
 */
export const veLaLineaDePropinas = (rubro: unknown, monto: number): boolean => rubroOfrecePropinas(rubro) || monto !== 0

/** Dueño y odontólogos: los que atienden en la clínica. El encargado no. */
const atiendeEnLaClinica = (actor: Actor | null): boolean =>
  esClinicaDental(actor) && (actor?.rol === "owner" || actor?.rol === "worker")

/**
 * Ver la ficha clínica completa: antecedentes, odontograma y evoluciones, de
 * cualquier paciente del negocio. Dueño y odontólogos; el encargado, no.
 */
export const veFichaClinica = atiendeEnLaClinica

/** Escribir antecedentes, marcar el odontograma y anotar evoluciones. Los mismos que la ven. */
export const puedeEditarFichaClinica = atiendeEnLaClinica

/**
 * La alerta de alergias en el panel de la cita y en el de Pacientes: todo rol
 * de la clínica, también el encargado, que recibe al paciente. Es lo único de
 * la ficha que ve el encargado, y se lee sólo con `leerAlertaDeAlergias`
 * (`lib/ficha-clinica-servidor.ts`).
 */
export const veAlertaDeAlergias = esClinicaDental

/** El plan de tratamiento y su presupuesto: todo rol de la clínica. El encargado, sólo lectura. */
export const vePlanDeTratamiento = esClinicaDental

/**
 * Armar, versionar y cambiar el plan: etapas, prestaciones, aprobar una etapa
 * y registrar que se le presentó al paciente. Dueño y odontólogos.
 */
export const puedeEditarPlanDeTratamiento = atiendeEnLaClinica

/** Los sillones (para la agenda por sillón y "Sillones ahora"): todo rol de la clínica. */
export const veSillones = esClinicaDental

/** Crear, renombrar, ordenar y desactivar sillones: dueño y encargado, como los servicios. */
export const puedeGestionarSillones = (actor: Actor | null): boolean =>
  esClinicaDental(actor) && gestionaElNegocio(actor)

/**
 * Marcar o desmarcar un servicio como urgencia (`Service.esUrgencia`): en la
 * reserva pública un motivo de urgencia sólo ofrece horas de hoy. Es de la
 * clínica dental (en los otros rubros la bandera no se usa y el servidor no la
 * acepta) y de quien gestiona el catálogo, dueño y encargado.
 */
export const puedeMarcarServicioComoUrgencia = (actor: Actor | null): boolean =>
  esClinicaDental(actor) && puedeGestionarServicios(actor)

/**
 * Asignar o cambiar el sillón de una cita: todo rol de la clínica. Qué citas
 * puede tocar cada uno lo sigue diciendo `whereDeAgenda` (el odontólogo, las
 * suyas), y que el sillón sea del negocio, `whereDeSillones`.
 */
export const puedeAsignarSillon = esClinicaDental

// ─── Prótesis (clínica dental) ───────────────────────────────────────────────
//
// La pestaña Prótesis de la ficha es clínica: la ven, crean y avanzan los
// mismos que la ficha (dueño y odontólogos). El encargado no la ve (sí cobra
// los abonos en la Sala de espera, como cualquier cobro:
// `puedeCobrarAbonosDeProtesis`). El
// reparto es dinero: lo configura sólo el dueño (como las comisiones,
// §3.4), y en la ficha cada uno ve del reparto sólo lo que le toca
// (`veMontosDelReparto`).

/** Ver la pestaña Prótesis: las prótesis de cualquier paciente, con su valor y su seguimiento. Dueño y odontólogos. */
export const veProtesis = atiendeEnLaClinica

/** Crear una prótesis, avanzar su seguimiento, anularla y agregarla al plan. Los mismos que la ven. */
export const puedeEditarProtesis = atiendeEnLaClinica

/**
 * Configurar el reparto de prótesis: materiales (precio, unidad, tipos y
 * regla), excepciones por odontólogo y su historial. Es dinero: sólo el
 * dueño, como `puedeEditarComisiones`.
 */
export const puedeConfigurarRepartoDeProtesis = (actor: Actor | null): boolean => esClinicaDental(actor) && esDueño(actor)

/**
 * El catálogo de laboratorios (nombre, contacto, activo). Sólo el dueño, y no
 * dueño y encargado como los sillones o los servicios: el laboratorio es a
 * quién se le paga la parte del técnico, y el encargado no ve las prótesis ni
 * el reparto. Los odontólogos lo eligen en la ficha (`whereDeLaboratorios`,
 * sólo los activos) sin gestionarlo.
 */
export const puedeGestionarLaboratorios = puedeConfigurarRepartoDeProtesis

/**
 * Agregar o quitar un abono de prótesis en una atención de la Sala de espera
 * (y ver, para eso, las prótesis del paciente con su saldo): quien cobra,
 * dueño y encargado (`puedeCobrar`), sólo en la clínica. El odontólogo no:
 * no cobra, y la línea del abono queda a nombre de la tratante, no de quien
 * la anota.
 */
export const puedeCobrarAbonosDeProtesis = (actor: Actor | null): boolean => esClinicaDental(actor) && puedeCobrar(actor)

/**
 * "Por pagar al laboratorio": ver lo que se le debe a cada laboratorio,
 * marcarlo pagado y anular un pago. Es la parte del técnico del reparto:
 * sólo el dueño, como el reparto.
 */
export const puedePagarAlLaboratorio = puedeConfigurarRepartoDeProtesis

/** Lo que alguien ve del reparto de una prótesis: las tres partes, sólo la suya, o nada. */
export type MontosDelReparto = "todo" | "suyo" | "nada"

/**
 * Cuánto del reparto de una prótesis ve el actor. El dueño, todo (las tres
 * partes y de dónde salió la regla). La odontóloga tratante, sólo su parte:
 * ni la de la clínica ni la del laboratorio (§5). Cualquier otro (otro
 * odontólogo, el encargado, alguien fuera de la clínica o de otro negocio),
 * nada. El valor al paciente no es parte del reparto: lo ve quien ve la
 * prótesis. Falla cerrado.
 */
export function veMontosDelReparto(
  actor: Actor | null,
  protesis: { businessId: string; memberId: string | null }
): MontosDelReparto {
  if (!veProtesis(actor) || !mismoNegocio(actor, protesis.businessId)) return "nada"
  if (esDueño(actor)) return "todo"
  if (actor?.rol === "worker" && !!actor.memberId && actor.memberId === protesis.memberId) return "suyo"
  return "nada"
}

/** La tratante de una prótesis: un miembro, o la dueña (`byOwner`, sin miembro). */
export interface TratanteDeProtesis {
  memberId: string | null
  byOwner: boolean
}

/**
 * Quién queda como tratante de una prótesis nueva. Sólo el dueño elige: a sí
 * mismo (`"duenio"` o nada) o a un miembro (que el endpoint verifica del
 * negocio y odontólogo, `role: "worker"`: el encargado no es tratante). El odontólogo queda siempre él, pida lo que pida, como
 * `profesionalParaLinea`: así nunca congela la regla de un colega ni la ve.
 * Cualquier otro, o un odontólogo sin `memberId`, no tiene tratante (`null`:
 * el endpoint no crea nada). Falla cerrado.
 */
export function tratanteParaProtesis(actor: Actor | null, pedido: string | undefined): TratanteDeProtesis | null {
  if (!puedeEditarProtesis(actor) || !actor) return null
  if (esDueño(actor)) {
    return !pedido || pedido === "duenio" ? { memberId: null, byOwner: true } : { memberId: pedido, byOwner: false }
  }
  if (actor.rol === "worker" && actor.memberId) return { memberId: actor.memberId, byOwner: false }
  return null
}

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

// ─── Clínica dental ──────────────────────────────────────────────────────────

/**
 * Lo clínico es del negocio, no del odontólogo: quien puede verlo ve lo de
 * todos los pacientes del negocio, y quien no, nada. Una sola regla para las
 * tablas, que tienen `businessId` propio. No se exporta, igual que
 * `filtroDeAgenda`.
 */
function filtroClinico(actor: Actor | null, puede: (actor: Actor | null) => boolean): { businessId: string } | typeof NADA {
  if (!actor || !puede(actor)) return NADA
  return { businessId: actor.businessId }
}

/** Igual que `whereDeAgenda`, para la ficha clínica completa (antecedentes). */
export function whereDeFichasClinicas(
  actor: Actor | null,
  extra: Prisma.FichaClinicaWhereInput = {}
): Prisma.FichaClinicaWhereInput {
  return { AND: [filtroClinico(actor, veFichaClinica), extra] }
}

/**
 * La ficha, leída sólo para la alerta de alergias: también para el encargado.
 * Con este filtro el encargado alcanza la fila entera, y los antecedentes no
 * son para él (`veFichaClinica`): por eso **se usa sólo a través de
 * `leerAlertaDeAlergias`** (`lib/ficha-clinica-servidor.ts`), que fija el
 * `select` en `alergias` y exige que el paciente no se haya eliminado. Se
 * exporta para ese lector y para los tests de permisos; un endpoint o una
 * página no lo usa directo.
 */
export function whereDeAlertaDeAlergias(
  actor: Actor | null,
  extra: Prisma.FichaClinicaWhereInput = {}
): Prisma.FichaClinicaWhereInput {
  return { AND: [filtroClinico(actor, veAlertaDeAlergias), extra] }
}

/** Igual que `whereDeAgenda`, para las marcas del odontograma. */
export function whereDeMarcasDentales(
  actor: Actor | null,
  extra: Prisma.MarcaDentalWhereInput = {}
): Prisma.MarcaDentalWhereInput {
  return { AND: [filtroClinico(actor, veFichaClinica), extra] }
}

/** Igual que `whereDeAgenda`, para las evoluciones. */
export function whereDeEvoluciones(
  actor: Actor | null,
  extra: Prisma.EvolucionWhereInput = {}
): Prisma.EvolucionWhereInput {
  return { AND: [filtroClinico(actor, veFichaClinica), extra] }
}

/** Igual que `whereDeAgenda`, para los planes de tratamiento. */
export function whereDePlanes(
  actor: Actor | null,
  extra: Prisma.PlanDeTratamientoWhereInput = {}
): Prisma.PlanDeTratamientoWhereInput {
  return { AND: [filtroClinico(actor, vePlanDeTratamiento), extra] }
}

/** Igual que `whereDePlanes`, para las etapas de un plan. */
export function whereDeEtapasDelPlan(
  actor: Actor | null,
  extra: Prisma.EtapaDelPlanWhereInput = {}
): Prisma.EtapaDelPlanWhereInput {
  return { AND: [filtroClinico(actor, vePlanDeTratamiento), extra] }
}

/** Igual que `whereDePlanes`, para las prestaciones de una etapa. */
export function whereDePrestacionesDelPlan(
  actor: Actor | null,
  extra: Prisma.PrestacionDelPlanWhereInput = {}
): Prisma.PrestacionDelPlanWhereInput {
  return { AND: [filtroClinico(actor, vePlanDeTratamiento), extra] }
}

// ─── Prótesis ────────────────────────────────────────────────────────────────

/** Igual que `whereDeAgenda`, para las prótesis: dueño y odontólogos, las de todos los pacientes del negocio. */
export function whereDeProtesis(actor: Actor | null, extra: Prisma.ProtesisWhereInput = {}): Prisma.ProtesisWhereInput {
  return { AND: [filtroClinico(actor, veProtesis), extra] }
}

/** Igual que `whereDeProtesis`, para el seguimiento de cada una. */
export function whereDeEventosDeProtesis(
  actor: Actor | null,
  extra: Prisma.EventoDeProtesisWhereInput = {}
): Prisma.EventoDeProtesisWhereInput {
  return { AND: [filtroClinico(actor, veProtesis), extra] }
}

/**
 * Los materiales: los gestiona el dueño y los eligen los odontólogos en la
 * ficha. Quién ve la regla de reparto de cada uno lo decide el `select` del
 * endpoint (`veMontosDelReparto`, `puedeConfigurarRepartoDeProtesis`), no
 * este filtro, como el % de los productos.
 */
export function whereDeMaterialesDeProtesis(
  actor: Actor | null,
  extra: Prisma.MaterialDeProtesisWhereInput = {}
): Prisma.MaterialDeProtesisWhereInput {
  return { AND: [filtroClinico(actor, veProtesis), extra] }
}

/** Los laboratorios: los gestiona el dueño y los eligen los odontólogos en la ficha. El encargado, ninguno. */
export function whereDeLaboratorios(
  actor: Actor | null,
  extra: Prisma.LaboratorioWhereInput = {}
): Prisma.LaboratorioWhereInput {
  return { AND: [filtroClinico(actor, veProtesis), extra] }
}

/**
 * Las excepciones de reparto: el dueño, todas las del negocio; el odontólogo,
 * sólo las suyas (el servidor las lee al crear una prótesis suya, para
 * congelar su regla, y la ficha le muestra su parte); nadie más, ninguna. No
 * se exporta la primitiva, igual que `filtroDeAgenda`.
 */
function filtroDeExcepcionesDeReparto(actor: Actor | null): { businessId: string; memberId?: string } | typeof NADA {
  if (!actor || !veProtesis(actor)) return NADA
  if (esDueño(actor)) return { businessId: actor.businessId }
  if (actor.rol === "worker" && actor.memberId) return { businessId: actor.businessId, memberId: actor.memberId }
  return NADA
}

/** Igual que `whereDeAgenda`, para las excepciones de reparto de prótesis. */
export function whereDeExcepcionesDeReparto(
  actor: Actor | null,
  extra: Prisma.ExcepcionDeRepartoDeProtesisWhereInput = {}
): Prisma.ExcepcionDeRepartoDeProtesisWhereInput {
  return { AND: [filtroDeExcepcionesDeReparto(actor), extra] }
}

/** El historial de cambios de reparto: sólo el dueño, como `puedeVerHistorialDeComisiones`. */
export function whereDeCambiosDeReparto(
  actor: Actor | null,
  extra: Prisma.CambioDeRepartoDeProtesisWhereInput = {}
): Prisma.CambioDeRepartoDeProtesisWhereInput {
  return { AND: [filtroClinico(actor, puedeConfigurarRepartoDeProtesis), extra] }
}

/**
 * Los abonos de las prótesis (las líneas de atención con `protesisId`), para
 * el pagado y el saldo de la ficha: quien ve la prótesis ve cuánto se le
 * abonó, sea de quien sea la línea (no `whereDeLineas`, que al odontólogo le
 * deja sólo las suyas). Va por la atención para acotar al negocio, porque la
 * línea no tiene `businessId` propio.
 */
export function whereDeAbonosDeProtesis(
  actor: Actor | null,
  extra: Prisma.VisitServiceWhereInput = {}
): Prisma.VisitServiceWhereInput {
  if (!actor || !veProtesis(actor)) return { AND: [NADA, extra] }
  return { AND: [{ protesisId: { not: null }, visit: { is: { businessId: actor.businessId } } }, extra] }
}

/** Los pagos a laboratorios ("Por pagar al laboratorio"): sólo el dueño, como el resto del dinero de las prótesis. */
export function whereDePagosAlLaboratorio(
  actor: Actor | null,
  extra: Prisma.PagoAlLaboratorioWhereInput = {}
): Prisma.PagoAlLaboratorioWhereInput {
  return { AND: [filtroClinico(actor, puedePagarAlLaboratorio), extra] }
}

/**
 * Las prótesis a las que se les puede cobrar un abono en la Sala de espera:
 * las del negocio, para quien cobra (dueño y encargado, en la clínica). Es
 * otro filtro que `whereDeProtesis` a propósito: el encargado no ve la
 * pestaña Prótesis, pero cobra. El endpoint además las acota al paciente de
 * la atención y lee sólo lo que el cobro necesita (nombre, valor, saldo), no
 * el reparto.
 */
export function whereDeProtesisParaCobrar(actor: Actor | null, extra: Prisma.ProtesisWhereInput = {}): Prisma.ProtesisWhereInput {
  return { AND: [filtroClinico(actor, puedeCobrarAbonosDeProtesis), extra] }
}

/**
 * Las líneas de abono de prótesis del negocio, para lo que paga la dueña al
 * laboratorio (la parte del técnico). Va por la atención para acotar al
 * negocio, porque la línea no tiene `businessId` propio, igual que
 * `whereDeAbonosDeProtesis`.
 */
export function whereDeAbonosPorPagarAlLaboratorio(
  actor: Actor | null,
  extra: Prisma.VisitServiceWhereInput = {}
): Prisma.VisitServiceWhereInput {
  if (!actor || !puedePagarAlLaboratorio(actor)) return { AND: [NADA, extra] }
  return { AND: [{ protesisId: { not: null }, visit: { is: { businessId: actor.businessId } } }, extra] }
}

/** Igual que `whereDeAgenda`, para los sillones. */
export function whereDeSillones(
  actor: Actor | null,
  extra: Prisma.SillonWhereInput = {}
): Prisma.SillonWhereInput {
  return { AND: [filtroClinico(actor, veSillones), extra] }
}

/**
 * Las sedes son del negocio, no de quien las ve: todo rol las ve (el profesional
 * las necesita en la agenda y en lo que anota). Quién las gestiona lo decide
 * `puedeGestionarSedes`, no este filtro. Sin actor, nada. No se exporta, igual
 * que `filtroDeAgenda`.
 */
function filtroDeSedes(actor: Actor | null): Prisma.SedeWhereInput {
  if (!actor) return NADA
  return { businessId: actor.businessId }
}

/** Igual que `whereDeAgenda`, para las sedes. */
export function whereDeSedes(actor: Actor | null, extra: Prisma.SedeWhereInput = {}): Prisma.SedeWhereInput {
  return { AND: [filtroDeSedes(actor), extra] }
}
