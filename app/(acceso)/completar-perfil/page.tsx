"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Boton } from "@/components/comunes/boton"
import { idDeContextoDeDueña } from "@/lib/contextos"
import type { PlanId } from "@/lib/planes"
import type { RubroId } from "@/lib/rubros"
import { completarPerfil } from "../_datos"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { CamposDelNegocio } from "../_componentes/campos-del-negocio"
import { ElegirPlan } from "../_componentes/elegir-plan"
import { borrarSiEs, FALTA_EL_PLAN, FALTA_EL_TIPO_DE_NEGOCIO } from "../_componentes/errores-de-validacion"
import { GrupoDeOpciones, type OpcionDeGrupo } from "../_componentes/grupo-de-opciones"
import { MarcoDeAcceso } from "../_componentes/marco-de-acceso"

/** Cuántas personas trabajan en el negocio, contando a quien se registra. */
const opcionesEquipo: readonly OpcionDeGrupo<number>[] = [
  { valor: 1, texto: "Solo yo" },
  { valor: 2, texto: "De 2 a 5" },
  { valor: 6, texto: "6 o más" },
]

export default function PaginaCompletarPerfil() {
  const { update } = useSession()
  const [cargando, setCargando] = useState(false)
  const [nombreNegocio, setNombreNegocio] = useState("")
  const [tipoNegocio, setTipoNegocio] = useState<RubroId | "">("")
  const [plan, setPlan] = useState<PlanId | "">("")
  const [teamSize, setTeamSize] = useState<number>(1)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (!tipoNegocio) {
      setError(FALTA_EL_TIPO_DE_NEGOCIO)
      return
    }

    if (!plan) {
      setError(FALTA_EL_PLAN)
      return
    }

    setCargando(true)

    // Las personas sólo se preguntan en Equipo. En Independiente atiende una
    // sola, la dueña: no se manda, y el servidor lo fija igual.
    const resultado = await completarPerfil({
      nombreNegocio,
      tipoNegocio,
      plan,
      ...(plan === "equipo" ? { teamSize } : {}),
    })

    if (!resultado.ok) {
      setError(resultado.error)
      setCargando(false)
      return
    }

    // Entra al negocio recién creado como dueña. Quien ya trabajaba en otros
    // negocios queda con un contexto más y puede cambiar desde el panel. El
    // servidor verifica que el negocio sea de esta cuenta (`lib/auth.ts`).
    await update({ contexto: idDeContextoDeDueña(resultado.datos.id) })
    // Navegación completa y no `router.push`: el enrutador del navegador
    // guarda que "/dashboard" redirigía acá (cuando la sesión no tenía
    // negocio elegido) y con `push` volvía a esta misma pantalla. Además el
    // panel se arma de cero, sin nada del contexto anterior en memoria.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver arriba
    window.location.assign("/dashboard")
  }

  // Si falta el tipo de negocio o el plan, el aviso va debajo de sus opciones; lo del servidor, arriba del botón.
  const errorDeRubro = error === FALTA_EL_TIPO_DE_NEGOCIO ? error : undefined
  const errorDePlan = error === FALTA_EL_PLAN ? error : undefined

  return (
    <MarcoDeAcceso
      antetitulo="Último paso"
      titulo="Cuéntanos de tu negocio"
      bajada="El nombre es el que ven tus clientes cuando reservan."
    >
      <form onSubmit={manejarEnvio} className="flex flex-col gap-5">
        <CamposDelNegocio
          nombre={nombreNegocio}
          alCambiarNombre={setNombreNegocio}
          rubro={tipoNegocio}
          alElegirRubro={(rubro) => {
            setTipoNegocio(rubro)
            setError(borrarSiEs(FALTA_EL_TIPO_DE_NEGOCIO))
          }}
          errorDeRubro={errorDeRubro}
        />

        <ElegirPlan
          plan={plan}
          alElegir={(elegido) => {
            setPlan(elegido)
            setError(borrarSiEs(FALTA_EL_PLAN))
          }}
          rubro={tipoNegocio}
          error={errorDePlan}
        />

        {plan === "equipo" && (
          <GrupoDeOpciones
            forma="segmentos"
            leyenda="¿Cuántas personas trabajan en el negocio?"
            opciones={opcionesEquipo}
            elegida={teamSize}
            alElegir={setTeamSize}
          />
        )}

        <AvisoDeError mensaje={error} visible={!errorDeRubro && !errorDePlan} />

        <Boton type="submit" tamano="lg" cargando={cargando} className="mt-1 w-full">
          Entrar al panel
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
