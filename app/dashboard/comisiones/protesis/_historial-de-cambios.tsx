import { History } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { type FilaDelHistorial, type FrasesDelHistorial, type RepartoEscrito } from "./_frases"

interface PropsDelHistorial {
  filas: FilaDelHistorial[]
  frases: FrasesDelHistorial
  /** Adónde lleva "Ver más cambios"; `null` si no hay más que ver. */
  hrefDeVerMas: string | null
  /** Se llegó al tope de lo que se muestra de una vez: cuántos. */
  topeAlcanzado: number | null
}

/** Una de las dos columnas: las tres partes en porcentaje, o por qué no hay ("No existía", "Se quitó"). */
function Reparto({ titulo, reparto }: { titulo: string; reparto: RepartoEscrito }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-16 shrink-0 text-[13px] text-texto-2">{titulo}</dt>
      <dd>
        {reparto.partes ? (
          <ul className="flex flex-wrap gap-1.5 text-[13px] font-semibold tabular-nums">
            {reparto.partes.map((parte) => (
              <li key={parte.clave} className={cn("rounded-full px-2.5 py-0.5 text-navy", parte.color)}>
                <span className="sr-only">{parte.nombre}: </span>
                {parte.texto}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[13px] text-texto-2">{reparto.vacio}</span>
        )}
      </dd>
    </div>
  )
}

/**
 * La sección "Historial de cambios" de Reparto de prótesis: del más nuevo al
 * más viejo, quién, cuándo, qué se cambió y el antes y el después de las tres
 * partes. Es de servidor y no tiene estado: "Ver más cambios" es un enlace que
 * pide más filas a la misma página (`?hasta=`).
 *
 * Los colores de las partes son los de la barra del reparto de arriba, y cada
 * parte va con su nombre (a la vista en el reparto de arriba, para el lector de
 * pantalla en cada fila): el color nunca es la única pista.
 */
export function HistorialDeCambiosDelReparto({ filas, frases, hrefDeVerMas, topeAlcanzado }: PropsDelHistorial) {
  return (
    <section aria-labelledby="historial-del-reparto" className={cn(TARJETA_DEL_PANEL, "overflow-hidden")}>
      <div className="space-y-4 p-5 sm:p-6">
        <EncabezadoDeTarjeta id="historial-del-reparto" titulo={frases.titulo} subtitulo={frases.subtitulo} icono={{ figura: History }} />

        {filas.length === 0 ? (
          <EstadoVacio>{frases.sinCambios}</EstadoVacio>
        ) : (
          <ol aria-label={frases.lista} className="divide-y divide-borde">
            {filas.map((fila) => (
              <li key={fila.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Insignia tono={fila.alcance === "material" ? "gris" : "lila"}>{fila.etiqueta}</Insignia>
                  <p className="min-w-0 text-sm font-medium break-words">{fila.titulo}</p>
                </div>
                <p className="text-sm break-words text-texto-2">
                  {fila.resumen} · <span className="tabular-nums">{fila.cuando}</span>
                </p>
                <dl className="space-y-1.5">
                  <Reparto titulo={frases.antes} reparto={fila.antes} />
                  <Reparto titulo={frases.despues} reparto={fila.despues} />
                </dl>
              </li>
            ))}
          </ol>
        )}

        {hrefDeVerMas && (
          <div className="flex justify-center">
            <Boton href={hrefDeVerMas} variante="secundario" tamano="sm" scroll={false}>
              {frases.verMas}
            </Boton>
          </div>
        )}
        {topeAlcanzado !== null && <p className="text-center text-[13px] text-texto-2">{frases.tope(topeAlcanzado)}</p>}
      </div>
    </section>
  )
}
