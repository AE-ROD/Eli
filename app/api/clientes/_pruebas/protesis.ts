import { CLINICA, OTRA_CLINICA, escenarioDental } from "./clinica-dental"

/**
 * Las prótesis de la Clínica Aurora (`clinica-dental.ts`), para los tests de
 * `app/api/clientes/[id]/protesis/…`, `app/api/comisiones/protesis/…` y
 * `app/api/configuracion/laboratorios`.
 *
 * - Laboratorios: "Laboratorio Sur" (activo), "Técnico Rivas" (desactivado) y
 *   uno de la otra clínica que se llama igual.
 * - Materiales: Acrílico termocurado (por arcada, $180.000, 40/30/30, con
 *   Laboratorio Sur por defecto), Zirconio (por pieza, $290.000, 35/20/45),
 *   Flexible viejo (desactivado) y uno de la otra clínica.
 * - Pérez tiene una excepción en Zirconio (40/15/45).
 * - Camila tiene dos prótesis: una removible de Pérez en laboratorio (con dos
 *   pasos de seguimiento) y una corona de Núñez recién creada, sin
 *   laboratorio. Beto tiene una, y la otra clínica, otra.
 */

type Registro = Record<string, unknown>

const CREADA = new Date("2026-11-02T14:00:00.000Z")
const ENVIADA = new Date("2026-11-03T15:00:00.000Z")

/** Una prótesis de la clínica: la removible de Camila, salvo lo que se pise. */
export function protesis(id: string, datos: Registro = {}): Registro {
  return {
    id,
    businessId: CLINICA,
    customerId: "p-camila",
    memberId: "m-perez",
    tratanteNombre: "Diego Pérez",
    tipo: "removible",
    arcada: "inferior",
    piezas: [46],
    pilares: [45, 47],
    zonas: ["lingual"],
    materialId: "mt-acrilico",
    materialNombre: "Acrílico termocurado",
    unidad: "arcada",
    precioUnitarioCents: 18_000_000,
    unidades: 1,
    valorCents: 18_000_000,
    laboratorioId: "lab-sur",
    laboratorioNombre: "Laboratorio Sur",
    entregaEstimada: new Date("2026-11-20T00:00:00.000Z"),
    estado: "en-laboratorio",
    pbOdontologo: 4000,
    pbClinica: 3000,
    pbTecnico: 3000,
    origenDelReparto: "material",
    creadoPorNombre: "Diego Pérez",
    createdAt: CREADA,
    ...datos,
  }
}

export function escenarioDeProtesis() {
  return {
    ...escenarioDental(),
    laboratorio: [
      { id: "lab-sur", businessId: CLINICA, nombre: "Laboratorio Sur", contacto: "+56 9 1111 2222" },
      { id: "lab-viejo", businessId: CLINICA, nombre: "Técnico Rivas", activo: false },
      { id: "lab-ajeno", businessId: OTRA_CLINICA, nombre: "Laboratorio Sur" },
    ],
    materialDeProtesis: [
      {
        id: "mt-acrilico",
        businessId: CLINICA,
        nombre: "Acrílico termocurado",
        unidad: "arcada",
        tipos: ["removible", "total"],
        precioCents: 18_000_000,
        pbOdontologo: 4000,
        pbClinica: 3000,
        pbTecnico: 3000,
        laboratorioPorDefectoId: "lab-sur",
        orden: 1,
      },
      {
        id: "mt-zirconio",
        businessId: CLINICA,
        nombre: "Zirconio",
        unidad: "pieza",
        tipos: ["fija", "implante", "corona"],
        precioCents: 29_000_000,
        pbOdontologo: 3500,
        pbClinica: 2000,
        pbTecnico: 4500,
        orden: 2,
      },
      {
        id: "mt-viejo",
        businessId: CLINICA,
        nombre: "Flexible viejo",
        unidad: "arcada",
        tipos: ["removible"],
        precioCents: 10_000_000,
        pbOdontologo: 4000,
        pbClinica: 3000,
        pbTecnico: 3000,
        orden: 3,
        activo: false,
      },
      {
        id: "mt-ajeno",
        businessId: OTRA_CLINICA,
        nombre: "Acrílico termocurado",
        unidad: "arcada",
        tipos: ["removible", "total"],
        precioCents: 1_000_000,
        pbOdontologo: 1000,
        pbClinica: 1000,
        pbTecnico: 8000,
        orden: 1,
      },
    ],
    excepcionDeRepartoDeProtesis: [
      { id: "ex-perez", businessId: CLINICA, memberId: "m-perez", materialId: "mt-zirconio", pbOdontologo: 4000, pbClinica: 1500, pbTecnico: 4500 },
      { id: "ex-ajena", businessId: OTRA_CLINICA, memberId: "m-ajeno", materialId: "mt-ajeno", pbOdontologo: 5000, pbClinica: 0, pbTecnico: 5000 },
    ],
    protesis: [
      protesis("pt-removible"),
      protesis("pt-corona", {
        memberId: "m-nunez",
        tratanteNombre: "Laura Núñez",
        tipo: "corona",
        arcada: "superior",
        piezas: [21],
        pilares: [],
        zonas: [],
        materialId: "mt-zirconio",
        materialNombre: "Zirconio",
        unidad: "pieza",
        precioUnitarioCents: 29_000_000,
        valorCents: 29_000_000,
        laboratorioId: null,
        laboratorioNombre: null,
        entregaEstimada: null,
        estado: "impresion",
        pbOdontologo: 3500,
        pbClinica: 2000,
        pbTecnico: 4500,
        creadoPorNombre: "Laura Núñez",
        createdAt: new Date("2026-11-04T14:00:00.000Z"),
      }),
      protesis("pt-beto", { customerId: "p-beto" }),
      protesis("pt-ajena", {
        businessId: OTRA_CLINICA,
        customerId: "p-ajena",
        memberId: "m-ajeno",
        materialId: "mt-ajeno",
        laboratorioId: "lab-ajeno",
      }),
    ],
    eventoDeProtesis: [
      { id: "evp-1", businessId: CLINICA, protesisId: "pt-removible", estado: "impresion", autorNombre: "Diego Pérez", createdAt: CREADA },
      { id: "evp-2", businessId: CLINICA, protesisId: "pt-removible", estado: "en-laboratorio", autorNombre: "Valentina Soto", createdAt: ENVIADA },
      {
        id: "evp-3",
        businessId: CLINICA,
        protesisId: "pt-corona",
        estado: "impresion",
        autorNombre: "Laura Núñez",
        createdAt: new Date("2026-11-04T14:00:00.000Z"),
      },
    ],
  }
}

/**
 * Un abono a una prótesis: una atención con una línea ligada (sin servicio)
 * y su reparto, como la va a escribir el cobro por abonos.
 */
export function conAbono(escenario: ReturnType<typeof escenarioDeProtesis>, protesisId: string, montoCents: number, status = "finalizada") {
  const visitId = `at-${protesisId}-${status}`
  return {
    ...escenario,
    visit: [{ id: visitId, businessId: CLINICA, customerId: "p-camila", customerName: "Camila Rojas", status }],
    visitService: [
      {
        id: `ab-${visitId}`,
        visitId,
        serviceId: null,
        serviceName: "Abono prótesis",
        memberId: "m-perez",
        professionalName: "Diego Pérez",
        priceCents: montoCents,
        protesisId,
      },
    ],
  }
}
