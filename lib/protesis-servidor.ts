import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { trabarProtesis } from "@/lib/abonos-de-protesis"
import { ErrorClinico, nombreParaCopiar, trabarPaciente } from "@/lib/ficha-clinica-servidor"
import {
  MAXIMO_DE_ETAPAS,
  MAXIMO_DE_PRESTACIONES_POR_ETAPA,
  MENSAJE_ETAPA_APROBADA,
  MENSAJE_SIN_PLAN,
} from "@/lib/edicion-del-plan"
import {
  MENSAJE_CON_ABONOS,
  MENSAJE_EXCEPCION_REPETIDA,
  MENSAJE_LABORATORIO_INACTIVO,
  MENSAJE_LABORATORIO_REPETIDO,
  MENSAJE_MATERIAL_INACTIVO,
  MENSAJE_MATERIAL_NO_SIRVE,
  MENSAJE_MATERIAL_REPETIDO,
  MENSAJE_PROTESIS_ANULADA,
  MENSAJE_SIN_MIEMBRO,
  MENSAJE_YA_EN_EL_PLAN,
  NOMBRE_DE_LA_ETAPA_DE_PROTESIS,
  type AlPlanRespuesta,
  type EdicionDeMaterial,
  type EdicionDeProtesis,
  type ExcepcionRespuesta,
  type LaboratorioRespuesta,
  type MaterialNuevo,
  type MaterialRespuesta,
  type OpcionesDeProtesisRespuesta,
  type ProtesisDelPacienteRespuesta,
  type ProtesisNueva,
  type ProtesisRespuesta,
  type RepartoRespuesta,
} from "@/lib/edicion-de-protesis"
import { fechaDeColumna, fechaParaColumna } from "@/lib/periodos-de-liquidacion"
import {
  esDueño,
  puedeEditarPlanDeTratamiento,
  puedeEditarProtesis,
  puedeConfigurarRepartoDeProtesis,
  tratanteParaProtesis,
  veMontosDelReparto,
  whereDeAbonosDeProtesis,
  whereDeEtapasDelPlan,
  whereDeEventosDeProtesis,
  whereDeExcepcionesDeReparto,
  whereDeLaboratorios,
  whereDeMaterialesDeProtesis,
  whereDePlanes,
  whereDePrestacionesDelPlan,
  whereDeProtesis,
  type Actor,
} from "@/lib/permisos"
import {
  MENSAJE_PROTESIS_CERRADA,
  errorDeCambioDeEstado,
  errorDeTiposDelMaterial,
  errorDelDiseno,
  esArcada,
  esEstadoDeProtesis,
  esMaterialCompatible,
  esTipoDeProtesis,
  esUnidad,
  esZona,
  estaCerrada,
  nombreParaElPlan,
  normalizarDiseno,
  ordenarTipos,
  pasoSiguiente,
  repartirMonto,
  repartoEfectivo,
  repartoQueAplica,
  unidadDelTipo,
  valorDeLaProtesis,
  type RepartoEnPuntosBase,
} from "@/lib/protesis"

/**
 * (servidor) Las prótesis: el catálogo (laboratorios, materiales, excepciones
 * de reparto y su auditoría) y las prótesis del paciente, para
 * `app/api/configuracion/laboratorios`, `app/api/comisiones/protesis/…` y
 * `app/api/clientes/[id]/protesis/…`. Las reglas puras están en
 * `lib/protesis.ts`; los esquemas y las respuestas, en
 * `lib/edicion-de-protesis.ts`.
 *
 * Aislamiento: el endpoint ya verificó el negocio, el rubro, el paciente y el
 * permiso. Acá toda fila se busca con los filtros de `lib/permisos.ts`
 * (`whereDeProtesis`, `whereDeMaterialesDeProtesis`, `whereDeLaboratorios`,
 * `whereDeExcepcionesDeReparto`…), así que un id ajeno no encuentra nada (404),
 * y se escribe siempre con el `businessId` de la sesión y con ids, nunca con
 * `connect`: las FK compuestas de la base rechazan lo que mezcle negocios.
 *
 * Toda escritura de una prótesis va en una transacción que primero traba al
 * paciente (`trabarPaciente`), como el plan: dos avances del seguimiento a la
 * vez van uno detrás del otro y el segundo ve lo que hizo el primero. Los
 * cambios de reparto traban la fila del material (`FOR UPDATE`): dos cambios a
 * la vez de la regla de un material, o de una excepción suya, no auditan el
 * mismo "antes".
 */

type Tx = Prisma.TransactionClient

const MENSAJE_PROTESIS_NO_ENCONTRADA = "Prótesis no encontrada"
const MENSAJE_MATERIAL_NO_ENCONTRADO = "Material no encontrado"
const MENSAJE_LABORATORIO_NO_ENCONTRADO = "Laboratorio no encontrado"
const MENSAJE_PROFESIONAL_NO_ENCONTRADO = "Profesional no encontrado"
const MENSAJE_EXCEPCION_NO_ENCONTRADA = "Regla no encontrada"

/** Ninguna clínica tiene tantos; corta una lista sin fin. */
const TOPE_DEL_CATALOGO = 500
const TOPE_DE_PROTESIS_POR_PACIENTE = 200

const partesDe = (fila: RepartoEnPuntosBase): RepartoEnPuntosBase => ({
  pbOdontologo: fila.pbOdontologo,
  pbClinica: fila.pbClinica,
  pbTecnico: fila.pbTecnico,
})

const mismasPartes = (a: RepartoEnPuntosBase, b: RepartoEnPuntosBase) =>
  a.pbOdontologo === b.pbOdontologo && a.pbClinica === b.pbClinica && a.pbTecnico === b.pbTecnico

// ─── Quién y candados ────────────────────────────────────────────────────────

/**
 * Quién cambia el reparto: la dueña del negocio, con su nombre y su correo
 * copiados en la auditoría, como `autorDelCambio` de las comisiones. Se lee
 * del negocio y no del pedido.
 */
