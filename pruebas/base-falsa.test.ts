import { describe, it, expect, beforeEach, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa, type NombreDeModelo } from "./base-falsa"

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

  it("como Postgres, una lista en NULL no sale ni con has ni con su NOT: sólo con equals: null", async () => {
    // Un cliente de antes de que `tags` tuviera default (#160), o uno escrito a mano con NULL.
    await prisma.customer.create({ data: { id: "c-null", businessId: "n1", name: "Sin etiquetas", tags: null } })

    const conVip = await prisma.customer.findMany({ where: { tags: { has: "VIP" } } })
    const sinVip = await prisma.customer.findMany({ where: { NOT: { tags: { has: "VIP" } } } })
    const enNull = await prisma.customer.findMany({ where: { tags: { equals: null } } })
    const vigentes = await prisma.customer.findMany({
      where: { OR: [{ tags: { equals: null } }, { NOT: { tags: { has: "VIP" } } }] },
    })

    expect(conVip).toEqual([])
    expect(sinVip).toEqual([])
    expect(enNull.map((c) => c.id)).toEqual(["c-null"])
    expect(vigentes.map((c) => c.id)).toEqual(["c-null"])
  })

  it("un cliente creado sin decir sus etiquetas queda con la lista vacía, el default de la base (#160)", async () => {
    await prisma.customer.create({ data: { id: "c-nuevo", businessId: "n1", name: "Sin etiquetas" } })

    const [cliente] = await prisma.customer.findMany({ where: { id: "c-nuevo" } })
    const sinVip = await prisma.customer.findMany({ where: { NOT: { tags: { has: "VIP" } } } })

    expect(cliente.tags).toEqual([])
    expect(sinVip.map((c) => c.id)).toContain("c-nuevo")
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

  it("acepta el candado pg_advisory_xact_lock dentro de una transacción y sigue lanzando ante otra consulta cruda", async () => {
    const sql = (partes: TemplateStringsArray, ...valores: unknown[]) => [partes, ...valores] as const
    await prisma.$transaction(async (tx: typeof base.transaccion) => {
      await expect(tx.$executeRaw(...sql`SELECT pg_advisory_xact_lock(${1}, ${2})`)).resolves.toBe(0)
      await expect(tx.$queryRaw(...sql`SELECT pg_advisory_xact_lock(${1}, ${2})`)).resolves.toEqual([])
      await expect(tx.$executeRaw(...sql`DELETE FROM liquidaciones`)).rejects.toThrow(/base falsa/)
    })
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
    // El momento de la cascada en que la atención ya se borró y la línea todavía
    // no: borrar la atención acá se llevaría la línea (la base falsa hace esa
    // cascada), así que se carga la base en ese estado.
    base.reiniciar({ ...base.volcado(), visit: [] })

    // El trigger la deja pasar, y la FK a su atención no se revisa porque
    // `visitId` no cambia (#134): Postgres sólo revisa las FK que cambian.
    await expect(prisma.visitService.update({ where: { id: "liquidada" }, data: { memberId: null } })).resolves.toMatchObject({
      memberId: null,
    })
    // Lo congelado sigue sin cambiar, con o sin atención: esa regla no tiene excepción.
    await expect(prisma.visitService.update({ where: { id: "liquidada" }, data: { commissionPercent: 1 } })).rejects.toThrow(
      /ya está congelada/
    )
  })
})

describe("base falsa: los triggers atencion_servicios_mismo_negocio y _liquidada_no_se_borra (#134)", () => {
  const periodo = { memberName: "Ana", desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") }
  const linea = { serviceName: "Corte", professionalName: "Ana", priceCents: 1000 }
  // Una línea con producto es de tipo producto (`atencion_servicios_tipo_coherente_check`).
  const deProducto = { ...linea, tipo: "producto" }

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
      producto: [
        { id: "p1", businessId: "n1", name: "Cera" },
        { id: "p2", businessId: "n2", name: "Cera ajena" },
      ],
      visit: [
        { id: "v1", businessId: "n1", customerName: "María", status: "finalizada" },
        { id: "v2", businessId: "n2", customerName: "Otra", status: "finalizada" },
      ],
      liquidacion: [
        { id: "liq-1", businessId: "n1", memberId: "m1", ...periodo },
        { id: "liq-2", businessId: "n2", memberId: "m2", ...periodo },
      ],
      visitService: [
        { id: "suelta", visitId: "v1", memberId: "m1", ...deProducto },
        { id: "liquidada", visitId: "v1", memberId: "m1", ...linea, liquidacionId: "liq-1" },
      ],
    })
  })

  describe("mismo negocio", () => {
    it("al crear: el producto y la liquidación tienen que ser del negocio de la atención", async () => {
      await expect(prisma.visitService.create({ data: { visitId: "v1", ...deProducto, productId: "p2" } })).rejects.toMatchObject({
        code: "P2003",
        message: expect.stringMatching(/producto es de otro negocio/),
      })
      await expect(
        prisma.visitService.createMany({ data: [{ visitId: "v1", ...linea, liquidacionId: "liq-2" }] })
      ).rejects.toThrow(/liquidación es de otro negocio/)
      await expect(
        prisma.visitService.create({ data: { visitId: "v1", ...deProducto, productId: "p1", liquidacionId: "liq-1" } })
      ).resolves.toMatchObject({ productId: "p1" })
      expect(base.buscar("visitService")).toHaveLength(3)
    })

    it("al actualizar: no se apunta a un producto o liquidación ajenos, ni se lleva la línea a una atención ajena", async () => {
      for (const data of [{ productId: "p2" }, { liquidacionId: "liq-2" }]) {
        await expect(prisma.visitService.update({ where: { id: "suelta" }, data })).rejects.toMatchObject({ code: "P2003" })
      }
      await prisma.visitService.update({ where: { id: "suelta" }, data: { productId: "p1" } })
      // Sin profesional, para que lo que frene sea el producto.
      await expect(prisma.visitService.update({ where: { id: "suelta" }, data: { visitId: "v2", memberId: null } })).rejects.toThrow(
        /producto es de otro negocio/
      )
      await expect(
        prisma.visitService.updateMany({ where: { id: "suelta" }, data: { liquidacionId: "liq-2" } })
      ).rejects.toThrow(/liquidación es de otro negocio/)
      expect(base.buscar("visitService", { id: "suelta" })[0]).toMatchObject({ visitId: "v1", memberId: "m1", productId: "p1", liquidacionId: null })
    })

    it("sólo mira si cambia la atención, el producto o la liquidación", async () => {
      // Una línea que ya apunta a algo ajeno (no debería existir) no frena
      // cambiar otro campo: el trigger no la vuelve a revisar.
      base.reiniciar({ ...base.volcado(), visitService: [{ id: "rara", visitId: "v1", ...deProducto, productId: "p2" }] })
      await expect(prisma.visitService.update({ where: { id: "rara" }, data: { serviceName: "Otro" } })).resolves.toBeTruthy()
    })

    it("el profesional también tiene que ser del negocio de la atención (26ff274)", async () => {
      await expect(prisma.visitService.create({ data: { visitId: "v1", ...linea, memberId: "m2" } })).rejects.toMatchObject({
        code: "P2003",
        message: expect.stringMatching(/profesional es de otro negocio/),
      })
      await expect(prisma.visitService.update({ where: { id: "suelta" }, data: { memberId: "m2" } })).rejects.toThrow(
        /profesional es de otro negocio/
      )
      await expect(prisma.visitService.update({ where: { id: "suelta" }, data: { visitId: "v2" } })).rejects.toThrow(
        /profesional es de otro negocio/
      )
      expect(base.buscar("visitService", { id: "suelta" })[0]).toMatchObject({ visitId: "v1", memberId: "m1" })
    })

    it("el NULL de la cascada al borrar a un miembro pasa sin chequeo", async () => {
      await expect(prisma.visitService.update({ where: { id: "suelta" }, data: { memberId: null } })).resolves.toMatchObject({
        memberId: null,
      })
    })

    it("en un UPDATE sin atención (cascada del negocio) deja pasar", async () => {
      base.reiniciar({ ...base.volcado(), visit: [] })
      // Sin atención no hay negocio con qué comparar, y la FK a la atención no
      // se revisa porque `visitId` no cambia (#134). La del producto sí, y existe.
      await expect(prisma.visitService.update({ where: { id: "suelta" }, data: { productId: "p2" } })).resolves.toMatchObject({
        productId: "p2",
      })
      // Un producto que no existe sí lo frena la FK, que cambió.
      await expect(prisma.visitService.update({ where: { id: "suelta" }, data: { productId: "no-existe" } })).rejects.toThrow(
        /FK rota/
      )
    })
  })

  describe("una línea liquidada no se borra", () => {
    it("ni con delete ni con deleteMany; deleteMany no borra ninguna si una falla", async () => {
      await expect(prisma.visitService.delete({ where: { id: "liquidada" } })).rejects.toThrow(/23514.*no se borra/)
      await expect(prisma.visitService.deleteMany({ where: { visitId: "v1" } })).rejects.toThrow(/no se borra/)
      expect(base.buscar("visitService").map((l) => l.id)).toEqual(["suelta", "liquidada"])
    })

    it("suelta (liquidación anulada y liberada) sí se borra", async () => {
      await prisma.visitService.update({ where: { id: "liquidada" }, data: { liquidacionId: null } })
      await expect(prisma.visitService.deleteMany({ where: { visitId: "v1" } })).resolves.toEqual({ count: 2 })
    })

    it("la excepción de la cascada: borrar la atención se lleva sus líneas, también la liquidada", async () => {
      await prisma.visit.delete({ where: { id: "v1" } })
      expect(base.buscar("visitService")).toEqual([])
    })
  })
})

