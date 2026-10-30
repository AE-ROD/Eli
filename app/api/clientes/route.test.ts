import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { coincide as coincideEnLaBase, ordenar, proyectar, type Registro, type Tablas } from "@/pruebas/consultas-falsas"
// Registra `customer.appointments` en la base falsa: sin la relación,
// `proyectar` no sabe leer el historial anidado y lanza.
import "./_pruebas/base-de-clientes"
import { MARCA_DE_CLIENTE_ELIMINADO, NOMBRE_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

/**
 * Filtro mínimo que entiende las formas de `where` que produce el listado:
 * `AND`, `OR`, `NOT` (los clientes eliminados), igualdad simple, y las condiciones de la búsqueda (`contains`
 * sin distinguir mayúsculas, `has` sobre la lista de etiquetas). Alcanza para
 * que el mock de Prisma filtre de verdad según lo que el endpoint le pasa, en
 * vez de limitarse a inspeccionar el argumento.
 *
 * Es sólo para el `where` de los clientes, que trae la búsqueda y la base
 * falsa no la entiende. El historial anidado lo resuelve `proyectar`, de la
 * base falsa, que lanza ante cualquier operador que no conozca.
 */
function coincide(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === "AND") {
      return (valor as Record<string, unknown>[]).every((sub) => coincide(item, sub))
    }
    if (clave === "OR") {
      return (valor as Record<string, unknown>[]).some((sub) => coincide(item, sub))
    }
    if (clave === "NOT") {
      return !coincide(item, valor as Record<string, unknown>)
    }
    if (valor && typeof valor === "object") {
      const condicion = valor as Record<string, unknown>
      if ("contains" in condicion) {
        return String(item[clave] ?? "").toLowerCase().includes(String(condicion.contains).toLowerCase())
      }
      if ("has" in condicion) {
        return ((item[clave] as unknown[]) ?? []).includes(condicion.has)
      }
    }
    return item[clave] === valor
  })
}

/**
 * `skip` y `take` como los trata Prisma, que es contra lo que tiene que
 * aguantar el tope de 50: si no son enteros, la consulta falla (el 500 de
 * `limite=abc`), y un `take` negativo toma desde el final de la lista en vez
 * de cortarla, que es por donde `limite=-100000` se traía todo.
 */
function paginarComoPrisma<T>(lista: T[], { skip = 0, take }: { skip?: number; take?: number }): T[] {
  if (!Number.isInteger(skip) || skip < 0) throw new Error(`Prisma rechaza skip=${skip}`)
  if (take === undefined) return lista.slice(skip)
  if (!Number.isInteger(take)) throw new Error(`Prisma rechaza take=${take}`)
  if (take >= 0) return lista.slice(skip, skip + take)
  const hasta = Math.max(0, lista.length - skip)
  return lista.slice(Math.max(0, hasta + take), hasta)
}

const creadoEl = (dia: number) => new Date(Date.UTC(2026, 0, dia))

const clientesFake: Registro[] = [
  { id: "cliente-1", businessId: "negocio-1", name: "Ana", lastName: "Pérez", email: "ana@example.com", phone: null, tags: ["vip"], notes: null, whatsappConsentAt: null, correoPromoConsentAt: null, createdAt: creadoEl(1) },
  { id: "cliente-2", businessId: "negocio-1", name: "Beto Soto", lastName: null, email: null, phone: "+56 9 1111 1111", tags: [], notes: null, whatsappConsentAt: null, correoPromoConsentAt: null, createdAt: creadoEl(2) },
  /** Se llama igual que `cliente-1` y tiene su misma etiqueta: sólo el negocio los distingue. */
  { id: "cliente-ajeno", businessId: "negocio-2", name: "Ana", lastName: "Pérez", email: "ana@otro.com", phone: null, tags: ["vip"], notes: null, whatsappConsentAt: null, correoPromoConsentAt: null, createdAt: creadoEl(1) },
  /** Un negocio con sesenta clientes, para probar la paginación contra el tope de 50. */
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `cliente-grande-${i + 1}`,
    businessId: "negocio-3",
    name: `Cliente ${i + 1}`,
    lastName: null,
    email: null,
    phone: null,
    tags: [],
    notes: null,
    whatsappConsentAt: null,
    correoPromoConsentAt: null,
    createdAt: creadoEl(i + 1),
  })),
]