async function autorDelCambio(tx: Tx, actor: Actor) {
  const negocio = await tx.business.findFirst({
    where: { id: actor.businessId },
    select: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!negocio) throw new Error("El negocio de la sesión no existe")
  return {
    changedById: negocio.user.id,
    changedByName: nombreParaCopiar(negocio.user.name),
    changedByEmail: negocio.user.email,
  }
}

/** Traba la fila del material hasta el final de la transacción. */
async function trabarMaterial(tx: Tx, actor: Actor, materialId: string) {
  await tx.$queryRaw`SELECT id FROM materiales_de_protesis WHERE id = ${materialId} AND "businessId" = ${actor.businessId} FOR UPDATE`
}

/** Un laboratorio de la clínica, para ponerlo en algo nuevo: ajeno o inexistente, 404; desactivado, 400. */
async function laboratorioActivo(tx: Tx, actor: Actor, laboratorioId: string) {
  const laboratorio = await tx.laboratorio.findFirst({
    where: whereDeLaboratorios(actor, { id: laboratorioId }),
    select: { id: true, nombre: true, activo: true },
  })
  if (!laboratorio) throw new ErrorClinico(404, MENSAJE_LABORATORIO_NO_ENCONTRADO)
  if (!laboratorio.activo) throw new ErrorClinico(400, MENSAJE_LABORATORIO_INACTIVO)
  return { id: laboratorio.id, nombre: laboratorio.nombre }
}

// ─── Laboratorios ────────────────────────────────────────────────────────────

const SELECCION_DE_LABORATORIO = { id: true, nombre: true, contacto: true, activo: true } satisfies Prisma.LaboratorioSelect

/** Los laboratorios de la clínica, activos e inactivos, por nombre. */
export async function leerLaboratorios(actor: Actor): Promise<LaboratorioRespuesta[]> {
  return prisma.laboratorio.findMany({
    where: whereDeLaboratorios(actor),
    select: SELECCION_DE_LABORATORIO,
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: TOPE_DEL_CATALOGO,
  })
}

/** Un nombre que ya usa otro laboratorio de la clínica, sin distinguir mayúsculas: 409. El índice de la base cubre la carrera. */
async function nombreDeLaboratorioLibre(tx: Tx, actor: Actor, nombre: string, salvo?: string) {
  const repetido = await tx.laboratorio.findFirst({
    where: whereDeLaboratorios(actor, { nombre: { equals: nombre, mode: "insensitive" }, ...(salvo && { id: { not: salvo } }) }),
    select: { id: true },
  })
  if (repetido) throw new ErrorClinico(409, MENSAJE_LABORATORIO_REPETIDO)
}

export async function crearLaboratorio(
  actor: Actor,
  datos: { nombre: string; contacto?: string | null; activo?: boolean }
): Promise<LaboratorioRespuesta> {
  return prisma.$transaction(async (tx) => {
    await nombreDeLaboratorioLibre(tx, actor, datos.nombre)
    return tx.laboratorio.create({
      data: { businessId: actor.businessId, nombre: datos.nombre, contacto: datos.contacto ?? null, activo: datos.activo ?? true },
      select: SELECCION_DE_LABORATORIO,
    })
  })
}

/**
 * Renombra, cambia el contacto, desactiva o reactiva un laboratorio. No se
 * borra: las prótesis que lo tienen lo siguen nombrando (copia). Desactivarlo
 * sólo deja de ofrecerlo para prótesis nuevas y como laboratorio por defecto.
 */
export async function editarLaboratorio(
  actor: Actor,
  laboratorioId: string,
  datos: { nombre?: string; contacto?: string | null; activo?: boolean }
): Promise<LaboratorioRespuesta> {
  return prisma.$transaction(async (tx) => {
    if (datos.nombre !== undefined) await nombreDeLaboratorioLibre(tx, actor, datos.nombre, laboratorioId)
    await tx.laboratorio.updateMany({
      where: whereDeLaboratorios(actor, { id: laboratorioId }),
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.contacto !== undefined && { contacto: datos.contacto }),
        ...(datos.activo !== undefined && { activo: datos.activo }),
      },
    })
    const laboratorio = await tx.laboratorio.findFirst({ where: whereDeLaboratorios(actor, { id: laboratorioId }), select: SELECCION_DE_LABORATORIO })
    if (!laboratorio) throw new ErrorClinico(404, MENSAJE_LABORATORIO_NO_ENCONTRADO)
    return laboratorio
  })
}

// ─── Materiales ──────────────────────────────────────────────────────────────

export const SELECCION_DE_MATERIAL = {
  id: true,
  nombre: true,
  unidad: true,
  tipos: true,
  precioCents: true,
  pbOdontologo: true,
  pbClinica: true,
  pbTecnico: true,
  orden: true,
  activo: true,
  laboratorioPorDefecto: { select: { id: true, nombre: true } },
} satisfies Prisma.MaterialDeProtesisSelect

export const ORDEN_DE_MATERIALES = [{ orden: "asc" }, { nombre: "asc" }, { id: "asc" }] satisfies Prisma.MaterialDeProtesisOrderByWithRelationInput[]

type MaterialLeido = Prisma.MaterialDeProtesisGetPayload<{ select: typeof SELECCION_DE_MATERIAL }>

export function formatearMaterial(material: MaterialLeido): MaterialRespuesta {
  return {
    ...material,
    // Valores fuera de la lista no deberían existir (hay CHECKs): no se inventan.
    unidad: esUnidad(material.unidad) ? material.unidad : "arcada",
    tipos: ordenarTipos(material.tipos),
  }
}

/** Los materiales de la clínica, activos e inactivos, en su orden, con la regla. Sólo para quien configura el reparto. */
export async function leerMateriales(actor: Actor): Promise<MaterialRespuesta[]> {
  const materiales = await prisma.materialDeProtesis.findMany({
    where: whereDeMaterialesDeProtesis(actor),
    select: SELECCION_DE_MATERIAL,
    orderBy: ORDEN_DE_MATERIALES,
    take: TOPE_DEL_CATALOGO,
  })
  return materiales.map(formatearMaterial)
}

