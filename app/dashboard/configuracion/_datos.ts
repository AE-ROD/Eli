/**
 * Todo lo que la configuración le pide al servidor desde el navegador: el
 * horario de un miembro (leer y guardar) y el catálogo de servicios. Lo que se
 * ve al entrar ya viene resuelto por `page.tsx`, que es de servidor y consulta
 * la base directo.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla, también
 * cuando el servidor rechaza un horario o un servicio.
 */

import { leerMonto } from "@/lib/dinero"
import { frecuenciaDelFormulario } from "@/lib/frecuencia-de-visitas"
import { pedir, conJson, type Resultado } from "@/lib/peticiones"
import type { LaboratorioRespuesta } from "@/lib/edicion-de-protesis"

/** Un día del horario semanal: si se atiende y de qué hora a qué hora. */
export interface HorarioDelDia {
  id?: string
  /** 0 es domingo, como `Date.getDay()`. */
  dayOfWeek: number
  startTime: string
  endTime: string
  active: boolean
}

export interface Servicio {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
  /** Agrupa los servicios en la página pública. `null` va a "Otros". */
  category: string | null
  /** Cada cuántos días vuelve un cliente por este servicio (#75). `null` es sin frecuencia. */
  frecuenciaDias: number | null
  active: boolean
}

/** Lo que se carga en el modal de servicio. El precio es texto: así llega del campo. */
export interface DatosDeServicio {
  name: string
  description: string
  duration: number
  price: string
  /** Vacío es "sin categoría": se manda `null` y el servidor la borra. */
  category: string
  /** "Cada cuántos días vuelve", como texto del campo. Vacío es `null`: se borra. */
  frecuenciaDias: string
}

/**
 * Con `memberId`, el horario de ese miembro; con `null`, el horario general
 * del negocio, dicho explícitamente (`?general=1`): el del dueño, y el que
 * también edita el encargado. Un profesional sólo edita el suyo (con su id).
 */
function rutaDelHorario(memberId: string | null): string {
  return memberId
    ? `/api/configuracion/horarios?memberId=${encodeURIComponent(memberId)}`
    : "/api/configuracion/horarios?general=1"
}

export async function leerHorario(memberId: string | null): Promise<Resultado<HorarioDelDia[]>> {
  return pedir<HorarioDelDia[]>(rutaDelHorario(memberId), "No se pudo cargar el horario")
}

export async function guardarHorario(memberId: string | null, horarios: HorarioDelDia[]): Promise<Resultado> {
  return pedir(rutaDelHorario(memberId), "No se pudo guardar el horario", conJson("POST", horarios))
}

/**
 * Del formulario a lo que espera el servidor. Al crear, descripción o precio
 * vacíos no se mandan; al editar se mandan como `null`, que los borra: sin
 * mandarlos, vaciar el campo no hacía nada y el servicio seguía con el precio
 * de antes. El precio lo lee `leerMonto`, así "8.000", "8000" y "8.000,50"
 * son el monto que se quiso escribir (con `parseFloat`, "8.000" era 8). Un
 * precio que no se puede leer sin adivinar es un error, no un servicio
 * guardado sin precio o con otro. La frecuencia, igual: vacía es `null` (se
 * borra) y una que no es un entero de 7 a 365 es un error, no se manda.
 */
export function cuerpoDeServicio(datos: DatosDeServicio, para: "crear" | "editar" = "crear") {
  const f = frecuenciaDelFormulario(datos.frecuenciaDias)
  if (!f.ok) return f
  const vacio = para === "editar" ? null : undefined
  const base = {
    name: datos.name,
    description: datos.description.trim() ? datos.description : vacio,
    duration: datos.duration,
    category: datos.category.trim() || null,
    frecuenciaDias: f.valor,
  }
  if (!datos.price.trim()) return { ok: true as const, datos: { ...base, price: vacio } }
  const precio = leerMonto(datos.price)
  return precio === null
    ? { ok: false as const, error: "No se entiende el precio. Escríbelo así: 8000 o 8000,50." }
    : { ok: true as const, datos: { ...base, price: precio } }
}

/** Devuelve el servicio tal como quedó guardado. */
export async function crearServicio(datos: DatosDeServicio): Promise<Resultado<Servicio>> {
  const cuerpo = cuerpoDeServicio(datos)
  if (!cuerpo.ok) return cuerpo
  return pedir<Servicio>("/api/configuracion/servicios", "No se pudo crear el servicio", conJson("POST", cuerpo.datos))
}

