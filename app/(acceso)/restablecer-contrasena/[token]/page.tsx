"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { restablecerContrasena } from "../../_datos"
import { AvisoDeError } from "../../_componentes/aviso-de-error"
import { borrarSiEs, CONTRASENA_CORTA, CONTRASENAS_DISTINTAS } from "../../_componentes/errores-de-validacion"
import { MarcoDeAcceso, PreguntaConEnlace } from "../../_componentes/marco-de-acceso"

export default function PaginaRestablecerContrasena() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const [contrasena, setContrasena] = useState("")
  const [confirmarContrasena, setConfirmarContrasena] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (contrasena.length < 8) {
      setError(CONTRASENA_CORTA)
      return
    }
    if (contrasena !== confirmarContrasena) {
      setError(CONTRASENAS_DISTINTAS)
      return
    }

    setCargando(true)

    const resultado = await restablecerContrasena(token, contrasena)

    if (!resultado.ok) {
      setError(resultado.error)
      setCargando(false)
      return
    }

    router.push("/iniciar-sesion")
  }

  // Lo que se valida acá va debajo de su campo; lo que responde el servidor, arriba del botón.
  const errorDeContrasena = error === CONTRASENA_CORTA ? error : undefined
  const errorDeConfirmacion = error === CONTRASENAS_DISTINTAS ? error : undefined

  return (
    <MarcoDeAcceso
      antetitulo="Recuperar contraseña"
      titulo="Crea una contraseña nueva"
      bajada="Elige una de al menos 8 caracteres. Después vas a iniciar sesión con ella."
      pie={
        <PreguntaConEnlace pregunta="¿El enlace venció?" href="/recuperar-contrasena">
          Pide uno nuevo
        </PreguntaConEnlace>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={manejarEnvio}>
        <CampoFormulario
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          placeholder="Al menos 8 caracteres"
          value={contrasena}
          onChange={(e) => {
            setContrasena(e.target.value)
            setError(borrarSiEs(CONTRASENA_CORTA))
          }}
          error={errorDeContrasena}
          required
        />

        <CampoFormulario
          etiqueta="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmarContrasena}
          onChange={(e) => {
            setConfirmarContrasena(e.target.value)
            setError(borrarSiEs(CONTRASENAS_DISTINTAS))
          }}
          error={errorDeConfirmacion}
          required
        />

        <AvisoDeError mensaje={error} visible={!errorDeContrasena && !errorDeConfirmacion} />

        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Guardar contraseña
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
