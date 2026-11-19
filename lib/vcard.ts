/**
 * Contactos del teléfono (.vcf, vCard) a un CSV que la importación de clientes
 * ya sabe leer. Así los contactos pasan por lo mismo que cualquier planilla: la
 * vista previa, la detección de repetidos, los topes y la validación del
 * servidor, sin una ruta nueva.
 *
 * Es lógica pura, sin pantalla: se llama en el navegador al elegir el archivo.
 * De cada contacto se toma el nombre, un teléfono (el celular si hay varios) y
 * un correo. Un contacto sin nombre no se importa: sólo con un número no hay a
 * quién llamar, y el cliente quedaría con un teléfono como nombre.
 */

import { contactosACsv, type Contacto, type ContactosLeidos } from "./contactos"

export type { ContactosLeidos }

interface Propiedad {
  nombre: string
  parametros: string[]
  valor: string
}

/** Lo que \n, \, y \; significan dentro de un valor vCard. */
function desescapar(valor: string): string {
  return valor.replace(/\\([nN,;\\])/g, (_, letra: string) => (letra === "n" || letra === "N" ? "\n" : letra)).trim()
}

/** vCard 2.1 (Androids viejos) escribe los acentos como `=C3=A1`: son bytes UTF-8 en hexadecimal. */
function decodificarQuotedPrintable(valor: string): string {
  const bytes: number[] = []
  for (let i = 0; i < valor.length; i++) {
    const hex = valor.slice(i + 1, i + 3)
    if (valor[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(...new TextEncoder().encode(valor[i]))
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes))
}

/** Une las líneas continuadas: las que empiezan con espacio o tabulación (vCard 3/4) y las de quoted-printable que terminan en `=`. */
function lineasLogicas(texto: string): string[] {
  const fisicas = texto.replace(/\r\n?/g, "\n").split("\n")
  const logicas: string[] = []
  let continuaQp = false
  for (const linea of fisicas) {
    const anterior = logicas.length - 1
    if (continuaQp) {
      logicas[anterior] = logicas[anterior].slice(0, -1) + linea
    } else if (/^[ \t]/.test(linea) && anterior >= 0) {
      logicas[anterior] += linea.slice(1)
    } else {
      logicas.push(linea)
    }
    const actual = logicas[logicas.length - 1]
    continuaQp = /ENCODING=QUOTED-PRINTABLE/i.test(actual.split(":")[0] ?? "") && actual.endsWith("=")
  }
  return logicas
}

function leerPropiedad(linea: string): Propiedad | null {
  const dosPuntos = linea.indexOf(":")
  if (dosPuntos < 1) return null
  const [izquierda, ...parametros] = linea.slice(0, dosPuntos).split(";")
  // `item1.TEL`: el prefijo de grupo que agregan iOS y Google no es parte del nombre.
  const nombre = izquierda.replace(/^[^.]*\./, "").toUpperCase()
  let valor = linea.slice(dosPuntos + 1)
  if (parametros.some((parametro) => /^ENCODING=QUOTED-PRINTABLE$/i.test(parametro))) {
    valor = decodificarQuotedPrintable(valor)
  }
  return { nombre, parametros: parametros.map((parametro) => parametro.toUpperCase()), valor }
}

/** `TEL;TYPE=CELL`, `TEL;CELL`, `TEL;type=pref,cell` y `TEL;TYPE="cell"`: todos son un celular. */
function esCelular(propiedad: Propiedad): boolean {
  return propiedad.parametros.some((parametro) => /(^|[=,"])(CELL|MOBILE|IPHONE)($|[,"])/.test(parametro))
}

function nombreDelContacto(propiedades: Propiedad[]): string {
  const completo = propiedades.find((propiedad) => propiedad.nombre === "FN")
  if (completo && desescapar(completo.valor)) return desescapar(completo.valor)
  // Sin nombre completo: `N` es "Apellido;Nombre;Segundo;Prefijo;Sufijo".
  const estructurado = propiedades.find((propiedad) => propiedad.nombre === "N")
  if (!estructurado) return ""
  const [apellido = "", nombre = ""] = estructurado.valor.split(";").map(desescapar)
  return [nombre, apellido].filter(Boolean).join(" ")
}

function telefonoDelContacto(propiedades: Propiedad[]): string {
  const telefonos = propiedades.filter((propiedad) => propiedad.nombre === "TEL" && desescapar(propiedad.valor))
  const elegido = telefonos.find(esCelular) ?? telefonos[0]
  // Algunos teléfonos guardan `tel:+56...` como URI.
  return elegido ? desescapar(elegido.valor).replace(/^tel:/i, "") : ""
}

function correoDelContacto(propiedades: Propiedad[]): string {
  const correo = propiedades.find((propiedad) => propiedad.nombre === "EMAIL" && desescapar(propiedad.valor))
  return correo ? desescapar(correo.valor) : ""
}

/** Los contactos de un archivo .vcf (uno o muchos) como un CSV de importación. */
export function vcardACsv(texto: string): ContactosLeidos {
  const contactos: Contacto[] = []
  let actual: Propiedad[] | null = null

  for (const linea of lineasLogicas(texto)) {
    const marca = linea.trim().toUpperCase()
    if (marca === "BEGIN:VCARD") {
      actual = []
    } else if (marca === "END:VCARD") {
      if (actual) {
        contactos.push({ nombre: nombreDelContacto(actual), telefono: telefonoDelContacto(actual), correo: correoDelContacto(actual) })
      }
      actual = null
    } else if (actual) {
      const propiedad = leerPropiedad(linea)
      if (propiedad) actual.push(propiedad)
    }
  }

  return contactosACsv(contactos)
}
