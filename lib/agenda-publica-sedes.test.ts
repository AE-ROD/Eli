import { describe, it, expect, beforeEach } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import {
  candidatosDelDia,
  candidatosDeLaReserva,
  diasConAtencionDeLaReserva,
  filasDeQuienesAtienden,
  haceLosServicios,
  horasLibresDelDia,
  horasPosiblesEnElNegocio,
  leerHorarioDeQuienesAtienden,
  leerProfesionalesQueAtienden,
} from "./agenda-publica"

/**
 * La agenda de la reserva pública con sedes (etapa 9, `lib/sedes.ts`): con
 * `sedeId` sólo cuenta el horario de esa sede; sin él, el vigente. Con la base
 * falsa de `pruebas/`, como los tests vecinos. Lo más importante: sin sedes
 * (todo negocio de hoy), `sedeId` ausente, `undefined` o `null` da EXACTAMENTE
 * lo que daba antes de las sedes.
 */

const base = crearBaseFalsa()
const db = base.prisma as unknown as Prisma.TransactionClient

const DOMINGO = 0
const LUNES = 1
const MARTES = 2
const MIERCOLES = 3
const JUEVES = 4
const VIERNES = 5
const SABADO = 6

/** La semana del lunes 7 de enero de 2030; Santiago en enero está en UTC-3. */
const FECHAS = {
  [DOMINGO]: "2030-01-13",
  [LUNES]: "2030-01-07",
  [MARTES]: "2030-01-08",
  [MIERCOLES]: "2030-01-09",
  [JUEVES]: "2030-01-10",
  [VIERNES]: "2030-01-11",
  [SABADO]: "2030-01-12",
} as const
const AHORA = new Date("2030-01-01T12:00:00.000Z")
const aLas = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

type Registro = Record<string, unknown>

const franja = (id: string, dayOfWeek: number, startTime: string, endTime: string, extra: Registro = {}): Registro => ({
  id,
  businessId: NEGOCIO,
  dayOfWeek,
  startTime,
  endTime,
  ...extra,
})

const sedeDeLaBase = (id: string, nombre: string, extra: Registro = {}): Registro => ({
  id,
  businessId: NEGOCIO,
  nombre,
  direccion: `Calle ${nombre} 1`,
  comuna: "Providencia",
  ...extra,
})

const franjasDe = (candidatos: { franjas: { startTime: string; endTime: string }[] }[]) =>
  candidatos.map((candidato) => candidato.franjas.map((f) => `${f.startTime}-${f.endTime}`))

/** Lo que devolvía `candidatosDeLaReserva` ANTES de las sedes: la misma lectura y las mismas funciones puras, sin `sedeId`. */
async function candidatosComoAntes(consulta: { businessId: string; serviceIds: string[]; profesionalId: string | null; fecha: string }) {
  const { businessId, serviceIds, profesionalId, fecha } = consulta
  const profesionales = await leerProfesionalesQueAtienden(db, businessId)
  const filas = await db.workSchedule.findMany({
    where: { businessId, active: true },
    select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  })
  const queLoHacen = profesionales.filter((profesional) => haceLosServicios(profesional, serviceIds))
  const elegidos = profesionalId ? queLoHacen.filter((profesional) => profesional.id === profesionalId) : queLoHacen
  return {
    profesionales,
    candidatos: candidatosDelDia(
      filasDeQuienesAtienden(filas, profesionales),
      profesionales.length > 0,
      elegidos.map((profesional) => profesional.id),
      fecha
    ),
  }
}

