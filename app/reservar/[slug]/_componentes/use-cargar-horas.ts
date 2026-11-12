import { useCallback } from "react"
import { leerDisponibilidad } from "../_datos"

/**
 * Lo que el calendario llama para traer las horas libres de un día. Se pide al
 * servidor con lo que se eligió; la identidad de la función sólo cambia cuando
 * cambia algo de eso, así que el calendario no vuelve a pedir las horas sin
 * motivo.
 *
 * Vive en su propio hook (y no dentro del formulario) a propósito: dentro del
 * componente grande, el compilador de React no puede probar que la clave de
 * servicios no se modifica más abajo y descarta la memorización. Acá todas las
 * entradas son valores simples.
 *
 * @param claveDeServicios Los ids de los servicios elegidos, unidos con comas.
 * @param primeraVez La respuesta de "¿es tu primera consulta?" (sólo la clínica
 *   dental la manda; en otro rubro, `null`).
 * @param sedeId La sede elegida (plan Independiente con varias sedes): las horas
 *   son las de esa sede. Sin varias sedes, `null` y no se manda. Cambiar de sede
 *   cambia la identidad de la función, así que el calendario vuelve a pedir las
 *   horas del día elegido.
 */
export function useCargarHoras(
  slug: string,
  claveDeServicios: string,
  profesionalId: string | null,
  primeraVez: boolean | null,
  sedeId: string | null = null
) {
  return useCallback(
    (dia: string) =>
      leerDisponibilidad(slug, dia, claveDeServicios ? claveDeServicios.split(",") : [], profesionalId, primeraVez, sedeId),
    [slug, claveDeServicios, profesionalId, primeraVez, sedeId]
  )
}
