import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

// Zonas que este "motor" no sabe leer: para probar que una de la lista que el motor no conoce no se guarda.
const zonasQueElMotorNoConoce = new Set<string>()
vi.mock("@/lib/zona-horaria", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("@/lib/zona-horaria")>()
  return { ...original, esZonaValida: (zona: unknown) => !zonasQueElMotorNoConoce.has(String(zona)) && original.esZonaValida(zona) }
})

async function guardar(sesion: unknown, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido("http://localhost/api/configuracion/zona-horaria", cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const zonaDe = (id: string) => base.buscar("business", { id })[0].timezone

const dueñaDeUnaClinica = { user: { ...sesiones.dueña.user, rubro: "odontologia" } }

beforeEach(() => {
  vi.clearAllMocks()
  zonasQueElMotorNoConoce.clear()
  base.reiniciar(datosBase())
})

describe("PUT /api/configuracion/zona-horaria", () => {
  it.each(["America/Punta_Arenas", "Pacific/Easter", "America/Santiago"])("la dueña elige %s para su negocio", async (zona) => {
    const { status, cuerpo } = await guardar(sesiones.dueña, { zona })

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ zona })
    expect(zonaDe(NEGOCIO)).toBe(zona)
  })

  it("sólo toca el negocio de la sesión, aunque el cuerpo traiga el id de otro", async () => {
    await guardar(sesiones.dueña, { zona: "Pacific/Easter", id: OTRO_NEGOCIO, businessId: OTRO_NEGOCIO })

    expect(zonaDe(NEGOCIO)).toBe("Pacific/Easter")
    expect(zonaDe(OTRO_NEGOCIO)).toBe("America/Santiago")
  })

  it("la dueña del otro negocio cambia el suyo, nunca el 1", async () => {
    await guardar(sesiones.dueñoAjeno, { zona: "America/Punta_Arenas" })

    expect(zonaDe(OTRO_NEGOCIO)).toBe("America/Punta_Arenas")
    expect(zonaDe(NEGOCIO)).toBe("America/Santiago")
  })

  it("la dueña de una clínica dental también: no depende del rubro", async () => {
    expect((await guardar(dueñaDeUnaClinica, { zona: "Pacific/Easter" })).status).toBe(200)
    expect(zonaDe(NEGOCIO)).toBe("Pacific/Easter")
  })

  it("el encargado y el profesional reciben 401 y no cambian nada", async () => {
    expect((await guardar(sesiones.encargado, { zona: "Pacific/Easter" })).status).toBe(401)
    expect((await guardar(sesiones.carla, { zona: "Pacific/Easter" })).status).toBe(401)
    expect((await guardar(sesiones.sinMiembro, { zona: "Pacific/Easter" })).status).toBe(401)
    expect(zonaDe(NEGOCIO)).toBe("America/Santiago")
  })

  it("sin sesión, 401", async () => {
    expect((await guardar(null, { zona: "Pacific/Easter" })).status).toBe(401)
    expect(zonaDe(NEGOCIO)).toBe("America/Santiago")
  })

  it.each([
    ["una zona de otro país", { zona: "America/Lima" }],
    ["UTC", { zona: "UTC" }],
    ["un desfase sin horario de verano", { zona: "-03:00" }],
    ["el nombre en minúsculas", { zona: "america/santiago" }],
    ["con un espacio de más", { zona: "America/Santiago " }],
    ["un texto inventado", { zona: "Chile/Continental" }],
    ["vacía", { zona: "" }],
    ["un número", { zona: 3 }],
    ["una lista", { zona: ["Pacific/Easter"] }],
    ["sin el campo", {}],
    ["sin cuerpo", undefined],
  ])("rechaza %s con 400 y dice cuáles se pueden elegir, sin cambiar nada", async (_que, cuerpo) => {
    const { status, cuerpo: respuesta } = await guardar(sesiones.dueña, cuerpo)

    expect(status).toBe(400)
    expect(respuesta.error).toContain("Elige una de las zonas de la lista")
    expect(zonaDe(NEGOCIO)).toBe("America/Santiago")
  })

  it("una zona de la lista que el motor no sabe leer no se guarda: el negocio seguiría en Santiago sin decirlo", async () => {
    zonasQueElMotorNoConoce.add("Pacific/Easter")

    const { status, cuerpo } = await guardar(sesiones.dueña, { zona: "Pacific/Easter" })

    expect(status).toBe(400)
    expect(cuerpo.error).toContain("no reconoce esa zona horaria")
    expect(zonaDe(NEGOCIO)).toBe("America/Santiago")
  })
})
