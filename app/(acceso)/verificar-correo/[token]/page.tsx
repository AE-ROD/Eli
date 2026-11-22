"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Boton } from "@/components/comunes/boton"
import {
  confirmarCorreo,
  enlaceDeVerificacionVencido,
  leerVerificacion,
  reenviarVerificacion,
} from "@/lib/verificacion-de-correo"
import { AvisoDeError } from "../../_componentes/aviso-de-error"
import { MarcoDeAcceso, PreguntaConEnlace } from "../../_componentes/marco-de-acceso"

/**
 * El enlace de "Confirma tu correo" que llega al registrarse. No confirma al
 * abrirse: pide apretar un botón (un POST), porque los antivirus y las vistas
 * previas de los clientes de correo abren los enlaces solos, y algunos corren
 * también el JavaScript de la página; un pedido automático al cargar les
 * dejaría gastar el enlace, o confirmar el correo de alguien que nunca lo abrió.
 *
 * No pide sesión: quien abre el correo en el celular confirma ahí mismo. Si
 * el enlace ya no sirve y hay sesión, se ofrece mandar otro; sin sesión, se
 * manda a iniciarla (el aviso del panel tiene el botón para pedirlo).
 */

/** Qué se puede ofrecer cuando el enlace ya no sirve. */
type SalidaDelVencido =
  | { tipo: "reenviar"; email: string }
  | { tipo: "ya-confirmado" }
  | { tipo: "sin-sesion" }

type Estado =
  | { paso: "confirmar" }
  | { paso: "listo" }
  | { paso: "vencido"; salida: SalidaDelVencido }
  | { paso: "reenviado"; email: string }

const PIE_AL_PANEL = (
  <PreguntaConEnlace pregunta="¿Quieres seguir?" href="/dashboard">
    Ir a mi panel
  </PreguntaConEnlace>
)

export default function PaginaVerificarCorreo() {
  const params = useParams()
  const token = params.token as string
  const [estado, setEstado] = useState<Estado>({ paso: "confirmar" })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setCargando(true)

    const resultado = await confirmarCorreo(token)

    if (resultado.ok) {
      setCargando(false)
      setEstado({ paso: "listo" })
      return
    }
    if (!enlaceDeVerificacionVencido(resultado.codigo)) {
      setCargando(false)
      setError(resultado.error)
      return
    }

    // El enlace no sirve. Con sesión se sabe si ya estaba confirmado (abrió el
    // enlace dos veces) o si hay que mandarle otro.
    const verificacion = await leerVerificacion()
    setCargando(false)
    if (!verificacion.ok) setEstado({ paso: "vencido", salida: { tipo: "sin-sesion" } })
    else if (verificacion.datos.verificado) setEstado({ paso: "vencido", salida: { tipo: "ya-confirmado" } })
    else setEstado({ paso: "vencido", salida: { tipo: "reenviar", email: verificacion.datos.email } })
  }

  const pedirOtro = async (e: React.FormEvent, email: string) => {
    e.preventDefault()
    setError("")
    setCargando(true)

    const resultado = await reenviarVerificacion()

    setCargando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setEstado(resultado.datos.verificado ? { paso: "vencido", salida: { tipo: "ya-confirmado" } } : { paso: "reenviado", email })
  }

  if (estado.paso === "listo") {
    return (
      <MarcoDeAcceso
        clave="listo"
        antetitulo="Tu cuenta"
        titulo="Correo confirmado"
        bajada="Gracias. Desde ahora te van a llegar a este correo los avisos de tu prueba gratis."
        pie={PIE_AL_PANEL}
      />
    )
  }

  if (estado.paso === "reenviado") {
    return (
      <MarcoDeAcceso
        clave="reenviado"
        antetitulo="Tu cuenta"
        titulo="Te mandamos otro enlace"
        bajada={`Va en camino a ${estado.email}. Si no lo ves en unos minutos, revisa la carpeta de spam.`}
        pie={PIE_AL_PANEL}
      />
    )
  }

  if (estado.paso === "vencido") {
    const { salida } = estado

    if (salida.tipo === "ya-confirmado") {
      return (
        <MarcoDeAcceso
          clave="ya-confirmado"
          antetitulo="Tu cuenta"
          titulo="Tu correo ya está confirmado"
          bajada="Este enlace ya se usó. No tienes que hacer nada más."
          pie={PIE_AL_PANEL}
        />
      )
    }

    if (salida.tipo === "reenviar") {
      return (
        <MarcoDeAcceso
          clave="vencido"
          antetitulo="Tu cuenta"
          titulo="Este enlace ya no sirve"
          bajada="Venció o ya se usó. Te mandamos uno nuevo a tu correo y lo confirmas desde ahí."
        >
          <form className="flex flex-col gap-5" onSubmit={(e) => pedirOtro(e, salida.email)}>
            <AvisoDeError mensaje={error} />
            <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
              Mandarme otro enlace
            </Boton>
          </form>
        </MarcoDeAcceso>
      )
    }

    return (
      <MarcoDeAcceso
        clave="vencido-sin-sesion"
        antetitulo="Tu cuenta"
        titulo="Este enlace ya no sirve"
        bajada="Venció o ya se usó. Inicia sesión: si todavía falta confirmar tu correo, arriba de tu panel vas a ver un aviso con el botón para pedir otro enlace."
      >
        <Boton href="/iniciar-sesion" tamano="lg" className="w-full">
          Iniciar sesión
        </Boton>
      </MarcoDeAcceso>
    )
  }

  return (
    <MarcoDeAcceso
      clave="confirmar"
      antetitulo="Tu cuenta"
      titulo="Confirma tu correo"
      bajada="Un toque y listo: así sabemos que este correo es tuyo y te mandamos aquí los avisos de tu prueba gratis."
    >
      <form className="flex flex-col gap-5" onSubmit={confirmar}>
        <AvisoDeError mensaje={error} />
        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Confirmar mi correo
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
