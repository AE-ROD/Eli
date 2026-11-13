import { sesionDelServidor } from "@/lib/sesion-del-servidor"
import { prisma } from "@/lib/prisma"
import { BarraLateral } from "@/components/panel/barra-lateral"
import { ContenidoDelPanel } from "@/components/panel/contenido-del-panel"
import { ModalBienvenida } from "@/components/panel/modal-bienvenida"
import { ProveedorDePrecios } from "@/components/panel/contexto-precios"
import { ProveedorDeSesionDelPanel } from "@/components/panel/proveedor-de-sesion-del-panel"
import { ProveedorDeBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { ProveedorDeLaCuenta } from "@/components/panel/contexto-de-la-cuenta"
import { ProveedorDeRubro } from "@/components/panel/contexto-rubro"
import { nombreDelRolDelContexto } from "@/lib/contextos"
import { leerFotoDeLaCuenta } from "@/lib/foto-de-la-cuenta"
import {
  actorDeSesion,
  puedeEditarComisiones,
  puedeGestionarEquipo,
  puedeGestionarSuscripcion,
  puedeVerCierresDeCaja,
  puedeVerLiquidacionesDelEquipo,
  veLaListaDeInicio,
  veMiPlata,
} from "@/lib/permisos"

export default async function LayoutDelPanel({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await sesionDelServidor()
  const actor = actorDeSesion(session)

  // Una cuenta en varios negocios (o dueña y profesional en el suyo) trabaja
  // con uno a la vez: la barra dice con qué rol y en cuál, y ofrece cambiar.
  // El rol va primero: con el botón de cambiar al lado el texto se corta, y
  // lo que no se puede perder de vista es el rol (el negocio entero va en el
  // globo del cursor).
  const puedeCambiarDeNegocio = (session?.user?.contextos ?? 0) > 1
  const negocioEnLaBarra =
    puedeCambiarDeNegocio && actor && session?.user?.businessName
      ? `${nombreDelRolDelContexto({ rol: actor.rol, rubro: actor.rubro ?? null })} · ${session.user.businessName}`
      : (session?.user?.businessName ?? "")

  // La foto de la CUENTA (la persona, no la del integrante que ve el cliente).
  // No viaja en el token: se lee acá, de la base, con la cuenta de la sesión, y
  // baja por props. Sin foto o con una que no es de esta cuenta: `null`, y el
  // avatar muestra las iniciales.
  const fotoDeLaCuenta = await leerFotoDeLaCuenta(session?.user?.id)

  const usuario = session?.user
    ? {
        nombre: session.user.name ?? "",
        email: session.user.email ?? "",
        imagenUrl: fotoDeLaCuenta ?? undefined,
        negocio: negocioEnLaBarra,
      }
    : undefined

  const businessName = session?.user?.businessName ?? ""
  const businessSlug = session?.user?.businessSlug ?? ""
  const businessId = session?.user?.businessId ?? ""
  // El rubro elige las palabras del panel (`lib/vocabulario.ts`): en una
  // clínica dental, "Pacientes" y "Sala de espera". Llega a la barra lateral
  // y, por contexto, a cada página, desde la primera pintura.
  const rubro = actor?.rubro ?? null
  const puedeVerEquipo = puedeGestionarEquipo(actor)
  const verSuscripcion = puedeGestionarSuscripcion(actor)
  const accesoALaPlata = {
    miPlata: veMiPlata(actor),
    caja: puedeVerCierresDeCaja(actor),
    liquidaciones: puedeVerLiquidacionesDelEquipo(actor),
    comisiones: puedeEditarComisiones(actor),
  }

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

  // La sesión que ya leyó el servidor llega al `useSession()` del panel en
  // cuanto la página se hidrata (sin esperar a `/api/auth/session`). Va por
  // fuera de todo lo demás: la barra, el modal y las pantallas la leen.
  return (
    <ProveedorDeSesionDelPanel session={session}>
      <ProveedorDePrecios diasTrialRestantes={diasTrialRestantes}>
        <ProveedorDeRubro rubro={rubro}>
          <ProveedorDeBarraLateral>
            <ProveedorDeLaCuenta nombre={usuario?.nombre ?? ""} fotoUrl={fotoDeLaCuenta}>
              <div className="min-h-dvh bg-crema text-navy">
                <BarraLateral
                  usuario={usuario}
                  puedeGestionarSuscripcion={verSuscripcion}
                  diasTrialRestantes={diasTrialRestantes}
                  puedeVerEquipo={puedeVerEquipo}
                  accesoALaPlata={accesoALaPlata}
                  rubro={rubro}
                  puedeCambiarDeNegocio={puedeCambiarDeNegocio}
                  contexto={session?.user?.contexto ?? null}
                />
                <ContenidoDelPanel>{children}</ContenidoDelPanel>
                {businessName && businessSlug && (
                  <ModalBienvenida
                    nombreNegocio={businessName}
                    slug={businessSlug}
                    marcarAlCopiar={veLaListaDeInicio(actor)}
                  />
                )}
              </div>
            </ProveedorDeLaCuenta>
          </ProveedorDeBarraLateral>
        </ProveedorDeRubro>
      </ProveedorDePrecios>
    </ProveedorDeSesionDelPanel>
  )
}
