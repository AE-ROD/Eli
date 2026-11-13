import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
import { sesionesDentales } from "@/pruebas/clinica-con-sillones"
import { serviciosSugeridosDe, type ServicioSugerido } from "@/lib/servicios-sugeridos"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

type Sugerido = ServicioSugerido & { yaExiste: boolean }

async function pedirSugeridos(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

const sugeridosDe = async (sesion: unknown) => ((await (await pedirSugeridos(sesion)).json()).sugeridos as Sugerido[])

const conRubro = (sesion: { user: object }, rubro: string) => ({ user: { ...sesion.user, rubro } })

beforeEach(() => {
  vi.clearAllMocks()
  // El negocio de la base es un salón (el `type` por defecto); lo que manda es el rubro de la sesión.
  base.reiniciar({
    ...datosBase(),
    service: [
      { id: "s-1", businessId: NEGOCIO, name: "Corte de pelo" },
      { id: "s-2", businessId: NEGOCIO, name: "  BRUSHING " },
      { id: "s-3", businessId: NEGOCIO, name: "Tratamiento de hidratacion", active: false },
      { id: "s-4", businessId: NEGOCIO, name: "Un servicio propio" },
      { id: "s-ajeno", businessId: OTRO_NEGOCIO, name: "Peinado de fiesta" },
      { id: "s-ajeno-2", businessId: OTRO_NEGOCIO, name: "Corte degradado" },
    ],
  })
})

describe("GET /api/configuracion/servicios/sugeridos", () => {
  describe("quién puede", () => {
    it("sin sesión, 401", async () => {
      expect((await pedirSugeridos(null)).status).toBe(401)
    })

    it.each([
      ["un profesional", sesiones.carla],
      ["un profesional sin miembro", sesiones.sinMiembro],
    ])("%s recibe 401 y no se consulta nada", async (_quien, sesion) => {
      base.prisma.service.findMany.mockClear()

      const res = await pedirSugeridos(sesion)

      expect(res.status).toBe(401)
      expect(base.prisma.service.findMany).not.toHaveBeenCalled()
    })

    it.each([
      ["la dueña", sesiones.dueña],
      ["el encargado", sesiones.encargado],
    ])("%s los ve", async (_quien, sesion) => {
      const res = await pedirSugeridos(conRubro(sesion, "salon"))

      expect(res.status).toBe(200)
      expect((await res.json()).sugeridos.length).toBeGreaterThan(0)
    })
  })

  describe("el rubro sale de la sesión", () => {
    it.each(["salon", "barberia", "spa-de-unas", "odontologia"])("un negocio de %s recibe la lista de su rubro", async (rubro) => {
      const sugeridos = await sugeridosDe(conRubro(sesiones.dueña, rubro))

      expect(sugeridos.map(({ yaExiste: _yaExiste, ...resto }) => resto)).toEqual(serviciosSugeridosDe(rubro))
    })

    it("aunque la base diga que es un salón, manda el rubro de la sesión", async () => {
      expect(base.buscar("business", { id: NEGOCIO })[0].type).toBe("salon")

      const sugeridos = await sugeridosDe(sesionesDentales.dueña)

      expect(sugeridos.map((s) => s.clave)).toEqual(serviciosSugeridosDe("odontologia").map((s) => s.clave))
    })

    it("sin rubro en la sesión, o con uno que el catálogo no conoce, recibe los neutros", async () => {
      for (const sesion of [sesiones.dueña, conRubro(sesiones.dueña, "salud"), conRubro(sesiones.dueña, "constructor")]) {
        const sugeridos = await sugeridosDe(sesion)
        expect(sugeridos.map((s) => s.clave)).toEqual(serviciosSugeridosDe(null).map((s) => s.clave))
      }
    })

    it("sólo la clínica trae el motivo de urgencia", async () => {
      const clinica = await sugeridosDe(sesionesDentales.dueña)
      const salon = await sugeridosDe(conRubro(sesiones.dueña, "salon"))

      expect(clinica.filter((s) => s.esUrgencia).map((s) => s.name)).toEqual(["Urgencia dental"])
      expect(salon.some((s) => "esUrgencia" in s)).toBe(false)
    })

    it("cada sugerido trae lo que la pantalla necesita para cargarlo", async () => {
      const [primero, segundo] = await sugeridosDe(conRubro(sesiones.dueña, "barberia"))

      // "Corte de pelo" ya está en el negocio de la prueba; "Corte degradado", no.
      expect(primero).toEqual({ clave: "corte-de-pelo", name: "Corte de pelo", duration: 30, price: 10000, category: "Corte", yaExiste: true })
      expect(segundo).toEqual({ clave: "corte-degradado", name: "Corte degradado", duration: 45, price: 12000, category: "Corte", yaExiste: false })
    })
  })

  describe("yaExiste", () => {
    it("marca los que el negocio ya tiene, sin mayúsculas, tildes ni espacios de más, activos o no", async () => {
      const sugeridos = await sugeridosDe(conRubro(sesiones.dueña, "salon"))
      const ya = sugeridos.filter((s) => s.yaExiste).map((s) => s.name)

      expect(ya.sort()).toEqual(["Brushing", "Corte de pelo", "Tratamiento de hidratación"])
      expect(sugeridos.filter((s) => !s.yaExiste)).toHaveLength(sugeridos.length - 3)
    })

    it("compara con los servicios del negocio de la sesión, no con los de otro", async () => {
      // El otro negocio tiene "Peinado de fiesta" y "Corte degradado": el primero no debe verlos como suyos.
      const delPrimero = await sugeridosDe(conRubro(sesiones.dueña, "salon"))
      expect(delPrimero.find((s) => s.name === "Peinado de fiesta")?.yaExiste).toBe(false)

      const delOtro = await sugeridosDe(conRubro(sesiones.dueñoAjeno, "salon"))
      expect(delOtro.find((s) => s.name === "Peinado de fiesta")?.yaExiste).toBe(true)
      expect(delOtro.find((s) => s.name === "Corte de pelo")?.yaExiste).toBe(false)
    })

    it("la consulta de nombres está acotada por el negocio de la sesión", async () => {
      await pedirSugeridos(conRubro(sesiones.dueñoAjeno, "salon"))

      expect(base.prisma.service.findMany).toHaveBeenLastCalledWith({ where: { businessId: OTRO_NEGOCIO }, select: { name: true } })
    })

    it("un negocio sin servicios no tiene ninguno marcado", async () => {
      base.reiniciar({ ...datosBase(), service: [] })

      const sugeridos = await sugeridosDe(conRubro(sesiones.dueña, "spa-de-unas"))

      expect(sugeridos.every((s) => !s.yaExiste)).toBe(true)
    })
  })

  it("no entrega la lista compartida: cambiar la respuesta no cambia los sugeridos", async () => {
    const res = await pedirSugeridos(conRubro(sesiones.dueña, "salon"))
    const { sugeridos } = await res.json()
    sugeridos[0].name = "Cambiado"

    expect(serviciosSugeridosDe("salon")[0].name).toBe("Corte de pelo")
  })
})
