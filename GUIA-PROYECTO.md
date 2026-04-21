# Guía del Proyecto Eli

## 📋 Descripción General
Eli es una aplicación Next.js 16 para gestión de reservas y clientes en negocios de bienestar y salud. Utiliza el App Router de Next.js con TypeScript, Tailwind CSS y componentes de UI basados en Radix UI.

---

## 🏗️ Arquitectura del Proyecto

Este proyecto sigue la arquitectura de **Next.js App Router**, que NO utiliza el patrón tradicional MVC (Modelo-Vista-Controlador). En su lugar, usa:

### Estructura de Carpetas Principal

```
Eli/
├── app/                    # 📱 RUTAS Y PÁGINAS (Vistas)
├── components/             # 🧩 COMPONENTES REUTILIZABLES (Vistas)
├── lib/                    # 🛠️ UTILIDADES Y HELPERS
├── hooks/                  # 🎣 CUSTOM HOOKS DE REACT
├── public/                 # 📁 ARCHIVOS ESTÁTICOS
└── styles/                 # 🎨 ESTILOS GLOBALES
```

---

## 📱 VISTAS (app/)

En Next.js App Router, las **vistas** están en la carpeta `app/`. Cada carpeta representa una ruta.

### Estructura de Rutas

```
app/
├── layout.tsx              # Layout raíz (wrapper de toda la app)
├── page.tsx                # Página principal (Landing page)
├── globals.css             # Estilos globales
│
├── iniciar-sesion/         # Ruta: /iniciar-sesion
│   └── page.tsx            # Vista de login
│
├── crear-cuenta/           # Ruta: /crear-cuenta
│   └── page.tsx            # Vista de registro
│
└── dashboard/              # Ruta: /dashboard
    ├── layout.tsx          # Layout del dashboard (sidebar)
    ├── page.tsx            # Vista principal del dashboard
    │
    ├── calendario/         # Ruta: /dashboard/calendario
    │   └── page.tsx        # Vista del calendario
    │
    ├── chats/              # Ruta: /dashboard/chats
    │   └── page.tsx        # Vista de mensajería
    │
    └── pacientes/          # Ruta: /dashboard/pacientes
        └── page.tsx        # Vista de gestión de pacientes
```

### Convenciones de Next.js App Router

- `page.tsx` → Define una página accesible por URL
- `layout.tsx` → Define un layout compartido para rutas hijas
- Las carpetas definen las rutas (file-system based routing)

---

## 🧩 COMPONENTES (components/)

Los componentes son piezas reutilizables de UI. NO son controladores, son vistas modulares.

### Estructura de Componentes

```
components/
├── eli/                    # Componentes específicos de Eli
│   ├── app/                # Componentes del dashboard
│   │   ├── avatar-usuario.tsx
│   │   ├── barra-lateral.tsx
│   │   ├── barra-superior.tsx
│   │   ├── boton-primario.tsx
│   │   ├── burbuja-mensaje.tsx
│   │   ├── campo-formulario.tsx
│   │   ├── tarjeta-cita.tsx
│   │   ├── tarjeta-estadistica.tsx
│   │   └── tarjeta-paciente.tsx
│   │
│   ├── contact-section.tsx         # Sección de contacto (landing)
│   ├── dashboard-preview-section.tsx
│   ├── eli-logo.tsx
│   ├── footer.tsx
│   ├── header.tsx
│   ├── hero-section.tsx
│   ├── how-it-works-section.tsx
│   ├── loader.tsx
│   ├── target-section.tsx
│   └── what-is-section.tsx
│
├── ui/                     # Componentes base de shadcn/ui
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── label.tsx
│   └── ... (57 componentes UI)
│
└── theme-provider.tsx      # Provider de temas (dark/light)
```

### Tipos de Componentes

1. **Componentes de Landing** (`components/eli/`)
   - Secciones de la página principal
   - Header, Footer, Hero, etc.

2. **Componentes del Dashboard** (`components/eli/app/`)
   - Componentes específicos de la aplicación
   - Barras, tarjetas, formularios

3. **Componentes UI Base** (`components/ui/`)
   - Componentes primitivos de Radix UI
   - Botones, inputs, modales, etc.

---

## 🎯 ¿DÓNDE ESTÁN LOS CONTROLADORES Y MODELOS?

### ❌ NO HAY CONTROLADORES TRADICIONALES

En Next.js App Router:
- Los **Server Components** actúan como controladores
- La lógica se maneja directamente en los componentes
- Las **Server Actions** reemplazan los controladores de API

### ❌ NO HAY MODELOS DEFINIDOS (AÚN)

