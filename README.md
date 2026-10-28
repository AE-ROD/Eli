# Eli

Sistema de reservas para **salones de belleza, barberías y spas de uñas**. Cada
negocio tiene su agenda, su equipo y su página pública de reserva; los
profesionales cobran un porcentaje del servicio que atienden.

Qué es, para quién y qué falta decidir: `docs/PRODUCTO.md`.

## Levantarlo

```bash
npm ci                 # instala exactamente lo que fija package-lock.json
npx prisma generate    # genera el cliente de la base
npm run dev
```

Necesita un `.env` con:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres (Neon), conexión con pool. |
| `DIRECT_URL` | Postgres directo. Sólo lo usan las migraciones. |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Sesiones. `NEXTAUTH_URL` arma los enlaces de los correos; de `NEXTAUTH_SECRET` se deriva la firma del enlace de baja de los correos de prueba. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Entrar con Google. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Correos. Sin esto no se envían, pero nada se rompe. |
| `SOPORTE_EMAIL` | Casilla que recibe las solicitudes de soporte (`/soporte` y `/dashboard/ayuda`). Sin esto la solicitud se guarda igual y el usuario recibe su acuse, pero no llega aviso a soporte. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. En desarrollo, sin esto queda desactivado. **En producción es obligatorio:** sin él el límite falla cerrado y todo endpoint responde 429. |
| `CRON_SECRET` | Protege los crons (recordatorios y correos del ciclo de prueba). |

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # build de producción
npm run lint           # eslint
npm test               # vitest
npx tsc --noEmit       # chequeo de tipos
npx prisma studio      # ver la base
```

Si movés o renombrás una ruta, corré `npx next typegen` antes de `tsc`: los
tipos de las rutas viven en `.next/types` y quedan viejos hasta el próximo build.

## Una base de desarrollo, para no tocar producción

`DATABASE_URL` apunta a Neon, que es **producción**: `migrate dev`, `db push` y
`migrate reset` van contra datos reales. Para trabajar tranquilo, levantá una
base local y apuntá el `.env` ahí.

Con Postgres instalado:

```bash
initdb -D ~/eli-pg -A trust -U postgres
pg_ctl -D ~/eli-pg -o '-p 5433' start
createdb -h localhost -p 5433 -U postgres eli
```

Aplicá las migraciones con `psql` en vez de con Prisma, para no arriesgarte a
que un comando salga apuntando a Neon:

```bash
for f in prisma/migrations/*/migration.sql; do
  psql -h localhost -p 5433 -U postgres -d eli -v ON_ERROR_STOP=1 -f "$f"
done
```

En el `.env`, `DATABASE_URL` y `DIRECT_URL` pasan a
`postgresql://postgres@localhost:5433/eli?schema=public`. Después:

```bash
SEED_CONFIRMO=si npm run prisma:seed
```

El seed se niega a correr si falta `SEED_CONFIRMO=si` **o** si el host de
`DATABASE_URL` no es `localhost` ni `127.0.0.1`. Para sembrar una base de
desarrollo remota, su host tiene que estar en `SEED_HOSTS_PERMITIDOS` (lista
separada por comas, p. ej. `SEED_HOSTS_PERMITIDOS=mi-base-de-desarrollo.example`).
Nunca pongas ahí el host de producción.

Quedan un negocio de ejemplo y tres cuentas —`duena@demo.eli`,
`encargado@demo.eli`, `profesional@demo.eli`, una por rol, que es la forma
corta de ver qué cambia con cada uno. La contraseña la imprime el seed al
terminar (está en `prisma/seed.ts`).


## Migraciones en producción

Las migraciones nuevas se aplican a mano con `psql` contra `DIRECT_URL`
(`-v ON_ERROR_STOP=1 -f prisma/migrations/<carpeta>/migration.sql`) y después
se marcan como aplicadas para que Prisma no las vuelva a correr:

```bash
npx prisma migrate resolve --applied <carpeta>
```

### `20261022120000_ganchos_de_activacion`

Rompe la compatibilidad en los dos sentidos: el código viejo falla al crear
negocios con la migración aplicada (`pruebaTerminaEl` y `codigoInvitacion` son
NOT NULL sin default) y el código nuevo falla sin ella. Por eso:

1. Dejar el despliegue del código nuevo construido y listo para promover.
2. En una ventana tranquila (sin registros en curso), aplicar la migración. Va
   envuelta en `BEGIN; … COMMIT;`: si falla, no queda nada a medias.
3. Inmediatamente después, promover el despliegue del código nuevo.
4. `npx prisma migrate resolve --applied 20261022120000_ganchos_de_activacion`.

### `20261026120000_solicitudes_de_soporte`

Aditiva: sólo crea la tabla `solicitudes_de_soporte`. El código viejo no la
usa, así que se puede aplicar antes de desplegar; el código nuevo la necesita
para `POST /api/soporte`. Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261026120000_solicitudes_de_soporte`.

### `20261027120000_etapa_1_antes_de_vender`

Aditiva: columnas nuevas nullable o con default en `negocios`,
`miembros_negocio`, `clientes`, `servicios` y `citas`, y las tablas nuevas
`member_services` y `time_blocks`. El código viejo no las usa, así que se
puede aplicar antes de desplegar. Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261027120000_etapa_1_antes_de_vender`.

## Cómo está organizado

```
app/                          Pantallas y endpoints (App Router de Next.js)
  (acceso)/                   Entrar, crear cuenta, completar perfil, recuperar
                              contraseña y unirse a un equipo. Los paréntesis
                              agrupan sin cambiar la URL.
  dashboard/                  El panel del negocio
    page.tsx                  Inicio del panel
    tablero/                  El día en columnas: llegadas, atención y cobro
    reportes/                 Historial de lo cobrado, con filtros
    agenda/  clientes/  configuracion/  equipo/
    chats/                    Escondido: redirige al inicio hasta que exista WhatsApp
  reservar/[slug]/            Página pública donde el cliente final reserva
  api/                        Endpoints: cada carpeta es una URL bajo /api
components/
  comunes/                    Componentes base del diseño: botones, campos, tarjetas, secciones, logo
  panel/                      Estructura del panel: barras, avatar, tarjeta de cita, modales
  landing/                    Secciones de la página de inicio
  movimiento/                 Tiempos de animación y patrones de movimiento de la landing
  proveedores.tsx             Sesión de NextAuth y MotionConfig (movimiento reducido) para toda la app
lib/                          Lógica compartida, cada archivo con su test al lado,
                              salvo cuatro: llegadas.ts y lineas-de-atencion.ts se
                              prueban a través de los tests de app/api/atenciones/,
                              y auth.ts y prisma.ts, que sólo conectan la sesión y
                              la base, los tests de ruta los reemplazan por mocks.
                              Los marcados (servidor) usan la base o la sesión:
                              nunca se importan desde un componente de cliente.
  permisos.ts                 Quién puede ver y hacer qué. Toda consulta pasa por acá
  atenciones.ts               Reglas del tablero: estados, pasos, cobro en centavos
  acciones-del-tablero.ts     Qué ofrece cada tarjeta del tablero según rol y estado
  medios-de-pago.ts           Los medios de pago que se aceptan
  reportes.ts                 Turnos por zona horaria y resumen de lo cobrado
  periodos.ts                 Rangos de fechas de los filtros de reportes
  dinero.ts                   Formato y lectura de montos
  fechas.ts                   Cálculos y formatos de fecha
  horario-dia.ts              La jornada de un profesional: citas y huecos del día,
                              y la conversión entre "HH:MM" y minutos
  nombres-de-roles.ts         Cómo se escribe cada rol (Encargado, Profesional). Sólo
                              la etiqueta: lo que puede hacer cada uno está en permisos.ts
  rubros.ts                   Los tres rubros que atiende Eli
  modulos.ts                  Los cinco módulos del panel: nombre, frase, ruta y color
  correos-de-prueba.ts        Qué correo del ciclo de prueba le toca hoy a un negocio
  baja-de-correos.ts          El token firmado del enlace "Dejar de recibir estos correos"
  cron.ts                     La autorización de los crons (CRON_SECRET)
  enviar-correo-de-prueba.ts  (servidor) Manda un correo del ciclo de prueba, con su
                              candado en CorreoDeCuenta para no repetirlo
  direccion-de-scroll.ts      Si el encabezado de la landing se muestra, se oculta o flota
  validaciones.ts             Esquemas zod compartidos: registro, reserva y contraseña.
                              El resto de los endpoints define el suyo en su route.ts
  peticiones.ts               Cómo la interfaz le pide cosas al servidor
  cuerpo-del-pedido.ts        Leer el JSON de un pedido sin que uno roto termine en 500
  slug.ts                     La dirección pública de cada negocio
  telefono.ts                 Teléfonos chilenos: a E.164 para guardar y con espacios
                              para mostrar
  clientes-eliminados.ts      Eliminar un cliente es anonimizarlo: qué se borra y cómo
                              se lo reconoce sin columna nueva (una etiqueta reservada)
  utils.ts                    `cn`, para combinar clases de Tailwind
  tablero.ts                  (servidor) Leer y tomar atenciones dentro de un endpoint
  lineas-de-atencion.ts       (servidor) Validar y guardar las líneas de una atención
  llegadas.ts                 (servidor) Registrar la llegada de una reserva
  auth.ts                     (servidor) Sesiones: credenciales y Google
  prisma.ts                   (servidor) Conexión a la base
  email.ts                    (servidor) Correos (Resend)
  rate-limit.ts               (servidor) Límite de peticiones (Upstash)
  invitaciones-de-equipo.ts   (servidor) Vigencia, enlace nuevo y correo de una
                              invitación al equipo (invitar, reemplazar una vencida, reenviar)
pruebas/                      Ayudas compartidas de los tests: la base falsa en memoria
                              con sus datos de ejemplo, pedidos y respuestas simulados.
                              Fuera de app/: no es una ruta ni entra al build
prisma/                       Esquema, migraciones y datos de ejemplo (seed.ts)
proxy.ts                      Puerta de entrada: sesión y límite de peticiones (con su test)
types/                        Tipos que extienden librerías (la sesión de NextAuth)
public/images/                El logo
docs/                         Producto (PRODUCTO.md) y sistema de diseño (diseno/)
prisma.config.ts              Dónde están el esquema y las migraciones, y el comando del seed
vercel.json                   Los crons diarios: recordatorios (9:00 UTC) y correos del
                              ciclo de prueba (13:00 UTC, ~10:00 en Chile)
.github/workflows/ci.yml      CI: lint, tipos, tests y build en cada PR a main
```

Cada vista del panel se arma igual:

```
<vista>/page.tsx              Sólo compone: estado, llamadas y componentes
<vista>/_datos.ts             Todo lo que la vista le pide al servidor. Devuelve
                              { ok } en vez de lanzar, y la pantalla no conoce URLs
<vista>/_componentes/         Las piezas que sólo usa esa vista
```

## Convenciones

- **Idioma.** El dominio se nombra en español: `cliente`, `cita`, `agenda`. El
  inglés queda sólo donde lo impone una herramienta:
  - los archivos especiales de Next (`page.tsx`, `layout.tsx`, `route.ts`,
    `proxy.ts`);
  - el esquema de Prisma, cuyos modelos y columnas ya existen en producción.
- **Archivos y carpetas** en kebab-case: `modal-nueva-cita.tsx`.
- **Componentes** en PascalCase y en español: `ModalNuevaCita`. La página de
  cada ruta se exporta como `Pagina<Nombre>`.
- **Dónde va cada cosa:**
  - lo que usa una sola vista vive en su `_componentes/`;
  - lo que usan varias, en `components/`;
  - la lógica sin pantalla, en `lib/`, con su test al lado.
- **Nombres que dicen qué contienen**, con palabras completas: `respuesta`, no
  `res`; `servicio`, no `s`.
- **Diseño:** tokens y componentes base en `docs/diseno/README.md`; se usan
  sus clases (`bg-crema`, `rounded-tarjeta`), no colores ni medidas sueltos.

## Decisiones técnicas que no se tocan sin pensarlo

- **El esquema de Prisma y sus migraciones ya están aplicados en producción
  (Neon).** Para renombrar un modelo o un campo se usa `@map`: así se pasó de
  `Patient` a `Customer` sin tocar la base. Cambiar una columna de verdad pide
  una migración sobre datos reales.
- **Dinero en centavos.** Las tablas del tablero (atenciones, sus líneas y sus
  pagos) guardan centavos enteros (`priceCents`, `amountCents`, `totalCents`),
  con topes que no desbordan un `Int`. Las tablas anteriores (`Service.price`,
  `Appointment.price`) siguen en `Float`. La API habla en unidades y toda suma o
  comparación de dinero se hace en centavos (`lib/atenciones.ts`): 0,1 + 0,2
  tiene que dar 0,3 cuando se cuadra una caja.
- **NextAuth sigue en v4.** Auth.js v5 existe, pero migrar rompe lo que funciona
  sin aportar valor.
- **Vercel Hobby prohíbe el uso comercial.** Antes de cobrar hay que pasar a Pro
  o mover el despliegue.
- **Resend:** falta verificar el dominio (SPF/DKIM) o los correos caen en spam.
- **Pagos online:** los precios están decididos (`docs/PRODUCTO.md`, sección 4,
  y `lib/precios.ts`), pero todavía no se cobra. Falta elegir la pasarela:
  Flow quedó descartado (su cargo automático es sólo para empresas) y Mercado
  Pago está en evaluación.
- **Content-Security-Policy con nonce.** `proxy.ts` arma la CSP en cada
  petición con un nonce nuevo (`lib/csp.ts`) y el layout raíz fuerza el render
  por petición (`connection()`): sin eso las páginas saldrían del build sin
  nonce y el navegador les bloquearía el JS. **Cualquier script, estilo, fuente,
  imagen o servicio de terceros nuevo (analítica, chat, mapas, pagos, CDN) hay
  que agregarlo a propósito en `lib/csp.ts`**, con un test; si no, el
  navegador lo bloquea en producción. No se vuelve a poner una CSP en
  `next.config.mjs`: dos CSP se aplican a la vez y la estática, sin nonce,
  rompería los scripts de Next.

## Cómo se trabaja acá

Lee `CLAUDE.md`: es el contrato de trabajo. En resumen:

- el alcance de cada tarea se acuerda antes de escribir código;
- los permisos se preguntan siempre a `lib/permisos.ts`, nunca comparando roles
  a mano.
