"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { AccesoConGoogle } from "../_componentes/acceso-con-google"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { mensajeDeErrorDeAcceso } from "../_componentes/errores-de-acceso"
import { MarcoDeAcceso, PreguntaConEnlace } from "../_componentes/marco-de-acceso"

export default function PaginaIniciarSesion() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [email, setEmail] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [error, setError] = useState("")

  // Se lee del navegador y no con useSearchParams: ese hook obliga a envolver
  // la página en un <Suspense> o el prerender falla.
  useEffect(() => {
    const mensaje = mensajeDeErrorDeAcceso(new URLSearchParams(window.location.search).get("error"))
    if (mensaje) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responde al redirect de OAuth, no a un valor de render
      setError(mensaje)
    }
  }, [])

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError("")

    const resultado = await signIn("credentials", {
      email,
      password: contrasena,
      redirect: false,
    })

    if (resultado?.error) {
      setError("Correo o contraseña incorrectos")
      setCargando(false)
    } else {
      router.push("/dashboard")
      router.refresh()
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

      <AccesoConGoogle alElegir={() => signIn("google", { callbackUrl: "/dashboard" })}>
        Continuar con Google
      </AccesoConGoogle>
    </MarcoDeAcceso>
  )
}
