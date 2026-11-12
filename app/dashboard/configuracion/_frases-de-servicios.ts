/**
 * Las frases de la lista de servicios y de la "Carga rápida" de Configuración,
 * con las palabras del rubro (`vocabularioDe(rubro).palabras`) y la
 * concordancia de `lib/concordancia.ts`: "servicios" en un salón,
 * "prestaciones" en una clínica dental; "Ya lo tienes" / "Ya la tienes";
 * "3 seleccionados" / "3 seleccionadas". Ninguna pega un artículo, un
 * pronombre ni un adjetivo a una palabra del vocabulario.
 *
 * Es lógica sin pantalla: `_frases.ts` las suma a `frasesDeConfiguracion(...)
 * .servicios`. Y como los avisos de un pedido que falló dependen del código
 * con que respondió el servidor, `errorDeLote` elige el mensaje por código,
 * como `mensajeDeErrorDeFoto` (`lib/enviar-foto.ts`).
 */

import { cantidadDe, concordar, el, numeroDe, ningun, pronombreDe, todos, un, unoDe } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"
import type { ResumenDeCarga, ServicioOmitido } from "@/lib/carga-de-servicios"
import { MOTIVO_REPETIDO_EN_EL_ARCHIVO, MOTIVO_REPETIDO_EN_EL_LOTE, MOTIVO_YA_EXISTE } from "@/lib/servicios-en-lote"

/** Qué se intentaba hacer cuando el servidor respondió con un error. */
export type AccionDeLote = "agregar" | "cambiar" | "renombrar" | "sugeridos" | "leer"

/** Cuántos omitidos se nombran en el aviso; el resto se cuenta ("y 3 más"). */
export const OMITIDOS_A_NOMBRAR = 8

export type TonoDelResumen = "listo" | "atencion" | "error"

export interface ResumenParaMostrar {
  tono: TonoDelResumen
  titulo: string
  /** Una línea por servicio omitido, con su motivo. */
  detalles: string[]
}

