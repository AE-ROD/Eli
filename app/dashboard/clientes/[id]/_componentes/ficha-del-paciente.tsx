"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import type { PlanRespuesta } from "@/lib/edicion-del-plan"
import type { FichaClinicaRespuesta, OdontogramaRespuesta } from "@/lib/ficha-clinica"
import type { Rol } from "@/lib/permisos"
import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"
import { subtituloDelPaciente } from "../_formato"
import { ProveedorDeCambiosSinGuardar } from "./cambios-sin-guardar"
import { Pestanas, idDePanel, idDePestana, type Pestana } from "./pestanas"
import { PestanaAntecedentes } from "./pestana-antecedentes"
import { PestanaEvoluciones } from "./pestana-evoluciones"
import { PestanaOdontograma } from "./pestana-odontograma"
import { PestanaPlan } from "./pestana-plan"
import { PestanaProtesis } from "./pestana-protesis"
import { TarjetasDeResumen, type ProximaCita } from "./tarjetas-de-resumen"

export interface PacienteDeLaFicha {
  id: string
  nombre: string
  /** La cédula (en Chile, el RUT), tal como se guardó. */
  documento: string | null
  email: string | null
  /** E.164. */
  telefono: string | null
  /** Desde cuándo es paciente (ISO). */
  desde: string
}

/** Quién mira: para elegir quién hace una prestación y para el vocabulario. */
export interface UsuarioDeLaFicha {
  rol: Rol
  memberId: string | null
  nombre: string
  rubro: string | null
}

type IdDePestana = "odontograma" | "plan" | "protesis" | "evoluciones" | "antecedentes"

interface PropsDeFichaDelPaciente {
  paciente: PacienteDeLaFicha
  /** La alerta: la ven todos los roles de la clínica. */
  alergias: string | null
  /** `null` para quien no ve la ficha clínica (el encargado). */
  fichaInicial: FichaClinicaRespuesta | null
  odontogramaInicial: OdontogramaRespuesta | null
  planInicial: PlanRespuesta | null
  proximaCita: ProximaCita | null
  /** La zona horaria del negocio, y su día de hoy ("AAAA-MM-DD"). */
  zona: string
  hoy: string
  puedeEditarFicha: boolean
  /** La pestaña Prótesis: dueño y odontólogos (`veProtesis`). El encargado no la ve. */
  veProtesis: boolean
  usuario: UsuarioDeLaFicha
}

/**
 * La ficha clínica de un paciente (`Ficha.dc.html` y `Plan.dc.html`): el
 * encabezado con sus datos, el resumen y las pestañas Odontograma, Plan y
 * presupuesto, Prótesis, Evoluciones y Antecedentes. Las que no son para quien mira no
 * aparecen: el encargado ve sólo la alerta y el plan, sin editar.
 *
 * Los paneles de las pestañas no se desmontan al cambiar de pestaña: un
 * odontograma marcado y sin guardar sigue ahí al volver. Y antes de salir de
 * la ficha por un enlace con algo sin guardar, se pregunta
 * (`ProveedorDeCambiosSinGuardar`).
 */
