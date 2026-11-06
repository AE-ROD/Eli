import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { CuerpoDemasiadoGrande, cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import {
  EVOLUCIONES_POR_PAGINA,
  cambiosDelOdontograma,
  edadEn,
  esPrevision,
  ordenarMarcas,
  type Antecedentes,
  type EvolucionRespuesta,
  type EvolucionesRespuesta,
  type FichaClinicaRespuesta,
  type OdontogramaRespuesta,
} from "@/lib/ficha-clinica"
import type { MarcaDelOdontograma } from "@/lib/odontograma"
import { fechaDeColumna, fechaParaColumna } from "@/lib/periodos-de-liquidacion"
import {
  veAlertaDeAlergias,
  whereDeAgenda,
  whereDeAlertaDeAlergias,
  whereDeClientes,
  whereDeEvoluciones,
  whereDeFichasClinicas,
  whereDeMarcasDentales,
  type Actor,
} from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { nombreEnElNegocio } from "@/lib/tablero"
import { fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) La ficha clínica de un paciente: antecedentes, odontograma y
 * evoluciones, para `app/api/clientes/[id]/{ficha,odontograma,evoluciones}`.
 * También lo que comparten con el plan de tratamiento
 * (`lib/plan-de-tratamiento-servidor.ts`): el paciente, el candado, la firma,
 * la cita del paciente y cómo se responde un error. Las reglas puras están en
 * `lib/ficha-clinica.ts`.
 *
 * Aislamiento (CLAUDE.md, regla 1): el paciente se busca con
 * `whereDeClientes` y toda lectura o escritura clínica pasa por los filtros
 * de `lib/permisos.ts` (`whereDeFichasClinicas`, `whereDeMarcasDentales`,
 * `whereDeEvoluciones` y, sólo en `leerAlertaDeAlergias`,
 * `whereDeAlertaDeAlergias`), que acotan al negocio de la sesión y no dejan nada a
 * quien no puede verlo. Toda fila nueva se escribe con el `businessId` de la
 * sesión y con ids, nunca con `connect`: las FK compuestas de la base
 * rechazan una fila que mezcle negocios.
 */

// ─── Respuestas ──────────────────────────────────────────────────────────────

/** Un error de estos endpoints con su código HTTP y un mensaje para quien usa la pantalla. */
export class ErrorClinico extends Error {
  readonly status: 400 | 401 | 404 | 409

  constructor(status: 400 | 401 | 404 | 409, mensaje: string) {
    super(mensaje)
    this.name = "ErrorClinico"
    this.status = status
  }
}

export const MENSAJE_PACIENTE_NO_ENCONTRADO = "Paciente no encontrado"

/** Lo mismo que responde un paciente que no existe: así no se distingue de uno ajeno. */
export const pacienteNoEncontrado = () => NextResponse.json({ error: MENSAJE_PACIENTE_NO_ENCONTRADO }, { status: 404 })

export const noAutorizado = () => NextResponse.json({ error: "No autorizado" }, { status: 401 })

const MENSAJE_DE_CAMBIO_SIMULTANEO = "Alguien cambió esto al mismo tiempo. Recarga y vuelve a intentarlo."
const MENSAJE_DE_REFERENCIA_PERDIDA = "Algo de lo que elegiste ya no existe. Recarga y vuelve a intentarlo."

/**
 * La respuesta para cualquier error de los endpoints clínicos. `contexto` es
 * para el log, que no guarda datos del paciente (`registrarError`).
 */
export function respuestaClinica(error: unknown, contexto: string): NextResponse {
  if (error instanceof ErrorClinico) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
  if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Un único que choca (dos versiones del plan a la vez, dos marcas en la
    // misma cara) o una FK a algo que se borró entretanto: es una carrera,
    // no un error del servidor.
    if (error.code === "P2002") return NextResponse.json({ error: MENSAJE_DE_CAMBIO_SIMULTANEO }, { status: 409 })
    if (error.code === "P2003") return NextResponse.json({ error: MENSAJE_DE_REFERENCIA_PERDIDA }, { status: 409 })
  }
  registrarError(contexto, error)
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
}

/**
 * El cuerpo JSON del pedido, con el tope de siempre. Pasado el tope lanza
 * `CuerpoDemasiadoGrande` (413 en `respuestaClinica`); un JSON roto o un
 * pedido sin cuerpo dan `undefined`, que el esquema rechaza con un 400.
 */
export async function cuerpoDelPedido(request: Request): Promise<unknown> {
  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) throw new CuerpoDemasiadoGrande()
  return recibido.cuerpo
}

