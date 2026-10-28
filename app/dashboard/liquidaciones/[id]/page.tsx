import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { leerLiquidacion } from "@/lib/liquidacion"
import { NOMBRES_DE_MOVIMIENTO } from "@/lib/movimientos"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import { actorDeSesion, puedeAnularLiquidacion, puedePagarLiquidacion, puedeVerLiquidacionesDelEquipo } from "@/lib/permisos"
import { fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { AccionesDelComprobante } from "../_componentes/acciones-del-comprobante"
import { FilaDeTotal, InsigniaDeEstado, pesos, porcentaje } from "../_componentes/piezas"

/**
 * Al imprimir (o guardar como PDF desde el diálogo del navegador) la hoja es
 * sólo el comprobante: sin la barra lateral, sin la barra superior y sin los
 * botones. Va en la página y no en `globals.css`: sólo vale mientras se ve
 * un comprobante.
 */
const IMPRESION = `
@media print {
  div:has(> aside[aria-label="Barra lateral"]), [data-no-imprimir] { display: none !important; }
  main { margin-left: 0 !important; }
  body { background: #fff !important; }
  [data-comprobante] { box-shadow: none !important; padding: 0 !important; }
  [data-comprobante] table { break-inside: auto; }
  [data-comprobante] tr { break-inside: avoid; }
}
`

const momento = (iso: string, zona: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: zona, dateStyle: "medium", timeStyle: "short" })

const CELDA = "py-2 pr-3 align-top"
const CABECERA = "py-2 pr-3 text-left text-xs font-medium uppercase tracking-[0.04em] text-texto-2"

/**
 * El comprobante de una liquidación (#69), imprimible. Lo ve quien ve la
 * liquidación: la gestión, cualquiera del negocio; el profesional, las suyas
 * (ajena o inexistente: 404, igual que la API). Marcar pagada y anular son de
 * la dueña.
 */