export function FichaDelPaciente({
  paciente,
  alergias: alergiasIniciales,
  fichaInicial,
  odontogramaInicial,
  planInicial,
  proximaCita,
  zona,
  hoy,
  puedeEditarFicha,
  veProtesis,
  usuario,
}: PropsDeFichaDelPaciente) {
  // "Pacientes" en la clínica dental (la ficha clínica sólo existe en ella).
  const { cliente } = vocabularioDe(usuario.rubro).palabras
  const [ficha, setFicha] = useState(fichaInicial)
  const [plan, setPlan] = useState(planInicial)
  /** Las marcas del odontograma como están guardadas: la prótesis dibuja punteado lo ausente. */
  const [marcasGuardadas, setMarcasGuardadas] = useState(odontogramaInicial?.marcas ?? [])
  const idBase = `ficha${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  /** Al armar el presupuesto desde el odontograma, el foco va a la pestaña del plan. */
  const enfocarPestana = useRef<IdDePestana | null>(null)

  const pestanas: Pestana<IdDePestana>[] = [
    ...(odontogramaInicial ? [{ id: "odontograma" as const, texto: "Odontograma" }] : []),
    ...(plan ? [{ id: "plan" as const, texto: "Plan y presupuesto" }] : []),
    ...(veProtesis ? [{ id: "protesis" as const, texto: "Prótesis" }] : []),
    ...(ficha ? [{ id: "evoluciones" as const, texto: "Evoluciones" }] : []),
    ...(ficha ? [{ id: "antecedentes" as const, texto: "Antecedentes" }] : []),
  ]
  const [activa, setActiva] = useState<IdDePestana>(pestanas[0]?.id ?? "plan")

  useEffect(() => {
    if (!enfocarPestana.current) return
    document.getElementById(idDePestana(idBase, enfocarPestana.current))?.focus()
    enfocarPestana.current = null
  }, [activa, idBase])

  // Lo último guardado manda: si se editaron los antecedentes, la alerta los sigue.
  const alergias = ficha ? ficha.alergias?.trim() || null : alergiasIniciales

  const alArmarPresupuesto = (nuevo: PlanRespuesta) => {
    setPlan(nuevo)
    enfocarPestana.current = "plan"
    setActiva("plan")
  }

  const panel = (id: IdDePestana) => ({
    id: idDePanel(idBase, id),
    role: "tabpanel" as const,
    "aria-labelledby": idDePestana(idBase, id),
    hidden: activa !== id,
  })

  return (
    // Lo que quede sin guardar (odontograma, antecedentes, una prótesis a
    // medio diseñar) se pregunta antes de irse por un enlace del panel.
    <ProveedorDeCambiosSinGuardar>
    <div className="min-h-dvh">
      <BarraSuperior
        titulo={paciente.nombre}
        // El antetítulo lo pone la barra con la sección ("Pacientes"); "Ficha clínica" abre el subtítulo.
        subtitulo={`Ficha clínica · ${subtituloDelPaciente({
          edad: ficha?.edad ?? null,
          documento: paciente.documento,
          prevision: ficha?.prevision ?? null,
          desde: paciente.desde,
          zona,
          palabraPaciente: cliente.singular,
        })}`}
        mostrarBusqueda={false}
      />

      <div className="space-y-5 px-4 pt-4 pb-10 sm:px-6">
        <Link
          href="/dashboard/clientes"
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] text-sm font-medium text-navy underline-offset-4 anillo-foco hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
          {conMayuscula(cliente.plural)}
        </Link>

        <TarjetasDeResumen
          alergias={alergias}
          proximaCita={proximaCita}
          plan={plan}
          telefono={paciente.telefono}
          email={paciente.email}
          zona={zona}
          hoy={hoy}
        />

        {pestanas.length > 0 && (
          <>
            <Pestanas idBase={idBase} etiqueta="Secciones de la ficha" pestanas={pestanas} activa={activa} alCambiar={setActiva} />

            {odontogramaInicial && (
              <div {...panel("odontograma")}>
                <PestanaOdontograma
                  pacienteId={paciente.id}
                  inicial={odontogramaInicial}
                  editable={puedeEditarFicha}
                  plan={plan}
                  zona={zona}
                  alArmarPresupuesto={alArmarPresupuesto}
                  alGuardar={(guardado) => setMarcasGuardadas(guardado.marcas)}
                />
              </div>
            )}
            {plan && (
              <div {...panel("plan")}>
                <PestanaPlan
                  pacienteId={paciente.id}
                  plan={plan}
                  alCambiar={setPlan}
                  conOdontograma={!!odontogramaInicial}
                  zona={zona}
                  hoy={hoy}
                  usuario={usuario}
                />
              </div>
            )}
            {veProtesis && (
              <div {...panel("protesis")}>
                <PestanaProtesis
                  pacienteId={paciente.id}
                  activa={activa === "protesis"}
                  odontograma={marcasGuardadas}
                  plan={plan}
                  alCambiarPlan={setPlan}
                  esLaDuena={usuario.rol === "owner"}
                  nombreDeQuienMira={usuario.nombre}
                  zona={zona}
                />
              </div>
            )}
            {ficha && (
              <div {...panel("evoluciones")}>
                <PestanaEvoluciones pacienteId={paciente.id} activa={activa === "evoluciones"} editable={puedeEditarFicha} zona={zona} hoy={hoy} />
              </div>
            )}
            {ficha && (
              <div {...panel("antecedentes")}>
                <PestanaAntecedentes pacienteId={paciente.id} ficha={ficha} editable={puedeEditarFicha} zona={zona} hoy={hoy} alGuardar={setFicha} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </ProveedorDeCambiosSinGuardar>
  )
}
