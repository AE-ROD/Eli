"use client"

import { useState } from "react"
import { ArrowLeft, MailCheck } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { pedirEnlaceDeRecuperacion } from "../_datos"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { MarcoDeAcceso } from "../_componentes/marco-de-acceso"

export default function PaginaRecuperarContrasena() {
  const [email, setEmail] = useState("")
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError("")

    const resultado = await pedirEnlaceDeRecuperacion(email)
    setCargando(false)

    if (resultado.ok) setEnviado(true)
    else setError(resultado.error)
  }

  if (enviado) {
    return (
      <MarcoDeAcceso
        clave="enviado"
        arriba={<CuadroDeIcono icono={MailCheck} color="azul" activo tamano="lg" />}
        antetitulo="Recuperar contraseña"
        titulo="Revisa tu correo"
        bajada={
          // Lo mismo exista o no la cuenta: la pantalla no dice quién está registrado.
          <>
            Si <span className="font-medium text-navy">{email}</span> tiene una cuenta en Eli, te enviamos un enlace
            para crear una contraseña nueva. El enlace vence en 1 hora.
          </>
        }
      >
        <p className="text-sm text-texto-2">Si no lo ves en unos minutos, búscalo en la carpeta de spam.</p>
        <Boton href="/iniciar-sesion" variante="secundario" tamano="lg" className="mt-6 w-full">
          Volver a iniciar sesión
        </Boton>
      </MarcoDeAcceso>
    )
  }

  return (
    <MarcoDeAcceso
      clave="formulario"
      antetitulo="Recuperar contraseña"
      titulo="¿Olvidaste tu contraseña?"
      bajada="Escribe el correo de tu cuenta y te enviamos un enlace para crear una nueva."
      pie={
        <Boton href="/iniciar-sesion" variante="fantasma" tamano="sm" icono={<ArrowLeft />}>
          Volver a iniciar sesión
        </Boton>
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

        <AvisoDeError mensaje={error} />

        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Enviar enlace
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