describe("base falsa: las FK NO ACTION y RESTRICT no dejan borrar al padre (#146)", () => {
  const periodo = { memberName: "Ana", desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") }
  const movimiento = { businessId: "n1", memberId: "m1", memberName: "Ana", tipo: "ajuste", montoCents: 500, fecha: new Date("2026-10-15"), motivo: "corrige" }

  beforeEach(() => {
    base.reiniciar({
      business: [{ id: "n1", name: "Uno", slug: "uno", userId: "u1" }],
      user: [
        { id: "u1", name: "Ana", email: "a@test" },
        { id: "u2", name: "Beto", email: "b@test" },
      ],
      businessMember: [
        { id: "m1", businessId: "n1", userId: "u1" },
        { id: "m2", businessId: "n1", userId: "u2" },
      ],
      service: [
        { id: "s1", businessId: "n1", name: "Corte" },
        { id: "s2", businessId: "n1", name: "Color" },
      ],
      commissionRate: [{ id: "cr1", businessId: "n1", memberId: "m1", serviceId: "s1", percent: 40 }],
      visit: [
        { id: "v1", businessId: "n1", customerName: "María", status: "finalizada" },
        { id: "v2", businessId: "n1", customerName: "Beto", status: "finalizada" },
      ],
      liquidacion: [{ id: "liq-1", businessId: "n1", memberId: "m1", ...periodo }],
      movimientoDeLiquidacion: [{ id: "mov-1", ...movimiento, visitId: "v1" }],
    })
  })

  it("una atención con un movimiento de liquidación no se borra (P2003), ni con delete ni con deleteMany", async () => {
    await expect(prisma.visit.delete({ where: { id: "v1" } })).rejects.toMatchObject({
      code: "P2003",
      message: expect.stringMatching(/movimientoDeLiquidacion\.visitId/),
    })
    await expect(prisma.visit.deleteMany({ where: { businessId: "n1" } })).rejects.toMatchObject({ code: "P2003" })
    expect(base.buscar("visit").map((v) => v.id)).toEqual(["v1", "v2"])
    // La que no tiene movimientos sí.
    await expect(prisma.visit.delete({ where: { id: "v2" } })).resolves.toMatchObject({ id: "v2" })
  })

  it("al soltar el movimiento, la atención ya se borra", async () => {
    await prisma.movimientoDeLiquidacion.update({ where: { id: "mov-1" }, data: { visitId: null } })
    await expect(prisma.visit.delete({ where: { id: "v1" } })).resolves.toBeTruthy()
  })

  it("una liquidación referida por una línea, una propina o un movimiento no se borra", async () => {
    const casos: [string, () => Promise<unknown>][] = [
      [
        "visitService",
        () =>
          prisma.visitService.create({
            data: { visitId: "v2", serviceName: "Corte", professionalName: "Ana", priceCents: 1000, liquidacionId: "liq-1" },
          }),
      ],
      [
        "propinaDeAtencion",
        () => prisma.propinaDeAtencion.create({
            data: { businessId: "n1", visitId: "v2", memberId: "m1", professionalName: "Ana", method: "efectivo", amountCents: 100, liquidacionId: "liq-1" },
          }),
      ],
      ["movimientoDeLiquidacion", () => prisma.movimientoDeLiquidacion.create({ data: { ...movimiento, liquidacionId: "liq-1" } })],
    ]
    for (const [hijo, crearHijo] of casos) {
      base.reiniciar({ ...base.volcado(), visitService: [], propinaDeAtencion: [], movimientoDeLiquidacion: [] })
      await crearHijo()
      await expect(prisma.liquidacion.delete({ where: { id: "liq-1" } })).rejects.toThrow(new RegExp(`${hijo}\\.liquidacionId`))
    }
    base.reiniciar({ ...base.volcado(), visitService: [], propinaDeAtencion: [], movimientoDeLiquidacion: [] })
    await expect(prisma.liquidacion.delete({ where: { id: "liq-1" } })).resolves.toBeTruthy()
  })

  it("un miembro con liquidaciones o movimientos no se borra; uno sin ellos sí", async () => {
    await expect(prisma.businessMember.delete({ where: { id: "m1" } })).rejects.toMatchObject({ code: "P2003" })
    await expect(prisma.businessMember.delete({ where: { id: "m2" } })).resolves.toBeTruthy()
    expect(base.buscar("businessMember").map((m) => m.id)).toEqual(["m1"])
  })

  it("un servicio con porcentaje de comisión no se borra (RESTRICT)", async () => {
    await expect(prisma.service.delete({ where: { id: "s1" } })).rejects.toMatchObject({
      code: "P2003",
      message: expect.stringMatching(/commissionRate\.serviceId/),
    })
    await expect(prisma.service.delete({ where: { id: "s2" } })).resolves.toBeTruthy()
  })

  it("si la sentencia falla, se revierte entera, cascadas incluidas", async () => {
    // v1 tiene un movimiento, así que el deleteMany falla al final, cuando la
    // cascada de v2 ya se había llevado su línea y su pago: vuelven.
    base.reiniciar({
      ...base.volcado(),
      visitService: [{ id: "l2", visitId: "v2", serviceName: "Corte", professionalName: "Ana", priceCents: 1000 }],
      visitPayment: [{ id: "p2", visitId: "v2", method: "efectivo", amountCents: 1000 }],
    })
    await expect(prisma.visit.deleteMany({})).rejects.toMatchObject({ code: "P2003" })
    expect(base.buscar("visit")).toHaveLength(2)
    expect(base.buscar("visitService").map((l) => l.id)).toEqual(["l2"])
    expect(base.buscar("visitPayment").map((p) => p.id)).toEqual(["p2"])
  })
})

describe("base falsa: createMany es todo o nada (#148)", () => {
  const linea = { visitId: "v2", serviceName: "Corte", professionalName: "Ana", priceCents: 1000 }

  it("si una fila falla un trigger, no queda ninguna", async () => {
    base.reiniciar({
      ...base.volcado(),
      business: [...base.volcado().business, { id: "n2", name: "Dos", slug: "dos", userId: "u1" }],
      businessMember: [...base.volcado().businessMember, { id: "m2", businessId: "n2", userId: "u1" }],
    })
    await expect(
      prisma.visitService.createMany({ data: [{ ...linea, memberId: "m1" }, { ...linea, memberId: "m2" }] })
    ).rejects.toThrow(/profesional es de otro negocio/)
    expect(base.buscar("visitService", { visitId: "v2" })).toEqual([])
  })

  it("si una fila choca con un único o una FK, tampoco", async () => {
    await expect(
      prisma.visit.createMany({
        data: [
          { businessId: "n1", customerName: "Nueva" },
          { businessId: "n1", customerName: "Repetida", appointmentId: "cita-1" },
        ],
      })
    ).rejects.toMatchObject({ code: "P2002" })
    await expect(
      prisma.visitService.createMany({ data: [linea, { ...linea, visitId: "no-existe" }] })
    ).rejects.toMatchObject({ code: "P2003" })
    expect(base.buscar("visit").map((v) => v.id)).toEqual(["v1", "v2"])
    expect(base.buscar("visitService", { visitId: "v2" })).toEqual([])
  })

  it("si todas pasan, quedan todas", async () => {
    await expect(prisma.visitService.createMany({ data: [linea, linea] })).resolves.toEqual({ count: 2 })
    expect(base.buscar("visitService", { visitId: "v2" })).toHaveLength(2)
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

describe("base falsa: ON DELETE SET NULL y las cascadas que faltaban (#151)", () => {
  const periodo = { memberName: "Beto", desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") }
  const linea = { serviceName: "Corte", professionalName: "Beto", priceCents: 1000 }
  const congelada = { commissionPercent: 40, commissionCents: 400, commissionAt: new Date("2026-10-20") }

  // n1 es de u1 y tiene a m1 (u1) y m2 (u2); n2 es de u3, que vino invitado por n1.
  // m2 es el profesional con todo lo que el borrado de un miembro toca. u4 sólo
  // firmó un cambio de comisión: su borrado no arrastra a nadie más.
  const datos = () => ({
    business: [
      { id: "n1", name: "Uno", slug: "uno", userId: "u1" },
      { id: "n2", name: "Dos", slug: "dos", userId: "u3", invitadoPorId: "n1" },
    ],
    user: [
      { id: "u1", name: "Ana", email: "a@test" },
      { id: "u2", name: "Beto", email: "b@test" },
      { id: "u3", name: "Caro", email: "c@test" },
      { id: "u4", name: "Dani", email: "d@test" },
    ],
    businessMember: [
      { id: "m1", businessId: "n1", userId: "u1" },
      { id: "m2", businessId: "n1", userId: "u2" },
      { id: "m3", businessId: "n2", userId: "u3" },
    ],
    customer: [
      { id: "c1", businessId: "n1", name: "María" },
      { id: "c3", businessId: "n2", name: "Otra" },
    ],
    service: [
      { id: "s1", businessId: "n1", name: "Corte" },
      { id: "s2", businessId: "n1", name: "Color" },
      { id: "s3", businessId: "n2", name: "Corte" },
    ],
    producto: [{ id: "p1", businessId: "n1", name: "Cera" }],
    appointment: [
      { id: "cita-1", businessId: "n1", title: "Corte", startTime: new Date(1), endTime: new Date(2), memberId: "m2", customerId: "c1", serviceId: "s1" },
    ],
    appointmentService: [{ id: "as1", businessId: "n1", appointmentId: "cita-1", serviceId: "s1", serviceName: "Corte", duration: 30, orden: 1 }],
    visit: [{ id: "v1", businessId: "n1", customerName: "María", customerId: "c1", appointmentId: "cita-1", status: "finalizada" }],
    // Una línea lleva servicio o producto, nunca los dos (`atencion_servicios_tipo_coherente_check`).
    visitService: [
      { id: "l1", visitId: "v1", ...linea, memberId: "m2", serviceId: "s1" },
      { id: "lp1", visitId: "v1", ...linea, tipo: "producto", productId: "p1" },
    ],
    commissionChange: [
      { id: "cc1", businessId: "n1", scope: "service", memberId: "m2", memberName: "Beto", serviceId: "s1", productId: "p1", changedById: "u4", changedByName: "Dani", changedByEmail: "d@test" },
    ],
    inscripcionEnEspera: [{ id: "e1", businessId: "n1", serviceId: "s1", memberId: "m2", fecha: "2026-11-02", nombre: "María", apellido: "G", email: "m@test", tokenHash: "t1" }],
    envioAClientes: [{ id: "env1", businessId: "n1", tipo: "te-toca", canal: "correo", categoria: "promocional", referencia: "r1", customerId: "c1", esperaId: "e1" }],
    workSchedule: [
      { id: "ws1", businessId: "n1", memberId: "m2", dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
      { id: "ws2", businessId: "n1", memberId: "m1", dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ],
    timeBlock: [{ id: "tb1", businessId: "n1", memberId: "m2", startTime: new Date(5), endTime: new Date(6) }],
    memberService: [
      { id: "ms1", businessId: "n1", memberId: "m2", serviceId: "s2" },
      { id: "ms2", businessId: "n1", memberId: "m1", serviceId: "s1" },
    ],
    commissionRate: [{ id: "cr1", businessId: "n1", memberId: "m2", serviceId: "s2", percent: 40 }],
  })

  beforeEach(() => base.reiniciar(datos()))

  const fila = (modelo: NombreDeModelo, id: string) => base.buscar(modelo, { id })[0]

  describe("SET NULL: borrar al padre deja al hijo con el campo en null y lo demás igual", () => {
    // [padre, id del padre, [hijo, id del hijo, campo][]], todas las FK con SET NULL de las migraciones.
    const casos: [NombreDeModelo, string, [NombreDeModelo, string, string][]][] = [
      ["user", "u4", [["commissionChange", "cc1", "changedById"]]],
      ["business", "n1", [["business", "n2", "invitadoPorId"]]],
      [
        "businessMember",
        "m2",
        [
          ["appointment", "cita-1", "memberId"],
          ["commissionChange", "cc1", "memberId"],
          ["visitService", "l1", "memberId"],
          ["inscripcionEnEspera", "e1", "memberId"],
        ],
      ],
      [
        "customer",
        "c1",
        [
          ["appointment", "cita-1", "customerId"],
          ["visit", "v1", "customerId"],
          ["envioAClientes", "env1", "customerId"],
        ],
      ],
      [
        "service",
        "s1",
        [
          ["appointment", "cita-1", "serviceId"],
          ["commissionChange", "cc1", "serviceId"],
          ["visitService", "l1", "serviceId"],
          ["appointmentService", "as1", "serviceId"],
        ],
      ],
      ["appointment", "cita-1", [["visit", "v1", "appointmentId"]]],
      [
        "producto",
        "p1",
        [
          ["visitService", "lp1", "productId"],
          ["commissionChange", "cc1", "productId"],
        ],
      ],
      ["inscripcionEnEspera", "e1", [["envioAClientes", "env1", "esperaId"]]],
    ]

    it.each(casos)("borrar %s %s", async (padre, id, hijos) => {
      const antes = hijos.map(([hijo, idHijo]) => fila(hijo, idHijo))
      const delegado = prisma[padre] as unknown as { delete: (args: unknown) => Promise<unknown> }
      await delegado.delete({ where: { id } })

      expect(base.buscar(padre, { id })).toEqual([])
      hijos.forEach(([hijo, idHijo, campo], i) => {
        expect(antes[i][campo]).not.toBeNull()
        expect(fila(hijo, idHijo)).toEqual({ ...antes[i], [campo]: null })
      })
    })

    it("también con deleteMany, en cada hijo de cada fila borrada", async () => {
      base.reiniciar({
        ...datos(),
        visitService: [
          { id: "l1", visitId: "v1", ...linea, serviceId: "s1" },
          { id: "l2", visitId: "v1", ...linea, serviceId: "s2" },
        ],
        commissionRate: [],
        memberService: [],
      })
      await prisma.service.deleteMany({ where: { businessId: "n1" } })
      expect(base.buscar("visitService").map((l) => l.serviceId)).toEqual([null, null])
    })
  })

  describe("cascadas", () => {
    it("borrar un miembro se lleva sus horarios, porcentajes, servicios y bloqueos; los de otro quedan", async () => {
      await prisma.businessMember.delete({ where: { id: "m2" } })
      for (const modelo of ["workSchedule", "commissionRate", "memberService", "timeBlock"] as const) {
        expect(base.buscar(modelo, { memberId: "m2" })).toEqual([])
      }
      expect(base.buscar("workSchedule").map((h) => h.id)).toEqual(["ws2"])
      expect(base.buscar("memberService").map((s) => s.id)).toEqual(["ms2"])
    })

    it("borrar un servicio se lleva lo que el equipo hace de él y su lista de espera, y suelta el envío de esa lista", async () => {
      await prisma.service.delete({ where: { id: "s1" } })
      expect(base.buscar("memberService").map((s) => s.id)).toEqual(["ms1"])
      expect(base.buscar("inscripcionEnEspera")).toEqual([])
      // La cascada de la lista de espera dispara el SET NULL del envío, un nivel más abajo.
      expect(fila("envioAClientes", "env1")).toMatchObject({ esperaId: null, customerId: "c1" })
    })

    it("borrar una cita se lleva sus servicios", async () => {
      await prisma.appointment.delete({ where: { id: "cita-1" } })
      expect(base.buscar("appointmentService")).toEqual([])
    })

    it("borrar un usuario se lleva sus negocios y sus membresías", async () => {
      await prisma.user.delete({ where: { id: "u2" } })
      expect(base.buscar("businessMember").map((m) => m.id)).toEqual(["m1", "m3"])
      expect(base.buscar("user").map((u) => u.id)).toEqual(["u1", "u3", "u4"])

      await prisma.user.delete({ where: { id: "u3" } })
      expect(base.buscar("business").map((n) => n.id)).toEqual(["n1"])
      expect(base.buscar("businessMember").map((m) => m.id)).toEqual(["m1"])
      expect(base.buscar("service").map((s) => s.id)).toEqual(["s1", "s2"])
    })

    it("borrar un negocio entero se lleva todo lo suyo, aun con plata liquidada, y no toca al otro", async () => {
      // Lo más difícil de borrar: una línea liquidada y congelada, su propina y su
      // movimiento, un porcentaje de comisión sobre un servicio (RESTRICT) y un
      // cierre de caja. En Postgres pasa porque cada RESTRICT / NO ACTION se
      // revisa cuando ya corrió la cascada directa del negocio a ese hijo.
      base.reiniciar({
        ...datos(),
        visitService: [
          { id: "l1", visitId: "v1", ...linea, memberId: "m2", serviceId: "s1", ...congelada, liquidacionId: "liq-1" },
          { id: "lp1", visitId: "v1", ...linea, tipo: "producto", memberId: "m2", productId: "p1", ...congelada, liquidacionId: "liq-1" },
        ],
        visitPayment: [{ id: "pago-1", visitId: "v1", method: "efectivo", amountCents: 1000 }],
        liquidacion: [{ id: "liq-1", businessId: "n1", memberId: "m2", ...periodo }],
        propinaDeAtencion: [
          { id: "pr1", businessId: "n1", visitId: "v1", memberId: "m2", professionalName: "Beto", method: "efectivo", amountCents: 100, liquidacionId: "liq-1" },
        ],
        movimientoDeLiquidacion: [
          { id: "mov-1", businessId: "n1", memberId: "m2", memberName: "Beto", tipo: "ajuste", montoCents: 500, fecha: new Date("2026-10-15"), visitId: "v1", liquidacionId: "liq-1" },
        ],
        cierreDeCaja: [{ id: "cierre-1", businessId: "n1", desde: new Date(1), hasta: new Date(2) }],
        franjaDeHoraValle: [{ id: "f1", businessId: "n1", diaSemana: 1, desde: "10:00", hasta: "12:00", porcentaje: 20 }],
      })

      await prisma.business.delete({ where: { id: "n1" } })

      const quedan = base.volcado()
      for (const [modelo, filas] of Object.entries(quedan)) {
        if (modelo === "user") continue
        expect(filas.filter((f) => f.businessId === "n1" || f.visitId === "v1" || f.appointmentId === "cita-1"), modelo).toEqual([])
      }
      expect(quedan.business.map((n) => n.id)).toEqual(["n2"])
      expect(fila("business", "n2")).toMatchObject({ invitadoPorId: null })
      expect(quedan.businessMember.map((m) => m.id)).toEqual(["m3"])
      expect(quedan.service.map((s) => s.id)).toEqual(["s3"])
      expect(quedan.customer.map((c) => c.id)).toEqual(["c3"])
      // El dueño no es parte del negocio: su cuenta queda.
      expect(quedan.user).toHaveLength(4)
    })
  })

  describe("los triggers de atencion_servicios con el SET NULL", () => {
    it("borrar al profesional de una línea liquidada con su atención viva falla (23514) y no deja nada a medias", async () => {
      base.reiniciar({
        ...datos(),
        visitService: [{ id: "l1", visitId: "v1", ...linea, memberId: "m2", ...congelada, liquidacionId: "liq-1" }],
        liquidacion: [{ id: "liq-1", businessId: "n1", memberId: "m1", ...periodo }],
      })
      const antes = base.volcado()

      await expect(prisma.businessMember.delete({ where: { id: "m2" } })).rejects.toThrow(/23514.*corrígela con un ajuste/)
      // El SET NULL de la cita y la cascada de los horarios, que corrieron antes, se revierten.
      expect(base.volcado()).toEqual(antes)
    })

    it("una línea con la comisión congelada pero sin liquidar suelta al profesional y conserva la comisión", async () => {
      base.reiniciar({ ...datos(), visitService: [{ id: "l1", visitId: "v1", ...linea, memberId: "m2", ...congelada }] })
      await prisma.businessMember.delete({ where: { id: "m2" } })
      expect(fila("visitService", "l1")).toMatchObject({ memberId: null, ...congelada })
    })

    it("el producto de una línea liquidada sí se borra: el trigger no mira el producto", async () => {
      base.reiniciar({
        ...datos(),
        visitService: [{ id: "l1", visitId: "v1", ...linea, tipo: "producto", memberId: "m2", productId: "p1", ...congelada, liquidacionId: "liq-1" }],
        liquidacion: [{ id: "liq-1", businessId: "n1", memberId: "m2", ...periodo }],
      })
      await prisma.producto.delete({ where: { id: "p1" } })
      expect(fila("visitService", "l1")).toMatchObject({ productId: null, memberId: "m2", liquidacionId: "liq-1" })
    })

    it("el SET NULL no revisa las otras FK de la fila: una línea que apunta a una liquidación ajena no frena borrar el servicio", async () => {
      // El trigger mismo_negocio sólo mira si cambia el profesional, el producto,
      // la liquidación o la atención, y la base sólo revisa la FK que cambia.
      // (Antes era un producto ajeno en una línea con servicio, una fila que
      // `atencion_servicios_tipo_coherente_check` no deja existir.)
      base.reiniciar({
        ...datos(),
        liquidacion: [{ id: "liq-ajena", businessId: "n2", memberId: "m3", ...periodo }],
        visitService: [{ id: "l1", visitId: "v1", ...linea, serviceId: "s1", liquidacionId: "liq-ajena" }],
      })
      await prisma.service.delete({ where: { id: "s1" } })
      expect(fila("visitService", "l1")).toMatchObject({ serviceId: null, liquidacionId: "liq-ajena" })
    })
  })
})

describe("base falsa: un UPDATE sólo revisa las FK que cambian (#134)", () => {
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
      // Una cita que apunta a un profesional que ya no está: el estado a medio
      // camino de una cascada, o un dato de antes de una FK.
      appointment: [
        { id: "cita-1", businessId: "n1", title: "Corte", startTime: new Date(1), endTime: new Date(2), memberId: "fantasma" },
        { id: "cita-2", businessId: "n1", title: "Color", startTime: new Date(3), endTime: new Date(4), memberId: "m1" },
      ],
      timeBlock: [{ id: "b1", businessId: "n1", memberId: "m1", startTime: new Date(1), endTime: new Date(2) }],
    })
  })

  it("cambiar otro campo no revisa la FK que queda igual", async () => {
    await expect(prisma.appointment.update({ where: { id: "cita-1" }, data: { title: "Corte y barba" } })).resolves.toMatchObject({
      title: "Corte y barba",
    })
  })

  it("la FK que cambia sí se revisa, y si falla la fila queda como estaba", async () => {
    await expect(prisma.appointment.update({ where: { id: "cita-2" }, data: { memberId: "no-existe", title: "X" } })).rejects.toMatchObject({
      code: "P2003",
    })
    expect(base.buscar("appointment", { id: "cita-2" })[0]).toMatchObject({ memberId: "m1", title: "Color" })
  })

  it("en una FK compuesta, cambiar sólo businessId también la revisa", async () => {
    await expect(prisma.timeBlock.update({ where: { id: "b1" }, data: { businessId: "n2" } })).rejects.toThrow(/FK compuesta rota/)
    await expect(prisma.timeBlock.update({ where: { id: "b1" }, data: { motivo: "Vacaciones" } })).resolves.toMatchObject({
      motivo: "Vacaciones",
    })
  })

  it("updateMany es todo o nada: si una fila falla su FK, no cambia ninguna", async () => {
    await expect(
      prisma.appointment.updateMany({ where: { businessId: "n1" }, data: { serviceId: "no-existe" } })
    ).rejects.toMatchObject({ code: "P2003" })
    expect(base.buscar("appointment").map((cita) => cita.serviceId)).toEqual([null, null])
  })
})

describe("base falsa: la clínica dental (etapa 6, 37f9b39)", () => {
  // n1 y n2 son dos clínicas con nombres que coinciden a propósito. c1 tiene
  // de todo: ficha, marcas, una evolución y un plan con una prestación
  // agendada en cita-1, que está en el sillón sl1. c2 es un paciente sin nada.
  const datos = () => ({
    business: [
      { id: "n1", name: "Uno", slug: "uno", userId: "u1", type: "odontologia" },
      { id: "n2", name: "Dos", slug: "dos", userId: "u2", type: "odontologia" },
    ],
    user: [
      { id: "u1", name: "Ana", email: "a@test" },
      { id: "u2", name: "Otro", email: "o@test" },
    ],
    businessMember: [
      { id: "m1", businessId: "n1", userId: "u1" },
      { id: "m2", businessId: "n2", userId: "u2" },
    ],
    customer: [
      { id: "c1", businessId: "n1", name: "María" },
      { id: "c2", businessId: "n1", name: "Beto" },
      { id: "c3", businessId: "n2", name: "Otra" },
    ],
    service: [
      { id: "s1", businessId: "n1", name: "Obturación" },
      { id: "s2", businessId: "n2", name: "Obturación" },
    ],
    sillon: [
      { id: "sl1", businessId: "n1", nombre: "Sillón 1" },
      { id: "sl2", businessId: "n2", nombre: "Sillón 1" },
    ],
    appointment: [
      { id: "cita-1", businessId: "n1", title: "Control", startTime: new Date(1), endTime: new Date(2), customerId: "c1", memberId: "m1", sillonId: "sl1" },
      { id: "cita-2", businessId: "n2", title: "Control", startTime: new Date(1), endTime: new Date(2), customerId: "c3", memberId: "m2" },
    ],
    fichaClinica: [{ id: "f1", businessId: "n1", customerId: "c1", alergias: "Penicilina", actualizadaPor: "Ana" }],
    marcaDental: [
      { id: "mk1", businessId: "n1", customerId: "c1", pieza: 16, cara: "O", tipo: "caries" },
      { id: "mk2", businessId: "n1", customerId: "c1", pieza: 21, tipo: "corona" },
    ],
    evolucion: [
      { id: "ev1", businessId: "n1", customerId: "c1", texto: "Control sin novedad", autorNombre: "Ana", memberId: "m1", appointmentId: "cita-1" },
    ],
    planDeTratamiento: [{ id: "plan-1", businessId: "n1", customerId: "c1", version: 1, creadoPorNombre: "Ana" }],
    etapaDelPlan: [{ id: "et1", businessId: "n1", planId: "plan-1", orden: 1, nombre: "Urgencia" }],
    prestacionDelPlan: [
      {
        id: "pr1",
        businessId: "n1",
        etapaId: "et1",
        orden: 1,
        pieza: 16,
        caras: ["O"],
        serviceId: "s1",
        nombre: "Obturación",
        memberId: "m1",
        profesionalNombre: "Ana",
        estado: "agendada",
        valorCents: 3500000,
        appointmentId: "cita-1",
      },
    ],
  })

  beforeEach(() => base.reiniciar(datos()))

  const fila = (modelo: NombreDeModelo, id: string) => base.buscar(modelo, { id })[0]
  const rechazo = /23514/

  describe("defaults y relaciones", () => {
    it("las columnas nuevas de servicios y citas traen su default, sembradas o creadas", async () => {
      const cita = await prisma.appointment.create({
        data: { businessId: "n1", title: "Limpieza", startTime: new Date(3), endTime: new Date(4) },
      })

      expect(fila("service", "s1")).toMatchObject({ esUrgencia: false })
      expect(fila("appointment", "cita-2")).toMatchObject({ primeraVez: false, sillonId: null })
      expect(cita).toMatchObject({ primeraVez: false, sillonId: null })
    })

    it("los modelos nuevos traen los defaults del esquema", async () => {
      const sillon = await prisma.sillon.create({ data: { businessId: "n1", nombre: "Sillón 2" } })
      const ficha = await prisma.fichaClinica.create({ data: { businessId: "n1", customerId: "c2", actualizadaPor: "Ana" } })
      const marca = await prisma.marcaDental.create({ data: { businessId: "n1", customerId: "c2", pieza: 36, tipo: "ausente" } })
      const evolucion = await prisma.evolucion.create({ data: { businessId: "n1", customerId: "c2", texto: "Primera visita", autorNombre: "Ana" } })
      const plan = await prisma.planDeTratamiento.create({ data: { businessId: "n1", customerId: "c2", version: 1, creadoPorNombre: "Ana" } })
      const etapa = await prisma.etapaDelPlan.create({ data: { businessId: "n1", planId: plan.id, orden: 1, nombre: "Higiene" } })
      const prestacion = await prisma.prestacionDelPlan.create({
        data: { businessId: "n1", etapaId: etapa.id, orden: 1, nombre: "Destartraje", valorCents: 2500000 },
      })

      expect(sillon).toMatchObject({ orden: 0, activo: true })
      expect(ficha).toMatchObject({
        fechaNacimiento: null,
        prevision: null,
        alergias: null,
        antecedentes: null,
        odontogramaActualizadoEn: null,
        odontogramaActualizadoPor: null,
      })
      expect(marca).toMatchObject({ cara: null })
      expect(evolucion).toMatchObject({ autorUserId: null, memberId: null, appointmentId: null })
      expect(plan).toMatchObject({ vigente: true })
      expect(etapa).toMatchObject({ estado: "por-aprobar", presentadaEn: null, aprobadaEn: null, aprobadaPorNombre: null })
      expect(prestacion).toMatchObject({
        pieza: null,
        caras: [],
        serviceId: null,
        memberId: null,
        profesionalNombre: null,
        estado: "por-agendar",
        appointmentId: null,
        realizadaEn: null,
      })
      for (const creado of [sillon, ficha, marca, evolucion, plan, etapa, prestacion]) {
        expect(creado.createdAt).toBeInstanceOf(Date)
      }
    })

    it("lee las relaciones nuevas con include, select, _count y filtros", async () => {
      const conFicha = await prisma.customer.findMany({ orderBy: { id: "asc" }, include: { fichaClinica: { select: { alergias: true } } } })
      const cita = await prisma.appointment.findFirst({ where: { id: "cita-1" }, select: { id: true, sillon: { select: { nombre: true } } } })
      const plan = (await prisma.planDeTratamiento.findFirst({
        where: { customerId: "c1", vigente: true },
        include: { etapas: { orderBy: { orden: "asc" }, include: { prestaciones: { where: { estado: "agendada" } } } } },
      })) as { etapas: { id: string; prestaciones: { id: string; caras: string[] }[] }[] }
      const conteo = await prisma.customer.findFirst({
        where: { id: "c1" },
        select: { _count: { select: { marcasDentales: true, evoluciones: true, planesDeTratamiento: { where: { vigente: false } } } } },
      })
      const conPlanVigente = await prisma.customer.findMany({ where: { planesDeTratamiento: { some: { vigente: true } } } })
      const deCitasConSillon = await prisma.evolucion.findMany({ where: { appointment: { is: { sillon: { is: { nombre: "Sillón 1" } } } } } })

      expect(conFicha.map((c) => [c.id, c.fichaClinica])).toEqual([
        ["c1", { alergias: "Penicilina" }],
        ["c2", null],
        ["c3", null],
      ])
      expect(cita).toEqual({ id: "cita-1", sillon: { nombre: "Sillón 1" } })
      expect(plan.etapas.map((e) => e.id)).toEqual(["et1"])
      expect(plan.etapas[0].prestaciones).toMatchObject([{ id: "pr1", caras: ["O"] }])
      expect(conteo).toEqual({ _count: { marcasDentales: 2, evoluciones: 1, planesDeTratamiento: 0 } })
      expect(conPlanVigente.map((c) => c.id)).toEqual(["c1"])
      expect(deCitasConSillon.map((e) => e.id)).toEqual(["ev1"])
    })

    it("has sobre las caras de una prestación", async () => {
      expect((await prisma.prestacionDelPlan.findMany({ where: { caras: { has: "O" } } })).map((p) => p.id)).toEqual(["pr1"])
      expect(await prisma.prestacionDelPlan.findMany({ where: { caras: { has: "V" } } })).toEqual([])
    })

    it("un create anidado del plan completa planId, etapaId y el businessId de las FK compuestas", async () => {
      await prisma.planDeTratamiento.create({
        data: {
          businessId: "n1",
          customerId: "c2",
          version: 1,
          creadoPorNombre: "Ana",
          etapas: {
            create: [
              {
                orden: 1,
                nombre: "Higiene",
                prestaciones: { create: [{ orden: 1, nombre: "Destartraje", valorCents: 2500000, memberId: "m1" }] },
              },
            ],
          },
        },
      })

      const [etapa] = base.buscar("etapaDelPlan", { nombre: "Higiene" })
      const [prestacion] = base.buscar("prestacionDelPlan", { nombre: "Destartraje" })
      expect(etapa).toMatchObject({ businessId: "n1", planId: base.buscar("planDeTratamiento", { customerId: "c2" })[0].id })
      expect(prestacion).toMatchObject({ businessId: "n1", etapaId: etapa.id, memberId: "m1" })
    })
  })

  describe("FK compuestas: nada cruza de negocio (P2003)", () => {
    const enN1 = { businessId: "n1" }
    const casos: [string, () => Promise<unknown>][] = [
      ["cita en el sillón de otra clínica", () => prisma.appointment.create({ data: { ...enN1, title: "X", startTime: new Date(5), endTime: new Date(6), sillonId: "sl2" } })],
      ["cita movida al sillón de otra clínica", () => prisma.appointment.update({ where: { id: "cita-1" }, data: { sillonId: "sl2" } })],
      ["ficha de un paciente ajeno", () => prisma.fichaClinica.create({ data: { ...enN1, customerId: "c3", actualizadaPor: "Ana" } })],
      ["marca de un paciente ajeno", () => prisma.marcaDental.create({ data: { ...enN1, customerId: "c3", pieza: 11, tipo: "corona" } })],
      ["evolución de un paciente ajeno", () => prisma.evolucion.create({ data: { ...enN1, customerId: "c3", texto: "X", autorNombre: "Ana" } })],
      ["evolución con un odontólogo ajeno", () => prisma.evolucion.create({ data: { ...enN1, customerId: "c1", texto: "X", autorNombre: "Ana", memberId: "m2" } })],
      ["evolución en una cita ajena", () => prisma.evolucion.create({ data: { ...enN1, customerId: "c1", texto: "X", autorNombre: "Ana", appointmentId: "cita-2" } })],
      ["plan de un paciente ajeno", () => prisma.planDeTratamiento.create({ data: { ...enN1, customerId: "c3", version: 1, creadoPorNombre: "Ana" } })],
      ["etapa en el plan de otra clínica", () => prisma.etapaDelPlan.create({ data: { businessId: "n2", planId: "plan-1", orden: 2, nombre: "X" } })],
      ["prestación en la etapa de otra clínica", () => prisma.prestacionDelPlan.create({ data: { businessId: "n2", etapaId: "et1", orden: 2, nombre: "X", valorCents: 0 } })],
      ["prestación con un servicio ajeno", () => prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { serviceId: "s2" } })],
      ["prestación con un odontólogo ajeno", () => prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { memberId: "m2" } })],
      ["prestación agendada en una cita ajena", () => prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { appointmentId: "cita-2" } })],
    ]

    it.each(casos)("%s", async (_caso, escribir) => {
      const antes = base.volcado()
      await expect(escribir()).rejects.toMatchObject({ code: "P2003", message: expect.stringMatching(/FK compuesta rota/) })
      expect(base.volcado()).toEqual(antes)
    })

    it("las FK simples al negocio y a filas que no existen también se revisan", async () => {
      await expect(prisma.sillon.create({ data: { businessId: "no-existe", nombre: "X" } })).rejects.toMatchObject({ code: "P2003" })
      await expect(prisma.appointment.update({ where: { id: "cita-1" }, data: { sillonId: "no-existe" } })).rejects.toThrow(/FK rota/)
      await expect(prisma.appointment.update({ where: { id: "cita-1" }, data: { sillonId: null } })).resolves.toMatchObject({ sillonId: null })
    })
  })

  describe("únicos", () => {
    it("sillón: nombre único por clínica; otra clínica no choca", async () => {
      await expect(prisma.sillon.create({ data: { businessId: "n1", nombre: "Sillón 1" } })).rejects.toMatchObject({ code: "P2002" })
      await expect(prisma.sillon.update({ where: { id: "sl2" }, data: { nombre: "Sillón 1", orden: 3 } })).resolves.toMatchObject({ orden: 3 })
      await expect(prisma.sillon.create({ data: { businessId: "n1", nombre: "Sillón 2" } })).resolves.toBeTruthy()
    })

    it("ficha: una por paciente, y se escribe con upsert por (customerId, businessId)", async () => {
      await expect(prisma.fichaClinica.create({ data: { businessId: "n1", customerId: "c1", actualizadaPor: "Ana" } })).rejects.toMatchObject({
        code: "P2002",
      })
      for (const customerId of ["c1", "c2"]) {
        await prisma.fichaClinica.upsert({
          where: { customerId_businessId: { customerId, businessId: "n1" } },
          create: { businessId: "n1", customerId, alergias: "Látex", actualizadaPor: "Ana" },
          update: { alergias: "Látex", actualizadaPor: "Ana" },
        })
      }
      expect(base.buscar("fichaClinica").map((f) => [f.customerId, f.alergias])).toEqual([
        ["c1", "Látex"],
        ["c2", "Látex"],
      ])
    })

    it("marca de cara: una por (paciente, pieza, cara), con upsert por customerId_pieza_cara", async () => {
      await prisma.marcaDental.upsert({
        where: { customerId_pieza_cara: { customerId: "c1", pieza: 16, cara: "O" } },
        create: { businessId: "n1", customerId: "c1", pieza: 16, cara: "O", tipo: "obturacion" },
        update: { tipo: "obturacion" },
      })
      expect(base.buscar("marcaDental", { pieza: 16 }).map((m) => [m.cara, m.tipo])).toEqual([["O", "obturacion"]])

      const enLaCara = { businessId: "n1", customerId: "c1", pieza: 16, cara: "O", tipo: "sellante" }
      await expect(prisma.marcaDental.create({ data: enLaCara })).rejects.toMatchObject({ code: "P2002" })
      // Otra cara de la misma pieza, aun con el mismo tipo, u otro paciente: no chocan.
      await expect(prisma.marcaDental.create({ data: { ...enLaCara, cara: "M", tipo: "obturacion" } })).resolves.toBeTruthy()
      await expect(prisma.marcaDental.create({ data: { ...enLaCara, customerId: "c2" } })).resolves.toBeTruthy()
    })

    it("marca de pieza (cara null): el mismo tipo no se repite en la pieza (único parcial)", async () => {
      const corona = { businessId: "n1", customerId: "c1", pieza: 21, tipo: "corona" }
      await expect(prisma.marcaDental.create({ data: corona })).rejects.toMatchObject({ code: "P2002" })
      await expect(prisma.marcaDental.createMany({ data: [{ ...corona, tipo: "endodoncia" }, { ...corona, pieza: 22 }] })).resolves.toEqual({
        count: 2,
      })
      await expect(prisma.marcaDental.create({ data: { ...corona, customerId: "c2" } })).resolves.toBeTruthy()
      // Y se borra por (paciente, pieza, tipo).
      await prisma.marcaDental.deleteMany({ where: { customerId: "c1", pieza: 21, tipo: "corona", cara: null } })
      expect(base.buscar("marcaDental", { customerId: "c1", pieza: 21 }).map((m) => m.tipo)).toEqual(["endodoncia"])
    })

    it("plan: un solo vigente por paciente (único parcial) y versiones sin repetir", async () => {
      const plan = { businessId: "n1", customerId: "c1", creadoPorNombre: "Ana" }
      await expect(prisma.planDeTratamiento.create({ data: { ...plan, version: 2 } })).rejects.toMatchObject({
        code: "P2002",
        message: expect.stringMatching(/customerId$/),
      })
      await expect(prisma.planDeTratamiento.create({ data: { ...plan, version: 1, vigente: false } })).rejects.toMatchObject({
        code: "P2002",
        message: expect.stringMatching(/customerId_version/),
      })
      // Un plan no vigente de otra versión, u otro paciente, no chocan.
      await expect(prisma.planDeTratamiento.create({ data: { ...plan, version: 2, vigente: false } })).resolves.toBeTruthy()
      await expect(prisma.planDeTratamiento.create({ data: { ...plan, customerId: "c2", version: 1 } })).resolves.toBeTruthy()
    })

    it("versión nueva: en una transacción, la anterior deja de estar vigente; al revés choca y no queda nada", async () => {
      const nueva = { businessId: "n1", customerId: "c1", version: 2, creadoPorNombre: "Ana" }
      await expect(
        prisma.$transaction(async (tx: typeof prisma) => {
          await tx.planDeTratamiento.create({ data: nueva })
          await tx.planDeTratamiento.update({ where: { id: "plan-1" }, data: { vigente: false } })
        })
      ).rejects.toMatchObject({ code: "P2002" })
      expect(base.buscar("planDeTratamiento").map((p) => [p.version, p.vigente])).toEqual([[1, true]])

      await prisma.$transaction(async (tx: typeof prisma) => {
        await tx.planDeTratamiento.update({ where: { id: "plan-1" }, data: { vigente: false } })
        await tx.planDeTratamiento.create({ data: nueva })
      })
      expect(base.buscar("planDeTratamiento").map((p) => [p.version, p.vigente])).toEqual([
        [1, false],
        [2, true],
      ])
    })
  })

  describe("al borrar", () => {
    it("borrar al paciente se lleva su ficha, marcas, evoluciones y planes con etapas y prestaciones; la cita queda sin paciente", async () => {
      await prisma.customer.delete({ where: { id: "c1" } })

      for (const modelo of ["fichaClinica", "marcaDental", "evolucion", "planDeTratamiento", "etapaDelPlan", "prestacionDelPlan"] as const) {
        expect(base.buscar(modelo), modelo).toEqual([])
      }
      expect(fila("appointment", "cita-1")).toMatchObject({ customerId: null, sillonId: "sl1" })
      expect(base.buscar("customer").map((c) => c.id)).toEqual(["c2", "c3"])
    })

    it("también con deleteMany, y sólo lo del paciente borrado", async () => {
      await prisma.fichaClinica.create({ data: { businessId: "n1", customerId: "c2", actualizadaPor: "Ana" } })
      await prisma.customer.deleteMany({ where: { id: "c1" } })
      expect(base.buscar("fichaClinica").map((f) => f.customerId)).toEqual(["c2"])
    })

    it("borrar el plan se lleva sus etapas y prestaciones; borrar una etapa, sus prestaciones", async () => {
      await prisma.planDeTratamiento.create({
        data: { businessId: "n1", customerId: "c2", version: 1, creadoPorNombre: "Ana", etapas: { create: [{ orden: 1, nombre: "Otra" }] } },
      })
      await prisma.etapaDelPlan.delete({ where: { id: "et1" } })
      expect(base.buscar("prestacionDelPlan")).toEqual([])
      expect(base.buscar("etapaDelPlan").map((e) => e.nombre)).toEqual(["Otra"])

      await prisma.planDeTratamiento.deleteMany({ where: { customerId: "c2" } })
      expect(base.buscar("etapaDelPlan")).toEqual([])
      expect(base.buscar("planDeTratamiento").map((p) => p.id)).toEqual(["plan-1"])
    })

    it("una cita con evolución o prestación no se borra (NO ACTION, P2003), y la base queda como estaba", async () => {
      const antes = base.volcado()
      await expect(prisma.appointment.delete({ where: { id: "cita-1" } })).rejects.toMatchObject({
        code: "P2003",
        message: expect.stringMatching(/evolucion\.appointmentId/),
      })
      await prisma.evolucion.update({ where: { id: "ev1" }, data: { appointmentId: null } })
      await expect(prisma.appointment.deleteMany({ where: { id: "cita-1" } })).rejects.toMatchObject({
        code: "P2003",
        message: expect.stringMatching(/prestacionDelPlan\.appointmentId/),
      })
      expect(base.buscar("appointment").map((c) => c.id)).toEqual(antes.appointment.map((c) => c.id))
    })

    it("desvinculando en la misma transacción, la cita se borra y la evolución queda", async () => {
      await prisma.$transaction(async (tx: typeof prisma) => {
        await tx.prestacionDelPlan.updateMany({ where: { appointmentId: "cita-1" }, data: { estado: "por-agendar", appointmentId: null } })
        await tx.evolucion.updateMany({ where: { appointmentId: "cita-1" }, data: { appointmentId: null } })
        await tx.appointment.delete({ where: { id: "cita-1" } })
      })

      expect(base.buscar("appointment").map((c) => c.id)).toEqual(["cita-2"])
      expect(fila("prestacionDelPlan", "pr1")).toMatchObject({ estado: "por-agendar", appointmentId: null })
      expect(fila("evolucion", "ev1")).toMatchObject({ appointmentId: null, texto: "Control sin novedad" })
    })

    it.each([
      ["businessMember", "m1", /evolucion\.memberId/],
      ["service", "s1", /prestacionDelPlan\.serviceId/],
      ["sillon", "sl1", /appointment\.sillonId/],
    ] as const)("%s referido por algo dental no se borra (NO ACTION, P2003), y lo que corrió antes se revierte", async (modelo, id, mensaje) => {
      const antes = base.volcado()
      const delegado = prisma[modelo] as unknown as { delete: (args: unknown) => Promise<unknown> }
      await expect(delegado.delete({ where: { id } })).rejects.toMatchObject({ code: "P2003", message: expect.stringMatching(mensaje) })
      // El SET NULL de citas_memberId_fkey, que corre antes, también vuelve.
      expect(base.volcado()).toEqual(antes)
    })

    it("un sillón sin citas sí se borra", async () => {
      await expect(prisma.sillon.delete({ where: { id: "sl2" } })).resolves.toMatchObject({ id: "sl2" })
    })

    it("borrar la clínica entera se lleva todo lo dental, evoluciones incluidas, y no toca a la otra", async () => {
      await prisma.evolucion.create({ data: { businessId: "n2", customerId: "c3", texto: "Ajena", autorNombre: "Otro", appointmentId: "cita-2" } })

      await prisma.business.delete({ where: { id: "n1" } })

      const quedan = base.volcado()
      for (const [modelo, filas] of Object.entries(quedan)) {
        expect(filas.filter((f) => f.businessId === "n1"), modelo).toEqual([])
      }
      expect(quedan.sillon.map((s) => s.id)).toEqual(["sl2"])
      expect(quedan.evolucion.map((e) => e.texto)).toEqual(["Ajena"])
      expect(quedan.appointment.map((c) => c.id)).toEqual(["cita-2"])
    })
  })

  describe("los triggers evoluciones_inmutables y evoluciones_no_se_borran", () => {
    it("una evolución no se edita: ni el texto, ni el autor, ni la fecha (23514)", async () => {
      for (const data of [{ texto: "Corregido" }, { autorNombre: "Otra" }, { createdAt: new Date(0) }, { customerId: "c2" }]) {
        await expect(prisma.evolucion.update({ where: { id: "ev1" }, data })).rejects.toThrow(/23514.*no se edita/)
      }
      expect(fila("evolucion", "ev1")).toMatchObject({ texto: "Control sin novedad", autorNombre: "Ana", customerId: "c1" })
    })

    it("sólo se desvinculan la cita y el miembro (a null); apuntarlos a otro no", async () => {
      const otra = await prisma.appointment.create({ data: { businessId: "n1", title: "Otra", startTime: new Date(5), endTime: new Date(6) } })
      await expect(prisma.evolucion.update({ where: { id: "ev1" }, data: { appointmentId: otra.id } })).rejects.toThrow(rechazo)

      await expect(prisma.evolucion.update({ where: { id: "ev1" }, data: { appointmentId: null, memberId: null } })).resolves.toMatchObject({
        appointmentId: null,
        memberId: null,
      })
      // Volver a vincular también es editarla.
      await expect(prisma.evolucion.update({ where: { id: "ev1" }, data: { memberId: "m1" } })).rejects.toThrow(rechazo)
    })

    it("escribir lo mismo que ya tiene no es un cambio", async () => {
      await expect(
        prisma.evolucion.update({ where: { id: "ev1" }, data: { texto: "Control sin novedad", appointmentId: "cita-1" } })
      ).resolves.toBeTruthy()
    })

    it("rige en updateMany y upsert, y updateMany no cambia ninguna si una falla", async () => {
      await prisma.evolucion.create({ data: { businessId: "n1", customerId: "c1", texto: "Otra", autorNombre: "Ana" } })
      await expect(prisma.evolucion.updateMany({ where: { customerId: "c1" }, data: { autorNombre: "X" } })).rejects.toThrow(rechazo)
      expect(base.buscar("evolucion").map((e) => e.autorNombre)).toEqual(["Ana", "Ana"])
      await expect(prisma.evolucion.upsert({ where: { id: "ev1" }, create: {}, update: { texto: "X" } })).rejects.toThrow(rechazo)
    })

    it("una evolución no se borra, ni con delete ni con deleteMany", async () => {
      await expect(prisma.evolucion.delete({ where: { id: "ev1" } })).rejects.toThrow(/23514.*no se borra/)
      await expect(prisma.evolucion.deleteMany({ where: { customerId: "c1" } })).rejects.toThrow(rechazo)
      expect(base.buscar("evolucion").map((e) => e.id)).toEqual(["ev1"])
    })
  })
})

