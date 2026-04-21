# 🚀 Inicio Rápido - Conectar Base de Datos

## ⚡ Pasos Rápidos (5 minutos)

### 1️⃣ Configurar PostgreSQL

**Opción A: Si ya tienes PostgreSQL instalado**
1. Abre pgAdmin
2. Crea una base de datos llamada `eli`
3. Anota tu contraseña de PostgreSQL

**Opción B: Si NO tienes PostgreSQL**
```bash
# En macOS con Homebrew
brew install postgresql@14
brew services start postgresql@14

# Crear usuario y base de datos
createdb eli
```

---

### 2️⃣ Configurar Variables de Entorno

Edita el archivo `.env` en la raíz del proyecto:

```env
# Reemplaza "TU_PASSWORD" con tu contraseña real de PostgreSQL
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/eli"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="genera-uno-con-openssl-rand-base64-32"

# Environment
NODE_ENV="development"
```

**Para generar NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

---

### 3️⃣ Instalar Dependencia Faltante

```bash
npm install -D tsx
```

---

### 4️⃣ Configurar Base de Datos (Un solo comando)

```bash
npm run db:setup
```

Este comando hace todo automáticamente:
- ✅ Genera el cliente de Prisma
- ✅ Crea las tablas en la base de datos
- ✅ Inserta datos de prueba

**Salida esperada:**
```
✅ Usuario creado: admin@eli.com
✅ 4 pacientes creados
✅ 5 citas creadas
✅ 3 conversaciones creadas

🎉 Seed completado exitosamente!

📝 Credenciales de prueba:
   Email: admin@eli.com
   Password: password123
```

---

### 5️⃣ Verificar que Funciona

**Opción 1: Prisma Studio (Recomendado)**
```bash
npm run prisma:studio
```
Se abre en `http://localhost:5555` - Verás todos tus datos.

**Opción 2: Probar Login**
```bash
npm run dev
```
1. Ve a `http://localhost:3000/iniciar-sesion`
2. Email: `admin@eli.com`
3. Password: `password123`
4. ¡Deberías poder entrar al dashboard!

---

## 🔧 Si Algo Sale Mal

### Error: "Can't reach database server"
```bash
# Verifica que PostgreSQL esté corriendo
brew services list

# Si no está corriendo:
brew services start postgresql@14
```

### Error: "password authentication failed"
- Verifica tu contraseña en el archivo `.env`
- Prueba conectarte con pgAdmin usando la misma contraseña

### Error: "database 'eli' does not exist"
```bash
# Crear la base de datos manualmente
createdb eli

# O créala desde pgAdmin
```

### Resetear todo y empezar de nuevo
```bash
# ⚠️ CUIDADO: Esto borra todos los datos
npx prisma migrate reset
npm run db:setup
```

---

## 📋 Comandos Útiles

```bash
# Ver datos en interfaz visual
npm run prisma:studio

# Regenerar cliente de Prisma
npm run prisma:generate

# Crear nueva migración
npm run prisma:migrate

# Volver a cargar datos de prueba
npm run prisma:seed

# Todo en uno (setup completo)
npm run db:setup
```

---

## ✅ Checklist

- [ ] PostgreSQL instalado y corriendo
- [ ] Base de datos `eli` creada
- [ ] Archivo `.env` configurado
- [ ] `npm install -D tsx` ejecutado
- [ ] `npm run db:setup` ejecutado sin errores
- [ ] Prisma Studio muestra datos
- [ ] Login funciona con `admin@eli.com`

---

## 🎯 Siguiente Paso

Una vez que todo funcione, el siguiente paso es:
**Conectar el frontend con el backend** (reemplazar datos mock con datos reales)

Ver: `GUIA-CONEXION-BD.md` para más detalles.

---

## 💡 Datos de Prueba Creados

### Usuario
- Email: `admin@eli.com`
- Password: `password123`
- Negocio: "Salón de Belleza Demo"

### Pacientes
- María García (VIP)
- Carlos Rodríguez (Nuevo)
- Ana Pérez (Frecuente)
- Luis Martínez (VIP)

### Citas
- 4 citas para hoy
- 1 cita para mañana

### Conversaciones
- 3 conversaciones con mensajes

---

¿Problemas? Revisa `GUIA-CONEXION-BD.md` para solución de problemas detallada.
