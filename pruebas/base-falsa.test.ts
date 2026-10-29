import { describe, it, expect, beforeEach, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "./base-falsa"

/**
 * La base falsa sostiene los tests de aislamiento del tablero: si entendiera
 * mal un `where`, esos tests podrían pasar por la razón equivocada (F-018).
 * Acá se fija lo que sabe hacer y, sobre todo, que lanza ante lo que no sabe.
 */

const base = crearBaseFalsa()
const { prisma } = base

beforeEach(() => {
  base.reiniciar({
    business: [{ id: "n1", name: "Uno", slug: "uno", userId: "u1" }],
    user: [{ id: "u1", name: "Ana", email: "a@test" }],
    businessMember: [{ id: "m1", businessId: "n1", userId: "u1" }],
    appointment: [
      { id: "cita-1", businessId: "n1", title: "Corte", startTime: new Date(1), endTime: new Date(2), memberId: "m1" },
      { id: "cita-2", businessId: "n1", title: "Color", startTime: new Date(3), endTime: new Date(4) },
    ],
    visit: [
      { id: "v1", businessId: "n1", customerName: "María", appointmentId: "cita-1" },
      { id: "v2", businessId: "n1", customerName: "Beto", status: "finalizada", paidAt: new Date(10) },
    ],
    visitService: [
      { id: "l1", visitId: "v1", serviceName: "Corte", memberId: "m1", professionalName: "Ana", priceCents: 1000 },
      { id: "l2", visitId: "v1", serviceName: "Color", byOwner: true, professionalName: "Ana", priceCents: 2000 },
    ],
  })
})

describe("base falsa: lo que entiende", () => {
  it("AND, OR, igualdad, in y rangos de fecha", async () => {
    const encontradas = await prisma.visit.findMany({
      where: {
        AND: [
          { businessId: "n1" },
          { OR: [{ status: { in: ["en-espera"] } }, { status: "finalizada", paidAt: { gte: new Date(5), lt: new Date(20) } }] },
        ],
      },
    })

    expect(encontradas.map((v) => v.id)).toEqual(["v1", "v2"])
  })

  it("`in` vacío no matchea nada, como la negación de lib/permisos", async () => {
    expect(await prisma.visit.findMany({ where: { id: { in: [] } } })).toEqual([])
  })

  it("`mode: insensitive` compara textos sin mayúsculas, con equals e in", async () => {
    const porEquals = await prisma.appointment.findMany({ where: { title: { equals: "CORTE", mode: "insensitive" } } })
    const porIn = await prisma.appointment.findMany({ where: { title: { in: ["color"], mode: "insensitive" } } })
    const sinMode = await prisma.appointment.findMany({ where: { title: { equals: "CORTE" } } })

    expect(porEquals.map((c) => c.id)).toEqual(["cita-1"])
    expect(porIn.map((c) => c.id)).toEqual(["cita-2"])
    expect(sinMode).toEqual([])
  })

  it("filtros por relación: some, is y is null", async () => {
    const conLineaDeM1 = await prisma.visit.findMany({ where: { services: { some: { memberId: "m1" } } } })
    const deCitaDeM1 = await prisma.visit.findMany({ where: { appointment: { is: { memberId: "m1" } } } })
    const citasSinAtencion = await prisma.appointment.findMany({ where: { visit: { is: null } } })

    expect(conLineaDeM1.map((v) => v.id)).toEqual(["v1"])
    expect(deCitaDeM1.map((v) => v.id)).toEqual(["v1"])
    expect(citasSinAtencion.map((c) => c.id)).toEqual(["cita-2"])
  })

  it("un select anidado con where trae sólo los hijos que cumplen", async () => {
    const atencion = (await prisma.visit.findFirst({
      where: { id: "v1" },
      select: { id: true, services: { where: { memberId: "m1" }, select: { id: true } } },
    })) as { services: { id: string }[] }

    expect(atencion.services).toEqual([{ id: "l1" }])
  })

  it("una transacción que lanza deja la base como estaba", async () => {
    const antes = base.volcado()

    await expect(
      prisma.$transaction(async (tx: typeof prisma) => {
        await tx.visit.updateMany({ where: { id: "v1" }, data: { status: "anulada" } })
        throw new Error("algo falló")
      })
    ).rejects.toThrow("algo falló")

    expect(base.volcado()).toEqual(antes)
  })

  it("respeta `appointmentId` único y las claves foráneas, con los códigos de Prisma", async () => {
    const duplicada = prisma.visit.create({ data: { businessId: "n1", customerName: "X", appointmentId: "cita-1" } })
    const sinNegocio = prisma.visit.create({ data: { businessId: "no-existe", customerName: "X" } })

    await expect(duplicada).rejects.toMatchObject({ code: "P2002" })
    await expect(duplicada).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    await expect(sinNegocio).rejects.toMatchObject({ code: "P2003" })
  })
})

describe("base falsa: distinct", () => {
  it("deja la primera fila de cada valor, en el orden pedido y antes de take", async () => {
    await prisma.appointment.create({ data: { businessId: "n1", title: "Corte", startTime: new Date(5), endTime: new Date(6) } })
    const titulos = await prisma.appointment.findMany({
      select: { title: true },
      distinct: ["title"],
      orderBy: { title: "asc" },
      take: 5,
    })
    expect(titulos).toEqual([{ title: "Color" }, { title: "Corte" }])
  })

  it("lanza ante un distinct que no entiende", async () => {
    await expect(prisma.appointment.findMany({ distinct: "title" })).rejects.toThrow(/base falsa/)
    await expect(prisma.appointment.findMany({ distinct: ["noExiste"] })).rejects.toThrow(/base falsa/)
  })
})

describe("base falsa: NOT, has y _count", () => {
  it("NOT descarta lo que cumple la condición; con una lista, lo que cumple cualquiera", async () => {
    const sinBeto = await prisma.visit.findMany({ where: { NOT: { customerName: "Beto" } } })
    const ninguna = await prisma.visit.findMany({ where: { NOT: [{ customerName: "Beto" }, { customerName: "María" }] } })

    expect(sinBeto.map((v) => v.id)).toEqual(["v1"])
    expect(ninguna).toEqual([])
  })

  it("has mira si la lista guardada contiene el valor", async () => {
    await prisma.customer.createMany({
      data: [
        { id: "c1", businessId: "n1", name: "Con", tags: ["VIP", "Nuevo"] },
        { id: "c2", businessId: "n1", name: "Sin", tags: [] },
      ],
    })

    const conVip = await prisma.customer.findMany({ where: { tags: { has: "VIP" } } })
    const sinVip = await prisma.customer.findMany({ where: { NOT: { tags: { has: "VIP" } } } })

    expect(conVip.map((c) => c.id)).toEqual(["c1"])
    expect(sinVip.map((c) => c.id)).toEqual(["c2"])
  })

  it("_count cuenta los relacionados, con su where", async () => {
    const [atencion] = await prisma.visit.findMany({
      where: { id: "v1" },
      select: { id: true, _count: { select: { services: true, payments: { where: { method: "efectivo" } } } } },
    })

    expect(atencion).toEqual({ id: "v1", _count: { services: 2, payments: 0 } })
  })

  it("_count de algo que no es una relación a muchos lanza", async () => {
    await expect(prisma.visit.findMany({ select: { _count: { select: { business: true } } } })).rejects.toThrow(/base falsa/)
  })
})

describe("base falsa: lanza ante lo que no entiende (F-018)", () => {
  it.each([
    ["un operador desconocido", { customerName: { contains: "Mar" } }],
    ["un campo que no existe", { nombre: "María" }],
    ["has sobre un campo que no es una lista", { customerName: { has: "María" } }],
    ["un operador de relación desconocido", { services: { algunos: { memberId: "m1" } } }],
    ["OR sin lista", { OR: { status: "anulada" } }],
  ])("%s", async (_caso, where) => {
    await expect(prisma.visit.findMany({ where })).rejects.toThrow(/base falsa/)
  })

  it("un select de un campo que no existe", async () => {
    await expect(prisma.visit.findMany({ select: { nombre: true } })).rejects.toThrow(/base falsa/)
  })

  it("una escritura anidada que no sea { create }", async () => {
    await expect(
      prisma.visit.create({ data: { businessId: "n1", customerName: "X", services: { connect: [{ id: "l1" }] } } })
    ).rejects.toThrow(/base falsa/)
  })
})

describe("base falsa: lo de la etapa 2", () => {
  beforeEach(() => {
    base.reiniciar({
      business: [
        { id: "n1", name: "Uno", slug: "uno", userId: "u1" },
        { id: "n2", name: "Dos", slug: "dos", userId: "u2" },
      ],
      user: [
        { id: "u1", name: "Ana", email: "a@test" },
        { id: "u2", name: "Otro", email: "o@test" },
      ],
      businessMember: [
        { id: "m1", businessId: "n1", userId: "u1" },
        { id: "m2", businessId: "n2", userId: "u2" },
      ],
      service: [{ id: "s1", businessId: "n1", name: "Corte" }],
      visit: [
        { id: "v1", businessId: "n1", customerName: "María" },
        { id: "v2", businessId: "n2", customerName: "Beto" },
      ],
    })
  })

  it("los modelos nuevos traen los defaults del esquema", async () => {
    const linea = await prisma.visitService.create({
      data: { visitId: "v1", serviceName: "Corte", memberId: "m1", professionalName: "Ana", priceCents: 1000 },
    })
    const liquidacion = await prisma.liquidacion.create({
      data: { businessId: "n1", memberId: "m1", memberName: "Ana", desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") },
    })

    expect(linea).toMatchObject({ tipo: "servicio", productId: null, commissionPercent: null, commissionCents: null, commissionAt: null, liquidacionId: null })
    expect(liquidacion).toMatchObject({ estado: "cerrada", pagadaAt: null, anuladaAt: null })
    expect(base.buscar("business", { id: "n1" })[0]).toMatchObject({ liquidacionPeriodo: "mensual", liquidacionInicioSemana: 1 })
    expect(base.buscar("businessMember", { id: "m1" })[0]).toMatchObject({ commissionPercent: null })
  })

  it("una FK compuesta rechaza la atención o el miembro de otro negocio (P2003)", async () => {
    const atencionAjena = prisma.propinaDeAtencion.create({
      data: { businessId: "n1", visitId: "v2", memberId: "m1", professionalName: "Ana", method: "efectivo", amountCents: 100 },
    })
    const miembroAjeno = prisma.propinaDeAtencion.create({
      data: { businessId: "n1", visitId: "v1", memberId: "m2", professionalName: "Otro", method: "efectivo", amountCents: 100 },
    })

    await expect(atencionAjena).rejects.toMatchObject({ code: "P2003" })
    await expect(miembroAjeno).rejects.toMatchObject({ code: "P2003" })
  })

  it("una sola liquidación viva por (negocio, miembro, desde); una anulada no cuenta", async () => {
    const datos = { businessId: "n1", memberId: "m1", memberName: "Ana", desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") }
    const primera = await prisma.liquidacion.create({ data: datos })

    await expect(prisma.liquidacion.create({ data: datos })).rejects.toMatchObject({ code: "P2002" })

    await prisma.liquidacion.update({ where: { id: primera.id }, data: { estado: "anulada", anuladaAt: new Date() } })
    await expect(prisma.liquidacion.create({ data: datos })).resolves.toMatchObject({ estado: "cerrada" })
  })

  it("un cierre de caja por (negocio, hasta), y su desglose es JSON", async () => {
    const datos = {
      businessId: "n1",
      desde: new Date("2026-10-28T11:00:00Z"),
      hasta: new Date("2026-10-28T23:00:00Z"),
      fecha: new Date("2026-10-28"),
      zona: "America/Santiago",
      desglose: { "tarjeta-debito": 5000 },
    }
    await expect(prisma.cierreDeCaja.create({ data: datos })).resolves.toMatchObject({ desglose: { "tarjeta-debito": 5000 } })
    await expect(prisma.cierreDeCaja.create({ data: datos })).rejects.toMatchObject({ code: "P2002" })
  })

  it("único compuesto: CommissionRate por (memberId, serviceId), con upsert, delete y la clave de Prisma", async () => {
    const donde = { memberId_serviceId: { memberId: "m1", serviceId: "s1" } }
    await prisma.commissionRate.upsert({ where: donde, create: { businessId: "n1", memberId: "m1", serviceId: "s1", percent: 40 }, update: { percent: 40 } })
    await prisma.commissionRate.upsert({ where: donde, create: { businessId: "n1", memberId: "m1", serviceId: "s1", percent: 50 }, update: { percent: 50 } })

    expect(base.buscar("commissionRate").map((fila) => fila.percent)).toEqual([50])
    await expect(
      prisma.commissionRate.create({ data: { businessId: "n1", memberId: "m1", serviceId: "s1", percent: 10 } })
    ).rejects.toMatchObject({ code: "P2002" })

    await prisma.commissionRate.delete({ where: donde })
    expect(base.buscar("commissionRate")).toEqual([])
    await expect(prisma.commissionRate.delete({ where: donde })).rejects.toMatchObject({ code: "P2025" })
  })

  it("acepta el candado pg_advisory_xact_lock y sigue lanzando ante otra consulta cruda", async () => {
    const sql = (partes: TemplateStringsArray, ...valores: unknown[]) => [partes, ...valores] as const
    await expect(prisma.$executeRaw(...sql`SELECT pg_advisory_xact_lock(${1}, ${2})`)).resolves.toBe(0)
    await expect(prisma.$queryRaw(...sql`SELECT pg_advisory_xact_lock(${1}, ${2})`)).resolves.toEqual([])
    await expect(prisma.$executeRaw(...sql`DELETE FROM liquidaciones`)).rejects.toThrow(/base falsa/)
  })

  it("responde la hora de la base con el reloj del test, y sólo con esa consulta exacta", async () => {
    const sql = (partes: TemplateStringsArray, ...valores: unknown[]) => [partes, ...valores] as const
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-06T15:00:00.000Z"))
    try {
      await expect(prisma.$queryRaw(...sql`SELECT clock_timestamp() AS ahora`)).resolves.toEqual([
        { ahora: new Date("2026-10-06T15:00:00.000Z") },
      ])
    } finally {
      vi.useRealTimers()
    }
    await expect(prisma.$queryRaw(...sql`SELECT now() AS ahora`)).rejects.toThrow(/base falsa/)
  })
})

describe("base falsa: el trigger atencion_servicios_comision_inmutable (#116)", () => {
  const congelada = { commissionPercent: 40, commissionCents: 400, commissionAt: new Date("2026-10-06T15:00:00Z") }
  const periodo = { memberId: "m1", memberName: "Ana", desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") }

  beforeEach(() => {
    base.reiniciar({
      business: [{ id: "n1", name: "Uno", slug: "uno", userId: "u1" }],
      user: [{ id: "u1", name: "Ana", email: "a@test" }],
      businessMember: [
        { id: "m1", businessId: "n1", userId: "u1" },
        { id: "m2", businessId: "n1", userId: "u1" },
      ],
      visit: [{ id: "v1", businessId: "n1", customerName: "María", status: "finalizada", paidAt: new Date(10) }],
      liquidacion: [
        { id: "liq-1", businessId: "n1", ...periodo },
        { id: "liq-2", businessId: "n1", ...periodo, estado: "anulada", anuladaAt: new Date() },
      ],
      visitService: [
        { id: "pendiente", visitId: "v1", serviceName: "Corte", memberId: "m1", professionalName: "Ana", priceCents: 1000 },
        { id: "congelada", visitId: "v1", serviceName: "Corte", memberId: "m1", professionalName: "Ana", priceCents: 1000, ...congelada },
        {
          id: "liquidada",
          visitId: "v1",
          serviceName: "Color",
          memberId: "m1",
          professionalName: "Ana",
          priceCents: 1000,
          ...congelada,
          liquidacionId: "liq-1",
        },
      ],
    })
  })

  const rechazo = /23514/

  it("una comisión congelada no cambia: ni el %, ni el monto, ni cuándo, ni vuelve a pendiente", async () => {
    const cambios = [
      { commissionPercent: 50 },
      { commissionCents: 500 },
      { commissionAt: new Date("2026-10-07T15:00:00Z") },
      { commissionPercent: null, commissionCents: null, commissionAt: null },
    ]
    for (const data of cambios) {
      await expect(prisma.visitService.update({ where: { id: "congelada" }, data })).rejects.toThrow(/ya está congelada/)
    }
    expect(base.buscar("visitService", { id: "congelada" })[0]).toMatchObject(congelada)
  })

  it("escribir lo mismo que ya tiene no es un cambio; otros campos de una congelada sí se pueden tocar", async () => {
    await expect(prisma.visitService.update({ where: { id: "congelada" }, data: { ...congelada } })).resolves.toBeTruthy()
    await expect(prisma.visitService.update({ where: { id: "congelada" }, data: { priceCents: 1200 } })).resolves.toMatchObject({
      priceCents: 1200,
    })
  })

  it("una pendiente se congela, y se congela e incluye en la misma escritura", async () => {
    await expect(
      prisma.visitService.update({ where: { id: "pendiente" }, data: { ...congelada, liquidacionId: "liq-1" } })
    ).resolves.toMatchObject({ commissionPercent: 40, liquidacionId: "liq-1" })
  })

  it("una línea liquidada no cambia de precio ni de profesional", async () => {
    for (const data of [{ priceCents: 2000 }, { memberId: "m2" }, { memberId: null }]) {
      await expect(prisma.visitService.update({ where: { id: "liquidada" }, data })).rejects.toThrow(/corrígela con un ajuste/)
    }
  })

  it("una línea liquidada no pasa a otra liquidación, pero sí se suelta al anular", async () => {
    await expect(prisma.visitService.update({ where: { id: "liquidada" }, data: { liquidacionId: "liq-2" } })).rejects.toThrow(
      /ya está en otra liquidación/
    )
    await expect(prisma.visitService.update({ where: { id: "liquidada" }, data: { liquidacionId: null } })).resolves.toMatchObject({
      liquidacionId: null,
    })
  })

  it("rige también en upsert y en updateMany, y updateMany no escribe ninguna fila si una falla", async () => {
    await expect(
      prisma.visitService.upsert({ where: { id: "congelada" }, create: {}, update: { commissionPercent: 10 } })
    ).rejects.toThrow(rechazo)

    await expect(prisma.visitService.updateMany({ where: { visitId: "v1" }, data: { priceCents: 3000 } })).rejects.toThrow(rechazo)
    expect(base.buscar("visitService").map((linea) => linea.priceCents)).toEqual([1000, 1000, 1000])
  })

  it("un rechazo dentro de una transacción la deshace entera", async () => {
    await expect(
      prisma.$transaction(async (tx: typeof prisma) => {
        await tx.visitService.update({ where: { id: "pendiente" }, data: { priceCents: 1500 } })
        await tx.visitService.update({ where: { id: "liquidada" }, data: { memberId: "m2" } })
      })
    ).rejects.toThrow(rechazo)
    expect(base.buscar("visitService", { id: "pendiente" })[0]).toMatchObject({ priceCents: 1000 })
  })

  it("la excepción del borrado en cascada: sin su atención, la línea liquidada suelta al profesional", async () => {
    await prisma.visit.delete({ where: { id: "v1" } })

    // La base falsa no hace cascadas y revisa todas las FK en cada UPDATE (Postgres
    // sólo las que cambian), así que la línea huérfana la frena la FK a su atención
    // (P2003). Lo que importa acá es que el trigger la dejó pasar: no es un 23514.
    const suelta = prisma.visitService.update({ where: { id: "liquidada" }, data: { memberId: null } })
    await expect(suelta).rejects.toMatchObject({ code: "P2003" })
    await expect(suelta).rejects.not.toThrow(rechazo)
    // Lo congelado sigue sin cambiar, con o sin atención: esa regla no tiene excepción.
    await expect(prisma.visitService.update({ where: { id: "liquidada" }, data: { commissionPercent: 1 } })).rejects.toThrow(
      /ya está congelada/
    )
  })
})

describe("base falsa: lo de la etapa 3", () => {
  beforeEach(() => {
    base.reiniciar({
      business: [
        { id: "n1", name: "Uno", slug: "uno", userId: "u1" },
        { id: "n2", name: "Dos", slug: "dos", userId: "u2" },
      ],
      user: [
        { id: "u1", name: "Ana", email: "a@test" },
        { id: "u2", name: "Otro", email: "o@test" },
      ],
      service: [
        { id: "s1", businessId: "n1", name: "Corte" },
        { id: "s2", businessId: "n2", name: "Corte" },
      ],
      customer: [{ id: "c1", businessId: "n1", name: "María" }],
    })
  })

  const inscripcion = (datos: Record<string, unknown> = {}) => ({
    businessId: "n1",
    serviceId: "s1",
    fecha: "2026-11-02",
    nombre: "María",
    apellido: "González",
    email: "maria@test",
    tokenHash: "hash-1",
    ...datos,
  })

  it("los modelos y columnas nuevos traen los defaults del esquema", async () => {
    const creada = await prisma.inscripcionEnEspera.create({ data: inscripcion() })
    const envio = await prisma.envioAClientes.create({
      data: { businessId: "n1", tipo: "te-toca", canal: "correo", categoria: "promocional", referencia: "r1" },
    })

    expect(creada).toMatchObject({ estado: "activa", avisos: 0, memberId: null, ultimoAvisoAt: null, resueltaAt: null })
    expect(envio).toMatchObject({ customerId: null, esperaId: null })
    expect(base.buscar("business", { id: "n1" })[0]).toMatchObject({
      enlaceResenas: null,
      listaDeEsperaActiva: true,
      avisoDeVueltaActivo: false,
      pideResenas: false,
    })
    expect(base.buscar("customer", { id: "c1" })[0]).toMatchObject({
      correoPromoConsentAt: null,
      correoPromoConsentSource: null,
      correoPromoBajaAt: null,
    })
    expect(base.buscar("service", { id: "s1" })[0]).toMatchObject({ frecuenciaDias: null })
  })

  it("la FK compuesta del servicio impide una inscripción con el servicio de otro negocio (P2003)", async () => {
    await expect(prisma.inscripcionEnEspera.create({ data: inscripcion({ serviceId: "s2" }) })).rejects.toMatchObject({
      code: "P2003",
    })
  })

  it("el candado: un solo envío por (negocio, tipo, referencia); otro negocio no choca", async () => {
    const envio = { businessId: "n1", tipo: "resena", canal: "correo", categoria: "promocional", referencia: "c1:2026-10-27" }
    await prisma.envioAClientes.create({ data: envio })

    await expect(prisma.envioAClientes.create({ data: envio })).rejects.toMatchObject({ code: "P2002" })
    await expect(prisma.envioAClientes.create({ data: { ...envio, businessId: "n2" } })).resolves.toBeTruthy()
  })

  it("el token de salir de la lista es único", async () => {
    await prisma.inscripcionEnEspera.create({ data: inscripcion() })
    await expect(prisma.inscripcionEnEspera.create({ data: inscripcion() })).rejects.toMatchObject({ code: "P2002" })
  })
})