describe("sin sedes (todo negocio de hoy): `sedeId` ausente, undefined o null es lo de siempre", () => {
  beforeEach(() => {
    base.reiniciar({
      ...datosBase(),
      workSchedule: [
        franja("h-lun-1", LUNES, "09:00", "12:00"),
        franja("h-lun-2", LUNES, "15:00", "18:00"),
        franja("h-mar", MARTES, "09:00", "13:00"),
        // Carla cargó su propio horario: el miércoles; y es la única que tiene.
        franja("h-carla", MIERCOLES, "14:00", "20:00", { memberId: "m-carla" }),
        // El encargado no atiende: su jueves no abre el día (#168).
        franja("h-encargado", JUEVES, "09:00", "18:00", { memberId: "m-encargado" }),
        franja("h-inactivo", VIERNES, "09:00", "18:00", { active: false }),
        franja("h-ajeno", SABADO, "09:00", "18:00", { businessId: OTRO_NEGOCIO }),
      ],
    })
  })

  const variantes = [
    ["sin el campo", {}],
    ["undefined", { sedeId: undefined }],
    ["null", { sedeId: null }],
  ] as const

  it.each(variantes)("candidatosDeLaReserva (%s) es idéntico a la lectura de antes, todos los días, con y sin profesional elegido", async (_nombre, extra) => {
    for (const fecha of Object.values(FECHAS)) {
      for (const profesionalId of [null, "m-carla", "m-pedro"]) {
        const consulta = { businessId: NEGOCIO, serviceIds: ["s-corte"], profesionalId, fecha }
        const antes = await candidatosComoAntes(consulta)

        const ahora = await candidatosDeLaReserva(db, { ...consulta, ...extra })

        expect(ahora).toEqual({ tipo: "ok", ...antes })
      }
    }
  })

  it.each(variantes)("diasConAtencionDeLaReserva (%s) da los días de siempre", async (_nombre, extra) => {
    const consulta = { businessId: NEGOCIO, serviceIds: ["s-corte"] }
    // Con Carla y Pedro: el lunes y el martes por el horario general; el
    // miércoles, que sólo tiene el de Carla, también (la unión de los miembros
    // que atienden). El jueves del encargado y el viernes inactivo, no.
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, profesionalId: null, ...extra })).toEqual([LUNES, MARTES, MIERCOLES])
    // Carla, con horario propio: sólo el suyo.
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, profesionalId: "m-carla", ...extra })).toEqual([MIERCOLES])
    // Pedro, sin horario propio: el del negocio.
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, profesionalId: "m-pedro", ...extra })).toEqual([LUNES, MARTES, MIERCOLES])
    // Un profesional que no existe en el negocio.
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, profesionalId: "m-ajeno", ...extra })).toBeNull()
  })

  it.each(variantes)("leerHorarioDeQuienesAtienden (%s) lee todo el horario activo del negocio, sin el de quien no atiende", async (_nombre, extra) => {
    const filas = await leerHorarioDeQuienesAtienden(db, NEGOCIO, "sedeId" in extra ? extra.sedeId : undefined)

    expect(filas.map((fila) => `${fila.memberId ?? "general"}:${fila.dayOfWeek}:${fila.startTime}`).sort()).toEqual(
      ["general:1:09:00", "general:1:15:00", "general:2:09:00", "m-carla:3:14:00"].sort()
    )
    // Sólo el horario, nada de la sede ni de otro negocio.
    expect(Object.keys(filas[0]).sort()).toEqual(["dayOfWeek", "endTime", "memberId", "startTime"])
  })

  it.each(variantes)("horasPosiblesEnElNegocio (%s) responde lo de siempre: abierto, cerrado y bloqueado", async (_nombre, extra) => {
    const consulta = { businessId: NEGOCIO, serviceIds: ["s-corte"], zona: "America/Santiago", duracion: 60, ahora: AHORA, ...extra }

    expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[LUNES] })).toBe("con-horas-posibles")
    // El jueves sólo trabaja el encargado, que no atiende.
    expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[JUEVES] })).toBe("sin-atencion")

    base.reiniciar({
      ...datosBase(),
      workSchedule: [franja("h-lun", LUNES, "09:00", "12:00")],
      timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: null, startTime: aLas(FECHAS[LUNES], "00:00"), endTime: aLas(FECHAS[LUNES], "23:59") }],
    })
    expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[LUNES] })).toBe("sin-horas-posibles")
  })

  it("un negocio sin profesionales (el dueño solo): el carril único con el horario del negocio, igual que antes", async () => {
    base.reiniciar({
      ...datosBase(),
      businessMember: [],
      workSchedule: [franja("h-lun", LUNES, "09:00", "12:00"), franja("h-carla", MIERCOLES, "14:00", "20:00", { memberId: "m-carla" })],
    })
    const consulta = { businessId: NEGOCIO, serviceIds: ["s-corte"], profesionalId: null }

    for (const fecha of Object.values(FECHAS)) {
      const antes = await candidatosComoAntes({ ...consulta, fecha })
      expect(await candidatosDeLaReserva(db, { ...consulta, fecha, sedeId: null })).toEqual({ tipo: "ok", ...antes })
      expect(await candidatosDeLaReserva(db, { ...consulta, fecha })).toEqual({ tipo: "ok", ...antes })
    }
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: null })).toEqual([LUNES])
  })
})