/** Una cita del negocio 1, salvo lo que se pise. */
function cita(id: string, customerId: string, memberId: string | null, dia: string, datos: Registro = {}): Registro {
  return {
    id,
    businessId: "negocio-1",
    customerId,
    memberId,
    title: "Corte",
    status: "completada",
    startTime: new Date(`2026-09-${dia}T13:00:00.000Z`),
    endTime: new Date(`2026-09-${dia}T13:30:00.000Z`),
    price: 8000,
    notes: null,
    clientComments: null,
    confirmacionPorFaltas: false,
    ...datos,
  }
}

const citasFake: Registro[] = [
  cita("cita-propia", "cliente-1", "member-worker-1", "01"),
  cita("cita-del-colega", "cliente-1", "member-worker-2", "10", {
    price: 30000,
    notes: "Nota interna del colega",
    clientComments: "Pidió que no la llamen",
  }),
  // De la página pública, sin profesional: la ven el dueño y el encargado.
  cita("cita-sin-asignar", "cliente-1", null, "05"),
  cita("cita-del-colega-con-beto", "cliente-2", "member-worker-2", "12"),
  // Inconsistente a propósito: del otro negocio, pero apunta a `cliente-1`.
  cita("cita-cruzada", "cliente-1", "member-ajeno", "15", { businessId: "negocio-2", notes: "Nota del otro negocio" }),
  cita("cita-ajena", "cliente-ajeno", "member-ajeno", "03", { businessId: "negocio-2" }),
]

/** Una atención del negocio 1, cobrada, salvo lo que se pise. */
function atencionCobrada(id: string, customerId: string, dia: string, datos: Registro = {}): Registro {
  return {
    id,
    businessId: "negocio-1",
    customerId,
    customerName: "x",
    appointmentId: null,
    status: "finalizada",
    arrivedAt: new Date(`2026-09-${dia}T13:00:00.000Z`),
    ...datos,
  }
}

const atencionesFake: Registro[] = []

const tablas: Tablas = {
  user: [],
  business: [],
  businessMember: [],
  service: [],
  visit: atencionesFake,
  visitService: [],
  visitPayment: [],
  workSchedule: [],
  timeBlock: [],
  memberService: [],
  commissionRate: [],
  commissionChange: [],
  producto: [],
  propinaDeAtencion: [],
  liquidacion: [],
  movimientoDeLiquidacion: [],
  cierreDeCaja: [],
  inscripcionEnEspera: [],
  envioAClientes: [],
  appointmentService: [],
  franjaDeHoraValle: [],
  customer: clientesFake,
  appointment: citasFake,
}

interface ArgsDeListado {
  where: Record<string, unknown>
  orderBy?: unknown
  skip?: number
  take?: number
  select?: unknown
}

const prismaMock = {
  customer: {
    findMany: vi.fn((args: ArgsDeListado) => {
      const encontrados = ordenar(clientesFake.filter((c) => coincide(c, args.where)), args.orderBy)
      return Promise.resolve(paginarComoPrisma(encontrados, args).map((c) => proyectar(tablas, "customer", c, args)))
    }),
    count: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(clientesFake.filter((c) => coincide(c, args.where)).length)
    ),
    create: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "cliente-nuevo", ...args.data })
    ),
  },
}

/**
 * Las próximas citas: el `where` lo resuelve la base falsa, que lanza ante lo
 * que no entiende. `distinct` no lo aplica: el endpoint se queda con la
 * primera de cada cliente por su cuenta.
 */
