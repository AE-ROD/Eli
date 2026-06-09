import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { SeccionHorario } from "./_components/seccionHorario"
import { SeccionServicios } from "./_components/seccionServicios"
import { SelectorHorarioMiembro } from "./_components/selectorHorarioMiembro"
import { SeccionIdioma } from "./_components/SeccionIdioma"

export default async function PaginaConfiguracion() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.businessId) redirect("/iniciar-sesion")

  const esOwner = user.role === "owner"
  const memberId: string | null = user.memberId ?? null

  // Horarios del usuario actual (owner → memberId null, worker → su memberId)
  const [horariosActuales, servicios, business] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { businessId: user.businessId, memberId: esOwner ? null : memberId },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.service.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { preferredLocale: true },
    }),
  ])

  // Si es owner, también carga los miembros del equipo
  const miembros = esOwner
    ? await prisma.businessMember.findMany({
        where: { businessId: user.businessId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      })
    : []

  const miembrosFormateados = miembros.map((m) => ({
    id: m.id,
    nombre: m.user.name,
    email: m.user.email,
    role: m.role,
  }))

  const tieneEquipo = miembrosFormateados.length > 0

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Configuración"
        subtitulo={esOwner ? "Gestiona horarios, servicios y equipo" : "Gestiona tu horario de atención"}
      />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* Horario: owner con equipo → selector de tabs; owner solo / worker → directo */}
        {esOwner && tieneEquipo ? (
          <SelectorHorarioMiembro
            horariosOwner={horariosActuales}
            miembros={miembrosFormateados}
            nombreOwner={user.name ?? "Yo"}
          />
        ) : (
          <SeccionHorario
            horariosIniciales={horariosActuales}
            memberId={esOwner ? null : memberId}
            titulo={esOwner ? "Mi horario" : "Mi horario de atención"}
          />
        )}

        {/* Servicios: solo para owners */}
        {esOwner && <SeccionServicios serviciosIniciales={servicios} />}

        {/* Idioma de la página de reservas: solo para owners */}
        {esOwner && (
          <SeccionIdioma localeInicial={business?.preferredLocale ?? "es"} />
        )}
      </div>
    </div>
  )
}
