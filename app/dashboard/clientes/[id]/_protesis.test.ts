import { describe, expect, it } from "vitest"
import type { OpcionesDeProtesisRespuesta } from "@/lib/edicion-de-protesis"
import { CORDALES, IDS_DE_TONOS, piezasProtesicasDeLaArcada, repartirMonto } from "@/lib/protesis"
import {
  TEXTO_DEL_CORDAL,
  alternarZona,
  borradorInicial,
  cambiarArcada,
  cambiarTipo,
  cambiosDeLaEdicion,
  disenoDelBorrador,
  edicionDe,
  elegirMaterial,
  estadoDePiezaParaLeer,
  faltasDelOdontograma,
  franjaDeLaArcada,
  materialesPara,
  pedidoDelBorrador,
  repartoDelBorrador,
  tituloDeProtesis,
  tocarPieza,
  tonoVecino,
  tonosPorGrupo,
  valorDelBorrador,
  vecinaEnLaArcada,
  type BorradorDeProtesis,
  type MaterialDeLasOpciones,
} from "./_protesis"

const ACRILICO: MaterialDeLasOpciones = {
  id: "acrilico",
  nombre: "Acrílico termocurado",
  unidad: "arcada",
  tipos: ["removible", "total"],
  precioCents: 18_000_000,
  laboratorioPorDefectoId: "lab-1",
  reparto: { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 },
}
const ZIRCONIO: MaterialDeLasOpciones = {
  id: "zirconio",
  nombre: "Zirconio",
  unidad: "pieza",
  tipos: ["fija", "implante", "corona"],
  precioCents: 29_000_000,
  laboratorioPorDefectoId: null,
  reparto: { pbOdontologo: 3500, pbClinica: 2000, pbTecnico: 4500 },
}
const MATERIALES = [ACRILICO, ZIRCONIO]
const LABORATORIOS = [{ id: "lab-1", nombre: "Laboratorio Andes" }]

const OPCIONES: OpcionesDeProtesisRespuesta = {
  materiales: MATERIALES,
  laboratorios: LABORATORIOS,
  tratantes: [
    { id: "duenio", nombre: "Valentina" },
    { id: "m-1", nombre: "Matías" },
  ],
  excepciones: [{ memberId: "m-1", materialId: "zirconio", pbOdontologo: 4000, pbClinica: 1500, pbTecnico: 4500 }],
  puedeEditar: true,
}

const base = (extra: Partial<BorradorDeProtesis> = {}): BorradorDeProtesis => ({ ...borradorInicial(OPCIONES), ...extra })

describe("borradorInicial", () => {
  it("abre una removible superior con el primer material que sirve y su laboratorio", () => {
    const borrador = borradorInicial(OPCIONES)
    expect(borrador).toMatchObject({
      tipo: "removible",
      arcada: "superior",
      materialId: "acrilico",
      laboratorioId: "lab-1",
      tono: null,
      tratante: "duenio",
    })
  })
})

describe("tocarPieza", () => {
  it("marca, cambia y saca con la misma herramienta o con Borrar", () => {
    let borrador = tocarPieza(base(), 16, "protesica")
    expect(borrador.marcas).toEqual({ 16: "protesica" })
    borrador = tocarPieza(borrador, 16, "pilar")
    expect(borrador.marcas).toEqual({ 16: "pilar" })
    expect(tocarPieza(borrador, 16, "pilar").marcas).toEqual({})
    expect(tocarPieza(borrador, 16, "borrar").marcas).toEqual({})
  })

  it("no toca piezas fuera de la arcada", () => {
    const borrador = base()
    expect(tocarPieza(borrador, 46, "protesica")).toBe(borrador)
  })

  it("en la corona es una sola pieza y sin pilares", () => {
    let borrador = base({ tipo: "corona", materialId: "zirconio" })
    borrador = tocarPieza(borrador, 11, "protesica")
    borrador = tocarPieza(borrador, 21, "protesica")
    expect(borrador.marcas).toEqual({ 21: "protesica" })
    expect(tocarPieza(borrador, 22, "pilar")).toBe(borrador)
  })

  it("los cordales se ven pero no se marcan", () => {
    const borrador = base({ arcada: "ambas" })
    for (const cordal of CORDALES) {
      expect(tocarPieza(borrador, cordal, "protesica")).toBe(borrador)
      expect(tocarPieza(borrador, cordal, "pilar")).toBe(borrador)
    }
    expect(TEXTO_DEL_CORDAL).toBe("cordal, no entra en una prótesis")
  })

  it("en la total no se tocan: van todas menos los cordales (14 por arcada)", () => {
    const borrador = base({ tipo: "total" })
    expect(tocarPieza(borrador, 11, "protesica")).toBe(borrador)
    expect(disenoDelBorrador(borrador).piezas).toEqual(piezasProtesicasDeLaArcada("superior"))
    expect(disenoDelBorrador(borrador).piezas).toHaveLength(14)
    expect(disenoDelBorrador(borrador).piezas).not.toContain(18)
    expect(disenoDelBorrador({ ...borrador, arcada: "ambas" }).piezas).toHaveLength(28)
  })
})

