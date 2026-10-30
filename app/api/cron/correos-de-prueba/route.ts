import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { llamadaDeCronAutorizada } from "@/lib/cron"
import { correoQueTocaHoy } from "@/lib/correos-de-prueba"
import { SELECCION_PARA_CORREO, mandarCorreoDePrueba } from "@/lib/enviar-correo-de-prueba"
import { registrarError } from "@/lib/registro-de-errores"
import { ejecutarMensajesAClientes } from "@/lib/mensajes-a-clientes"

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
 *
 * Al terminar, corre los mensajes a clientes (`lib/mensajes-a-clientes.ts`:
 * lista de espera, "te toca" y reseñas) con el tiempo que queda. Van acá y no
 * en un cron propio porque el plan Hobby de Vercel ya tiene dos crons, y éste
 * es el liviano (sólo negocios en prueba): los recordatorios, que son
 * servicio, no comparten su tiempo con nadie. Los correos de prueba tienen
 * hasta `PRESUPUESTO_PRUEBA_MS`, y los mensajes, hasta `PRESUPUESTO_MS`. Un
 * fallo de unos no corta a los otros.
 */

export const maxDuration = 60

/** Negocios por consulta. */
const LOTE = 100

/** Margen antes de `maxDuration` para no cortar un envío a la mitad. */
const PRESUPUESTO_MS = 50_000

/** Los correos de prueba cortan antes, para dejarles tiempo a los mensajes a clientes. */
const PRESUPUESTO_PRUEBA_MS = 25_000

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
  let fallo = false

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
        if (Date.now() - inicio > PRESUPUESTO_PRUEBA_MS) {
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
    fallo = true
  }

  const mensajesAClientes = await ejecutarMensajesAClientes({ ahora, hasta: inicio + PRESUPUESTO_MS })

  if (fallo) {
    return NextResponse.json({ error: "Error interno", revisados, enviados, fallidos, mensajesAClientes }, { status: 500 })
  }
  return NextResponse.json({ revisados, enviados, fallidos, incompleto, mensajesAClientes })
}
