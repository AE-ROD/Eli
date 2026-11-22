"use client"

import { useCallback, useEffect, useState } from "react"
import { Boton } from "@/components/comunes/boton"
import { Aviso } from "@/components/panel/aviso"
import { leerVerificacion, reenviarVerificacion } from "@/lib/verificacion-de-correo"

/**
 * La franja "Confirma tu correo", arriba de todas las páginas del panel. Sólo
 * se ve mientras la cuenta no confirmó su correo, y no bloquea nada: la cuenta
 * funciona igual, lo único que espera son los correos de la prueba gratis.
 *
 * El estado se le pregunta al servidor al montar (no viaja en la sesión) y de
 * nuevo cada vez que se vuelve a la pestaña: quien confirma desde el correo,
 * en otra pestaña, la ve desaparecer al volver. Mientras no se sabe, o si la
 * consulta falla, no se pinta nada: un aviso que parpadea o que acusa de más
 * es peor que uno que tarda.
 *
 * En el celular va arriba de la fila del título, que al bajar se queda pegada
 * arriba; la franja se va con la página. El botón baja debajo del texto
 * cuando no entra al lado (`Aviso`), y el correo largo se corta en varias
 * líneas.
 */
export function AvisoDeVerificarCorreo() {
  /** El correo sin confirmar; `null` es "no hay nada que avisar". */
  const [email, setEmail] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [reenviado, setReenviado] = useState(false)
  const [error, setError] = useState("")

  const revisar = useCallback(async () => {
    const resultado = await leerVerificacion()
    // Si falla (sin conexión, un 429) se deja como estaba.
    if (resultado.ok) setEmail(resultado.datos.verificado ? null : resultado.datos.email)
  }, [])

  useEffect(() => {
    // La respuesta llega después: el estado no se toca en el efecto mismo.
    const alMontar = setTimeout(revisar, 0)
    const alVolver = () => {
      if (document.visibilityState === "visible") void revisar()
    }
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      clearTimeout(alMontar)
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [revisar])

  if (!email) return null

  const reenviar = async () => {
    setError("")
    setEnviando(true)
    const resultado = await reenviarVerificacion()
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    if (resultado.datos.verificado) setEmail(null)
    else setReenviado(true)
  }

  return (
    <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] max-escritorio:pb-3 sm:px-6 escritorio:pt-6">
      <Aviso
        tono={error ? "error" : "atencion"}
        rol="status"
        accion={
          !reenviado && (
            <Boton variante="secundario" tamano="sm" cargando={enviando} onClick={reenviar}>
              Reenviar
            </Boton>
          )
        }
      >
        {error ? (
          error
        ) : reenviado ? (
          <>
            Listo, te mandamos otro enlace a <span className="break-all">{email}</span>. Si no lo ves, revisa la carpeta
            de spam.
          </>
        ) : (
          <>
            Confirma tu correo para recibir los avisos de tu prueba gratis. Te mandamos un enlace a{" "}
            <span className="break-all">{email}</span>.
          </>
        )}
      </Aviso>
    </div>
  )
}
