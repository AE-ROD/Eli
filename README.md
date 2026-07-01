# 🏥 Eli - Sistema de Gestión para Negocios de Bienestar

Sistema completo de gestión de citas, pacientes y comunicación para negocios de salud y bienestar.

## 🚀 Inicio Rápido

### Prerequisitos
- Node.js 18+
- PostgreSQL 14+
- npm o pnpm

### Instalación

1. **Clonar e instalar dependencias**
```bash
git clone https://github.com/AE-ROD/Eli.git
cd Eli
npm install
```

2. **Configurar base de datos**
```bash
# Crear base de datos en PostgreSQL
createdb eli

# Configurar .env (ver .env.example)
cp .env.example .env
# Edita .env con tus credenciales
```

3. **Configurar Prisma y datos de prueba**
```bash
npm run db:setup
```

4. **Iniciar servidor de desarrollo**
```bash
npm run dev
```

5. **Abrir en navegador**
```
http://localhost:3000
```

### Credenciales de Prueba
- Email: `admin@eli.com`
- Password: `password123`

---

## 📚 Documentación

- **[INICIO-RAPIDO.md](INICIO-RAPIDO.md)** - Guía de 5 minutos para empezar
- **[GUIA-CONEXION-BD.md](GUIA-CONEXION-BD.md)** - Guía detallada de conexión a PostgreSQL
- **[GUIA-PROYECTO.md](GUIA-PROYECTO.md)** - Estructura y arquitectura del proyecto
- **[ESTADO-PROYECTO.md](ESTADO-PROYECTO.md)** - Estado actual y roadmap

---

## 🛠️ Stack Tecnológico

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS 4
- **UI Components**: Radix UI + shadcn/ui
- **Animaciones**: Framer Motion
- **Formularios**: React Hook Form + Zod
- **Iconos**: Lucide React

### Backend
- **ORM**: Prisma
- **Base de Datos**: PostgreSQL
- **Autenticación**: NextAuth.js
- **Validación**: Zod
- **Encriptación**: bcryptjs

---

## 📁 Estructura del Proyecto

```
Eli/
├── app/                    # Páginas y rutas (Next.js App Router)
│   ├── api/               # API Routes
│   ├── dashboard/         # Dashboard protegido
│   ├── iniciar-sesion/    # Login
│   └── crear-cuenta/      # Registro
│
├── components/            # Componentes React
│   ├── eli/              # Componentes específicos de Eli
│   └── ui/               # Componentes base (shadcn/ui)
│
├── lib/                   # Utilidades y configuración
│   ├── auth.ts           # Configuración de NextAuth
│   ├── prisma.ts         # Cliente de Prisma
│   └── utils.ts          # Funciones helper
│
├── prisma/               # Base de datos
│   ├── schema.prisma     # Esquema de la BD
│   └── seed.ts           # Datos de prueba
│
├── hooks/                # Custom React Hooks
├── public/               # Archivos estáticos
└── styles/               # Estilos globales
```

---

## 🎯 Características

### ✅ Implementado
- 🎨 Diseño UI/UX profesional
- 🔐 Autenticación con NextAuth.js (credenciales + Google)
- 👥 Gestión de pacientes (CRUD)
- 📅 Sistema de citas y agendamiento público (CRUD + reserva online)
- 👨‍👩‍👧 Equipo multi-trabajador con invitaciones por email
- 💬 Chat/Mensajería
- 📊 Dashboard con estadísticas conectado a datos reales
- 📧 Notificaciones y recordatorios por email (Resend)
- 📱 Diseño responsive
- 🎭 Animaciones fluidas
- 🗄️ Base de datos PostgreSQL con Prisma

### 🚧 En Desarrollo
- 💳 Pagos en línea (Stripe) — la UI de precios existe, falta la integración
- 📄 Exportar reportes PDF
- 📱 Notificaciones push
- 🔄 Sincronización con Google Calendar
- 🔑 Recuperación de contraseña
- 🧪 Tests y CI/CD

---

## 🗄️ Modelo de Datos

```
User (Usuario)
  ├── Business (Negocio)
      ├── Patient (Pacientes)
      │   └── Appointment (Citas)
      └── Conversation (Conversaciones)
          └── Message (Mensajes)
```

---

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Iniciar servidor de desarrollo
npm run build            # Build para producción
npm run start            # Iniciar servidor de producción

# Base de Datos
npm run db:setup         # Setup completo (generate + migrate + seed)
npm run prisma:generate  # Generar cliente de Prisma
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:seed      # Cargar datos de prueba
npm run prisma:studio    # Abrir Prisma Studio

# Otros
npm run lint             # Ejecutar ESLint
```

---

## 🌐 Variables de Entorno

Crea un archivo `.env` en la raíz:

```env
# Base de Datos
DATABASE_URL="postgresql://postgres:password@localhost:5432/eli"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="tu-secreto-super-seguro"

# Environment
NODE_ENV="development"
```

---

## 📊 Estado del Proyecto

Frontend, backend e integración están completos y funcionando end-to-end. Antes de producción falta: facturación (Stripe), rate limiting, recuperación de contraseña, tests y CI.

Ver [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md) para el detalle completo.

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📝 Licencia

Este proyecto es privado y está bajo desarrollo.

---

## 👨‍💻 Autor

**Alejandro Rodríguez**
- GitHub: [@AE-ROD](https://github.com/AE-ROD)

---

## 🙏 Agradecimientos

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)

---

## 📞 Soporte

¿Problemas? Revisa la documentación:
- [INICIO-RAPIDO.md](INICIO-RAPIDO.md) - Para empezar rápido
- [GUIA-CONEXION-BD.md](GUIA-CONEXION-BD.md) - Problemas con la base de datos
- [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md) - Estado y roadmap

---

**Hecho con ❤️ para profesionales del bienestar y la salud**
