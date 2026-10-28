import type { Metadata, Viewport } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BarraLateral } from "@/components/panel/barra-lateral"
import { ContenidoDelPanel } from "@/components/panel/contenido-del-panel"
import { ModalBienvenida } from "@/components/panel/modal-bienvenida"
import { ProveedorDePrecios } from "@/components/panel/contexto-precios"
import { ProveedorDeBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { AppInstalable } from "@/components/panel/app-instalable"
import { COLORES_DE_LA_APP } from "@/lib/pwa"
import { actorDeSesion, puedeGestionarEquipo, puedeGestionarSuscripcion, veLaListaDeInicio } from "@/lib/permisos"

/**
 * El panel se instala en el teléfono (issue #81). En iPhone, "Agregar a
 * inicio" lee estas etiquetas: el nombre bajo el ícono, abrir sin la barra de
 * Safari y la barra de estado con el texto oscuro sobre el crema del panel.
 * `icons` reemplaza entero al del layout raíz, por eso repite el favicon.
 */
export const metadata: Metadata = {
  appleWebApp: { capable: true, title: "Eli", statusBarStyle: "default" },
  icons: { icon: "/images/logo-eli.png", apple: "/iconos/apple-icon.png" },
  // Next 16 escribe `capable` como `mobile-web-app-capable`; las versiones de
  // iOS anteriores a leer el manifest sólo entienden la etiqueta con `apple-`.
  other: { "apple-mobile-web-app-capable": "yes" },
}

export const viewport: Viewport = {
  themeColor: COLORES_DE_LA_APP.fondo,
}

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
          />
          <ContenidoDelPanel>{children}</ContenidoDelPanel>
          {businessName && businessSlug && (
            <ModalBienvenida
              nombreNegocio={businessName}
              slug={businessSlug}
              marcarAlCopiar={veLaListaDeInicio(actor)}
            />
          )}
          <AppInstalable />
        </div>
      </ProveedorDeBarraLateral>
    </ProveedorDePrecios>
  )
}