const appointmentMock = {
  findMany: vi.fn((args: { where: unknown; orderBy?: unknown; select?: unknown }) =>
    Promise.resolve(
      ordenar(
        citasFake.filter((c) => coincideEnLaBase(tablas, "appointment", c, args.where)),
        args.orderBy
      ).map((c) => proyectar(tablas, "appointment", c, args))
    )
  ),
}
Object.assign(prismaMock, { appointment: appointmentMock })

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionEncargado = {
  user: { id: "admin-1", role: "admin", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-admin-1" },
}

const sesionProfesional = {
  user: {
    id: "worker-1",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: "member-worker-1",
  },
}

/** Otro profesional del mismo negocio: sus citas con los clientes no son de `worker-1`. */
const sesionColega = {
  user: { id: "worker-2", role: "worker", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-worker-2" },
}

/** Profesional legítimo del negocio, pero sin `memberId`: el historial le tiene que fallar cerrado. */
const sesionProfesionalSinMiembro = {
  user: { id: "worker-3", role: "worker", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionOtroNegocio = {
  user: { id: "owner-2", role: "owner", businessId: "negocio-2", businessName: "Otro negocio" },
}

const sesionNegocioGrande = {
  user: { id: "owner-3", role: "owner", businessId: "negocio-3", businessName: "Negocio grande" },
}

/** Token viejo o mal formado: hay usuario, pero ningún negocio al que atarlo. */
const sesionSinNegocio = {
  user: { id: "owner-3", role: "owner", businessId: "", businessName: "" },
}

const ids = (clientes: { id: string }[]) => clientes.map((c) => c.id).sort()

interface ClienteDelListado {
  id: string
  appointments: { id: string }[]
}

/** El historial de cada cliente del listado, en el orden en que llegó. */
const historiales = (clientes: ClienteDelListado[]) =>
  Object.fromEntries(clientes.map((c) => [c.id, c.appointments.map((a) => a.id)]))

const fakeGet = (query = ""): NextRequest =>
  ({ url: `http://localhost/api/clientes${query}` }) as unknown as NextRequest

const fakePost = (body: Record<string, unknown>): NextRequest =>
  ({
    url: "http://localhost/api/clientes",
    json: () => Promise.resolve(body),
  }) as unknown as NextRequest

describe("GET /api/clientes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("el listado sólo trae los clientes del negocio de la sesión", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(ids(data.clientes)).toEqual(["cliente-1", "cliente-2"])
    expect(data.total).toBe(2)
  })

  it("cada cliente trae su apellido, para que el buscador muestre el nombre completo", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet("?q=ana"))).json()

    expect(data.clientes).toEqual([expect.objectContaining({ id: "cliente-1", name: "Ana", lastName: "Pérez" })])
  })

  it("sin apellido cargado, viaja en null", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()

    expect(data.clientes.find((c: { id: string }) => c.id === "cliente-2").lastName).toBeNull()
  })

  it("el otro negocio ve sólo lo suyo: el aislamiento va en los dos sentidos", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionOtroNegocio)

    const res = await GET(fakeGet())
    const data = await res.json()

    expect(ids(data.clientes)).toEqual(["cliente-ajeno"])
    expect(data.total).toBe(1)
  })

  it("la búsqueda y la etiqueta no se cuelan a otro negocio, aunque el cliente de allá coincida", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    // `cliente-ajeno` se llama igual y tiene la misma etiqueta: coincidiría con
    // todo el filtro menos con el negocio.
    const res = await GET(fakeGet("?q=ana&tag=vip"))
    const data = await res.json()

    expect(ids(data.clientes)).toEqual(["cliente-1"])
    expect(data.total).toBe(1)
  })

  it("los clientes son del negocio, no del profesional: un worker ve los mismos que el dueño", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeGet())
    const data = await res.json()

    expect(ids(data.clientes)).toEqual(["cliente-1", "cliente-2"])
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeGet())

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled()
    expect(prismaMock.customer.count).not.toHaveBeenCalled()
  })

  it("una sesión sin negocio recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionSinNegocio)

    const res = await GET(fakeGet())

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled()
  })
})

