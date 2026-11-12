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
import { SeccionHoraValle } from "./_componentes/seccion-hora-valle"
import { SeccionMensajesAClientes } from "./_componentes/seccion-mensajes-a-clientes"
import { SeccionFilaVirtual } from "./_componentes/seccion-fila-virtual"
import { GruposDeConfiguracion, type SeccionDeConfiguracion } from "./_componentes/grupos-de-configuracion"
import { SeccionSillones } from "./_componentes/seccion-sillones"
import { SeccionLaboratorios } from "./_componentes/seccion-laboratorios"
import { SeccionMiFoto } from "./_componentes/seccion-mi-foto"
import { leerLaboratorios } from "@/lib/protesis-servidor"
import { contarEnviosDelMes } from "@/lib/envios-a-clientes"
import {
  apareceEnLaPagina,
  colorDelNegocio,
  esEnlaceDeResenasValido,
  imagenPublica,
  normalizarInstagram,
} from "@/lib/pagina-del-negocio"
import {
  actorDeSesion,
  esDueño,
  gestionaElNegocio,
  puedeActivarFilaVirtual,
  puedeActivarMensajesAClientes,
  puedeConfigurarHoraValle,
  puedeConfigurarPorConfirmar,
  puedeEditarFotoDelMiembro,
  puedeEditarFotosDelNegocio,
  puedeEditarHorarioDe,
  puedeEditarPaginaDelNegocio,
  puedeEditarPlazoDeCambios,
  puedeFijarComisionDeProducto,
  puedeGestionarLaboratorios,
  puedeGestionarProductos,
  puedeGestionarServicios,
  puedeGestionarSillones,
  puedeVerMensajesAClientes,
  whereDeProductos,
  whereDeSillones,
} from "@/lib/permisos"
import { formatearProducto } from "@/lib/productos"
import { ORDEN_DE_SILLONES, SELECCION_DE_SILLON } from "@/lib/sillones"
import { mostrarTelefono } from "@/lib/telefono"

