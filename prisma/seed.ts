/**
 * Datos de ejemplo para desarrollo.
 *
 * La única base configurada hoy es producción, así que el seed **no borra nada**
 * y exige confirmación explícita:
 *
 *     SEED_CONFIRMO=si node prisma/seed.ts
 *
 * Es idempotente: correrlo dos veces no duplica nada.
 */
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const CLAVE = "demo1234"
const SLUG = "salon-demo"

async function crearUsuario(nombre: string, email: string) {
  const password = await bcrypt.hash(CLAVE, 10)
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: nombre, email, password },
  })
}

async function main() {
  if (process.env.SEED_CONFIRMO !== "si") {
    throw new Error("Seed cancelado. Corré con SEED_CONFIRMO=si si la base es de desarrollo.")
  }

  const dueño = await crearUsuario("Ana Dueña", "duena@demo.eli")

  const negocio = await prisma.business.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Salón Demo", type: "salon", slug: SLUG, teamSize: 3, userId: dueño.id },
  })

  const equipo = [
    { nombre: "Bruno Encargado", email: "encargado@demo.eli", role: "admin" },
    { nombre: "Carla Profesional", email: "profesional@demo.eli", role: "worker" },
  ]

  for (const { nombre, email, role } of equipo) {
    const usuario = await crearUsuario(nombre, email)
    await prisma.businessMember.upsert({
      where: { businessId_userId: { businessId: negocio.id, userId: usuario.id } },
      update: { role },
      create: { businessId: negocio.id, userId: usuario.id, role },
    })
  }

  // Servicios, clientes y citas sólo la primera vez: no tienen clave única
  // por la que reconocerlos y volver a crearlos los duplicaría.
  const yaTieneDatos = await prisma.service.count({ where: { businessId: negocio.id } })
  if (yaTieneDatos === 0) {
    await prisma.service.createMany({
      data: [
        { businessId: negocio.id, name: "Corte", duration: 30, price: 8000 },
        { businessId: negocio.id, name: "Color", duration: 90, price: 25000 },
        { businessId: negocio.id, name: "Manicura", duration: 45, price: 12000 },
      ],
    })

    const cliente = await prisma.patient.create({
      data: { businessId: negocio.id, name: "María", lastName: "González", phone: "+56 9 1234 5678" },
    })

    const profesional = await prisma.businessMember.findFirst({
      where: { businessId: negocio.id, role: "worker" },
    })

    const mañana = new Date()
    mañana.setDate(mañana.getDate() + 1)
    mañana.setHours(10, 0, 0, 0)

    await prisma.appointment.create({
      data: {
        businessId: negocio.id,
        patientId: cliente.id,
        memberId: profesional?.id ?? null,
        title: "Corte",
        startTime: mañana,
        endTime: new Date(mañana.getTime() + 30 * 60 * 1000),
        status: "confirmada",
        price: 8000,
      },
    })
  }

  console.log(`Listo. Negocio "${negocio.name}".`)
  console.log(`Entrá con duena@demo.eli, encargado@demo.eli o profesional@demo.eli / ${CLAVE}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
