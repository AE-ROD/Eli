import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import {
  CITA_NO_SIRVE_PARA_PRESTACION,
  ErrorClinico,
  citaDelPaciente,
  nombreParaCopiar,
  trabarPaciente,
} from "@/lib/ficha-clinica-servidor"
import {
  MAXIMO_DE_ETAPAS,
  MAXIMO_DE_PRESTACIONES_POR_ETAPA,
  MENSAJE_ETAPA_APROBADA,
  MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS,
  MENSAJE_SIN_PLAN,
  MENSAJE_VERSION_NO_VIGENTE,
  NOMBRE_DE_LA_ETAPA_DEL_ODONTOGRAMA,
  camposBloqueadosEnEtapaAprobada,
  cambioPorAccion,
  errorAlBorrarEtapa,
  errorAlBorrarPrestacion,
  errorDePiezaYCaras,
  estadoSiguienteDePrestacion,
  reordenar,
  valorSugeridoDe,
  type AccionDeEtapa,
  type EdicionDePrestacion,
  type EtapaRespuesta,
  type NuevaPrestacion,
  type OrigenDeVersion,
  type PlanRespuesta,
  type PrestacionRespuesta,
} from "@/lib/edicion-del-plan"
import { ordenarCaras } from "@/lib/odontograma"
import { atiendeCitas } from "@/lib/agenda-publica"
import {
  esDueño,
  puedeEditarPlanDeTratamiento,
  whereDeAgenda,
  whereDeEtapasDelPlan,
  whereDeMarcasDentales,
  whereDePlanes,
  whereDePrestacionesDelPlan,
  type Actor,
} from "@/lib/permisos"
import {
  esEstadoDeEtapa,
  esEstadoDePrestacion,
  propuestaDesdeOdontograma,
  subtotalDeEtapa,
  totalesDelPlan,
} from "@/lib/plan-de-tratamiento"

/**
 * (servidor) El plan de tratamiento de un paciente, para
 * `app/api/clientes/[id]/plan/…`: leerlo, crear una versión y editar sus
 * etapas y prestaciones. Las reglas puras están en `lib/edicion-del-plan.ts`
 * y `lib/plan-de-tratamiento.ts`.
 *
 * Aislamiento: el endpoint ya verificó que el paciente es del negocio y que
 * el actor ve (y, para escribir, edita) el plan. Acá cada etapa y prestación
 * se busca con `whereDeEtapasDelPlan` / `whereDePrestacionesDelPlan` y,
 * además, colgando de un plan de ESE paciente: la etapa de otro paciente del
 * mismo negocio es 404, como la de otro negocio. Se escribe siempre con el
 * `businessId` de la sesión y con ids (nunca `connect`).
 *
 * Toda escritura va en una transacción que primero traba al paciente
 * (`trabarPaciente`): dos cambios al plan del mismo paciente van uno detrás
 * del otro, así las posiciones y el número de versión no se pisan. Sólo se
 * escribe en el plan vigente: una etapa o prestación de una versión vieja
 * responde 409.
 */

type Tx = Prisma.TransactionClient

// ─── Lectura ─────────────────────────────────────────────────────────────────

const SELECCION_DE_PRESTACION = {
  id: true,
  orden: true,
  pieza: true,
  caras: true,
  serviceId: true,
  nombre: true,
  memberId: true,
  profesionalNombre: true,
  estado: true,
  valorCents: true,
  appointmentId: true,
  realizadaEn: true,
} satisfies Prisma.PrestacionDelPlanSelect

const SELECCION_DE_ETAPA = {
  id: true,
  orden: true,
  nombre: true,
  estado: true,
  presentadaEn: true,
  aprobadaEn: true,
  aprobadaPorNombre: true,
} satisfies Prisma.EtapaDelPlanSelect

/** Etapas y prestaciones en su posición; a igual posición, la más vieja primero. */
const enSuOrden = () => [{ orden: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }]

type PrestacionLeida = Prisma.PrestacionDelPlanGetPayload<{ select: typeof SELECCION_DE_PRESTACION }>

