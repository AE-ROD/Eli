import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"
import { enviarAvisoProfesional, enviarConfirmacionCliente } from "@/lib/email"
import { MENSAJE_SEDE_NO_VALIDA } from "@/lib/sede-de-la-reserva"

/**
 * La reserva pública con sedes (etapa 9, plan Independiente): `disponibilidad`,
 * `confirmar` y la lista de espera revalidan la sede contra las sedes ACTIVAS del
 * negocio del `slug`. Con dos o más hay que elegir una; con una sola se estampa
 * esa; sin sedes todo es como siempre. El navegador no es de fiar: una sede de
 * otro negocio, una inactiva o un valor mal armado no valen.
 */

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "secreto-de-prueba-de-las-sedes"
})

/** El lunes 7 de enero de 2030 y el martes siguiente; Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const MARTES = "2030-01-08"
const DIA_LUNES = 1
const DIA_MARTES = 2
const aLas = (hora: string, fecha = LUNES) => new Date(`${fecha}T${hora}:00.000-03:00`)

const CENTRO = "sede-centro"
const PROVIDENCIA = "sede-providencia"
/** Una sede que la dueña desactivó: sigue guardada, no se reserva. */
const ANTIGUA = "sede-antigua"
/** La sede de OTRO negocio: nada de ella vale acá. */
const AJENA = "sede-ajena"

const DIRECCION_DEL_CENTRO = { nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia" }

type Registro = Record<string, unknown>

const sede = (id: string, businessId: string, nombre: string, direccion: string, comuna: string, extra: Registro = {}) => ({
  id,
  businessId,
  nombre,
  direccion,
  comuna,
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
const citaDe = (id: string, hora: string, extra: Registro = {}): Registro => ({
  id,
  businessId: NEGOCIO,
  title: "Corte",
  memberId: null,
  startTime: aLas(hora),
  endTime: new Date(aLas(hora).getTime() + 3600_000),
  ...extra,
})

type Sedes = "varias" | "una" | "ninguna"

/**
 * El negocio 1 es Independiente (sin equipo: un solo carril) y el 2 también, con
 * su propia sede. Corte de 60 minutos.
 * - `varias`: Centro (lunes 09–12, martes sin atención) y Providencia (lunes
 *   14–18, martes 14–18), más una sede inactiva.
 * - `una`: sólo Centro (lunes 09–12), más la inactiva.
 * - `ninguna`: el negocio de siempre, plan Equipo y horario general de 09 a 12.
 */
function escenario({ sedes = "varias" as Sedes, citas = [] as Registro[], inscripciones = [] as Registro[] } = {}) {
  const datos = datosBase()
  const conSedes = sedes !== "ninguna"
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({
      ...negocio,
      plan: conSedes ? "independiente" : "equipo",
      listaDeEsperaActiva: true,
    })),
    businessMember: conSedes ? [] : datos.businessMember,
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    sede: conSedes
      ? [
          sede(CENTRO, NEGOCIO, "Centro", "Av. Italia 1234", "Providencia", { orden: 0 }),
          ...(sedes === "varias" ? [sede(PROVIDENCIA, NEGOCIO, "Ñuñoa", "Irarrázaval 500", "Ñuñoa", { orden: 1 })] : []),
          sede(ANTIGUA, NEGOCIO, "Antigua", "Calle Vieja 1", "Santiago", { activo: false }),
          sede(AJENA, OTRO_NEGOCIO, "Ajena", "Otra 1", "Maipú"),
        ]
      : [],
    workSchedule: conSedes
      ? [
          franja("h-centro", NEGOCIO, CENTRO, DIA_LUNES, "09:00", "12:00"),
          ...(sedes === "varias"
            ? [
                franja("h-prov-lun", NEGOCIO, PROVIDENCIA, DIA_LUNES, "14:00", "18:00"),
                franja("h-prov-mar", NEGOCIO, PROVIDENCIA, DIA_MARTES, "14:00", "18:00"),
              ]
            : []),
          franja("h-antigua", NEGOCIO, ANTIGUA, DIA_LUNES, "18:00", "20:00"),
          franja("h-ajena", OTRO_NEGOCIO, AJENA, DIA_LUNES, "09:00", "12:00"),
        ]
      : [
          franja("h-general", NEGOCIO, null, DIA_LUNES, "09:00", "12:00"),
          franja("h-general-2", OTRO_NEGOCIO, null, DIA_LUNES, "09:00", "12:00"),
        ],
    appointment: citas,
    inscripcionEnEspera: inscripciones,
  })
}