/** Devuelve el servicio tal como quedó guardado. */
export async function editarServicio(id: string, datos: DatosDeServicio): Promise<Resultado<Servicio>> {
  const cuerpo = cuerpoDeServicio(datos, "editar")
  if (!cuerpo.ok) return cuerpo
  return pedir<Servicio>(`/api/configuracion/servicios/${id}`, "No se pudo guardar el servicio", conJson("PUT", cuerpo.datos))
}

/** Un servicio inactivo no aparece en la página pública de reservas. */
export async function activarODesactivarServicio(id: string, activo: boolean): Promise<Resultado<Servicio>> {
  return pedir<Servicio>(
    `/api/configuracion/servicios/${id}`,
    activo ? "No se pudo activar el servicio" : "No se pudo desactivar el servicio",
    conJson("PUT", { active: activo })
  )
}

export async function borrarServicio(id: string): Promise<Resultado> {
  return pedir(`/api/configuracion/servicios/${id}`, "No se pudo borrar el servicio", { method: "DELETE" })
}

// ─── Productos (#67) ─────────────────────────────────────────────────────────

/** Un producto del catálogo como lo devuelve el servidor. `porcentaje` sólo le llega a la dueña. */
export interface Producto {
  id: string
  nombre: string
  /** En unidades; `null` si no tiene precio en el catálogo (se escribe al venderlo). */
  precio: number | null
  activo: boolean
  /** % de comisión de quien lo vende. `null` es "sin configurar" (pendiente), no 0. Ausente si no se ve. */
  porcentaje?: number | null
}

/** Lo que se carga en el modal de producto, como texto: así llega de los campos. */
export interface DatosDeProducto {
  nombre: string
  precio: string
  porcentaje: string
}

/** Lo que el texto de un % dice: vacío es "sin configurar" (null), nunca 0. */
export function leerPorcentaje(texto: string): { ok: true; porcentaje: number | null } | { ok: false; error: string } {
  const limpio = texto.trim().replace("%", "").trim()
  if (limpio === "") return { ok: true, porcentaje: null }
  const porcentaje = Number(limpio.replace(",", "."))
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return { ok: false, error: "El porcentaje tiene que ser un número entre 0 y 100." }
  }
  if (Math.abs(porcentaje * 100 - Math.round(porcentaje * 100)) > 1e-6) {
    return { ok: false, error: "El porcentaje puede tener hasta dos decimales." }
  }
  return { ok: true, porcentaje }
}

/**
 * Del formulario a lo que espera el servidor. El precio vacío es "sin precio"
 * (`null`); el % sólo se manda si quien edita lo puede fijar: el servidor
 * rechaza el % que manda el encargado, aunque sea el mismo.
 */
export function cuerpoDeProducto(datos: DatosDeProducto, conPorcentaje: boolean) {
  const sinPrecio = datos.precio.trim() === ""
  const precio = sinPrecio ? null : leerMonto(datos.precio)
  if (!sinPrecio && precio === null) {
    return { ok: false as const, error: "No se entiende el precio. Escríbelo así: 8000 o 8000,50." }
  }
  const base = { nombre: datos.nombre.trim(), precio }
  if (!conPorcentaje) return { ok: true as const, datos: base }
  const porcentaje = leerPorcentaje(datos.porcentaje)
  if (!porcentaje.ok) return porcentaje
  return { ok: true as const, datos: { ...base, porcentaje: porcentaje.porcentaje } }
}

/** Devuelve el producto tal como quedó guardado. */
export async function crearProducto(datos: DatosDeProducto, conPorcentaje: boolean): Promise<Resultado<Producto>> {
  const cuerpo = cuerpoDeProducto(datos, conPorcentaje)
  if (!cuerpo.ok) return cuerpo
  return pedir<Producto>("/api/configuracion/productos", "No se pudo crear el producto", conJson("POST", cuerpo.datos))
}

/** Devuelve el producto tal como quedó guardado. */
export async function editarProducto(id: string, datos: DatosDeProducto, conPorcentaje: boolean): Promise<Resultado<Producto>> {
  const cuerpo = cuerpoDeProducto(datos, conPorcentaje)
  if (!cuerpo.ok) return cuerpo
  return pedir<Producto>(
    `/api/configuracion/productos/${encodeURIComponent(id)}`,
    "No se pudo guardar el producto",
    conJson("PUT", cuerpo.datos)
  )
}