describe("cambiarTipo y cambiarArcada", () => {
  it("la corona no va en Ambas: pasa a la arcada de su pieza y se queda con una", () => {
    const borrador = base({ arcada: "ambas", marcas: { 36: "protesica", 46: "protesica", 47: "pilar" } })
    const corona = cambiarTipo(borrador, "corona", MATERIALES, LABORATORIOS)
    expect(corona).toMatchObject({ tipo: "corona", arcada: "inferior", marcas: { 36: "protesica" }, materialId: "zirconio" })
    expect(cambiarArcada(corona, "ambas")).toBe(corona)
  })

  it("al cambiar de arcada se va lo que queda afuera", () => {
    const borrador = base({ arcada: "ambas", marcas: { 16: "protesica", 46: "pilar" } })
    expect(cambiarArcada(borrador, "inferior").marcas).toEqual({ 46: "pilar" })
  })

  it("mantiene el material si sirve; si no, elige el primero que sirva", () => {
    expect(cambiarTipo(base(), "total", MATERIALES, LABORATORIOS).materialId).toBe("acrilico")
    expect(cambiarTipo(base(), "fija", MATERIALES, LABORATORIOS).materialId).toBe("zirconio")
    expect(materialesPara("fija", MATERIALES).map((m) => m.id)).toEqual(["zirconio"])
  })
})

describe("elegirMaterial", () => {
  it("toma el laboratorio del material sólo si está entre los activos", () => {
    const sinLab = base({ laboratorioId: null })
    expect(elegirMaterial(sinLab, ACRILICO, LABORATORIOS).laboratorioId).toBe("lab-1")
    expect(elegirMaterial(sinLab, ACRILICO, []).laboratorioId).toBeNull()
    expect(elegirMaterial(base({ laboratorioId: "lab-1" }), ZIRCONIO, LABORATORIOS).laboratorioId).toBe("lab-1")
  })
})

describe("zonas y pedido", () => {
  it("manda sólo las zonas que admiten el tipo y la arcada, sin precios", () => {
    let borrador = base({ marcas: { 16: "protesica", 15: "pilar" } })
    borrador = alternarZona(alternarZona(borrador, "paladar"), "lingual")
    expect(pedidoDelBorrador(borrador, false)).toEqual({
      tipo: "removible",
      arcada: "superior",
      piezas: [16],
      pilares: [15],
      zonas: ["paladar"],
      materialId: "acrilico",
      laboratorioId: "lab-1",
      entregaEstimada: null,
      tono: null,
    })
    expect(pedidoDelBorrador({ ...borrador, tipo: "fija" }, true)).toMatchObject({ zonas: [], tratante: "duenio" })
    expect(pedidoDelBorrador({ ...borrador, tono: "A3.5" }, false)).toMatchObject({ tono: "A3.5" })
  })
})

describe("valor y reparto", () => {
  it("calcula el valor como el servidor: por arcada o por pieza", () => {
    expect(valorDelBorrador(base({ arcada: "ambas" }), ACRILICO)).toEqual({ ok: true, unidades: 2, valorCents: 36_000_000 })
    const puente = base({ tipo: "fija", materialId: "zirconio", marcas: { 45: "pilar", 46: "protesica", 47: "pilar" }, arcada: "inferior" })
    expect(valorDelBorrador(puente, ZIRCONIO)).toEqual({ ok: true, unidades: 3, valorCents: 87_000_000 })
    expect(valorDelBorrador(puente, null)).toBeNull()
  })

  it("la dueña ve las tres partes, con la excepción de la tratante", () => {
    const reparto = repartoDelBorrador(87_000_000, ZIRCONIO, "m-1", OPCIONES.excepciones)
    expect(reparto).toEqual({
      visible: "todo",
      origen: "excepcion",
      odontologo: { pb: 4000, cents: 34_800_000 },
      clinica: { pb: 1500, cents: 13_050_000 },
      tecnico: { pb: 4500, cents: 39_150_000 },
    })
  })

  it("si la tratante es la dueña, su parte va a la clínica", () => {
    const reparto = repartoDelBorrador(18_000_000, ACRILICO, "duenio", OPCIONES.excepciones)
    expect(reparto).toMatchObject({ visible: "todo", origen: "material", odontologo: { pb: 0, cents: 0 }, clinica: { pb: 7000 } })
  })

  it("el odontólogo ve sólo su parte, igual que la calcula el servidor", () => {
    const suyo = { ...ACRILICO, reparto: undefined, miPartePb: 4000 }
    const reparto = repartoDelBorrador(18_000_001, suyo, "m-1", undefined)
    expect(reparto).toEqual({ visible: "suyo", odontologo: { pb: 4000, cents: repartirMonto(18_000_001, ACRILICO.reparto!, false).odontologoCents } })
    expect(reparto && "clinica" in reparto).toBe(false)
  })

  it("sin regla ni parte, nada", () => {
    expect(repartoDelBorrador(100, { ...ACRILICO, reparto: undefined }, "m-1", undefined)).toBeNull()
  })
})