// ─── Paciente, candado y firma ───────────────────────────────────────────────

/**
 * El paciente con ese id, si es del negocio de la sesión, no se eliminó y el
 * actor puede `puede` (ver la ficha, ver el plan). Primero la pertenencia y
 * después el permiso, como en el resto de los endpoints; los dos dan `null`,
 * y el endpoint responde 404 igual: fuera de una clínica dental, o para quien
 * no ve la ficha, el paciente "no existe".
 */
export async function pacienteConAcceso(
  actor: Actor,
  id: string,
  puede: (actor: Actor | null) => boolean
): Promise<{ id: string } | null> {
  const paciente = await prisma.customer.findFirst({
    where: whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] }),
    select: { id: true },
  })
  if (!paciente || !puede(actor)) return null
  return paciente
}

/**
 * Traba la fila del paciente hasta que termine la transacción (`FOR UPDATE`,
 * como `trabarCliente` en `lib/llegadas.ts`) y vuelve a mirar que siga del
 * negocio y sin eliminar. Toda escritura clínica de un paciente pasa por acá:
 * dos guardados del odontograma, dos versiones del plan o dos etapas nuevas
 * del mismo paciente van una detrás de la otra (y la segunda ve lo que hizo
 * la primera), y nada clínico se escribe sobre un paciente que se eliminó
 * entre la verificación del endpoint y la escritura.
 */
