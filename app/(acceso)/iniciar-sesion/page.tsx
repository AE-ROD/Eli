"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { AccesoConGoogle } from "../_componentes/acceso-con-google"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { AvisoDeExito } from "../_componentes/aviso-de-exito"
import { avisoDeAcceso, mensajeDeErrorAlEntrar, mensajeDeErrorDeAcceso } from "../_componentes/errores-de-acceso"
import { MarcoDeAcceso, PreguntaConEnlace } from "../_componentes/marco-de-acceso"

/**
 * A dónde volver después de entrar, si se llegó con `?volver=`: sólo al
 * enlace de una invitación (`/unirse/<token>`), que es quien lo pone. Nada de
 * URLs de afuera ni de `//otro-sitio`: cualquier otra cosa va al panel.
 */
function destinoAlEntrar(volver: string | null): string {
  return volver && /^\/unirse\/[^/?#\\]+$/.test(volver) ? volver : "/dashboard"
}

export default function PaginaIniciarSesion() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [cargandoGoogle, setCargandoGoogle] = useState(false)
  const [email, setEmail] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [error, setError] = useState("")
  const [aviso, setAviso] = useState("")

  // Se lee del navegador y no con useSearchParams: ese hook obliga a envolver
  // la página en un <Suspense> o el prerender falla.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search)
    const mensaje = mensajeDeErrorDeAcceso(parametros.get("error"))
    const exito = avisoDeAcceso(parametros.get("aviso"))
    /* eslint-disable react-hooks/set-state-in-effect -- responde al redirect de OAuth o de otra pantalla, no a un valor de render */
    if (mensaje) setError(mensaje)
    if (exito) setAviso(exito)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError("")
    setAviso("")

    // `signIn` lanza si no hubo respuesta o si la respuesta no es la que
    // espera: el botón no puede quedar girando.
    let resultado: Awaited<ReturnType<typeof signIn>>
    try {
      resultado = await signIn("credentials", {
        email,
        password: contrasena,
        redirect: false,
      })
    } catch {
      setError(mensajeDeErrorAlEntrar(null))
      setCargando(false)
      return
    }

    if (!resultado?.ok || resultado.error) {
      setError(mensajeDeErrorAlEntrar(resultado?.error ?? "Desconocido"))
      setCargando(false)
      return
    }

    // Con más de un negocio, el panel la manda a elegir con cuál trabajar.
    router.push(destinoAlEntrar(new URLSearchParams(window.location.search).get("volver")))
    router.refresh()
  }

  const entrarConGoogle = async () => {
    setCargandoGoogle(true)
    try {
      await signIn("google", { callbackUrl: "/dashboard" })
    } catch {
      setError(mensajeDeErrorAlEntrar(null))
      setCargandoGoogle(false)
    }
  }

  return (
    <MarcoDeAcceso
      antetitulo="Iniciar sesión"
      titulo="Hola de nuevo"
      bajada="Entra con tu correo y tu contraseña, o con tu cuenta de Google."
      pie={
        <PreguntaConEnlace pregunta="¿Todavía no tienes cuenta?" href="/crear-cuenta">
          Crea una
        </PreguntaConEnlace>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={manejarEnvio}>
        <AvisoDeExito mensaje={aviso} />

        <CampoFormulario
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div>
          <CampoFormulario
            etiqueta="Contraseña"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />
          <div className="mt-1 flex justify-end">
            <Boton href="/recuperar-contrasena" variante="enlace" tamano="sm">
              ¿Olvidaste tu contraseña?
            </Boton>
          </div>
        </div>

        <AvisoDeError mensaje={error} />

        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Iniciar sesión
        </Boton>
      </form>

      <AccesoConGoogle alElegir={entrarConGoogle} cargando={cargandoGoogle}>
        Continuar con Google
      </AccesoConGoogle>
    </MarcoDeAcceso>
  )
}
