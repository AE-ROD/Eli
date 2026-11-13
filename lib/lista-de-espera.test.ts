import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { hashDeToken } from "@/lib/tokens"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const enviarAviso = vi.fn()
vi.mock("@/lib/email", () => ({
  enviarAvisoListaDeEspera: (...args: unknown[]) => enviarAviso(...args),
}))

let m: typeof import("./lista-de-espera")
beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "secreto-de-prueba-de-la-lista-de-espera"
  process.env.NEXTAUTH_URL = "https://eli.test"
  m = await import("./lista-de-espera")
})

/** Miércoles 28 de octubre de 2026, 10:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-28T13:00:00.000Z")
/** Lunes 2 de noviembre: el negocio atiende de 9 a 11, dos horas de 60 minutos. */
const LUNES = "2026-11-02"
const A_LAS_9 = new Date("2026-11-02T12:00:00.000Z")
const A_LAS_10 = new Date("2026-11-02T13:00:00.000Z")
const OK = { data: { id: "correo" }, error: null }

type Registro = Record<string, unknown>

const cita = (id: string, startTime: Date, extra: Registro = {}) => ({
  id,
  businessId: "n1",
  title: "Corte",
  serviceId: "s1",
  startTime,
  endTime: new Date(startTime.getTime() + 60 * 60_000),
  ...extra,
})

const inscripcion = (id: string, extra: Registro = {}) => ({
  id,
  businessId: "n1",
  serviceId: "s1",
  fecha: LUNES,
  nombre: "Ana",
  apellido: "Soto",
  email: `${id}@correo.test`,
  tokenHash: `hash-${id}`,
  createdAt: new Date("2026-10-27T12:00:00.000Z"),
  ...extra,
})

function escenario(extra: Partial<Record<string, Registro[]>> = {}) {
  base.reiniciar({
    user: [
      { id: "u1", name: "Dueña Uno", email: "uno@test" },
      { id: "u2", name: "Dueño Dos", email: "dos@test" },
      { id: "u-carla", name: "Carla", email: "carla@test" },
    ],
    business: [
      { id: "n1", name: "Salón Uno", slug: "uno", userId: "u1" },
      { id: "n2", name: "Salón Dos", slug: "dos", userId: "u2" },
    ],
    service: [
      { id: "s1", businessId: "n1", name: "Corte", duration: 60 },
      { id: "s2", businessId: "n2", name: "Corte", duration: 60 },
    ],
    workSchedule: [
      { id: "h1", businessId: "n1", dayOfWeek: 1, startTime: "09:00", endTime: "11:00" },
      { id: "h2", businessId: "n2", dayOfWeek: 1, startTime: "09:00", endTime: "11:00" },
    ],
    // El lunes del negocio 1, lleno.
    appointment: [cita("a9", A_LAS_9), cita("a10", A_LAS_10)],
    ...extra,
  })
}

const liberar = (id: string) => base.prisma.appointment.updateMany({ where: { id }, data: { status: "cancelada" } })
const inscripciones = (where?: Registro) => base.buscar("inscripcionEnEspera", where)
const envios = () => base.buscar("envioAClientes")

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  enviarAviso.mockResolvedValue(OK)
  escenario()
})

afterEach(() => {
  vi.useRealTimers()
})

const NEGOCIO = { id: "n1", timezone: "America/Santiago" }
const datos = (extra: Record<string, unknown> = {}) => ({
  servicioIds: ["s1"],
  fecha: LUNES,
  nombre: "Lucía",
  apellido: "Pérez",
  email: "  Lucia@Correo.TEST ",
  telefono: null,
  ...extra,
})

