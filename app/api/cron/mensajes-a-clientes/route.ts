import { NextRequest, NextResponse } from "next/server"
import { llamadaDeCronAutorizada } from "@/lib/cron"
import { ejecutarMensajesAClientes } from "@/lib/mensajes-a-clientes"

/**
 * La corrida de los mensajes a clientes (`lib/mensajes-a-clientes.ts`), para
 * llamarla a mano con el secreto del cron. No está en `vercel.json` (el plan
 * Hobby ya tiene dos crons): todos los días la corre
 * `/api/cron/correos-de-prueba` al terminar lo suyo. Correrla dos veces el
 * mismo día no duplica nada: cada envío tiene su candado.
 */

export const maxDuration = 60

/** Margen antes de `maxDuration` para no cortar un envío a la mitad. */
const PRESUPUESTO_MS = 50_000

export async function GET(request: NextRequest) {
  if (!llamadaDeCronAutorizada(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const inicio = Date.now()
  const resumen = await ejecutarMensajesAClientes({ ahora: new Date(inicio), hasta: inicio + PRESUPUESTO_MS })
  return NextResponse.json(resumen)
}