describe("base falsa: las prótesis (etapa 7)", () => {
  // n1 y n2 son dos clínicas con nombres que coinciden a propósito. En n1, la
  // prótesis pt1 de c1 (tratante m1, material mt1, laboratorio lab1) con un
  // evento y un abono cobrado en la atención v1.
  const datos = () => ({
    business: [
      { id: "n1", name: "Uno", slug: "uno", userId: "u1", type: "odontologia" },
      { id: "n2", name: "Dos", slug: "dos", userId: "u2", type: "odontologia" },
    ],
    user: [
      { id: "u1", name: "Ana", email: "a@test" },
      { id: "u2", name: "Otro", email: "o@test" },
    ],
    businessMember: [
      { id: "m1", businessId: "n1", userId: "u1" },
      { id: "m2", businessId: "n2", userId: "u2" },
    ],
    customer: [
      { id: "c1", businessId: "n1", name: "María" },
      { id: "c2", businessId: "n2", name: "María" },
    ],
    laboratorio: [
      { id: "lab1", businessId: "n1", nombre: "Lab Sur" },
      { id: "lab2", businessId: "n2", nombre: "Lab Sur" },
    ],
    materialDeProtesis: [
      { id: "mt1", businessId: "n1", nombre: "Acrílico", unidad: "arcada", tipos: ["removible"], precioCents: 100, pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000, laboratorioPorDefectoId: "lab1" },
      { id: "mt2", businessId: "n2", nombre: "Acrílico", unidad: "arcada", tipos: ["removible"], precioCents: 100, pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 },
    ],
    excepcionDeRepartoDeProtesis: [{ id: "ex1", businessId: "n1", memberId: "m1", materialId: "mt1", pbOdontologo: 5000, pbClinica: 2000, pbTecnico: 3000 }],
    protesis: [
      {
        id: "pt1",
        businessId: "n1",
        customerId: "c1",
        memberId: "m1",
        tratanteNombre: "Ana",
        tipo: "removible",
        arcada: "inferior",
        piezas: [46],
        pilares: [45, 47],
        zonas: ["lingual"],
        materialId: "mt1",
        materialNombre: "Acrílico",
        unidad: "arcada",
        precioUnitarioCents: 100,
        unidades: 1,
        valorCents: 100,
        laboratorioId: "lab1",
        laboratorioNombre: "Lab Sur",
        pbOdontologo: 5000,
        pbClinica: 2000,
        pbTecnico: 3000,
        origenDelReparto: "excepcion",
        creadoPorNombre: "Ana",
      },
    ],
    eventoDeProtesis: [{ id: "evp1", businessId: "n1", protesisId: "pt1", estado: "impresion", autorNombre: "Ana" }],
    visit: [
      { id: "v1", businessId: "n1", customerName: "María", status: "finalizada" },
      { id: "v2", businessId: "n2", customerName: "María" },
    ],
    visitService: [
      { id: "ab1", visitId: "v1", serviceId: null, serviceName: "Abono", memberId: "m1", professionalName: "Ana", priceCents: 50, protesisId: "pt1", odontologoCents: 25, clinicaCents: 10, tecnicoCents: 15 },
    ],
  })

  beforeEach(() => base.reiniciar(datos()))

  const fila = (modelo: NombreDeModelo, id: string) => base.buscar(modelo, { id })[0]
  const rechazo = /23514/

  it("defaults: laboratorio activo sin contacto, material activo sin laboratorio, prótesis en impresión y sin abonos en una línea normal", async () => {
    const lab = await prisma.laboratorio.create({ data: { businessId: "n1", nombre: "Otro" } })
    expect(lab).toMatchObject({ contacto: null, activo: true })
    const material = await prisma.materialDeProtesis.create({
      data: { businessId: "n1", nombre: "Zirconio", unidad: "pieza", tipos: ["corona"], precioCents: 1, pbOdontologo: 1, pbClinica: 1, pbTecnico: 9998 },
    })
    expect(material).toMatchObject({ laboratorioPorDefectoId: null, orden: 0, activo: true })
    expect(fila("protesis", "pt1")).toMatchObject({ estado: "impresion", byOwner: false, entregadaEn: null, anuladaEn: null, entregaEstimada: null })
    expect(fila("visitService", "ab1")).toMatchObject({ pagoAlLaboratorioId: null })
    expect(fila("prestacionDelPlan", "x") ?? null).toBeNull()
  })

  it("las relaciones se leen: abonos, eventos y material de una prótesis", async () => {
    const leida = await prisma.protesis.findFirst({
      where: { id: "pt1" },
      select: { material: { select: { nombre: true } }, eventos: { select: { estado: true } }, abonos: { select: { priceCents: true } } },
    })
    expect(leida).toEqual({ material: { nombre: "Acrílico" }, eventos: [{ estado: "impresion" }], abonos: [{ priceCents: 50 }] })
  })

  describe("FK compuestas: nada cruza de negocio (P2003)", () => {
    const protesisCon = (cambios: Record<string, unknown>) => ({ ...datos().protesis[0], id: undefined, ...cambios })

    it.each([
      ["el paciente", { customerId: "c2" }],
      ["la tratante", { memberId: "m2" }],
      ["el material", { materialId: "mt2" }],
      ["el laboratorio", { laboratorioId: "lab2" }],
    ])("una prótesis con %s de otra clínica", async (_que, cambios) => {
      await expect(prisma.protesis.create({ data: protesisCon(cambios) })).rejects.toMatchObject({ code: "P2003" })
    })

    it("el laboratorio por defecto, la excepción, el evento y el pago", async () => {
      await expect(prisma.materialDeProtesis.update({ where: { id: "mt1" }, data: { laboratorioPorDefectoId: "lab2" } })).rejects.toMatchObject({ code: "P2003" })
      await expect(
        prisma.excepcionDeRepartoDeProtesis.create({ data: { businessId: "n1", memberId: "m2", materialId: "mt1", pbOdontologo: 1, pbClinica: 1, pbTecnico: 9998 } })
      ).rejects.toMatchObject({ code: "P2003" })
      await expect(prisma.eventoDeProtesis.create({ data: { businessId: "n2", protesisId: "pt1", estado: "prueba", autorNombre: "X" } })).rejects.toMatchObject({ code: "P2003" })
      await expect(
        prisma.pagoAlLaboratorio.create({ data: { businessId: "n1", laboratorioId: "lab2", laboratorioNombre: "X", montoCents: 1, medio: "efectivo", pagadoPorId: "u1", pagadoPorNombre: "Ana" } })
      ).rejects.toMatchObject({ code: "P2003" })
    })

    it("un abono con la prótesis o el pago de otro negocio que su atención (el trigger)", async () => {
      await expect(
        prisma.visitService.create({ data: { visitId: "v2", serviceName: "Abono", professionalName: "X", priceCents: 1, protesisId: "pt1" } })
      ).rejects.toMatchObject({ code: "P2003", message: expect.stringMatching(/prótesis es de otro negocio/) })
      const pago = await prisma.pagoAlLaboratorio.create({
        data: { businessId: "n2", laboratorioId: "lab2", laboratorioNombre: "Lab Sur", montoCents: 1, medio: "efectivo", pagadoPorId: "u2", pagadoPorNombre: "Otro" },
      })
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: pago.id } })).rejects.toMatchObject({
        code: "P2003",
        message: expect.stringMatching(/pago al laboratorio es de otro negocio/),
      })
    })

    it("la prestación del plan ligada a una prótesis de otra clínica", async () => {
      await prisma.planDeTratamiento.create({ data: { id: "pl2", businessId: "n2", customerId: "c2", version: 1, creadoPorNombre: "Otro" } })
      await prisma.etapaDelPlan.create({ data: { id: "et2", businessId: "n2", planId: "pl2", orden: 1, nombre: "E" } })
      await expect(
        prisma.prestacionDelPlan.create({ data: { businessId: "n2", etapaId: "et2", orden: 1, nombre: "P", valorCents: 1, protesisId: "pt1" } })
      ).rejects.toMatchObject({ code: "P2003" })
    })
  })

  describe("únicos", () => {
    it("el nombre del laboratorio y del material no se repite en la clínica, sin distinguir mayúsculas; en otra sí", async () => {
      await expect(prisma.laboratorio.create({ data: { businessId: "n1", nombre: "LAB SUR" } })).rejects.toMatchObject({ code: "P2002" })
      await expect(prisma.laboratorio.update({ where: { id: "lab2" }, data: { nombre: "lab sur" } })).resolves.toBeTruthy()
      await expect(
        prisma.materialDeProtesis.create({
          data: { businessId: "n1", nombre: "acrílico", unidad: "arcada", tipos: ["total"], precioCents: 1, pbOdontologo: 1, pbClinica: 1, pbTecnico: 9998 },
        })
      ).rejects.toMatchObject({ code: "P2002" })
    })

    it("una excepción por odontólogo y material", async () => {
      await expect(
        prisma.excepcionDeRepartoDeProtesis.create({ data: { businessId: "n1", memberId: "m1", materialId: "mt1", pbOdontologo: 1, pbClinica: 1, pbTecnico: 9998 } })
      ).rejects.toMatchObject({ code: "P2002" })
    })
  })

  describe("los triggers de la prótesis", () => {
    it("lo copiado no cambia: valor, reparto, piezas, material ni paciente", async () => {
      for (const data of [{ valorCents: 1 }, { pbOdontologo: 4000, pbClinica: 3000 }, { piezas: [36] }, { materialNombre: "X" }, { customerId: "c1", tratanteNombre: "Otra" }]) {
        await expect(prisma.protesis.update({ where: { id: "pt1" }, data })).rejects.toThrow(/23514.*no cambian/)
      }
      expect(fila("protesis", "pt1")).toMatchObject({ valorCents: 100, piezas: [46], pbOdontologo: 5000 })
    })

    it("el estado sólo avanza por los pasos de su tipo (se puede saltar uno), y anulada o entregada ya no cambia, ni su tono", async () => {
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "prueba" } })).rejects.toThrow(/sólo avanza/)
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "enfilado", tono: "A3.5" } })).resolves.toBeTruthy()
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "rodete" } })).rejects.toThrow(/sólo avanza/)
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "entregada", entregadaEn: new Date(5) } })).resolves.toBeTruthy()
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { laboratorioId: null, laboratorioNombre: null } })).rejects.toThrow(/ya no cambia/)
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { tono: "A1" } })).rejects.toThrow(/ya no cambia/)
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "anulada", anuladaEn: new Date(6) } })).rejects.toThrow(rechazo)
    })

    it("la tratante sólo se desvincula (a null)", async () => {
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { memberId: "m1" } })).resolves.toBeTruthy()
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { memberId: null } })).resolves.toMatchObject({ memberId: null })
      await expect(prisma.protesis.update({ where: { id: "pt1" }, data: { memberId: "m1" } })).rejects.toThrow(/tratante no cambia/)
    })

    it("una prótesis no se borra; un evento no se edita ni se borra", async () => {
      await expect(prisma.protesis.delete({ where: { id: "pt1" } })).rejects.toThrow(/no se borra; se anula/)
      await expect(prisma.eventoDeProtesis.update({ where: { id: "evp1" }, data: { autorNombre: "Otra" } })).rejects.toThrow(/no se edita/)
      await expect(prisma.eventoDeProtesis.deleteMany({ where: { protesisId: "pt1" } })).rejects.toThrow(/no se borra/)
    })

    it("el reparto de un abono no cambia; una línea pagada no pasa a otro pago", async () => {
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { priceCents: 60, clinicaCents: 20 } })).rejects.toThrow(/ya está congelado/)
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { professionalName: "Ana Pérez" } })).resolves.toBeTruthy()
      const pago = (id: string) =>
        prisma.pagoAlLaboratorio.create({
          data: { id, businessId: "n1", laboratorioId: "lab1", laboratorioNombre: "Lab Sur", montoCents: 15, medio: "transferencia", pagadoPorId: "u1", pagadoPorNombre: "Ana" },
        })
      await pago("pg1")
      await pago("pg2")
      // Desde la etapa 7b sólo se paga lo liberado: la prótesis, entregada.
      await prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "entregada", entregadaEn: new Date() } })
      await prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: "pg1" } })
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: "pg2" } })).rejects.toThrow(/otro pago/)
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: null } })).resolves.toBeTruthy()
    })

    it("etapa 7b: sólo se le paga al laboratorio de la prótesis, y sólo si está entregada", async () => {
      await prisma.laboratorio.create({ data: { id: "lab3", businessId: "n1", nombre: "Otro lab" } })
      const pago = (id: string, laboratorioId: string) =>
        prisma.pagoAlLaboratorio.create({
          data: { id, businessId: "n1", laboratorioId, laboratorioNombre: "Lab", montoCents: 15, medio: "transferencia", pagadoPorId: "u1", pagadoPorNombre: "Ana" },
        })
      await pago("pg-sur", "lab1")
      await pago("pg-otro", "lab3")
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: "pg-sur" } })).rejects.toThrow(/no está entregada/)
      await prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "entregada", entregadaEn: new Date() } })
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: "pg-otro" } })).rejects.toThrow(/otro laboratorio/)
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { pagoAlLaboratorioId: "pg-sur" } })).resolves.toBeTruthy()
    })
  })

  describe("etapa 7d: el abono, del paciente y de la tratante de su prótesis", () => {
    // v1 pasa a ser de c1 (la paciente de pt1); v3, de otra paciente de n1.
    const conPacientes = () => {
      const d = datos()
      return {
        ...d,
        businessMember: [...d.businessMember, { id: "m3", businessId: "n1", userId: "u2" }],
        customer: [...d.customer, { id: "c3", businessId: "n1", name: "Otra" }],
        visit: [
          { id: "v1", businessId: "n1", customerId: "c1", customerName: "María", status: "finalizada" },
          { id: "v2", businessId: "n2", customerName: "María" },
          { id: "v3", businessId: "n1", customerId: "c3", customerName: "Otra", status: "en-espera" },
        ],
        liquidacion: [liquidacionDe("liq1", "m1")],
      }
    }
    const liquidacionDe = (id: string, memberId: string) => ({
      id,
      businessId: "n1",
      memberId,
      desde: new Date("2026-11-01T00:00:00.000Z"),
      hasta: new Date("2026-11-30T00:00:00.000Z"),
      comisionServiciosCents: 0,
      comisionProductosCents: 0,
      propinasCents: 0,
      ajustesCents: 0,
      brutoCents: 0,
      netoCents: 0,
      cerradaPorNombre: "Ana",
    })
    const abono = (id: string, cambios: Record<string, unknown>) =>
      prisma.visitService.create({
        data: { id, visitId: "v1", serviceName: "Abono", memberId: "m1", professionalName: "Ana", priceCents: 1, protesisId: "pt1", ...cambios },
      })

    beforeEach(() => base.reiniciar(conPacientes()))

    it("al agregarlo: de la misma paciente que la atención y a nombre de la tratante", async () => {
      await expect(abono("ok", {})).resolves.toBeTruthy()
      await expect(abono("otra-paciente", { visitId: "v3" })).rejects.toThrow(/23514.*otro paciente/)
      await expect(abono("otro-miembro", { memberId: "m3" })).rejects.toThrow(/23514.*nombre de la tratante/)
      await expect(abono("la-duena", { memberId: null, byOwner: true })).rejects.toThrow(/nombre de la tratante/)
      await expect(abono("sin-nadie", { memberId: null })).rejects.toThrow(/nombre de la tratante/)
    })

    it("si la tratante es la dueña, el abono va a nombre de la dueña y sin miembro", async () => {
      base.reiniciar({ ...conPacientes(), protesis: [{ ...datos().protesis[0], memberId: null, byOwner: true }], visitService: [] })
      await expect(abono("duena", { memberId: null, byOwner: true })).resolves.toBeTruthy()
      await expect(abono("con-miembro", {})).rejects.toThrow(/nombre de la tratante/)
    })

    it("no cambia de nombre después; desvincular al miembro (a null) sí se puede", async () => {
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { memberId: "m3" } })).rejects.toThrow(/nombre de la tratante/)
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { byOwner: true, memberId: null } })).rejects.toThrow(/nombre de la tratante/)
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { memberId: null } })).resolves.toMatchObject({ memberId: null })
    })

    it("entra a una liquidación sólo con la prótesis entregada y a nombre de la tratante", async () => {
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { liquidacionId: "liq1" } })).rejects.toThrow(/sólo se liquida/)
      await prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "entregada", entregadaEn: new Date() } })
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { liquidacionId: "liq1" } })).resolves.toMatchObject({ liquidacionId: "liq1" })
    })

    it("un abono desvinculado (sin miembro) no se liquida", async () => {
      await prisma.protesis.update({ where: { id: "pt1" }, data: { estado: "entregada", entregadaEn: new Date() } })
      await prisma.visitService.update({ where: { id: "ab1" }, data: { memberId: null } })
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { liquidacionId: "liq1" } })).rejects.toThrow(/sólo se liquida/)
    })

    it("etapa 8: una prótesis anulada no recibe abonos nuevos ni una línea pasa a ella; lo que ya tenía queda", async () => {
      base.reiniciar({
        ...conPacientes(),
        protesis: [
          ...conPacientes().protesis,
          { ...datos().protesis[0], id: "anulada", estado: "anulada", anuladaEn: new Date(1), anuladaPorNombre: "Ana" },
        ],
        visitService: [
          ...conPacientes().visitService,
          { id: "ab-viejo", visitId: "v1", serviceId: null, serviceName: "Abono", memberId: "m1", professionalName: "Ana", priceCents: 5, protesisId: "anulada" },
        ],
      })
      await expect(abono("a-la-anulada", { protesisId: "anulada" })).rejects.toThrow(/23514.*anulada y no recibe abonos/)
      await expect(prisma.visitService.update({ where: { id: "ab1" }, data: { protesisId: "anulada" } })).rejects.toThrow(rechazo)
      await expect(prisma.visitService.update({ where: { id: "ab-viejo" }, data: { priceCents: 4 } })).resolves.toMatchObject({ priceCents: 4 })
      await expect(abono("a-la-viva", {})).resolves.toBeTruthy()
    })

    it("una línea sin prótesis no se mira", async () => {
      await expect(
        prisma.visitService.create({ data: { id: "normal", visitId: "v3", serviceName: "Limpieza", memberId: "m3", professionalName: "X", priceCents: 1 } })
      ).resolves.toBeTruthy()
      await expect(prisma.visitService.update({ where: { id: "normal" }, data: { liquidacionId: "liq1", memberId: "m1" } })).resolves.toBeTruthy()
    })
  })

  describe("al borrar", () => {
    it("un material, un laboratorio o una tratante referidos por una prótesis no se borran (NO ACTION)", async () => {
      const antes = base.volcado()
      await expect(prisma.materialDeProtesis.delete({ where: { id: "mt1" } })).rejects.toMatchObject({ code: "P2003" })
      await expect(prisma.laboratorio.delete({ where: { id: "lab1" } })).rejects.toMatchObject({ code: "P2003" })
      await expect(prisma.businessMember.delete({ where: { id: "m1" } })).rejects.toMatchObject({ code: "P2003" })
      expect(base.volcado()).toEqual(antes)
    })

    it("un paciente con una prótesis abonada no se borra (el abono es historial); sin abonos, se lleva la prótesis y sus eventos", async () => {
      await expect(prisma.customer.delete({ where: { id: "c1" } })).rejects.toMatchObject({ code: "P2003", message: expect.stringMatching(/visitService\.protesisId/) })
      base.reiniciar({ ...datos(), visitService: [] })
      await prisma.customer.delete({ where: { id: "c1" } })
      expect(base.buscar("protesis")).toEqual([])
      expect(base.buscar("eventoDeProtesis")).toEqual([])
    })

    it("etapa 8: un evento se borra en la cascada de su paciente; suelto, con todo vivo, no", async () => {
      base.reiniciar({ ...datos(), visitService: [] })
      await expect(prisma.eventoDeProtesis.delete({ where: { id: "evp1" } })).rejects.toThrow(/no se borra/)
      await prisma.customer.delete({ where: { id: "c1" } })
      expect(base.buscar("eventoDeProtesis")).toEqual([])
    })

    it("borrar la clínica entera se lleva todo, abonos incluidos, y no toca a la otra", async () => {
      await prisma.business.delete({ where: { id: "n1" } })
      const quedan = base.volcado()
      for (const [modelo, filas] of Object.entries(quedan)) {
        expect(filas.filter((f) => f.businessId === "n1"), modelo).toEqual([])
      }
      expect(quedan.visitService).toEqual([])
      expect(quedan.laboratorio.map((l) => l.id)).toEqual(["lab2"])
      expect(quedan.materialDeProtesis.map((m) => m.id)).toEqual(["mt2"])
    })
  })
})