/** Un nombre que ya usa otro material de la clínica, sin distinguir mayúsculas: 409. */
async function nombreDeMaterialLibre(tx: Tx, actor: Actor, nombre: string, salvo?: string) {
  const repetido = await tx.materialDeProtesis.findFirst({
    where: whereDeMaterialesDeProtesis(actor, {
      nombre: { equals: nombre, mode: "insensitive" },
      ...(salvo && { id: { not: salvo } }),
    }),
    select: { id: true },
  })
  if (repetido) throw new ErrorClinico(409, MENSAJE_MATERIAL_REPETIDO)
}

/** Crea un material y deja en la auditoría su regla inicial. Sin orden, va al final. */
export async function crearMaterial(actor: Actor, datos: MaterialNuevo): Promise<MaterialRespuesta> {
  return prisma.$transaction(async (tx) => {
    await nombreDeMaterialLibre(tx, actor, datos.nombre)
    const laboratorio = datos.laboratorioPorDefectoId ? await laboratorioActivo(tx, actor, datos.laboratorioPorDefectoId) : null
    let orden = datos.orden
    if (orden === undefined) {
      const ultimo = await tx.materialDeProtesis.findFirst({
        where: whereDeMaterialesDeProtesis(actor),
        orderBy: { orden: "desc" },
        select: { orden: true },
      })
      orden = ultimo ? Math.min(ultimo.orden + 1, 999) : 1
    }
    const creado = await tx.materialDeProtesis.create({
      data: {
        businessId: actor.businessId,
        nombre: datos.nombre,
        unidad: datos.unidad,
        tipos: ordenarTipos(datos.tipos),
        precioCents: datos.precioCents,
        ...partesDe(datos),
        laboratorioPorDefectoId: laboratorio?.id ?? null,
        orden,
        activo: datos.activo ?? true,
      },
      select: SELECCION_DE_MATERIAL,
    })
    await tx.cambioDeRepartoDeProtesis.create({
      data: {
        businessId: actor.businessId,
        scope: "material",
        materialId: creado.id,
        materialNombre: creado.nombre,
        nuevoPbOdontologo: creado.pbOdontologo,
        nuevoPbClinica: creado.pbClinica,
        nuevoPbTecnico: creado.pbTecnico,
        ...(await autorDelCambio(tx, actor)),
      },
      select: { id: true },
    })
    return formatearMaterial(creado)
  })
}

/**
 * Cambia un material. La unidad y los tipos se validan como quedan. Si cambia
 * la regla, queda en la auditoría con el antes y el después. Las prótesis ya
 * creadas no cambian: copiaron su precio y su regla.
 */
export async function editarMaterial(actor: Actor, materialId: string, datos: EdicionDeMaterial): Promise<MaterialRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarMaterial(tx, actor, materialId)
    const actual = await tx.materialDeProtesis.findFirst({
      where: whereDeMaterialesDeProtesis(actor, { id: materialId }),
      select: { id: true, nombre: true, unidad: true, tipos: true, pbOdontologo: true, pbClinica: true, pbTecnico: true },
    })
    if (!actual) throw new ErrorClinico(404, MENSAJE_MATERIAL_NO_ENCONTRADO)

    const unidad = datos.unidad ?? actual.unidad
    const tipos = datos.tipos ?? actual.tipos
    if (datos.unidad !== undefined || datos.tipos !== undefined) {
      const error = esUnidad(unidad) ? errorDeTiposDelMaterial(unidad, tipos) : "La unidad tiene que ser por arcada o por pieza"
      if (error) throw new ErrorClinico(400, error)
    }
    if (datos.nombre !== undefined) await nombreDeMaterialLibre(tx, actor, datos.nombre, actual.id)
    const laboratorio = datos.laboratorioPorDefectoId ? await laboratorioActivo(tx, actor, datos.laboratorioPorDefectoId) : null

    const reparto =
      datos.pbOdontologo !== undefined && datos.pbClinica !== undefined && datos.pbTecnico !== undefined
        ? { pbOdontologo: datos.pbOdontologo, pbClinica: datos.pbClinica, pbTecnico: datos.pbTecnico }
        : null
    const data: Prisma.MaterialDeProtesisUncheckedUpdateManyInput = {
      ...(datos.nombre !== undefined && { nombre: datos.nombre }),
      ...(datos.unidad !== undefined && { unidad: datos.unidad }),
      ...(datos.tipos !== undefined && { tipos: ordenarTipos(datos.tipos) }),
      ...(datos.precioCents !== undefined && { precioCents: datos.precioCents }),
      ...(reparto ?? {}),
      ...(datos.laboratorioPorDefectoId !== undefined && { laboratorioPorDefectoId: laboratorio?.id ?? null }),
      ...(datos.orden !== undefined && { orden: datos.orden }),
      ...(datos.activo !== undefined && { activo: datos.activo }),
    }
    await tx.materialDeProtesis.updateMany({ where: whereDeMaterialesDeProtesis(actor, { id: actual.id }), data })

    if (reparto && !mismasPartes(reparto, actual)) {
      await tx.cambioDeRepartoDeProtesis.create({
        data: {
          businessId: actor.businessId,
          scope: "material",
          materialId: actual.id,
          materialNombre: datos.nombre ?? actual.nombre,
          anteriorPbOdontologo: actual.pbOdontologo,
          anteriorPbClinica: actual.pbClinica,
          anteriorPbTecnico: actual.pbTecnico,
          nuevoPbOdontologo: reparto.pbOdontologo,
          nuevoPbClinica: reparto.pbClinica,
          nuevoPbTecnico: reparto.pbTecnico,
          ...(await autorDelCambio(tx, actor)),
        },
        select: { id: true },
      })
    }
    const material = await tx.materialDeProtesis.findFirst({
      where: whereDeMaterialesDeProtesis(actor, { id: actual.id }),
      select: SELECCION_DE_MATERIAL,
    })
    if (!material) throw new ErrorClinico(404, MENSAJE_MATERIAL_NO_ENCONTRADO)
    return formatearMaterial(material)
  })
}

// ─── Excepciones de reparto ──────────────────────────────────────────────────

const SELECCION_DE_EXCEPCION = {
  id: true,
  memberId: true,
  materialId: true,
  pbOdontologo: true,
  pbClinica: true,
  pbTecnico: true,
  member: { select: { user: { select: { name: true } } } },
  material: { select: { nombre: true } },
} satisfies Prisma.ExcepcionDeRepartoDeProtesisSelect

