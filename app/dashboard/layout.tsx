import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BarraLateral } from "@/components/panel/barra-lateral"
import { ContenidoDelPanel } from "@/components/panel/contenido-del-panel"
import { ModalBienvenida } from "@/components/panel/modal-bienvenida"
import { ProveedorDePrecios } from "@/components/panel/contexto-precios"
import { ProveedorDeBarraLateral } from "@/components/panel/contexto-barra-lateral"
import {
  actorDeSesion,
  puedeEditarComisiones,
  puedeGestionarEquipo,
  puedeGestionarSuscripcion,
  puedeVerCierresDeCaja,
  puedeVerLiquidacionesDelEquipo,
  veLaListaDeInicio,
  veMiPlata,
} from "@/lib/permisos"

export default async function LayoutDelPanel({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  const usuario = session?.user
    ? {
        nombre: session.user.name ?? "",
        email: session.user.email ?? "",
        negocio: session.user.businessName ?? "",
      }
    : undefined

  const businessName = session?.user?.businessName ?? ""
  const businessSlug = session?.user?.businessSlug ?? ""
  const businessId = session?.user?.businessId ?? ""
  const actor = actorDeSesion(session)
  const puedeVerEquipo = puedeGestionarEquipo(actor)
  const verSuscripcion = puedeGestionarSuscripcion(actor)
  const accesoALaPlata = {
    miPlata: veMiPlata(actor),
    caja: puedeVerCierresDeCaja(actor),
    liquidaciones: puedeVerLiquidacionesDelEquipo(actor),
    comisiones: puedeEditarComisiones(actor),
  }

  // Calcular días de prueba restantes (sólo para quien paga el plan)
  let diasTrialRestantes: number | undefined
  if (verSuscripcion && businessId) {
    const negocio = await prisma.business.findUnique({
      where: { id: businessId },
      select: { pruebaTerminaEl: true },
    })
    if (negocio) {
      // El fin está guardado (un referido lo corre); ya no se deriva de createdAt.
      const ahora = new Date()
      const diasDePruebaRestantes = Math.ceil((negocio.pruebaTerminaEl.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24))
      diasTrialRestantes = Math.max(0, diasDePruebaRestantes)
    }
  }

  return (
    <ProveedorDePrecios diasTrialRestantes={diasTrialRestantes}>
      <ProveedorDeBarraLateral>
        <div className="min-h-dvh bg-crema text-navy">
          <BarraLateral
            usuario={usuario}
            puedeGestionarSuscripcion={verSuscripcion}
            diasTrialRestantes={diasTrialRestantes}
            puedeVerEquipo={puedeVerEquipo}
            accesoALaPlata={accesoALaPlata}
          />
          <ContenidoDelPanel>{children}</ContenidoDelPanel>
          {businessName && businessSlug && (
            <ModalBienvenida
              nombreNegocio={businessName}
              slug={businessSlug}
              marcarAlCopiar={veLaListaDeInicio(actor)}
            />
          )}
        </div>
      </ProveedorDeBarraLateral>
    </ProveedorDePrecios>
  )
}
