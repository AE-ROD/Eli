import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { leerAlertaDeAlergias, leerFicha, leerOdontograma } from "@/lib/ficha-clinica-servidor"
import { leerPlan } from "@/lib/plan-de-tratamiento-servidor"
import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import {
  actorDeSesion,
  esClinicaDental,
  puedeEditarFichaClinica,
  veFichaClinica,
  vePlanDeTratamiento,
  veProtesis,
  veSillones,
  whereDeAgenda,
  whereDeClientes,
} from "@/lib/permisos"
import { fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { FichaDelPaciente } from "./_componentes/ficha-del-paciente"

/**
 * `/dashboard/clientes/[id]`: la ficha clínica de un paciente, sólo en una
 * clínica dental. Fuera de una clínica dental vuelve a la lista de clientes,
 * que es lo que esos rubros tienen. Un paciente que no es del negocio, que se
 * eliminó o que no existe es 404, como en la API: nunca se dice que existe.
 *
 * Lo que se ve lo decide `lib/permisos.ts`, igual que los endpoints que la
 * pantalla usa después para escribir:
 *
 * - dueño y odontólogos: la alerta de alergias, el odontograma, el plan, las
 *   evoluciones y los antecedentes, y escriben todo;
 * - el encargado: la alerta de alergias y el plan, sólo para leer. La ficha
 *   (antecedentes, odontograma, evoluciones) no se lee para él: ni se pide.
 *   Tampoco ve la pestaña Prótesis (`veProtesis`), que pide sus datos al
 *   abrirse.
 *
 * Se lee acá lo que la pantalla muestra al entrar (con los mismos lectores que
 * los endpoints, `lib/ficha-clinica-servidor.ts` y
 * `lib/plan-de-tratamiento-servidor.ts`); las evoluciones se piden al abrir su
 * pestaña.
 */
export default async function PaginaFichaClinica({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) redirect("/iniciar-sesion")
  if (!esClinicaDental(actor)) redirect("/dashboard/clientes")

  const { id } = await params
  const paciente = await prisma.customer.findFirst({
    where: whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] }),
    select: { id: true, name: true, lastName: true, cedula: true, email: true, phone: true, createdAt: true },
  })
  if (!paciente) notFound()

  const veFicha = veFichaClinica(actor)
  const vePlan = vePlanDeTratamiento(actor)
  const ahora = new Date()
  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  const zona = zonaDelNegocio(negocio?.timezone)
  // El día de hoy en la zona del negocio, como `hoyDelNegocio`: la edad y el tope de la fecha de nacimiento.
  const hoy = fechaYMinutosEn(ahora, zona).fecha

  const [alergias, ficha, odontograma, plan, proximaCita] = await Promise.all([
    // Sólo la columna de alergias (el lector la fija): es lo único de la ficha que ve el encargado.
    leerAlertaDeAlergias(prisma, actor, paciente.id),
    veFicha ? leerFicha(prisma, actor, paciente.id, hoy) : null,
    veFicha ? leerOdontograma(prisma, actor, paciente.id) : null,
    vePlan ? leerPlan(prisma, actor, paciente.id) : null,
    // La próxima, como en la lista de clientes: la más cercana que todavía no
    // empezó y sigue en pie. Con el filtro de agenda: el odontólogo, las suyas.
    prisma.appointment.findFirst({
      where: whereDeAgenda(actor, {
        customerId: paciente.id,
        startTime: { gt: ahora },
        status: { in: ["pendiente", "confirmada"] },
      }),
      orderBy: { startTime: "asc" },
      select: {
        startTime: true,
        title: true,
        ...(veSillones(actor) && { sillon: { select: { nombre: true } } }),
      },
    }),
  ])

  const usuario = session?.user

  return (
    <FichaDelPaciente
      paciente={{
        id: paciente.id,
        nombre: nombreCompletoDeCliente(paciente),
        documento: paciente.cedula?.trim() || null,
        email: paciente.email,
        telefono: paciente.phone,
        desde: paciente.createdAt.toISOString(),
      }}
      alergias={alergias}
      fichaInicial={ficha}
      odontogramaInicial={odontograma}
      planInicial={plan}
      proximaCita={
        proximaCita
          ? {
              inicio: proximaCita.startTime.toISOString(),
              motivo: proximaCita.title,
              sillon: "sillon" in proximaCita ? (proximaCita.sillon?.nombre ?? null) : null,
            }
          : null
      }
      zona={zona}
      hoy={hoy}
      puedeEditarFicha={puedeEditarFichaClinica(actor)}
      veProtesis={veProtesis(actor)}
      usuario={{
        rol: actor.rol,
        memberId: actor.memberId,
        nombre: usuario?.name?.trim() || "",
        rubro: actor.rubro ?? null,
      }}
    />
  )
}