Actualmente el proyecto usa:
- **Datos hardcodeados** en los componentes
- **Interfaces TypeScript** para tipos de datos
- **NO hay base de datos** conectada

### 📍 Dónde DEBERÍAN estar (cuando se implementen):

```
# Estructura recomendada para el futuro:

lib/
├── actions/                # Server Actions (Controladores)
│   ├── auth.ts            # Acciones de autenticación
│   ├── appointments.ts    # Acciones de citas
│   └── patients.ts        # Acciones de pacientes
│
├── db/                     # Base de datos
│   ├── schema.ts          # Esquemas de Prisma/Drizzle
│   └── client.ts          # Cliente de DB
│
└── types/                  # Tipos TypeScript (Modelos)
    ├── user.ts
    ├── appointment.ts
    └── patient.ts
```

---

## 🛠️ UTILIDADES (lib/)

```
lib/
└── utils.ts                # Funciones helper (cn, clsx, etc.)
```

Aquí van funciones auxiliares como:
- Combinación de clases CSS
- Formateo de fechas
- Validaciones
- Helpers generales

---

## 🎣 HOOKS PERSONALIZADOS (hooks/)

```
hooks/
├── use-mobile.ts           # Detecta si es móvil
└── use-toast.ts            # Manejo de notificaciones
```

Custom hooks de React para lógica reutilizable.

---

## 📁 ARCHIVOS ESTÁTICOS (public/)

```
public/
├── images/
│   └── eli-logo.png
├── icon.svg
├── placeholder-user.jpg
└── ...
```

Imágenes, iconos y assets estáticos accesibles públicamente.

---

## 🎨 ESTILOS (styles/ y app/)

```
styles/
└── globals.css             # Estilos globales adicionales

app/
└── globals.css             # Estilos globales principales
```

- Usa **Tailwind CSS** para estilos
- Variables CSS personalizadas para temas
- Paleta de colores en tonos morados/azules

---

## 🔄 FLUJO DE DATOS ACTUAL

```
Usuario → Página (app/) → Componente → Datos Hardcodeados
```

### Ejemplo: Dashboard

1. Usuario navega a `/dashboard`
2. Se renderiza `app/dashboard/page.tsx`
3. El componente tiene datos de ejemplo:
   ```typescript
   const estadisticasHoy = [
     { titulo: "Citas hoy", valor: 8, ... },
     ...
   ]
   ```
4. Se pasan a componentes hijos como `<TarjetaEstadistica />`

---

## 🚀 PRÓXIMOS PASOS RECOMENDADOS

### 1. Implementar Backend
```
lib/
├── actions/                # Server Actions
├── db/                     # Base de datos
└── types/                  # Modelos TypeScript
```

### 2. Agregar Autenticación
- NextAuth.js o Supabase Auth
- Proteger rutas del dashboard
- Gestión de sesiones

### 3. Conectar Base de Datos
- Prisma o Drizzle ORM
- PostgreSQL, MySQL o MongoDB
- Migraciones y seeders

### 4. Gestión de Estado
- Zustand o Context API
- Para estado global de usuario
- Cache de datos

---

## 📦 TECNOLOGÍAS PRINCIPALES

- **Framework**: Next.js 16 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS 4
- **UI Components**: Radix UI + shadcn/ui
- **Animaciones**: Framer Motion
- **Formularios**: React Hook Form + Zod
- **Iconos**: Lucide React

---

## 🎯 RESUMEN RÁPIDO

| Concepto | Ubicación | Descripción |
|----------|-----------|-------------|
| **Vistas/Páginas** | `app/` | Rutas y páginas de la aplicación |
| **Componentes** | `components/` | Piezas reutilizables de UI |
| **Controladores** | ❌ No existen | Se usarán Server Actions en `lib/actions/` |
| **Modelos** | ❌ No existen | Se definirán en `lib/types/` o `lib/db/` |
| **Utilidades** | `lib/` | Funciones helper |
| **Hooks** | `hooks/` | Custom hooks de React |
| **Estilos** | `app/globals.css` | Estilos globales |
| **Assets** | `public/` | Imágenes y archivos estáticos |

---

## 📝 NOTAS IMPORTANTES

1. **No es MVC tradicional**: Next.js usa un enfoque basado en componentes
2. **Server Components**: Los componentes pueden ser del servidor o cliente
3. **File-system routing**: Las carpetas en `app/` definen las rutas
4. **Datos hardcodeados**: Actualmente no hay backend real
5. **TypeScript**: Todo está tipado para mayor seguridad

---

## 🔗 ENLACES ÚTILES

- [Next.js App Router](https://nextjs.org/docs/app)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com)
- [shadcn/ui](https://ui.shadcn.com)
