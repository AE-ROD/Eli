"use client"

import { useId, useState } from "react"
import { useSession } from "next-auth/react"
import { ArrowLeft, Upload } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { actorDeSesion, puedeImportarExportarClientes } from "@/lib/permisos"
import { decodificarCsv, leerCsv } from "@/lib/csv"
import { vcardACsv } from "@/lib/vcard"
import { FILAS_MAXIMAS, TAMAÑO_MAXIMO_EN_BYTES, sugerirMapeo, type CampoDeImportacion } from "@/lib/importar-clientes"
import { vocabularioDe } from "@/lib/vocabulario"
import { importarClientes, type ResumenDeImportacion as Resumen } from "../_datos"
import { frasesDeClientes } from "../_frases"
import { VistaPrevia, type MapeoEnPantalla } from "./_componentes/vista-previa"
import { ResumenDeImportacion } from "./_componentes/resumen-de-importacion"

interface ArchivoLeido {
  nombre: string
  texto: string
  filas: string[][]
}

/** Contactos del teléfono (vCard): por su extensión o por su tipo. */
function pareceVcf(archivo: File): boolean {
  return archivo.name.toLowerCase().endsWith(".vcf") || /^text\/(x-)?vcard$/.test(archivo.type)
}

/** Un CSV por su extensión o por su tipo: Windows a veces lo declara como de Excel, o sin tipo. */
function pareceCsv(archivo: File): boolean {
  return archivo.name.toLowerCase().endsWith(".csv") || archivo.type.startsWith("text/")
}

/**
 * Un .vcf puede pesar mucho más que el CSV que resulta de él: cada contacto
 * trae su foto en base64. Se acepta hasta este tamaño y el tope de 2 MB se
 * mide sobre el CSV ya convertido, que es lo que viaja al servidor.
 */
const TAMAÑO_MAXIMO_DEL_VCF_EN_BYTES = 25 * 1024 * 1024

/**
 * Importar clientes desde un CSV o desde los contactos del teléfono (.vcf):
 * se elige el archivo, se revisa qué columna es cada dato con una vista previa, y el
 * servidor crea los que no estén repetidos. El archivo se lee acá sólo para
 * mostrarlo; el servidor lo vuelve a leer y valida cada fila.
 */
export default function PaginaImportarClientes() {
  const { data: sesion, status } = useSession()
  const puede = puedeImportarExportarClientes(actorDeSesion(sesion))
  // "Pacientes" en una clínica dental.
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const frases = frasesDeClientes(palabras).importar
  const idDelArchivo = useId()

  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null)
  const [mapeo, setMapeo] = useState<MapeoEnPantalla>({})
  const [aviso, setAviso] = useState("")
  // Lo que se dice sin que sea un problema: contactos que se dejaron fuera por no tener nombre.
  const [nota, setNota] = useState("")
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)

  const elegirArchivo = async (elegido: File | undefined) => {
    setAviso("")
    setNota("")
    setResumen(null)
    setArchivo(null)
    if (!elegido) return

    const esVcf = pareceVcf(elegido)
    if (!esVcf && !pareceCsv(elegido)) return setAviso(frases.archivoNoValido)
    const tope = esVcf ? TAMAÑO_MAXIMO_DEL_VCF_EN_BYTES : TAMAÑO_MAXIMO_EN_BYTES
    if (elegido.size > tope) {
      return setAviso(esVcf ? "El archivo de contactos pesa más de 25 MB. Expórtalo en partes." : "El archivo pesa más de 2 MB. Divídelo en partes.")
    }

    // Leer el archivo puede fallar (se movió o se borró después de elegirlo,
    // o el navegador no lo deja leer): se dice, en vez de quedar sin respuesta.
    let texto: string
    let filas: string[][]
    let contactosSinNombre = 0
    try {
      texto = decodificarCsv(new Uint8Array(await elegido.arrayBuffer()))
      if (esVcf) {
        // Los contactos se vuelven un CSV (nombre, teléfono, correo) y siguen por lo mismo que cualquier planilla.
        const contactos = vcardACsv(texto)
        if (contactos.contactos === 0) return setAviso(frases.sinContactos)
        contactosSinNombre = contactos.sinNombre
        texto = contactos.csv
        if (new TextEncoder().encode(texto).byteLength > TAMAÑO_MAXIMO_EN_BYTES) {
          return setAviso("Son demasiados contactos para una sola vez. Expórtalos en partes.")
        }
      }
      filas = leerCsv(texto)
    } catch {
      return setAviso("No se pudo leer el archivo. Vuelve a elegirlo; si sigue sin leerse, guárdalo otra vez como CSV.")
    }
    if (filas.length < 2) return setAviso(frases.sinFilas)
    if (filas.length - 1 > FILAS_MAXIMAS) {
      return setAviso(`El archivo tiene más de ${FILAS_MAXIMAS.toLocaleString("es-CL")} filas. Divídelo en partes.`)
    }

    setArchivo({ nombre: elegido.name, texto, filas })
    setMapeo(sugerirMapeo(filas[0]) ?? {})
    if (contactosSinNombre > 0) setNota(frases.contactosSinNombre(contactosSinNombre))
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
    if (mapeo.nombre === undefined) return setAviso(frases.elegirLaColumna)
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
        titulo={frases.titulo}
        subtitulo="Desde un CSV (el que exporta tu sistema anterior o una planilla de Excel) o desde los contactos de tu teléfono."
        mostrarBusqueda={false}
      />

      <div className="space-y-4 px-4 pt-6 pb-10 sm:space-y-6 sm:px-6">
        <Boton href="/dashboard/clientes" variante="fantasma" tamano="sm" icono={<ArrowLeft aria-hidden="true" strokeWidth={1.75} />}>
          {frases.volver}
        </Boton>

        {status !== "loading" && !puede ? (
          <Aviso tono="info">{frases.soloQuienPuede}</Aviso>
        ) : (
          <>
            {resumen && <ResumenDeImportacion resumen={resumen} palabras={palabras} />}

            <Tarjeta como="section" className="space-y-4 p-5 sm:p-6" aria-labelledby="titulo-archivo">
              <div>
                <h2 id="titulo-archivo" className="font-medium text-navy">
                  {resumen ? "Importar otro archivo" : "Elige el archivo"}
                </h2>
                <p className="mt-1 text-sm text-texto-2">
                  {frases.ayuda(FILAS_MAXIMAS.toLocaleString("es-CL"))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* El input queda invisible pero enfocable: la etiqueta con forma de botón lo abre. */}
                <label htmlFor={idDelArchivo} className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "cursor-pointer gap-2" })}>
                  <Upload className="size-4" aria-hidden="true" strokeWidth={1.75} />
                  Elegir archivo
                </label>
                <input
                  id={idDelArchivo}
                  type="file"
                  accept=".csv,text/csv,.vcf,text/vcard,text/x-vcard"
                  className="sr-only"
                  onChange={(e) => {
                    void elegirArchivo(e.target.files?.[0])
                    // Así elegir el mismo archivo otra vez también lo vuelve a leer.
                    e.target.value = ""
                  }}
                />
                {archivo && <span className="text-sm text-texto-2">{archivo.nombre}</span>}
              </div>
            </Tarjeta>

            {aviso && <Aviso>{aviso}</Aviso>}
            {nota && <Aviso tono="info">{nota}</Aviso>}

            {archivo && (
              <>
                <VistaPrevia filas={archivo.filas} mapeo={mapeo} alCambiarMapeo={cambiarMapeo} />
                <Boton type="button" className="w-full sm:w-auto" cargando={importando} onClick={importar}>
                  {frases.titulo}
                </Boton>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