type ExcepcionLeida = Prisma.ExcepcionDeRepartoDeProtesisGetPayload<{ select: typeof SELECCION_DE_EXCEPCION }>

function formatearExcepcion({ member, material, ...excepcion }: ExcepcionLeida): ExcepcionRespuesta {
  return { ...excepcion, memberNombre: nombreParaCopiar(member.user.name), materialNombre: material.nombre }
}

/** Las excepciones de la clínica (para el dueño, todas), por material y odontólogo. */
export async function leerExcepciones(actor: Actor): Promise<ExcepcionRespuesta[]> {
  const excepciones = await prisma.excepcionDeRepartoDeProtesis.findMany({
    where: whereDeExcepcionesDeReparto(actor),
    select: SELECCION_DE_EXCEPCION,
    orderBy: [{ materialId: "asc" }, { memberId: "asc" }],
    take: TOPE_DEL_CATALOGO,
  })
  return excepciones.map(formatearExcepcion)
}

/** Lo que cambia de una excepción, para la auditoría. */
async function auditarExcepcion(
  tx: Tx,
  actor: Actor,
  excepcion: { memberId: string; materialId: string; materialNombre: string; memberNombre: string },
  anterior: RepartoEnPuntosBase | null,
  nuevo: RepartoEnPuntosBase | null
) {
  await tx.cambioDeRepartoDeProtesis.create({
    data: {
      businessId: actor.businessId,
      scope: "excepcion",
      materialId: excepcion.materialId,
      materialNombre: excepcion.materialNombre,
      memberId: excepcion.memberId,
      memberName: excepcion.memberNombre,
      anteriorPbOdontologo: anterior?.pbOdontologo ?? null,
      anteriorPbClinica: anterior?.pbClinica ?? null,
      anteriorPbTecnico: anterior?.pbTecnico ?? null,
      nuevoPbOdontologo: nuevo?.pbOdontologo ?? null,
      nuevoPbClinica: nuevo?.pbClinica ?? null,
      nuevoPbTecnico: nuevo?.pbTecnico ?? null,
      ...(await autorDelCambio(tx, actor)),
    },
    select: { id: true },
  })
}

/** Crea la regla de un odontólogo en un material. Miembro o material ajenos, 404; ya existe, 409. */
export async function crearExcepcion(
  actor: Actor,
  datos: { memberId: string; materialId: string } & RepartoEnPuntosBase
): Promise<ExcepcionRespuesta> {
  return prisma.$transaction(async (tx) => {
    const [miembro, material] = await Promise.all([
      tx.businessMember.findFirst({
        where: { id: datos.memberId, businessId: actor.businessId },
        select: { id: true, user: { select: { name: true } } },
      }),
      tx.materialDeProtesis.findFirst({ where: whereDeMaterialesDeProtesis(actor, { id: datos.materialId }), select: { id: true, nombre: true } }),
    ])
    if (!miembro) throw new ErrorClinico(404, MENSAJE_PROFESIONAL_NO_ENCONTRADO)
    if (!material) throw new ErrorClinico(404, MENSAJE_MATERIAL_NO_ENCONTRADO)
    await trabarMaterial(tx, actor, material.id)
    const repetida = await tx.excepcionDeRepartoDeProtesis.findFirst({
      where: whereDeExcepcionesDeReparto(actor, { memberId: miembro.id, materialId: material.id }),
      select: { id: true },
    })
    if (repetida) throw new ErrorClinico(409, MENSAJE_EXCEPCION_REPETIDA)
    const creada = await tx.excepcionDeRepartoDeProtesis.create({
      data: { businessId: actor.businessId, memberId: miembro.id, materialId: material.id, ...partesDe(datos) },
      select: SELECCION_DE_EXCEPCION,
    })
    const nombres = { memberId: miembro.id, materialId: material.id, materialNombre: material.nombre, memberNombre: nombreParaCopiar(miembro.user.name) }
    await auditarExcepcion(tx, actor, nombres, null, partesDe(datos))
    return formatearExcepcion(creada)
  })
}

/** Una excepción de la clínica, trabando su material. Ajena o inexistente, 404. */
async function excepcionTrabada(tx: Tx, actor: Actor, id: string) {
  const vista = await tx.excepcionDeRepartoDeProtesis.findFirst({ where: whereDeExcepcionesDeReparto(actor, { id }), select: { materialId: true } })
  if (!vista) throw new ErrorClinico(404, MENSAJE_EXCEPCION_NO_ENCONTRADA)
  await trabarMaterial(tx, actor, vista.materialId)
  const excepcion = await tx.excepcionDeRepartoDeProtesis.findFirst({ where: whereDeExcepcionesDeReparto(actor, { id }), select: SELECCION_DE_EXCEPCION })
  if (!excepcion) throw new ErrorClinico(404, MENSAJE_EXCEPCION_NO_ENCONTRADA)
  return excepcion
}

/** Cambia la regla de una excepción. Si cambia, queda en la auditoría. */
export async function editarExcepcion(actor: Actor, id: string, reparto: RepartoEnPuntosBase): Promise<ExcepcionRespuesta> {
  return prisma.$transaction(async (tx) => {
    const actual = await excepcionTrabada(tx, actor, id)
    if (mismasPartes(actual, reparto)) return formatearExcepcion(actual)
    await tx.excepcionDeRepartoDeProtesis.updateMany({ where: whereDeExcepcionesDeReparto(actor, { id: actual.id }), data: partesDe(reparto) })
    const respuesta = formatearExcepcion(actual)
    await auditarExcepcion(tx, actor, respuesta, partesDe(actual), partesDe(reparto))
    return { ...respuesta, ...partesDe(reparto) }
  })
}

/** Quita una excepción: el odontólogo vuelve a la regla del material (en prótesis nuevas). Queda en la auditoría. */
export async function borrarExcepcion(actor: Actor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const actual = await excepcionTrabada(tx, actor, id)
    await tx.excepcionDeRepartoDeProtesis.deleteMany({ where: whereDeExcepcionesDeReparto(actor, { id: actual.id }) })
    await auditarExcepcion(tx, actor, formatearExcepcion(actual), partesDe(actual), null)
  })
}