export default async function PaginaConfiguracion() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) redirect("/iniciar-sesion")

  // Horario propio: el dueño no es miembro del equipo (clave null → horario
  // general del negocio); encargado y profesional tienen su propio memberId.
  const memberIdPropio = actor.memberId
  // Quien edita el horario de otros (dueño y encargado) abre en el horario
  // general del negocio (§5: el encargado lleva los horarios); el propio del
  // encargado está en su pestaña. El profesional, en el suyo.
  const editaElGeneral = puedeEditarHorarioDe(actor, null)
  const horarioInicial = editaElGeneral ? null : memberIdPropio

  // El % de cada producto sólo se le pide a la base para la dueña.
  const conPorcentaje = puedeFijarComisionDeProducto(actor)

  // Clínica dental: los sillones los gestionan dueña y encargado, como los
  // servicios; el odontólogo no ve la sección. En otro rubro, ni se piden.
  const gestionaSillones = puedeGestionarSillones(actor)
  // Los laboratorios de las prótesis: sólo la dueña de una clínica dental.
  const gestionaLaboratorios = puedeGestionarLaboratorios(actor)

  // "Mi foto": quien tiene una membresía en el negocio y puede cambiar la suya.
  // La dueña no es del equipo (sin `memberId`), así que no la tiene. El `where`
  // lleva el negocio de la sesión, como toda consulta.
  const membresiaConFotoPropia =
    actor.memberId && puedeEditarFotoDelMiembro(actor, { id: actor.memberId }) ? actor.memberId : null

  const [horariosActuales, horarioDelNegocio, servicios, productos, pagina, sillones, laboratorios, miMembresia] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { businessId: actor.businessId, memberId: horarioInicial },
      orderBy: { dayOfWeek: "asc" },
    }),
    // Para quien ve sólo el suyo: si no tiene horario propio, atiende en el
    // del negocio, y eso es lo que se le muestra (no un ejemplo inventado).
    horarioInicial
      ? prisma.workSchedule.findMany({
          where: { businessId: actor.businessId, memberId: null },
          orderBy: { dayOfWeek: "asc" },
        })
      : Promise.resolve(undefined),
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
        logoUrl: true,
        coverUrl: true,
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
    gestionaSillones
      ? prisma.sillon.findMany({
          where: whereDeSillones(actor),
          select: SELECCION_DE_SILLON,
          orderBy: ORDEN_DE_SILLONES,
          take: 100,
        })
      : Promise.resolve([]),
    gestionaLaboratorios ? leerLaboratorios(actor) : Promise.resolve([]),
    membresiaConFotoPropia
      ? prisma.businessMember.findFirst({
          where: { id: membresiaConFotoPropia, businessId: actor.businessId },
          select: { id: true, role: true, fotoUrl: true },
        })
      : Promise.resolve(null),
  ])

  // Dueño y encargado editan el horario de cualquier miembro: cargan el
  // equipo para el selector de tabs. El profesional sólo ve el propio.
  const puedeEditarHorarioDeOtros = editaElGeneral

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

  // Las secciones que este rol y este rubro ven, en el orden de siempre; la
  // agrupación (qué va en qué grupo) y el plegado los resuelve `GruposDeConfiguracion`.
  // Cada `id` es el ancla (`/dashboard/configuracion#horario`): los pasos de la
  // lista de inicio del panel y la agenda llevan a algunas.
  const secciones: SeccionDeConfiguracion[] = [
    {
      // Horario: quien gestiona el negocio y tiene equipo → selector de tabs; el resto → directo.
      id: "horario",
      contenido:
        puedeEditarHorarioDeOtros && tieneEquipo ? (
          <SelectorHorarioMiembro
            horariosDelDueño={horariosActuales}
            miembros={miembrosParaElSelector}
            // El encargado ve el general con el nombre del negocio; la dueña, con el suyo.
            nombreDelDueño={esDueño(actor) ? nombreActor : (pagina?.name ?? "El negocio")}
            sufijoDelGeneral={esDueño(actor) ? "(tú)" : "Horario general"}
            // El encargado se ve también en su propia pestaña: con "(tú)", para que no parezca repetido.
            memberIdPropio={esDueño(actor) ? null : memberIdPropio}
          />
        ) : (
          <SeccionHorario
            horariosIniciales={horariosActuales}
            memberId={horarioInicial}
            horarioDelNegocio={horarioDelNegocio}
            titulo={esDueño(actor) ? "Mi horario" : "Mi horario de atención"}
          />
        ),
    },
  ]

  // Mi foto: cada integrante sube la suya (el profesional no ve Equipo).
  if (miMembresia) {
    secciones.push({
      id: "mi-foto",
      contenido: (
        <SeccionMiFoto
          miembroId={miMembresia.id}
          nombre={nombreActor}
          fotoInicial={imagenPublica(miMembresia.fotoUrl)}
          apareceEnLaPagina={apareceEnLaPagina(miMembresia.role)}
        />
      ),
    })
  }

  if (pagina) {
    secciones.push({
      id: "pagina",
      contenido: (
        <SeccionPaginaPublica
          slug={pagina.slug}
          nombreDelNegocio={pagina.name}
          soloLectura={!puedeEditarPaginaDelNegocio(actor)}
          puedeEditarFotos={puedeEditarFotosDelNegocio(actor)}
          fotosIniciales={{ logo: imagenPublica(pagina.logoUrl), portada: imagenPublica(pagina.coverUrl) }}
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
      ),
    })
  }

  // Servicios: dueño y encargado, no el profesional
  if (puedeGestionarServicios(actor)) {
    secciones.push({ id: "servicios", contenido: <SeccionServicios serviciosIniciales={servicios} /> })
  }

  // Sillones: sólo en una clínica dental, para dueña y encargado
  if (gestionaSillones) {
    secciones.push({ id: "sillones", contenido: <SeccionSillones sillonesIniciales={sillones} /> })
  }

  // Laboratorios: sólo en una clínica dental, para la dueña
  if (gestionaLaboratorios) {
    secciones.push({ id: "laboratorios", contenido: <SeccionLaboratorios laboratoriosIniciales={laboratorios} /> })
  }

  // Productos (#67): dueña y encargado; el % de comisión, sólo la dueña
  if (puedeGestionarProductos(actor)) {
    secciones.push({
      id: "productos",
      contenido: (
        <SeccionProductos
          productosIniciales={productos.map((producto) => formatearProducto(producto, conPorcentaje))}
          conPorcentaje={conPorcentaje}
        />
      ),
    })
  }

  // Plazo del enlace para cancelar o reagendar: dueño y encargado
  if (puedeEditarPlazoDeCambios(actor)) {
    secciones.push({
      id: "plazo-de-cambios",
      contenido: <SeccionPlazoDeCambios horasIniciales={pagina?.cancelacionHorasAntes ?? 24} />,
    })
  }

  // Las tres siguientes son de servidor y leen lo suyo; se montan con el mismo permiso
  // que ellas se preguntan (y devuelven null sin negocio), para que su grupo no quede vacío.
  if (pagina && puedeConfigurarPorConfirmar(actor)) {
    secciones.push({ id: "por-confirmar", contenido: <SeccionPorConfirmar actor={actor} /> })
  }
  if (pagina && puedeConfigurarHoraValle(actor)) {
    secciones.push({ id: "hora-valle", contenido: <SeccionHoraValle actor={actor} /> })
  }

  if (pagina && mensajesDelMes) {
    secciones.push({
      id: "mensajes",
      contenido: (
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
      ),
    })
  }

  if (pagina && puedeActivarFilaVirtual(actor)) {
    secciones.push({ id: "fila-virtual", contenido: <SeccionFilaVirtual actor={actor} /> })
  }

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Configuración"
        subtitulo={gestionaElNegocio(actor) ? "Gestiona horarios, servicios y equipo" : "Gestiona tu horario de atención"}
      />

      <div className="max-w-3xl px-4 pt-6 pb-10 sm:px-6">
        <GruposDeConfiguracion secciones={secciones} />
      </div>
    </div>
  )
}