/** Un estado fuera de la lista (no debería pasar: hay un CHECK) se muestra como el inicial, no se inventa otro. */
const estadoDePrestacion = (estado: string) => (esEstadoDePrestacion(estado) ? estado : "por-agendar")
const estadoDeEtapa = (estado: string) => (esEstadoDeEtapa(estado) ? estado : "por-aprobar")

function formatearPrestacion(
  prestacion: PrestacionLeida,
  citas: ReadonlyMap<string, { id: string; startTime: Date; status: string }>
): PrestacionRespuesta {
  const cita = prestacion.appointmentId ? citas.get(prestacion.appointmentId) : undefined
  return {
    ...prestacion,
    caras: ordenarCaras(prestacion.caras),
    estado: estadoDePrestacion(prestacion.estado),
    realizadaEn: prestacion.realizadaEn?.toISOString() ?? null,
    cita: cita ? { id: cita.id, startTime: cita.startTime.toISOString(), status: cita.status } : null,
  }
}

/**
 * El plan vigente del paciente con sus etapas y prestaciones en orden, los
 * totales, y las versiones anteriores (sólo número y fecha). La cita de cada
 * prestación agendada se lee aparte con `whereDeAgenda`: el odontólogo ve la
 * fecha de las suyas, como en la agenda, y de las de un colega sólo el id.
 */
export async function leerPlan(db: Tx, actor: Actor, pacienteId: string): Promise<PlanRespuesta> {
  const [vigente, anteriores] = await Promise.all([
    db.planDeTratamiento.findFirst({
      where: whereDePlanes(actor, { customerId: pacienteId, vigente: true }),
      select: {
        id: true,
        version: true,
        creadoPorNombre: true,
        createdAt: true,
        etapas: {
          where: whereDeEtapasDelPlan(actor),
          orderBy: enSuOrden(),
          select: {
            ...SELECCION_DE_ETAPA,
            prestaciones: {
              where: whereDePrestacionesDelPlan(actor),
              orderBy: enSuOrden(),
              select: SELECCION_DE_PRESTACION,
            },
          },
        },
      },
    }),
    db.planDeTratamiento.findMany({
      where: whereDePlanes(actor, { customerId: pacienteId, vigente: false }),
      orderBy: { version: "desc" },
      select: { version: true, createdAt: true },
    }),
  ])

  const idsDeCitas = [
    ...new Set(
      (vigente?.etapas ?? []).flatMap((etapa) =>
        etapa.prestaciones.flatMap((prestacion) => (prestacion.appointmentId ? [prestacion.appointmentId] : []))
      )
    ),
  ]
  const citas =
    idsDeCitas.length === 0
      ? []
      : await db.appointment.findMany({
          where: whereDeAgenda(actor, { id: { in: idsDeCitas }, customerId: pacienteId }),
          select: { id: true, startTime: true, status: true },
        })
  const citasPorId = new Map(citas.map((cita) => [cita.id, cita]))

  const etapas: EtapaRespuesta[] = (vigente?.etapas ?? []).map((etapa) => ({
    ...etapa,
    estado: estadoDeEtapa(etapa.estado),
    presentadaEn: etapa.presentadaEn?.toISOString() ?? null,
    aprobadaEn: etapa.aprobadaEn?.toISOString() ?? null,
    subtotalCents: subtotalDeEtapa(etapa),
    prestaciones: etapa.prestaciones.map((prestacion) => formatearPrestacion(prestacion, citasPorId)),
  }))

  return {
    plan: vigente
      ? {
          id: vigente.id,
          version: vigente.version,
          creadoPorNombre: vigente.creadoPorNombre,
          createdAt: vigente.createdAt.toISOString(),
          totales: totalesDelPlan(etapas),
          etapas,
        }
      : null,
    versionesAnteriores: anteriores.map((plan) => ({ version: plan.version, createdAt: plan.createdAt.toISOString() })),
    puedeEditar: puedeEditarPlanDeTratamiento(actor),
  }
}

// ─── Lo que se escribe en etapas y prestaciones ──────────────────────────────

/**
 * La etapa `etapaId` de un plan de este paciente, con lo que hace falta para
 * decidir. De otro paciente, de otro negocio o inexistente: 404. De una
 * versión que ya no está vigente: 409.
 */
