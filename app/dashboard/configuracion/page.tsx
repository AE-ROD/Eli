import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { SeccionHorario } from "./_components/seccionHorario"
import { SeccionServicios } from "./_components/seccionServicios"
import { SelectorHorarioMiembro } from "./_components/selectorHorarioMiembro"
import { actorDeSesion, esDueño, gestionaElNegocio, puedeEditarHorarioDe, puedeGestionarServicios } from "@/lib/permisos"

export default async function PaginaConfiguracion() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) redirect("/iniciar-sesion")

  // Horario propio: el dueño no es miembro del equipo (clave null → horario
  // general del negocio); encargado y profesional tienen su propio memberId.
  const memberIdPropio = actor.memberId

  const [horariosActuales, servicios] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { businessId: actor.businessId, memberId: memberIdPropio },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.service.findMany({
      where: { businessId: actor.businessId },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // Dueño y encargado editan el horario de cualquier miembro: cargan el
  // equipo para el selector de tabs. El profesional sólo ve el propio.
  const puedeEditarHorarioDeOtros = puedeEditarHorarioDe(actor, null)

  const miembros = puedeEditarHorarioDeOtros
    ? await prisma.businessMember.findMany({
        where: { businessId: actor.businessId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      })
    : []

  const miembrosFormateados = miembros.map((m: (typeof miembros)[number]) => ({
    id: m.id,
    nombre: m.user.name,
    email: m.user.email,
    role: m.role,
  }))

  const tieneEquipo = miembrosFormateados.length > 0
  const nombreActor = session?.user?.name ?? "Yo"

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Configuración"
        subtitulo={gestionaElNegocio(actor) ? "Gestiona horarios, servicios y equipo" : "Gestiona tu horario de atención"}
      />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* Horario: quien gestiona el negocio y tiene equipo → selector de tabs; el resto → directo */}
        {puedeEditarHorarioDeOtros && tieneEquipo ? (
          <SelectorHorarioMiembro
            horariosOwner={horariosActuales}
            miembros={miembrosFormateados}
            nombreOwner={nombreActor}
          />
        ) : (
          <SeccionHorario
            horariosIniciales={horariosActuales}
            memberId={memberIdPropio}
            titulo={esDueño(actor) ? "Mi horario" : "Mi horario de atención"}
          />
        )}

        {/* Servicios: dueño y encargado, no el profesional */}
        {puedeGestionarServicios(actor) && <SeccionServicios serviciosIniciales={servicios} />}
      </div>
    </div>
  )
}