export async function trabarPaciente(tx: Prisma.TransactionClient, actor: Actor, pacienteId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${pacienteId} AND "businessId" = ${actor.businessId} FOR UPDATE`
  const sigue = await tx.customer.findFirst({
    where: whereDeClientes(actor, { AND: [{ id: pacienteId }, clienteNoEliminado] }),
    select: { id: true },
  })
  if (!sigue) throw new ErrorClinico(404, MENSAJE_PACIENTE_NO_ENCONTRADO)
}

/** Lo que se copia cuando el nombre no está: la base no acepta un autor vacío. */
const SIN_NOMBRE = "Sin nombre"

/** Un nombre para copiar: el que hay, recortado, o "Sin nombre". */
export const nombreParaCopiar = (nombre: string | null | undefined): string => nombre?.trim() || SIN_NOMBRE

/**
 * Quién escribe: el id del usuario de la sesión y su nombre dentro del
 * negocio (`nombreEnElNegocio`), que se copia en la ficha, la evolución o el
 * plan como `paidByName` en el cobro: el historial sigue diciendo quién fue
 * aunque la persona deje la clínica. Sin id de usuario en la sesión, `null`
 * (el endpoint responde 401).
 */
export async function firmaClinica(actor: Actor, usuarioId: string | null | undefined): Promise<{ id: string; nombre: string } | null> {
  if (!usuarioId) return null
  return { id: usuarioId, nombre: nombreParaCopiar(await nombreEnElNegocio(prisma, actor, usuarioId)) }
}

/** El día de hoy ("AAAA-MM-DD") en la zona horaria del negocio. */
export async function hoyDelNegocio(actor: Actor): Promise<string> {
  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  return fechaYMinutosEn(new Date(), zonaDelNegocio(negocio?.timezone)).fecha
}

/**
 * Los estados en que una cita no sirve para colgarle algo clínico: cancelar
 * una cita desvincula sus evoluciones y prestaciones, así que una cancelada no
 * se vincula de nuevo; y una a la que el paciente no vino no agenda ni
 * realiza una prestación.
 */
export const CITA_NO_SIRVE_PARA_EVOLUCION = ["cancelada"] as const
export const CITA_NO_SIRVE_PARA_PRESTACION = ["cancelada", "no-asistio"] as const

/**
 * La cita `appointmentId`, si es de este paciente y el actor la ve en la
 * agenda (`whereDeAgenda`: el odontólogo, las suyas; dueño y encargado,
 * todas). Si no, 404, como cualquier id ajeno; en un estado de `noSirve`, 409.
 */
export async function citaDelPaciente(
  db: Prisma.TransactionClient,
  actor: Actor,
  pacienteId: string,
  appointmentId: string,
  noSirve: readonly string[]
): Promise<{ id: string }> {
  const cita = await db.appointment.findFirst({
    where: whereDeAgenda(actor, { id: appointmentId, customerId: pacienteId }),
    select: { id: true, status: true },
  })
  if (!cita) throw new ErrorClinico(404, "Cita no encontrada")
  if (noSirve.includes(cita.status)) {
    throw new ErrorClinico(
      409,
      cita.status === "cancelada" ? "Esa cita está cancelada: elige otra." : "A esa cita el paciente no vino: elige otra."
    )
  }
  return { id: cita.id }
}

// ─── Antecedentes ────────────────────────────────────────────────────────────

/** El único de la ficha: una por paciente, en el negocio de la sesión. */
const fichaDe = (actor: Actor, pacienteId: string) => ({
  customerId_businessId: { customerId: pacienteId, businessId: actor.businessId },
})

/** La ficha del paciente como la devuelve `GET /ficha`. Sin ficha todavía, todo en `null`. */
export async function leerFicha(
  db: Prisma.TransactionClient,
  actor: Actor,
  pacienteId: string,
  hoy: string
): Promise<FichaClinicaRespuesta> {
  const ficha = await db.fichaClinica.findFirst({
    where: whereDeFichasClinicas(actor, { customerId: pacienteId }),
    select: {
      fechaNacimiento: true,
      prevision: true,
      alergias: true,
      antecedentes: true,
      actualizadaPor: true,
      updatedAt: true,
    },
  })
  const fechaNacimiento = ficha?.fechaNacimiento ? fechaDeColumna(ficha.fechaNacimiento) : null
  const prevision = ficha?.prevision
  return {
    fechaNacimiento,
    edad: fechaNacimiento ? edadEn(fechaNacimiento, hoy) : null,
    // Un valor fuera de la lista (no debería pasar: hay un CHECK) no se inventa.
    prevision: esPrevision(prevision) ? prevision : null,
    alergias: ficha?.alergias ?? null,
    antecedentes: ficha?.antecedentes ?? null,
    actualizadaPor: ficha?.actualizadaPor ?? null,
    updatedAt: ficha?.updatedAt.toISOString() ?? null,
  }
}

/**
 * La alerta de alergias del paciente: lo anotado en `alergias`, recortado.
 * Es lo único de la ficha que ve también el encargado (`veAlertaDeAlergias`),
 * y este es su único lector: el panel de la cita (`GET /api/citas/[id]`), el
 * panel de Pacientes (`GET /api/clientes/[id]`) y la ficha del paciente
 * (`/dashboard/clientes/[id]`) la leen de acá. Por eso fija las dos cosas que
 * no se pueden olvidar:
 *
 * - el `select` es sólo `alergias`: con `whereDeAlertaDeAlergias` el
 *   encargado alcanza la fila entera de la ficha, y los antecedentes no son
 *   para él (`veFichaClinica`);
 * - el paciente no se eliminó (`clienteNoEliminado`, como
 *   `pacienteConAcceso`): de uno anonimizado no se lee nada clínico, aunque
 *   la ficha siga en la base.
 *
 * `null` sin ficha, sin nada anotado, con el paciente eliminado o para quien
 * no ve la alerta (fuera de una clínica dental). Si la respuesta lleva la
 * clave lo decide el endpoint, con `veAlertaDeAlergias`.
 */
export async function leerAlertaDeAlergias(
  db: Pick<Prisma.TransactionClient, "fichaClinica">,
  actor: Actor,
  pacienteId: string
): Promise<string | null> {
  if (!veAlertaDeAlergias(actor)) return null
  const ficha = await db.fichaClinica.findFirst({
    where: whereDeAlertaDeAlergias(actor, {
      AND: [{ customerId: pacienteId }, { customer: { is: clienteNoEliminado } }],
    }),
    select: { alergias: true },
  })
  return ficha?.alergias?.trim() || null
}

/**
 * Guarda los antecedentes: crea la ficha en la primera escritura (upsert) y
 * cambia sólo lo que vino en el pedido. `actualizadaPor` se copia en cada
 * escritura.
 */
export async function guardarAntecedentes(
  actor: Actor,
  pacienteId: string,
  datos: Antecedentes,
  autor: string,
  hoy: string
): Promise<FichaClinicaRespuesta> {
  const campos = {
    ...(datos.fechaNacimiento !== undefined && {
      fechaNacimiento: datos.fechaNacimiento === null ? null : fechaParaColumna(datos.fechaNacimiento),
    }),
    ...(datos.prevision !== undefined && { prevision: datos.prevision }),
    ...(datos.alergias !== undefined && { alergias: datos.alergias }),
    ...(datos.antecedentes !== undefined && { antecedentes: datos.antecedentes }),
  }
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    await tx.fichaClinica.upsert({
      where: fichaDe(actor, pacienteId),
      create: { businessId: actor.businessId, customerId: pacienteId, actualizadaPor: autor, ...campos },
      update: { actualizadaPor: autor, ...campos },
      select: { id: true },
    })
    return leerFicha(tx, actor, pacienteId, hoy)
  })
}

// ─── Odontograma ─────────────────────────────────────────────────────────────

/** Las marcas del paciente y quién y cuándo las tocó por última vez. */
export async function leerOdontograma(db: Prisma.TransactionClient, actor: Actor, pacienteId: string): Promise<OdontogramaRespuesta> {
  const [marcas, ficha] = await Promise.all([
    db.marcaDental.findMany({
      where: whereDeMarcasDentales(actor, { customerId: pacienteId }),
      select: { pieza: true, cara: true, tipo: true },
    }),
    db.fichaClinica.findFirst({
      where: whereDeFichasClinicas(actor, { customerId: pacienteId }),
      select: { odontogramaActualizadoEn: true, odontogramaActualizadoPor: true },
    }),
  ])
  return {
    marcas: ordenarMarcas(marcas),
    odontogramaActualizadoEn: ficha?.odontogramaActualizadoEn?.toISOString() ?? null,
    odontogramaActualizadoPor: ficha?.odontogramaActualizadoPor ?? null,
  }
}

/**
 * Reemplaza el odontograma entero por `marcas` (ya validadas con
 * `odontogramaSchema`), en una transacción: borra las que no vienen, crea las
 * nuevas, y deja quién y cuándo en la ficha (que se crea si no existía). Si
 * nada cambió, no escribe nada: guardar lo mismo no es una actualización.
 */
export async function guardarOdontograma(
  actor: Actor,
  pacienteId: string,
  marcas: readonly MarcaDelOdontograma[],
  autor: string
): Promise<OdontogramaRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const actuales = await tx.marcaDental.findMany({
      where: whereDeMarcasDentales(actor, { customerId: pacienteId }),
      select: { id: true, pieza: true, cara: true, tipo: true },
    })
    const { borrar, crear } = cambiosDelOdontograma(actuales, marcas)
    if (borrar.length === 0 && crear.length === 0) return leerOdontograma(tx, actor, pacienteId)

    // Primero se borra: si una cara cambia de caries a obturación, la nueva
    // chocaría con la vieja en el único "una marca por cara".
    if (borrar.length > 0) {
      await tx.marcaDental.deleteMany({ where: whereDeMarcasDentales(actor, { customerId: pacienteId, id: { in: borrar } }) })
    }
    if (crear.length > 0) {
      await tx.marcaDental.createMany({
        data: crear.map((marca) => ({
          businessId: actor.businessId,
          customerId: pacienteId,
          pieza: marca.pieza,
          cara: marca.cara,
          tipo: marca.tipo,
        })),
      })
    }
    const ahora = await horaDeLaBase(tx)
    const quien = { actualizadaPor: autor, odontogramaActualizadoEn: ahora, odontogramaActualizadoPor: autor }
    await tx.fichaClinica.upsert({
      where: fichaDe(actor, pacienteId),
      create: { businessId: actor.businessId, customerId: pacienteId, ...quien },
      update: quien,
      select: { id: true },
    })
    return leerOdontograma(tx, actor, pacienteId)
  })
}

// ─── Evoluciones ─────────────────────────────────────────────────────────────

const SELECCION_DE_EVOLUCION = {
  id: true,
  texto: true,
  autorNombre: true,
  createdAt: true,
  appointmentId: true,
} satisfies Prisma.EvolucionSelect

function formatearEvolucion(evolucion: Prisma.EvolucionGetPayload<{ select: typeof SELECCION_DE_EVOLUCION }>): EvolucionRespuesta {
  return { ...evolucion, createdAt: evolucion.createdAt.toISOString() }
}

/**
 * Una página de evoluciones del paciente, de la más nueva a la más vieja.
 * `antes` es el id de la última que ya se tiene (`siguiente` de la página
 * anterior): trae las que van después de esa en el mismo orden. Un `antes`
 * que no es de este paciente es 404, como cualquier id ajeno.
 */
export async function leerEvoluciones(actor: Actor, pacienteId: string, antes: string | null): Promise<EvolucionesRespuesta> {
  let despuesDe: Prisma.EvolucionWhereInput = {}
  if (antes) {
    const cursor = await prisma.evolucion.findFirst({
      where: whereDeEvoluciones(actor, { id: antes, customerId: pacienteId }),
      select: { id: true, createdAt: true },
    })
    if (!cursor) throw new ErrorClinico(404, "Evolución no encontrada")
    despuesDe = {
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    }
  }
  const filas = await prisma.evolucion.findMany({
    where: whereDeEvoluciones(actor, { AND: [{ customerId: pacienteId }, despuesDe] }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EVOLUCIONES_POR_PAGINA + 1,
    select: SELECCION_DE_EVOLUCION,
  })
  const pagina = filas.slice(0, EVOLUCIONES_POR_PAGINA)
  return {
    evoluciones: pagina.map(formatearEvolucion),
    siguiente: filas.length > EVOLUCIONES_POR_PAGINA ? pagina[pagina.length - 1].id : null,
  }
}

/**
 * Anota una evolución. El autor sale de la sesión: su nombre copiado, su
 * usuario y, si es miembro del equipo, su `memberId` (el dueño no lo tiene).
 * La cita, si viene, tiene que ser de este paciente y verla quien escribe.
 */
export async function anotarEvolucion(
  actor: Actor,
  pacienteId: string,
  datos: { texto: string; appointmentId?: string | null },
  autor: { id: string; nombre: string }
): Promise<EvolucionRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const cita = datos.appointmentId
      ? await citaDelPaciente(tx, actor, pacienteId, datos.appointmentId, CITA_NO_SIRVE_PARA_EVOLUCION)
      : null
    const evolucion = await tx.evolucion.create({
      data: {
        businessId: actor.businessId,
        customerId: pacienteId,
        texto: datos.texto,
        autorNombre: autor.nombre,
        autorUserId: autor.id,
        memberId: actor.memberId,
        appointmentId: cita?.id ?? null,
      },
      select: SELECCION_DE_EVOLUCION,
    })
    return formatearEvolucion(evolucion)
  })
}
