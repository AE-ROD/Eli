import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // Limpiar datos existentes
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.business.deleteMany()
  await prisma.user.deleteMany()

  // Crear usuario de prueba
  const hashedPassword = await bcrypt.hash('password123', 10)
  
  const userRecord = await prisma.user.create({
    data: {
      name: 'Admin Demo',
      email: 'admin@eli.com',
      password: hashedPassword,
      business: {
        create: {
          name: 'Salón de Belleza Demo',
          type: 'salon',
          slug: 'salon-de-belleza-demo',
        },
      },
    },
  })
  const business = await prisma.business.findUnique({ where: { userId: userRecord.id } })
  const user = { ...userRecord, business }

  console.log('✅ Usuario creado:', user.email)

  // Crear pacientes de prueba
  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        name: 'María García',
        email: 'maria@email.com',
        phone: '+52 555 123 4567',
        tags: ['VIP', 'Frecuente'],
        notes: 'Cliente preferencial, le gusta el café',
        businessId: user.business!.id,
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Carlos Rodríguez',
        email: 'carlos@email.com',
        phone: '+52 555 234 5678',
        tags: ['Nuevo'],
        businessId: user.business!.id,
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Ana Pérez',
        email: 'ana@email.com',
        phone: '+52 555 345 6789',
        tags: ['Frecuente'],
        businessId: user.business!.id,
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Luis Martínez',
        email: 'luis@email.com',
        phone: '+52 555 456 7890',
        tags: ['VIP'],
        businessId: user.business!.id,
      },
    }),
  ])

  console.log(`✅ ${patients.length} pacientes creados`)

  // Crear citas de prueba
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const appointments = await Promise.all([
    prisma.appointment.create({
      data: {
        title: 'Corte + Tinte',
        startTime: new Date(today.setHours(9, 0, 0, 0)),
        endTime: new Date(today.setHours(10, 30, 0, 0)),
        status: 'confirmada',
        notes: 'Cliente prefiere tinte castaño',
        price: 850,
        patientId: patients[0].id,
        businessId: user.business!.id,
      },
    }),
    prisma.appointment.create({
      data: {
        title: 'Corte de cabello',
        startTime: new Date(today.setHours(10, 30, 0, 0)),
        endTime: new Date(today.setHours(11, 0, 0, 0)),
        status: 'en-progreso',
        price: 350,
        patientId: patients[1].id,
        businessId: user.business!.id,
      },
    }),
    prisma.appointment.create({
      data: {
        title: 'Manicure',
        startTime: new Date(today.setHours(11, 30, 0, 0)),
        endTime: new Date(today.setHours(12, 30, 0, 0)),
        status: 'pendiente',
        price: 450,
        patientId: patients[2].id,
        businessId: user.business!.id,
      },
    }),
    prisma.appointment.create({
      data: {
        title: 'Consulta general',
        startTime: new Date(today.setHours(14, 0, 0, 0)),
        endTime: new Date(today.setHours(14, 30, 0, 0)),
        status: 'confirmada',
        price: 500,
        patientId: patients[3].id,
        businessId: user.business!.id,
      },
    }),
    // Citas para mañana
    prisma.appointment.create({
      data: {
        title: 'Pedicure',
        startTime: new Date(tomorrow.setHours(10, 0, 0, 0)),
        endTime: new Date(tomorrow.setHours(11, 0, 0, 0)),
        status: 'pendiente',
        price: 400,
        patientId: patients[0].id,
        businessId: user.business!.id,
      },
    }),
  ])

  console.log(`✅ ${appointments.length} citas creadas`)

  // Crear conversaciones de prueba
  const conversations = await Promise.all([
    prisma.conversation.create({
      data: {
        patientName: 'María García',
        patientPhone: '+52 555 123 4567',
        businessId: user.business!.id,
        messages: {
          create: [
            {
              content: 'Hola, quisiera agendar una cita para mañana',
              fromBusiness: false,
              createdAt: new Date(Date.now() - 3600000), // Hace 1 hora
            },
            {
              content: '¡Hola María! Claro, ¿qué servicio te gustaría?',
              fromBusiness: true,
              createdAt: new Date(Date.now() - 3500000),
            },
            {
              content: 'Me gustaría un corte y tinte',
              fromBusiness: false,
              createdAt: new Date(Date.now() - 3400000),
            },
            {
              content: 'Perfecto, tengo disponibilidad a las 9:00 AM. ¿Te parece bien?',
              fromBusiness: true,
              createdAt: new Date(Date.now() - 3300000),
            },
            {
              content: 'Sí, perfecto. Ahí estaré',
              fromBusiness: false,
              createdAt: new Date(Date.now() - 3200000),
            },
          ],
        },
      },
    }),
    prisma.conversation.create({
      data: {
        patientName: 'Carlos Rodríguez',
        patientPhone: '+52 555 234 5678',
        businessId: user.business!.id,
        messages: {
          create: [
            {
              content: 'Buenos días, ¿tienen disponibilidad hoy?',
              fromBusiness: false,
              createdAt: new Date(Date.now() - 1800000), // Hace 30 min
            },
            {
              content: 'Buenos días Carlos, sí tenemos. ¿A qué hora te gustaría venir?',
              fromBusiness: true,
              createdAt: new Date(Date.now() - 1700000),
            },
          ],
        },
      },
    }),
    prisma.conversation.create({
      data: {
        patientName: 'Ana Pérez',
        patientPhone: '+52 555 345 6789',
        businessId: user.business!.id,
        messages: {
          create: [
            {
              content: 'Hola, necesito cancelar mi cita de mañana',
              fromBusiness: false,
              createdAt: new Date(Date.now() - 600000), // Hace 10 min
            },
            {
              content: 'Hola Ana, sin problema. ¿Te gustaría reagendar para otro día?',
              fromBusiness: true,
              createdAt: new Date(Date.now() - 300000),
            },
          ],
        },
      },
    }),
  ])

  console.log(`✅ ${conversations.length} conversaciones creadas`)

  console.log('\n🎉 Seed completado exitosamente!')
  console.log('\n📝 Credenciales de prueba:')
  console.log('   Email: admin@eli.com')
  console.log('   Password: password123')
  console.log('\n📊 Datos creados:')
  console.log(`   - 1 usuario`)
  console.log(`   - 1 negocio`)
  console.log(`   - ${patients.length} pacientes`)
  console.log(`   - ${appointments.length} citas`)
  console.log(`   - ${conversations.length} conversaciones`)
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
