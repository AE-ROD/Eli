"use client"

import { useId, useState } from "react"
import { useSession } from "next-auth/react"
import { ArrowLeft, Upload } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { Aviso } from "@/components/panel/aviso"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { actorDeSesion, puedeImportarExportarClientes } from "@/lib/permisos"
import { decodificarCsv, leerCsv } from "@/lib/csv"
import { FILAS_MAXIMAS, TAMAÑO_MAXIMO_EN_BYTES, sugerirMapeo, type CampoDeImportacion } from "@/lib/importar-clientes"
import { importarClientes, type ResumenDeImportacion as Resumen } from "../_datos"
import { VistaPrevia, type MapeoEnPantalla } from "./_componentes/vista-previa"
import { ResumenDeImportacion } from "./_componentes/resumen-de-importacion"

interface ArchivoLeido {
  nombre: string
  texto: string
  filas: string[][]
}

/** Un CSV por su extensión o por su tipo: Windows a veces lo declara como de Excel, o sin tipo. */
function pareceCsv(archivo: File): boolean {
  return archivo.name.toLowerCase().endsWith(".csv") || archivo.type.startsWith("text/")
}

/**
 * Importar clientes desde un CSV (Clientes → Importar CSV): se elige el
 * archivo, se revisa qué columna es cada dato con una vista previa, y el
 * servidor crea los que no estén repetidos. El archivo se lee acá sólo para
 * mostrarlo; el servidor lo vuelve a leer y valida cada fila.
 */
export default function PaginaImportarClientes() {
  const { data: sesion, status } = useSession()
  const puede = puedeImportarExportarClientes(actorDeSesion(sesion))
  const idDelArchivo = useId()

  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null)
  const [mapeo, setMapeo] = useState<MapeoEnPantalla>({})
  const [aviso, setAviso] = useState("")
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)

  const elegirArchivo = async (elegido: File | undefined) => {
    setAviso("")
    setResumen(null)
    setArchivo(null)
    if (!elegido) return

    if (!pareceCsv(elegido)) return setAviso("El archivo tiene que ser un CSV (.csv). Desde Excel: Guardar como → CSV.")
    if (elegido.size > TAMAÑO_MAXIMO_EN_BYTES) return setAviso("El archivo pesa más de 2 MB. Divídelo en partes.")

    const texto = decodificarCsv(new Uint8Array(await elegido.arrayBuffer()))
    const filas = leerCsv(texto)
    if (filas.length < 2) return setAviso("El archivo no tiene clientes: le falta la cabecera o las filas.")
    if (filas.length - 1 > FILAS_MAXIMAS) {
      return setAviso(`El archivo tiene más de ${FILAS_MAXIMAS.toLocaleString("es-CL")} filas. Divídelo en partes.`)
    }

    setArchivo({ nombre: elegido.name, texto, filas })
    setMapeo(sugerirMapeo(filas[0]) ?? {})
  }

  const cambiarMapeo = (campo: CampoDeImportacion, columna: number | undefined) => {
    setMapeo((previo) => {
      // Una columna es un solo dato: si ya era de otro, ése queda sin columna.
      const siguiente: MapeoEnPantalla = Object.fromEntries(
        Object.entries(previo).filter(([otro, indice]) => otro !== campo && indice !== columna)
      )
      if (columna !== undefined) siguiente[campo] = columna
      return siguiente
    })
  }

  const importar = async () => {
    if (!archivo) return
    if (mapeo.nombre === undefined) return setAviso("Elige qué columna tiene el nombre de los clientes.")
    setAviso("")
    setImportando(true)
    const resultado = await importarClientes(archivo.texto, mapeo)
    setImportando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    setResumen(resultado.datos)
    setArchivo(null)
  }

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Importar clientes"
        subtitulo="Desde un CSV: el que exporta tu sistema anterior (AgendaPro u otro) o una planilla de Excel."
        mostrarBusqueda={false}
      />

      <div className="space-y-4 px-4 pt-6 pb-10 sm:space-y-6 sm:px-6">
        <Boton href="/dashboard/clientes" variante="fantasma" tamano="sm" icono={<ArrowLeft aria-hidden="true" strokeWidth={1.75} />}>
          Volver a Clientes
        </Boton>

        {status !== "loading" && !puede ? (
          <Aviso tono="info">Sólo el dueño y el encargado pueden importar clientes.</Aviso>
        ) : (
          <>
            {resumen && <ResumenDeImportacion resumen={resumen} />}

            <Tarjeta como="section" className="space-y-4 p-5 sm:p-6" aria-labelledby="titulo-archivo">
              <div>
                <h2 id="titulo-archivo" className="font-medium text-navy">
                  {resumen ? "Importar otro archivo" : "Elige el archivo"}
                </h2>
                <p className="mt-1 text-sm text-texto-2">
                  Un CSV de hasta 2 MB y {FILAS_MAXIMAS.toLocaleString("es-CL")} filas, con una primera fila de
                  títulos. No se crean clientes repetidos: si el teléfono o el correo ya están en Eli (o más arriba en el
                  archivo), la fila se omite.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* El input queda invisible pero enfocable: la etiqueta con forma de botón lo abre. */}
                <label htmlFor={idDelArchivo} className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "cursor-pointer gap-2" })}>
                  <Upload className="size-4" aria-hidden="true" strokeWidth={1.75} />
                  Elegir archivo CSV
                </label>
                <input
                  id={idDelArchivo}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    elegirArchivo(e.target.files?.[0])
                    // Así elegir el mismo archivo otra vez también lo vuelve a leer.
                    e.target.value = ""
                  }}
                />
                {archivo && <span className="text-sm text-texto-2">{archivo.nombre}</span>}
              </div>
            </Tarjeta>

            {aviso && <Aviso>{aviso}</Aviso>}

            {archivo && (
              <>
                <VistaPrevia filas={archivo.filas} mapeo={mapeo} alCambiarMapeo={cambiarMapeo} />
                <Boton type="button" className="w-full sm:w-auto" cargando={importando} onClick={importar}>
                  Importar clientes
                </Boton>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