describe("inscribirse", () => {
  it("un día lleno: queda activa, con el email normalizado y sólo el hash del token", async () => {
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos(), AHORA)).toEqual({ tipo: "inscrita" })
    const [fila] = inscripciones()
    expect(fila).toMatchObject({ businessId: "n1", serviceId: "s1", memberId: null, fecha: LUNES, email: "lucia@correo.test", estado: "activa", avisos: 0 })
    expect(fila.tokenHash).toBe(hashDeToken(m.tokenDeInscripcion(fila.id as string)))
  })

  it("un día con horas libres no necesita lista", async () => {
    await liberar("a9")
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos(), AHORA)).toEqual({ tipo: "rechazada", error: m.MENSAJE_HAY_HORAS })
    expect(inscripciones()).toHaveLength(0)
  })

  it("un día sin atención, o pasado, se rechaza", async () => {
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ fecha: "2026-11-03" }), AHORA)).toEqual({ tipo: "rechazada", error: m.MENSAJE_SIN_ATENCION })
    expect((await m.inscribirEnListaDeEspera(NEGOCIO, datos({ fecha: "2026-10-26" }), AHORA)).tipo).toBe("rechazada")
    expect(inscripciones()).toHaveLength(0)
  })

  it("servicio de otro negocio, inactivo o profesional ajeno: no-encontrada (404 genérico)", async () => {
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ servicioIds: ["s2"] }), AHORA)).toEqual({ tipo: "no-encontrada" })
    escenario({
      businessMember: [{ id: "m-ajeno", businessId: "n2", userId: "u-carla", role: "worker" }],
    })
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ profesionalId: "m-ajeno" }), AHORA)).toEqual({ tipo: "no-encontrada" })
    expect(inscripciones()).toHaveLength(0)
  })

  /**
   * El rechazo "sin atención" es del negocio, no del profesional elegido: si
   * no, distinguía un día bloqueado entero sólo para Carla (vacaciones) de
   * uno sólo lleno, y dejaba deducir su agenda personal.
   */
  describe("con profesional elegido, el día sin atención se mira a nivel del negocio", () => {
    const EQUIPO = [
      { id: "m-carla", businessId: "n1", userId: "u-carla", role: "worker", createdAt: new Date("2026-01-01") },
      { id: "m-pedro", businessId: "n1", userId: "u1", role: "worker", createdAt: new Date("2026-01-02") },
    ]
    const TODO_EL_LUNES = { startTime: new Date("2026-11-02T03:00:00.000Z"), endTime: new Date("2026-11-03T03:00:00.000Z") }

    it("bloqueada entera ella y Pedro disponible: se inscribe, igual que en un día lleno, con cualquiera (#166)", async () => {
      escenario({
        businessMember: EQUIPO,
        timeBlock: [{ id: "b-carla", businessId: "n1", memberId: "m-carla", ...TODO_EL_LUNES }],
      })
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ profesionalId: "m-carla" }), AHORA)).toEqual({ tipo: "inscrita" })
      // Con Carla nunca se iba a liberar una hora: el aviso se calcula para cualquiera.
      expect(inscripciones()).toEqual([expect.objectContaining({ memberId: null })])
    })

    it("un día lleno para ella, que sí trabaja: queda con ella (#166)", async () => {
      escenario({ businessMember: EQUIPO })
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ profesionalId: "m-carla" }), AHORA)).toEqual({ tipo: "inscrita" })
      expect(inscripciones()).toEqual([expect.objectContaining({ memberId: "m-carla" })])
    })

    it("un día que ella no trabaja (horario propio) y Pedro sí: con cualquiera, y la respuesta es la misma (#166)", async () => {
      escenario({
        businessMember: EQUIPO,
        workSchedule: [
          { id: "h1", businessId: "n1", dayOfWeek: 1, startTime: "09:00", endTime: "11:00" },
          // Carla atiende sólo los martes.
          { id: "h-carla", businessId: "n1", memberId: "m-carla", dayOfWeek: 2, startTime: "09:00", endTime: "11:00" },
        ],
      })
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ profesionalId: "m-carla" }), AHORA)).toEqual({ tipo: "inscrita" })
      expect(inscripciones()).toEqual([expect.objectContaining({ memberId: null })])
    })

    it("con un bloqueo de todo el negocio: se rechaza como día sin atención", async () => {
      escenario({
        businessMember: EQUIPO,
        timeBlock: [{ id: "b-todos", businessId: "n1", memberId: null, ...TODO_EL_LUNES }],
      })
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ profesionalId: "m-carla" }), AHORA)).toEqual({
        tipo: "rechazada",
        error: m.MENSAJE_SIN_ATENCION,
      })
      expect(inscripciones()).toHaveLength(0)
    })

    it("bloqueados enteros todos los que hacen el servicio, uno por uno: se rechaza", async () => {
      escenario({
        businessMember: EQUIPO,
        timeBlock: [
          { id: "b-carla", businessId: "n1", memberId: "m-carla", ...TODO_EL_LUNES },
          { id: "b-pedro", businessId: "n1", memberId: "m-pedro", ...TODO_EL_LUNES },
        ],
      })
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ profesionalId: "m-carla" }), AHORA)).toEqual({
        tipo: "rechazada",
        error: m.MENSAJE_SIN_ATENCION,
      })
    })
  })

  it("con varios servicios, el día se revisa con la duración del bloque entero y se guarda el primero (#162)", async () => {
    escenario({
      service: [
        { id: "s1", businessId: "n1", name: "Corte", duration: 60 },
        { id: "s3", businessId: "n1", name: "Barba", duration: 30 },
        { id: "s2", businessId: "n2", name: "Corte", duration: 60 },
      ],
    })
    // Queda libre de 10 a 11: cabe un corte (60), no corte + barba (90).
    await liberar("a10")
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos(), AHORA)).toEqual({ tipo: "rechazada", error: m.MENSAJE_HAY_HORAS })
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ servicioIds: ["s1", "s3"] }), AHORA)).toEqual({ tipo: "inscrita" })
    expect(inscripciones()).toEqual([expect.objectContaining({ serviceId: "s1", memberId: null })])
    // Uno ajeno entre varios: el mismo 404, sin crear nada.
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ servicioIds: ["s3", "s2"], email: "otra@correo.test" }), AHORA)).toEqual({
      tipo: "no-encontrada",
    })
    expect(inscripciones()).toHaveLength(1)
  })

  describe("en una clínica dental", () => {
    const CLINICA = { ...NEGOCIO, type: "odontologia" }

    it("la primera vez suma 15 minutos: un día con una hora libre de 60 que no alcanza para 75 se acepta", async () => {
      // Queda libre de 10 a 11: cabe la limpieza (60), no con la primera vez (75).
      await liberar("a10")
      expect(await m.inscribirEnListaDeEspera(CLINICA, datos(), AHORA)).toEqual({ tipo: "rechazada", error: m.MENSAJE_HAY_HORAS })
      expect(await m.inscribirEnListaDeEspera(CLINICA, datos({ primeraVez: true }), AHORA)).toEqual({ tipo: "inscrita" })
      // En otro rubro la primera vez no suma nada.
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ primeraVez: true, email: "otra@correo.test" }), AHORA)).toEqual({
        tipo: "rechazada",
        error: m.MENSAJE_HAY_HORAS,
      })
    })

    it("una urgencia sólo espera por hoy: para otro día, rechazada con el mismo motivo que la reserva", async () => {
      const { MENSAJE_URGENCIA_SOLO_HOY } = await import("./reserva-publica")
      escenario({
        service: [
          { id: "s1", businessId: "n1", name: "Urgencia", duration: 60, esUrgencia: true },
          { id: "s2", businessId: "n2", name: "Corte", duration: 60 },
        ],
      })
      expect(await m.inscribirEnListaDeEspera(CLINICA, datos(), AHORA)).toEqual({ tipo: "rechazada", error: MENSAJE_URGENCIA_SOLO_HOY })
      expect(inscripciones()).toHaveLength(0)
      // En un salón la marca no cuenta.
      expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos(), AHORA)).toEqual({ tipo: "inscrita" })
    })
  })

  it("la cuarta inscripción activa del mismo email en el negocio: tope", async () => {
    escenario({
      inscripcionEnEspera: [
        inscripcion("i1", { email: "lucia@correo.test", fecha: "2026-11-09" }),
        inscripcion("i2", { email: "lucia@correo.test", fecha: "2026-11-16" }),
        inscripcion("i3", { email: "lucia@correo.test", fecha: "2026-11-23" }),
        // Las que ya no están activas no cuentan, ni las de otro negocio.
        inscripcion("i4", { email: "lucia@correo.test", fecha: "2026-11-30", estado: "reservo" }),
        inscripcion("i5", { businessId: "n2", serviceId: "s2", email: "lucia@correo.test" }),
      ],
    })
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos(), AHORA)).toEqual({ tipo: "tope" })
    expect(inscripciones({ businessId: "n1", estado: "activa" })).toHaveLength(3)
  })

  it("inscribirse dos veces a lo mismo no crea otra fila", async () => {
    await m.inscribirEnListaDeEspera(NEGOCIO, datos(), AHORA)
    expect(await m.inscribirEnListaDeEspera(NEGOCIO, datos({ email: "lucia@correo.test" }), AHORA)).toEqual({ tipo: "inscrita" })
    expect(inscripciones()).toHaveLength(1)
  })

  it("el consentimiento de WhatsApp sólo con teléfono", async () => {
    await m.inscribirEnListaDeEspera(NEGOCIO, datos({ whatsappConsentimiento: true }), AHORA)
    await m.inscribirEnListaDeEspera(NEGOCIO, datos({ email: "otra@correo.test", telefono: "+56912345678", whatsappConsentimiento: true }), AHORA)
    expect(inscripciones().map((fila) => fila.whatsappConsentAt)).toEqual([null, AHORA])
  })
})

