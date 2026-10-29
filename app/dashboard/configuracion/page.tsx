import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { SeccionHorario } from "./_componentes/seccion-horario"
import { SeccionPaginaPublica } from "./_componentes/seccion-pagina-publica"
import { SeccionServicios } from "./_componentes/seccion-servicios"
import { SeccionProductos } from "./_componentes/seccion-productos"
import { SelectorHorarioMiembro } from "./_componentes/selector-horario-miembro"
import { SeccionPlazoDeCambios } from "./_componentes/seccion-plazo-de-cambios"
import { SeccionPorConfirmar } from "./_componentes/seccion-por-confirmar"
import { SeccionMensajesAClientes } from "./_componentes/seccion-mensajes-a-clientes"
import { contarEnviosDelMes } from "@/lib/envios-a-clientes"
import { apareceEnLaPagina, colorDelNegocio, esEnlaceDeResenasValido, normalizarInstagram } from "@/lib/pagina-del-negocio"
import {
  actorDeSesion,
  esDueño,
  gestionaElNegocio,
  puedeActivarMensajesAClientes,
  puedeEditarHorarioDe,
  puedeEditarPaginaDelNegocio,
  puedeEditarPlazoDeCambios,
  puedeFijarComisionDeProducto,
  puedeGestionarProductos,
  puedeGestionarServicios,
  puedeVerMensajesAClientes,
  whereDeProductos,
} from "@/lib/permisos"
import { formatearProducto } from "@/lib/productos"
import { mostrarTelefono } from "@/lib/telefono"

export default async function PaginaConfiguracion() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) redirect("/iniciar-sesion")

  // Horario propio: el dueño no es miembro del equipo (clave null → horario
  // general del negocio); encargado y profesional tienen su propio memberId.
  const memberIdPropio = actor.memberId

  // El % de cada producto sólo se le pide a la base para la dueña.
  const conPorcentaje = puedeFijarComisionDeProducto(actor)

  const [horariosActuales, servicios, productos, pagina] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { businessId: actor.businessId, memberId: memberIdPropio },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.service.findMany({
      where: { businessId: actor.businessId },
      orderBy: { createdAt: "asc" },
    }),
    puedeGestionarProductos(actor)
      ? prisma.producto.findMany({
          where: whereDeProductos(actor),
          select: { id: true, name: true, priceCents: true, active: true, commissionPercent: conPorcentaje },
          orderBy: { createdAt: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    // La página pública: todo rol la ve; sólo dueño y encargado la editan.
    prisma.business.findUnique({
      where: { id: actor.businessId },
      select: {
        name: true,
        slug: true,
        address: true,
        comuna: true,
        whatsapp: true,
        instagram: true,
        enlaceResenas: true,
        color: true,
        mediosDePago: true,
        cancelacionHorasAntes: true,
        timezone: true,
        listaDeEsperaActiva: true,
        avisoDeVueltaActivo: true,
        pideResenas: true,
        members: {
          select: { id: true, role: true, especialidad: true, user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
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

  // Mensajes a clientes (#74-#78): dueña y encargado los ven; el profesional no.
  const mensajesDelMes =
    pagina && puedeVerMensajesAClientes(actor) ? await contarEnviosDelMes(actor.businessId, pagina.timezone) : null

  const tieneEquipo = miembrosParaElSelector.length > 0
  const usuarioDeInstagram = normalizarInstagram(pagina?.instagram)
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

        {pagina && (
          <div id="pagina" className="scroll-mt-24">
            <SeccionPaginaPublica
              slug={pagina.slug}
              nombreDelNegocio={pagina.name}
              soloLectura={!puedeEditarPaginaDelNegocio(actor)}
              inicial={{
                address: pagina.address ?? "",
                comuna: pagina.comuna ?? "",
                whatsapp: mostrarTelefono(pagina.whatsapp),
                instagram: usuarioDeInstagram ? `@${usuarioDeInstagram}` : "",
                enlaceResenas: pagina.enlaceResenas ?? "",
                color: colorDelNegocio(pagina.color).clave,
                mediosDePago: pagina.mediosDePago,
                // Sólo quienes aparecen en "Equipo" de la página pública.
                especialidades: pagina.members
                  .filter((miembro) => apareceEnLaPagina(miembro.role))
                  .map((miembro) => ({
                    memberId: miembro.id,
                    nombre: miembro.user.name,
                    especialidad: miembro.especialidad ?? "",
                  })),
              }}
            />
          </div>
        )}

        {/* Servicios: dueño y encargado, no el profesional */}
        {puedeGestionarServicios(actor) && (
          <div id="servicios" className="scroll-mt-24">
            <SeccionServicios serviciosIniciales={servicios} />
          </div>
        )}

        {/* Productos (#67): dueña y encargado; el % de comisión, sólo la dueña */}
        {puedeGestionarProductos(actor) && (
          <div id="productos" className="scroll-mt-24">
            <SeccionProductos
              productosIniciales={productos.map((producto) => formatearProducto(producto, conPorcentaje))}
              conPorcentaje={conPorcentaje}
            />
          </div>
        )}

        {/* Plazo del enlace para cancelar o reagendar: dueño y encargado */}
        {puedeEditarPlazoDeCambios(actor) && (
          <SeccionPlazoDeCambios horasIniciales={pagina?.cancelacionHorasAntes ?? 24} />
        )}
        <SeccionPorConfirmar actor={actor} />

        {pagina && mensajesDelMes && (
          <div id="mensajes" className="scroll-mt-24">
            <SeccionMensajesAClientes
              inicial={{
                interruptores: {
                  listaDeEsperaActiva: pagina.listaDeEsperaActiva,
                  avisoDeVueltaActivo: pagina.avisoDeVueltaActivo,
                  pideResenas: pagina.pideResenas,
                },
                tieneEnlaceDeResenas: esEnlaceDeResenasValido(pagina.enlaceResenas),
                puedeCambiar: puedeActivarMensajesAClientes(actor),
                mes: mensajesDelMes,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