describe("base falsa: transacciones concurrentes (revisión del lote 11)", () => {
  /** Una promesa que el test resuelve a mano, para dejar una transacción abierta a mitad de camino. */
  function pausa() {
    let soltar!: () => void
    const promesa = new Promise<void>((resolver) => (soltar = resolver))
    return { promesa, soltar }
  }

  it("dos transacciones en un Promise.all van de a una: la que se deshace no se lleva lo que escribió la otra", async () => {
    const orden: string[] = []
    const primera = prisma.$transaction(async (tx: typeof prisma) => {
      orden.push("empieza la primera")
      await tx.visit.updateMany({ where: { id: "v1" }, data: { status: "anulada" } })
      await Promise.resolve()
      orden.push("termina la primera")
      throw new Error("se deshace")
    })
    const segunda = prisma.$transaction(async (tx: typeof prisma) => {
      orden.push("empieza la segunda")
      await tx.visit.updateMany({ where: { id: "v2" }, data: { notes: "escrita" } })
      orden.push("termina la segunda")
    })

    const [a, b] = await Promise.allSettled([primera, segunda])
    expect(a.status).toBe("rejected")
    expect(b.status).toBe("fulfilled")
    expect(orden).toEqual(["empieza la primera", "termina la primera", "empieza la segunda", "termina la segunda"])
    expect(base.buscar("visit", { id: "v1" })[0].status).toBe("en-espera")
    expect(base.buscar("visit", { id: "v2" })[0].notes).toBe("escrita")
  })

  it("una escritura fuera de transacción que llega con una abierta espera su turno y no se pierde si la abierta se deshace", async () => {
    const { promesa, soltar } = pausa()
    const abierta = prisma.$transaction(async (tx: typeof prisma) => {
      await tx.visit.updateMany({ where: { id: "v1" }, data: { status: "anulada" } })
      await promesa
      throw new Error("se deshace")
    })
    const suelta = prisma.visit.update({ where: { id: "v2" }, data: { notes: "suelta" } })
    // Todavía no corrió: espera a que la transacción termine.
    await Promise.resolve()
    expect(base.buscar("visit", { id: "v2" })[0].notes).toBeNull()
    soltar()
    await expect(abierta).rejects.toThrow("se deshace")
    await suelta
    expect(base.buscar("visit", { id: "v1" })[0].status).toBe("en-espera")
    expect(base.buscar("visit", { id: "v2" })[0].notes).toBe("suelta")
  })

  it("una transacción anidada lanza en vez de esperar su turno para siempre", async () => {
    await expect(
      prisma.$transaction(async () => {
        await prisma.$transaction(async () => undefined)
      })
    ).rejects.toThrow(/transacción anidada/)
  })

  it("el `enFila` a mano de los tests de carreras sigue funcionando encima de la fila de la base", async () => {
    const original = prisma.$transaction.getMockImplementation()!
    let fila: Promise<unknown> = Promise.resolve()
    const enFila = async (fn: unknown) => {
      const turno = fila.then(() => original(fn))
      fila = turno.catch(() => undefined)
      return turno
    }
    prisma.$transaction.mockImplementationOnce(enFila).mockImplementationOnce(enFila)
    const escribir = (notes: string) =>
      prisma.$transaction(async (tx: typeof prisma) => tx.visit.update({ where: { id: "v2" }, data: { notes } }))
    await Promise.all([escribir("uno"), escribir("dos")])
    expect(base.buscar("visit", { id: "v2" })[0].notes).toBe("dos")
  })
})