export default async function PaginaComprobante({ params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")

  const { id } = await params
  const [detalle, negocio] = await Promise.all([
    leerLiquidacion(prisma, actor, id),
    prisma.business.findUnique({ where: { id: actor.businessId }, select: { name: true } }),
  ])
  if (!detalle) notFound()

  const zona = detalle.zona
  const t = detalle.totales
  const volverA = puedeVerLiquidacionesDelEquipo(actor) ? "/dashboard/liquidaciones" : "/dashboard/mi-plata"

  return (
    <div className="min-h-dvh">
      <style>{IMPRESION}</style>
      <div data-no-imprimir>
        <BarraSuperior titulo="Comprobante" subtitulo={`${detalle.miembro} · ${detalle.texto}`} mostrarBusqueda={false} />
      </div>

      <div className="max-w-3xl space-y-4 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <div data-no-imprimir>
          <AccionesDelComprobante
            id={detalle.id}
            estado={detalle.estado}
            resumen={`Liquidación de ${detalle.miembro}, ${detalle.texto}: ${pesos(t.totalCents)}`}
            volverA={volverA}
            puedePagar={puedePagarLiquidacion(actor)}
            puedeAnular={puedeAnularLiquidacion(actor)}
          />
        </div>

        <article data-comprobante className={cn(TARJETA_DEL_PANEL, "space-y-8 p-5 sm:p-8")}>
          <header className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-texto-2">{negocio?.name}</p>
                <h2 className="titulo-3 font-serif text-balance">Comprobante de liquidación</h2>
              </div>
              <InsigniaDeEstado estado={detalle.estado} />
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-texto-2">Profesional</dt>
                <dd className="font-medium">{detalle.miembro}</dd>
              </div>
              <div>
                <dt className="text-texto-2">Período</dt>
                <dd className="font-medium">
                  {fechaParaLeer(detalle.desde)} al {fechaParaLeer(detalle.hasta)}
                </dd>
              </div>
              <div>
                <dt className="text-texto-2">Cerrada</dt>
                <dd>
                  {momento(detalle.cerradaAt, zona)} por {detalle.cerradaPorNombre}
                </dd>
              </div>
              {detalle.pagadaAt && (
                <div>
                  <dt className="text-texto-2">Pagada</dt>
                  <dd>
                    {momento(detalle.pagadaAt, zona)} por {detalle.pagadaPorNombre}
                    {detalle.medioDePagoTexto ? `, con ${detalle.medioDePagoTexto.toLowerCase()}` : ""}
                  </dd>
                </div>
              )}
              {detalle.anuladaAt && (
                <div className="sm:col-span-2">
                  <dt className="text-texto-2">Anulada</dt>
                  <dd>
                    {momento(detalle.anuladaAt, zona)} por {detalle.anuladaPorNombre}: {detalle.motivoAnulacion}
                  </dd>
                </div>
              )}
            </dl>
          </header>

          <section aria-labelledby="titulo-servicios" className="space-y-2">
            <h3 id="titulo-servicios" className="font-medium">
              Servicios y productos
            </h3>
            {detalle.lineas.length === 0 ? (
              <p className="text-sm text-texto-2">No incluye servicios ni productos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-borde">
                      <th className={CABECERA}>Fecha</th>
                      <th className={CABECERA}>Cliente</th>
                      <th className={CABECERA}>Detalle</th>
                      <th className={cn(CABECERA, "text-right")}>Precio</th>
                      <th className={cn(CABECERA, "text-right")}>%</th>
                      <th className={cn(CABECERA, "pr-0 text-right")}>Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.lineas.map((linea) => (
                      <tr key={linea.id} className="border-b border-borde/60">
                        <td className={cn(CELDA, "whitespace-nowrap")}>{fechaParaLeer(linea.fecha)}</td>
                        <td className={CELDA}>{linea.cliente}</td>
                        <td className={CELDA}>
                          {linea.detalle}
                          {linea.tipo === "producto" && <span className="text-texto-2"> (producto)</span>}
                        </td>
                        <td className={cn(CELDA, "text-right tabular-nums")}>{pesos(linea.precioCents)}</td>
                        <td className={cn(CELDA, "text-right tabular-nums")}>
                          {linea.porcentaje === null ? "—" : porcentaje(linea.porcentaje)}
                        </td>
                        <td className={cn(CELDA, "pr-0 text-right tabular-nums")}>
                          {linea.comisionCents === null ? "—" : pesos(linea.comisionCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {detalle.propinas.length > 0 && (
            <section aria-labelledby="titulo-propinas" className="space-y-2">
              <h3 id="titulo-propinas" className="font-medium">
                Propinas
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {detalle.propinas.map((propina) => (
                    <tr key={propina.id} className="border-b border-borde/60">
                      <td className={cn(CELDA, "whitespace-nowrap")}>{fechaParaLeer(propina.fecha)}</td>
                      <td className={CELDA}>{propina.cliente}</td>
                      <td className={CELDA}>{nombreDeMedio(propina.medio)}</td>
                      <td className={cn(CELDA, "pr-0 text-right tabular-nums")}>{pesos(propina.montoCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {detalle.movimientos.length > 0 && (
            <section aria-labelledby="titulo-movimientos" className="space-y-2">
              <h3 id="titulo-movimientos" className="font-medium">
                Adelantos, vales y ajustes
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {detalle.movimientos.map((movimiento) => (
                    <tr key={movimiento.id} className="border-b border-borde/60">
                      <td className={cn(CELDA, "whitespace-nowrap")}>{fechaParaLeer(movimiento.fecha)}</td>
                      <td className={CELDA}>
                        {NOMBRES_DE_MOVIMIENTO[movimiento.tipo]}
                        {movimiento.motivo && <span className="text-texto-2">: {movimiento.motivo}</span>}
                      </td>
                      <td className={cn(CELDA, "pr-0 text-right tabular-nums")}>
                        {pesos(movimiento.tipo === "ajuste" ? movimiento.montoCents : -movimiento.montoCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-labelledby="titulo-totales">
            <h3 id="titulo-totales" className="sr-only">
              Totales
            </h3>
            <dl className="ml-auto max-w-sm space-y-2">
              <FilaDeTotal concepto="Comisión por servicios" centavos={t.comisionServiciosCents} />
              {t.comisionProductosCents !== 0 && <FilaDeTotal concepto="Comisión por productos" centavos={t.comisionProductosCents} />}
              {t.propinasCents !== 0 && <FilaDeTotal concepto="Propinas" centavos={t.propinasCents} />}
              {t.adelantosCents !== 0 && <FilaDeTotal concepto="Adelantos y vales" centavos={-t.adelantosCents} />}
              {t.ajustesCents !== 0 && <FilaDeTotal concepto="Ajustes" centavos={t.ajustesCents} />}
              <FilaDeTotal concepto="Total a pagar" centavos={t.totalCents} fuerte />
            </dl>
          </section>

          {detalle.nota && (
            <p className="text-sm">
              <span className="text-texto-2">Nota: </span>
              {detalle.nota}
            </p>
          )}
        </article>
      </div>
    </div>
  )
}
