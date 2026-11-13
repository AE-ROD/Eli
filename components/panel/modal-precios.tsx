"use client"

import { AnimatePresence } from "framer-motion"
import { useSession } from "next-auth/react"
import { Sparkles, UserRound, Users, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { frasesDelPanel } from "@/components/panel/frases-del-panel"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { ColorDeModulo } from "@/lib/modulos"
import { actorDeSesion } from "@/lib/permisos"
import { nombreDePlan, type PlanId } from "@/lib/planes"
import {
  DIAS_DE_PRUEBA,
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "@/lib/precios"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"

/*
 * Los mismos dos planes que la sección de precios de la landing
 * (`components/landing/seccion-precios.tsx`), en corto. La landing habla de
 * todos los rubros; el panel conoce el del negocio y escribe lo mismo con sus
 * palabras (`frasesDelPanel`: "tus pacientes", "las prestaciones", "tus
 * odontólogos"). Los montos salen de `lib/precios.ts`. Todavía no hay cobro:
 * no hay botón para elegir un plan, sólo el aviso de que llega.
 */

interface PropsDeModalPrecios {
  abierto: boolean
  onCerrar: () => void
  diasTrialRestantes?: number
}

/** Un plan en corto: ícono, insignia, nombre, precio y lo que lo distingue. */
function Plan({
  id,
  icono,
  color,
  insignia,
  nombre,
  precio,
  nota,
  fondo,
  esTuPlan,
  children,
}: {
  id: string
  icono: LucideIcon
  color: ColorDeModulo
  insignia: string
  nombre: string
  precio: number
  nota: string
  fondo: string
  /** Es el plan que tiene el negocio ahora: lleva una insignia más. */
  esTuPlan: boolean
  children: ReactNode
}) {
  return (
    <li className={cn("flex flex-col rounded-panel p-5 squircle", fondo)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <CuadroDeIcono icono={icono} color={color} activo />
        <Insignia className="bg-tarjeta">{insignia}</Insignia>
        {esTuPlan && <Insignia className="bg-navy text-white">Tu plan</Insignia>}
      </div>
      <h3 id={id} className="mt-4 font-serif text-[1.75rem] leading-[1.1] font-medium tracking-[-0.5px]">
        {nombre}
      </h3>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-[2.25rem] leading-none font-medium tracking-[-1px] tabular-nums">
          {formatearPesos(precio)}
        </span>
        <span>/mes</span>
      </p>
      {/* Navy y no gris: el texto secundario no llega al contraste AA sobre el azul suave. */}
      <p className="mt-1.5 text-[13px]">{nota}</p>
      <div className="mt-4 text-sm leading-snug">{children}</div>
    </li>
  )
}

export function ModalPrecios({ abierto, onCerrar, diasTrialRestantes }: PropsDeModalPrecios) {
  const adicional = formatearPesos(PRECIO_PERSONA_ADICIONAL)
  const { precios } = frasesDelPanel(vocabularioDe(useRubroDelPanel()).palabras)
  // El plan del negocio, de la sesión: sólo para marcarlo. Sin plan, no se marca ninguno.
  const { data: sesion } = useSession()
  const tuPlan: PlanId | null = actorDeSesion(sesion)?.plan ?? null

  return (
    <AnimatePresence>
      {abierto && (
        <MarcoDeModal
          titulo="Dos planes, según cómo trabajas"
          descripcion="Independiente es para atender solo, en uno o varios lugares. Equipo es para una clínica o un negocio con equipo. En pesos chilenos, con IVA incluido."
          ancho="xl"
          alCerrar={onCerrar}
        >
          {/*
            Lo que queda de la prueba. Terminada, no se pide elegir un plan: no
            hay cómo pagarlo todavía y nada se corta (PRODUCTO.md, secciones 4 y 10).
          */}
          {diasTrialRestantes !== undefined && (
            <p className="mb-6 flex items-start gap-2.5 rounded-campo bg-superficie px-4 py-3 text-sm font-medium squircle">
              <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
              {diasTrialRestantes > 0
                ? `Tu prueba gratuita vence en ${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""}`
                : "Tu prueba gratuita terminó. Todavía no cobramos: puedes seguir usando Eli como hasta ahora."}
            </p>
          )}

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Plan
              id="modal-plan-independiente"
              icono={UserRound}
              color="azul"
              insignia="Para quien atiende solo"
              nombre="Independiente"
              precio={PRECIO_INDEPENDIENTE}
              nota="IVA incluido"
              fondo="bg-azul-suave"
              esTuPlan={tuPlan === "independiente"}
            >
              <p>{precios.independiente}</p>
              <p className="mt-3">{precios.variasSedes}</p>
              <p className="mt-3">{precios.sumarAlguien}</p>
            </Plan>
            <Plan
              id="modal-plan-equipo"
              icono={Users}
              color="turquesa"
              insignia={precios.paraElNegocioConEquipo}
              nombre="Equipo"
              precio={PRECIO_EQUIPO}
              nota={`IVA incluido · ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden · +${adicional}/mes por cada persona más`}
              fondo="bg-turquesa-suave"
              esTuPlan={tuPlan === "equipo"}
            >
              <p>{precios.equipo}</p>
              <p className="mt-3">{precios.unaSede}</p>
              <dl className="mt-3 flex flex-col gap-1.5">
                {precios.roles.map(({ rol, texto }) => (
                  <div key={rol}>
                    <dt className="inline font-semibold">{rol}: </dt>
                    <dd className="inline">{texto}</dd>
                  </div>
                ))}
              </dl>
            </Plan>
          </ul>

          <p className="mt-5 text-center text-[13px] text-texto-2">
            Los dos planes traen la agenda, la página de reservas y los reportes completos. Los cambios en tu equipo se
            cobran desde el mes siguiente, sin cobros a medio mes.{tuPlan ? ` Hoy tu plan es ${nombreDePlan(tuPlan)}; lo cambias en Configuración.` : ""}
          </p>

          <Aviso tono="info" className="mt-5">
            Muy pronto vas a poder activar tu plan desde aquí. Mientras tanto, tu prueba de {DIAS_DE_PRUEBA} días es
            gratis y sin tarjeta.
          </Aviso>
        </MarcoDeModal>
      )}
    </AnimatePresence>
  )
}
