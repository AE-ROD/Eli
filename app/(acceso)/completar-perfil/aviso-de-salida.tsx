import { Fragment, type ReactNode } from "react"
import { Aviso } from "@/components/panel/aviso"

interface PropsDeAvisoDeSalida {
  /** Los nombres de los negocios de cuyo equipo salió la cuenta (`lib/salidas-del-equipo.ts`). Vacío, no se pinta nada. */
  negocios: readonly string[]
  /** Una línea más, debajo: qué puede hacer ahora en esta pantalla. */
  children?: ReactNode
}

/**
 * Para quien entra y ya no encuentra un negocio en el que trabajaba: la
 * sacaron del equipo. Va arriba de todo en `/completar-perfil` y en
 * `/elegir-negocio`, antes del título, para que lo primero que lea sea qué
 * pasó y no un formulario. Sólo nombra el negocio: nada más de él sale acá.
 */
export function AvisoDeSalida({ negocios, children }: PropsDeAvisoDeSalida) {
  if (negocios.length === 0) return null

  return (
    <Aviso
      tono="atencion"
      rol="status"
      titulo={
        <>
          Ya no eres parte del equipo de{" "}
          {negocios.map((negocio, i) => (
            <Fragment key={i}>
              {i > 0 && (i === negocios.length - 1 ? " ni del de " : ", ")}
              <strong className="font-semibold">{negocio}</strong>
            </Fragment>
          ))}
          .
        </>
      }
    >
      <p>
        Si crees que es un error, habla con quien administra {negocios.length === 1 ? "el negocio" : "cada negocio"}.
      </p>
      {children && <p className="mt-1">{children}</p>}
    </Aviso>
  )
}
