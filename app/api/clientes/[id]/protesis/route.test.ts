import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_TRATANTE_NO_ODONTOLOGO, type ProtesisDelPacienteRespuesta, type ProtesisRespuesta } from "@/lib/edicion-de-protesis"
import { CLINICA, conParams, sesionesDentales as sesiones } from "../../_pruebas/clinica-dental"
import { conAbono, escenarioDeProtesis } from "../../_pruebas/protesis"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string) => `http://localhost/api/clientes/${id}/protesis`
const con = (id: string) => conParams({ id })

const AHORA = new Date("2026-11-08T15:00:00.000Z")

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenarioDeProtesis())
})

afterEach(() => {
  vi.useRealTimers()
})

async function leer(sesion: unknown, id = "p-camila") {
  const { GET } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(url(id)), con(id))
}

async function crear(sesion: unknown, cuerpo: unknown, id = "p-camila") {
  const { POST } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(url(id), cuerpo), con(id))
}

const lista = async (res: Response) => ((await res.json()) as ProtesisDelPacienteRespuesta).protesis
const una = (protesis: ProtesisRespuesta[], id: string) => protesis.find((p) => p.id === id)

/** Una removible inferior de Acrílico (1 arcada, $180.000): lo mínimo que se manda. */
const removible = { tipo: "removible", arcada: "inferior", piezas: [36], pilares: [35, 37], zonas: ["lingual"], materialId: "mt-acrilico" }

