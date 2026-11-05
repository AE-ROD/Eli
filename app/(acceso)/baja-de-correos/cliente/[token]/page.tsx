"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Boton } from "@/components/comunes/boton"
import { darDeBajaAlCliente } from "../../../_datos"
import { AvisoDeError } from "../../../_componentes/aviso-de-error"
import { MarcoDeAcceso } from "../../../_componentes/marco-de-acceso"

/**
 * El enlace "Dejar de recibir estos correos" de los correos promocionales a
 * un cliente ("te toca" y pedir reseña). No da de baja al abrirse: pide
 * confirmar con un botón (un POST), porque los antivirus y las vistas previas
 * de los clientes de correo abren los enlaces solos. La baja en un clic del
 * propio cliente de correo (encabezado `List-Unsubscribe`) no pasa por acá.
 *
 * No consulta nada al abrirse: el token no se verifica hasta el POST, y la
 * respuesta es la misma sea cual sea.
 */
export default function PaginaBajaDeCliente() {
  const params = useParams()
  const token = params.token as string
  const [cargando, setCargando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState("")

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setCargando(true)

    const resultado = await darDeBajaAlCliente(token)

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
        bajada="No te vamos a mandar más avisos ni novedades de este negocio. Los correos de tus citas, como la confirmación y el recordatorio, te siguen llegando."
      />
    )
  }

  return (
    <MarcoDeAcceso
      clave="confirmar"
      antetitulo="Correos"
      titulo="¿Dejar de recibir estos correos?"
      bajada="Son los avisos y novedades que te manda el negocio donde te atiendes, como cuándo te toca volver o una invitación a dejar tu reseña. Los correos de tus citas te van a seguir llegando."
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