describe("base falsa: los candados sólo dentro de una transacción (revisión del lote 11)", () => {
  const sql = (partes: TemplateStringsArray, ...valores: unknown[]) => [partes, ...valores] as const

  it("el tx tiene sus propias consultas crudas, que también quedan en las de prisma", async () => {
    expect(base.transaccion.$queryRaw).not.toBe(prisma.$queryRaw)
    expect(base.transaccion.$executeRaw).not.toBe(prisma.$executeRaw)
    await prisma.$transaction(async (tx: typeof base.transaccion) => {
      expect(tx.$queryRaw).toBe(base.transaccion.$queryRaw)
      await tx.$queryRaw(...sql`SELECT id FROM atenciones WHERE id = ${"v1"} FOR UPDATE`)
      await tx.$executeRaw(...sql`SELECT pg_advisory_xact_lock(hashtext(${"caja:n1"}))`)
    })
    expect(base.transaccion.$queryRaw).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("FOR UPDATE")]), "v1")
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("FOR UPDATE")]), "v1")
    expect(base.transaccion.$executeRaw).toHaveBeenCalledWith(expect.anything(), "caja:n1")
  })

  it("FOR UPDATE, pg_advisory_xact_lock y la marca del sillón fuera de una transacción lanzan", async () => {
    await expect(prisma.$queryRaw(...sql`SELECT id FROM atenciones WHERE id = ${"v1"} FOR UPDATE`)).rejects.toThrow(
      /candado fuera de una transacción/
    )
    await expect(prisma.$executeRaw(...sql`SELECT pg_advisory_xact_lock(hashtext(${"caja:n1"}))`)).rejects.toThrow(
      /candado fuera de una transacción/
    )
    await expect(prisma.$executeRaw(...sql`SELECT pg_advisory_xact_lock_shared(hashtext(${"caja:n1"}))`)).rejects.toThrow(
      /candado fuera de una transacción/
    )
    await expect(
      prisma.$executeRaw(...sql`UPDATE "sillones" SET "orden" = "orden" WHERE "id" = ${"sl1"} AND "businessId" = ${"n1"}`)
    ).rejects.toThrow(/candado fuera de una transacción/)
    // La hora de la base no es un candado: se pide donde sea.
    await expect(prisma.$queryRaw(...sql`SELECT clock_timestamp() AS ahora`)).resolves.toHaveLength(1)
  })

  it("un candado pedido con prisma desde adentro de una transacción también lanza: iría por otra conexión", async () => {
    await expect(
      prisma.$transaction(async () => {
        await prisma.$queryRaw(...sql`SELECT id FROM atenciones WHERE id = ${"v1"} FOR UPDATE`)
      })
    ).rejects.toThrow(/candado fuera de una transacción/)
  })

  it("el tx de una transacción que ya terminó no sirve para un candado", async () => {
    let guardado: typeof base.transaccion | undefined
    await prisma.$transaction(async (tx: typeof base.transaccion) => {
      guardado = tx
    })
    await expect(guardado!.$executeRaw(...sql`SELECT pg_advisory_xact_lock(hashtext(${"caja:n1"}))`)).rejects.toThrow(
      /candado fuera de una transacción/
    )
  })

  it("un reemplazo de prisma.$queryRaw que espera antes de delegar sigue sabiendo que vino del tx", async () => {
    const original = prisma.$queryRaw.getMockImplementation()!
    prisma.$queryRaw.mockImplementationOnce(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      await Promise.resolve()
      return original(partes, ...valores)
    })
    await expect(
      prisma.$transaction((tx: typeof base.transaccion) => tx.$queryRaw(...sql`SELECT id FROM clientes WHERE id = ${"c1"} FOR UPDATE`))
    ).resolves.toEqual([])
  })
})