// ─── Prótesis del paciente: lectura ──────────────────────────────────────────

const SELECCION_DE_PROTESIS = {
  id: true,
  businessId: true,
  tipo: true,
  arcada: true,
  piezas: true,
  pilares: true,
  zonas: true,
  materialId: true,
  materialNombre: true,
  unidad: true,
  precioUnitarioCents: true,
  unidades: true,
  valorCents: true,
  laboratorioId: true,
  laboratorioNombre: true,
  entregaEstimada: true,
  estado: true,
  memberId: true,
  byOwner: true,
  tratanteNombre: true,
  pbOdontologo: true,
  pbClinica: true,
  pbTecnico: true,
  origenDelReparto: true,
  entregadaEn: true,
  anuladaEn: true,
  anuladaPorNombre: true,
  creadoPorNombre: true,
  createdAt: true,
} satisfies Prisma.ProtesisSelect

type ProtesisLeida = Prisma.ProtesisGetPayload<{ select: typeof SELECCION_DE_PROTESIS }>

interface Agregados {
  eventos: ReadonlyMap<string, { estado: string; autorNombre: string; createdAt: Date }[]>
  pagado: ReadonlyMap<string, number>
  enElPlan: ReadonlySet<string>
}

/** Lo que el actor ve del reparto de una prótesis (`veMontosDelReparto`), con los montos sobre su valor. */
function repartoVisible(actor: Actor, protesis: ProtesisLeida): RepartoRespuesta | null {
  const visible = veMontosDelReparto(actor, protesis)
  if (visible === "nada") return null
  const efectivo = repartoEfectivo(protesis, protesis.byOwner)
  const montos = repartirMonto(protesis.valorCents, protesis, protesis.byOwner)
  const odontologo = { pb: efectivo.pbOdontologo, cents: montos.odontologoCents }
  if (visible === "suyo") return { visible: "suyo", odontologo }
  return {
    visible: "todo",
    origen: protesis.origenDelReparto === "excepcion" ? "excepcion" : "material",
    odontologo,
    clinica: { pb: efectivo.pbClinica, cents: montos.clinicaCents },
    tecnico: { pb: efectivo.pbTecnico, cents: montos.tecnicoCents },
  }
}

function formatearProtesis(actor: Actor, protesis: ProtesisLeida, agregados: Agregados): ProtesisRespuesta {
  // Los CHECKs garantizan los valores; si algo raro llegara, no se inventa otro tipo.
  const tipo = esTipoDeProtesis(protesis.tipo) ? protesis.tipo : "removible"
  const estado = esEstadoDeProtesis(protesis.estado) ? protesis.estado : "impresion"
  const pagadoCents = agregados.pagado.get(protesis.id) ?? 0
  return {
    id: protesis.id,
    tipo,
    arcada: esArcada(protesis.arcada) ? protesis.arcada : "superior",
    piezas: protesis.piezas,
    pilares: protesis.pilares,
    zonas: protesis.zonas.filter(esZona),
    material: {
      id: protesis.materialId,
      nombre: protesis.materialNombre,
      unidad: esUnidad(protesis.unidad) ? protesis.unidad : unidadDelTipo(tipo),
      precioUnitarioCents: protesis.precioUnitarioCents,
    },
    unidades: protesis.unidades,
    valorCents: protesis.valorCents,
    pagadoCents,
    saldoCents: Math.max(protesis.valorCents - pagadoCents, 0),
    laboratorio: protesis.laboratorioId && protesis.laboratorioNombre ? { id: protesis.laboratorioId, nombre: protesis.laboratorioNombre } : null,
    entregaEstimada: protesis.entregaEstimada ? fechaDeColumna(protesis.entregaEstimada) : null,
    estado,
    siguienteEstado: pasoSiguiente(estado),
    entregadaEn: protesis.entregadaEn?.toISOString() ?? null,
    anuladaEn: protesis.anuladaEn?.toISOString() ?? null,
    anuladaPorNombre: protesis.anuladaPorNombre,
    tratante: { memberId: protesis.memberId, nombre: protesis.tratanteNombre, esLaDuena: protesis.byOwner },
    creadoPorNombre: protesis.creadoPorNombre,
    createdAt: protesis.createdAt.toISOString(),
    eventos: (agregados.eventos.get(protesis.id) ?? []).map((evento) => ({
      estado: esEstadoDeProtesis(evento.estado) ? evento.estado : "impresion",
      autorNombre: evento.autorNombre,
      createdAt: evento.createdAt.toISOString(),
    })),
    enElPlan: agregados.enElPlan.has(protesis.id),
    nombreParaElPlan: nombreParaElPlan(protesis),
    reparto: repartoVisible(actor, protesis),
  }
}

/**
 * El seguimiento, lo abonado (líneas de atenciones finalizadas) y si están
 * en el plan vigente, de varias prótesis de un paciente a la vez.
 */