describe("con sedes (plan Independiente: el dueño solo, dos sedes activas y una desactivada)", () => {
  beforeEach(() => {
    base.reiniciar({
      ...datosBase(),
      business: datosBase().business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, plan: "independiente" } : negocio)),
      // El dueño solo: nadie más atiende.
      businessMember: [],
      sede: [
        sedeDeLaBase("centro", "Centro", { orden: 0 }),
        sedeDeLaBase("norte", "Norte", { orden: 1 }),
        sedeDeLaBase("vieja", "Vieja", { orden: 2, activo: false }),
        sedeDeLaBase("de-otro", "Del otro", { businessId: OTRO_NEGOCIO }),
      ],
      workSchedule: [
        // Lunes: separadas. Martes: Norte empieza cuando Centro termina (tocarse es válido).
        franja("c-lun", LUNES, "09:00", "13:00", { sedeId: "centro" }),
        franja("n-lun", LUNES, "14:00", "18:00", { sedeId: "norte" }),
        franja("c-mar", MARTES, "09:00", "13:00", { sedeId: "centro" }),
        franja("n-mar", MARTES, "13:00", "17:00", { sedeId: "norte" }),
        // Miércoles sólo Centro, jueves sólo Norte.
        franja("c-mie", MIERCOLES, "09:00", "13:00", { sedeId: "centro" }),
        franja("n-jue", JUEVES, "10:00", "14:00", { sedeId: "norte" }),
        // Una sede desactivada conserva sus filas, pero no cuentan para nadie.
        franja("v-vie", VIERNES, "09:00", "18:00", { sedeId: "vieja" }),
        // El horario general viejo, sin sede, de un sábado: sigue siendo vigente.
        franja("g-sab", SABADO, "10:00", "12:00"),
        // Otro negocio, con su propia sede: no se mezcla.
        franja("o-dom", DOMINGO, "09:00", "18:00", { businessId: OTRO_NEGOCIO, sedeId: "de-otro" }),
        franja("o-lun", LUNES, "00:00", "23:00", { businessId: OTRO_NEGOCIO }),
      ],
    })
  })

  const candidatos = async (dia: keyof typeof FECHAS, sedeId?: string | null) => {
    const reserva = await candidatosDeLaReserva(db, {
      businessId: NEGOCIO,
      serviceIds: ["s-corte"],
      profesionalId: null,
      fecha: FECHAS[dia],
      sedeId,
    })
    if (reserva.tipo !== "ok") throw new Error("el dueño solo siempre puede tomarla")
    return reserva.candidatos
  }

  it("con una sede, sólo el horario de ESA sede", async () => {
    expect(franjasDe(await candidatos(LUNES, "centro"))).toEqual([["09:00-13:00"]])
    expect(franjasDe(await candidatos(LUNES, "norte"))).toEqual([["14:00-18:00"]])
  })

  it("con una sede, un día en que no atiende ahí no tiene franjas (aunque otra sede sí atienda)", async () => {
    expect(franjasDe(await candidatos(JUEVES, "centro"))).toEqual([[]])
    expect(franjasDe(await candidatos(MIERCOLES, "norte"))).toEqual([[]])
  })

  it("sin sede (undefined o null), la unión de las sedes activas y del horario sin sede: 'atiende ese día en alguna sede'", async () => {
    for (const sedeId of [undefined, null]) {
      // Lunes: las dos, separadas. Martes: se tocan en las 13:00 y se fusionan.
      expect(franjasDe(await candidatos(LUNES, sedeId))).toEqual([["09:00-13:00", "14:00-18:00"]])
      expect(franjasDe(await candidatos(MARTES, sedeId))).toEqual([["09:00-17:00"]])
      expect(franjasDe(await candidatos(MIERCOLES, sedeId))).toEqual([["09:00-13:00"]])
      expect(franjasDe(await candidatos(JUEVES, sedeId))).toEqual([["10:00-14:00"]])
      // El horario sin sede sigue contando.
      expect(franjasDe(await candidatos(SABADO, sedeId))).toEqual([["10:00-12:00"]])
    }
  })

  it("una sede desactivada no cuenta: ni sola ni en la unión", async () => {
    expect(franjasDe(await candidatos(VIERNES, "vieja"))).toEqual([[]])
    expect(franjasDe(await candidatos(VIERNES))).toEqual([[]])
  })

  it("el id de una sede ajena, o que no existe, no da horario ni deja ver el de otro negocio", async () => {
    expect(franjasDe(await candidatos(DOMINGO, "de-otro"))).toEqual([[]])
    expect(franjasDe(await candidatos(LUNES, "de-otro"))).toEqual([[]])
    expect(franjasDe(await candidatos(LUNES, "no-existe"))).toEqual([[]])
    // Y el horario de las 00:00 a las 23:00 del otro negocio no entra en la unión.
    expect(franjasDe(await candidatos(DOMINGO))).toEqual([[]])
  })

  it("diasConAtencionDeLaReserva: por sede, y sin sede los días de cualquiera", async () => {
    const consulta = { businessId: NEGOCIO, serviceIds: ["s-corte"], profesionalId: null }

    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: "centro" })).toEqual([LUNES, MARTES, MIERCOLES])
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: "norte" })).toEqual([LUNES, MARTES, JUEVES])
    expect(await diasConAtencionDeLaReserva(db, { ...consulta })).toEqual([LUNES, MARTES, MIERCOLES, JUEVES, SABADO])
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: null })).toEqual([LUNES, MARTES, MIERCOLES, JUEVES, SABADO])
    // Inactiva, de otro negocio o inexistente: ningún día (no `null`: el profesional sí puede tomarla).
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: "vieja" })).toEqual([])
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: "de-otro" })).toEqual([])
    expect(await diasConAtencionDeLaReserva(db, { ...consulta, sedeId: "no-existe" })).toEqual([])
  })

  it("leerHorarioDeQuienesAtienden: el de la sede, o el vigente sin ella", async () => {
    const dias = async (sedeId?: string | null) => (await leerHorarioDeQuienesAtienden(db, NEGOCIO, sedeId)).map((f) => f.dayOfWeek).sort()

    expect(await dias("centro")).toEqual([LUNES, MARTES, MIERCOLES])
    expect(await dias("norte")).toEqual([LUNES, MARTES, JUEVES])
    expect(await dias(undefined)).toEqual([LUNES, LUNES, MARTES, MARTES, MIERCOLES, JUEVES, SABADO])
    expect(await dias("vieja")).toEqual([])
    expect(await dias("de-otro")).toEqual([])
  })

  describe("horasPosiblesEnElNegocio", () => {
    const consulta = { businessId: NEGOCIO, serviceIds: ["s-corte"], zona: "America/Santiago", duracion: 60, ahora: AHORA }

    it("por sede: abierto donde atiende y sin atención donde no", async () => {
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[LUNES], sedeId: "centro" })).toBe("con-horas-posibles")
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[JUEVES], sedeId: "centro" })).toBe("sin-atencion")
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[JUEVES], sedeId: "norte" })).toBe("con-horas-posibles")
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[VIERNES], sedeId: "vieja" })).toBe("sin-atencion")
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[LUNES], sedeId: "de-otro" })).toBe("sin-atencion")
    })

    it("sin sede: abierto si alguna sede atiende ese día", async () => {
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[JUEVES] })).toBe("con-horas-posibles")
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[JUEVES], sedeId: null })).toBe("con-horas-posibles")
      expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[VIERNES] })).toBe("sin-atencion")
    })

    it("un bloqueo de todo el negocio cierra el día en todas las sedes", async () => {
      base.reiniciar({
        ...datosBase(),
        businessMember: [],
        sede: [sedeDeLaBase("centro", "Centro"), sedeDeLaBase("norte", "Norte")],
        workSchedule: [franja("c-lun", LUNES, "09:00", "13:00", { sedeId: "centro" }), franja("n-lun", LUNES, "14:00", "18:00", { sedeId: "norte" })],
        timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: null, startTime: aLas(FECHAS[LUNES], "00:00"), endTime: aLas(FECHAS[LUNES], "23:59") }],
      })

      for (const sedeId of ["centro", "norte", null]) {
        expect(await horasPosiblesEnElNegocio(db, { ...consulta, fecha: FECHAS[LUNES], sedeId })).toBe("sin-horas-posibles")
      }
    })
  })

  describe("la ocupación es del negocio entero, no de la sede", () => {
    it("una cita en la sede Norte ocupa esa hora también en la sede Centro: el dueño no está en dos lugares", async () => {
      // Una cita que quedó en Norte a una hora en que hoy atiende Centro (el
      // horario cambió después de agendarla) ocupa a la dueña igual.
      base.reiniciar({
        ...datosBase(),
        businessMember: [],
        sede: [sedeDeLaBase("centro", "Centro"), sedeDeLaBase("norte", "Norte")],
        workSchedule: [franja("c-lun", LUNES, "09:00", "13:00", { sedeId: "centro" }), franja("n-lun", LUNES, "14:00", "18:00", { sedeId: "norte" })],
        appointment: [
          {
            id: "cita-norte",
            businessId: NEGOCIO,
            title: "Corte",
            sedeId: "norte",
            startTime: aLas(FECHAS[LUNES], "10:00"),
            endTime: aLas(FECHAS[LUNES], "11:00"),
          },
        ],
      })
      const horasLibres = async (sedeId: string | null) =>
        horasLibresDelDia(db, {
          businessId: NEGOCIO,
          zona: "America/Santiago",
          fecha: FECHAS[LUNES],
          duracion: 60,
          candidatos: await candidatosDeLaReserva(db, {
            businessId: NEGOCIO,
            serviceIds: ["s-corte"],
            profesionalId: null,
            fecha: FECHAS[LUNES],
            sedeId,
          }).then((reserva) => (reserva.tipo === "ok" ? reserva.candidatos : [])),
          ahora: AHORA,
        })

      const centro = await horasLibres("centro")

      expect(centro).toContain("09:00")
      expect(centro).not.toContain("10:00")
      expect(centro).not.toContain("10:30")
      expect(centro).toContain("11:00")
      // Norte no tiene nada ocupado en su horario de la tarde.
      expect(await horasLibres("norte")).toEqual(["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"])
    })

    it("un bloqueo de la agenda cierra esa hora en cualquier sede", async () => {
      base.reiniciar({
        ...datosBase(),
        businessMember: [],
        sede: [sedeDeLaBase("centro", "Centro")],
        workSchedule: [franja("c-lun", LUNES, "09:00", "12:00", { sedeId: "centro" })],
        timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: null, startTime: aLas(FECHAS[LUNES], "09:00"), endTime: aLas(FECHAS[LUNES], "10:00") }],
      })
      const reserva = await candidatosDeLaReserva(db, { businessId: NEGOCIO, serviceIds: ["s-corte"], profesionalId: null, fecha: FECHAS[LUNES], sedeId: "centro" })

      const horas = await horasLibresDelDia(db, {
        businessId: NEGOCIO,
        zona: "America/Santiago",
        fecha: FECHAS[LUNES],
        duracion: 60,
        candidatos: reserva.tipo === "ok" ? reserva.candidatos : [],
        ahora: AHORA,
      })

      expect(horas).toEqual(["10:00", "10:30", "11:00"])
    })
  })

  it("con profesionales (un Equipo con una sede de más no existe, pero las funciones no dependen del plan): cada uno con el horario de la sede", async () => {
    base.reiniciar({
      ...datosBase(),
      sede: [sedeDeLaBase("centro", "Centro"), sedeDeLaBase("norte", "Norte")],
      workSchedule: [
        franja("c-lun", LUNES, "09:00", "13:00", { sedeId: "centro" }),
        franja("n-lun", LUNES, "14:00", "18:00", { sedeId: "norte" }),
        // Carla, con horario propio en la sede Norte.
        franja("n-carla", LUNES, "15:00", "17:00", { sedeId: "norte", memberId: "m-carla" }),
      ],
    })
    const reserva = (sedeId: string | null) =>
      candidatosDeLaReserva(db, { businessId: NEGOCIO, serviceIds: ["s-corte"], profesionalId: null, fecha: FECHAS[LUNES], sedeId })

    const enNorte = await reserva("norte")
    const enCentro = await reserva("centro")

    expect(enNorte.tipo === "ok" && enNorte.candidatos.map((c) => [c.memberId, franjasDe([c])[0]])).toEqual([
      ["m-carla", ["15:00-17:00"]],
      ["m-pedro", ["14:00-18:00"]],
    ])
    // En Centro Carla no tiene filas propias (las suyas son de Norte): atiende con el horario de la sede.
    expect(enCentro.tipo === "ok" && enCentro.candidatos.map((c) => [c.memberId, franjasDe([c])[0]])).toEqual([
      ["m-carla", ["09:00-13:00"]],
      ["m-pedro", ["09:00-13:00"]],
    ])
  })
})