describe("GET /api/clientes — el historial de citas de cada cliente", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["el dueño", sesionDueño],
    ["el encargado", sesionEncargado],
  ])("%s ve las citas de todo el equipo, de la más reciente a la más vieja", async (_quien, sesion) => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)

    const data = await (await GET(fakeGet())).json()

    expect(historiales(data.clientes)).toEqual({
      "cliente-1": ["cita-del-colega", "cita-sin-asignar", "cita-propia"],
      "cliente-2": ["cita-del-colega-con-beto"],
    })
  })

  it("el profesional ve sólo sus citas con cada cliente: ni las de su colega, ni sus notas, ni lo que cobró", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const data = await (await GET(fakeGet())).json()

    // Beto sigue en el listado (es cliente del negocio), pero sin historial con él.
    expect(historiales(data.clientes)).toEqual({ "cliente-1": ["cita-propia"], "cliente-2": [] })
    expect(JSON.stringify(data)).not.toMatch(/cita-del-colega|30000/)
  })

  it("y al revés: el colega no ve las citas del primero", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionColega)

    const data = await (await GET(fakeGet())).json()

    expect(historiales(data.clientes)).toEqual({
      "cliente-1": ["cita-del-colega"],
      "cliente-2": ["cita-del-colega-con-beto"],
    })
  })

  it("un profesional sin memberId ve los clientes, pero ningún historial: falla cerrado", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesionalSinMiembro)

    const data = await (await GET(fakeGet())).json()

    expect(historiales(data.clientes)).toEqual({ "cliente-1": [], "cliente-2": [] })
  })

  it("una cita de otro negocio no entra al historial, aunque apunte al cliente", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()

    expect(historiales(data.clientes)["cliente-1"]).not.toContain("cita-cruzada")
    expect(JSON.stringify(data)).not.toContain("Nota del otro negocio")
  })

  it("cada cita trae sólo lo que dibuja la vista: ni notas internas ni comentarios del cliente", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()
    const citas = data.clientes.flatMap((c: ClienteDelListado) => c.appointments)

    expect(citas).toHaveLength(4)
    for (const citaDelHistorial of citas) {
      expect(Object.keys(citaDelHistorial).sort()).toEqual([
        "conAtencion",
        "confirmacionPorFaltas",
        "endTime",
        "id",
        "price",
        "startTime",
        "status",
        "title",
      ])
    }
    expect(JSON.stringify(data)).not.toMatch(/Nota interna|Pidió que no la llamen/)
  })

  it("conAtencion: la cita cuyo cliente ya llegó (atención no anulada) deja de estar por confirmar; la atención no viaja", async () => {
    const { GET } = await import("./route")
    const agregadas = [
      atencionCobrada("v-llego", "cliente-1", "01", { appointmentId: "cita-propia", status: "en-espera" }),
      atencionCobrada("v-anulada", "cliente-1", "05", { appointmentId: "cita-sin-asignar", status: "anulada" }),
    ]
    atencionesFake.push(...agregadas)
    try {
      mockGetServerSession.mockResolvedValueOnce(sesionDueño)
      const data = await (await GET(fakeGet())).json()
      const citas = Object.fromEntries(
        data.clientes
          .flatMap((c: { appointments: { id: string; conAtencion: boolean }[] }) => c.appointments)
          .map((a: { id: string; conAtencion: boolean }) => [a.id, a.conAtencion])
      )
      expect(citas).toMatchObject({ "cita-propia": true, "cita-sin-asignar": false, "cita-del-colega": false })
      expect(JSON.stringify(data)).not.toMatch(/"visit"|en-espera|anulada/)
    } finally {
      atencionesFake.splice(0, atencionesFake.length)
    }
  })
})

/**
 * Lo que se agrega sólo para estos tests y se saca al terminar: el resto del
 * archivo cuenta clientes e historiales exactos.
 */
function conFilasExtra(extra: { clientes?: Registro[]; citas?: Registro[]; atenciones?: Registro[] }) {
  const listas: [Registro[], Registro[]][] = [
    [clientesFake, extra.clientes ?? []],
    [citasFake, extra.citas ?? []],
    [atencionesFake, extra.atenciones ?? []],
  ]
  beforeEach(() => {
    for (const [lista, filas] of listas) lista.push(...filas)
  })
  afterEach(() => {
    for (const [lista, filas] of listas) {
      for (const fila of filas) lista.splice(lista.indexOf(fila), 1)
    }
  })
}

interface ClienteConVisitas {
  id: string
  visitas: number
  ultimaVisita: string | null
  proximaCita: string | null
}

