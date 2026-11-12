import { redirect } from "next/navigation"
import { sesionDelServidor } from "@/lib/sesion-del-servidor"
import { prisma } from "@/lib/prisma"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { FlaskConical, Smile } from "lucide-react"
import { actorDeSesion, puedeConfigurarRepartoDeProtesis, puedeEditarComisiones, puedePagarAlLaboratorio } from "@/lib/permisos"
import { Boton } from "@/components/comunes/boton"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { vocabularioDe } from "@/lib/vocabulario"
import { PantallaDeComisiones } from "./_componentes/pantalla-de-comisiones"
import { frasesDeLasComisiones } from "./_frases"

/**
 * Comisiones (#64, #35): sólo la dueña. El permiso se mira en el servidor:
 * sin él, de vuelta al inicio. Los endpoints lo vuelven a mirar (401).
 */
export default async function PaginaComisiones() {
  const actor = actorDeSesion(await sesionDelServidor())
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeEditarComisiones(actor)) redirect("/dashboard")
  // El historial muestra cuándo se cambió cada % en la zona del negocio, no en la del dispositivo.
  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  const zona = zonaDelNegocio(negocio?.timezone)
  // "El porcentaje de cada odontólogo, por prestación…" en una clínica dental; "Comisiones" no se renombra en ningún rubro.
  const frases = frasesDeLasComisiones(vocabularioDe(actor.rubro).palabras)

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Comisiones" subtitulo={frases.subtitulo} mostrarBusqueda={false} />

      <div className="max-w-5xl space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        {/* Sólo en una clínica dental: las prótesis se reparten en tres partes, aparte de la comisión. */}
        {puedeConfigurarRepartoDeProtesis(actor) && (
          <section aria-labelledby="reparto-de-protesis" className={`${TARJETA_DEL_PANEL} p-5 sm:p-6`}>
            <EncabezadoDeTarjeta
              id="reparto-de-protesis"
              titulo="Reparto de prótesis"
              subtitulo={frases.protesis.tarjeta}
              icono={{ figura: Smile }}
              accion={
                <Boton href="/dashboard/comisiones/protesis" variante="secundario" tamano="sm">
                  Configurar el reparto
                </Boton>
              }
            />
          </section>
        )}
        {/* Junto al reparto: lo que se le debe a cada laboratorio por las prótesis entregadas. */}
        {puedePagarAlLaboratorio(actor) && (
          <section aria-labelledby="por-pagar-al-laboratorio" className={`${TARJETA_DEL_PANEL} p-5 sm:p-6`}>
            <EncabezadoDeTarjeta
              id="por-pagar-al-laboratorio"
              titulo="Por pagar al laboratorio"
              subtitulo="La parte del laboratorio de los abonos de prótesis ya entregadas: cuánto se le debe a cada uno, marcar pagado y el historial de pagos."
              icono={{ figura: FlaskConical }}
              accion={
                <Boton href="/dashboard/comisiones/laboratorio" variante="secundario" tamano="sm">
                  Ver lo por pagar
                </Boton>
              }
            />
          </section>
        )}
        <PantallaDeComisiones zona={zona} />
      </div>
    </div>
  )
}
