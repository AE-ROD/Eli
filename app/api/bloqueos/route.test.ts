import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Bloqueos de horario: listar por rango, crear y quitar. Aislamiento entre
 * negocios (lo ajeno es 404) y permisos: dueño y encargado, de cualquiera y
 * de todo el negocio; el profesional, sólo los suyos.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Santiago en octubre de 2026 está en UTC-3. */
const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

const bloqueo = (id: string, memberId: string | null, fecha: string, inicio: string, fin: string, datos = {}) => ({
  id,
  businessId: NEGOCIO,
  memberId,
  startTime: santiago(fecha, inicio),
  endTime: santiago(fecha, fin),
  ...datos,
})

function escenario() {
  base.reiniciar({
    ...datosBase(),
    timeBlock: [
      bloqueo("b-carla", "m-carla", "2026-10-20", "13:00", "14:00", { motivo: "Almuerzo" }),
      bloqueo("b-pedro", "m-pedro", "2026-10-20", "13:00", "14:00"),
      bloqueo("b-negocio", null, "2026-10-21", "09:00", "19:00", { motivo: "Feriado" }),
      // Del 22 a las 23:00 al 23 a las 01:00: se pisa con el 23 aunque empiece el 22.
      bloqueo("b-noche", null, "2026-10-22", "23:00", "23:30", { endTime: santiago("2026-10-23", "01:00") }),
      { ...bloqueo("b-ajeno", "m-ajeno", "2026-10-20", "10:00", "11:00"), businessId: OTRO_NEGOCIO },
    ],
  })
}

const URL_LISTA = "http://localhost/api/bloqueos"

async function listar(sesion: unknown, consulta: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(`${URL_LISTA}?${consulta}`))
}

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL_LISTA, cuerpo))
}