const conSlug = (slug = "salon-uno") => ({ params: Promise.resolve({ slug }) })

async function horas(consulta: string, fecha = LUNES, slug = "salon-uno") {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(
    { url: `http://localhost/api/reservar/${slug}/disponibilidad?fecha=${fecha}&servicioId=s-corte${consulta}`, headers: new Headers() } as unknown as NextRequest,
    conSlug(slug)
  )
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function confirmar(hora: string, extra: Registro = {}, slug = "salon-uno") {
  const { POST } = await import("./confirmar/route")
  const cuerpo = { servicioId: "s-corte", fecha: LUNES, hora, nombre: "Lucía", apellido: "Pérez", ...extra }
  const respuesta = await POST({ headers: new Headers(), body: cuerpoDePrueba(cuerpo) } as unknown as NextRequest, conSlug(slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function inscribirse(extra: Registro = {}, fecha = LUNES) {
  const { POST } = await import("./lista-de-espera/route")
  const cuerpo = { servicioId: "s-corte", fecha, nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test", ...extra }
  const pedido = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }) as unknown as NextRequest
  const respuesta = await POST(pedido, conSlug())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const reservasHechas = () => base.buscar("appointment", { source: "reserva-publica" })
const inscripcionesHechas = () => base.buscar("inscripcionEnEspera", {})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  escenario()
})

afterEach(() => {
  vi.useRealTimers()
})

const HORAS_DEL_CENTRO = ["09:00", "09:30", "10:00", "10:30", "11:00"]
const HORAS_DE_PROVIDENCIA = ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"]

describe("GET /api/reservar/[slug]/disponibilidad con sedes", () => {
  it("con varias sedes ofrece las horas de la sede elegida, no la unión de todas", async () => {
    expect(await horas(`&sedeId=${CENTRO}`)).toEqual({ status: 200, cuerpo: { slots: HORAS_DEL_CENTRO } })
    expect(await horas(`&sedeId=${PROVIDENCIA}`)).toEqual({ status: 200, cuerpo: { slots: HORAS_DE_PROVIDENCIA } })
  })

  it("un día en que la sede no atiende no tiene horas, aunque otra sede sí atienda", async () => {
    const enElCentro = await horas(`&sedeId=${CENTRO}`, MARTES)
    const enProvidencia = await horas(`&sedeId=${PROVIDENCIA}`, MARTES)

    expect(enElCentro.cuerpo).toMatchObject({ slots: [], mensaje: "No hay atención ese día", sinListaDeEspera: true })
    expect(enProvidencia.cuerpo).toEqual({ slots: HORAS_DE_PROVIDENCIA })
  })

  it("con varias sedes la elección es obligatoria: sin sede, 400", async () => {
    const { status, cuerpo } = await horas("")

    expect(status).toBe(400)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_NO_VALIDA })
  })

  it.each([
    ["la de otro negocio", `&sedeId=${AJENA}`],
    ["una inactiva", `&sedeId=${ANTIGUA}`],
    ["una que no existe", "&sedeId=no-existe"],
    ["un valor enorme", `&sedeId=${"x".repeat(65)}`],
  ])("%s no vale: 400, y no se filtra nada de otro negocio", async (_caso, consulta) => {
    const { status, cuerpo } = await horas(consulta)

    expect(status).toBe(400)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_NO_VALIDA })
  })

  it("con una sola sede activa no hace falta elegir: se usa el horario de siempre; y una sede ajena tampoco vale", async () => {
    escenario({ sedes: "una" })

    expect(await horas("")).toEqual({ status: 200, cuerpo: { slots: HORAS_DEL_CENTRO } })
    expect(await horas(`&sedeId=${CENTRO}`)).toEqual({ status: 200, cuerpo: { slots: HORAS_DEL_CENTRO } })
    expect((await horas(`&sedeId=${AJENA}`)).status).toBe(400)
    expect((await horas(`&sedeId=${ANTIGUA}`)).status).toBe(400)
  })

  it("sin sedes es idéntico a hoy: el id que llegue se ignora, también uno de otra tabla o mal armado", async () => {
    escenario({ sedes: "ninguna" })
    const sinSede = await horas("")

    expect(sinSede).toEqual({ status: 200, cuerpo: { slots: HORAS_DEL_CENTRO } })
    expect(await horas(`&sedeId=${AJENA}`)).toEqual(sinSede)
    expect(await horas(`&sedeId=${"x".repeat(200)}`)).toEqual(sinSede)
  })

  it("una cita en cualquier sede ocupa a la persona: no está en dos lugares a la vez", async () => {
    // La dueña tiene una cita en Providencia a las 14:00: esa hora no se ofrece en ninguna sede.
    escenario({ citas: [citaDe("c-prov", "14:00", { sedeId: PROVIDENCIA })] })

    expect((await horas(`&sedeId=${PROVIDENCIA}`)).cuerpo.slots).toEqual(HORAS_DE_PROVIDENCIA.filter((hora) => hora !== "14:00" && hora !== "14:30"))
  })
})