describe("base falsa: los únicos de cuentas, negocios y membresías (revisión del lote 11)", () => {
  it("usuarios_email_key", async () => {
    await expect(prisma.user.create({ data: { name: "Otra Ana", email: "a@test" } })).rejects.toMatchObject({ code: "P2002" })
    await expect(prisma.user.create({ data: { name: "Bea", email: "b@test" } })).resolves.toMatchObject({ email: "b@test" })
  })

  it("negocios_slug_key, negocios_userId_key y negocios_codigoInvitacion_key", async () => {
    // `codigoInvitacion` no tiene default en el esquema: lo pone quien crea el negocio.
    base.reiniciar({ ...base.volcado(), business: [{ id: "n1", name: "Uno", slug: "uno", userId: "u1", codigoInvitacion: "COD-1" }] })
    await prisma.user.create({ data: { name: "Bea", email: "b@test" } })
    const [bea] = base.buscar("user", { email: "b@test" })
    const nuevo = { name: "Dos", slug: "dos", userId: bea.id, codigoInvitacion: "COD-2" }
    await expect(prisma.business.create({ data: { ...nuevo, slug: "uno" } })).rejects.toMatchObject({ code: "P2002" })
    await expect(prisma.business.create({ data: { ...nuevo, userId: "u1" } })).rejects.toMatchObject({ code: "P2002" })
    await expect(prisma.business.create({ data: { ...nuevo, codigoInvitacion: "COD-1" } })).rejects.toMatchObject({ code: "P2002" })
    await expect(prisma.business.create({ data: nuevo })).resolves.toMatchObject({ slug: "dos" })
  })

  it("miembros_negocio_businessId_userId_key: una membresía por negocio y cuenta", async () => {
    await expect(prisma.businessMember.create({ data: { businessId: "n1", userId: "u1" } })).rejects.toMatchObject({ code: "P2002" })
  })
})