const resumenDe = (clientes: ClienteConVisitas[], id: string) => {
  const cliente = clientes.find((c) => c.id === id)
  return cliente && { visitas: cliente.visitas, ultimaVisita: cliente.ultimaVisita, proximaCita: cliente.proximaCita }
}

describe("GET /api/clientes — los clientes eliminados", () => {
  beforeEach(() => vi.clearAllMocks())

  conFilasExtra({
    clientes: [
      {
        id: "cliente-eliminado",
        businessId: "negocio-1",
        name: NOMBRE_DE_CLIENTE_ELIMINADO,
        lastName: null,
        email: null,
        phone: null,
        tags: [MARCA_DE_CLIENTE_ELIMINADO],
        notes: null,
        createdAt: creadoEl(3),
      },
    ],
  })

  it("no aparecen en la lista ni cuentan en el total", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()

    expect(ids(data.clientes)).toEqual(["cliente-1", "cliente-2"])
    expect(data.total).toBe(2)
  })

  it("tampoco en los buscadores de \"Nueva cita\" y \"Anotar sin reserva\", ni buscándolos por su nombre", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const porNombre = await (await GET(fakeGet("?q=eliminado&limite=8"))).json()

    expect(porNombre.clientes).toEqual([])
    expect(porNombre.total).toBe(0)
  })
})

describe("GET /api/clientes — visitas, última visita y próxima cita", () => {
  beforeEach(() => vi.clearAllMocks())

  conFilasExtra({
    atenciones: [
      // Cobrada, de una reserva de `member-worker-1`.
      atencionCobrada("v-propia", "cliente-1", "01", { appointmentId: "cita-propia" }),
      // Cobrada, sin reserva: la más reciente de las cobradas.
      atencionCobrada("v-sin-reserva", "cliente-1", "10"),
      // Más nuevas, pero no son visitas: una anulada y una que sigue abierta.
      atencionCobrada("v-anulada", "cliente-1", "20", { status: "anulada" }),
      atencionCobrada("v-abierta", "cliente-1", "25", { status: "en-espera" }),
      // Inconsistente a propósito: de otro negocio, pero apunta a `cliente-1`.
      atencionCobrada("v-cruzada", "cliente-1", "28", { businessId: "negocio-2" }),
    ],
    citas: [
      cita("futura-del-colega", "cliente-1", "member-worker-2", "01", {
        status: "pendiente",
        startTime: new Date("2099-01-10T13:00:00.000Z"),
        endTime: new Date("2099-01-10T13:30:00.000Z"),
      }),
      // Más cercana, pero cancelada: no es la próxima.
      cita("futura-cancelada", "cliente-1", "member-worker-1", "01", {
        status: "cancelada",
        startTime: new Date("2099-01-05T13:00:00.000Z"),
        endTime: new Date("2099-01-05T13:30:00.000Z"),
      }),
      cita("futura-propia", "cliente-1", "member-worker-1", "01", {
        status: "confirmada",
        startTime: new Date("2099-02-01T13:00:00.000Z"),
        endTime: new Date("2099-02-01T13:30:00.000Z"),
      }),
      // De otro negocio, más cercana que todas: no se cuela.
      cita("futura-cruzada", "cliente-1", "member-ajeno", "01", {
        businessId: "negocio-2",
        status: "pendiente",
        startTime: new Date("2099-01-01T13:00:00.000Z"),
        endTime: new Date("2099-01-01T13:30:00.000Z"),
      }),
    ],
  })

  it("visitas son las atenciones cobradas del negocio, no las citas; la última es la cobrada más reciente; la próxima, la cita futura en pie más cercana", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()

    expect(resumenDe(data.clientes, "cliente-1")).toEqual({
      visitas: 2,
      ultimaVisita: "2026-09-10T13:00:00.000Z",
      proximaCita: "2099-01-10T13:00:00.000Z",
    })
  })

  it("las visitas no se cortan en cinco como el historial: se cuentan en la base", async () => {
    const { GET } = await import("./route")

    const muchas = Array.from({ length: 7 }, (_, i) => atencionCobrada(`v-extra-${i}`, "cliente-2", String(i + 1).padStart(2, "0")))
    atencionesFake.push(...muchas)
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()
    atencionesFake.splice(atencionesFake.indexOf(muchas[0]), muchas.length)

    expect(resumenDe(data.clientes, "cliente-2")?.visitas).toBe(7)
  })

  it("sin atenciones cobradas ni citas futuras: cero visitas, y ni última ni próxima", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()

    expect(resumenDe(data.clientes, "cliente-2")).toEqual({ visitas: 0, ultimaVisita: null, proximaCita: null })
  })

  it("el profesional cuenta sólo sus atenciones y ve sólo su próxima cita, como en el historial", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    const delProfesional = await (await GET(fakeGet())).json()

    mockGetServerSession.mockResolvedValueOnce(sesionColega)
    const delColega = await (await GET(fakeGet())).json()

    expect(resumenDe(delProfesional.clientes, "cliente-1")).toEqual({
      visitas: 1,
      ultimaVisita: "2026-09-01T13:00:00.000Z",
      proximaCita: "2099-02-01T13:00:00.000Z",
    })
    expect(resumenDe(delColega.clientes, "cliente-1")).toEqual({
      visitas: 0,
      ultimaVisita: null,
      proximaCita: "2099-01-10T13:00:00.000Z",
    })
  })

  it("no devuelve los datos crudos de las atenciones: sólo el resumen", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const data = await (await GET(fakeGet())).json()

    for (const cliente of data.clientes) {
      expect(cliente).not.toHaveProperty("visits")
      expect(cliente).not.toHaveProperty("_count")
    }
  })
})