async function etapaDelPaciente(tx: Tx, actor: Actor, pacienteId: string, etapaId: string) {
  const etapa = await tx.etapaDelPlan.findFirst({
    where: whereDeEtapasDelPlan(actor, { id: etapaId, plan: { is: { customerId: pacienteId } } }),
    select: {
      id: true,
      planId: true,
      estado: true,
      plan: { select: { vigente: true } },
      prestaciones: { where: whereDePrestacionesDelPlan(actor), select: { id: true, orden: true, estado: true } },
    },
  })
  if (!etapa) throw new ErrorClinico(404, "Etapa no encontrada")
  if (!etapa.plan.vigente) throw new ErrorClinico(409, MENSAJE_VERSION_NO_VIGENTE)
  return etapa
}

/** Como `etapaDelPaciente`, para una prestación: de una etapa de un plan de este paciente. */
async function prestacionDelPaciente(tx: Tx, actor: Actor, pacienteId: string, prestacionId: string) {
  const prestacion = await tx.prestacionDelPlan.findFirst({
    where: whereDePrestacionesDelPlan(actor, {
      id: prestacionId,
      etapa: { is: { plan: { is: { customerId: pacienteId } } } },
    }),
    select: {
      id: true,
      etapaId: true,
      pieza: true,
      caras: true,
      estado: true,
      appointmentId: true,
      realizadaEn: true,
      etapa: { select: { estado: true, plan: { select: { vigente: true } } } },
    },
  })
  if (!prestacion) throw new ErrorClinico(404, "Prestación no encontrada")
  if (!prestacion.etapa.plan.vigente) throw new ErrorClinico(409, MENSAJE_VERSION_NO_VIGENTE)
  return prestacion
}

/** Un servicio activo del negocio, para copiar su nombre y su precio. Si no, 404. */
async function servicioDelNegocio(tx: Tx, actor: Actor, serviceId: string) {
  const servicio = await tx.service.findFirst({
    where: { id: serviceId, businessId: actor.businessId, active: true },
    select: { id: true, name: true, price: true },
  })
  if (!servicio) throw new ErrorClinico(404, "Servicio no encontrado")
  return servicio
}

/** El 400 al elegir como profesional de una prestación a alguien que no atiende (el encargado). */
const MENSAJE_PROFESIONAL_QUE_NO_ATIENDE =
  "Esa persona no atiende pacientes: elige un odontólogo del equipo, a la dueña o déjala sin asignar"

/**
 * Quién hace la prestación, con el nombre copiado: el dueño (`memberId` null
 * con su nombre), un odontólogo del negocio (un miembro que atiende,
 * `atiendeCitas`: el encargado es recepción y no atiende), o nadie. Un
 * miembro que no es del negocio es 404; uno que no atiende, 400.
 */
async function profesionalPedido(
  tx: Tx,
  actor: Actor,
  pedido: { memberId?: string | null; delDueño?: boolean }
): Promise<{ memberId: string | null; profesionalNombre: string | null }> {
  if (pedido.delDueño) {
    const negocio = await tx.business.findFirst({
      where: { id: actor.businessId },
      select: { user: { select: { name: true } } },
    })
    return { memberId: null, profesionalNombre: nombreParaCopiar(negocio?.user.name) }
  }
  if (!pedido.memberId) return { memberId: null, profesionalNombre: null }
  const miembro = await tx.businessMember.findFirst({
    where: { id: pedido.memberId, businessId: actor.businessId },
    select: { id: true, role: true, user: { select: { name: true } } },
  })
  if (!miembro) throw new ErrorClinico(404, "Profesional no encontrado")
  if (!atiendeCitas(miembro.role)) throw new ErrorClinico(400, MENSAJE_PROFESIONAL_QUE_NO_ATIENDE)
  return { memberId: miembro.id, profesionalNombre: nombreParaCopiar(miembro.user.name) }
}

/**
 * Quien arma el plan desde el odontograma queda como profesional de lo
 * propuesto: el odontólogo (su `memberId`) o el dueño (sin `memberId`, con su
 * nombre). Un profesional sin `memberId` no se asigna (falla cerrado).
 */