describe("base falsa: los CHECK de las migraciones (revisión del lote 11)", () => {
  const datos = () => ({
    business: [{ id: "n1", name: "Uno", slug: "uno", userId: "u1", type: "odontologia" }],
    user: [{ id: "u1", name: "Ana", email: "a@test" }],
    businessMember: [{ id: "m1", businessId: "n1", userId: "u1" }],
    customer: [{ id: "c1", businessId: "n1", name: "María" }],
    appointment: [{ id: "cita-1", businessId: "n1", title: "Control", startTime: new Date(1), endTime: new Date(2), customerId: "c1" }],
    visit: [{ id: "v1", businessId: "n1", customerName: "María", customerId: "c1" }],
    visitService: [{ id: "l1", visitId: "v1", serviceName: "Corte", professionalName: "Ana", priceCents: 1000, memberId: "m1" }],
    liquidacion: [
      {
        id: "liq-1",
        businessId: "n1",
        memberId: "m1",
        memberName: "Ana",
        periodo: "mensual",
        desde: new Date("2026-10-01"),
        hasta: new Date("2026-10-31"),
        comisionServiciosCents: 1000,
        comisionProductosCents: 0,
        propinasCents: 0,
        adelantosCents: 0,
        ajustesCents: 0,
        brutoCents: 1000,
        totalCents: 1000,
      },
    ],
    planDeTratamiento: [{ id: "plan-1", businessId: "n1", customerId: "c1", version: 1, creadoPorNombre: "Ana" }],
    etapaDelPlan: [{ id: "et1", businessId: "n1", planId: "plan-1", orden: 1, nombre: "Urgencia" }],
    prestacionDelPlan: [{ id: "pr1", businessId: "n1", etapaId: "et1", orden: 1, nombre: "Limpieza", valorCents: 1000 }],
    fichaClinica: [{ id: "f1", businessId: "n1", customerId: "c1", actualizadaPor: "Ana" }],
  })
  beforeEach(() => base.reiniciar(datos()))

  it("lanza 23514 con el nombre de la restricción, como Postgres, y la fila queda como estaba", async () => {
    const intento = prisma.etapaDelPlan.update({ where: { id: "et1" }, data: { estado: "aprobada" } })
    await expect(intento).rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError)
    await expect(intento).rejects.toThrow(/^23514: new row for relation "etapas_del_plan" violates check constraint "etapas_del_plan_aprobada_check"$/)
    expect(base.buscar("etapaDelPlan", { id: "et1" })[0]).toMatchObject({ estado: "por-aprobar", aprobadaEn: null })
  })

  it("estado ↔ fecha: etapa aprobada con cuándo y quién; prestación realizada con realizadaEn; agendada con cita", async () => {
    await expect(
      prisma.etapaDelPlan.update({ where: { id: "et1" }, data: { estado: "aprobada", aprobadaEn: new Date() } })
    ).rejects.toThrow(/etapas_del_plan_aprobada_check/)
    await prisma.etapaDelPlan.update({ where: { id: "et1" }, data: { estado: "aprobada", aprobadaEn: new Date(), aprobadaPorNombre: "Ana" } })

    await expect(prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { estado: "realizada" } })).rejects.toThrow(
      /prestaciones_del_plan_realizada_check/
    )
    await expect(prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { estado: "agendada" } })).rejects.toThrow(
      /prestaciones_del_plan_cita_check/
    )
    await expect(prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { appointmentId: "cita-1" } })).rejects.toThrow(
      /prestaciones_del_plan_cita_check/
    )
    await prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { estado: "agendada", appointmentId: "cita-1" } })
    await prisma.prestacionDelPlan.update({ where: { id: "pr1" }, data: { estado: "realizada", realizadaEn: new Date() } })
  })

  it("la ficha: el odontograma y quién lo actualizó van juntos", async () => {
    await expect(prisma.fichaClinica.update({ where: { id: "f1" }, data: { odontogramaActualizadoEn: new Date() } })).rejects.toThrow(
      /fichas_clinicas_odontograma_check/
    )
  })

  it("la plata: comisión hasta el precio, propina de la dueña o de un miembro, bruto que suma", async () => {
    const congelada = { commissionPercent: 50, commissionAt: new Date() }
    await expect(prisma.visitService.update({ where: { id: "l1" }, data: { ...congelada, commissionCents: 1001 } })).rejects.toThrow(
      /atencion_servicios_commissionCents_check/
    )
    await expect(prisma.visitService.update({ where: { id: "l1" }, data: { commissionPercent: 50 } })).rejects.toThrow(
      /atencion_servicios_comision_congelada_check/
    )
    await prisma.visitService.update({ where: { id: "l1" }, data: { ...congelada, commissionCents: 500 } })

    const propina = { businessId: "n1", visitId: "v1", professionalName: "Ana", method: "efectivo", amountCents: 100 }
    await expect(prisma.propinaDeAtencion.create({ data: { ...propina, byOwner: true, memberId: "m1" } })).rejects.toThrow(
      /atencion_propinas_profesional_check/
    )
    await expect(prisma.propinaDeAtencion.create({ data: { ...propina, byOwner: false } })).rejects.toThrow(
      /atencion_propinas_profesional_check/
    )

    await expect(prisma.liquidacion.update({ where: { id: "liq-1" }, data: { propinasCents: 100 } })).rejects.toThrow(
      /liquidaciones_bruto_check/
    )
    await expect(prisma.liquidacion.update({ where: { id: "liq-1" }, data: { estado: "pagada" } })).rejects.toThrow(
      /liquidaciones_pagada_check/
    )
  })

  it("el abono de una prótesis: el reparto suma lo abonado", async () => {
    await expect(
      prisma.visitService.create({
        data: { visitId: "v1", serviceName: "Abono", professionalName: "Ana", priceCents: 1000, odontologoCents: 500, clinicaCents: 400, tecnicoCents: 0 },
      })
    ).rejects.toThrow(/atencion_servicios_reparto_check/)
  })

  it("la fila virtual: fuera de la fila, sin columnas de la fila", async () => {
    await expect(prisma.visit.update({ where: { id: "v1" }, data: { filaNumero: 3 } })).rejects.toThrow(/atenciones_fila_coherente_check/)
    await expect(prisma.visit.create({ data: { businessId: "n1", customerName: "X", origen: "fila" } })).rejects.toThrow(
      /atenciones_fila_coherente_check/
    )
  })

  it("updateMany no escribe ninguna fila si una no cumple un CHECK", async () => {
    base.reiniciar({ ...datos(), visit: [...datos().visit, { id: "v2", businessId: "n1", customerName: "Beto", origen: "fila", filaTokenHash: "t", filaFecha: "2026-11-10", filaNumero: 1 }] })
    await expect(prisma.visit.updateMany({ where: { businessId: "n1" }, data: { filaNumero: 2 } })).rejects.toThrow(
      /atenciones_fila_coherente_check/
    )
    expect(base.buscar("visit").map((visita) => visita.filaNumero)).toEqual([null, 1])
  })

  it("como en SQL, una columna que el test no sembró es desconocida y no viola el CHECK", async () => {
    // Sembrada sin montos (en la base no podría: son NOT NULL), bruto y total
    // comparan contra NULL: desconocido, que no viola el CHECK.
    base.reiniciar({ ...datos(), liquidacion: [{ id: "liq-1", businessId: "n1", memberId: "m1", estado: "cerrada" }] })
    await expect(prisma.liquidacion.update({ where: { id: "liq-1" }, data: { nota: "ok" } })).resolves.toMatchObject({ nota: "ok" })
  })
})

