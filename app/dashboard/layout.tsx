import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BarraLateral } from "@/components/eli/app/barra-lateral"
import { ModalBienvenida } from "@/components/eli/app/modal-bienvenida"
import { ProviderPrecios } from "@/components/eli/app/provider-precios"

export default async function DashboardLayout({
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

  const businessName = (session?.user as any)?.businessName ?? ""
  const businessSlug = (session?.user as any)?.businessSlug ?? ""
  const esOwner = (session?.user as any)?.role === "owner"
  const businessId = (session?.user as any)?.businessId ?? ""

  // Calcular días de trial restantes (solo para owners)
  let diasTrialRestantes: number | undefined
  if (esOwner && businessId) {
    const negocio = await prisma.business.findUnique({
      where: { id: businessId },
      select: { createdAt: true },
    })
    if (negocio) {
      const trialFin = new Date(negocio.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000)
      const ahora = new Date()
      const diff = Math.ceil((trialFin.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24))
      diasTrialRestantes = Math.max(0, diff)
    }
  }

  return (
    <ProviderPrecios diasTrialRestantes={diasTrialRestantes}>
      <div className="min-h-screen bg-background">
        <BarraLateral usuario={usuario} esOwner={esOwner} diasTrialRestantes={diasTrialRestantes} />
        <main className="lg:ml-[260px] transition-all duration-300">
          {children}
        </main>
        {businessName && businessSlug && (
          <ModalBienvenida nombreNegocio={businessName} slug={businessSlug} />
        )}
      </div>
    </ProviderPrecios>
  )
}