function profesionalPorDefecto(actor: Actor, nombre: string): { memberId: string | null; profesionalNombre: string | null } {
  if (actor.memberId) return { memberId: actor.memberId, profesionalNombre: nombre }
  if (esDueño(actor)) return { memberId: null, profesionalNombre: nombre }
  return { memberId: null, profesionalNombre: null }
}

/** Aplica las posiciones nuevas de `reordenar` a las etapas de un plan. */
async function guardarOrdenDeEtapas(tx: Tx, actor: Actor, cambios: readonly { id: string; orden: number }[]) {
  for (const { id, orden } of cambios) {
    await tx.etapaDelPlan.updateMany({ where: whereDeEtapasDelPlan(actor, { id }), data: { orden } })
  }
}

/** Aplica las posiciones nuevas de `reordenar` a las prestaciones de una etapa. */
async function guardarOrdenDePrestaciones(tx: Tx, actor: Actor, cambios: readonly { id: string; orden: number }[]) {
  for (const { id, orden } of cambios) {
    await tx.prestacionDelPlan.updateMany({ where: whereDePrestacionesDelPlan(actor, { id }), data: { orden } })
  }
}

const etapasEnOrden = (tx: Tx, actor: Actor, planId: string) =>
  tx.etapaDelPlan.findMany({ where: whereDeEtapasDelPlan(actor, { planId }), orderBy: enSuOrden(), select: { id: true, orden: true } })

const prestacionesEnOrden = (tx: Tx, actor: Actor, etapaId: string) =>
  tx.prestacionDelPlan.findMany({
    where: whereDePrestacionesDelPlan(actor, { etapaId }),
    orderBy: enSuOrden(),
    select: { id: true, orden: true },
  })

const siguientePosicion = (filas: readonly { orden: number }[]) => filas.reduce((maximo, fila) => Math.max(maximo, fila.orden), 0) + 1

// ─── Versiones ───────────────────────────────────────────────────────────────

type EtapaNueva = Omit<Prisma.EtapaDelPlanUncheckedCreateInput, "businessId" | "planId" | "prestaciones"> & {
  prestaciones: Omit<Prisma.PrestacionDelPlanCreateManyInput, "businessId" | "etapaId">[]
}

/** La primera etapa de un plan armado desde el odontograma: lo que proponen las marcas del paciente. */
async function etapasDesdeElOdontograma(tx: Tx, actor: Actor, pacienteId: string, autor: string): Promise<EtapaNueva[]> {
  const [marcas, servicios] = await Promise.all([
    tx.marcaDental.findMany({
      where: whereDeMarcasDentales(actor, { customerId: pacienteId }),
      select: { pieza: true, cara: true, tipo: true },
    }),
    tx.service.findMany({
      where: { businessId: actor.businessId, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, price: true, active: true },
    }),
  ])
  const propuesta = propuestaDesdeOdontograma(marcas, servicios)
  if (propuesta.length === 0) throw new ErrorClinico(409, MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS)
  const profesional = profesionalPorDefecto(actor, autor)
  return [
    {
      orden: 1,
      nombre: NOMBRE_DE_LA_ETAPA_DEL_ODONTOGRAMA,
      prestaciones: propuesta.map((prestacion, indice) => ({
        orden: indice + 1,
        pieza: prestacion.pieza,
        caras: prestacion.caras,
        serviceId: prestacion.serviceId,
        nombre: prestacion.nombre,
        valorCents: prestacion.valorCents,
        ...profesional,
      })),
    },
  ]
}

/**
 * Las etapas de la versión vigente, copiadas tal cual (estado, aprobación,
 * presentación, y en cada prestación su estado, cita, valor y prótesis): la versión
 * nueva parte de donde estaba. Sin plan vigente, ninguna.
 */