describe("base falsa: lo que Prisma valida antes de consultar (revisión del lote 11)", () => {
  it("findUnique, update, upsert y delete con el único en undefined lanzan, en vez de traer la primera fila", async () => {
    const sinId = { id: undefined, businessId: "n1" }
    await expect(prisma.visit.findUnique({ where: sinId })).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError)
    await expect(prisma.visit.update({ where: sinId, data: { notes: "x" } })).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError)
    await expect(prisma.visit.upsert({ where: sinId, create: {}, update: { notes: "x" } })).rejects.toBeInstanceOf(
      Prisma.PrismaClientValidationError
    )
    await expect(prisma.visit.delete({ where: sinId })).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError)
    expect(base.buscar("visit").map((visita) => visita.notes)).toEqual([null, null])
  })

  it("con un único de un campo o compuesto, sí", async () => {
    await expect(prisma.visit.findUnique({ where: { appointmentId: "cita-1" } })).resolves.toMatchObject({ id: "v1" })
    await expect(prisma.businessMember.findUnique({ where: { businessId_userId: { businessId: "n1", userId: "u1" } } })).resolves.toMatchObject({
      id: "m1",
    })
    await expect(
      prisma.businessMember.findUnique({ where: { businessId_userId: { businessId: "n1", userId: undefined } } })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError)
  })

  it("un create anidado que falla a mitad no deja ni al padre ni a los hijos que ya entraron", async () => {
    base.reiniciar({
      ...base.volcado(),
      customer: [{ id: "c1", businessId: "n1", name: "María" }],
    })
    const antes = base.volcado()
    await expect(
      prisma.planDeTratamiento.create({
        data: {
          businessId: "n1",
          customerId: "c1",
          version: 1,
          creadoPorNombre: "Ana",
          etapas: { create: [{ orden: 1, nombre: "Bien" }, { orden: 0, nombre: "Mal" }] },
        },
      })
    ).rejects.toThrow(/etapas_del_plan_orden_check/)
    expect(base.volcado()).toEqual(antes)
  })

  it("las opciones que no entiende lanzan en vez de ignorarse", async () => {
    await expect(prisma.visit.count({ where: { businessId: "n1" }, take: 1 } as never)).rejects.toThrow(/la opción take no está soportada/)
    await expect(prisma.visit.findUnique({ where: { id: "v1" }, orderBy: { id: "asc" } } as never)).rejects.toThrow(/orderBy/)
    await expect(prisma.visit.findMany({ include: { services: { distinct: ["serviceName"] } } })).rejects.toThrow(/distinct no está soportado/)
    await expect(prisma.visit.findMany({ include: { services: { cursor: { id: "l1" } } } })).rejects.toThrow(/cursor no está soportado/)
    await expect(prisma.visit.findMany({ take: -1 })).rejects.toThrow(/take negativo/)
  })

  it("omit y skip anidado", async () => {
    const [atencion] = await prisma.visit.findMany({
      where: { id: "v1" },
      omit: { customerName: true, notes: false },
      include: { services: { orderBy: { id: "asc" }, skip: 1, select: { id: true } } },
    })
    expect(atencion).not.toHaveProperty("customerName")
    expect(atencion).toHaveProperty("notes")
    expect(atencion.services).toEqual([{ id: "l2" }])
    await expect(prisma.visit.findMany({ select: { id: true }, omit: { notes: true } } as never)).rejects.toThrow(/select y omit/)
  })

  it("cursor: desde la fila del cursor (incluida; con skip 1, la siguiente), aunque no cumpla el where; sin fila, nada", async () => {
    base.reiniciar({
      ...base.volcado(),
      business: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id, slug: id, userId: `u-${id}`, recibeCorreosDePrueba: id !== "c" })),
    })
    const pagina = (cursor?: string) =>
      prisma.business.findMany({
        where: { recibeCorreosDePrueba: true },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 2,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
    expect(await pagina()).toEqual([{ id: "a" }, { id: "b" }])
    expect(await pagina("b")).toEqual([{ id: "d" }, { id: "e" }])
    // Como Prisma: el cursor que no cumple el where no está en la lista, y `skip: 1` se salta la primera que sí.
    expect(await pagina("c")).toEqual([{ id: "e" }])
    expect(await pagina("e")).toEqual([])
    expect(await pagina("no-existe")).toEqual([])
    await expect(prisma.business.findMany({ cursor: { id: "b" }, orderBy: { id: "desc" }, select: { id: true } })).resolves.toEqual([
      { id: "b" },
      { id: "a" },
    ])
  })

  it("los defaults del esquema que faltaban: medios de pago, datos del negocio, categoría, comisión de la cita", async () => {
    await prisma.user.create({ data: { id: "u9", name: "Bea", email: "b@test" } })
    const negocio = await prisma.business.create({ data: { name: "Dos", slug: "dos", userId: "u9", codigoInvitacion: "X" } })
    expect(negocio).toMatchObject({ mediosDePago: [], address: null, comuna: null, whatsapp: null, instagram: null, color: null, logoUrl: null, coverUrl: null })
    expect(await prisma.service.create({ data: { businessId: "n1", name: "Corte" } })).toMatchObject({ category: null })
    expect(base.buscar("appointment", { id: "cita-1" })[0]).toMatchObject({ commissionPercent: null, commissionAmount: null, commissionAt: null })
    expect(base.buscar("user", { id: "u1" })[0]).toMatchObject({ sesionesValidasDesde: null })
  })
})

describe("base falsa: los textos se ordenan con collation (revisión del lote 11)", () => {
  it("mayúsculas y tildes junto a su letra, en orderBy y en gt/lt", async () => {
    base.reiniciar({
      ...base.volcado(),
      customer: ["Zoe", "ana", "Ángela", "beto"].map((name, i) => ({ id: `c${i}`, businessId: "n1", name })),
    })
    const nombres = await prisma.customer.findMany({ orderBy: { name: "asc" }, select: { name: true } })
    expect(nombres.map((cliente) => cliente.name)).toEqual(["ana", "Ángela", "beto", "Zoe"])
    const despues = await prisma.customer.findMany({ where: { name: { gt: "Ángela" } }, orderBy: { name: "asc" }, select: { name: true } })
    expect(despues.map((cliente) => cliente.name)).toEqual(["beto", "Zoe"])
  })
})
