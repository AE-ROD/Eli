import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BarraLateral } from "@/components/eli/app/barra-lateral"

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

  return (
    <div className="min-h-screen bg-background">
      <BarraLateral usuario={usuario} />
      <main className="lg:ml-[260px] transition-all duration-300">
        {children}
      </main>
    </div>
  )
}
