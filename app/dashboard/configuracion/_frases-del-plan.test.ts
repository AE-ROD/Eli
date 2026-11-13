import { describe, expect, it } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeConfiguracion } from "./_frases"
import { frasesDelPlan } from "./_frases-del-plan"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)

const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  profesional: { singular: "operaria", plural: "operarias", genero: "f" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
}

describe("las frases del plan, sin rubro", () => {
  const f = frasesDelPlan(NEUTRAS)

  it("Independiente: lo que incluye y lo que no", () => {
    expect(f.incluye("independiente")).toEqual([
      { texto: "Atiendes sólo tú.", incluido: true },
      { texto: "Hasta 5 sedes, cada una con su dirección y su horario por día.", incluido: true },
      { texto: "Invitar a un encargado o a tus profesionales a tu equipo.", incluido: false },
    ])
  })

  it("Equipo: lo que incluye y lo que no", () => {
    expect(f.incluye("equipo")).toEqual([
      { texto: "Invitar a tu equipo: un encargado y tus profesionales, cada uno con su rol.", incluido: true },
      { texto: "Una sola sede: la dirección del negocio.", incluido: true },
      { texto: "Varias sedes, cada una con su horario por día.", incluido: false },
    ])
  })

  it("dice con claridad que todavía no se cobra", () => {
    expect(f.cobro).toBe("Todavía no se cobra: el cobro llega pronto. Mientras tanto, cambiar de plan no cuesta nada.")
  })

  it("el botón y el resumen de cada destino", () => {
    expect(f.cambiar.boton("Equipo")).toBe("Cambiar a Equipo")
    expect(f.cambiar.resumen("equipo")).toContain("tienes una sola sede")
    expect(f.cambiar.resumen("independiente")).toContain("hasta 5 sedes")
    expect(f.cambiar.anuncio("Equipo")).toBe("Ahora estás en el plan Equipo.")
  })

  it("el bloqueo cuenta integrantes e invitaciones, en singular y en plural", () => {
    expect(f.bloqueo.detalle(2, 1)).toContain("Hoy tienes 2 integrantes y 1 invitación pendiente.")
    expect(f.bloqueo.detalle(1, 0)).toContain("Hoy tienes 1 integrante.")
    expect(f.bloqueo.detalle(0, 3)).toContain("Hoy tienes 3 invitaciones pendientes.")
  })

  it("el modal a Equipo: la sede elegida pasa a ser el negocio y todas se desactivan sin borrarse", () => {
    const { aEquipo } = f.modal
    expect(aEquipo.elegirSede).toBe("Elige cuál de tus sedes pasa a ser la dirección y el horario del negocio.")
    expect(aEquipo.unaSedeQueda("Providencia")).toBe("Tu sede Providencia pasa a ser la dirección y el horario del negocio.")
    expect(aEquipo.sinSedes).toBe("No tienes sedes activas, así que la dirección del negocio sigue como está.")
    expect(aEquipo.seDesactivan(1)).toBe("La sede se desactiva sin borrarse y deja de verse en tu página de reservas.")
    expect(aEquipo.seDesactivan(3)).toBe("Tus 3 sedes activas se desactivan sin borrarse y dejan de verse en tu página de reservas.")
    expect(aEquipo.siguenLasHoras).toBe("Las citas agendadas por delante en esa sede siguen, ahora en la dirección del negocio.")
  })

  it("avisa que otras sedes con horas por delante impiden el paso, con cuántas y dónde", () => {
    const { aEquipo } = f.modal
    expect(aEquipo.horasQueImpiden([{ nombre: "Ñuñoa", horasFuturas: 3 }, { nombre: "Centro", horasFuturas: 1 }], "Providencia")).toBe(
      "Todavía no se puede: otras sedes tienen citas agendadas por delante (Ñuñoa: 3, Centro: 1). Muévelas a Providencia o cancélalas, o elige otra sede."
    )
    expect(aEquipo.noSePuedeTodavia).toContain("Todavía no se puede pasar a Equipo")
  })

  it("el precio sale de lib/precios.ts", () => {
    expect(f.modal.precio("independiente", "Independiente")).toBe("El plan Independiente cuesta $9.990/mes (IVA incluido).")
    expect(f.modal.precio("equipo", "Equipo")).toBe(
      "El plan Equipo cuesta $34.990/mes (IVA incluido · 5 personas que atienden · +$4.990/mes por cada persona más)."
    )
  })

  it("se cuelga de frasesDeConfiguracion", () => {
    expect(frasesDeConfiguracion(NEUTRAS).plan.titulo).toBe("Plan")
  })
})

describe("con las palabras de cada rubro", () => {
  it("una clínica dental invita a sus odontólogos y habla de la clínica", () => {
    const f = frasesDelPlan(palabrasDe("odontologia"))
    expect(f.incluye("independiente")[2].texto).toBe("Invitar a un encargado o a tus odontólogos a tu equipo.")
    expect(f.incluye("equipo")[1].texto).toBe("Una sola sede: la dirección de la clínica.")
    expect(f.modal.aEquipo.elegirSede).toContain("la dirección y el horario de la clínica")
    expect(f.modal.aEquipo.siguenLasHoras).toContain("Las citas agendadas por delante")
  })

  it("un salón: estilistas y salón", () => {
    const f = frasesDelPlan(palabrasDe("salon"))
    expect(f.incluye("equipo")[0].texto).toContain("tus estilistas")
    expect(f.modal.aIndependiente.sedes).toContain("la dirección del salón")
    expect(f.modal.aEquipo.siguenLasHoras).toContain("Las horas agendadas por delante")
  })

  it("un rubro con otros géneros: «de la» donde es femenino y «del» donde es masculino", () => {
    const f = frasesDelPlan(AL_REVES)
    expect(f.incluye("equipo")[1].texto).toBe("Una sola sede: la dirección del taller.")
    expect(f.incluye("independiente")[2].texto).toContain("tus operarias")
    expect(f.modal.aEquipo.horasQueImpiden([{ nombre: "A", horasFuturas: 2 }], "B")).toContain("turnos agendados")
    expect(f.modal.aEquipo.siguenLasHoras).toBe("Los turnos agendados por delante en esa sede siguen, ahora en la dirección del taller.")
  })
})
