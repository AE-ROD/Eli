/**
 * Leer y escribir CSV sin librerías. Lo usan la importación de clientes (en el
 * navegador para la vista previa y en el servidor para validar) y las
 * exportaciones.
 *
 * Al leer: RFC 4180 (comillas dobles para un campo con separador, salto de
 * línea o comillas, y `""` para una comilla adentro), con el separador que se
 * detecte (`,`, `;` o tabulación) y saltos de línea de Windows o Unix.
 *
 * Al escribir: lo que abre bien Excel en español. Separador `;` (la coma es el
 * decimal), UTF-8 con BOM (sin él, Excel lo lee como Latin-1 y rompe las
 * tildes) y celdas protegidas contra fórmulas.
 */

export type Separador = "," | ";" | "\t"

const SEPARADORES: readonly Separador[] = [";", ",", "\t"]

const BOM = "\uFEFF"

/**
 * Los bytes de un archivo, como texto. UTF-8 (con o sin BOM) es lo esperado.
 * Si no es UTF-8 válido, se lee como Windows-1252: es lo que guarda Excel en
 * español con "CSV (delimitado por comas)", y sin esto "Muñoz" llegaría como
 * "Mu�oz".
 */
export function decodificarCsv(bytes: Uint8Array): string {
  let texto: string
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes)
  }
  return texto.startsWith(BOM) ? texto.slice(BOM.length) : texto
}

/**
 * El separador del archivo, mirando la primera línea (la cabecera): el que más
 * aparece fuera de comillas. Si no aparece ninguno (una sola columna), coma.
 * Ante un empate gana `;`, que es el de Excel en español.
 */
export function detectarSeparador(texto: string): Separador {
  const cuenta: Record<Separador, number> = { ";": 0, ",": 0, "\t": 0 }
  let entreComillas = false
  for (const caracter of texto) {
    if (caracter === '"') entreComillas = !entreComillas
    else if (!entreComillas && (caracter === "\n" || caracter === "\r")) break
    else if (!entreComillas && caracter in cuenta) cuenta[caracter as Separador]++
  }
  let mejor: Separador = ","
  let maximo = 0
  for (const separador of SEPARADORES) {
    if (cuenta[separador] > maximo) {
      mejor = separador
      maximo = cuenta[separador]
    }
  }
  return mejor
}

/**
 * Las filas del CSV, cada una como sus celdas en texto. Sin BOM, y sin la
 * última fila si el archivo termina en un salto de línea. Una comilla sin
 * cerrar se lee hasta el final del archivo, como hace Excel.
 */
export function leerCsv(texto: string, separador: Separador = detectarSeparador(texto)): string[][] {
  const fuente = texto.startsWith(BOM) ? texto.slice(BOM.length) : texto
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ""
  let entreComillas = false

  for (let i = 0; i < fuente.length; i++) {
    const caracter = fuente[i]

    if (entreComillas) {
      if (caracter === '"') {
        if (fuente[i + 1] === '"') {
          celda += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        celda += caracter
      }
      continue
    }

    if (caracter === '"' && celda === "") {
      entreComillas = true
    } else if (caracter === separador) {
      fila.push(celda)
      celda = ""
    } else if (caracter === "\n" || caracter === "\r") {
      if (caracter === "\r" && fuente[i + 1] === "\n") i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ""
    } else {
      celda += caracter
    }
  }

  if (celda !== "" || fila.length > 0 || entreComillas) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas
}

/** Lo que una planilla lee como fórmula si la celda empieza con eso. */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/

/**
 * El texto de una celda, a salvo de la inyección de fórmulas: si empieza con
 * `=`, `+`, `-`, `@`, tabulación o retorno, se le antepone `'`, y Excel lo
 * muestra como texto en vez de ejecutarlo. Un cliente que se registra como
 * `=HYPERLINK("http://...")` no se vuelve un enlace en la planilla del dueño.
 *
 * Un número no se toca: un monto negativo no es una fórmula.
 */
export function celdaSegura(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ""
  if (typeof valor === "number") return String(valor)
  return INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor
}

/** La celda con comillas si lleva el separador, comillas o un salto de línea. */
function escapar(celda: string): string {
  return /[;"\r\n]/.test(celda) ? `"${celda.replace(/"/g, '""')}"` : celda
}

/**
 * El archivo CSV completo: BOM, separador `;`, cada celda protegida
 * (`celdaSegura`) y escapada, y saltos de línea `\r\n` como los de Excel.
 */
export function escribirCsv(filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  return BOM + filas.map((fila) => fila.map((valor) => escapar(celdaSegura(valor))).join(";")).join("\r\n") + "\r\n"
}