async function etapasCopiadasDeLaVigente(tx: Tx, actor: Actor, pacienteId: string): Promise<EtapaNueva[]> {
  const vigente = await tx.planDeTratamiento.findFirst({
    where: whereDePlanes(actor, { customerId: pacienteId, vigente: true }),
    select: {
      etapas: {
        where: whereDeEtapasDelPlan(actor),
        orderBy: enSuOrden(),
        select: {
          orden: true,
          nombre: true,
          estado: true,
          presentadaEn: true,
          aprobadaEn: true,
          aprobadaPorNombre: true,
          prestaciones: {
            where: whereDePrestacionesDelPlan(actor),
            orderBy: enSuOrden(),
            select: {
              orden: true,
              pieza: true,
              caras: true,
              serviceId: true,
              nombre: true,
              memberId: true,
              profesionalNombre: true,
              estado: true,
              valorCents: true,
              appointmentId: true,
              realizadaEn: true,
              // La prestación que vino de una prótesis sigue ligada a ella en la
              // versión nueva: así "Agregar al plan" no la duplica.
              protesisId: true,
            },
          },
        },
      },
    },
  })
  return vigente?.etapas ?? []
}

/**
 * Crea una versión nueva del plan: la vigente (si hay) deja de estarlo y la
 * nueva lleva el número siguiente. `desde` dice con qué empieza: la
 * propuesta del odontograma en una etapa, una copia de la vigente, o nada.
 * Dos a la vez del mismo paciente no pasan (candado); si igual chocaran, el
 * único de versión o de vigente da P2002, que es 409.
 */
export async function crearVersion(
  actor: Actor,
  pacienteId: string,
  desde: OrigenDeVersion,
  autor: string
): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const ultima = await tx.planDeTratamiento.findFirst({
      where: whereDePlanes(actor, { customerId: pacienteId }),
      orderBy: { version: "desc" },
      select: { version: true },
    })
    const etapas =
      desde === "odontograma"
        ? await etapasDesdeElOdontograma(tx, actor, pacienteId, autor)
        : desde === "copia"
          ? await etapasCopiadasDeLaVigente(tx, actor, pacienteId)
          : []

    await tx.planDeTratamiento.updateMany({
      where: whereDePlanes(actor, { customerId: pacienteId, vigente: true }),
      data: { vigente: false },
    })
    const plan = await tx.planDeTratamiento.create({
      data: {
        businessId: actor.businessId,
        customerId: pacienteId,
        version: (ultima?.version ?? 0) + 1,
        vigente: true,
        creadoPorNombre: autor,
      },
      select: { id: true },
    })
    for (const { prestaciones, ...etapa } of etapas) {
      const creada = await tx.etapaDelPlan.create({
        data: { ...etapa, businessId: actor.businessId, planId: plan.id },
        select: { id: true },
      })
      if (prestaciones.length > 0) {
        await tx.prestacionDelPlan.createMany({
          data: prestaciones.map((prestacion) => ({ ...prestacion, businessId: actor.businessId, etapaId: creada.id })),
        })
      }
    }
    return leerPlan(tx, actor, pacienteId)
  })
}

// ─── Etapas ──────────────────────────────────────────────────────────────────

/** Agrega una etapa al final del plan vigente, por aprobar. Sin plan vigente, 409. */
export async function agregarEtapa(actor: Actor, pacienteId: string, nombre: string): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const plan = await tx.planDeTratamiento.findFirst({
      where: whereDePlanes(actor, { customerId: pacienteId, vigente: true }),
      select: { id: true },
    })
    if (!plan) throw new ErrorClinico(409, MENSAJE_SIN_PLAN)
    const etapas = await etapasEnOrden(tx, actor, plan.id)
    if (etapas.length >= MAXIMO_DE_ETAPAS) throw new ErrorClinico(409, `El plan ya tiene ${MAXIMO_DE_ETAPAS} etapas.`)
    await tx.etapaDelPlan.create({
      data: { businessId: actor.businessId, planId: plan.id, orden: siguientePosicion(etapas), nombre },
      select: { id: true },
    })
    return leerPlan(tx, actor, pacienteId)
  })
}

/**
 * Cambia el nombre o la posición de una etapa, o le aplica una acción
 * (presentar, aprobar, volver a por aprobar; `cambioPorAccion`). `autor` es
 * quien aprueba.
 */
