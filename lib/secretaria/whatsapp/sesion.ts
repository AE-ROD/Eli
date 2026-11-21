import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type SignalDataSet, type SignalKeyStore } from "baileys"
import { prisma } from "@/lib/prisma"
import { cifrar, descifrar } from "@/lib/secretaria/cifrado"

/**
 * La sesión de WhatsApp de un negocio, guardada en la base y cifrada (en vez
 * de en archivos, como el ejemplo de Baileys): las credenciales en
 * `CanalDeWhatsapp.credencialesCifradas` y cada llave de Signal en una fila de
 * `ClaveDeWhatsapp`. Todo filtra por el negocio y el canal.
 */

const guardar = (valor: unknown): string => cifrar(JSON.stringify(valor, BufferJSON.replacer))
const leer = <T>(guardado: string): T => JSON.parse(descifrar(guardado), BufferJSON.reviver) as T

export function credencialesNuevas(): AuthenticationCreds {
  return initAuthCreds()
}

export function leerCredenciales(guardadas: string | null): AuthenticationCreds {
  return guardadas ? leer<AuthenticationCreds>(guardadas) : initAuthCreds()
}

export async function guardarCredenciales(negocioId: string, canalId: string, credenciales: AuthenticationCreds): Promise<void> {
  await prisma.canalDeWhatsapp.updateMany({
    where: { id: canalId, businessId: negocioId },
    data: { credencialesCifradas: guardar(credenciales) },
  })
}

/** Las llaves de Signal del canal, en la base. */
export function llavesEnLaBase(negocioId: string, canalId: string): SignalKeyStore {
  const get = async (tipo: string, ids: string[]): Promise<Record<string, unknown>> => {
      if (ids.length === 0) return {}
      const filas = await prisma.claveDeWhatsapp.findMany({
        where: { businessId: negocioId, canalId, tipo, claveId: { in: ids } },
        select: { claveId: true, valorCifrado: true },
      })
      const datos: Record<string, unknown> = {}
      for (const fila of filas) {
        const valor = leer<unknown>(fila.valorCifrado)
        datos[fila.claveId] =
          tipo === "app-state-sync-key" && valor ? proto.Message.AppStateSyncKeyData.fromObject(valor as object) : valor
      }
      return datos
  }
  return {
    get: get as SignalKeyStore["get"],
    set: async (datos: SignalDataSet) => {
      await prisma.$transaction(async (tx) => {
        for (const [tipo, porId] of Object.entries(datos)) {
          for (const [claveId, valor] of Object.entries(porId ?? {})) {
            if (valor === null || valor === undefined) {
              await tx.claveDeWhatsapp.deleteMany({ where: { businessId: negocioId, canalId, tipo, claveId } })
              continue
            }
            const valorCifrado = guardar(valor)
            await tx.claveDeWhatsapp.upsert({
              where: { canalId_tipo_claveId: { canalId, tipo, claveId } },
              create: { businessId: negocioId, canalId, tipo, claveId, valorCifrado },
              update: { valorCifrado },
            })
          }
        }
      })
    },
  }
}

/** Borra la sesión entera del canal: al desconectar, o si WhatsApp la cerró. */
export async function borrarSesion(negocioId: string, canalId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.claveDeWhatsapp.deleteMany({ where: { businessId: negocioId, canalId } })
    await tx.canalDeWhatsapp.updateMany({
      where: { id: canalId, businessId: negocioId },
      data: { credencialesCifradas: null, numero: null },
    })
  })
}
