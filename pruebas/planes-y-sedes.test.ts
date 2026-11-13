import { describe, it, expect, beforeEach } from "vitest"
import { crearBaseFalsa, type NombreDeModelo } from "./base-falsa"
import { esRechazoPorSedeInactiva } from "@/lib/rechazo-de-sede-inactiva"

/**
 * La base falsa y la etapa 9 (`20261112120000_etapa_9_planes_y_sedes`): el
 * plan del negocio, las sedes, el `sedeId` de horarios, citas y lista de
 * espera con su FK compuesta, los CHECK nuevos y los cuatro triggers
 * (`invitaciones_exigen_plan_equipo`, `negocios_cambio_de_plan`, `sedes_reglas`
 * y `horarios_sedes_sin_pisarse`) con los mismos mensajes que la base real. Y,
 * de `20261112140000_etapa_9_endurecer_planes_y_sedes`, los dos triggers que
 * exigen la sede activa a una hora o inscripción viva (`citas_exigen_sede_activa`
 * y `lista_de_espera_exige_sede_activa`). Cada caso de abajo se probó también
 * contra Postgres 16 con la migración aplicada (README, "Migraciones en
 * producción").
 */

const base = crearBaseFalsa()
const { prisma } = base

const rechazo = /23514/

const sede = (id: string, businessId: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId,
  nombre,
  direccion: "Calle 1",
  comuna: "Ñuñoa",
  ...extra,
})
const franja = (id: string, businessId: string, sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId,
  sedeId,
  dayOfWeek,
  startTime,
  endTime,
  ...extra,
})
const invitacion = (id: string, businessId: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId,
  email: `${id}@test`,
  name: id,
  tokenHash: `hash-${id}`,
  expiresAt: new Date("2030-01-01T00:00:00Z"),
  ...extra,
})
const inscripcion = (id: string, businessId: string, serviceId: string, sedeId: string | null) => ({
  id,
  businessId,
  serviceId,
  sedeId,
  fecha: "2026-11-20",
  nombre: "Ana",
  apellido: "Pérez",
  email: `${id}@test`,
  tokenHash: `hash-${id}`,
})
const cita = (id: string, businessId: string, sedeId: string | null) => ({
  id,
  businessId,
  title: "Corte",
  startTime: new Date(1),
  endTime: new Date(2),
  sedeId,
})

const datos = () => ({
  user: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `u${n}`, name: `U${n}`, email: `u${n}@test` })),
  business: [
    // Independiente con dos sedes activas.
    { id: "n1", name: "Solo", slug: "solo", userId: "u1", plan: "independiente" },
    // Equipo con un integrante.
    { id: "n2", name: "Equipo", slug: "equipo", userId: "u2" },
    // Equipo (el default) con una invitación pendiente.
    { id: "n3", name: "Pendiente", slug: "pendiente", userId: "u3" },
    // Equipo con una invitación vencida que nadie aceptó: sigue pendiente.
    { id: "n4", name: "Vencida", slug: "vencida", userId: "u4" },
    // Independiente sin sedes, con una invitación ya aceptada (y sin integrantes).
    { id: "n5", name: "Aceptada", slug: "aceptada", userId: "u5", plan: "independiente" },
  ],
  businessMember: [{ id: "m2", businessId: "n2", userId: "u6" }],
  workerInvitation: [
    invitacion("i3", "n3"),
    invitacion("i4", "n4", { expiresAt: new Date("2020-01-01T00:00:00Z") }),
    invitacion("i5", "n5", { acceptedAt: new Date("2026-01-01T00:00:00Z") }),
  ],
  service: [
    { id: "s1", businessId: "n1", name: "Corte" },
    { id: "s5", businessId: "n5", name: "Corte" },
  ],
  sede: [sede("A", "n1", "Centro"), sede("B", "n1", "Providencia")],
})

beforeEach(() => base.reiniciar(datos()))

const fila = (modelo: NombreDeModelo, id: string) => base.buscar(modelo, { id })[0]