describe("GET /api/clientes — inasistencias (\"No vino\")", () => {
  beforeEach(() => vi.clearAllMocks())

  conFilasExtra({
    citas: [
      cita("no-vino-1", "cliente-2", "member-worker-1", "02", { status: "no-asistio" }),
      cita("no-vino-2", "cliente-2", "member-worker-2", "04", { status: "no-asistio" }),
      // Cancelada no es inasistencia: avisó.
      cita("cancelada", "cliente-2", "member-worker-1", "06", { status: "cancelada" }),
      // Inconsistente a propósito: de otro negocio, pero apunta a `cliente-2`.
      cita("no-vino-cruzada", "cliente-2", "member-ajeno", "08", { businessId: "negocio-2", status: "no-asistio" }),
    ],
  })

  const inasistenciasDe = (clientes: { id: string; inasistencias: number }[], id: string) =>
    clientes.find((cliente) => cliente.id === id)?.inasistencias

  it("cuenta las citas marcadas 'no vino' del negocio: ni las canceladas ni las de otro negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const data = await (await GET(fakeGet())).json()

    expect(inasistenciasDe(data.clientes, "cliente-2")).toBe(2)
    expect(inasistenciasDe(data.clientes, "cliente-1")).toBe(0)
  })

  it("el profesional cuenta sólo las suyas, como en el historial", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    const data = await (await GET(fakeGet())).json()

    expect(inasistenciasDe(data.clientes, "cliente-2")).toBe(1)
  })
})

