import { claveDeFotoDeLaCuenta, rutaPublicaDeFoto } from "@/lib/almacenamiento-de-fotos"
import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * La foto de la CUENTA de la sesión, para dibujar el avatar del panel. SÓLO
 * SERVIDOR (la llama el layout del panel).
 *
 * La foto NO viaja en el token de la sesión: el JWT va en una cookie y sale al
 * navegador en cada pedido, y una foto que cambia no debe esperar a que se
 * revalide. Se lee acá, de la base, con un `select` explícito de esa sola
 * columna (el resto del usuario, la contraseña incluida, no se trae), y baja
 * por props.
 *
 * Lo que sale de la columna no se muestra sin comprobar: sólo se devuelve la
 * ruta si es una clave nuestra Y de la carpeta de esta cuenta
 * (`claveDeFotoDeLaCuenta`). Una fila con algo raro (armado a mano, de otra
 * cuenta, de un negocio, un sitio de afuera) vale `null`: se ven las
 * iniciales. Y es la foto de la cuenta y nada más: no hace de respaldo la del
 * integrante (`BusinessMember.fotoUrl`), ni al revés.
 *
 * Una foto es decoración: si la lectura falla (la base, o la migración
 * `20261112130000_etapa_9_foto_de_la_cuenta` sin aplicar todavía) se registra y
 * el panel se dibuja con las iniciales en vez de caerse entero.
 */
export async function leerFotoDeLaCuenta(usuarioId: string | null | undefined): Promise<string | null> {
  if (!usuarioId) return null
  try {
    const usuario = await prisma.user.findUnique({ where: { id: usuarioId }, select: { fotoUrl: true } })
    const clave = claveDeFotoDeLaCuenta(usuario?.fotoUrl, usuarioId)
    return clave ? rutaPublicaDeFoto(clave) : null
  } catch (fallo) {
    registrarError("leyendo la foto de la cuenta", fallo)
    return null
  }
}
