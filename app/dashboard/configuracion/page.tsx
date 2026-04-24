import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { SeccionHorario } from "./_components/seccionHorario"
import { SeccionServicios } from "./_components/seccionServicios"

export default async function PaginaConfiguracion() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) redirect("/iniciar-sesion")

  const [horarios, servicios] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.service.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Configuración"
        subtitulo="Gestiona tu horario y servicios"
      />

      <div className="p-6 space-y-6 max-w-3xl">
        <SeccionHorario horariosIniciales={horarios} />
        <SeccionServicios serviciosIniciales={servicios} />
      </div>
    </div>
  )
}