describe("GET /api/clientes/[id]/protesis", () => {
  it("la dueña ve el historial del paciente, de la más nueva a la más vieja, con seguimiento y las tres partes del reparto", async () => {
    const res = await leer(sesiones.dueña)

    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as ProtesisDelPacienteRespuesta
    expect(cuerpo.puedeEditar).toBe(true)
    expect(cuerpo.protesis.map((p) => p.id)).toEqual(["pt-corona", "pt-removible"])
    expect(una(cuerpo.protesis, "pt-removible")).toEqual({
      id: "pt-removible",
      tipo: "removible",
      arcada: "inferior",
      piezas: [46],
      pilares: [45, 47],
      zonas: ["lingual"],
      material: { id: "mt-acrilico", nombre: "Acrílico termocurado", unidad: "arcada", precioUnitarioCents: 18_000_000 },
      unidades: 1,
      valorCents: 18_000_000,
      pagadoCents: 0,
      saldoCents: 18_000_000,
      laboratorio: { id: "lab-sur", nombre: "Laboratorio Sur", contacto: "+56 9 1111 2222" },
      entregaEstimada: "2026-11-20",
      tono: { id: "A3.5", etiqueta: "A3,5", grupo: "A", color: expect.stringMatching(/^#[0-9A-F]{6}$/) },
      estado: "rodete",
      siguienteEstado: "enfilado",
      etapas: [
        { id: "impresion", nombre: "Toma de impresión", situacion: "hecha", fecha: "2026-11-02T14:00:00.000Z", autorNombre: "Diego Pérez" },
        { id: "rodete", nombre: "Prueba de rodete", situacion: "actual", fecha: "2026-11-03T15:00:00.000Z", autorNombre: "Valentina Soto" },
        { id: "enfilado", nombre: "Prueba de enfilado", situacion: "pendiente", fecha: null, autorNombre: null },
        { id: "entregada", nombre: "Entregada", situacion: "pendiente", fecha: null, autorNombre: null },
      ],
      entregadaEn: null,
      anuladaEn: null,
      anuladaPorNombre: null,
      tratante: { memberId: "m-perez", nombre: "Diego Pérez", esLaDuena: false },
      creadoPorNombre: "Diego Pérez",
      createdAt: "2026-11-02T14:00:00.000Z",
      eventos: [
        { estado: "impresion", autorNombre: "Diego Pérez", createdAt: "2026-11-02T14:00:00.000Z" },
        { estado: "rodete", autorNombre: "Valentina Soto", createdAt: "2026-11-03T15:00:00.000Z" },
      ],
      enElPlan: false,
      nombreParaElPlan: "Removible parcial · Acrílico termocurado (45, 46, 47)",
      reparto: {
        visible: "todo",
        origen: "material",
        odontologo: { pb: 4000, cents: 7_200_000 },
        clinica: { pb: 3000, cents: 5_400_000 },
        tecnico: { pb: 3000, cents: 5_400_000 },
      },
    })
  })

  it("la odontóloga tratante ve el valor al paciente y SÓLO su parte; de la de un colega, nada del reparto", async () => {
    const res = await leer(sesiones.perez)

    expect(res.status).toBe(200)
    const protesis = await lista(res)
    expect(una(protesis, "pt-removible")).toMatchObject({ valorCents: 18_000_000, reparto: { visible: "suyo", odontologo: { pb: 4000, cents: 7_200_000 } } })
    expect(una(protesis, "pt-removible")?.reparto).toEqual({ visible: "suyo", odontologo: { pb: 4000, cents: 7_200_000 } })
    expect(una(protesis, "pt-corona")).toMatchObject({
      valorCents: 29_000_000,
      reparto: null,
      laboratorio: null,
      tono: null,
      siguienteEstado: "prueba",
      etapas: [
        { id: "impresion", situacion: "actual", autorNombre: "Laura Núñez" },
        { id: "prueba", situacion: "pendiente" },
        { id: "entregada", situacion: "pendiente" },
      ],
    })
    // Ni la parte de la clínica ni la del técnico salen en la respuesta.
    const texto = JSON.stringify(protesis)
    expect(texto).not.toMatch(/clinica|tecnico|origen|5400000|pbClinica|pbTecnico/)
  })

  it("lo abonado (atenciones finalizadas) descuenta del saldo; lo que espera en la Sala de espera, no", async () => {
    base.reiniciar(conAbono(escenarioDeProtesis(), "pt-removible", 5_000_000))
    expect(una(await lista(await leer(sesiones.dueña)), "pt-removible")).toMatchObject({ pagadoCents: 5_000_000, saldoCents: 13_000_000 })

    base.reiniciar(conAbono(escenarioDeProtesis(), "pt-removible", 5_000_000, "en-espera"))
    expect(una(await lista(await leer(sesiones.dueña)), "pt-removible")).toMatchObject({ pagadoCents: 0, saldoCents: 18_000_000 })
  })

  it("sólo las del paciente: las de Beto y las de la otra clínica no salen", async () => {
    expect((await lista(await leer(sesiones.dueña, "p-beto"))).map((p) => p.id)).toEqual(["pt-beto"])
    expect(await lista(await leer(sesiones.dueña, "p-nadia"))).toEqual([])
  })

  it.each([
    ["el encargado (no ve la pestaña Prótesis)", sesiones.encargado, "p-camila"],
    ["fuera de una clínica dental", sesiones.salon, "p-salon"],
    ["una sesión sin rubro", sesiones.sinRubro, "p-camila"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un paciente eliminado", sesiones.dueña, "p-eliminado"],
  ])("%s: 404", async (_caso, sesion, id) => {
    const res = await leer(sesion, id)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Paciente no encontrado" })
  })

  it("sin sesión, 401", async () => {
    expect((await leer(null)).status).toBe(401)
  })
})

describe("POST /api/clientes/[id]/protesis", () => {
  const nuevas = () => base.buscar("protesis", { customerId: "p-camila", id: { notIn: ["pt-removible", "pt-corona"] } })

  it("la dueña la crea para un odontólogo: el servidor calcula unidades, valor y congela la excepción; ignora precios y % del cuerpo", async () => {
    const res = await crear(sesiones.dueña, {
      tipo: "fija",
      arcada: "superior",
      piezas: [12],
      pilares: [13, 11],
      materialId: "mt-zirconio",
      tratante: "m-perez",
      laboratorioId: "lab-sur",
      entregaEstimada: "2026-12-01",
      tono: "B2",
      // Nada de esto cuenta.
      valorCents: 1,
      precioUnitarioCents: 1,
      unidades: 99,
      pbOdontologo: 10_000,
      pbClinica: 0,
      pbTecnico: 0,
      estado: "entregada",
    })

    expect(res.status).toBe(201)
    const creada = (await res.json()) as ProtesisRespuesta
    expect(creada).toMatchObject({
      tipo: "fija",
      piezas: [12],
      pilares: [11, 13],
      zonas: [],
      unidades: 3,
      valorCents: 87_000_000,
      material: { id: "mt-zirconio", nombre: "Zirconio", unidad: "pieza", precioUnitarioCents: 29_000_000 },
      estado: "impresion",
      siguienteEstado: "prueba",
      laboratorio: { id: "lab-sur", nombre: "Laboratorio Sur", contacto: "+56 9 1111 2222" },
      entregaEstimada: "2026-12-01",
      tono: { id: "B2", etiqueta: "B2", grupo: "B" },
      tratante: { memberId: "m-perez", nombre: "Diego Pérez", esLaDuena: false },
      creadoPorNombre: "Valentina Soto",
      eventos: [{ estado: "impresion", autorNombre: "Valentina Soto", createdAt: AHORA.toISOString() }],
      reparto: {
        visible: "todo",
        origen: "excepcion",
        odontologo: { pb: 4000, cents: 34_800_000 },
        clinica: { pb: 1500, cents: 13_050_000 },
        tecnico: { pb: 4500, cents: 39_150_000 },
      },
    })
    const [guardada] = nuevas()
    expect(guardada).toMatchObject({ businessId: CLINICA, pbOdontologo: 4000, pbClinica: 1500, pbTecnico: 4500, origenDelReparto: "excepcion", tono: "B2" })
  })

  it("la tratante sólo puede ser la dueña o un odontólogo: el encargado es 400 y no crea nada", async () => {
    const res = await crear(sesiones.dueña, { ...removible, tratante: "m-recepcion" })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: MENSAJE_TRATANTE_NO_ODONTOLOGO })
    expect(nuevas()).toEqual([])
    // Un odontólogo sí.
    const otra = await crear(sesiones.dueña, { ...removible, tratante: "m-nunez" })
    expect(otra.status).toBe(201)
    expect(((await otra.json()) as ProtesisRespuesta).tratante).toEqual({ memberId: "m-nunez", nombre: "Laura Núñez", esLaDuena: false })
  })

  it("la odontóloga queda siempre como tratante, pida lo que pida, y ve sólo su parte", async () => {
    for (const tratante of ["m-nunez", "duenio", undefined]) {
      base.reiniciar(escenarioDeProtesis())
      const res = await crear(sesiones.perez, { ...removible, tratante })
      expect(res.status).toBe(201)
      const creada = (await res.json()) as ProtesisRespuesta
      expect(creada.tratante).toEqual({ memberId: "m-perez", nombre: "Diego Pérez", esLaDuena: false })
      expect(creada.reparto).toEqual({ visible: "suyo", odontologo: { pb: 4000, cents: 7_200_000 } })
    }
  })

  it("sin tratante, la dueña es la tratante y su parte va a la clínica", async () => {
    const res = await crear(sesiones.dueña, removible)

    expect(res.status).toBe(201)
    const creada = (await res.json()) as ProtesisRespuesta
    expect(creada.tratante).toEqual({ memberId: null, nombre: "Valentina Soto", esLaDuena: true })
    expect(creada.reparto).toEqual({
      visible: "todo",
      origen: "material",
      odontologo: { pb: 0, cents: 0 },
      clinica: { pb: 7000, cents: 12_600_000 },
      tecnico: { pb: 3000, cents: 5_400_000 },
    })
    expect(nuevas()[0]).toMatchObject({ byOwner: true, memberId: null, pbOdontologo: 4000, pbClinica: 3000 })
  })

  it("sin laboratorio usa el del material; con null, ninguno; la total marca toda la arcada y se cobra por arcada", async () => {
    const sinTono = (await (await crear(sesiones.dueña, removible)).json()) as ProtesisRespuesta
    expect(sinTono.laboratorio).toEqual({ id: "lab-sur", nombre: "Laboratorio Sur", contacto: "+56 9 1111 2222" })
    expect(sinTono.tono).toBeNull()
    expect(((await (await crear(sesiones.dueña, { ...removible, laboratorioId: null })).json()) as ProtesisRespuesta).laboratorio).toBeNull()

    const total = (await (
      await crear(sesiones.dueña, { tipo: "total", arcada: "ambas", piezas: [], zonas: ["paladar", "lingual"], materialId: "mt-acrilico" })
    ).json()) as ProtesisRespuesta
    expect(total).toMatchObject({ unidades: 2, valorCents: 36_000_000, pilares: [], zonas: ["paladar", "lingual"] })
    // Toda la arcada menos los cordales (18, 28, 38 y 48).
    expect(total.piezas).toHaveLength(28)
    expect(total.piezas).not.toContain(48)
    expect(total.etapas.map((etapa) => etapa.id)).toEqual(["impresion", "rodete", "enfilado", "entregada"])
    expect(total.nombreParaElPlan).toBe("Total · Acrílico termocurado (ambas arcadas)")
  })

  it.each([
    ["una pieza de la otra arcada", { ...removible, piezas: [16] }, /no es de la arcada inferior/],
    ["una pieza temporal", { ...removible, piezas: [75] }, /dentición permanente/],
    ["sin piezas", { ...removible, piezas: [] }, /al menos una pieza/],
    ["un cordal de pilar", { ...removible, pilares: [35, 37, 38] }, /38 es un cordal/],
    ["una corona en un cordal", { tipo: "corona", arcada: "superior", piezas: [18], materialId: "mt-zirconio" }, /18 es un cordal/],
    ["un tono fuera de la guía", { ...removible, tono: "A3,5" }, /guía VITA/],
    ["un pilar que también es protésica", { ...removible, pilares: [36] }, /a la vez protésica y pilar/],
    ["el paladar en la inferior", { ...removible, zonas: ["paladar"] }, /paladar es de la arcada superior/],
    ["zonas en una corona", { tipo: "corona", arcada: "superior", piezas: [21], zonas: ["rebasado"], materialId: "mt-zirconio" }, /no llevan base/],
    ["una corona de dos piezas", { tipo: "corona", arcada: "superior", piezas: [21, 22], materialId: "mt-zirconio" }, /una sola pieza/],
    ["un material que no sirve para el tipo", { ...removible, tipo: "fija", zonas: [] }, /no sirve para este tipo/],
    ["un material desactivado", { ...removible, materialId: "mt-viejo" }, /desactivado/],
    ["un laboratorio desactivado", { ...removible, laboratorioId: "lab-viejo" }, /desactivado/],
    ["un tipo que no existe", { ...removible, tipo: "puente" }, /tipo de prótesis/],
    ["una fecha de entrega imposible", { ...removible, entregaEstimada: "2026-02-30" }, /fecha de entrega/],
  ])("%s: 400 y no crea nada", async (_caso, cuerpo, error) => {
    const res = await crear(sesiones.dueña, cuerpo)
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toMatch(error)
    expect(nuevas()).toEqual([])
  })

  it.each([
    ["un material de otra clínica", { ...removible, materialId: "mt-ajeno" }],
    ["un laboratorio de otra clínica", { ...removible, laboratorioId: "lab-ajeno" }],
    ["una tratante de otra clínica", { ...removible, tratante: "m-ajeno" }],
    ["un material que no existe", { ...removible, materialId: "mt-nada" }],
  ])("%s: 404 y no crea nada", async (_caso, cuerpo) => {
    expect((await crear(sesiones.dueña, cuerpo)).status).toBe(404)
    expect(nuevas()).toEqual([])
  })

  it.each([
    ["el encargado", sesiones.encargado, "p-camila"],
    ["fuera de una clínica dental", sesiones.salon, "p-salon"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["un paciente de otra clínica", sesiones.dueña, "p-ajena"],
  ])("%s: 404 y no crea nada", async (_caso, sesion, id) => {
    const antes = base.volcado()
    expect((await crear(sesion, removible, id)).status).toBe(404)
    expect(base.volcado().protesis).toEqual(antes.protesis)
  })

  it("sin sesión 401, y sin usuario que firme 401", async () => {
    expect((await crear(null, removible)).status).toBe(401)
    expect((await crear(sesiones.sinUsuario, removible)).status).toBe(401)
    expect(nuevas()).toEqual([])
  })

  it("traba al paciente antes de escribir", async () => {
    await crear(sesiones.dueña, removible)
    const candado = base.prisma.$queryRaw.mock.calls.find(([partes]) => (partes as TemplateStringsArray).join("?").includes("FOR UPDATE"))
    expect(candado?.slice(1)).toEqual(["p-camila", CLINICA])
  })
})
