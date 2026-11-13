"use client"

import { UserRound } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { usePrecios } from "@/components/panel/contexto-precios"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDeEquipo } from "../_frases"

interface PropsDePlanSinEquipo {
  /** Si quien mira puede cambiar de plan (`puedeCambiarDePlan`): la pantalla lo pregunta, esta pieza no compara roles. */
  puedeCambiarDePlan: boolean
}

/**
 * Lo que se ve en Equipo cuando el plan del negocio es Independiente: atiende
 * sólo la dueña y no invita a nadie. Explica por qué no hay botón de invitar y
 * lleva al plan, en Configuración, donde la dueña lo cambia.
 */
export function PlanSinEquipo({ puedeCambiarDePlan }: PropsDePlanSinEquipo) {
  const { abrirPrecios } = usePrecios()
  const { sinEquipoPorElPlan } = frasesDeEquipo(vocabularioDe(useRubroDelPanel()).palabras)

  return (
    <section aria-labelledby="plan-sin-equipo" className={cn(TARJETA_DEL_PANEL, "flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6")}>
      <CuadroDeIcono icono={UserRound} color="azul" activo />
      <div className="min-w-0 flex-1">
        <h2 id="plan-sin-equipo" className="font-medium text-navy">
          {sinEquipoPorElPlan.titulo}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-pretty text-texto-2">{sinEquipoPorElPlan.descripcion}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {puedeCambiarDePlan && (
            <Boton href="/dashboard/configuracion#plan" tamano="sm">
              {sinEquipoPorElPlan.verMiPlan}
            </Boton>
          )}
          <Boton variante="secundario" tamano="sm" onClick={abrirPrecios}>
            {sinEquipoPorElPlan.verPrecios}
          </Boton>
        </div>
      </div>
    </section>
  )
}