describe("base falsa: planes y sedes (etapa 9)", () => {
  describe("defaults y relaciones", () => {
    it("un negocio nuevo sin plan nace Equipo, sembrado o creado; el plan que se da se respeta", async () => {
      const creado = await prisma.business.create({
        data: { name: "Nuevo", slug: "nuevo", userId: "u6", type: "salon", pruebaTerminaEl: new Date(), codigoInvitacion: "c" },
      })
      const independiente = await prisma.business.create({
        data: { name: "Otro", slug: "otro", userId: "u7", type: "salon", pruebaTerminaEl: new Date(), codigoInvitacion: "d", plan: "independiente" },
      })

      expect(fila("business", "n2")).toMatchObject({ plan: "equipo" })
      expect(creado).toMatchObject({ plan: "equipo" })
      expect(independiente).toMatchObject({ plan: "independiente" })
    })

    it("la sede trae los defaults del esquema", async () => {
      const creada = await prisma.sede.create({ data: sede("C", "n1", "Maipú") })

      expect(creada).toMatchObject({ telefono: null, orden: 0, activo: true })
      expect(creada.createdAt).toBeInstanceOf(Date)
      expect(creada.updatedAt).toBeInstanceOf(Date)
    })

    it("horarios, citas e inscripciones traen sedeId en null, sembrados o creados (el código viejo no lo escribe)", async () => {
      base.reiniciar({
        ...datos(),
        workSchedule: [{ id: "h-vieja", businessId: "n1", dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }],
        appointment: [{ id: "c-vieja", businessId: "n1", title: "Corte", startTime: new Date(1), endTime: new Date(2) }],
      })
      const horario = await prisma.workSchedule.create({ data: { businessId: "n1", dayOfWeek: 2, startTime: "9:00", endTime: "18:00" } })
      const nueva = await prisma.appointment.create({ data: { businessId: "n1", title: "Color", startTime: new Date(3), endTime: new Date(4) } })
      const espera = await prisma.inscripcionEnEspera.create({ data: inscripcion("e1", "n1", "s1", null) })

      expect(fila("workSchedule", "h-vieja")).toMatchObject({ sedeId: null })
      expect(fila("appointment", "c-vieja")).toMatchObject({ sedeId: null })
      expect(horario).toMatchObject({ sedeId: null, active: true })
      expect(nueva).toMatchObject({ sedeId: null })
      expect(espera).toMatchObject({ sedeId: null })
    })

    it("lee las relaciones nuevas con include, select, _count y filtros", async () => {
      base.reiniciar({
        ...datos(),
        workSchedule: [franja("f1", "n1", "A", 1, "09:00", "13:00"), franja("f2", "n1", "B", 1, "13:00", "17:00"), franja("g1", "n1", null, 1, "09:00", "18:00")],
        appointment: [cita("c1", "n1", "A"), cita("c2", "n1", null)],
      })

      const negocio = await prisma.business.findFirst({
        where: { id: "n1" },
        select: { id: true, sedes: { orderBy: { nombre: "asc" }, select: { id: true } }, _count: { select: { sedes: true } } },
      })
      const conHorarios = await prisma.sede.findMany({ orderBy: { id: "asc" }, include: { horarios: { select: { id: true } }, citas: { select: { id: true } } } })
      const deLaSedeA = await prisma.appointment.findMany({ where: { sede: { is: { nombre: "Centro" } } } })
      const franjas = await prisma.workSchedule.findMany({ where: { businessId: "n1", sedeId: "A" } })
      const conSedes = await prisma.business.findMany({ where: { sedes: { some: { activo: true } } } })
      const conInvitaciones = await prisma.business.findMany({ where: { invitations: { some: { acceptedAt: null } } }, orderBy: { id: "asc" } })

      expect(negocio).toEqual({ id: "n1", sedes: [{ id: "A" }, { id: "B" }], _count: { sedes: 2 } })
      expect(conHorarios.map((s) => [s.id, s.horarios, s.citas])).toEqual([
        ["A", [{ id: "f1" }], [{ id: "c1" }]],
        ["B", [{ id: "f2" }], []],
      ])
      expect(deLaSedeA.map((c) => c.id)).toEqual(["c1"])
      expect(franjas.map((f) => f.id)).toEqual(["f1"])
      expect(conSedes.map((n) => n.id)).toEqual(["n1"])
      expect(conInvitaciones.map((n) => n.id)).toEqual(["n3", "n4"])
    })
  })

  describe("CHECK", () => {
    it("negocios_plan_check: sólo independiente o equipo, al crear y al actualizar", async () => {
      const antes = base.volcado()
      await expect(prisma.business.update({ where: { id: "n1" }, data: { plan: "premium" } })).rejects.toThrow(/23514.*negocios_plan_check/)
      await expect(
        prisma.business.create({ data: { name: "X", slug: "x", userId: "u6", type: "salon", pruebaTerminaEl: new Date(), codigoInvitacion: "z", plan: "otro" } })
      ).rejects.toThrow(/23514.*negocios_plan_check/)
      expect(base.volcado()).toEqual(antes)
    })

    const casosDeTexto: [string, Record<string, unknown>][] = [
      ["nombre vacío", { nombre: "" }],
      ["nombre con espacios al borde", { nombre: " Sur" }],
      ["nombre de 41 caracteres", { nombre: "x".repeat(41) }],
      ["dirección vacía", { direccion: "" }],
      ["dirección con espacios al borde", { direccion: "Calle 1 " }],
      ["dirección de 201 caracteres", { direccion: "d".repeat(201) }],
      ["comuna vacía", { comuna: "" }],
      ["comuna de 81 caracteres", { comuna: "c".repeat(81) }],
      ["teléfono sin el +", { telefono: "56912345678" }],
      ["teléfono con espacios", { telefono: "+56 9 1234 5678" }],
      ["teléfono de 7 dígitos", { telefono: "+1234567" }],
      ["teléfono de 16 dígitos", { telefono: "+1234567890123456" }],
      ["orden negativo", { orden: -1 }],
      ["orden de 1000", { orden: 1000 }],
    ]

    it.each(casosDeTexto)("sedes_texto_check rechaza: %s", async (_caso, cambio) => {
      const antes = base.volcado()
      await expect(prisma.sede.create({ data: sede("X", "n5", "Sur", cambio) })).rejects.toThrow(/23514.*sedes_texto_check/)
      await expect(prisma.sede.update({ where: { id: "A" }, data: cambio })).rejects.toThrow(/23514.*sedes_texto_check/)
      expect(base.volcado()).toEqual(antes)
    })

    it("sedes_texto_check acepta los bordes: 40, 200 y 80 caracteres, E.164 de 8 y 15 dígitos, orden 0 y 999", async () => {
      await expect(prisma.sede.create({ data: sede("X1", "n5", "n".repeat(40), { direccion: "d".repeat(200), comuna: "c".repeat(80) }) })).resolves.toBeTruthy()
      await expect(prisma.sede.create({ data: sede("X2", "n5", "Corta", { telefono: "+12345678", orden: 0 }) })).resolves.toBeTruthy()
      await expect(prisma.sede.create({ data: sede("X3", "n5", "Larga", { telefono: "+123456789012345", orden: 999, activo: false }) })).resolves.toBeTruthy()
      await expect(prisma.sede.update({ where: { id: "X3" }, data: { telefono: null } })).resolves.toMatchObject({ telefono: null })
    })

    const casosDeHoras: [string, string, string][] = [
      ["una hora sin el cero inicial", "9:00", "13:00"],
      ["una hora de 24:00", "09:00", "24:00"],
      ["minutos de 60", "09:60", "13:00"],
      ["con segundos", "09:00:00", "13:00"],
      ["inicio igual al fin", "09:00", "09:00"],
      ["inicio después del fin", "13:00", "09:00"],
    ]

    it.each(casosDeHoras)("horarios_laborales_sede_horas_check rechaza la franja de una sede con %s", async (_caso, inicio, fin) => {
      const antes = base.volcado()
      await expect(prisma.workSchedule.create({ data: franja("f1", "n1", "A", 1, inicio, fin) })).rejects.toThrow(/23514.*horarios_laborales_sede_horas_check/)
      expect(base.volcado()).toEqual(antes)
    })

    it("...pero no toca las franjas sin sede: el horario general conserva sus reglas de siempre", async () => {
      await expect(prisma.workSchedule.create({ data: franja("g1", "n1", null, 1, "9:00", "18:00") })).resolves.toBeTruthy()
      await expect(prisma.workSchedule.create({ data: franja("g2", "n1", null, 1, "18:00", "9:00") })).resolves.toBeTruthy()
      // Pasarle una sede a una franja suelta sí la somete al CHECK.
      await expect(prisma.workSchedule.update({ where: { id: "g1" }, data: { sedeId: "A" } })).rejects.toThrow(/23514.*sede_horas_check/)
    })

    it("invitaciones_role_check: admin o worker", async () => {
      await expect(prisma.workerInvitation.create({ data: invitacion("i9", "n2", { role: "dueño" }) })).rejects.toThrow(/23514.*invitaciones_role_check/)
      await expect(prisma.workerInvitation.create({ data: invitacion("i9", "n2", { role: "admin" }) })).resolves.toBeTruthy()
    })
  })

  describe("únicos y FK compuestas: nada cruza de negocio", () => {
    it("el nombre de la sede es único por negocio; otro negocio puede repetirlo", async () => {
      await expect(prisma.sede.create({ data: sede("X", "n1", "Centro") })).rejects.toMatchObject({ code: "P2002" })
      await expect(prisma.sede.update({ where: { id: "B" }, data: { nombre: "Centro" } })).rejects.toMatchObject({ code: "P2002" })
      await expect(prisma.sede.create({ data: sede("X", "n5", "Centro") })).resolves.toBeTruthy()
      // Renombrar la misma sede a su propio nombre no choca consigo misma.
      await expect(prisma.sede.update({ where: { id: "A" }, data: { nombre: "Centro", orden: 2 } })).resolves.toMatchObject({ orden: 2 })
    })

    it("el token de una invitación es único", async () => {
      await expect(prisma.workerInvitation.create({ data: invitacion("i9", "n2", { tokenHash: "hash-i3" }) })).rejects.toMatchObject({ code: "P2002" })
    })

    const enN5 = { businessId: "n5" }
    const casos: [string, () => Promise<unknown>][] = [
      ["franja de un negocio con la sede de otro", () => prisma.workSchedule.create({ data: { ...enN5, dayOfWeek: 1, startTime: "09:00", endTime: "10:00", sedeId: "A" } })],
      ["franja movida a la sede de otro negocio", () => prisma.workSchedule.update({ where: { id: "f1" }, data: { sedeId: "G" } })],
      ["cita en la sede de otro negocio", () => prisma.appointment.create({ data: { ...enN5, title: "X", startTime: new Date(1), endTime: new Date(2), sedeId: "A" } })],
      ["cita movida a la sede de otro negocio", () => prisma.appointment.update({ where: { id: "c1" }, data: { sedeId: "G" } })],
      ["inscripción con la sede de otro negocio", () => prisma.inscripcionEnEspera.create({ data: inscripcion("e1", "n5", "s5", "A") })],
    ]

    it.each(casos)("%s (P2003)", async (_caso, escribir) => {
      base.reiniciar({
        ...datos(),
        sede: [...datos().sede, sede("G", "n5", "Sur")],
        workSchedule: [franja("f1", "n1", "A", 1, "09:00", "10:00")],
        appointment: [cita("c1", "n1", "A")],
      })
      const antes = base.volcado()
      await expect(escribir()).rejects.toMatchObject({ code: "P2003", message: expect.stringMatching(/FK compuesta rota/) })
      expect(base.volcado()).toEqual(antes)
    })

    it("una sede que no existe también se rechaza, y sedeId null es la ausencia de sede", async () => {
      base.reiniciar({ ...datos(), appointment: [cita("c1", "n1", "A")] })
      await expect(prisma.appointment.update({ where: { id: "c1" }, data: { sedeId: "no-existe" } })).rejects.toThrow(/FK rota/)
      await expect(prisma.appointment.update({ where: { id: "c1" }, data: { sedeId: null } })).resolves.toMatchObject({ sedeId: null })
      await expect(prisma.sede.create({ data: sede("X", "no-existe", "Sur") })).rejects.toMatchObject({ code: "P2003" })
    })
  })

  describe("al borrar", () => {
    beforeEach(() =>
      base.reiniciar({
        ...datos(),
        sede: [...datos().sede, sede("G", "n5", "Sur")],
        workSchedule: [franja("fA", "n1", "A", 1, "09:00", "13:00"), franja("fB", "n1", "B", 2, "09:00", "13:00"), franja("fG", "n5", "G", 1, "09:00", "13:00"), franja("gen", "n1", null, 1, "09:00", "18:00")],
        appointment: [cita("cA", "n1", "A"), cita("cB", "n1", null)],
        inscripcionEnEspera: [inscripcion("eA", "n1", "s1", "A"), inscripcion("eB", "n1", "s1", "B"), inscripcion("eG", "n5", "s5", "G")],
      })
    )

    it("una sede con citas no se borra (NO ACTION, P2003), ni con deleteMany, y la base queda como estaba", async () => {
      const antes = base.volcado()
      await expect(prisma.sede.delete({ where: { id: "A" } })).rejects.toMatchObject({ code: "P2003", message: expect.stringMatching(/appointment\.sedeId/) })
      await expect(prisma.sede.deleteMany({ where: { businessId: "n1" } })).rejects.toMatchObject({ code: "P2003" })
      // Lo que la cascada habría borrado antes de llegar a las citas (franjas, inscripciones) vuelve.
      expect(base.volcado()).toEqual(antes)
    })

    it("soltando la sede de la cita, la sede se borra y la cita queda", async () => {
      await prisma.appointment.update({ where: { id: "cA" }, data: { sedeId: null } })
      await prisma.sede.delete({ where: { id: "A" } })

      expect(base.buscar("sede", { businessId: "n1" }).map((s) => s.id)).toEqual(["B"])
      expect(fila("appointment", "cA")).toMatchObject({ sedeId: null })
    })

    it("una sede sin citas se borra y se lleva sus franjas y sus inscripciones; no toca lo de las otras sedes", async () => {
      await prisma.sede.delete({ where: { id: "B" } })

      expect(base.buscar("workSchedule").map((f) => f.id).sort()).toEqual(["fA", "fG", "gen"])
      expect(base.buscar("inscripcionEnEspera").map((e) => e.id).sort()).toEqual(["eA", "eG"])
      expect(base.buscar("sede").map((s) => s.id).sort()).toEqual(["A", "G"])
    })

    it("borrar el negocio entero (con sedes y citas que las apuntan) funciona y no toca al otro", async () => {
      await prisma.business.delete({ where: { id: "n1" } })

      const quedan = base.volcado()
      for (const [modelo, filas] of Object.entries(quedan)) {
        expect(filas.filter((f) => f.businessId === "n1"), modelo).toEqual([])
      }
      expect(quedan.sede.map((s) => s.id)).toEqual(["G"])
      expect(quedan.workSchedule.map((f) => f.id)).toEqual(["fG"])
      expect(quedan.inscripcionEnEspera.map((e) => e.id)).toEqual(["eG"])
    })

    it("borrar el negocio se lleva también sus invitaciones", async () => {
      await prisma.business.delete({ where: { id: "n3" } })
      expect(base.buscar("workerInvitation").map((i) => i.id).sort()).toEqual(["i4", "i5"])
    })
  })

  describe("el trigger invitaciones_exigen_plan_equipo", () => {
    it("un negocio Independiente no crea invitaciones (23514), y la base queda como estaba", async () => {
      const antes = base.volcado()
      await expect(prisma.workerInvitation.create({ data: invitacion("nueva", "n1") })).rejects.toThrow(/23514: invitaciones nueva: sólo el plan Equipo invita/)
      await expect(prisma.workerInvitation.createMany({ data: [invitacion("n-a", "n2"), invitacion("n-b", "n1")] })).rejects.toThrow(rechazo)
      expect(base.volcado()).toEqual(antes)
    })

    it("un negocio Equipo sí", async () => {
      await expect(prisma.workerInvitation.create({ data: invitacion("nueva", "n2") })).resolves.toMatchObject({ businessId: "n2", role: "worker", acceptedAt: null })
    })

    it("un negocio que no existe lo rechaza la FK, no el trigger", async () => {
      await expect(prisma.workerInvitation.create({ data: invitacion("nueva", "no-existe") })).rejects.toMatchObject({ code: "P2003" })
    })

    it("sólo el INSERT pasa por él: reenviar o aceptar una invitación existente no", async () => {
      await expect(prisma.workerInvitation.update({ where: { id: "i3" }, data: { tokenHash: "otro" } })).resolves.toBeTruthy()
      await expect(prisma.workerInvitation.update({ where: { id: "i3" }, data: { acceptedAt: new Date() } })).resolves.toBeTruthy()
    })

    it("dentro de una transacción, el rechazo la deshace entera", async () => {
      const antes = base.volcado()
      await expect(
        prisma.$transaction(async (tx: typeof prisma) => {
          await tx.sede.create({ data: sede("X", "n1", "Maipú") })
          await tx.workerInvitation.create({ data: invitacion("nueva", "n1") })
        })
      ).rejects.toThrow(rechazo)
      expect(base.volcado()).toEqual(antes)
    })
  })

  describe("el trigger negocios_cambio_de_plan", () => {
    const aIndependiente = /23514: negocios n\d: no pasa al plan Independiente con integrantes o invitaciones pendientes/

    it.each([
      ["con integrantes", "n2"],
      ["con una invitación pendiente", "n3"],
      ["con una invitación vencida que nadie aceptó", "n4"],
    ])("Equipo → Independiente %s se rechaza", async (_caso, id) => {
      const antes = base.volcado()
      await expect(prisma.business.update({ where: { id }, data: { plan: "independiente" } })).rejects.toThrow(aIndependiente)
      expect(base.volcado()).toEqual(antes)
    })

    it("Equipo → Independiente pasa sin integrantes ni pendientes (una invitación aceptada no cuenta)", async () => {
      await prisma.business.update({ where: { id: "n5" }, data: { plan: "equipo" } })
      await expect(prisma.business.update({ where: { id: "n5" }, data: { plan: "independiente" } })).resolves.toMatchObject({ plan: "independiente" })
    })

    it("...y una invitación pendiente que se acepta o se borra libera el cambio", async () => {
      await prisma.workerInvitation.update({ where: { id: "i3" }, data: { acceptedAt: new Date() } })
      await expect(prisma.business.update({ where: { id: "n3" }, data: { plan: "independiente" } })).resolves.toMatchObject({ plan: "independiente" })
      await prisma.workerInvitation.delete({ where: { id: "i4" } })
      await expect(prisma.business.update({ where: { id: "n4" }, data: { plan: "independiente" } })).resolves.toMatchObject({ plan: "independiente" })
    })

    it("Independiente → Equipo con sedes activas se rechaza, y pasa con sólo inactivas o ninguna", async () => {
      const antes = base.volcado()
      await expect(prisma.business.update({ where: { id: "n1" }, data: { plan: "equipo" } })).rejects.toThrow(
        /23514: negocios n1: no pasa al plan Equipo con sedes activas; se desactivan antes/
      )
      expect(base.volcado()).toEqual(antes)

      await prisma.sede.updateMany({ where: { businessId: "n1" }, data: { activo: false } })
      await expect(prisma.business.update({ where: { id: "n1" }, data: { plan: "equipo" } })).resolves.toMatchObject({ plan: "equipo" })
      await expect(prisma.business.update({ where: { id: "n5" }, data: { plan: "equipo" } })).resolves.toMatchObject({ plan: "equipo" })
    })

    it("sólo mira cuando el plan cambia: repetirlo, o tocar otra columna, no lo dispara", async () => {
      await expect(prisma.business.update({ where: { id: "n1" }, data: { plan: "independiente", name: "Solo SA" } })).resolves.toMatchObject({ name: "Solo SA" })
      await expect(prisma.business.update({ where: { id: "n2" }, data: { plan: "equipo" } })).resolves.toBeTruthy()
      await expect(prisma.business.update({ where: { id: "n3" }, data: { name: "Otro nombre" } })).resolves.toBeTruthy()
    })

    it("rige en updateMany (todo o nada) y en upsert", async () => {
      const antes = base.volcado()
      // n5 pasaría a Equipo sin problema; n1 tiene sedes activas: la sentencia entera falla y n5 queda como estaba.
      await expect(prisma.business.updateMany({ where: { id: { in: ["n5", "n1"] } }, data: { plan: "equipo" } })).rejects.toThrow(/Equipo con sedes activas/)
      expect(base.volcado()).toEqual(antes)
      await expect(prisma.business.upsert({ where: { id: "n2" }, create: {}, update: { plan: "independiente" } })).rejects.toThrow(aIndependiente)
      expect(base.volcado()).toEqual(antes)
    })
  })

  describe("el trigger sedes_reglas", () => {
    it("un negocio Equipo no crea una sede activa (23514)", async () => {
      const antes = base.volcado()
      await expect(prisma.sede.create({ data: sede("X", "n2", "Centro") })).rejects.toThrow(/23514: sedes X: sólo el plan Independiente tiene sedes/)
      expect(base.volcado()).toEqual(antes)
    })

    it("...puede guardar una inactiva, pero no reactivarla", async () => {
      await prisma.sede.create({ data: sede("X", "n2", "Dormida", { activo: false }) })
      await expect(prisma.sede.update({ where: { id: "X" }, data: { activo: true } })).rejects.toThrow(/23514: sedes X: sólo el plan Independiente/)
      expect(fila("sede", "X")).toMatchObject({ activo: false })
    })

    it("un Independiente tiene hasta 5 sedes activas: la sexta se rechaza", async () => {
      for (const [id, nombre] of [["C", "Ñuñoa"], ["D", "Las Condes"], ["E", "Maipú"]]) {
        await prisma.sede.create({ data: sede(id, "n1", nombre) })
      }
      expect(base.buscar("sede", { businessId: "n1", activo: true })).toHaveLength(5)

      const antes = base.volcado()
      await expect(prisma.sede.create({ data: sede("F", "n1", "Puente Alto") })).rejects.toThrow(/23514: sedes F: un negocio tiene hasta 5 sedes activas/)
      expect(base.volcado()).toEqual(antes)
    })

    it("...las inactivas no cuentan, y reactivar una con 5 activas se rechaza", async () => {
      for (const [id, nombre] of [["C", "Ñuñoa"], ["D", "Las Condes"], ["E", "Maipú"]]) {
        await prisma.sede.create({ data: sede(id, "n1", nombre) })
      }
      await prisma.sede.create({ data: sede("F", "n1", "Puente Alto", { activo: false }) })
      await expect(prisma.sede.update({ where: { id: "F" }, data: { activo: true } })).rejects.toThrow(/23514.*hasta 5 sedes activas/)

      await prisma.sede.update({ where: { id: "E" }, data: { activo: false } })
      await expect(prisma.sede.update({ where: { id: "F" }, data: { activo: true } })).resolves.toMatchObject({ activo: true })
      await expect(prisma.sede.update({ where: { id: "E" }, data: { activo: true } })).rejects.toThrow(/23514.*hasta 5 sedes activas/)
    })

    it("editar o desactivar una sede activa no pasa por él, aunque haya 5", async () => {
      for (const [id, nombre] of [["C", "Ñuñoa"], ["D", "Las Condes"], ["E", "Maipú"]]) {
        await prisma.sede.create({ data: sede(id, "n1", nombre) })
      }
      await expect(prisma.sede.update({ where: { id: "A" }, data: { nombre: "Centro 2", telefono: "+56912345678" } })).resolves.toMatchObject({ nombre: "Centro 2" })
      await expect(prisma.sede.update({ where: { id: "A" }, data: { activo: false } })).resolves.toMatchObject({ activo: false })
    })

    it("el tope es por negocio: otro Independiente tiene sus propias 5", async () => {
      for (const [id, nombre] of [["C", "Ñuñoa"], ["D", "Las Condes"], ["E", "Maipú"]]) {
        await prisma.sede.create({ data: sede(id, "n1", nombre) })
      }
      for (const n of [1, 2, 3, 4, 5]) await prisma.sede.create({ data: sede(`o${n}`, "n5", `Sede ${n}`) })
      expect(base.buscar("sede", { businessId: "n5", activo: true })).toHaveLength(5)
    })

    it("un negocio que no existe lo rechaza la FK, no el trigger", async () => {
      await expect(prisma.sede.create({ data: sede("X", "no-existe", "Sur") })).rejects.toMatchObject({ code: "P2003" })
    })
  })

  describe("el trigger horarios_sedes_sin_pisarse", () => {
    // Lunes (1). La sede A tiene 09:00-13:00 y existe una franja general (sin sede) 09:00-18:00.
    beforeEach(() =>
      base.reiniciar({
        ...datos(),
        sede: [...datos().sede, sede("C", "n1", "Ñuñoa"), sede("G", "n5", "Sur")],
        workSchedule: [franja("fa1", "n1", "A", 1, "09:00", "13:00"), franja("gen", "n1", null, 1, "09:00", "18:00")],
      })
    )

    const crear = (id: string, sedeId: string, dia: number, inicio: string, fin: string, extra: Record<string, unknown> = {}) =>
      prisma.workSchedule.create({ data: franja(id, "n1", sedeId, dia, inicio, fin, extra) })
    const seRechaza = /23514: horarios_laborales \S+: la franja se pisa con la de la sede "Centro" \(09:00 a 13:00\) el mismo día/

    it.each([
      ["tocarse por el final (13:00 a 16:00)", "13:00", "16:00"],
      ["tocarse por el principio (08:00 a 09:00)", "08:00", "09:00"],
      ["quedar del todo después (14:00 a 15:00)", "14:00", "15:00"],
    ])("dos sedes pueden %s", async (_caso, inicio, fin) => {
      await expect(crear("fb1", "B", 1, inicio, fin)).resolves.toBeTruthy()
    })

    it.each([
      ["pisar el final (12:00 a 16:00)", "12:00", "16:00"],
      ["pisar el principio (08:30 a 09:30)", "08:30", "09:30"],
      ["quedar contenida (10:00 a 11:00)", "10:00", "11:00"],
      ["envolverla (07:00 a 20:00)", "07:00", "20:00"],
      ["ser idéntica (09:00 a 13:00)", "09:00", "13:00"],
    ])("dos sedes no pueden %s el mismo día", async (_caso, inicio, fin) => {
      const antes = base.volcado()
      await expect(crear("fb1", "B", 1, inicio, fin)).rejects.toThrow(seRechaza)
      expect(base.volcado()).toEqual(antes)
    })

    it("otro día de la semana no choca", async () => {
      await expect(crear("fb1", "B", 2, "09:00", "13:00")).resolves.toBeTruthy()
    })

    it("la misma sede puede tener dos franjas que se pisan (no es esta regla)", async () => {
      await expect(crear("fa2", "A", 1, "10:00", "12:00")).resolves.toBeTruthy()
    })

    it("una franja sin sede no se ve afectada, ni como la que se escribe ni como la que ya estaba", async () => {
      // Una general nueva sobre la franja de la sede A pasa...
      await expect(prisma.workSchedule.create({ data: franja("gen2", "n1", null, 1, "10:00", "12:00") })).resolves.toBeTruthy()
      // ...y la sede B puede poner una franja sobre lo que cubre la general `gen` (09:00 a 18:00).
      await expect(crear("fb1", "B", 1, "13:00", "17:00")).resolves.toBeTruthy()
    })

    it("otro negocio no se mezcla", async () => {
      await expect(prisma.workSchedule.create({ data: franja("fg1", "n5", "G", 1, "09:00", "13:00") })).resolves.toBeTruthy()
    })

    it("una franja inactiva no choca, pero activarla sí", async () => {
      await crear("fb1", "B", 1, "10:00", "12:00", { active: false })
      await expect(prisma.workSchedule.update({ where: { id: "fb1" }, data: { active: true } })).rejects.toThrow(seRechaza)
      await expect(prisma.workSchedule.update({ where: { id: "fa1" }, data: { active: false } })).resolves.toBeTruthy()
      await expect(prisma.workSchedule.update({ where: { id: "fb1" }, data: { active: true } })).resolves.toBeTruthy()
    })

    it("mover una franja a un choque (horas o día) se rechaza", async () => {
      await crear("fb1", "B", 1, "13:00", "16:00")
      await crear("fb2", "B", 3, "09:00", "10:00")
      const antes = base.volcado()

      await expect(prisma.workSchedule.update({ where: { id: "fb1" }, data: { startTime: "12:00", endTime: "14:00" } })).rejects.toThrow(seRechaza)
      await expect(prisma.workSchedule.update({ where: { id: "fb1" }, data: { startTime: "08:00", endTime: "09:30" } })).rejects.toThrow(seRechaza)
      await expect(prisma.workSchedule.update({ where: { id: "fb2" }, data: { dayOfWeek: 1, startTime: "10:00", endTime: "11:00" } })).rejects.toThrow(seRechaza)
      expect(base.volcado()).toEqual(antes)
    })

    it("mover una franja a otra sede: pasa si no choca (su versión vieja no cuenta) y se rechaza si choca", async () => {
      await crear("fc1", "C", 1, "08:00", "09:00")

      await expect(prisma.workSchedule.update({ where: { id: "fc1" }, data: { sedeId: "B" } })).resolves.toMatchObject({ sedeId: "B" })
      // En B, de 10:00 a 11:00 pisaría a fa1, que es de A.
      await expect(prisma.workSchedule.update({ where: { id: "fc1" }, data: { startTime: "10:00", endTime: "11:00" } })).rejects.toThrow(seRechaza)
      expect(fila("workSchedule", "fc1")).toMatchObject({ sedeId: "B", startTime: "08:00" })
    })

    it("la franja de una sede inactiva no cuenta para las demás, pero tampoco puede pisar a una sede activa", async () => {
      await prisma.sede.update({ where: { id: "B" }, data: { activo: false } })
      // B inactiva: una franja de A o de C sobre lo que tendría B no choca con nada...
      await expect(crear("fb1", "B", 1, "13:00", "16:00")).resolves.toBeTruthy()
      await expect(crear("fc1", "C", 1, "14:00", "15:00")).resolves.toBeTruthy()
      // ...pero una franja nueva de B (inactiva) que pisa a la de A activa se rechaza igual.
      await expect(crear("fb2", "B", 1, "12:00", "14:00")).rejects.toThrow(seRechaza)
    })

    it("reactivar una sede revalida sus franjas: si se pisan con las de otra sede activa, no se reactiva", async () => {
      await crear("fb1", "B", 1, "13:00", "16:00")
      await prisma.sede.update({ where: { id: "B" }, data: { activo: false } })
      // Mientras B está inactiva, C se instala sobre lo que cubre B.
      await crear("fc1", "C", 1, "13:30", "15:00")

      const antes = base.volcado()
      await expect(prisma.sede.update({ where: { id: "B" }, data: { activo: true } })).rejects.toThrow(
        /23514: horarios_laborales fb1: la franja se pisa con la de la sede "Ñuñoa" \(13:30 a 15:00\) el mismo día/
      )
      expect(base.volcado()).toEqual(antes)
      expect(fila("sede", "B")).toMatchObject({ activo: false })

      // Se arregla quitando la que choca, y entonces se reactiva.
      await prisma.workSchedule.delete({ where: { id: "fc1" } })
      await expect(prisma.sede.update({ where: { id: "B" }, data: { activo: true } })).resolves.toMatchObject({ activo: true })
    })

    it("al reactivar, las franjas inactivas de la sede no se revalidan", async () => {
      await crear("fb1", "B", 1, "10:00", "12:00", { active: false })
      await prisma.sede.update({ where: { id: "B" }, data: { activo: false } })
      await expect(prisma.sede.update({ where: { id: "B" }, data: { activo: true } })).resolves.toMatchObject({ activo: true })
      expect(fila("workSchedule", "fb1")).toMatchObject({ active: false })
    })
  })

  describe("los triggers citas_exigen_sede_activa y lista_de_espera_exige_sede_activa", () => {
    const DIA = 24 * 60 * 60 * 1000
    /** Una hora que empieza dentro de `dias` días (negativo: ya pasó). */
    const en = (dias: number) => new Date(Date.now() + dias * DIA)
    const hora = (id: string, sedeId: string | null, dias: number, extra: Record<string, unknown> = {}) => ({
      id,
      businessId: "n1",
      title: "Corte",
      startTime: en(dias),
      endTime: new Date(en(dias).getTime() + 3600_000),
      sedeId,
      ...extra,
    })
    const seRechazaLaCita = /23514: citas \S+: la sede B no está activa/
    const seRechazaLaInscripcion = /23514: lista_de_espera \S+: la sede B no está activa/

    /** B es la sede que la dueña desactivó. Lo sembrado entra sin pasar por los triggers (como lo que ya estaba en la base). */
    const conBDesactivada = async (sembrado: Record<string, unknown>[] = [], inscripciones: Record<string, unknown>[] = []) => {
      base.reiniciar({ ...datos(), appointment: sembrado, inscripcionEnEspera: inscripciones })
      await prisma.sede.update({ where: { id: "B" }, data: { activo: false } })
    }

    describe("citas: al crear", () => {
      beforeEach(() => conBDesactivada())

      it("una hora viva en una sede ACTIVA se crea", async () => {
        await expect(prisma.appointment.create({ data: hora("c1", "A", 2) })).resolves.toMatchObject({ sedeId: "A", status: "pendiente" })
        await expect(prisma.appointment.create({ data: hora("c2", "A", 2, { status: "confirmada" }) })).resolves.toBeTruthy()
      })

      it.each([["pendiente"], ["confirmada"]])("una hora %s por delante en una sede INACTIVA se rechaza y no deja nada", async (status) => {
        const antes = base.volcado()
        await expect(prisma.appointment.create({ data: hora("c1", "B", 2, { status }) })).rejects.toThrow(seRechazaLaCita)
        expect(base.volcado()).toEqual(antes)
      })

      it("el rechazo es el que reconoce la aplicación para responder 409", async () => {
        const error = await prisma.appointment.create({ data: hora("c1", "B", 2) }).catch((falla: unknown) => falla)
        expect(esRechazoPorSedeInactiva(error)).toBe(true)
      })

      it.each([
        ["pasada (pendiente, ya empezó)", { dias: -1, status: "pendiente" }],
        ["cancelada", { dias: 2, status: "cancelada" }],
        ["completada", { dias: 2, status: "completada" }],
        ["de \"no vino\"", { dias: 2, status: "no-asistio" }],
        ["en progreso", { dias: 2, status: "en-progreso" }],
      ])("una hora %s en una sede inactiva se crea: no cuenta como hora por delante", async (_caso, { dias, status }) => {
        await expect(prisma.appointment.create({ data: hora("c1", "B", dias, { status }) })).resolves.toMatchObject({ sedeId: "B", status })
      })

      it("una hora viva SIN sede se crea (todo negocio sin sedes pasa por acá sin que el trigger mire nada)", async () => {
        await expect(prisma.appointment.create({ data: hora("c1", null, 2) })).resolves.toMatchObject({ sedeId: null })
      })

      it("con la sede de OTRO negocio no es el trigger quien rechaza, es la FK compuesta (P2003)", async () => {
        const error = await prisma.appointment.create({ data: hora("c1", "G", 2) }).catch((falla: unknown) => falla)
        expect(error).toMatchObject({ code: "P2003" })
        expect(esRechazoPorSedeInactiva(error)).toBe(false)
      })

      it("createMany es todo o nada: una hora viva en la sede inactiva tira abajo a las demás", async () => {
        const antes = base.volcado()
        await expect(prisma.appointment.createMany({ data: [hora("c1", "A", 2), hora("c2", "B", 2)] })).rejects.toThrow(seRechazaLaCita)
        expect(base.volcado()).toEqual(antes)
      })
    })

    describe("citas: al actualizar", () => {
      beforeEach(() => conBDesactivada([hora("cancelada-b", "B", 2, { status: "cancelada" }), hora("pasada-b", "B", -2), hora("viva-b", "B", 3), hora("cancelada-a", "A", 2, { status: "cancelada" }), hora("pasada-a", "A", -2), hora("viva-a", "A", 3), hora("sin-sede", null, 3)]))

      it.each([["pendiente"], ["confirmada"]])("REACTIVAR una cancelada de una sede inactiva (-> %s) se rechaza y la cita sigue cancelada", async (status) => {
        const antes = base.volcado()
        await expect(prisma.appointment.update({ where: { id: "cancelada-b" }, data: { status } })).rejects.toThrow(/23514: citas cancelada-b: la sede B no está activa/)
        expect(base.volcado()).toEqual(antes)
        expect(fila("appointment", "cancelada-b")).toMatchObject({ status: "cancelada" })
      })

      it("reactivar una cancelada de una sede ACTIVA pasa", async () => {
        await expect(prisma.appointment.update({ where: { id: "cancelada-a" }, data: { status: "pendiente" } })).resolves.toMatchObject({ status: "pendiente" })
      })

      it("updateMany que reactiva es todo o nada: la de la sede activa tampoco se toca", async () => {
        const antes = base.volcado()
        await expect(prisma.appointment.updateMany({ where: { status: "cancelada" }, data: { status: "pendiente" } })).rejects.toThrow(/23514: citas cancelada-b: la sede B no está activa/)
        expect(base.volcado()).toEqual(antes)
        expect(fila("appointment", "cancelada-a")).toMatchObject({ status: "cancelada" })
      })

      it("mover al futuro una pasada de una sede inactiva se rechaza; en una sede activa pasa", async () => {
        await expect(prisma.appointment.update({ where: { id: "pasada-b" }, data: { startTime: en(2), endTime: en(2) } })).rejects.toThrow(/23514: citas pasada-b: la sede B no está activa/)
        await expect(prisma.appointment.update({ where: { id: "pasada-a" }, data: { startTime: en(2), endTime: en(2) } })).resolves.toBeTruthy()
      })

      it("cambiarle la sede a una hora viva hacia una inactiva se rechaza; ponerle sede a una que no tenía también", async () => {
        await expect(prisma.appointment.update({ where: { id: "viva-a" }, data: { sedeId: "B" } })).rejects.toThrow(/23514: citas viva-a: la sede B no está activa/)
        await expect(prisma.appointment.update({ where: { id: "sin-sede" }, data: { sedeId: "B" } })).rejects.toThrow(/23514: citas sin-sede: la sede B no está activa/)
        await expect(prisma.appointment.update({ where: { id: "sin-sede" }, data: { sedeId: "A" } })).resolves.toMatchObject({ sedeId: "A" })
      })

      it("lo que ya estaba vivo en la sede desactivada sigue andando: cancelar, completar, no vino, confirmar, cambiar la hora, editar", async () => {
        await expect(prisma.appointment.update({ where: { id: "viva-b" }, data: { status: "confirmada" } })).resolves.toBeTruthy()
        await expect(prisma.appointment.update({ where: { id: "viva-b" }, data: { startTime: en(5), endTime: en(5), notes: "x" } })).resolves.toBeTruthy()
        await expect(prisma.appointment.update({ where: { id: "viva-b" }, data: { status: "cancelada" } })).resolves.toMatchObject({ status: "cancelada" })
        await expect(prisma.appointment.update({ where: { id: "pasada-b" }, data: { status: "completada" } })).resolves.toMatchObject({ status: "completada" })
        await conBDesactivada([hora("viva-b", "B", 3)])
        await expect(prisma.appointment.update({ where: { id: "viva-b" }, data: { status: "no-asistio" } })).resolves.toBeTruthy()
        await conBDesactivada([hora("viva-b", "B", 3)])
        await expect(prisma.appointment.update({ where: { id: "viva-b" }, data: { sedeId: null } })).resolves.toMatchObject({ sedeId: null })
      })

      it("una hora sin sede cambia de estado sin que el trigger mire nada", async () => {
        await expect(prisma.appointment.update({ where: { id: "sin-sede" }, data: { status: "confirmada" } })).resolves.toBeTruthy()
      })
    })

    describe("lista de espera", () => {
      beforeEach(() => conBDesactivada([], [inscripcion("previa-b", "n1", "s1", "B"), { ...inscripcion("salio-b", "n1", "s1", "B"), estado: "salio" }, inscripcion("activa-a", "n1", "s1", "A")]))

      it("una inscripción activa en una sede ACTIVA o sin sede se crea", async () => {
        await expect(prisma.inscripcionEnEspera.create({ data: inscripcion("e1", "n1", "s1", "A") })).resolves.toBeTruthy()
        await expect(prisma.inscripcionEnEspera.create({ data: inscripcion("e2", "n1", "s1", null) })).resolves.toBeTruthy()
      })

      it("una inscripción activa en una sede INACTIVA se rechaza y no deja nada", async () => {
        const antes = base.volcado()
        const error = await prisma.inscripcionEnEspera.create({ data: inscripcion("e1", "n1", "s1", "B") }).catch((falla: unknown) => falla)
        expect(String((error as Error).message)).toMatch(seRechazaLaInscripcion)
        expect(esRechazoPorSedeInactiva(error)).toBe(true)
        expect(base.volcado()).toEqual(antes)
      })

      it.each([["reservo"], ["expirada"], ["salio"]])("una inscripción %s en una sede inactiva se crea: ya no está en pie", async (estado) => {
        await expect(prisma.inscripcionEnEspera.create({ data: { ...inscripcion("e1", "n1", "s1", "B"), estado } })).resolves.toMatchObject({ estado })
      })

      it("con la sede de OTRO negocio rechaza la FK compuesta, no el trigger (P2003)", async () => {
        const error = await prisma.inscripcionEnEspera.create({ data: inscripcion("e1", "n1", "s1", "G") }).catch((falla: unknown) => falla)
        expect(error).toMatchObject({ code: "P2003" })
        expect(esRechazoPorSedeInactiva(error)).toBe(false)
      })

      it("resolver una inscripción activa de una sede desactivada (reservó, expiró, salió) pasa", async () => {
        await expect(prisma.inscripcionEnEspera.update({ where: { id: "previa-b" }, data: { estado: "reservo" } })).resolves.toMatchObject({ estado: "reservo" })
      })

      it("revivir una resuelta de una sede inactiva, o mover una activa a una inactiva, se rechaza", async () => {
        await expect(prisma.inscripcionEnEspera.update({ where: { id: "salio-b" }, data: { estado: "activa" } })).rejects.toThrow(/23514: lista_de_espera salio-b: la sede B no está activa/)
        await expect(prisma.inscripcionEnEspera.update({ where: { id: "activa-a" }, data: { sedeId: "B" } })).rejects.toThrow(/23514: lista_de_espera activa-a: la sede B no está activa/)
      })

      it("tocar otra columna de una activa de sede desactivada (los avisos) pasa", async () => {
        await expect(prisma.inscripcionEnEspera.update({ where: { id: "previa-b" }, data: { avisos: 1 } })).resolves.toMatchObject({ avisos: 1 })
      })
    })
  })
})
