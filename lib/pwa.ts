/**
 * Eli instalable en el teléfono (issue #81): lo que comparten el manifest
 * (`app/manifest.ts`), los íconos (`app/iconos/[nombre]/route.tsx`), el
 * service worker (`public/sw.js`) y la pista "Instala Eli en tu teléfono"
 * del panel (`components/panel/app-instalable.tsx`).
 *
 * Lo que decide la pista vive acá, sin React ni `window`, para poder probarlo.
 */

/**
 * Los colores de la app instalada. El manifest no lee variables de CSS, así
 * que van escritos; son los tokens `crema` y `navy` de `app/globals.css`, y
 * `lib/pwa.test.ts` falla si dejan de coincidir.
 * - `fondo`: la pantalla de arranque y la barra de estado (el panel es crema).
 * - `marca`: el cuadro del ícono.
 */
export const COLORES_DE_LA_APP = {
  fondo: "#fcfbf8",
  marca: "#071a31",
} as const

/** Donde arranca la app instalada: el panel, no la landing. */
export const INICIO_DE_LA_APP = "/dashboard"

/**
 * El service worker sólo controla el panel. La landing, la reserva pública y
 * la API quedan fuera de su alcance: no las intercepta nunca.
 */
export const ALCANCE_DEL_SW = "/dashboard"
export const RUTA_DEL_SW = "/sw.js"

/** Los íconos que sirve `app/iconos/[nombre]/route.tsx`, con su lado en px. */
export const ICONOS_DE_LA_APP = {
  "icono-192.png": 192,
  "icono-512.png": 512,
  "apple-icon.png": 180,
} as const

export type NombreDeIcono = keyof typeof ICONOS_DE_LA_APP

export function esNombreDeIcono(nombre: string): nombre is NombreDeIcono {
  return Object.hasOwn(ICONOS_DE_LA_APP, nombre)
}

/** Dónde se recuerda que la persona cerró la pista. Es por dispositivo. */
export const CLAVE_PISTA_CERRADA = "eli_pista_instalar_cerrada"

/**
 * - `ios`: no hay botón de instalar; se explica Compartir → Agregar a inicio.
 * - `android`: el navegador ofreció su propio diálogo (`beforeinstallprompt`).
 */
export type PistaDeInstalacion = "ios" | "android"

/**
 * iPhone, iPod o iPad. El iPad con iPadOS se presenta como una Mac: se lo
 * distingue porque una Mac no tiene pantalla táctil.
 */
export function esIos(userAgent: string, puntosTactiles: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && puntosTactiles > 1
}

/**
 * Los navegadores dentro de otra app (Instagram, Facebook, TikTok…) no tienen
 * "Agregar a inicio": explicarlo ahí sería mandar a buscar un botón que no está.
 */
function esNavegadorDeOtraApp(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|musical_ly|TikTok|Snapchat/i.test(userAgent)
}

export interface SituacionDelDispositivo {
  userAgent: string
  puntosTactiles: number
  /** Ya se abrió como app instalada (`display-mode: standalone`). */
  instalada: boolean
  /** La persona cerró la pista antes en este dispositivo. */
  cerrada: boolean
  /** El navegador ofreció su diálogo de instalar (Chrome en Android, y también en la computadora). */
  hayDialogoNativo: boolean
}

/** Qué pista mostrar, o `null` si ninguna. */
export function pistaAMostrar(situacion: SituacionDelDispositivo): PistaDeInstalacion | null {
  if (situacion.instalada || situacion.cerrada) return null
  // En la computadora Chrome también lo ofrece, pero la pista habla del
  // teléfono: ahí queda el ícono de instalar de la barra de direcciones.
  if (situacion.hayDialogoNativo && /Android/i.test(situacion.userAgent)) return "android"
  if (esIos(situacion.userAgent, situacion.puntosTactiles) && !esNavegadorDeOtraApp(situacion.userAgent)) {
    return "ios"
  }
  return null
}

type Almacen = Pick<Storage, "getItem" | "setItem">

/**
 * Si la persona cerró la pista. `localStorage` puede no estar o tirar (modo
 * privado, datos del sitio bloqueados): en ese caso cuenta como no cerrada, y
 * lo peor que pasa es que la pista vuelve a aparecer.
 */
export function leerPistaCerrada(almacen: Almacen | undefined): boolean {
  try {
    return almacen?.getItem(CLAVE_PISTA_CERRADA) === "1"
  } catch {
    return false
  }
}

/** Recuerda el cierre. Si no se puede guardar, la pista se cierra igual por ahora. */
export function guardarPistaCerrada(almacen: Almacen | undefined): void {
  try {
    almacen?.setItem(CLAVE_PISTA_CERRADA, "1")
  } catch {
    // Sin almacenamiento no hay cómo recordarlo: se cierra sólo en esta visita.
  }
}
