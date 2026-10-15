"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Boton } from "@/components/comunes/boton"
import type { RubroId } from "@/lib/rubros"
import { completarPerfil } from "../_datos"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { CamposDelNegocio } from "../_componentes/campos-del-negocio"
import { borrarSiEs, FALTA_EL_TIPO_DE_NEGOCIO } from "../_componentes/errores-de-validacion"
import { GrupoDeOpciones, type OpcionDeGrupo } from "../_componentes/grupo-de-opciones"
import { MarcoDeAcceso } from "../_componentes/marco-de-acceso"

/** Cuántas personas trabajan en el negocio, contando a quien se registra. */
const opcionesEquipo: readonly OpcionDeGrupo<number>[] = [
  { valor: 1, texto: "Solo yo" },
  { valor: 2, texto: "De 2 a 5" },
  { valor: 6, texto: "6 o más" },
]

export default function PaginaCompletarPerfil() {
  const router = useRouter()
  const { update } = useSession()
  const [cargando, setCargando] = useState(false)
  const [nombreNegocio, setNombreNegocio] = useState("")
  const [tipoNegocio, setTipoNegocio] = useState<RubroId | "">("")
  const [teamSize, setTeamSize] = useState<number>(1)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (!tipoNegocio) {
      setError(FALTA_EL_TIPO_DE_NEGOCIO)
      return
    }

    setCargando(true)

    const resultado = await completarPerfil({ nombreNegocio, tipoNegocio, teamSize })

    if (!resultado.ok) {
      setError(resultado.error)
      setCargando(false)
      return
    }

    await update()
    router.push("/dashboard")
    router.refresh()
  }

  // Si falta el tipo de negocio, el aviso va debajo de las opciones; lo del servidor, arriba del botón.
  const errorDeRubro = error === FALTA_EL_TIPO_DE_NEGOCIO ? error : undefined

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

        <GrupoDeOpciones
          forma="segmentos"
          leyenda="¿Cuántas personas trabajan en el negocio?"
          opciones={opcionesEquipo}
          elegida={teamSize}
          alElegir={setTeamSize}
        />

        <AvisoDeError mensaje={error} visible={!errorDeRubro} />

        <Boton type="submit" tamano="lg" cargando={cargando} className="mt-1 w-full">
          Entrar al panel
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
