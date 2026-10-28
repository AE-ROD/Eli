/**
 * Lo que la pantalla de Caja le pide al servidor y la cuenta que muestra
 * mientras se escribe. La pantalla no conoce ninguna URL. Cada función
 * devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar.
 */

import { aCentavos, deCentavos } from "@/lib/atenciones"
import { leerMonto } from "@/lib/dinero"
import { conJson, pedir, pedirConCodigo, type Resultado, type ResultadoConCodigo } from "@/lib/peticiones"

export interface MontoDeMedio {
  medio: string
  nombre: string
  monto: number
}

export interface Desglose {
  otrosMedios: MontoDeMedio[]
  propinasOtrosMedios: MontoDeMedio[]
}

export interface CierreDeCaja {
  id: string
  desde: string
  hasta: string
  fecha: string
  fondoInicial: number
  efectivoCobrado: number
  propinasEfectivo: number
  esperado: number
  contado: number
  diferencia: number
  desglose: Desglose
  nota: string | null
  cerradoPor: string
}

export interface EstadoDeCaja {
  zona: string
  puedeCerrar: boolean
  /** Lo que lleva la caja desde el último cierre (o el inicio del día) hasta ahora. */
  abierta: { desde: string; hasta: string; efectivoCobrado: number; propinasEfectivo: number; desglose: Desglose }
  cierres: CierreDeCaja[]
  total: number
  pagina: number
  paginas: number
}

export async function leerCaja(pagina: number): Promise<Resultado<EstadoDeCaja>> {
  return pedir<EstadoDeCaja>(`/api/caja?pagina=${pagina}`, "No se pudo cargar la caja")
}

/**
 * Cierra la caja. `desde` es el inicio del período que se vio al contar: si
 * otro la cerró entretanto, el servidor responde 409 y la pantalla recarga.
 */
export async function cerrarCaja(datos: {
  desde: string
  fondoInicial: number
  contado: number
  nota: string
}): Promise<ResultadoConCodigo<CierreDeCaja>> {
  return pedirConCodigo<CierreDeCaja>(
    "/api/caja",
    "No se pudo cerrar la caja",
    conJson("POST", { ...datos, nota: datos.nota.trim() || undefined })
  )
}

/**
 * La cuenta que se ve mientras se escribe, en centavos para no arrastrar
 * decimales: esperado = fondo + efectivo cobrado + propinas en efectivo, y
 * diferencia = contado − esperado. Un monto que no se entiende o es
 * negativo da `null` (no se adivina). El servidor la vuelve a hacer.
 */
export function cuentaEnPantalla(
  abierta: { efectivoCobrado: number; propinasEfectivo: number },
  fondoTexto: string,
  contadoTexto: string
): { fondo: number | null; contado: number | null; esperado: number | null; diferencia: number | null } {
  const leer = (texto: string) => {
    if (!texto.trim()) return null
    const monto = leerMonto(texto)
    return monto === null || monto < 0 ? null : monto
  }
  const fondo = leer(fondoTexto)
  const contado = leer(contadoTexto)
  const esperado =
    fondo === null
      ? null
      : deCentavos(aCentavos(fondo) + aCentavos(abierta.efectivoCobrado) + aCentavos(abierta.propinasEfectivo))
  const diferencia = esperado === null || contado === null ? null : deCentavos(aCentavos(contado) - aCentavos(esperado))
  return { fondo, contado, esperado, diferencia }
}
