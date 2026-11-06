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
        { id: "suelta", visitId: "v1", memberId: "m1", ...linea },
        { id: "liquidada", visitId: "v1", memberId: "m1", ...linea, liquidacionId: "liq-1" },
      ],
    })
  })

  describe("mismo negocio", () => {
    it("al crear: el producto y la liquidación tienen que ser del negocio de la atención", async () => {
      await expect(prisma.visitService.create({ data: { visitId: "v1", ...linea, productId: "p2" } })).rejects.toMatchObject({
        code: "P2003",
        message: expect.stringMatching(/producto es de otro negocio/),
      })
      await expect(
        prisma.visitService.createMany({ data: [{ visitId: "v1", ...linea, liquidacionId: "liq-2" }] })
      ).rejects.toThrow(/liquidación es de otro negocio/)
      await expect(
        prisma.visitService.create({ data: { visitId: "v1", ...linea, productId: "p1", liquidacionId: "liq-1" } })
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
      base.reiniciar({ ...base.volcado(), visitService: [{ id: "rara", visitId: "v1", ...linea, productId: "p2" }] })
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
    appointmentService: [{ id: "as1", businessId: "n1", appointmentId: "cita-1", serviceId: "s1", serviceName: "Corte", duration: 30, orden: 0 }],
    visit: [{ id: "v1", businessId: "n1", customerName: "María", customerId: "c1", appointmentId: "cita-1", status: "finalizada" }],
    visitService: [{ id: "l1", visitId: "v1", ...linea, memberId: "m2", serviceId: "s1", productId: "p1" }],
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
          ["visitService", "l1", "productId"],
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
          { id: "l1", visitId: "v1", ...linea, memberId: "m2", serviceId: "s1", productId: "p1", ...congelada, liquidacionId: "liq-1" },
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
        visitService: [{ id: "l1", visitId: "v1", ...linea, memberId: "m2", productId: "p1", ...congelada, liquidacionId: "liq-1" }],
        liquidacion: [{ id: "liq-1", businessId: "n1", memberId: "m2", ...periodo }],
      })
      await prisma.producto.delete({ where: { id: "p1" } })
      expect(fila("visitService", "l1")).toMatchObject({ productId: null, memberId: "m2", liquidacionId: "liq-1" })
    })

    it("el SET NULL no revisa las otras FK de la fila: una línea que apunta a un producto ajeno no frena borrar el servicio", async () => {
      // El trigger mismo_negocio sólo mira si cambia el profesional, el producto,
      // la liquidación o la atención, y la base sólo revisa la FK que cambia.
      base.reiniciar({
        ...datos(),
        producto: [{ id: "p3", businessId: "n2", name: "Ajena" }],
        visitService: [{ id: "l1", visitId: "v1", ...linea, serviceId: "s1", productId: "p3" }],
      })
      await prisma.service.delete({ where: { id: "s1" } })
      expect(fila("visitService", "l1")).toMatchObject({ serviceId: null, productId: "p3" })
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
