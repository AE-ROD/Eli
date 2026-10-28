/**
 * Lo que las pantallas de liquidaciones le piden al servidor desde el
 * navegador. Lo que se ve al entrar ya viene resuelto por `page.tsx`, que es
 * de servidor. Cada función devuelve un `Resultado` (`lib/peticiones.ts`).
 *
 * Sólo tipos de `lib/liquidacion.ts` y `lib/movimientos.ts`: con `import type`
 * no se arrastra nada del servidor al navegador.
 */

import { pedir, conJson, type Resultado } from "@/lib/peticiones"
import type { DetalleDeLiquidacion, ResumenDeLiquidacion, TipoDeMovimiento, VistaPrevia } from "@/lib/liquidacion"
import type { MovimientoParaMostrar } from "@/lib/movimientos"
import type { ConfiguracionDePeriodo } from "@/lib/periodos-de-liquidacion"

export type { DetalleDeLiquidacion, ResumenDeLiquidacion, TipoDeMovimiento, VistaPrevia, MovimientoParaMostrar }

const cod = encodeURIComponent

export function leerVistaPrevia(miembroId: string, excluir: readonly string[]): Promise<Resultado<VistaPrevia>> {
  const consulta = excluir.length > 0 ? `&excluir=${excluir.map(cod).join(",")}` : ""
  return pedir<VistaPrevia>(
    `/api/liquidaciones/vista-previa?miembro=${cod(miembroId)}${consulta}`,
    "No se pudo calcular la liquidación"
  )
}

export function cerrarLiquidacion(datos: {
  miembroId: string
  desde: string
  excluirMovimientos: readonly string[]
  nota: string
}): Promise<Resultado<ResumenDeLiquidacion>> {
  return pedir<ResumenDeLiquidacion>("/api/liquidaciones", "No se pudo cerrar la liquidación", conJson("POST", datos))
}

export function marcarPagada(id: string, medio: string): Promise<Resultado<DetalleDeLiquidacion>> {
  return pedir<DetalleDeLiquidacion>(
    `/api/liquidaciones/${cod(id)}/pago`,
    "No se pudo marcar como pagada",
    conJson("POST", { medio })
  )
}

export function anularLiquidacion(id: string, motivo: string): Promise<Resultado<DetalleDeLiquidacion>> {
  return pedir<DetalleDeLiquidacion>(
    `/api/liquidaciones/${cod(id)}/anulacion`,
    "No se pudo anular la liquidación",
    conJson("POST", { motivo })
  )
}

export function guardarConfiguracion(config: ConfiguracionDePeriodo): Promise<Resultado<ConfiguracionDePeriodo>> {
  return pedir<ConfiguracionDePeriodo>(
    "/api/liquidaciones/configuracion",
    "No se pudo guardar el período",
    conJson("PUT", config)
  )
}

export function registrarMovimiento(datos: {
  miembroId: string
  tipo: TipoDeMovimiento
  monto: number
  fecha: string
  motivo: string
}): Promise<Resultado<MovimientoParaMostrar>> {
  return pedir<MovimientoParaMostrar>("/api/movimientos", "No se pudo registrar", conJson("POST", datos))
}

export function anularMovimiento(id: string): Promise<Resultado<MovimientoParaMostrar>> {
  return pedir<MovimientoParaMostrar>(`/api/movimientos/${cod(id)}/anulacion`, "No se pudo anular", { method: "POST" })
}