describe("GET /api/clientes — paginación", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pedirPagina = async (query: string) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionNegocioGrande)
    const res = await GET(fakeGet(query))
    return { status: res.status, data: await res.json() }
  }

  it("un `limite` negativo no se saltea el tope de 50: devuelve una página normal", async () => {
    const { status, data } = await pedirPagina("?limite=-100000")

    expect(status).toBe(200)
    expect(data.clientes).toHaveLength(20)
    expect(data.paginas).toBe(3)
  })

  it("un `limite` por encima de 50 no lo supera", async () => {
    const { status, data } = await pedirPagina("?limite=1000")

    expect(status).toBe(200)
    expect(data.clientes.length).toBeLessThanOrEqual(50)
  })

  it("`pagina` y `limite` que no son números caen a los valores por defecto, en vez de un 500", async () => {
    const { status, data } = await pedirPagina("?pagina=abc&limite=xyz")

    expect(status).toBe(200)
    expect(data.pagina).toBe(1)
    expect(data.clientes).toHaveLength(20)
  })

  it.each(["-3", "0", "2.5", "1e300"])("una página que no es un entero positivo exacto (%s) vuelve a la primera", async (pagina) => {
    const { status, data } = await pedirPagina(`?pagina=${pagina}`)

    expect(status).toBe(200)
    expect(data.pagina).toBe(1)
    expect(data.clientes).toHaveLength(20)
  })

  it("lo que pide la interfaz se respeta: 18 por página en Clientes, 8 en los buscadores, 50 como máximo", async () => {
    const clientes = await pedirPagina("?pagina=2&limite=18")
    expect(clientes.data).toMatchObject({ pagina: 2, paginas: 4, total: 60 })
    expect(clientes.data.clientes).toHaveLength(18)

    const buscador = await pedirPagina("?limite=8")
    expect(buscador.data.clientes).toHaveLength(8)

    const maximo = await pedirPagina("?limite=50&pagina=2")
    expect(maximo.data).toMatchObject({ pagina: 2, paginas: 2 })
    expect(maximo.data.clientes).toHaveLength(10)
  })
})

describe("POST /api/clientes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("crea el cliente en el negocio de la sesión", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(fakePost({ name: "Carla Díaz", phone: "+56 9 2222 2222" }))

    expect(res.status).toBe(201)
    expect(prismaMock.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Carla Díaz", businessId: "negocio-1" }),
    })
  })

  it("la profesional también crea clientes: los necesita para anotar a quien llega (PRODUCTO.md, sección 10)", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await POST(fakePost({ name: "Carla Díaz" }))

    expect(res.status).toBe(201)
    expect(prismaMock.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Carla Díaz", businessId: "negocio-1" }),
    })
  })

  it("el cuerpo no elige el negocio: un `businessId` ajeno se ignora", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    await POST(fakePost({ name: "Carla Díaz", businessId: "negocio-2" }))

    const { data } = prismaMock.customer.create.mock.calls[0][0]
    expect(data.businessId).toBe("negocio-1")
  })

  it("sin sesión recibe 401 y no crea nada", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakePost({ name: "Carla Díaz" }))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.create).not.toHaveBeenCalled()
  })
})

describe("POST /api/clientes — largos y tipos", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["un nombre de 101 caracteres", { name: "a".repeat(101) }, "El nombre no puede tener más de 100 caracteres"],
    ["un nombre de puros espacios", { name: "     " }, "El nombre tiene que tener al menos 2 caracteres"],
    ["un teléfono de 31 caracteres", { name: "Ana", phone: "1".repeat(31) }, "El teléfono no puede tener más de 30 caracteres"],
    ["un email de 255 caracteres", { name: "Ana", email: `${"a".repeat(243)}@correo.test` }, "El email no puede tener más de 254 caracteres"],
    ["un email que no es email", { name: "Ana", email: "ana-arroba-correo" }, "El email no es válido"],
    ["unas notas de 2001 caracteres", { name: "Ana", notes: "a".repeat(2001) }, "Las notas no pueden tener más de 2000 caracteres"],
    ["21 etiquetas", { name: "Ana", tags: Array.from({ length: 21 }, (_, i) => `e${i}`) }, "No puede haber más de 20 etiquetas"],
    ["una etiqueta de 31 caracteres", { name: "Ana", tags: ["a".repeat(31)] }, "Cada etiqueta puede tener hasta 30 caracteres"],
  ])("rechaza %s: 400 con un error legible, sin `detalles`, y no crea nada", async (_caso, cuerpo, mensaje) => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(fakePost(cuerpo))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.customer.create).not.toHaveBeenCalled()
  })

  it("acepta los bordes y guarda el texto sin los espacios de las puntas", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(
      fakePost({
        name: `  ${"a".repeat(100)}  `,
        phone: "  +56 (9) 1234-5678  ",
        email: `${"a".repeat(242)}@correo.test`,
        notes: "a".repeat(2000),
        tags: Array.from({ length: 20 }, () => "b".repeat(30)),
      })
    )

    expect(res.status).toBe(201)
    const { data } = prismaMock.customer.create.mock.calls[0][0]
    expect(data.name).toBe("a".repeat(100))
    expect(data.email).toHaveLength(254)
    expect(data.phone).toBe("+56912345678")
  })

  it("un email vacío sigue siendo \"sin email\"", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(fakePost({ name: "Ana", email: "", phone: "" }))

    expect(res.status).toBe(201)
    expect(prismaMock.customer.create.mock.calls[0][0].data).toMatchObject({ email: null, phone: null })
  })
})

