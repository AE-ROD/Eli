/**
 * Los medios con los que se cobra una atención. Única fuente de verdad: el
 * tablero, el cobro y los reportes leen de acá, así que un medio nuevo se
 * agrega en un solo lugar.
 *
 * Son fijos a propósito (docs/PRODUCTO.md, sección 7): con medios libres, el
 * desglose de los reportes se partiría en "Efectivo", "efectivo" y "cash", y
 * la caja del día no cerraría contra nada.
 *
 * El `id` es lo que se guarda en `VisitPayment.method`: cambiarlo dejaría a los
 * pagos ya registrados con un medio que el catálogo no conoce.
 */
export const MEDIOS_DE_PAGO = [
  { id: "efectivo", nombre: "Efectivo" },
  { id: "tarjeta-debito", nombre: "Tarjeta de débito" },
  { id: "tarjeta-credito", nombre: "Tarjeta de crédito" },
  { id: "transferencia", nombre: "Transferencia" },
  { id: "billetera-digital", nombre: "Billetera digital" },
] as const

export type MedioDePagoId = (typeof MEDIOS_DE_PAGO)[number]["id"]

/**
 * Los ids como tupla no vacía, que es lo que pide `z.enum`. El cast no abre
 * nada: `MEDIOS_DE_PAGO` es un literal con elementos, y el tipo sale de él.
 */
export const IDS_DE_MEDIOS_DE_PAGO = MEDIOS_DE_PAGO.map((medio) => medio.id) as [
  MedioDePagoId,
  ...MedioDePagoId[],
]

/** Lo que se muestra cuando el id guardado ya no está en el catálogo. */
const MEDIO_DESCONOCIDO = "Otro medio"

/**
 * Si el texto es uno de los medios del catálogo. Busca con `some` y no en un
 * objeto indexado: un id como `constructor` encontraría una función del
 * prototipo y pasaría por medio válido.
 */
export function esMedioDePago(id: string): id is MedioDePagoId {
  return MEDIOS_DE_PAGO.some((medio) => medio.id === id)
}

/**
 * El nombre para mostrar de un medio. Nunca rompe con un id desconocido: un
 * pago es historial, y se tiene que poder leer aunque el catálogo cambie.
 */
export function nombreDeMedio(id: string): string {
  return MEDIOS_DE_PAGO.find((medio) => medio.id === id)?.nombre ?? MEDIO_DESCONOCIDO
}