async function quitar(sesion: unknown, id: string) {
  const { DELETE } = await import("./[id]/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(`${URL_LISTA}/${id}`), conId(id))
}

const nuevo = (memberId: string | null, extra: Record<string, unknown> = {}) => ({
  memberId,
  startTime: santiago("2026-10-27", "13:00").toISOString(),
  endTime: santiago("2026-10-27", "14:00").toISOString(),
  motivo: "Trámite",
  ...extra,
})

const ids = async (respuesta: Response) => ((await respuesta.json()) as { id: string }[]).map((b) => b.id)

describe("/api/bloqueos", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  describe("GET: listar por rango", () => {
    it("sin sesión: 401", async () => {
      const res = await listar(null, "desde=2026-10-19&hasta=2026-10-25")
      expect(res.status).toBe(401)
    })

    it("sin fechas válidas: 400", async () => {
      expect((await listar(sesiones.dueña, "desde=2026-10-19")).status).toBe(400)
      expect((await listar(sesiones.dueña, "desde=2026-02-30&hasta=2026-03-01")).status).toBe(400)
    })

    it("la dueña ve todos los del negocio en el rango, ninguno de otro", async () => {
      const res = await listar(sesiones.dueña, "desde=2026-10-19&hasta=2026-10-25")

      expect(res.status).toBe(200)
      expect(await ids(res)).toEqual(["b-carla", "b-pedro", "b-negocio", "b-noche"])
    })

    it("el profesional ve los suyos y los de todo el negocio, no los de un colega", async () => {
      const res = await listar(sesiones.carla, "desde=2026-10-19&hasta=2026-10-25")

      expect(await ids(res)).toEqual(["b-carla", "b-negocio", "b-noche"])
    })

    it("el rango es en días del negocio: trae lo que se pisa con ellos", async () => {
      expect(await ids(await listar(sesiones.dueña, "desde=2026-10-21&hasta=2026-10-21"))).toEqual(["b-negocio"])
      expect(await ids(await listar(sesiones.dueña, "desde=2026-10-23&hasta=2026-10-23"))).toEqual(["b-noche"])
    })

    it("trae el nombre del profesional para mostrarlo", async () => {
      const [primero] = await (await listar(sesiones.dueña, "desde=2026-10-20&hasta=2026-10-20")).json()

      expect(primero).toMatchObject({ id: "b-carla", memberId: "m-carla", motivo: "Almuerzo", member: { user: { name: "Carla Profesional" } } })
    })

    it("el dueño de otro negocio no ve ninguno de éste", async () => {
      const res = await listar(sesiones.dueñoAjeno, "desde=2026-10-19&hasta=2026-10-25")

      expect(await ids(res)).toEqual(["b-ajeno"])
    })
  })

  describe("POST: crear", () => {
    it("la dueña bloquea a un profesional y a todo el negocio", async () => {
      const deCarla = await crear(sesiones.dueña, nuevo("m-carla"))
      const delNegocio = await crear(sesiones.dueña, nuevo(null, { motivo: undefined }))

      expect(deCarla.status).toBe(201)
      expect(delNegocio.status).toBe(201)
      const creados = base.buscar("timeBlock", { createdById: "u-duena" })
      expect(creados.map((b) => [b.businessId, b.memberId, b.motivo])).toEqual([
        [NEGOCIO, "m-carla", "Trámite"],
        [NEGOCIO, null, null],
      ])
    })

    it("el encargado bloquea a un colega", async () => {
      const res = await crear(sesiones.encargado, nuevo("m-pedro"))

      expect(res.status).toBe(201)
    })

    it("el profesional bloquea su propia agenda", async () => {
      const res = await crear(sesiones.carla, nuevo("m-carla"))

      expect(res.status).toBe(201)
      expect(base.buscar("timeBlock", { createdById: "u-carla" })[0]).toMatchObject({ memberId: "m-carla", businessId: NEGOCIO })
    })

    it("el profesional no bloquea a un colega ni a todo el negocio: 401 y no se crea nada", async () => {
      const antes = base.volcado()

      expect((await crear(sesiones.carla, nuevo("m-pedro"))).status).toBe(401)
      expect((await crear(sesiones.carla, nuevo(null))).status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })

    it("un profesional sin memberId no bloquea nada (falla cerrado)", async () => {
      expect((await crear(sesiones.sinMiembro, nuevo(null))).status).toBe(401)
    })

    it("un profesional de otro negocio: 404, como si no existiera, y no se crea nada", async () => {
      const antes = base.volcado()
      const res = await crear(sesiones.dueña, nuevo("m-ajeno"))

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Miembro no encontrado" })
      expect(base.volcado()).toEqual(antes)
    })

    it.each([
      ["un fin antes del inicio", { endTime: santiago("2026-10-27", "12:00").toISOString() }, "El bloqueo tiene que terminar después de empezar"],
      ["más de un año", { endTime: santiago("2027-10-29", "12:00").toISOString() }, "Un bloqueo no puede durar más de un año"],
      ["un motivo de 121 caracteres", { motivo: "a".repeat(121) }, "El motivo no puede tener más de 120 caracteres"],
      ["una fecha que no es fecha", { startTime: "mañana" }, "La fecha de inicio no es válida"],
    ])("rechaza %s: 400", async (_caso, campos, mensaje) => {
      const res = await crear(sesiones.dueña, nuevo("m-carla", campos))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(mensaje)
    })

    it("un cuerpo que no es JSON: 400, no 500", async () => {
      const res = await crear(sesiones.dueña, undefined)

      expect(res.status).toBe(400)
    })
  })

  describe("DELETE: quitar", () => {
    it("la dueña quita uno de un profesional y uno del negocio", async () => {
      expect((await quitar(sesiones.dueña, "b-carla")).status).toBe(200)
      expect((await quitar(sesiones.dueña, "b-negocio")).status).toBe(200)
      expect(base.buscar("timeBlock", {}).map((b) => b.id)).toEqual(["b-pedro", "b-noche", "b-ajeno"])
    })

    it("el profesional quita el suyo", async () => {
      expect((await quitar(sesiones.carla, "b-carla")).status).toBe(200)
      expect(base.buscar("timeBlock", { id: "b-carla" })).toEqual([])
    })

    it("el profesional no quita el de un colega: 404 (no lo ve)", async () => {
      const res = await quitar(sesiones.carla, "b-pedro")

      expect(res.status).toBe(404)
      expect(base.buscar("timeBlock", { id: "b-pedro" })).toHaveLength(1)
    })

    it("el profesional ve el de todo el negocio pero no lo quita: 401", async () => {
      const res = await quitar(sesiones.carla, "b-negocio")

      expect(res.status).toBe(401)
      expect(base.buscar("timeBlock", { id: "b-negocio" })).toHaveLength(1)
    })

    it("el de otro negocio: 404 y nada cambia", async () => {
      const antes = base.volcado()
      const res = await quitar(sesiones.dueña, "b-ajeno")

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Bloqueo no encontrado" })
      expect(base.volcado()).toEqual(antes)
    })

    it("sin sesión: 401", async () => {
      expect((await quitar(null, "b-carla")).status).toBe(401)
    })
  })
})