/** Un producto inactivo no se ofrece como línea nueva en el tablero. No se borran. */
export async function activarODesactivarProducto(id: string, activo: boolean): Promise<Resultado<Producto>> {
  return pedir<Producto>(
    `/api/configuracion/productos/${encodeURIComponent(id)}`,
    activo ? "No se pudo activar el producto" : "No se pudo desactivar el producto",
    conJson("PUT", { activo })
  )
}

/** La especialidad de un profesional en la página pública ("Colorista"). */
export interface EspecialidadDeMiembro {
  memberId: string
  nombre: string
  especialidad: string
}

/**
 * Lo que se edita de la página pública del negocio. Los textos van como se
 * escriben: el servidor les quita los espacios, normaliza el WhatsApp y el
 * Instagram, y guarda lo vacío como "sin dato".
 */
export interface DatosDePaginaPublica {
  address: string
  comuna: string
  whatsapp: string
  instagram: string
  /** El enlace para dejar una reseña en Google (#77). Vacío lo borra. */
  enlaceResenas: string
  color: string
  mediosDePago: string[]
  especialidades: EspecialidadDeMiembro[]
}

/** Lo que el servidor devuelve ya guardado (normalizado). */
export interface PaginaPublicaGuardada {
  address: string | null
  comuna: string | null
  whatsapp: string | null
  instagram: string | null
  enlaceResenas: string | null
  color: string | null
  mediosDePago: string[]
}

/**
 * Guarda la página. De las especialidades van sólo las que cambiaron respecto
 * de `guardadas` (lo que la pantalla leyó o guardó por última vez): mandarlas
 * todas reescribía también las que no se tocaron, con lo que la pantalla
 * tenía cargado, y pisaba lo que otra persona hubiera cambiado mientras
 * tanto (#113).
 */
export async function guardarPaginaPublica(
  datos: DatosDePaginaPublica,
  guardadas: readonly EspecialidadDeMiembro[]
): Promise<Resultado<PaginaPublicaGuardada>> {
  const { especialidades, ...resto } = datos
  const antes = new Map(guardadas.map((fila) => [fila.memberId, fila.especialidad]))
  return pedir<PaginaPublicaGuardada>(
    "/api/configuracion/pagina",
    "No se pudo guardar la página",
    conJson("PUT", {
      ...resto,
      especialidades: especialidades
        .filter((fila) => antes.get(fila.memberId) !== fila.especialidad)
        .map(({ memberId, especialidad }) => ({ memberId, especialidad })),
    })
  )
}

/** Hasta cuántas horas antes el cliente puede cancelar o reagendar con su enlace (0 a 72). */
export async function guardarPlazoDeCambios(horas: number): Promise<Resultado<{ horas: number }>> {
  return pedir<{ horas: number }>(
    "/api/configuracion/plazo-de-cambios",
    "No se pudo guardar el plazo",
    conJson("PUT", { horas })
  )
}

// ─── Mensajes a clientes (#74, #75, #77, #78) ────────────────────────────────

/** Los interruptores de los mensajes automáticos del negocio. */
export interface InterruptoresDeMensajes {
  listaDeEsperaActiva: boolean
  avisoDeVueltaActivo: boolean
  pideResenas: boolean
}

/** Lo enviado en el mes, como lo cuenta `contarEnviosDelMes` (`lib/envios-a-clientes.ts`). */
export interface MensajesDelMes {
  /** "AAAA-MM" en la zona del negocio. */
  mes: string
  total: number
  porCategoria: Record<string, number>
  porTipo: Record<string, number>
  porCanal: Record<string, number>
}

/** Lo que la sección "Mensajes a clientes" muestra al entrar (`GET /api/configuracion/mensajes`). */
export interface EstadoDeMensajes {
  interruptores: InterruptoresDeMensajes
  /** Si hay guardado un enlace de reseñas de Google válido: sin él no se puede pedir reseña. */
  tieneEnlaceDeResenas: boolean
  /** Sólo la dueña los enciende o apaga; el encargado los ve. */
  puedeCambiar: boolean
  mes: MensajesDelMes
}

