import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { llamadaDeCronAutorizada } from "@/lib/cron"
import { correoQueTocaHoy } from "@/lib/correos-de-prueba"
import { SELECCION_PARA_CORREO, mandarCorreoDePrueba } from "@/lib/enviar-correo-de-prueba"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * Cron diario (`vercel.json`, 13:00 UTC: las 10:00 en Chile con horario de
 * verano, las 9:00 sin él) que manda los correos del ciclo de prueba al dueño
 * de cada negocio: consejo, quedan pocos días y termina hoy, y reintenta la
 * bienvenida que falló al crear el negocio. Qué le toca a cada uno lo decide
 * `lib/correos-de-prueba.ts`; el envío y el candado contra duplicados,
 * `lib/enviar-correo-de-prueba.ts`.
 *
 * Recorre los negocios por lotes con cursor, uno a la vez dentro del lote
 * (Resend limita los envíos por segundo). Si se acaba el tiempo corta antes
 * de que la plataforma lo mate y lo dice en `incompleto`: lo que quedó se
 * manda en la corrida siguiente, si su ventana sigue abierta.
 */

export const maxDuration = 60

/** Negocios por consulta. */
const LOTE = 100

/** Margen antes de `maxDuration` para no cortar un envío a la mitad. */
const PRESUPUESTO_MS = 50_000

/** Una prueba vencida hace más de esto ya no recibe nada (deja pasar "termina-hoy" en cualquier zona). */
const UN_DIA_Y_MEDIO_MS = 36 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  if (!llamadaDeCronAutorizada(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const inicio = Date.now()
  const ahora = new Date(inicio)
  let revisados = 0
  let enviados = 0
  let fallidos = 0
  let incompleto = false
  let cursor: string | undefined

  try {
    for (;;) {
      const negocios = await prisma.business.findMany({
        where: {
          recibeCorreosDePrueba: true,
          user: { correosDesactivados: false },
          pruebaTerminaEl: { gt: new Date(inicio - UN_DIA_Y_MEDIO_MS) },
        },
        select: SELECCION_PARA_CORREO,
        orderBy: { id: "asc" },
        take: LOTE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })

      for (const negocio of negocios) {
        if (Date.now() - inicio > PRESUPUESTO_MS) {
          incompleto = true
          break
        }
        revisados++
        const enviadosAntes = new Set(negocio.correosDeCuenta.map((correo) => correo.tipo))
        const correo = correoQueTocaHoy(negocio, enviadosAntes, ahora)
        if (!correo) continue

        const resultado = await mandarCorreoDePrueba(negocio, correo)
        if (resultado === "enviado") enviados++
        else if (resultado === "fallido") fallidos++
      }

      if (incompleto || negocios.length < LOTE) break
      cursor = negocios[negocios.length - 1].id
    }
  } catch (error) {
    registrarError("en el cron de correos de prueba", error)
    return NextResponse.json({ error: "Error interno", revisados, enviados, fallidos }, { status: 500 })
  }

  return NextResponse.json({ revisados, enviados, fallidos, incompleto })
}
