import { redirect } from "next/navigation"
import { sesionDelServidor } from "@/lib/sesion-del-servidor"
import { actorDeSesion, puedeConfigurarSecretaria, puedeUsarSecretaria } from "@/lib/permisos"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { leerLaSecretaria } from "./_lecturas"
import { Simulador } from "./_componentes/simulador"
import { SeccionAjustes } from "./_componentes/seccion-ajustes"
import { SeccionConsumo } from "./_componentes/seccion-consumo"
import { SeccionDerivadas } from "./_componentes/seccion-derivadas"
import { SeccionWhatsapp } from "./_componentes/seccion-whatsapp"

/**
 * Secretaria Eli: el agente que atiende el WhatsApp del negocio. Dueño y
 * encargado la ven, la prueban en el simulador y devuelven a Eli las
 * conversaciones derivadas. Encenderla y el número de WhatsApp son sólo del
 * dueño; el presupuesto lo define Eli por plan y aquí sólo se ve el % usado. El permiso se mira en el servidor: sin él, de vuelta al
 * inicio. Los endpoints lo vuelven a mirar (404).
 */
export default async function PaginaSecretaria() {
  const actor = actorDeSesion(await sesionDelServidor())
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeUsarSecretaria(actor)) redirect("/dashboard")

  const { zona, ajustes, canal, consumo, derivadas, avisos } = await leerLaSecretaria(actor)
  const esDueño = puedeConfigurarSecretaria(actor)

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Secretaria Eli"
        subtitulo="Responde el WhatsApp de tu negocio, agenda horas y te pasa las conversaciones que necesitan a una persona."
        mostrarBusqueda={false}
      />

      <div className="max-w-5xl space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <Simulador activa={ajustes.activa} />
          <div className="space-y-6">
            <SeccionConsumo activa={ajustes.activa} consumo={consumo} avisos={avisos} zona={zona} />
            <SeccionDerivadas derivadas={derivadas} zona={zona} />
          </div>
        </div>
        <SeccionAjustes inicial={ajustes} editable={esDueño} />
        {esDueño && <SeccionWhatsapp inicial={canal} />}
      </div>
    </div>
  )
}
