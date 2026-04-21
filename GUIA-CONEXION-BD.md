# 🗄️ Guía: Conectar PostgreSQL con Eli

## Paso 1: Verificar PostgreSQL en pgAdmin

### 1.1 Abrir pgAdmin
- Abre pgAdmin en tu computadora
- Conéctate a tu servidor PostgreSQL

### 1.2 Verificar credenciales
Necesitas saber:
- **Host**: Normalmente `localhost` o `127.0.0.1`
- **Puerto**: Por defecto `5432`
- **Usuario**: Normalmente `postgres`
- **Contraseña**: La que configuraste al instalar PostgreSQL

### 1.3 Crear la base de datos (si no existe)
1. En pgAdmin, haz clic derecho en "Databases"
2. Selecciona "Create" → "Database..."
3. Nombre: `eli`
4. Owner: `postgres`
5. Click en "Save"

---

## Paso 2: Configurar el archivo .env

### 2.1 Actualizar DATABASE_URL

Abre el archivo `.env` en la raíz del proyecto y actualiza la línea:

```env
# Formato:
# DATABASE_URL="postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/NOMBRE_BD"

# Ejemplo con contraseña "mipassword123":
DATABASE_URL="postgresql://postgres:mipassword123@localhost:5432/eli"
```

**⚠️ IMPORTANTE:** Reemplaza `mipassword123` con tu contraseña real de PostgreSQL.

### 2.2 Agregar otras variables necesarias

Agrega estas líneas al final del archivo `.env`:

```env
# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="tu-secreto-super-seguro-cambialo-en-produccion"

# Node Environment
NODE_ENV="development"
```

Para generar un NEXTAUTH_SECRET seguro, ejecuta en la terminal:
```bash
openssl rand -base64 32
```

---

## Paso 3: Ejecutar Migraciones de Prisma

### 3.1 Generar el cliente de Prisma
```bash
npx prisma generate
```

Este comando crea el cliente de Prisma basado en tu schema.

### 3.2 Crear y ejecutar la migración inicial
```bash
npx prisma migrate dev --name init
```

Este comando:
- Crea las tablas en tu base de datos
- Genera archivos de migración
- Actualiza el cliente de Prisma

**Salida esperada:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "eli", schema "public" at "localhost:5432"

PostgreSQL database eli created at localhost:5432

