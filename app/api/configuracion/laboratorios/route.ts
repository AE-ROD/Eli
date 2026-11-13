import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuerpoDelPedido, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { laboratorioNuevoSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, esClinicaDental, puedeGestionarLaboratorios } from "@/lib/permisos"
import { crearLaboratorio, leerLaboratorios } from "@/lib/protesis-servidor"

/**
 * Los laboratorios de la clínica (externos, sin cuenta en Eli): los gestiona
 * sólo la dueña (`puedeGestionarLaboratorios`); los odontólogos eligen los
 * activos en la ficha (`/api/clientes/[id]/protesis/opciones`). Fuera de una
 * clínica dental, 404: como lo ajeno, no se confirma que exista. No hay
 * DELETE: un laboratorio se desactiva. El límite de pedidos lo pone `proxy.ts`.
 */

const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })

/** Todos los laboratorios, activos e inactivos, por nombre. */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedeGestionarLaboratorios(actor)) return noAutorizado()

  try {
    return NextResponse.json(await leerLaboratorios(actor))
  } catch (error) {
    return respuestaClinica(error, "leyendo los laboratorios")
  }
}

/** Agrega un laboratorio. Un nombre que ya existe en la clínica (sin distinguir mayúsculas) es 409. */
export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedeGestionarLaboratorios(actor)) return noAutorizado()

  try {
    const datos = laboratorioNuevoSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await crearLaboratorio(actor, datos), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "creando un laboratorio")
  }
}
