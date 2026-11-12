"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { Check, Layers, Minus } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Boton } from "@/components/comunes/boton"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { descripcionDePlan, nombreDePlan, type PlanId } from "@/lib/planes"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { leerSedes } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { evaluarCambioDePlan, otroPlan, precioDelPlan, type CambioDePlan } from "../_plan"
import { ModalCambiarDePlan } from "./modal-cambiar-de-plan"

interface PropsDeSeccionPlan {
  /** El plan del negocio hoy (`Business.plan`). */
  plan: PlanId
  /** Las personas del equipo (sin la dueña) y las invitaciones vigentes que nadie aceptó: con alguna, no se puede pasar a Independiente. */
  integrantes: number
  invitacionesPendientes: number
}

/**
 * «Plan» (sólo la dueña: `page.tsx` la arma con `puedeCambiarDePlan`): el plan
 * de la cuenta con su precio, qué incluye y qué no, y «Cambiar a…» con las
 * consecuencias dichas antes de confirmar (`ModalCambiarDePlan`). Todavía no se
 * cobra y lo dice.
 *
 * A Independiente sólo se pasa sin equipo ni invitaciones pendientes: con
 * alguno, el botón no se ofrece y se explica por qué, con el camino a Equipo.
 * A Equipo, con sedes, se leen las sedes de ahora antes de abrir el modal,
 * para elegir cuál queda. Al cambiar se renueva la sesión (`update()`, que
 * `lib/auth.ts` rearma desde la base) y se vuelve a pedir la página, para que
 * el panel vea el plan nuevo: aparece o desaparece «Sedes y horarios», se puede
 * o no invitar.
 */
export function SeccionPlan({ plan: planInicial, integrantes, invitacionesPendientes }: PropsDeSeccionPlan) {
  const idDelTitulo = useId()
  const router = useRouter()
  const { update } = useSession()
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const { plan: frases } = frasesDeConfiguracion(palabras)
  const [plan, setPlan] = useState<PlanId>(planInicial)
  const [cambio, setCambio] = useState<CambioDePlan | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const [aviso, setAviso] = useState("")
  const [anuncio, setAnuncio] = useState("")

  const destino = otroPlan(plan)
  const precio = precioDelPlan(plan)
  const sinSedes = { actual: plan, integrantes, invitacionesPendientes, sedes: [] } as const
  // Sólo Equipo → Independiente se bloquea, y no depende de las sedes.
  const bloqueo = evaluarCambioDePlan(sinSedes).bloqueo

  const abrir = async () => {
    if (abriendo || bloqueo) return
    setAviso("")
    setAnuncio("")
    if (destino === "independiente") return setCambio(evaluarCambioDePlan(sinSedes))
    // A Equipo se mira antes qué sedes hay: se elige cuál queda. Se leen ahora, no las de cuando se cargó la página.
    setAbriendo(true)
    const sedes = await leerSedes(palabras)
    setAbriendo(false)
    if (!sedes.ok) return setAviso(sedes.error)
    setCambio(evaluarCambioDePlan({ ...sinSedes, sedes: sedes.datos.sedes }))
  }

  const alCambiar = async (nuevo: PlanId) => {
    // El plan ya quedó guardado: si la sesión no se puede renovar ahora, el panel lo toma en su próxima revisión.
    try {
      await update()
    } catch {
      // Sin red a esta altura: nada que deshacer.
    }
    setPlan(nuevo)
    setCambio(null)
    setAnuncio(frases.cambiar.anuncio(nombreDePlan(nuevo)))
    router.refresh()
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta id={idDelTitulo} nivel={3} titulo={frases.titulo} subtitulo={frases.subtitulo} icono={{ figura: Layers }} />

      <div className="mt-5 rounded-campo bg-superficie p-4 squircle sm:p-5">
        <p className="text-[13px] text-texto-2">{frases.actual}</p>
        <p className="mt-0.5 font-serif text-2xl font-medium text-navy">{nombreDePlan(plan)}</p>
        <p className="text-sm text-texto-2">{descripcionDePlan(plan)}</p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-2xl font-medium tabular-nums">{precio.texto}</span>
          <span className="text-[13px] text-texto-2">{precio.nota}</span>
        </p>
      </div>

      <ul className="mt-5 space-y-2">
        {frases.incluye(plan).map((linea) => {
          const Icono = linea.incluido ? Check : Minus
          return (
            <li key={linea.texto} className="flex items-start gap-2.5 text-sm">
              <Icono aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", !linea.incluido && "text-texto-2")} strokeWidth={2} />
              <span className={cn("text-pretty", !linea.incluido && "text-texto-2")}>
                <span className="sr-only">{linea.incluido ? frases.incluyeEtiqueta : frases.noIncluyeEtiqueta}: </span>
                {linea.texto}
              </span>
            </li>
          )
        })}
      </ul>

      <Aviso tono="info" className="mt-5">
        {frases.cobro}
      </Aviso>

      <div className="mt-6 border-t border-borde pt-5">
        <p className="text-sm text-pretty text-texto-2">{frases.cambiar.resumen(destino)}</p>

        {bloqueo && (
          <Aviso
            tono="atencion"
            titulo={frases.bloqueo.titulo}
            className="mt-4"
            accion={
              <Boton href="/dashboard/equipo" variante="secundario" tamano="sm">
                {frases.bloqueo.irAEquipo}
              </Boton>
            }
          >
            {frases.bloqueo.detalle(bloqueo.integrantes, bloqueo.invitaciones)}
          </Aviso>
        )}
        {aviso && <Aviso className="mt-4">{aviso}</Aviso>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BotonPrimario type="button" tamaño="sm" variante="secundario" cargando={abriendo} disabled={bloqueo !== null} onClick={abrir}>
            {frases.cambiar.boton(nombreDePlan(destino))}
          </BotonPrimario>
          {abriendo && <span className="text-sm text-texto-2">{frases.cambiar.abriendo}</span>}
        </div>
      </div>

      <p role="status" className="sr-only">
        {abriendo ? frases.cambiar.abriendo : anuncio}
      </p>

      <AnimatePresence>
        {cambio && <ModalCambiarDePlan cambio={cambio} alCambiar={alCambiar} alCerrar={() => setCambio(null)} />}
      </AnimatePresence>
    </section>
  )
}