describe("POST /api/clientes — teléfono en E.164 y consentimiento de WhatsApp", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(["9 1234 5678", "+56 9 1234 5678", "56912345678", "912345678"])(
    "guarda %j como +56912345678",
    async (escrito) => {
      const { POST } = await import("./route")
      mockGetServerSession.mockResolvedValueOnce(sesionDueño)

      const res = await POST(fakePost({ name: "Ana", phone: escrito }))

      expect(res.status).toBe(201)
      expect(prismaMock.customer.create.mock.calls[0][0].data.phone).toBe("+56912345678")
    }
  )

  it.each(["12345", "+54 9 11 1234 5678", "llámame"])(
    "un teléfono que no se puede leer (%j) es 400 con un mensaje claro y no crea nada",
    async (escrito) => {
      const { POST } = await import("./route")
      mockGetServerSession.mockResolvedValueOnce(sesionDueño)

      const res = await POST(fakePost({ name: "Ana", phone: escrito }))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/No pudimos leer el teléfono/)
      expect(prismaMock.customer.create).not.toHaveBeenCalled()
    }
  )

  it("marcado, registra cuándo y que fue desde el panel", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const antes = Date.now()
    await POST(fakePost({ name: "Ana", whatsappConsent: true }))

    const { data } = prismaMock.customer.create.mock.calls[0][0]
    expect(data.whatsappConsentSource).toBe("panel")
    expect(data.whatsappConsentAt).toBeInstanceOf(Date)
    expect((data.whatsappConsentAt as Date).getTime()).toBeGreaterThanOrEqual(antes)
  })

  it.each([["sin marcar", false], ["sin mandarlo", undefined]])("%s, no hay consentimiento", async (_caso, valor) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    await POST(fakePost({ name: "Ana", ...(valor !== undefined && { whatsappConsent: valor }) }))

    const { data } = prismaMock.customer.create.mock.calls[0][0]
    expect(data.whatsappConsentAt).toBeUndefined()
    expect(data.whatsappConsentSource).toBeUndefined()
  })

  it("el origen del consentimiento no lo elige el cuerpo", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    await POST(fakePost({ name: "Ana", whatsappConsent: true, whatsappConsentSource: "reserva-publica", whatsappConsentAt: "2020-01-01" }))

    const { data } = prismaMock.customer.create.mock.calls[0][0]
    expect(data.whatsappConsentSource).toBe("panel")
    expect((data.whatsappConsentAt as Date).getFullYear()).toBeGreaterThan(2020)
  })

  it("el consentimiento promocional por correo, marcado, registra cuándo y que fue desde el panel; sin marcar, no hay", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    await POST(fakePost({ name: "Ana", correoPromoConsent: true, correoPromoConsentSource: "reserva-publica" }))
    const marcado = prismaMock.customer.create.mock.calls[0][0].data
    expect(marcado.correoPromoConsentSource).toBe("panel")
    expect(marcado.correoPromoConsentAt).toBeInstanceOf(Date)

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    await POST(fakePost({ name: "Beto", correoPromoConsent: false }))
    const sinMarcar = prismaMock.customer.create.mock.calls[1][0].data
    expect(sinMarcar.correoPromoConsentAt).toBeUndefined()
    expect(sinMarcar.correoPromoConsentSource).toBeUndefined()
  })

  it("la profesional crea clientes, pero no con el consentimiento promocional: 401 y no crea nada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: "u-carla", role: "worker", businessId: "negocio-1", businessName: "Salón", memberId: "m-carla" },
    })

    const res = await POST(fakePost({ name: "Ana", correoPromoConsent: true }))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.create).not.toHaveBeenCalled()
  })
})

