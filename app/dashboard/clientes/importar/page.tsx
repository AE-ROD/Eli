"use client"

import { useId, useRef, useState, useSyncExternalStore } from "react"
import { useSession } from "next-auth/react"
import { ArrowLeft, BookUser, ClipboardList, Upload } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { actorDeSesion, puedeImportarExportarClientes } from "@/lib/permisos"
import { decodificarCsv, leerCsv } from "@/lib/csv"
import { vcardACsv } from "@/lib/vcard"
import { contactosACsv, contactosDelSelector, leerListaEscrita, selectorDeContactos, type ContactosLeidos } from "@/lib/contactos"
import { CAMPO, ETIQUETA, RELLENO_DE_TARJETA } from "@/components/panel/estilos"
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
  return /\.(vcf|vcard)$/i.test(archivo.name) || /^text\/(x-)?(vcard|directory)$/.test(archivo.type)
}

/** Un archivo de contactos que llegó sin extensión ni tipo: empieza con `BEGIN:VCARD`. */
async function empiezaComoVcard(archivo: File): Promise<boolean> {
  try {
    const inicio = await archivo.slice(0, 64).text()
    return /^\uFEFF?\s*BEGIN:VCARD/i.test(inicio)
  } catch {
    return false
  }
}

/** Un CSV por su extensión o por su tipo: Windows a veces lo declara como de Excel, o sin tipo. */
function pareceCsv(archivo: File): boolean {
  return archivo.name.toLowerCase().endsWith(".csv") || archivo.type.startsWith("text/")
}

/** iPhone, iPod o iPad (que en iPadOS se presenta como un Mac con pantalla táctil). */
function esUnIphone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

/** Que haya agenda no cambia mientras la página está abierta: no hay a qué suscribirse. */
const sinSuscripcion = () => () => {}

/**
 * Un .vcf puede pesar mucho más que el CSV que resulta de él: cada contacto
 * trae su foto en base64. Se acepta hasta este tamaño y el tope de 2 MB se
 * mide sobre el CSV ya convertido, que es lo que viaja al servidor.
 */
const TAMAÑO_MAXIMO_DEL_VCF_EN_BYTES = 25 * 1024 * 1024

