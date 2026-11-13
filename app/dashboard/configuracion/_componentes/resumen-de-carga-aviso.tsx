import { Aviso } from "@/components/panel/aviso"
import type { ResumenParaMostrar } from "../_frases-de-servicios"

/**
 * Lo que pasó con una carga: el aviso con su título y, si hubo servicios que no
 * se agregaron, la lista de cuáles y por qué. Con `Aviso titulo` el detalle va
 * en un bloque aparte (una lista no puede ir dentro de un párrafo).
 */
export function ResumenDeCargaAviso({
  resumen,
  rol,
  className,
  accion,
}: {
  resumen: ResumenParaMostrar
  rol?: "alert" | "status"
  className?: string
  accion?: React.ReactNode
}) {
  return resumen.detalles.length > 0 ? (
    <Aviso tono={resumen.tono} rol={rol} titulo={resumen.titulo} className={className} accion={accion}>
      <ul className="list-disc space-y-0.5 pl-5">
        {resumen.detalles.map((detalle, i) => (
          <li key={`${i}-${detalle}`}>{detalle}</li>
        ))}
      </ul>
    </Aviso>
  ) : (
    <Aviso tono={resumen.tono} rol={rol} className={className} accion={accion}>
      {resumen.titulo}
    </Aviso>
  )
}