export function frasesDeLosServicios(palabras: PalabrasDelRubro) {
  const { servicio, servicioDeLaReserva } = palabras
  const plural = servicio.plural
  const cuantos = (n: number) => cantidadDe(n, servicio)
  /** "Se activó" / "Se activaron": el verbo concuerda con la cantidad. */
  const seHizo = (n: number, singular: string, plural_: string) => (n === 1 ? singular : plural_)
  const seleccionados = (n: number) => `${n} ${concordar("seleccionado", servicio, numeroDe(n))}`

  /** El motivo de un servicio que no se pudo agregar, en las palabras del rubro y sin el "Fila 7: " de la planilla. */
  const motivo = (texto: string): string => {
    if (texto === MOTIVO_YA_EXISTE) return `Ya existe ${un(servicio)} con ese nombre`
    if (texto === MOTIVO_REPETIDO_EN_EL_ARCHIVO) return "Repetido en el archivo"
    if (texto === MOTIVO_REPETIDO_EN_EL_LOTE) return "Repetido en la lista"
    return conMayuscula(texto.replace(/^Fila \d+: /, "").trim())
  }

  /**
   * El mensaje de un pedido de servicios en lote que falló. El que mandó el
   * servidor gana (viene en español y dice el motivo exacto: "Se pueden tener
   * hasta 300…"), salvo el 500, cuyo texto es genérico. Sin él, uno por código
   * que la persona pueda entender: un 429 o un 503 suelen llegar de un proxy,
   * sin el cuerpo de la API.
   */
  const errorDeLote = (codigo: number | null, delServidor: string, accion: AccionDeLote): string => {
    const mensaje = delServidor.trim()
    if (mensaje && codigo !== 500) return mensaje
    switch (codigo) {
      case 401:
        return "Tu sesión terminó o no tienes permiso para hacer este cambio. Vuelve a entrar e inténtalo de nuevo."
      case 400:
      case 422:
        return `Algo de lo que enviaste no se pudo leer. Revisa ${el(servicio, "plural")} e inténtalo de nuevo.`
      case 404:
        return "No se encontró lo que querías cambiar. Recarga la página e inténtalo de nuevo."
      case 409:
        return `Tu negocio llegó al máximo de ${plural}. Elimina ${el(servicio, "plural")} que ya no uses y vuelve a intentarlo.`
      case 413:
        return "Es demasiado para enviar de una vez. Prueba con menos filas."
      case 429:
        return "Hiciste varios cambios seguidos. Espera un momento e inténtalo de nuevo."
      case 503:
        return "Por ahora no se puede hacer este cambio. Inténtalo más tarde."
      default:
        switch (accion) {
          case "agregar":
            return `No se pudieron agregar ${el(servicio, "plural")}. Inténtalo de nuevo.`
          case "cambiar":
            return `No se pudieron cambiar ${el(servicio, "plural")}. Inténtalo de nuevo.`
          case "renombrar":
            return "No se pudo cambiar la categoría. Inténtalo de nuevo."
          case "sugeridos":
            return `No se pudieron cargar ${el(servicio, "plural")} sugeridos. Inténtalo de nuevo.`
          case "leer":
            return "No se pudo actualizar la lista. Recarga la página para verla al día."
        }
    }
  }

  /** Lo que se dice al terminar una carga, juntando todas sus tandas. */
  const resumenDeCarga = (resumen: ResumenDeCarga): ResumenParaMostrar => {
    const omitidos = resumen.omitidos
    const detalles = [
      ...omitidos.slice(0, OMITIDOS_A_NOMBRAR).map((o: ServicioOmitido) => `${o.name || `Fila ${o.fila}`}: ${motivo(o.motivo)}`),
      ...(omitidos.length > OMITIDOS_A_NOMBRAR ? [`y ${omitidos.length - OMITIDOS_A_NOMBRAR} más`] : []),
    ]
    const agregados =
      resumen.creados > 0 ? `${conMayuscula(`se ${seHizo(resumen.creados, "agregó", "agregaron")} ${cuantos(resumen.creados)}`)}.` : `No se agregó ${ningun(servicio)}.`

    if (resumen.error !== null) {
      const noLlegaron = resumen.sinEnviar > 0 ? ` No se pudieron agregar ${cuantos(resumen.sinEnviar)}.` : ""
      return {
        tono: "error",
        titulo: resumen.creados > 0 ? `${agregados}${noLlegaron} ${resumen.error}` : resumen.error,
        detalles,
      }
    }
    if (omitidos.length === 0) return { tono: resumen.creados > 0 ? "listo" : "atencion", titulo: agregados, detalles }

    const todosYaExistian = omitidos.every((o) => o.motivo === MOTIVO_YA_EXISTE)
    const sePasaron = `Se ${seHizo(omitidos.length, "omitió", "omitieron")} ${omitidos.length}${
      todosYaExistian ? ` porque ya ${seHizo(omitidos.length, "existía", "existían")}` : ""
    }.`
    return { tono: "atencion", titulo: `${agregados} ${sePasaron}`, detalles }
  }

  return {
    /** El estado vacío: invita a la carga rápida. */
    sinServicios: {
      titulo: `Sin ${plural} aún`,
      /** "Agrega los servicios que ofreces de una vez con la carga rápida, o crea un servicio nuevo." */
      ayuda: `Agrega ${el(servicio, "plural")} que ofreces de una vez con la carga rápida, o crea ${un(servicio)} a la vez.`,
    },

    lista: {
      buscar: "Buscar",
      buscarAyuda: "Nombre o categoría",
      mostrar: "Mostrar",
      estados: { todos: "Todos", activos: "Activos", inactivos: "Inactivos" },
      sinCategoria: "Sin categoría",
      inactivo: "Inactivo",
      /** Lo que lee el lector de pantalla al filtrar: "Mostrando 5 de 40 servicios". */
      mostrando: (visibles: number, total: number): string => `Mostrando ${visibles} de ${cuantos(total)}`,
      sinResultados: {
        titulo: `${conMayuscula(ningun(servicio))} coincide`,
        ayuda: "Prueba con otra búsqueda o quita los filtros.",
        quitar: "Quitar filtros",
      },
      /** El título plegable de una categoría; el conteo lo lee el lector de pantalla. */
      cuantos: cuantos,
      renombrar: "Renombrar categoría",
      renombrarLa: (categoria: string): string => `Renombrar la categoría ${categoria}`,
    },

    seleccion: {
      activar: "Seleccionar",
      salir: "Cancelar selección",
      /** "Seleccionar Corte". */
      marcar: (nombre: string): string => `Seleccionar ${nombre}`,
      marcarCategoria: (categoria: string): string => `Seleccionar toda la categoría ${categoria}`,
      /** "Seleccionar todos los servicios" / "Seleccionar todas las prestaciones" (los que se ven). */
      marcarTodos: `Seleccionar ${todos(servicio)}`,
      desmarcarTodos: `Quitar la selección`,
      seleccionados,
      /** El aviso de la barra mientras no hay ninguno marcado. */
      ninguno: `Marca ${el(servicio, "plural")} que quieras cambiar`,
      etiquetaDeLaBarra: "Acciones sobre la selección",
      /** Lo que se dice si el servidor no cambió ninguno. */
      sinCambios: `No se cambió ${ningun(servicio)}.`,
      acciones: { categoria: "Cambiar categoría", activar: "Activar", desactivar: "Desactivar" },
    },

    cambiarCategoria: {
      titulo: "Cambiar categoría",
      /** "Elige la categoría para 3 servicios". */
      descripcion: (n: number): string => `Elige la categoría para ${cuantos(n)}.`,
      campo: "Categoría",
      ayuda: "Elige una que ya tienes o escribe una nueva. Si la dejas vacía, queda sin categoría.",
      existentes: "Tus categorías",
      confirmar: "Cambiar categoría",
      cancelar: "No cambiar",
      /** Lo que se dice si la que se escribió ya existe con otras mayúsculas. */
      seUsaLaExistente: (categoria: string): string => `Ya tienes la categoría «${categoria}»: se usará esa.`,
      resultado: (n: number, categoria: string | null): string =>
        categoria === null
          ? `Se quitó la categoría de ${cuantos(n)}.`
          : `Se cambió la categoría de ${cuantos(n)} a «${categoria}».`,
    },

    activarEnLote: {
      tituloActivar: (n: number): string => `¿Activar ${cuantos(n)}?`,
      tituloDesactivar: (n: number): string => `¿Desactivar ${cuantos(n)}?`,
      descripcionActivar: `Quien reserva por tu página volverá a ver ${el(servicioDeLaReserva, "plural")} que actives.`,
      descripcionDesactivar: `Quien reserva por tu página ya no verá ${el(servicioDeLaReserva, "plural")} que desactives. Puedes activar ${el(servicio, "plural")} de nuevo cuando quieras.`,
      confirmarActivar: "Activar",
      confirmarDesactivar: "Desactivar",
      cancelar: "No cambiar",
      resultadoActivar: (n: number): string => `Se ${seHizo(n, "activó", "activaron")} ${cuantos(n)}.`,
      resultadoDesactivar: (n: number): string => `Se ${seHizo(n, "desactivó", "desactivaron")} ${cuantos(n)}.`,
    },

    renombrarCategoria: {
      titulo: "Renombrar categoría",
      campo: "Nuevo nombre",
      /** "Cambia el nombre de «Color», que tiene 4 servicios." */
      descripcion: (categoria: string, n: number): string => `Cambia el nombre de «${categoria}», que tiene ${cuantos(n)}.`,
      confirmar: "Renombrar categoría",
      confirmarUnir: "Unir categorías",
      cancelar: "No cambiar",
      /** Qué va a pasar con el nombre que se escribió. */
      plan: {
        vacio: "Escribe el nuevo nombre.",
        igual: "Ya se llama así.",
        corregir: (nuevo: string): string => `Quedará escrita siempre como «${nuevo}».`,
        renombrar: (de: string, nuevo: string): string => `«${de}» pasará a llamarse «${nuevo}».`,
        /** "Ya existe «Corte» con 3 servicios: los de «Color» se unirán a ella." */
        unir: (de: string, nuevo: string, conLosDe: number): string =>
          `Ya existe una categoría «${nuevo}» con ${cuantos(conLosDe)}. Las dos se unirán en «${nuevo}» y «${de}» dejará de existir.`,
      },
      resultadoRenombrar: (de: string, nuevo: string, n: number): string =>
        `Se renombró la categoría «${de}» a «${nuevo}» (${cuantos(n)}).`,
      resultadoUnir: (de: string, nuevo: string, n: number): string =>
        `Se unió la categoría «${de}» con «${nuevo}»: ${cuantos(n)} ${seHizo(n, "pasó", "pasaron")} a «${nuevo}».`,
    },

    carga: {
      boton: "Carga rápida",
      titulo: "Carga rápida",
      descripcion: `Agrega varios ${plural} de una vez.`,
      cerrar: "Cerrar",
      pestanas: {
        etiqueta: "Cómo cargarlos",
        sugeridos: "Sugeridos de tu rubro",
        pegar: "Pegar o importar",
        varios: "Agregar varios",
      },
      /** La acción final de las tres pestañas. */
      agregar: (n: number): string => `Agregar ${cuantos(n)}`,
      agregando: "Agregando…",

      sugeridos: {
        intro: `Marca ${el(servicio, "plural")} que ofreces y toca el botón de abajo. Después puedes editar el nombre, la duración y el precio de cada ${unoDe(servicio)}.`,
        buscar: "Buscar",
        buscarAyuda: "Nombre o categoría",
        cargando: "Buscando los sugeridos de tu rubro…",
        reintentar: "Reintentar",
        vacio: { titulo: "Sin sugeridos", ayuda: "Todavía no tenemos sugeridos para tu rubro. Usa “Pegar o importar” o “Agregar varios”." },
        todosAgregados: "Ya tienes todos los sugeridos de tu rubro.",
        sinResultados: "Ningún sugerido coincide con tu búsqueda.",
        yaLoTienes: `Ya ${pronombreDe(servicio)} tienes`,
        marcarCategoria: (categoria: string): string => `Seleccionar toda la categoría ${categoria}`,
        marcarTodos: `Marcar ${todos(servicio)}`,
        desmarcarTodos: "Quitar las marcas",
        agregar: (n: number): string => `Agregar ${seleccionados(n)}`,
        marcaAlgo: `Marca ${el(servicio, "plural")} que quieras agregar.`,
        urgencia: "Urgencia",
        urgenciaAviso: "Las urgencias se agregan sin marcar: edítalas después y activa «Es una urgencia».",
      },

      pegar: {
        etiqueta: "Pega aquí tu planilla",
        instrucciones: [
          "Copia las filas desde Excel o Google Sheets y pégalas aquí, o elige un archivo CSV.",
          `Una fila por ${servicio.singular}, con estas columnas en este orden: nombre, duración (en minutos o como 1h30), precio, categoría y descripción. Sólo el nombre y la duración son obligatorios.`,
          "Si la primera fila tiene los títulos (Nombre, Duración, Precio, Categoría y Descripción), las columnas pueden ir en cualquier orden.",
        ],
        archivo: "Elegir archivo CSV",
        plantilla: "Descargar plantilla",
        nombreDeLaPlantilla: `plantilla-de-${plural.replace(/\s+/g, "-")}.csv`,
        archivoLeido: (nombre: string): string => `Archivo leído: ${nombre}`,
        errorDelArchivo: {
          grande: "El archivo pesa más de 2 MB. Divídelo en partes más chicas.",
          vacio: "El archivo está vacío.",
          excel: "Ese es un libro de Excel. Guárdalo como CSV (Archivo, Guardar como, CSV) o copia las filas y pégalas aquí.",
          ilegible: "No se pudo leer el archivo. Prueba guardándolo como CSV.",
        },
        sinTitulos: "No se encontraron los títulos de las columnas: cada fila se leyó como nombre, duración, precio, categoría y descripción, en ese orden.",
        vistaPrevia: "Vista previa",
        columnas: { fila: "Fila", nombre: "Nombre", duracion: "Duración", precio: "Precio", categoria: "Categoría", estado: "Estado" },
        listaParaAgregar: "Lista",
        sinPrecio: "Sin precio",
        /** "3 listos, 2 con problemas" / "3 listas, 2 con problemas". */
        cuenta: (listas: number, conProblemas: number): string =>
          `${listas} ${concordar("listo", servicio, numeroDe(listas))}, ${conProblemas} con ${conProblemas === 1 ? "problema" : "problemas"}`,
        recortada: (mostradas: number, total: number): string =>
          `Se muestran las primeras ${mostradas} filas de ${total}. Todas se revisan y se agregan igual.`,
        revision:
          "Esta revisión se hizo en tu navegador. Al agregar, el servidor vuelve a revisar cada fila y puede omitir alguna.",
        sinFilas: "Pega o elige un archivo para ver cómo quedaría.",
        motivo,
      },

      varios: {
        intro: `Escribe ${un(servicio)} por fila. También puedes pegar varias líneas desde una planilla en el nombre de una fila y se reparten solas.`,
        columnas: { nombre: "Nombre", duracion: "Duración", precio: "Precio", categoria: "Categoría" },
        agregarFila: "Agregar fila",
        quitarFila: (n: number): string => `Quitar la fila ${n}`,
        de: (campo: string, n: number): string => `${campo}, fila ${n}`,
        sinFilas: "No hay filas. Agrega una para empezar.",
        filasLlenas: (maximo: number): string => `La tabla admite hasta ${maximo} filas. Agrega estas y sigue con otras, o usa “Pegar o importar”.`,
        sinNada: `Escribe al menos ${un(servicio)}.`,
        revisa: (n: number): string => (n === 1 ? "Revisa la fila marcada antes de agregar." : `Revisa las ${n} filas marcadas antes de agregar.`),
        pegado: (repartidas: number, sinLeer: number, recortadas: number): string => {
          const partes = [`Se ${seHizo(repartidas, "repartió", "repartieron")} ${repartidas} ${repartidas === 1 ? "línea" : "líneas"} en la tabla.`]
          if (sinLeer > 0) partes.push(`${sinLeer} no ${sinLeer === 1 ? "se pudo" : "se pudieron"} leer.`)
          if (recortadas > 0) partes.push(`${recortadas} no ${recortadas === 1 ? "entró" : "entraron"}: la tabla tiene un máximo de filas.`)
          return partes.join(" ")
        },
        pegadoVacio: "No se pudo leer lo que pegaste. Cada línea necesita al menos un nombre y una duración.",
        motivo,
      },
    },

    /** Para cerrar el aviso de lo que pasó con la última carga o cambio. */
    entendido: "Entendido",

    /** Lo que se dice al terminar una carga (`resumenDeCarga`) y cuando un pedido en lote falla (`errorDeLote`). */
    resumenDeCarga,
    errorDeLote,
  }
}