async function agregadosDe(db: Tx, actor: Actor, pacienteId: string, ids: string[]): Promise<Agregados> {
  if (ids.length === 0) return { eventos: new Map(), pagado: new Map(), enElPlan: new Set() }
  const [eventos, abonos, enElPlan] = await Promise.all([
    db.eventoDeProtesis.findMany({
      where: whereDeEventosDeProtesis(actor, { protesisId: { in: ids } }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { protesisId: true, estado: true, autorNombre: true, createdAt: true },
    }),
    db.visitService.findMany({
      where: whereDeAbonosDeProtesis(actor, { protesisId: { in: ids }, visit: { is: { status: "finalizada" } } }),
      select: { protesisId: true, priceCents: true },
    }),
    db.prestacionDelPlan.findMany({
      where: whereDePrestacionesDelPlan(actor, {
        protesisId: { in: ids },
        etapa: { is: { plan: { is: { vigente: true, customerId: pacienteId } } } },
      }),
      select: { protesisId: true },
    }),
  ])
  const porProtesis = new Map<string, { estado: string; autorNombre: string; createdAt: Date }[]>()
  for (const { protesisId, ...evento } of eventos) porProtesis.set(protesisId, [...(porProtesis.get(protesisId) ?? []), evento])
  const pagado = new Map<string, number>()
  for (const abono of abonos) if (abono.protesisId) pagado.set(abono.protesisId, (pagado.get(abono.protesisId) ?? 0) + abono.priceCents)
  return {
    eventos: porProtesis,
    pagado,
    enElPlan: new Set(enElPlan.flatMap((prestacion) => (prestacion.protesisId ? [prestacion.protesisId] : []))),
  }
}

/** Las prótesis del paciente, de la más nueva a la más vieja, con su seguimiento. */
export async function leerProtesisDelPaciente(db: Tx, actor: Actor, pacienteId: string): Promise<ProtesisDelPacienteRespuesta> {
  const protesis = await db.protesis.findMany({
    where: whereDeProtesis(actor, { customerId: pacienteId }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TOPE_DE_PROTESIS_POR_PACIENTE,
    select: SELECCION_DE_PROTESIS,
  })
  const agregados = await agregadosDe(db, actor, pacienteId, protesis.map((p) => p.id))
  return { protesis: protesis.map((p) => formatearProtesis(actor, p, agregados)), puedeEditar: puedeEditarProtesis(actor) }
}

/** Una prótesis de este paciente, ya formateada. De otro paciente o ajena, 404. */
async function leerUna(db: Tx, actor: Actor, pacienteId: string, protesisId: string): Promise<ProtesisRespuesta> {
  const protesis = await db.protesis.findFirst({
    where: whereDeProtesis(actor, { id: protesisId, customerId: pacienteId }),
    select: SELECCION_DE_PROTESIS,
  })
  if (!protesis) throw new ErrorClinico(404, MENSAJE_PROTESIS_NO_ENCONTRADA)
  return formatearProtesis(actor, protesis, await agregadosDe(db, actor, pacienteId, [protesis.id]))
}

// ─── Prótesis del paciente: escritura ────────────────────────────────────────

/** La tratante con su nombre copiado: la dueña, o un miembro del negocio (ajeno, 404). */
async function tratanteConNombre(tx: Tx, actor: Actor, pedido: string | undefined) {
  const tratante = tratanteParaProtesis(actor, pedido)
  if (!tratante) throw new ErrorClinico(401, MENSAJE_SIN_MIEMBRO)
  if (tratante.byOwner) {
    const negocio = await tx.business.findFirst({ where: { id: actor.businessId }, select: { user: { select: { name: true } } } })
    return { ...tratante, nombre: nombreParaCopiar(negocio?.user.name) }
  }
  const miembro = await tx.businessMember.findFirst({
    where: { id: tratante.memberId ?? "", businessId: actor.businessId },
    select: { id: true, user: { select: { name: true } } },
  })
  if (!miembro) throw new ErrorClinico(404, MENSAJE_PROFESIONAL_NO_ENCONTRADO)
  return { memberId: miembro.id, byOwner: false, nombre: nombreParaCopiar(miembro.user.name) }
}

/**
 * Crea una prótesis. El servidor calcula todo lo que es dinero: las unidades
 * y el valor con el precio del catálogo, y congela la regla de reparto (la
 * excepción de la tratante en ese material, o la del material). Lo que mande
 * el navegador de eso no existe en el esquema. Sin laboratorio, el del
 * material por defecto si sigue activo. Empieza en Impresión, con su evento.
 */
export async function crearProtesis(
  actor: Actor,
  pacienteId: string,
  pedido: ProtesisNueva,
  autor: { id: string; nombre: string }
): Promise<ProtesisRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const tratante = await tratanteConNombre(tx, actor, pedido.tratante)

    const material = await tx.materialDeProtesis.findFirst({
      where: whereDeMaterialesDeProtesis(actor, { id: pedido.materialId }),
      select: {
        id: true,
        nombre: true,
        unidad: true,
        tipos: true,
        precioCents: true,
        activo: true,
        pbOdontologo: true,
        pbClinica: true,
        pbTecnico: true,
        laboratorioPorDefecto: { select: { id: true, nombre: true, activo: true } },
      },
    })
    if (!material) throw new ErrorClinico(404, MENSAJE_MATERIAL_NO_ENCONTRADO)
    if (!material.activo) throw new ErrorClinico(400, MENSAJE_MATERIAL_INACTIVO)
    if (!esMaterialCompatible(material, pedido.tipo) || !esUnidad(material.unidad)) throw new ErrorClinico(400, MENSAJE_MATERIAL_NO_SIRVE)

    const diseno = normalizarDiseno(pedido)
    const error = errorDelDiseno(diseno)
    if (error) throw new ErrorClinico(400, error)
    const valor = valorDeLaProtesis({ unidad: material.unidad, precioCents: material.precioCents }, diseno)
    if (!valor.ok) throw new ErrorClinico(400, valor.error)

    let laboratorio: { id: string; nombre: string } | null = null
    if (pedido.laboratorioId) laboratorio = await laboratorioActivo(tx, actor, pedido.laboratorioId)
    else if (pedido.laboratorioId === undefined && material.laboratorioPorDefecto?.activo) {
      laboratorio = { id: material.laboratorioPorDefecto.id, nombre: material.laboratorioPorDefecto.nombre }
    }

    const excepcion = tratante.memberId
      ? await tx.excepcionDeRepartoDeProtesis.findFirst({
          where: whereDeExcepcionesDeReparto(actor, { memberId: tratante.memberId, materialId: material.id }),
          select: { pbOdontologo: true, pbClinica: true, pbTecnico: true },
        })
      : null
    const { origen, ...reparto } = repartoQueAplica(material, excepcion)

    const creada = await tx.protesis.create({
      data: {
        businessId: actor.businessId,
        customerId: pacienteId,
        memberId: tratante.memberId,
        byOwner: tratante.byOwner,
        tratanteNombre: tratante.nombre,
        tipo: diseno.tipo,
        arcada: diseno.arcada,
        piezas: diseno.piezas,
        pilares: diseno.pilares,
        zonas: diseno.zonas,
        materialId: material.id,
        materialNombre: material.nombre,
        unidad: material.unidad,
        precioUnitarioCents: material.precioCents,
        unidades: valor.unidades,
        valorCents: valor.valorCents,
        laboratorioId: laboratorio?.id ?? null,
        laboratorioNombre: laboratorio?.nombre ?? null,
        entregaEstimada: pedido.entregaEstimada ? fechaParaColumna(pedido.entregaEstimada) : null,
        ...reparto,
        origenDelReparto: origen,
        creadoPorNombre: autor.nombre,
      },
      select: { id: true },
    })
    await tx.eventoDeProtesis.create({
      data: { businessId: actor.businessId, protesisId: creada.id, estado: "impresion", autorNombre: autor.nombre, autorUserId: autor.id },
      select: { id: true },
    })
    return leerUna(tx, actor, pacienteId, creada.id)
  })
}