Applying migration `20240420000000_init`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20240420000000_init/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client
```

### 3.3 Verificar en pgAdmin
1. Refresca tu base de datos `eli` en pgAdmin
2. Deberías ver las siguientes tablas:
   - `users`
   - `businesses`
   - `patients`
   - `appointments`
   - `conversations`
   - `messages`
   - `_prisma_migrations`

---

## Paso 4: Crear Datos de Prueba (Seed)

### 4.1 Crear archivo de seed

Crea el archivo `prisma/seed.ts`:

```typescript
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
  
  const user = await prisma.user.create({
    data: {
      name: 'Admin Demo',
      email: 'admin@eli.com',
      password: hashedPassword,
      business: {
        create: {
          name: 'Salón de Belleza Demo',
          type: 'salon',
        },
      },
    },
    include: {
      business: true,
    },
  })

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
  ])

  console.log(`✅ ${patients.length} pacientes creados`)

  // Crear citas de prueba
  const today = new Date()
  const appointments = await Promise.all([
    prisma.appointment.create({
      data: {
        title: 'Corte + Tinte',
        startTime: new Date(today.setHours(9, 0, 0, 0)),
        endTime: new Date(today.setHours(10, 30, 0, 0)),
        status: 'confirmada',
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
  ])

  console.log(`✅ ${appointments.length} citas creadas`)

  // Crear conversación de prueba
  const conversation = await prisma.conversation.create({
    data: {
      patientName: 'María García',
      patientPhone: '+52 555 123 4567',
      businessId: user.business!.id,
      messages: {
        create: [
          {
            content: 'Hola, quisiera agendar una cita',
            fromBusiness: false,
          },
          {
            content: '¡Hola María! Claro, ¿qué día te gustaría?',
            fromBusiness: true,
          },
        ],
      },
    },
  })

  console.log('✅ Conversación creada')

  console.log('\n🎉 Seed completado exitosamente!')
  console.log('\n📝 Credenciales de prueba:')
  console.log('   Email: admin@eli.com')
  console.log('   Password: password123')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

### 4.2 Actualizar package.json

Agrega el script de seed en `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

### 4.3 Instalar tsx (si no está instalado)

```bash
npm install -D tsx
```

### 4.4 Ejecutar el seed

```bash
npm run prisma:seed
```

**Salida esperada:**
```
🌱 Iniciando seed...
✅ Usuario creado: admin@eli.com
✅ 3 pacientes creados
✅ 2 citas creadas
✅ Conversación creada

🎉 Seed completado exitosamente!

📝 Credenciales de prueba:
   Email: admin@eli.com
   Password: password123
```

---

## Paso 5: Verificar la Conexión

### 5.1 Abrir Prisma Studio
```bash
npx prisma studio
```

Esto abre una interfaz web en `http://localhost:5555` donde puedes ver y editar tus datos.

### 5.2 Verificar en pgAdmin
1. Abre pgAdmin
2. Navega a: Servers → PostgreSQL → Databases → eli → Schemas → public → Tables
3. Deberías ver todas las tablas con datos

### 5.3 Probar la aplicación
```bash
npm run dev
```

1. Ve a `http://localhost:3000/iniciar-sesion`
2. Usa las credenciales:
   - Email: `admin@eli.com`
   - Password: `password123`
3. Deberías poder iniciar sesión y ver el dashboard

---

## 🔧 Solución de Problemas

### Error: "Can't reach database server"

**Causa:** PostgreSQL no está corriendo o las credenciales son incorrectas.

**Solución:**
1. Verifica que PostgreSQL esté corriendo:
   ```bash
   # En macOS
   brew services list
   
   # Si no está corriendo:
   brew services start postgresql
   ```

2. Verifica las credenciales en pgAdmin
3. Asegúrate de que el puerto 5432 esté disponible

### Error: "password authentication failed"

**Causa:** Contraseña incorrecta en DATABASE_URL.

**Solución:**
1. Verifica tu contraseña en pgAdmin
2. Actualiza el archivo `.env` con la contraseña correcta
3. Reinicia el servidor de desarrollo

### Error: "database 'eli' does not exist"

**Causa:** La base de datos no fue creada.

**Solución:**
1. Abre pgAdmin
2. Crea manualmente la base de datos `eli`
3. Ejecuta `npx prisma migrate dev` nuevamente

### Error: "Prisma Client is not generated"

**Solución:**
```bash
npx prisma generate
```

---

## 📋 Checklist de Verificación

- [ ] PostgreSQL instalado y corriendo
- [ ] Base de datos `eli` creada en pgAdmin
- [ ] Archivo `.env` configurado con credenciales correctas
- [ ] `npx prisma generate` ejecutado sin errores
- [ ] `npx prisma migrate dev` ejecutado sin errores
- [ ] Tablas visibles en pgAdmin
- [ ] `npm run prisma:seed` ejecutado sin errores
- [ ] Datos visibles en Prisma Studio
- [ ] Login funciona con credenciales de prueba

---

## 🎯 Próximos Pasos

Una vez que la base de datos esté conectada:

1. **Conectar el frontend con las APIs** (siguiente paso)
2. Implementar SWR o React Query
3. Reemplazar datos mock con datos reales
4. Agregar manejo de errores y loading states

---

## 📞 Comandos Útiles

```bash
# Ver el estado de la base de datos
npx prisma db pull

# Resetear la base de datos (¡CUIDADO! Borra todos los datos)
npx prisma migrate reset

# Abrir Prisma Studio
npx prisma studio

# Ver logs de Prisma
npx prisma db push --preview-feature

# Formatear el schema
npx prisma format
```

---

## 🔐 Seguridad

**⚠️ IMPORTANTE:**

1. **NUNCA** subas el archivo `.env` a Git
2. Verifica que `.env` esté en `.gitignore`
3. En producción, usa variables de entorno del hosting
4. Cambia `NEXTAUTH_SECRET` en producción
5. Usa contraseñas fuertes para PostgreSQL

---

¿Listo para empezar? Sigue los pasos en orden y avísame si tienes algún problema.