describe("POST /api/reservar/[slug]/confirmar con sedes", () => {
  it("con varias sedes guarda la cita en la sede elegida y responde su nombre y dirección", async () => {
    const { status, cuerpo } = await confirmar("09:00", { sedeId: CENTRO })

    expect(status).toBe(201)
    expect(cuerpo.sede).toEqual(DIRECCION_DEL_CENTRO)
    expect(reservasHechas()).toHaveLength(1)
    expect(reservasHechas()[0]).toMatchObject({ businessId: NEGOCIO, sedeId: CENTRO })
    // Ningún dato interno de la sede: ni su id, ni su negocio, ni su teléfono.
    expect(Object.keys(cuerpo.sede).sort()).toEqual(["comuna", "direccion", "nombre"])
  })

  it("los correos reciben dónde es: la sede de la cita, con su dirección", async () => {
    await confirmar("09:00", { sedeId: CENTRO, email: "lucia@correo.test" })

    expect(enviarConfirmacionCliente).toHaveBeenCalledWith(expect.objectContaining({ lugar: DIRECCION_DEL_CENTRO }))
    expect(enviarAvisoProfesional).toHaveBeenCalledWith(expect.objectContaining({ lugar: DIRECCION_DEL_CENTRO }))
  })

  it("la hora tiene que caer en el horario de ESA sede: la de otra sede se rechaza aunque esa sede la atienda", async () => {
    const delOtroLugar = await confirmar("14:00", { sedeId: CENTRO })
    const enSuSede = await confirmar("14:00", { sedeId: PROVIDENCIA })

    expect(delOtroLugar.status).toBe(409)
    expect(delOtroLugar.cuerpo.error).toMatch(/fuera de la atención/)
    expect(enSuSede.status).toBe(201)
    expect(reservasHechas().map((cita) => cita.sedeId)).toEqual([PROVIDENCIA])
  })

  it("con varias sedes sin elegir ninguna: 400, sin cita ni correos", async () => {
    const { status, cuerpo } = await confirmar("09:00", { email: "lucia@correo.test" })

    expect(status).toBe(400)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_NO_VALIDA })
    expect(reservasHechas()).toHaveLength(0)
    expect(enviarConfirmacionCliente).not.toHaveBeenCalled()
    expect(enviarAvisoProfesional).not.toHaveBeenCalled()
  })

  it.each([
    ["la sede de otro negocio", AJENA],
    ["una sede inactiva", ANTIGUA],
    ["una sede que no existe", "no-existe"],
    ["un número", 7],
    ["un objeto", { id: CENTRO }],
    ["un texto enorme", "x".repeat(500)],
  ])("%s no vale: 400 y no se crea nada", async (_caso, sedeId) => {
    const { status, cuerpo } = await confirmar("09:00", { sedeId })

    expect(status).toBe(400)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_NO_VALIDA })
    expect(reservasHechas()).toHaveLength(0)
  })

  it("con una sola sede activa se estampa esa aunque el navegador no mande nada; con una ajena, 400", async () => {
    escenario({ sedes: "una" })

    const sinElegir = await confirmar("09:00")
    const ajena = await confirmar("10:00", { sedeId: AJENA })

    expect(sinElegir.status).toBe(201)
    expect(sinElegir.cuerpo.sede).toEqual(DIRECCION_DEL_CENTRO)
    expect(ajena.status).toBe(400)
    expect(reservasHechas().map((cita) => cita.sedeId)).toEqual([CENTRO])
  })

  it("sin sedes es idéntico a hoy: la cita queda sin sede, sin `sede` en la respuesta ni `lugar` en los correos, y el id que llegue se ignora", async () => {
    escenario({ sedes: "ninguna" })

    const { status, cuerpo } = await confirmar("09:00", { sedeId: AJENA, email: "lucia@correo.test" })

    expect(status).toBe(201)
    expect(cuerpo).not.toHaveProperty("sede")
    expect(reservasHechas()).toHaveLength(1)
    expect(reservasHechas()[0].sedeId ?? null).toBeNull()
    expect(enviarConfirmacionCliente).toHaveBeenCalledWith(expect.not.objectContaining({ lugar: expect.anything() }))
    expect(enviarAvisoProfesional).toHaveBeenCalledWith(expect.not.objectContaining({ lugar: expect.anything() }))
  })

  it("el negocio es el del slug: en el otro negocio vale SU sede y no la de este, y la cita queda en el suyo", async () => {
    const conLaDeEste = await confirmar("09:00", { servicioId: "s-ajeno", sedeId: CENTRO }, "salon-dos")
    const conLaSuya = await confirmar("09:00", { servicioId: "s-ajeno", sedeId: AJENA }, "salon-dos")

    expect(conLaDeEste.status).toBe(400)
    expect(conLaSuya.status).toBe(201)
    expect(conLaSuya.cuerpo.sede).toEqual({ nombre: "Ajena", direccion: "Otra 1", comuna: "Maipú" })
    expect(reservasHechas()).toHaveLength(1)
    expect(reservasHechas()[0]).toMatchObject({ businessId: OTRO_NEGOCIO, sedeId: AJENA })
  })
})