export async function editarEtapa(
  actor: Actor,
  pacienteId: string,
  etapaId: string,
  pedido: { nombre?: string; orden?: number; accion?: AccionDeEtapa },
  autor: string
): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const etapa = await etapaDelPaciente(tx, actor, pacienteId, etapaId)

    const data: Prisma.EtapaDelPlanUpdateManyMutationInput = {}
    if (pedido.nombre !== undefined) data.nombre = pedido.nombre
    if (pedido.accion) {
      const resultado = cambioPorAccion(
        { estado: etapa.estado, prestaciones: etapa.prestaciones.length },
        pedido.accion,
        { ahora: await horaDeLaBase(tx), nombre: autor }
      )
      if (!resultado.ok) throw new ErrorClinico(409, resultado.error)
      Object.assign(data, resultado.cambio)
    }
    if (Object.keys(data).length > 0) {
      await tx.etapaDelPlan.updateMany({ where: whereDeEtapasDelPlan(actor, { id: etapa.id }), data })
    }
    if (pedido.orden !== undefined) {
      await guardarOrdenDeEtapas(tx, actor, reordenar(await etapasEnOrden(tx, actor, etapa.planId), etapa.id, pedido.orden))
    }
    return leerPlan(tx, actor, pacienteId)
  })
}

/** Borra una etapa por aprobar sin nada agendado ni realizado (con sus prestaciones), y renumera las demás. */
export async function borrarEtapa(actor: Actor, pacienteId: string, etapaId: string): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const etapa = await etapaDelPaciente(tx, actor, pacienteId, etapaId)
    const error = errorAlBorrarEtapa(etapa)
    if (error) throw new ErrorClinico(409, error)
    await tx.etapaDelPlan.deleteMany({ where: whereDeEtapasDelPlan(actor, { id: etapa.id }) })
    await guardarOrdenDeEtapas(tx, actor, reordenar(await etapasEnOrden(tx, actor, etapa.planId), null))
    return leerPlan(tx, actor, pacienteId)
  })
}

// ─── Prestaciones ────────────────────────────────────────────────────────────

/**
 * Agrega una prestación al final de una etapa por aprobar (en una aprobada,
 * 409: cambiaría lo que el paciente aceptó). Con servicio, el nombre y el
 * valor que no vengan se copian de él. Empieza por agendar.
 */
export async function agregarPrestacion(
  actor: Actor,
  pacienteId: string,
  etapaId: string,
  pedido: NuevaPrestacion
): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const etapa = await etapaDelPaciente(tx, actor, pacienteId, etapaId)
    if (etapa.estado === "aprobada") throw new ErrorClinico(409, MENSAJE_ETAPA_APROBADA)
    if (etapa.prestaciones.length >= MAXIMO_DE_PRESTACIONES_POR_ETAPA) {
      throw new ErrorClinico(409, `La etapa ya tiene ${MAXIMO_DE_PRESTACIONES_POR_ETAPA} prestaciones.`)
    }
    const servicio = pedido.serviceId ? await servicioDelNegocio(tx, actor, pedido.serviceId) : null
    const nombre = pedido.nombre ?? servicio?.name
    // El esquema ya exige nombre o servicio; esto sólo cierra el tipo.
    if (!nombre) throw new ErrorClinico(400, "Escribe qué prestación es o elige un servicio")
    await tx.prestacionDelPlan.create({
      data: {
        businessId: actor.businessId,
        etapaId: etapa.id,
        orden: siguientePosicion(etapa.prestaciones),
        pieza: pedido.pieza,
        caras: ordenarCaras(pedido.caras),
        serviceId: servicio?.id ?? null,
        nombre,
        valorCents: pedido.valorCents ?? valorSugeridoDe(servicio?.price),
        ...(await profesionalPedido(tx, actor, pedido)),
      },
      select: { id: true },
    })
    return leerPlan(tx, actor, pacienteId)
  })
}

/**
 * Cambia una prestación. En una etapa aprobada sólo el estado, la cita y el
 * profesional (lo demás, 409); en una por aprobar, todo. Los estados siguen
 * `estadoSiguienteDePrestacion`, y una cita nueva tiene que ser de este
 * paciente y verla quien escribe (`citaDelPaciente`).
 */