describe("avisar cuando se libera una hora", () => {
  it("avisa a las inscripciones del negocio y del día, con los enlaces, y lo registra", async () => {
    escenario({
      inscripcionEnEspera: [
        inscripcion("i1"),
        // Otro negocio, mismo día y mismo email: no se toca.
        inscripcion("i-ajena", { businessId: "n2", serviceId: "s2", email: "i1@correo.test" }),
        // Otro día del mismo negocio: no.
        inscripcion("i-otro-dia", { fecha: "2026-11-09" }),
      ],
    })
    await liberar("a9")
    const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)

    expect(resumen).toMatchObject({ enviados: 1, fallidos: 0 })
    expect(enviarAviso).toHaveBeenCalledTimes(1)
    const correo = enviarAviso.mock.calls[0][0]
    expect(correo).toMatchObject({ emailCliente: "i1@correo.test", nombreNegocio: "Salón Uno", servicio: "Corte", fecha: LUNES, rubro: "salon" })
    expect(correo.enlaceReservar).toBe(`https://eli.test/reservar/uno?servicio=s1&fecha=${LUNES}#reservar`)
    const token = m.tokenDeInscripcion("i1")
    expect(correo.enlaceSalir).toBe(`https://eli.test/reservar/uno/espera/${token}`)
    expect(correo.enlaceSalirEnUnClic).toBe(`https://eli.test/api/reservar/uno/lista-de-espera/${token}`)

    expect(envios()).toEqual([expect.objectContaining({ businessId: "n1", tipo: "lista-de-espera", esperaId: "i1", referencia: "i1:1" })])
    expect(inscripciones({ id: "i1" })[0]).toMatchObject({ avisos: 1, ultimoAvisoAt: AHORA })
    expect(inscripciones({ id: "i-ajena" })[0]).toMatchObject({ avisos: 0 })
  })

  it("el correo lleva el rubro del negocio al que se le liberó la hora, no el de otro", async () => {
    escenario({
      business: [
        { id: "n1", name: "Clínica Uno", slug: "uno", userId: "u1", type: "odontologia" },
        { id: "n2", name: "Barbería Dos", slug: "dos", userId: "u2", type: "barberia" },
      ],
      inscripcionEnEspera: [inscripcion("i1")],
    })
    await liberar("a9")

    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)

    expect(enviarAviso).toHaveBeenCalledTimes(1)
    expect(enviarAviso.mock.calls[0][0]).toMatchObject({ rubro: "odontologia", nombreNegocio: "Clínica Uno" })
  })

  it("en producción sin NEXTAUTH_URL no manda un enlace a localhost: se cuenta como fallido, se libera y sigue", async () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NEXTAUTH_URL", "")
    vi.stubEnv("NODE_ENV", "production")
    try {
      escenario({ inscripcionEnEspera: [inscripcion("i1")] })
      await liberar("a9")
      const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)

      expect(resumen).toMatchObject({ enviados: 0, fallidos: 1 })
      expect(enviarAviso).not.toHaveBeenCalled()
      // El candado se suelta: el próximo evento lo vuelve a intentar.
      expect(envios()).toHaveLength(0)
      expect(inscripciones({ id: "i1" })[0]).toMatchObject({ avisos: 0 })
    } finally {
      vi.unstubAllEnvs()
      silencio.mockRestore()
    }
  })

  it("el evento de otro negocio nunca avisa a este", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1")] })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n2", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("una hora pasada no avisa", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1", { fecha: "2026-10-28" })] })
    await m.avisarHoraLiberada({ businessId: "n1", inicio: new Date("2026-10-28T12:00:00.000Z") }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("si el día sigue sin horas libres (se liberó y se volvió a tomar), no avisa", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1")] })
    const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(resumen).toMatchObject({ enviados: 0, omitidas: 1 })
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("con la lista apagada no avisa", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1")] })
    await base.prisma.business.updateMany({ where: { id: "n1" }, data: { listaDeEsperaActiva: false } })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("a quien ya reservó, salió o expiró no se le avisa", async () => {
    escenario({
      inscripcionEnEspera: [
        inscripcion("i1", { estado: "reservo" }),
        inscripcion("i2", { estado: "salio" }),
        inscripcion("i3", { estado: "expirada" }),
      ],
    })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("dos cancelaciones seguidas no avisan dos veces dentro de la ventana", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1")] })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    await liberar("a10")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_10 }, new Date(AHORA.getTime() + 5 * 60_000))
    expect(enviarAviso).toHaveBeenCalledTimes(1)

    // Pasada la ventana, sí (es el segundo aviso).
    const despues = new Date(AHORA.getTime() + (m.MINUTOS_ENTRE_AVISOS + 1) * 60_000)
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_10 }, despues)
    expect(enviarAviso).toHaveBeenCalledTimes(2)
    expect(envios().map((envio) => envio.referencia)).toEqual(["i1:1", "i1:2"])
  })

  it("dos eventos a la vez sobre la misma inscripción: un solo correo (el candado)", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1")] })
    await liberar("a9")
    await liberar("a10")
    await Promise.all([
      m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA),
      m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_10 }, AHORA),
    ])
    expect(enviarAviso).toHaveBeenCalledTimes(1)
    expect(inscripciones({ id: "i1" })[0]).toMatchObject({ avisos: 1 })
  })

  it("una inscripción recibe a lo sumo AVISOS_POR_INSCRIPCION avisos", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1", { avisos: 3, ultimoAvisoAt: new Date("2026-10-01") })] })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("cada evento avisa a lo sumo a AVISOS_POR_EVENTO_LISTA_DE_ESPERA, por orden de inscripción", async () => {
    const filas = Array.from({ length: 12 }, (_, n) =>
      inscripcion(`i${String(n).padStart(2, "0")}`, { createdAt: new Date(Date.UTC(2026, 9, 20, n)) })
    )
    escenario({ inscripcionEnEspera: filas })
    await liberar("a9")
    const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(resumen.enviados).toBe(10)
    expect(envios().map((envio) => envio.esperaId)).toEqual(filas.slice(0, 10).map((fila) => fila.id))
  })

  it("si el envío falla, se libera el candado y la inscripción no cuenta el aviso", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1")] })
    enviarAviso.mockResolvedValueOnce({ data: null, error: { name: "x", message: "y" } })
    await liberar("a9")
    const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(resumen.fallidos).toBe(1)
    expect(envios()).toHaveLength(0)
    expect(inscripciones({ id: "i1" })[0]).toMatchObject({ avisos: 0, ultimoAvisoAt: null })
  })

  it("si el correo salió pero el contador no se escribió, el próximo aviso sigue con el número siguiente", async () => {
    const hace2Horas = new Date(AHORA.getTime() - 2 * 60 * 60_000)
    const envio = (n: number, enviadoAt = hace2Horas) => ({
      id: `e${n}`,
      businessId: "n1",
      esperaId: "i1",
      tipo: "lista-de-espera",
      canal: "correo",
      categoria: "servicio",
      referencia: `i1:${n}`,
      enviadoAt,
    })
    // El aviso 1 salió y quedó registrado, pero `avisos` sigue en 0.
    escenario({ inscripcionEnEspera: [inscripcion("i1")], envioAClientes: [envio(1)] })
    await liberar("a9")
    const resumen = await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(resumen.enviados).toBe(1)
    expect(envios().map((fila) => fila.referencia)).toEqual(["i1:1", "i1:2"])
    expect(inscripciones({ id: "i1" })[0]).toMatchObject({ avisos: 2, ultimoAvisoAt: AHORA })
  })

  it("el máximo de avisos y la ventana se miran también en los envíos registrados, no sólo en el contador", async () => {
    const envio = (n: number, enviadoAt: Date) => ({
      id: `e${n}`,
      businessId: "n1",
      esperaId: "i1",
      tipo: "lista-de-espera",
      canal: "correo",
      categoria: "servicio",
      referencia: `i1:${n}`,
      enviadoAt,
    })
    const antes = new Date("2026-10-27T12:00:00.000Z")
    escenario({ inscripcionEnEspera: [inscripcion("i1")], envioAClientes: [envio(1, antes), envio(2, antes), envio(3, antes)] })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()

    // Uno hace 5 minutos, con `ultimoAvisoAt` vacío: todavía dentro de la ventana.
    escenario({ inscripcionEnEspera: [inscripcion("i1")], envioAClientes: [envio(1, new Date(AHORA.getTime() - 5 * 60_000))] })
    await liberar("a9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).not.toHaveBeenCalled()
  })

  it("el nombre del profesional se busca sólo entre los miembros del negocio", async () => {
    escenario({
      businessMember: [{ id: "m-carla", businessId: "n1", userId: "u-carla", role: "worker", createdAt: new Date("2026-01-01") }],
      appointment: [cita("c9", A_LAS_9, { memberId: "m-carla" }), cita("c10", A_LAS_10, { memberId: "m-carla" })],
      inscripcionEnEspera: [inscripcion("i-carla", { memberId: "m-carla" })],
    })
    await liberar("c9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso.mock.calls[0][0]).toMatchObject({ profesional: "Carla" })
    const consultas = base.prisma.businessMember.findMany.mock.calls.map(([args]) => args as { where: Registro })
    const delAviso = consultas.find((args) => JSON.stringify(args.where).includes("m-carla") && "in" in ((args.where.id as Registro) ?? {}))
    expect(delAviso?.where).toMatchObject({ id: { in: ["m-carla"] }, businessId: "n1" })
  })

  it("con profesional: sólo cuenta la hora libre de ese profesional", async () => {
    escenario({
      businessMember: [
        { id: "m-carla", businessId: "n1", userId: "u-carla", role: "worker", createdAt: new Date("2026-01-01") },
        { id: "m-pedro", businessId: "n1", userId: "u1", role: "worker", createdAt: new Date("2026-01-02") },
      ],
      appointment: [
        cita("c9", A_LAS_9, { memberId: "m-carla" }),
        cita("c10", A_LAS_10, { memberId: "m-carla" }),
        cita("p9", A_LAS_9, { memberId: "m-pedro" }),
        cita("p10", A_LAS_10, { memberId: "m-pedro" }),
      ],
      inscripcionEnEspera: [inscripcion("i-carla", { memberId: "m-carla" }), inscripcion("i-cualquiera")],
    })
    await liberar("p9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).toHaveBeenCalledTimes(1)
    expect(enviarAviso.mock.calls[0][0].emailCliente).toBe("i-cualquiera@correo.test")

    await liberar("c9")
    await m.avisarHoraLiberada({ businessId: "n1", inicio: A_LAS_9 }, AHORA)
    expect(enviarAviso).toHaveBeenCalledTimes(2)
    const aCarla = enviarAviso.mock.calls[1][0]
    expect(aCarla).toMatchObject({ emailCliente: "i-carla@correo.test", profesional: "Carla" })
    expect(aCarla.enlaceReservar).toContain("profesional=m-carla")
  })
})

describe("reservó", () => {
  it("las activas de ese email y ese día en el negocio pasan a reservo; nada más", async () => {
    escenario({
      inscripcionEnEspera: [
        inscripcion("i1", { email: "ana@correo.test" }),
        inscripcion("i-otro-dia", { email: "ana@correo.test", fecha: "2026-11-09" }),
        inscripcion("i-ajena", { businessId: "n2", serviceId: "s2", email: "ana@correo.test" }),
      ],
    })
    expect(await m.marcarReservo(base.prisma as never, { businessId: "n1", email: " ANA@correo.test", fecha: LUNES, ahora: AHORA })).toBe(1)
    expect(inscripciones({ estado: "reservo" }).map((fila) => fila.id)).toEqual(["i1"])
    // Ya reservó: sus datos personales se borran, como al salir o expirar.
    expect(inscripciones({ id: "i1" })[0]).toMatchObject({ nombre: "", apellido: "", email: "", telefono: null, whatsappConsentAt: null })
    expect(inscripciones({ id: "i-otro-dia" })[0]).toMatchObject({ email: "ana@correo.test" })
    expect(await m.marcarReservo(base.prisma as never, { businessId: "n1", email: null, fecha: LUNES, ahora: AHORA })).toBe(0)
  })
})

describe("salir de la lista", () => {
  it("con el token del correo: sale y se borran sus datos", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1", { tokenHash: hashDeToken(m.tokenDeInscripcion("i1")), telefono: "+56912345678" })] })
    expect(await m.salirDeLaLista("uno", m.tokenDeInscripcion("i1"), AHORA)).toBe(true)
    expect(inscripciones()[0]).toMatchObject({ estado: "salio", resueltaAt: AHORA, nombre: "", apellido: "", email: "", telefono: null })
    // Ya usado: no hace nada.
    expect(await m.salirDeLaLista("uno", m.tokenDeInscripcion("i1"), AHORA)).toBe(false)
  })

  it("un token inválido, de otra forma o con el slug de otro negocio no saca a nadie", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("i1", { tokenHash: hashDeToken(m.tokenDeInscripcion("i1")) })] })
    expect(await m.salirDeLaLista("dos", m.tokenDeInscripcion("i1"), AHORA)).toBe(false)
    expect(await m.salirDeLaLista("uno", m.tokenDeInscripcion("i2"), AHORA)).toBe(false)
    expect(await m.salirDeLaLista("uno", "corto", AHORA)).toBe(false)
    expect(await m.salirDeLaLista("uno", undefined, AHORA)).toBe(false)
    expect(inscripciones()[0]).toMatchObject({ estado: "activa" })
  })
})

