import { CLINICA, OTRA_CLINICA } from "./clinica-dental"
import { escenarioDeProtesis, protesis } from "./protesis"

/**
 * Los abonos de prótesis ya cobrados de la Clínica Aurora, para los tests del
 * dinero de las prótesis: la liquidación de la odontóloga, Mi plata, "Por
 * pagar al laboratorio" y la anulación. Sobre `escenarioDeProtesis`.
 *
 * Prótesis (de Camila salvo la de la otra clínica):
 * - pt-removible: de Pérez, en laboratorio (sin entregar), $180.000, 40/30/30.
 * - pt-entregada: de Pérez, entregada el 3 nov 2026, Laboratorio Sur, $180.000, 40/30/30.
 * - pt-de-la-duena: de la dueña (no es miembro), entregada, Laboratorio Sur, 40/30/30.
 * - pt-de-nunez: de Núñez, entregada, Laboratorio Norte, $290.000, 35/20/45.
 * - pt-ajena-entregada: de la otra clínica, entregada, con su abono.
 *
 * Abonos (líneas con el reparto congelado al cobrar):
 * - ab-oct: $50.000 a pt-entregada, cobrado el 20 oct (antes de entregar).
 * - ab-nov: $30.000 a pt-entregada, cobrado el 5 nov (después de entregar).
 * - ab-sin-entregar: $20.000 a pt-removible, cobrado el 21 oct.
 * - ab-duena: $10.000 a pt-de-la-duena, cobrado el 4 nov.
 * - ab-nunez: $29.000 a pt-de-nunez, cobrado el 6 nov.
 * - ab-anulada: $40.000 a pt-entregada, en una atención anulada (no cuenta).
 * - ab-ajeno: de la otra clínica.
 * Y una línea normal de Pérez cobrada el 15 oct con su comisión congelada.
 */

type Registro = Record<string, unknown>

export const ENTREGADA_EL = new Date("2026-11-03T15:00:00.000Z")
export const LIQUIDAR_DESDE = new Date("2026-10-01T00:00:00.000Z")

const PEREZ = { memberId: "m-perez", byOwner: false, professionalName: "Diego Pérez" }
const NUNEZ = { memberId: "m-nunez", byOwner: false, professionalName: "Laura Núñez" }
const DUENA = { memberId: null, byOwner: true, professionalName: "Valentina Soto" }

/** Una atención cobrada de Camila. */
export function atencionCobrada(id: string, paidAt: string, datos: Registro = {}): Registro {
  return {
    id,
    businessId: CLINICA,
    customerId: "p-camila",
    customerName: "Camila Rojas",
    status: "finalizada",
    arrivedAt: new Date(paidAt),
    paidAt: new Date(paidAt),
    ...datos,
  }
}

/** Un abono cobrado, con su reparto congelado (lo calcula el test, no el código). */
export function abono(
  id: string,
  visitId: string,
  protesisId: string,
  quien: Registro,
  reparto: [odontologo: number, clinica: number, tecnico: number],
  datos: Registro = {}
): Registro {
  const [odontologoCents, clinicaCents, tecnicoCents] = reparto
  return {
    id,
    visitId,
    serviceId: null,
    serviceName: `Abono prótesis · ${protesisId}`,
    ...quien,
    priceCents: odontologoCents + clinicaCents + tecnicoCents,
    protesisId,
    odontologoCents,
    clinicaCents,
    tecnicoCents,
    ...datos,
  }
}

export function escenarioDeAbonos() {
  const base = escenarioDeProtesis()
  return {
    ...base,
    business: base.business.map((negocio) => (negocio.id === CLINICA || negocio.id === OTRA_CLINICA ? { ...negocio, liquidacionDesde: LIQUIDAR_DESDE } : negocio)),
    laboratorio: [...base.laboratorio, { id: "lab-norte", businessId: CLINICA, nombre: "Laboratorio Norte" }],
    protesis: [
      ...base.protesis,
      protesis("pt-entregada", { estado: "entregada", entregadaEn: ENTREGADA_EL }),
      protesis("pt-de-la-duena", {
        memberId: null,
        byOwner: true,
        tratanteNombre: "Valentina Soto",
        estado: "entregada",
        entregadaEn: ENTREGADA_EL,
      }),
      protesis("pt-de-nunez", {
        memberId: "m-nunez",
        tratanteNombre: "Laura Núñez",
        tipo: "corona",
        arcada: "superior",
        piezas: [11],
        pilares: [],
        zonas: [],
        materialId: "mt-zirconio",
        materialNombre: "Zirconio",
        unidad: "pieza",
        precioUnitarioCents: 29_000_000,
        valorCents: 29_000_000,
        laboratorioId: "lab-norte",
        laboratorioNombre: "Laboratorio Norte",
        pbOdontologo: 3500,
        pbClinica: 2000,
        pbTecnico: 4500,
        estado: "entregada",
        entregadaEn: ENTREGADA_EL,
      }),
      protesis("pt-ajena-entregada", {
        businessId: OTRA_CLINICA,
        customerId: "p-ajena",
        memberId: "m-ajeno",
        materialId: "mt-ajeno",
        laboratorioId: "lab-ajeno",
        estado: "entregada",
        entregadaEn: ENTREGADA_EL,
      }),
    ],
    visit: [
      atencionCobrada("at-servicio", "2026-10-15T15:00:00.000Z"),
      atencionCobrada("at-oct", "2026-10-20T15:00:00.000Z"),
      atencionCobrada("at-sin-entregar", "2026-10-21T15:00:00.000Z"),
      atencionCobrada("at-duena", "2026-11-04T15:00:00.000Z"),
      atencionCobrada("at-nov", "2026-11-05T15:00:00.000Z"),
      atencionCobrada("at-nunez", "2026-11-06T15:00:00.000Z"),
      atencionCobrada("at-anulada", "2026-11-05T16:00:00.000Z", { status: "anulada", voidedAt: new Date("2026-11-05T17:00:00.000Z") }),
      atencionCobrada("at-ajena", "2026-11-05T15:00:00.000Z", { businessId: OTRA_CLINICA, customerId: "p-ajena" }),
    ],
    visitService: [
      {
        id: "l-servicio",
        visitId: "at-servicio",
        serviceId: "s-resina",
        serviceName: "Restauración resina compuesta",
        ...PEREZ,
        priceCents: 4_800_000,
        commissionPercent: 40,
        commissionCents: 1_920_000,
        commissionAt: new Date("2026-10-15T15:00:00.000Z"),
      },
      abono("ab-oct", "at-oct", "pt-entregada", PEREZ, [2_000_000, 1_500_000, 1_500_000]),
      abono("ab-sin-entregar", "at-sin-entregar", "pt-removible", PEREZ, [800_000, 600_000, 600_000]),
      abono("ab-duena", "at-duena", "pt-de-la-duena", DUENA, [0, 700_000, 300_000]),
      abono("ab-nov", "at-nov", "pt-entregada", PEREZ, [1_200_000, 900_000, 900_000]),
      abono("ab-nunez", "at-nunez", "pt-de-nunez", NUNEZ, [1_015_000, 580_000, 1_305_000]),
      abono("ab-anulada", "at-anulada", "pt-entregada", PEREZ, [1_600_000, 1_200_000, 1_200_000]),
      abono("ab-ajeno", "at-ajena", "pt-ajena-entregada", { memberId: "m-ajeno", byOwner: false, professionalName: "Diego Pérez" }, [
        1_000_000, 1_000_000, 1_000_000,
      ]),
    ],
  }
}