/**
 * Las líneas de atención que abonan a la prótesis, cobradas o por cobrar (no
 * las de atenciones anuladas): una prótesis con abonos no se anula. Se mira
 * con la prótesis trabada (`trabarProtesis`), igual que al agregar un abono.
 */
async function tieneAbonos(tx: Tx, actor: Actor, protesisId: string): Promise<boolean> {
  const abonos = await tx.visitService.count({
    where: whereDeAbonosDeProtesis(actor, { protesisId, visit: { is: { status: { not: "anulada" } } } }),
  })
  return abonos > 0
}

/**
 * Avanza el seguimiento (con su evento, la fecha de entrega o la de anulación
 * y quién) o cambia el laboratorio o la entrega estimada. Una entregada o
 * anulada no cambia (409). Pedir el estado en que ya está no es un cambio: el
 * doble clic no falla ni duplica el evento. Anular con abonos, 409.
 */
export async function editarProtesis(
  actor: Actor,
  pacienteId: string,
  protesisId: string,
  pedido: EdicionDeProtesis,
  autor: { id: string; nombre: string }
): Promise<ProtesisRespuesta> {
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    // Y la prótesis: un abono que se esté agregando en la Sala de espera
    // (que la traba igual, `agregarAbono`) termina antes, y anularla ya lo
    // ve; o la anulación termina antes, y el abono la ve anulada.
    await trabarProtesis(tx, actor.businessId, protesisId)
    const actual = await tx.protesis.findFirst({
      where: whereDeProtesis(actor, { id: protesisId, customerId: pacienteId }),
      select: { id: true, estado: true, laboratorioId: true },
    })
    if (!actual) throw new ErrorClinico(404, MENSAJE_PROTESIS_NO_ENCONTRADA)
    const cambiaEstado = pedido.estado !== undefined && pedido.estado !== actual.estado
    if (estaCerrada(actual.estado)) {
      if (!cambiaEstado && pedido.laboratorioId === undefined && pedido.entregaEstimada === undefined) return leerUna(tx, actor, pacienteId, actual.id)
      throw new ErrorClinico(409, MENSAJE_PROTESIS_CERRADA)
    }

    const data: Prisma.ProtesisUncheckedUpdateManyInput = {}
    let laboratorioId = actual.laboratorioId
    if (pedido.laboratorioId !== undefined) {
      const laboratorio = pedido.laboratorioId ? await laboratorioActivo(tx, actor, pedido.laboratorioId) : null
      laboratorioId = laboratorio?.id ?? null
      data.laboratorioId = laboratorioId
      data.laboratorioNombre = laboratorio?.nombre ?? null
    }
    if (pedido.entregaEstimada !== undefined) {
      data.entregaEstimada = pedido.entregaEstimada ? fechaParaColumna(pedido.entregaEstimada) : null
    }
    if (cambiaEstado && pedido.estado) {
      const error = errorDeCambioDeEstado(actual.estado, pedido.estado, laboratorioId !== null)
      if (error) throw new ErrorClinico(409, error)
      if (pedido.estado === "anulada" && (await tieneAbonos(tx, actor, actual.id))) throw new ErrorClinico(409, MENSAJE_CON_ABONOS)
      const ahora = await horaDeLaBase(tx)
      data.estado = pedido.estado
      if (pedido.estado === "entregada") data.entregadaEn = ahora
      if (pedido.estado === "anulada") {
        data.anuladaEn = ahora
        data.anuladaPorNombre = autor.nombre
      }
    }
    if (Object.keys(data).length > 0) {
      await tx.protesis.updateMany({ where: whereDeProtesis(actor, { id: actual.id }), data })
    }
    if (cambiaEstado && pedido.estado) {
      await tx.eventoDeProtesis.create({
        data: { businessId: actor.businessId, protesisId: actual.id, estado: pedido.estado, autorNombre: autor.nombre, autorUserId: autor.id },
        select: { id: true },
      })
    }
    return leerUna(tx, actor, pacienteId, actual.id)
  })
}

/**
 * "Agregar al plan y presupuesto": una prestación de "Boca" en el plan
 * vigente, con el nombre armado (`nombreParaElPlan`), el valor de la prótesis,
 * la tratante como profesional, por agendar y ligada a la prótesis. Va a la
 * etapa pedida (por aprobar), o a la última por aprobar, o a una etapa nueva
 * "Prótesis" al final. Sin plan vigente, o ya ligada, o anulada: 409.
 */
