import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { textoOpcional, telefonoChileno } from "@/lib/campos-del-panel"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { IDS_DE_MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { CLAVES_DE_COLOR, normalizarInstagram } from "@/lib/pagina-del-negocio"
import { actorDeSesion, puedeEditarPaginaDelNegocio } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

/**
 * PUT /api/configuracion/pagina — los datos de la mini página pública del
 * negocio (`/reservar/[slug]`). Dueño y encargado (`puedeEditarPaginaDelNegocio`);
 * el profesional recibe 401, como en el resto de la configuración.
 *
 * Se manda la página entera, no campo por campo: lo que llega vacío se borra.
 * Siempre sobre el negocio de la sesión (nunca un id del cuerpo), y las
 * especialidades sólo de miembros de ese negocio: un id ajeno o inexistente
 * es 404 y no se guarda nada.
 *
 * Fotos (logo, portada, profesionales): no se editan acá. Todavía no hay
 * subida ni almacenamiento aprobado, y pegar una URL cualquiera dejaría a un
 * negocio mostrar lo que quiera desde donde quiera.
 *
 * El límite de peticiones es el de escritura del panel (`proxy.ts`).
 */

const MENSAJE_DE_INSTAGRAM = "No pudimos leer el Instagram. Escribe el usuario (@tu.salon) o pega el enlace del perfil"

const instagram = () =>
  z
    .string()
    .trim()
    .max(200, "El Instagram no puede tener más de 200 caracteres")
    .transform((valor, contexto) => {
      if (valor === "") return null
      const usuario = normalizarInstagram(valor)
      if (!usuario) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_DE_INSTAGRAM })
        return z.NEVER
      }
      return usuario
    })

const paginaSchema = z.object({
  address: textoOpcional("La dirección", 200),
  comuna: textoOpcional("La comuna", 80),
  whatsapp: telefonoChileno(),
  instagram: instagram(),
  color: z.enum(CLAVES_DE_COLOR, { errorMap: () => ({ message: "Elige uno de los colores de la lista" }) }),
  mediosDePago: z
    .array(z.enum(IDS_DE_MEDIOS_DE_PAGO, { errorMap: () => ({ message: "Ese medio de pago no está en la lista" }) }))
    .max(IDS_DE_MEDIOS_DE_PAGO.length)
    .transform((medios) => [...new Set(medios)]),
  especialidades: z
    .array(
      z.object({
        memberId: z.string().min(1).max(64),
        especialidad: textoOpcional("La especialidad", 60),
      })
    )
    .max(200, "Demasiados profesionales en un solo pedido")
    .refine(
      (filas) => new Set(filas.map((fila) => fila.memberId)).size === filas.length,
      "Un profesional aparece dos veces"
    ),
})

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeEditarPaginaDelNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const leido = paginaSchema.safeParse(await cuerpoDelPedido(request))
  if (!leido.success) return respuestaDeDatosInvalidos(leido.error)
  const { especialidades, ...datosDelNegocio } = leido.data

  // Pertenencia antes de escribir: todos los miembros tienen que ser de este negocio.
  const ids = especialidades.map((fila) => fila.memberId)
  if (ids.length > 0) {
    const delNegocio = await prisma.businessMember.findMany({
      where: { id: { in: ids }, businessId: actor.businessId },
      select: { id: true },
    })
    if (delNegocio.length !== ids.length) {
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
    }
  }

  const [negocio] = await prisma.$transaction([
    prisma.business.update({
      where: { id: actor.businessId },
      data: datosDelNegocio,
      select: { address: true, comuna: true, whatsapp: true, instagram: true, color: true, mediosDePago: true },
    }),
    // `updateMany` con el negocio en el where: aunque algo cambiara entre la
    // verificación y la escritura, nunca toca un miembro ajeno.
    ...especialidades.map((fila) =>
      prisma.businessMember.updateMany({
        where: { id: fila.memberId, businessId: actor.businessId },
        data: { especialidad: fila.especialidad },
      })
    ),
  ])

  return NextResponse.json({ ...negocio, especialidades })
}