/** Cambia uno o más interruptores. Devuelve cómo quedaron los tres. */
export async function cambiarMensajesAClientes(
  cambios: Partial<InterruptoresDeMensajes>
): Promise<Resultado<{ interruptores: InterruptoresDeMensajes }>> {
  return pedir<{ interruptores: InterruptoresDeMensajes }>(
    "/api/configuracion/mensajes",
    "No se pudo guardar el cambio",
    conJson("PUT", cambios)
  )
}

// ─── Sillones (clínica dental) ───────────────────────────────────────────────

/** Un sillón de la clínica, como lo devuelve el servidor. */
export interface Sillon {
  id: string
  nombre: string
  /** En qué lugar sale en la agenda y en el inicio (0 a 999). */
  orden: number
  activo: boolean
}

/** Todos los sillones, activos e inactivos, por orden y nombre. */
export async function leerSillonesDeLaClinica(): Promise<Resultado<Sillon[]>> {
  return pedir<Sillon[]>("/api/configuracion/sillones", "No se pudieron cargar los sillones")
}

/** Un sillón nuevo va al final (el servidor le pone el orden). Devuelve el sillón como quedó. */
export async function crearSillon(nombre: string): Promise<Resultado<Sillon>> {
  return pedir<Sillon>("/api/configuracion/sillones", "No se pudo agregar el sillón", conJson("POST", { nombre: nombre.trim() }))
}

/**
 * Cambia el nombre, el orden o si está activo. Un sillón no se borra: se
 * desactiva, y las citas que ya lo tienen lo conservan. Devuelve el sillón
 * como quedó.
 */
export async function editarSillon(
  id: string,
  cambios: { nombre?: string; orden?: number; activo?: boolean }
): Promise<Resultado<Sillon>> {
  const errorPorDefecto =
    cambios.activo === true
      ? "No se pudo activar el sillón"
      : cambios.activo === false
        ? "No se pudo desactivar el sillón"
        : "No se pudo guardar el sillón"
  return pedir<Sillon>(`/api/configuracion/sillones/${encodeURIComponent(id)}`, errorPorDefecto, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios.nombre === undefined ? cambios : { ...cambios, nombre: cambios.nombre.trim() }),
  })
}

/**
 * Los sillones con `sillon` movido un lugar (`-1` sube, `1` baja), y el orden
 * que le toca a cada uno: su posición en la lista, de 0 en adelante. Devuelve
 * también qué sillones cambian de orden, para guardar sólo esos. Si no se
 * puede mover (ya está primero o último, o no está), `null`.
 */
export function moverSillon(
  sillones: readonly Sillon[],
  id: string,
  direccion: -1 | 1
): { lista: Sillon[]; cambios: { id: string; orden: number }[] } | null {
  const desde = sillones.findIndex((sillon) => sillon.id === id)
  const hasta = desde + direccion
  if (desde === -1 || hasta < 0 || hasta >= sillones.length) return null

  const reordenados = [...sillones]
  ;[reordenados[desde], reordenados[hasta]] = [reordenados[hasta], reordenados[desde]]
  const cambios = reordenados.flatMap((sillon, orden) => (sillon.orden === orden ? [] : [{ id: sillon.id, orden }]))
  return { lista: reordenados.map((sillon, orden) => ({ ...sillon, orden })), cambios }
}

// ─── Laboratorios (clínica dental, sólo la dueña) ────────────────────────────

/** Un laboratorio de la clínica, como lo devuelve el servidor (`LaboratorioRespuesta`). */
export type Laboratorio = LaboratorioRespuesta

export async function crearLaboratorio(datos: { nombre: string; contacto: string | null }): Promise<Resultado<Laboratorio>> {
  return pedir<Laboratorio>(
    "/api/configuracion/laboratorios",
    "No se pudo agregar el laboratorio",
    conJson("POST", { nombre: datos.nombre.trim(), contacto: datos.contacto?.trim() || null })
  )
}

/** Renombra, cambia el contacto o lo activa o desactiva. No se borra: las prótesis que lo tienen lo siguen nombrando. */
export async function editarLaboratorio(
  id: string,
  cambios: { nombre?: string; contacto?: string | null; activo?: boolean }
): Promise<Resultado<Laboratorio>> {
  const errorPorDefecto =
    cambios.activo === true
      ? "No se pudo activar el laboratorio"
      : cambios.activo === false
        ? "No se pudo desactivar el laboratorio"
        : "No se pudo guardar el laboratorio"
  return pedir<Laboratorio>(`/api/configuracion/laboratorios/${encodeURIComponent(id)}`, errorPorDefecto, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  })
}