export async function agregarAlPlan(
  actor: Actor,
  pacienteId: string,
  protesisId: string,
  pedido: { etapaId?: string }
): Promise<AlPlanRespuesta> {
  if (!puedeEditarPlanDeTratamiento(actor)) throw new ErrorClinico(401, "No autorizado")
  return prisma.$transaction(async (tx) => {
    await trabarPaciente(tx, actor, pacienteId)
    const protesis = await tx.protesis.findFirst({
      where: whereDeProtesis(actor, { id: protesisId, customerId: pacienteId }),
      select: SELECCION_DE_PROTESIS,
    })
    if (!protesis) throw new ErrorClinico(404, MENSAJE_PROTESIS_NO_ENCONTRADA)
    if (protesis.estado === "anulada") throw new ErrorClinico(409, MENSAJE_PROTESIS_ANULADA)

    const plan = await tx.planDeTratamiento.findFirst({
      where: whereDePlanes(actor, { customerId: pacienteId, vigente: true }),
      select: { id: true },
    })
    if (!plan) throw new ErrorClinico(409, MENSAJE_SIN_PLAN)
    const yaLigada = await tx.prestacionDelPlan.findFirst({
      where: whereDePrestacionesDelPlan(actor, { protesisId: protesis.id, etapa: { is: { planId: plan.id } } }),
      select: { id: true },
    })
    if (yaLigada) throw new ErrorClinico(409, MENSAJE_YA_EN_EL_PLAN)

    const etapas = await tx.etapaDelPlan.findMany({
      where: whereDeEtapasDelPlan(actor, { planId: plan.id }),
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, orden: true, estado: true },
    })
    let etapa = pedido.etapaId ? etapas.find((e) => e.id === pedido.etapaId) : [...etapas].reverse().find((e) => e.estado === "por-aprobar")
    if (pedido.etapaId && !etapa) throw new ErrorClinico(404, "Etapa no encontrada")
    if (etapa?.estado === "aprobada") throw new ErrorClinico(409, MENSAJE_ETAPA_APROBADA)
    if (!etapa) {
      if (etapas.length >= MAXIMO_DE_ETAPAS) throw new ErrorClinico(409, `El plan ya tiene ${MAXIMO_DE_ETAPAS} etapas.`)
      const orden = etapas.reduce((maximo, e) => Math.max(maximo, e.orden), 0) + 1
      etapa = await tx.etapaDelPlan.create({
        data: { businessId: actor.businessId, planId: plan.id, orden, nombre: NOMBRE_DE_LA_ETAPA_DE_PROTESIS },
        select: { id: true, orden: true, estado: true },
      })
    }
    const prestaciones = await tx.prestacionDelPlan.findMany({
      where: whereDePrestacionesDelPlan(actor, { etapaId: etapa.id }),
      select: { orden: true },
    })
    if (prestaciones.length >= MAXIMO_DE_PRESTACIONES_POR_ETAPA) {
      throw new ErrorClinico(409, `La etapa ya tiene ${MAXIMO_DE_PRESTACIONES_POR_ETAPA} prestaciones.`)
    }
    const prestacion = await tx.prestacionDelPlan.create({
      data: {
        businessId: actor.businessId,
        etapaId: etapa.id,
        orden: prestaciones.reduce((maximo, p) => Math.max(maximo, p.orden), 0) + 1,
        pieza: null,
        caras: [],
        serviceId: null,
        nombre: nombreParaElPlan(protesis),
        memberId: protesis.memberId,
        profesionalNombre: protesis.tratanteNombre,
        valorCents: protesis.valorCents,
        protesisId: protesis.id,
      },
      select: { id: true },
    })
    return { prestacionId: prestacion.id, etapaId: etapa.id, protesis: await leerUna(tx, actor, pacienteId, protesis.id) }
  })
}

// ─── El catálogo para la ficha ───────────────────────────────────────────────

/**
 * Lo que la ficha necesita para armar una prótesis: los materiales activos
 * con su precio y su unidad, los laboratorios activos y a quién se puede
 * poner de tratante. La regla de reparto sólo para la dueña; el odontólogo
 * ve sólo su parte en cada material (con su excepción, si tiene).
 */
export async function leerOpciones(actor: Actor): Promise<OpcionesDeProtesisRespuesta> {
  const duena = esDueño(actor)
  const [materiales, laboratorios, excepciones, tratantes] = await Promise.all([
    prisma.materialDeProtesis.findMany({
      where: whereDeMaterialesDeProtesis(actor, { activo: true }),
      orderBy: ORDEN_DE_MATERIALES,
      take: TOPE_DEL_CATALOGO,
      select: {
        id: true,
        nombre: true,
        unidad: true,
        tipos: true,
        precioCents: true,
        laboratorioPorDefectoId: true,
        pbOdontologo: true,
        pbClinica: true,
        pbTecnico: true,
      },
    }),
    prisma.laboratorio.findMany({
      where: whereDeLaboratorios(actor, { activo: true }),
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
      take: TOPE_DEL_CATALOGO,
      select: { id: true, nombre: true },
    }),
    prisma.excepcionDeRepartoDeProtesis.findMany({
      where: whereDeExcepcionesDeReparto(actor),
      take: TOPE_DEL_CATALOGO,
      select: { memberId: true, materialId: true, pbOdontologo: true, pbClinica: true, pbTecnico: true },
    }),
    tratantesPosibles(actor),
  ])
  const miExcepcion = new Map(excepciones.filter((e) => e.memberId === actor.memberId).map((e) => [e.materialId, e]))
  return {
    materiales: materiales.map(({ pbOdontologo, pbClinica, pbTecnico, ...material }) => ({
      ...material,
      unidad: esUnidad(material.unidad) ? material.unidad : "arcada",
      tipos: ordenarTipos(material.tipos),
      ...(duena
        ? { reparto: { pbOdontologo, pbClinica, pbTecnico } }
        : { miPartePb: miExcepcion.get(material.id)?.pbOdontologo ?? pbOdontologo }),
    })),
    laboratorios,
    tratantes,
    ...(duena && puedeConfigurarRepartoDeProtesis(actor) ? { excepciones } : {}),
    puedeEditar: puedeEditarProtesis(actor),
  }
}

/** La dueña puede poner a cualquiera (ella y cada odontólogo); el odontólogo, sólo a sí mismo. */
async function tratantesPosibles(actor: Actor): Promise<{ id: string; nombre: string }[]> {
  if (esDueño(actor)) {
    const [negocio, miembros] = await Promise.all([
      prisma.business.findFirst({ where: { id: actor.businessId }, select: { user: { select: { name: true } } } }),
      prisma.businessMember.findMany({
        where: { businessId: actor.businessId, role: "worker" },
        orderBy: { createdAt: "asc" },
        select: { id: true, user: { select: { name: true } } },
      }),
    ])
    return [
      { id: "duenio", nombre: nombreParaCopiar(negocio?.user.name) },
      ...miembros.map((miembro) => ({ id: miembro.id, nombre: nombreParaCopiar(miembro.user.name) })),
    ]
  }
  if (!actor.memberId) return []
  const yo = await prisma.businessMember.findFirst({
    where: { id: actor.memberId, businessId: actor.businessId },
    select: { id: true, user: { select: { name: true } } },
  })
  return yo ? [{ id: yo.id, nombre: nombreParaCopiar(yo.user.name) }] : []
}
