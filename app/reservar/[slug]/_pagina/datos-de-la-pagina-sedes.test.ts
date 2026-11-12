import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/**
 * La mini página con sedes (etapa 9, plan Independiente): con dos o más sedes
 * activas, el modo es `varias` y la página lleva cada sede con su dirección y su
 * horario por días. Con una o ninguna, la página de siempre. Es público y sin
 * sesión: nada interno sale, y cada negocio ve sólo las suyas.
 */

/** Los campos de la página que el negocio de prueba no trae (sin default en el esquema). */
const CAMPOS_DE_LA_PAGINA = { address: null, comuna: null, whatsapp: null, instagram: null, color: null, logoUrl: null, coverUrl: null, mediosDePago: [] }

type Registro = Record<string, unknown>

const sede = (id: string, businessId: string, nombre: string, extra: Registro = {}) => ({
  id,
  businessId,
  nombre,
  direccion: "Av. Italia 1234",
  comuna: "Providencia",
  ...extra,
})
const franja = (id: string, businessId: string, sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string) => ({
  id,
  businessId,
  memberId: null,
  sedeId,
  dayOfWeek,
  startTime,
  endTime,
})

/** El negocio 1 es Independiente (sin equipo) con las sedes y los horarios que se pidan. */
function escenario(sedes: Registro[], workSchedule: Registro[], plan = "independiente") {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, ...CAMPOS_DE_LA_PAGINA, plan })),
    businessMember: [],
    service: datos.service.map((servicio) => ({ description: null, category: null, duration: 60, ...servicio })),
    sede: sedes,
    workSchedule,
  })
}

async function pagina(slug = "salon-uno") {
  const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")
  return leerPaginaDelNegocio(slug)
}

const DOS_SEDES = [
  sede("b", NEGOCIO, "Ñuñoa", { direccion: "Irarrázaval 500", comuna: "Ñuñoa", telefono: "+56912345678", orden: 1 }),
  sede("a", NEGOCIO, "Centro", { orden: 0 }),
  sede("vieja", NEGOCIO, "Vieja", { activo: false, direccion: "Calle Vieja 1", comuna: "Santiago" }),
  sede("ajena", OTRO_NEGOCIO, "Ajena", { direccion: "Otra 1", comuna: "Maipú" }),
]
const HORARIOS = [
  franja("h-a-lun", NEGOCIO, "a", 1, "09:00", "13:00"),
  franja("h-a-mie", NEGOCIO, "a", 3, "09:00", "13:00"),
  franja("h-b-mar", NEGOCIO, "b", 2, "14:00", "18:00"),
  franja("h-vieja", NEGOCIO, "vieja", 4, "18:00", "20:00"),
  franja("h-ajena", OTRO_NEGOCIO, "ajena", 5, "09:00", "12:00"),
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("leerPaginaDelNegocio con sedes", () => {
  it("con dos sedes activas: modo `varias`, las sedes activas en orden, con su horario por días", async () => {
    escenario(DOS_SEDES, HORARIOS)

    const datos = await pagina()

    expect(datos?.modoDeSedes).toBe("varias")
    expect(datos?.sedes?.map((s) => s.nombre)).toEqual(["Centro", "Ñuñoa"])
    expect(datos?.sedes?.[0]).toMatchObject({ id: "a", direccion: "Av. Italia 1234", comuna: "Providencia", dias: [1, 3], horario: ["Lun, Mié: 09:00–13:00"] })
    expect(datos?.sedes?.[1]).toMatchObject({ id: "b", telefono: "+56912345678", dias: [2], horario: ["Mar: 14:00–18:00"] })
    expect(datos?.sedes?.[0].mapas?.googleMaps).toContain("Av.%20Italia%201234")
  })

  it("el horario del negocio es el vigente: no cuenta el de una sede desactivada ni el de otro negocio", async () => {
    escenario(DOS_SEDES, HORARIOS)

    const datos = await pagina()

    expect(datos?.horario.map((dia) => dia.dayOfWeek)).toEqual([1, 2, 3])
  })

  it("nada interno sale: ni el negocio ni fechas de las sedes, sólo lo que se muestra; y el `select` es explícito", async () => {
    escenario(DOS_SEDES, HORARIOS)
    const buscar = vi.spyOn(base.prisma.business, "findUnique")

    const datos = await pagina()

    for (const delaPagina of datos?.sedes ?? []) {
      expect(Object.keys(delaPagina).sort()).toEqual(["comuna", "dias", "direccion", "horario", "id", "mapas", "nombre", "telefono"])
    }
    expect(JSON.stringify(datos)).not.toMatch(new RegExp(`${NEGOCIO}|${OTRO_NEGOCIO}|createdAt|updatedAt|Ajena|Vieja`))
    const seleccion = buscar.mock.calls[0][0] as { select: { sedes: { where: unknown; select: Record<string, boolean> } } }
    expect(seleccion.select.sedes.where).toEqual({ activo: true })
    expect(Object.keys(seleccion.select.sedes.select).sort()).toEqual(["activo", "comuna", "direccion", "id", "nombre", "orden", "telefono"])
  })

  it("cada negocio ve sólo sus sedes", async () => {
    escenario(DOS_SEDES, HORARIOS)

    const delOtro = await pagina("salon-dos")

    // Una sola sede activa: la suya, y ni rastro de las del negocio 1.
    expect(delOtro?.modoDeSedes).toBe("una")
    expect(delOtro?.sedes?.map((s) => s.nombre)).toEqual(["Ajena"])
    expect(delOtro?.horario.map((dia) => dia.dayOfWeek)).toEqual([5])
  })

  it("con una sola sede activa: modo `una`, la página de siempre (la sede viaja, pero no se muestra)", async () => {
    escenario([sede("a", NEGOCIO, "Centro")], [franja("h-a", NEGOCIO, "a", 1, "09:00", "13:00")])

    const datos = await pagina()

    expect(datos?.modoDeSedes).toBe("una")
    expect(datos?.sedes?.map((s) => s.id)).toEqual(["a"])
  })

  it("sin sedes: modo `una`, sin sedes, y el horario general de siempre", async () => {
    escenario([], [franja("h-g", NEGOCIO, null, 1, "09:00", "18:00")])

    const datos = await pagina()

    expect(datos?.modoDeSedes).toBe("una")
    expect(datos?.sedes).toEqual([])
    expect(datos?.horario).toEqual([{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }])
  })

  it("el plan Equipo nunca es `varias`, ni siquiera con dos sedes activas que lleguen de más", async () => {
    // La base real no deja un negocio Equipo con sedes activas (`sedes_reglas`): esto falla cerrado igual.
    escenario([sede("a", NEGOCIO, "Centro"), sede("b", NEGOCIO, "Ñuñoa")], [], "equipo")

    expect((await pagina())?.modoDeSedes).toBe("una")
  })
})