describe("POST /api/reservar/[slug]/lista-de-espera con sedes", () => {
  /** El lunes del Centro, lleno: ninguna cancelación del Centro tiene horas libres, pero Providencia sí. */
  const centroLleno = () =>
    escenario({
      citas: ["09:00", "10:00", "11:00"].map((hora) => citaDe(`c-${hora}`, hora, { sedeId: CENTRO })),
    })

  it("con varias sedes guarda en qué sede espera, sólo si ESA sede no tiene horas", async () => {
    centroLleno()

    const enElCentro = await inscribirse({ sedeId: CENTRO })
    const enProvidencia = await inscribirse({ sedeId: PROVIDENCIA })

    expect(enElCentro.status).toBe(201)
    // Providencia tiene horas libres ese lunes: se rechaza, como un día con horas.
    expect(enProvidencia.status).toBe(409)
    expect(inscripcionesHechas()).toHaveLength(1)
    expect(inscripcionesHechas()[0]).toMatchObject({ businessId: NEGOCIO, sedeId: CENTRO, estado: "activa" })
  })

  it("con varias sedes y sin elegir ninguna: 400, y no se crea nada", async () => {
    centroLleno()

    const { status, cuerpo } = await inscribirse()

    expect(status).toBe(400)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_NO_VALIDA })
    expect(inscripcionesHechas()).toHaveLength(0)
  })

  it.each([
    ["la sede de otro negocio", AJENA],
    ["una sede inactiva", ANTIGUA],
    ["un valor mal armado", { id: CENTRO }],
  ])("%s no vale: 400", async (_caso, sedeId) => {
    centroLleno()

    expect((await inscribirse({ sedeId })).status).toBe(400)
    expect(inscripcionesHechas()).toHaveLength(0)
  })

  it("una sede que no atiende ese día no tiene horas que se liberen: se rechaza sin guardar", async () => {
    const { status, cuerpo } = await inscribirse({ sedeId: CENTRO }, MARTES)

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/no hay atención/i)
    expect(inscripcionesHechas()).toHaveLength(0)
  })

  it("con una sola sede activa se guarda esa; sin sedes queda sin sede, como hoy", async () => {
    escenario({ sedes: "una", citas: ["09:00", "10:00", "11:00"].map((hora) => citaDe(`c-${hora}`, hora, { sedeId: CENTRO })) })
    expect((await inscribirse()).status).toBe(201)
    expect(inscripcionesHechas()[0]).toMatchObject({ sedeId: CENTRO })

    escenario({ sedes: "ninguna", citas: ["09:00", "10:00", "11:00"].map((hora) => citaDe(`c-${hora}`, hora)) })
    expect((await inscribirse({ sedeId: AJENA })).status).toBe(201)
    expect(inscripcionesHechas()[0].sedeId ?? null).toBeNull()
  })
})
