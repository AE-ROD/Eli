import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { SeccionHorario } from "./_componentes/seccion-horario"
import { SeccionServicios } from "./_componentes/seccion-servicios"
import { SelectorHorarioMiembro } from "./_componentes/selector-horario-miembro"
import { SeccionPlazoDeCambios } from "./_componentes/seccion-plazo-de-cambios"
import {
  actorDeSesion,
  esDueño,
  gestionaElNegocio,
  puedeEditarHorarioDe,
  puedeEditarPlazoDeCambios,
  puedeGestionarServicios,
} from "@/lib/permisos"

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

  const miembrosParaElSelector = miembros.map((m: (typeof miembros)[number]) => ({
    id: m.id,
    nombre: m.user.name,
    email: m.user.email,
    role: m.role,
  }))

  const tieneEquipo = miembrosParaElSelector.length > 0
  const nombreActor = session?.user?.name ?? "Yo"

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Configuración"
        subtitulo={gestionaElNegocio(actor) ? "Gestiona horarios, servicios y equipo" : "Gestiona tu horario de atención"}
      />

      <div className="max-w-3xl space-y-6 px-4 pt-6 pb-10 sm:px-6">
        {/*
          Horario: quien gestiona el negocio y tiene equipo → selector de tabs; el resto → directo.
          Los `id` son a dónde llevan los pasos de la lista de inicio del panel.
        */}
        <div id="horario" className="scroll-mt-24">
          {puedeEditarHorarioDeOtros && tieneEquipo ? (
            <SelectorHorarioMiembro
              horariosDelDueño={horariosActuales}
              miembros={miembrosParaElSelector}
              nombreDelDueño={nombreActor}
            />
          ) : (
            <SeccionHorario
              horariosIniciales={horariosActuales}
              memberId={memberIdPropio}
              titulo={esDueño(actor) ? "Mi horario" : "Mi horario de atención"}
            />
          )}
        </div>

        {/* Servicios: dueño y encargado, no el profesional */}
        {puedeGestionarServicios(actor) && (
          <div id="servicios" className="scroll-mt-24">
            <SeccionServicios serviciosIniciales={servicios} />
          </div>
        )}

        {/* Plazo del enlace para cancelar o reagendar: dueño y encargado */}
        {puedeEditarPlazoDeCambios(actor) && (
          <SeccionPlazoDeCambios
            horasIniciales={
              (
                await prisma.business.findUnique({
                  where: { id: actor.businessId },
                  select: { cancelacionHorasAntes: true },
                })
              )?.cancelacionHorasAntes ?? 24
            }
          />
        )}
      </div>
    </div>
  )
}