/**
 * Importar clientes de tres formas, de la más simple a la más completa:
 * elegirlos de la agenda del teléfono (donde el navegador lo permite: Chrome en
 * Android), escribir o pegar una lista, o subir un CSV o un .vcf. Las tres
 * terminan en el mismo CSV: se revisa qué columna es cada dato con una vista
 * previa, y el servidor crea los que no estén repetidos. El archivo se lee acá sólo para
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

  // El selector de contactos sólo existe en algunos navegadores (Chrome en
  // Android). En el servidor se pinta sin él y el navegador lo agrega al hidratar.
  const hayAgenda = useSyncExternalStore(sinSuscripcion, () => selectorDeContactos() !== null, () => false)
  // En iPhone el camino de la app Contactos va primero y con los pasos a la vista.
  const esIphone = useSyncExternalStore(sinSuscripcion, esUnIphone, () => false)
  const [lista, setLista] = useState("")
  const idDeLaLista = useId()
  const revision = useRef<HTMLDivElement>(null)

  // En el teléfono la revisión queda más abajo: se lleva la vista hasta ella.
  const llevarALaRevision = () =>
    requestAnimationFrame(() => revision.current?.scrollIntoView({ behavior: "smooth", block: "start" }))

  const empezarDeNuevo = () => {
    setAviso("")
    setNota("")
    setResumen(null)
    setArchivo(null)
  }

  /**
   * Lo que viene de la agenda o de la lista ya es un CSV de importación: pasa
   * por los mismos topes que un archivo y queda listo para revisar.
   */
  const cargarContactos = (origen: string, leidos: ContactosLeidos) => {
    if (leidos.contactos === 0) return setAviso(frases.sinContactos)
    if (new TextEncoder().encode(leidos.csv).byteLength > TAMAÑO_MAXIMO_EN_BYTES || leidos.contactos > FILAS_MAXIMAS) {
      return setAviso("Son demasiados contactos para una sola vez. Tráelos en partes.")
    }
    const filas = leerCsv(leidos.csv)
    setArchivo({ nombre: origen, texto: leidos.csv, filas })
    setMapeo(sugerirMapeo(filas[0]) ?? {})
    if (leidos.sinNombre > 0) setNota(frases.contactosSinNombre(leidos.sinNombre))
    llevarALaRevision()
  }

  const elegirDeLaAgenda = async () => {
    empezarDeNuevo()
    const selector = selectorDeContactos()
    if (!selector) return setAviso(frases.contactos.noSeAbrio)
    let elegidos
    try {
      elegidos = await selector.select(["name", "tel", "email"], { multiple: true })
    } catch {
      return setAviso(frases.contactos.noSeAbrio)
    }
    // Cerrar la agenda sin elegir no es un error: no se dice nada.
    if (!elegidos || elegidos.length === 0) return
    cargarContactos(frases.origen.contactos(elegidos.length), contactosACsv(contactosDelSelector(elegidos)))
  }

  const revisarLista = () => {
    empezarDeNuevo()
    const contactos = leerListaEscrita(lista)
    if (contactos.length === 0) return setAviso(frases.escribir.vacia)
    cargarContactos(frases.origen.lista, contactosACsv(contactos))
  }

  const elegirArchivo = async (elegido: File | undefined) => {
    empezarDeNuevo()
    if (!elegido) return

    // El iPhone a veces entrega los contactos sin extensión ni tipo: se mira el contenido.
    const esVcf = pareceVcf(elegido) || (await empiezaComoVcard(elegido))
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
    llevarALaRevision()
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
    setLista("")
  }

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo={frases.titulo}
        subtitulo="Desde los contactos de tu teléfono, escribiendo una lista o con un archivo de tu sistema anterior."
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

            {/* Un solo selector de archivo, invisible pero enfocable: las etiquetas con forma de botón lo abren. */}
            <input
              id={idDelArchivo}
              type="file"
              // En iPhone sin filtro: Safari traduce mal los tipos y deja el .vcf en gris,
              // sin poder tocarlo. Qué archivo sirve lo decide `elegirArchivo` al leerlo.
              accept={esIphone ? undefined : ".csv,text/csv,.vcf,.vcard,text/vcard,text/x-vcard"}
              className="sr-only"
              onChange={(e) => {
                void elegirArchivo(e.target.files?.[0])
                // Así elegir el mismo archivo otra vez también lo vuelve a leer.
                e.target.value = ""
              }}
            />

            {hayAgenda && (
              <Tarjeta como="section" className={`space-y-4 ${RELLENO_DE_TARJETA}`} aria-labelledby="titulo-agenda">
                <div>
                  <h2 id="titulo-agenda" className="font-medium text-navy">{frases.contactos.titulo}</h2>
                  <p className="mt-1 text-sm text-texto-2">{frases.contactos.ayuda}</p>
                </div>
                <Boton type="button" className="w-full sm:w-auto" icono={<BookUser aria-hidden="true" strokeWidth={1.75} />} onClick={() => void elegirDeLaAgenda()}>
                  {frases.contactos.boton}
                </Boton>
              </Tarjeta>
            )}

            {esIphone && (
              <Tarjeta como="section" className={`space-y-4 ${RELLENO_DE_TARJETA}`} aria-labelledby="titulo-iphone">
                <h2 id="titulo-iphone" className="font-medium text-navy">{frases.iphone.titulo}</h2>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-texto-2">
                  {frases.iphone.pasos.map((paso) => (
                    <li key={paso}>{paso}</li>
                  ))}
                </ol>
                <label htmlFor={idDelArchivo} className={clasesDeBoton({ className: "w-full cursor-pointer gap-2 sm:w-auto" })}>
                  <BookUser className="size-4" aria-hidden="true" strokeWidth={1.75} />
                  {frases.iphone.boton}
                </label>
              </Tarjeta>
            )}

            {!esIphone && (
              <Tarjeta como="section" className={`space-y-4 ${RELLENO_DE_TARJETA}`} aria-labelledby="titulo-archivo">
                <div>
                  <h2 id="titulo-archivo" className="font-medium text-navy">
                    {frases.archivo.titulo}
                  </h2>
                  <p className="mt-1 text-sm text-texto-2">
                    {frases.ayuda(FILAS_MAXIMAS.toLocaleString("es-CL"))}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={idDelArchivo} className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "cursor-pointer gap-2" })}>
                    <Upload className="size-4" aria-hidden="true" strokeWidth={1.75} />
                    Elegir archivo
                  </label>
                </div>
              </Tarjeta>
            )}

            {/* Para unos pocos, sin archivo: queda plegado para no competir con la agenda. */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-navy">{frases.escribir.titulo}</summary>
              <div className="mt-3">
                <Tarjeta className={`space-y-4 ${RELLENO_DE_TARJETA}`}>
                  <p className="text-sm text-texto-2">{frases.escribir.ayuda}</p>
                  <div>
                    <label htmlFor={idDeLaLista} className={ETIQUETA}>
                      Nombre y teléfono, uno por línea
                    </label>
                    <textarea
                      id={idDeLaLista}
                      rows={5}
                      value={lista}
                      onChange={(e) => setLista(e.target.value)}
                      placeholder={frases.escribir.ejemplo}
                      className={CAMPO}
                      autoComplete="off"
                    />
                  </div>
                  <Boton type="button" variante="secundario" tamano="sm" className="gap-2" icono={<ClipboardList aria-hidden="true" strokeWidth={1.75} />} onClick={revisarLista}>
                    {frases.escribir.boton}
                  </Boton>
                </Tarjeta>
              </div>
            </details>

            {aviso && <Aviso>{aviso}</Aviso>}
            {nota && <Aviso tono="info">{nota}</Aviso>}

            <div ref={revision} className="scroll-mt-4 space-y-4 sm:space-y-6">
              {archivo && (
                <>
                  <p className="text-sm text-texto-2">
                    Revisando: <span className="font-medium text-navy">{archivo.nombre}</span>
                  </p>
                  <VistaPrevia filas={archivo.filas} mapeo={mapeo} alCambiarMapeo={cambiarMapeo} />
                  <Boton type="button" className="w-full sm:w-auto" cargando={importando} onClick={importar}>
                    {frases.titulo}
                  </Boton>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
