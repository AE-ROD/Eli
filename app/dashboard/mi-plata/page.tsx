import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { ChevronRight, HandCoins, History, Smile } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, esClinicaDental, veMiPlata } from "@/lib/permisos"
import { calcularMiPlata, type Ganado } from "@/lib/mi-plata"
import { NOMBRES_DE_MOVIMIENTO } from "@/lib/movimientos"
import { fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { InsigniaDeEstado, pesos } from "../liquidaciones/_componentes/piezas"

/** Comisiones, prótesis y propinas debajo del total, sólo si hay algo además de las comisiones que separar. */
function Desglose({ ganado }: { ganado: Ganado }) {
  if (ganado.propinasCents === 0 && ganado.protesisCents === 0) return null
  const partes = [
    `${pesos(ganado.comisionesCents)} en comisiones`,
    ...(ganado.protesisCents !== 0 ? [`${pesos(ganado.protesisCents)} en prótesis`] : []),
    ...(ganado.propinasCents !== 0 ? [`${pesos(ganado.propinasCents)} en propinas`] : []),
  ]
  return <p className="text-sm text-texto-2">{partes.join(" · ")}</p>
}

/** Debajo del total de hoy o de la semana: lo de prótesis, si hay (clínica dental). */
function DeProtesis({ ganado }: { ganado: Ganado }) {
  if (ganado.protesisCents === 0) return null
  return <p className="text-[13px] text-texto-2 tabular-nums">{pesos(ganado.protesisCents)} de prótesis</p>
}

/**
 * Mi plata (#70): lo que lleva ganado quien atiende, mobile first. Sale de
 * `actor.memberId` y de nada más: la página no recibe a quién mirar. Sin
 * `memberId` (la dueña) no se ve: de vuelta al inicio.
 */
export default async function PaginaMiPlata() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!veMiPlata(actor) || !actor.memberId) redirect("/dashboard")

  const plata = await calcularMiPlata(prisma, { businessId: actor.businessId, memberId: actor.memberId, ahora: new Date() })
  if (!plata) redirect("/dashboard")
  const clinica = esClinicaDental(actor)

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Mi plata" subtitulo="Lo que llevas ganado, tus adelantos y tus liquidaciones." mostrarBusqueda={false} />

      <div className="max-w-xl space-y-4 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <section aria-labelledby="titulo-periodo" className={cn(TARJETA_DEL_PANEL, "space-y-1 p-5 sm:p-6")}>
          <h2 id="titulo-periodo" className="text-sm text-texto-2">
            Este período · {plata.periodo.texto}
          </h2>
          <p className="font-serif text-4xl tabular-nums">{pesos(plata.periodo.totalCents)}</p>
          <Desglose ganado={plata.periodo} />
        </section>

        <div className="grid grid-cols-2 gap-4">
          <section aria-labelledby="titulo-hoy" className={cn(TARJETA_DEL_PANEL, "space-y-1 p-4 sm:p-5")}>
            <h2 id="titulo-hoy" className="text-sm text-texto-2">
              Hoy
            </h2>
            <p className="text-2xl font-medium tabular-nums">{pesos(plata.hoy.totalCents)}</p>
            <DeProtesis ganado={plata.hoy} />
          </section>
          <section aria-labelledby="titulo-semana" className={cn(TARJETA_DEL_PANEL, "space-y-1 p-4 sm:p-5")}>
            <h2 id="titulo-semana" className="text-sm text-texto-2">
              Esta semana
            </h2>
            <p className="text-2xl font-medium tabular-nums">{pesos(plata.semana.totalCents)}</p>
            <DeProtesis ganado={plata.semana} />
          </section>
        </div>

        <p className="px-1 text-sm text-texto-2">
          {clinica
            ? "Cuenta tus comisiones ya calculadas y tus propinas de lo cobrado, por el día en que se cobró, y tu parte de las prótesis desde que se entregan."
            : "Cuenta tus comisiones ya calculadas y tus propinas de lo cobrado, por el día en que se cobró."}
        </p>

        {/* Clínica dental: lo ya cobrado de prótesis suyas que todavía no se entregan. */}
        {clinica && (
          <section aria-labelledby="titulo-por-liberar" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
            <EncabezadoDeTarjeta
              id="titulo-por-liberar"
              titulo="Prótesis por liberar"
              subtitulo={
                plata.protesisPorLiberar.abonos > 0
                  ? `Tu parte de ${plata.protesisPorLiberar.abonos === 1 ? "1 abono ya cobrado" : `${plata.protesisPorLiberar.abonos} abonos ya cobrados`} de prótesis que todavía no se entregan.`
                  : "Nada cobrado de prótesis tuyas sin entregar."
              }
              icono={{ figura: Smile }}
            />
            {plata.protesisPorLiberar.abonos > 0 && (
              <>
                <p className="mt-4 text-2xl font-medium tabular-nums">{pesos(plata.protesisPorLiberar.totalCents)}</p>
                <p className="mt-1 text-sm text-texto-2">
                  Se libera al entregar cada prótesis: desde ese día cuenta en lo ganado y entra en tu liquidación.
                </p>
              </>
            )}
          </section>
        )}

        {plata.esperanPorcentaje > 0 && (
          <Aviso tono="atencion" rol="status">
            {plata.esperanPorcentaje === 1
              ? "1 servicio espera su porcentaje de comisión: avísale a la dueña."
              : `${plata.esperanPorcentaje} servicios esperan su porcentaje de comisión: avísale a la dueña.`}
          </Aviso>
        )}

        <section aria-labelledby="titulo-adelantos" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
          <EncabezadoDeTarjeta
            id="titulo-adelantos"
            titulo="Adelantos y vales"
            subtitulo={
              plata.adelantos.lista.length > 0
                ? `${pesos(plata.adelantos.totalCents)} se descuentan en tu próxima liquidación`
                : "Nada pendiente de descontar"
            }
            icono={{ figura: HandCoins }}
          />
          {plata.adelantos.lista.length > 0 && (
            <ul className="mt-4 divide-y divide-borde/60 text-sm">
              {plata.adelantos.lista.map((movimiento) => (
                <li key={movimiento.id} className="flex justify-between gap-4 py-2">
                  <span>
                    {NOMBRES_DE_MOVIMIENTO[movimiento.tipo]} · <span className="text-texto-2">{fechaParaLeer(movimiento.fecha)}</span>
                    {movimiento.motivo && <span className="block text-texto-2">{movimiento.motivo}</span>}
                  </span>
                  <span className="tabular-nums">{pesos(movimiento.montoCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titulo-liquidaciones" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
          <EncabezadoDeTarjeta
            id="titulo-liquidaciones"
            titulo="Mis liquidaciones"
            subtitulo="Cada una con su comprobante"
            icono={{ figura: History }}
          />
          {plata.liquidaciones.length === 0 ? (
            <EstadoVacio className="mt-4">Todavía no tienes liquidaciones cerradas.</EstadoVacio>
          ) : (
            <ul className="mt-4 divide-y divide-borde/60">
              {plata.liquidaciones.map((liquidacion) => (
                <li key={liquidacion.id}>
                  <Link
                    href={`/dashboard/liquidaciones/${liquidacion.id}`}
                    className="anillo-foco -mx-2 flex min-h-11 items-center gap-3 rounded-campo px-2 py-3 hover:bg-superficie"
                  >
                    <span className="min-w-0 flex-1 text-sm">{liquidacion.texto}</span>
                    <InsigniaDeEstado estado={liquidacion.estado} />
                    <span className={cn("tabular-nums font-medium", liquidacion.estado === "anulada" && "text-texto-2 line-through")}>
                      {pesos(liquidacion.totalCents)}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-texto-2" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
