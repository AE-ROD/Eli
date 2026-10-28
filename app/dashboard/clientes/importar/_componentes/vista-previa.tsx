"use client"

import { Selector } from "@/components/comunes/selector"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { CAMPOS_DE_IMPORTACION, type CampoDeImportacion } from "@/lib/importar-clientes"

/** Cuántas filas de datos muestra la vista previa. */
const FILAS_DE_MUESTRA = 5

export type MapeoEnPantalla = Partial<Record<CampoDeImportacion, number>>

interface PropsDeVistaPrevia {
  filas: string[][]
  mapeo: MapeoEnPantalla
  alCambiarMapeo: (campo: CampoDeImportacion, columna: number | undefined) => void
}

/** "Columna 3 · Teléfono": así se distinguen dos cabeceras iguales o una vacía. */
function nombreDeColumna(cabecera: string, indice: number): string {
  const texto = cabecera.trim()
  return texto ? `Columna ${indice + 1} · ${texto}` : `Columna ${indice + 1}`
}

/**
 * Qué columna del archivo es cada dato, y las primeras filas tal como se
 * leyeron. La tabla se desplaza de costado dentro de su tarjeta: un archivo
 * con muchas columnas no ensancha la página.
 */
export function VistaPrevia({ filas, mapeo, alCambiarMapeo }: PropsDeVistaPrevia) {
  const [cabecera, ...datos] = filas
  const muestra = datos.slice(0, FILAS_DE_MUESTRA)
  const opciones = cabecera.map((texto, indice) => ({ valor: String(indice), texto: nombreDeColumna(texto, indice) }))
  const campoDeLaColumna = (indice: number) =>
    CAMPOS_DE_IMPORTACION.find(({ id }) => mapeo[id] === indice)?.etiqueta

  return (
    <div className="space-y-4 sm:space-y-6">
      <Tarjeta como="section" className="space-y-4 p-5 sm:p-6" aria-labelledby="titulo-mapeo">
        <div>
          <h2 id="titulo-mapeo" className="font-medium text-navy">
            Qué columna es cada dato
          </h2>
          <p className="mt-1 text-sm text-texto-2">
            Lo sugerimos por el nombre de cada columna; revísalo antes de importar. Si hay nombre y apellido por
            separado, se juntan.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS_DE_IMPORTACION.map(({ id, etiqueta, obligatorio }) => (
            <Selector
              key={id}
              etiqueta={obligatorio ? `${etiqueta} (obligatorio)` : etiqueta}
              opciones={opciones}
              value={mapeo[id] === undefined ? "" : String(mapeo[id])}
              onChange={(e) => alCambiarMapeo(id, e.target.value === "" ? undefined : Number(e.target.value))}
            >
              <option value="">{obligatorio ? "Elige la columna" : "No importar"}</option>
            </Selector>
          ))}
        </div>
        {mapeo.whatsapp === undefined && (
          <p className="text-sm text-texto-2">
            Sin una columna de &ldquo;Acepta WhatsApp&rdquo;, los clientes importados quedan sin consentimiento para
            recibir mensajes.
          </p>
        )}
      </Tarjeta>

      <Tarjeta como="section" className="space-y-4 p-5 sm:p-6" aria-labelledby="titulo-muestra">
        <div>
          <h2 id="titulo-muestra" className="font-medium text-navy">
            Vista previa
          </h2>
          <p className="mt-1 text-sm text-texto-2">
            {datos.length === 1 ? "1 fila" : `${datos.length.toLocaleString("es-CL")} filas`} en el archivo. Estas son
            las primeras {Math.min(FILAS_DE_MUESTRA, datos.length)}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-borde">
                {cabecera.map((texto, indice) => (
                  <th key={indice} scope="col" className="px-3 py-2 align-bottom font-medium text-navy">
                    <span className="block">{texto || `Columna ${indice + 1}`}</span>
                    <span className="block text-xs font-normal text-texto-2">{campoDeLaColumna(indice) ?? "No se importa"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {muestra.map((fila, numero) => (
                <tr key={numero} className="border-b border-borde last:border-0">
                  {cabecera.map((_, indice) => (
                    <td key={indice} className="max-w-60 truncate px-3 py-2 text-texto-2">
                      {fila[indice] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  )
}
