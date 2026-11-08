import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { Smile } from "lucide-react"
import { actorDeSesion, puedeConfigurarRepartoDeProtesis, puedeEditarComisiones } from "@/lib/permisos"
import { Boton } from "@/components/comunes/boton"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { PantallaDeComisiones } from "./_componentes/pantalla-de-comisiones"

/**
 * Comisiones (#64, #35): sólo la dueña. El permiso se mira en el servidor:
 * sin él, de vuelta al inicio. Los endpoints lo vuelven a mirar (401).
 */
export default async function PaginaComisiones() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeEditarComisiones(actor)) redirect("/dashboard")

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Comisiones" subtitulo="El porcentaje de cada profesional, por servicio y por producto." mostrarBusqueda={false} />

      <div className="max-w-5xl space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        {/* Sólo en una clínica dental: las prótesis se reparten en tres partes, aparte de la comisión. */}
        {puedeConfigurarRepartoDeProtesis(actor) && (
          <section aria-labelledby="reparto-de-protesis" className={`${TARJETA_DEL_PANEL} p-5 sm:p-6`}>
            <EncabezadoDeTarjeta
              id="reparto-de-protesis"
              titulo="Reparto de prótesis"
              subtitulo="Las prótesis se reparten en tres partes (la tratante, la clínica y el laboratorio) según el material. El resto de las prestaciones sigue con el % de comisión de cada profesional, aquí abajo."
              icono={{ figura: Smile }}
              accion={
                <Boton href="/dashboard/comisiones/protesis" variante="secundario" tamano="sm">
                  Configurar el reparto
                </Boton>
              }
            />
          </section>
        )}
        <PantallaDeComisiones />
      </div>
    </div>
  )
}
