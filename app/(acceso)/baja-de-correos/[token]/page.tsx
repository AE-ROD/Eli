"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Boton } from "@/components/comunes/boton"
import { darDeBajaLosCorreos } from "../../_datos"
import { AvisoDeError } from "../../_componentes/aviso-de-error"
import { MarcoDeAcceso, PreguntaConEnlace } from "../../_componentes/marco-de-acceso"

/**
 * El enlace "Dejar de recibir estos correos" de los correos del ciclo de
 * prueba. No da de baja al abrirse: pide confirmar con un botón (un POST),
 * porque los antivirus y las vistas previas de los clientes de correo abren
 * los enlaces solos.
 */
export default function PaginaBajaDeCorreos() {
  const params = useParams()
  const token = params.token as string
  const [cargando, setCargando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState("")

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setCargando(true)

    const resultado = await darDeBajaLosCorreos(token)

    setCargando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setListo(true)
  }

  if (listo) {
    return (
      <MarcoDeAcceso
        clave="listo"
        antetitulo="Correos"
        titulo="Listo"
        bajada="No te vamos a mandar más consejos ni avisos de la prueba. Los correos de tu cuenta, como recuperar la contraseña, te siguen llegando."
        pie={
          <PreguntaConEnlace pregunta="¿Quieres seguir?" href="/dashboard">
            Ir a mi panel
          </PreguntaConEnlace>
        }
      />
    )
  }

  return (
    <MarcoDeAcceso
      clave="confirmar"
      antetitulo="Correos"
      titulo="¿Dejar de recibir estos correos?"
      bajada="Son los consejos y avisos de tu prueba gratis de Eli. Los correos de tu cuenta, como recuperar la contraseña, te van a seguir llegando."
    >
      <form className="flex flex-col gap-5" onSubmit={confirmar}>
        <AvisoDeError mensaje={error} />
        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Dejar de recibirlos
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