describe("la arcada", () => {
  it("lee lo ausente y la extracción indicada del odontograma (sólo marcas de pieza)", () => {
    const faltas = faltasDelOdontograma([
      { pieza: 46, cara: null, tipo: "ausente" },
      { pieza: 18, cara: null, tipo: "extraccion" },
      { pieza: 18, cara: null, tipo: "ausente" },
      { pieza: 16, cara: "O", tipo: "caries" },
    ])
    expect([...faltas]).toEqual([
      [46, "ausente"],
      [18, "ausente"],
    ])
    expect(estadoDePiezaParaLeer(undefined, "ausente")).toBe("sin marcar, ausente en el odontograma")
    expect(estadoDePiezaParaLeer("pilar", undefined)).toBe("pilar o gancho")
  })

  it("con una sola arcada, las flechas no salen de ella", () => {
    expect(vecinaEnLaArcada("superior", 16, "ArrowDown")).toBe(16)
    expect(vecinaEnLaArcada("ambas", 16, "ArrowDown")).toBe(46)
    expect(vecinaEnLaArcada("inferior", 46, "ArrowRight")).toBe(45)
  })

  it("muestra sólo la franja de la arcada elegida", () => {
    expect(franjaDeLaArcada("ambas")).toEqual({ arriba: 0, alto: 700 })
    const arriba = franjaDeLaArcada("superior")
    const abajo = franjaDeLaArcada("inferior")
    expect(arriba.arriba).toBeGreaterThanOrEqual(0)
    expect(arriba.arriba + arriba.alto).toBeLessThan(400)
    expect(abajo.arriba).toBeGreaterThan(300)
    expect(abajo.arriba + abajo.alto).toBeLessThanOrEqual(700)
  })
})

describe("el título", () => {
  it("tipo y arcada", () => {
    expect(tituloDeProtesis("removible", "superior")).toBe("Removible parcial, arcada superior")
    expect(tituloDeProtesis("total", "ambas")).toBe("Total, ambas arcadas")
  })
})

describe("el tono", () => {
  it("agrupa los 19 tonos en el orden de la guía", () => {
    const grupos = tonosPorGrupo()
    expect(grupos.map((grupo) => grupo.nombre)).toEqual([
      "Blanqueamiento",
      "A rojizo-marrón",
      "B rojizo-amarillo",
      "C gris",
      "D rojizo-gris",
    ])
    expect(grupos.flatMap((grupo) => grupo.tonos.map((tono) => tono.etiqueta))).toEqual([
      "0M1", "0M2", "0M3", "A1", "A2", "A3", "A3,5", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D2", "D3", "D4",
    ])
  })

  it("las flechas recorren la guía y dan la vuelta; Inicio y Fin van a las puntas", () => {
    expect(tonoVecino("A3", "ArrowRight")).toBe("A3.5")
    expect(tonoVecino("A3.5", "ArrowDown")).toBe("A4")
    expect(tonoVecino("B1", "ArrowLeft")).toBe("A4")
    expect(tonoVecino("D4", "ArrowRight")).toBe("0M1")
    expect(tonoVecino("0M1", "ArrowUp")).toBe("D4")
    expect(tonoVecino("C2", "Home")).toBe(IDS_DE_TONOS[0])
    expect(tonoVecino("C2", "End")).toBe("D4")
  })
})

describe("cambiar una prótesis creada", () => {
  const creada = { laboratorio: { id: "lab-1" }, entregaEstimada: "2026-12-01", tono: { id: "A2" as const } }

  it("parte de lo que tiene", () => {
    expect(edicionDe(creada)).toEqual({ laboratorioId: "lab-1", entregaEstimada: "2026-12-01", tono: "A2" })
    expect(edicionDe({ laboratorio: null, entregaEstimada: null, tono: null })).toEqual({ laboratorioId: null, entregaEstimada: "", tono: null })
  })

  it("manda sólo lo que cambió; sin cambios, nada", () => {
    const antes = edicionDe(creada)
    expect(cambiosDeLaEdicion(antes, antes)).toBeNull()
    expect(cambiosDeLaEdicion(antes, { ...antes, tono: "A3.5" })).toEqual({ tono: "A3.5" })
    expect(cambiosDeLaEdicion(antes, { laboratorioId: null, entregaEstimada: "", tono: null })).toEqual({
      laboratorioId: null,
      entregaEstimada: null,
      tono: null,
    })
  })
})
