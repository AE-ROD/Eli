import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BarraLateral } from "@/components/eli/app/barra-lateral"
import { ModalBienvenida } from "@/components/eli/app/modal-bienvenida"

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

  return (
    <div className="min-h-screen bg-background">
      <BarraLateral usuario={usuario} esOwner={esOwner} />
      <main className="lg:ml-[260px] transition-all duration-300">
        {children}
      </main>
      {businessName && businessSlug && (
        <ModalBienvenida nombreNegocio={businessName} slug={businessSlug} />
      )}
    </div>
  )
}
