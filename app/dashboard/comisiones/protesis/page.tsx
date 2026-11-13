import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { sesionDelServidor } from "@/lib/sesion-del-servidor"
import { CAMBIOS_MAXIMOS, CAMBIOS_POR_PAGINA, leerCambiosDeReparto, limiteDeCambios } from "@/lib/cambios-de-reparto-servidor"
import { actorDeSesion, puedeConfigurarRepartoDeProtesis, puedeEditarComisiones } from "@/lib/permisos"
import { prisma } from "@/lib/prisma"
import { vocabularioDe } from "@/lib/vocabulario"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { RepartoDeProtesisConfig } from "../_componentes/reparto-de-protesis"
import { filaDelHistorial, frasesDelHistorialDelReparto } from "./_frases"
import { HistorialDeCambiosDelReparto } from "./_historial-de-cambios"

/**
 * Comisiones › Reparto de prótesis: sólo la dueña de una clínica dental. El
 * permiso se mira en el servidor (`puedeConfigurarRepartoDeProtesis`): fuera
 * de una clínica, a Comisiones; sin ser la dueña, al inicio. Los endpoints lo
 * vuelven a mirar.
 *
 * Debajo del reparto, el "Historial de cambios" (docs/PRODUCTO.md §3.11): los
 * últimos 50 cambios del negocio de la sesión, con "Ver más cambios"
 * (`?hasta=`, hasta 500). Se lee acá, en el servidor, con el mismo permiso de
 * la página: no hay un endpoint que pueda leerlo sin él.
 */
export default async function PaginaRepartoDeProtesis({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actor = actorDeSesion(await sesionDelServidor())
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeConfigurarRepartoDeProtesis(actor)) redirect(puedeEditarComisiones(actor) ? "/dashboard/comisiones" : "/dashboard")

  const limite = limiteDeCambios((await searchParams).hasta)
  const [negocio, historial] = await Promise.all([
    prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } }),
    leerCambiosDeReparto(actor, limite),
  ])
  // Cada cambio se lee en la zona del negocio (como la ficha y la liquidación), no en la del servidor.
  const zona = zonaDelNegocio(negocio?.timezone)
  const palabras = vocabularioDe(actor.rubro).palabras
  const filas = historial.cambios.map((cambio) => filaDelHistorial(cambio, zona, palabras))
  const alTope = limite >= CAMBIOS_MAXIMOS

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Reparto de prótesis"
        subtitulo="Cuánto recibe cada parte según el material. Aplica a las prótesis nuevas; las creadas antes mantienen su regla."
        mostrarBusqueda={false}
      />

      <div className="max-w-5xl space-y-5 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <Link
          href="/dashboard/comisiones"
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] text-sm font-medium text-navy underline-offset-4 anillo-foco hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Comisiones
        </Link>
        <RepartoDeProtesisConfig />
        <HistorialDeCambiosDelReparto
          filas={filas}
          frases={frasesDelHistorialDelReparto(palabras)}
          hrefDeVerMas={historial.hayMas && !alTope ? `/dashboard/comisiones/protesis?hasta=${Math.min(limite + CAMBIOS_POR_PAGINA, CAMBIOS_MAXIMOS)}` : null}
          topeAlcanzado={historial.hayMas && alTope ? CAMBIOS_MAXIMOS : null}
        />
      </div>
    </div>
  )
}
