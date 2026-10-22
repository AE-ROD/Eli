"use client"

import { AnimatePresence } from "framer-motion"
import { Sparkles, UserRound, Users, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { ColorDeModulo } from "@/lib/modulos"
import {
  DIAS_DE_PRUEBA,
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "@/lib/precios"
import { cn } from "@/lib/utils"

/*
 * Los mismos dos planes y los mismos textos que la sección de precios de la
 * landing (`components/landing/seccion-precios.tsx`), en corto. Los montos
 * salen de `lib/precios.ts`. Todavía no hay cobro: no hay botón para elegir
 * un plan, sólo el aviso de que llega.
 */

const ROLES = [
  { rol: "Dueño", texto: "Ve todo el negocio. El plan y el pago son solo tuyos." },
  { rol: "Encargado", texto: "Organiza la agenda, los servicios y el equipo. No cuenta como persona que atiende." },
  { rol: "Profesional", texto: "Ve su agenda, sus citas y lo que lleva cobrado. Siempre cuenta." },
] as const

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
  children: ReactNode
}) {
  return (
    <li className={cn("flex flex-col rounded-panel p-5 squircle", fondo)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <CuadroDeIcono icono={icono} color={color} activo />
        <Insignia className="bg-tarjeta">{insignia}</Insignia>
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

  return (
    <AnimatePresence>
      {abierto && (
        <MarcoDeModal
          titulo="Dos planes. Las mismas funciones."
          descripcion="Lo único que cambia es cuántas personas atienden. En pesos chilenos, con IVA incluido."
          ancho="xl"
          alCerrar={onCerrar}
        >
          {/* Lo que queda de la prueba */}
          {diasTrialRestantes !== undefined && (
            <p className="mb-6 flex items-start gap-2.5 rounded-campo bg-superficie px-4 py-3 text-sm font-medium squircle">
              <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
              {diasTrialRestantes > 0
                ? `Tu prueba gratuita vence en ${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""}`
                : "Tu prueba gratuita ha terminado — elige un plan para continuar"}
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
            >
              <p>Tu agenda, tu página de reservas, el tablero del día y los reportes. Todo Eli, para ti.</p>
              <p className="mt-3">
                ¿Sumas a alguien? Te pasas a Equipo y tu agenda, tus clientes y tu historial siguen ahí.
              </p>
            </Plan>
            <Plan
              id="modal-plan-equipo"
              icono={Users}
              color="turquesa"
              insignia="Para el negocio con equipo"
              nombre="Equipo"
              precio={PRECIO_EQUIPO}
              nota={`IVA incluido · ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden · +${adicional}/mes por cada persona más`}
              fondo="bg-turquesa-suave"
            >
              <p>Tú, tu encargado y tus profesionales, cada uno con su rol.</p>
              <dl className="mt-3 flex flex-col gap-1.5">
                {ROLES.map(({ rol, texto }) => (
                  <div key={rol}>
                    <dt className="inline font-semibold">{rol}: </dt>
                    <dd className="inline">{texto}</dd>
                  </div>
                ))}
              </dl>
            </Plan>
          </ul>

          <p className="mt-5 text-center text-[13px] text-texto-2">
            Los dos planes traen todo Eli, sin funciones bloqueadas. Los cambios en tu equipo se cobran desde el mes
            siguiente, sin cobros a medio mes.
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