export async function editarPrestacion(
  actor: Actor,
  pacienteId: string,
  prestacionId: string,
  pedido: EdicionDePrestacion
): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const actual = await prestacionDelPaciente(tx, actor, pacienteId, prestacionId)
    if (actual.etapa.estado === "aprobada" && camposBloqueadosEnEtapaAprobada(pedido).length > 0) {
      throw new ErrorClinico(409, MENSAJE_ETAPA_APROBADA)
    }

    const data: Prisma.PrestacionDelPlanUncheckedUpdateManyInput = {}
    if (pedido.pieza !== undefined || pedido.caras !== undefined) {
      const pieza = pedido.pieza !== undefined ? pedido.pieza : actual.pieza
      const caras = pedido.caras ?? actual.caras
      const error = errorDePiezaYCaras(pieza, caras)
      if (error) throw new ErrorClinico(400, error)
      data.pieza = pieza
      data.caras = ordenarCaras(caras)
    }
    if (pedido.serviceId === null) data.serviceId = null
    if (pedido.serviceId) {
      const servicio = await servicioDelNegocio(tx, actor, pedido.serviceId)
      data.serviceId = servicio.id
      data.nombre = servicio.name
      data.valorCents = valorSugeridoDe(servicio.price)
    }
    // Lo que viene escrito gana sobre lo copiado del servicio.
    if (pedido.nombre !== undefined) data.nombre = pedido.nombre
    if (pedido.valorCents !== undefined) data.valorCents = pedido.valorCents
    if (pedido.memberId !== undefined || pedido.delDueño !== undefined) {
      Object.assign(data, await profesionalPedido(tx, actor, pedido))
    }
    if (pedido.estado !== undefined || pedido.appointmentId !== undefined) {
      const ahora = await horaDeLaBase(tx)
      const resultado = estadoSiguienteDePrestacion(actual, pedido, ahora)
      if (!resultado.ok) throw new ErrorClinico(400, resultado.error)
      const { cambio } = resultado
      // Agendada (en otra cita, o al volver a agendada desde otro estado): la
      // cita se revisa de nuevo y tiene que estar por delante; la que tenía
      // pudo pasar o cerrarse mientras la prestación estaba en otro estado.
      const quedaAgendada =
        cambio.estado === "agendada" &&
        cambio.appointmentId &&
        (cambio.appointmentId !== actual.appointmentId || actual.estado !== "agendada")
      if (quedaAgendada && cambio.appointmentId) {
        await citaDelPaciente(tx, actor, pacienteId, cambio.appointmentId, CITA_NO_SIRVE_PARA_PRESTACION, {
          regla: "por-delante",
          ahora,
        })
      } else if (cambio.appointmentId && cambio.appointmentId !== actual.appointmentId) {
        await citaDelPaciente(tx, actor, pacienteId, cambio.appointmentId, CITA_NO_SIRVE_PARA_PRESTACION)
      }
      Object.assign(data, cambio)
    }
    if (Object.keys(data).length > 0) {
      await tx.prestacionDelPlan.updateMany({ where: whereDePrestacionesDelPlan(actor, { id: actual.id }), data })
    }
    if (pedido.orden !== undefined) {
      await guardarOrdenDePrestaciones(
        tx,
        actor,
        reordenar(await prestacionesEnOrden(tx, actor, actual.etapaId), actual.id, pedido.orden)
      )
    }
    return leerPlan(tx, actor, pacienteId)
  })
}

/** Borra una prestación por agendar de una etapa por aprobar, y renumera las demás. */
export async function borrarPrestacion(actor: Actor, pacienteId: string, prestacionId: string): Promise<PlanRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const prestacion = await prestacionDelPaciente(tx, actor, pacienteId, prestacionId)
    const error = errorAlBorrarPrestacion(prestacion, prestacion.etapa)
    if (error) throw new ErrorClinico(409, error)
    await tx.prestacionDelPlan.deleteMany({ where: whereDePrestacionesDelPlan(actor, { id: prestacion.id }) })
    await guardarOrdenDePrestaciones(tx, actor, reordenar(await prestacionesEnOrden(tx, actor, prestacion.etapaId), null))
    return leerPlan(tx, actor, pacienteId)
  })
}