describe("expirar (cron diario)", () => {
  const contexto = (ahora = AHORA) => ({ ahora, hasta: Date.now() + 60_000, cupo: { restantes: 100 } })

  it("las activas de días pasados en la zona del negocio expiran y pierden los datos; las de hoy no", async () => {
    escenario({
      inscripcionEnEspera: [
        inscripcion("ayer", { fecha: "2026-10-27" }),
        inscripcion("hoy", { fecha: "2026-10-28" }),
        inscripcion("reservo-ayer", { fecha: "2026-10-27", estado: "reservo" }),
        inscripcion("futura"),
      ],
    })
    const resumen = await m.expirarListaDeEspera(contexto())
    expect(resumen).toMatchObject({ revisados: 2, enviados: 0, incompleto: false })
    expect(inscripciones({ id: "ayer" })[0]).toMatchObject({ estado: "expirada", email: "", nombre: "" })
    expect(inscripciones({ id: "reservo-ayer" })[0]).toMatchObject({ estado: "reservo", email: "" })
    expect(inscripciones({ id: "hoy" })[0]).toMatchObject({ estado: "activa", email: "hoy@correo.test" })
    expect(inscripciones({ id: "futura" })[0]).toMatchObject({ estado: "activa" })

    // Correrlo de nuevo no cambia nada.
    expect((await m.expirarListaDeEspera(contexto())).revisados).toBe(0)
  })

  it("el día es el de la zona de cada negocio", async () => {
    escenario({
      inscripcionEnEspera: [
        inscripcion("santiago", { fecha: "2026-10-28" }),
        inscripcion("auckland", { businessId: "n2", serviceId: "s2", fecha: "2026-10-28" }),
      ],
    })
    await base.prisma.business.updateMany({ where: { id: "n2" }, data: { timezone: "Pacific/Auckland" } })
    // 28/10 23:30 en Santiago = 29/10 15:30 en Auckland.
    await m.expirarListaDeEspera(contexto(new Date("2026-10-29T02:30:00.000Z")))
    expect(inscripciones({ id: "santiago" })[0]).toMatchObject({ estado: "activa" })
    expect(inscripciones({ id: "auckland" })[0]).toMatchObject({ estado: "expirada" })
  })

  it("corta al llegar al plazo", async () => {
    escenario({ inscripcionEnEspera: [inscripcion("ayer", { fecha: "2026-10-27" })] })
    const resumen = await m.expirarListaDeEspera({ ahora: AHORA, hasta: Date.now() - 1, cupo: { restantes: 100 } })
    expect(resumen.incompleto).toBe(true)
    expect(inscripciones()[0]).toMatchObject({ estado: "activa" })
  })
})
