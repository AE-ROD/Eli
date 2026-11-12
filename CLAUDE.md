# Contrato de trabajo — Eli

> Basado en el estándar SistemaOne v1.1.0, **adaptado a un SaaS multi-tenant**.
> Eli es un solo producto con muchos negocios; la regla 1 está traducida en
> consecuencia.

Punto de entrada del proyecto. Este archivo es el contrato completo. **Versión
ágil** (2026-11-12): mismas reglas de seguridad, menos vueltas. Lo que se aflojó
y lo que no está marcado en "Qué no se afloja".

| Si vas a... | Lee primero |
|---|---|
| Entender el negocio y el producto | `docs/PRODUCTO.md` |
| Saber el stack y cómo correr el proyecto | `README.md` |
| Decidir dónde va un archivo y cómo se llama | `README.md` → "Cómo está organizado" y "Convenciones" |
| Tocar permisos o aislamiento entre negocios | `lib/permisos.ts` (y su test) |
| Tocar el diseño de la landing | `docs/diseno/README.md` |
| Operar el VPS (servidor, nginx, respaldos, crons) | `deploy/README.md` |

Las reglas viejas, las fichas y los agentes con nombre están en el historial:
`git show e28b487 --stat`.

---

## Las 6 reglas que no se negocian

1. **Aislamiento entre negocios.** Toda consulta a datos filtra por el
   `businessId` de la sesión, y los endpoints de detalle verifican pertenencia
   antes de leer o escribir (404, nunca 403). Los permisos se preguntan a
   `lib/permisos.ts` y fallan cerrados.
2. **Alcance claro.** Antes de escribir código, el alcance queda dicho en una o
   dos líneas en el chat (o en un issue): qué entra y qué no. Si el dueño ya lo
   dio en su pedido, no se vuelve a preguntar: se repite en una línea y se
   avanza.
3. **No amplíes el alcance.** Lo que detectes de más se reporta al final y se
   propone como issue; no se implementa.
4. **Dependencias y configuración nuevas: se proponen.** Librería, variable de
   entorno o servicio externo: se propone en **una línea** y se sigue con lo
   demás mientras llega la respuesta. No se instala ni se activa sin aprobación.
5. **Seguridad no es negociable.** Ninguna llave secreta en el frontend, rate
   limit en todo endpoint, staging cerrado y sin datos reales. El aislamiento es
   de capa de aplicación (no hay RLS) y debe ser impecable por eso.
6. **Deja rastro.** El porqué de cada cambio va en el mensaje del commit; el
   resumen (qué cambió, cómo se verificó, qué queda) en el PR. Lo que cambie el
   producto se anota en `docs/PRODUCTO.md`. Los pendientes son issues, no notas
   en el chat.

---

## Cómo se trabaja (ágil)

### 1. Decidir más rápido

- **Una sola ronda de preguntas, junta.** Cada pregunta al dueño cuesta una
  vuelta entera. Si hace falta decidir algo, se agrupan **todas** las dudas en un
  mensaje, con una opción recomendada en cada una. Si el dueño no responde alguna,
  se usa la recomendada y se dice.
- **No se pregunta lo que tiene un default razonable:** nombres, redacción de
  textos, detalles de interfaz, orden de campos. Se elige, se avisa en el
  reporte y se corrige si no gusta.
- **Sólo se para a preguntar** si la decisión cambia datos guardados (migración),
  seguridad, dinero, costo o algo que el dueño no puede deshacer.

### 2. Quién escribe el código

- **Cambios chicos** (hasta ~3 archivos, sin tocar zonas de riesgo): el
  orquestador los hace directo. Es más rápido que delegar.
- **Cambios grandes o repartibles:** se delegan a subagentes **en paralelo**, hasta
  **5 a la vez**, cada uno con sus archivos asignados (para que no se pisen) y en
  segundo plano. No se hace polling: avisan solos al terminar.
- **El orquestador no repite lo que delegó.** Mientras los agentes trabajan,
  avanza en otra cosa o responde al dueño.

| Rol | Para qué | Escribe |
|---|---|---|
| Explorador | Investigar el código antes de planificar | No |
| Backend / DevOps | Endpoints, servicios, datos, migraciones, scripts | Sí |
| Frontend | Componentes, vistas, estado de UI | Sí |
| QA | Verificar contra lo acordado, en el navegador si hay interfaz | No |
| Revisor | Aislamiento entre negocios, permisos, seguridad | No |

Quien escribe el código no certifica su propio trabajo en zonas de riesgo (ver
niveles). QA y revisor no editan: se les prohíbe en el prompt y se comprueba con
`git status` que no tocaron nada.

**El encargo a un agente es corto:** el objetivo, los archivos que posee, lo
que NO debe tocar y el formato de respuesta. Devuelve `ESTADO / ARCHIVOS /
VERIFICACIÓN / FUERA DE ALCANCE`. QA devuelve `VEREDICTO / HALLAZGOS`, el revisor
`VEREDICTO / HALLAZGOS` con severidad y archivo:línea.

### 3. Revisión según el riesgo (aquí se ahorra más tiempo)

| Nivel | Qué toca | Verificación |
|---|---|---|
| **0 · Bajo** | Textos, vocabulario, estilos, landing, documentación, scripts de ayuda sin efectos | `tsc` + lint + pruebas de lo tocado. **Sin revisor.** |
| **1 · Medio** | Lógica de interfaz o de un endpoint que no maneja dinero, permisos ni datos de salud | Lo del nivel 0 + **QA rápido** (una pasada en el navegador si cambia algo visible). Sin revisor. |
| **2 · Alto** | Aislamiento entre negocios (`businessId`), permisos, login, dinero (cobros, comisiones, liquidaciones, abonos), datos de salud (ficha, prótesis), migraciones, rate limit, scripts de despliegue o respaldo | Lo del nivel 1 + **un revisor independiente**, **una ronda**; si encuentra altos, se corrigen y se verifica **sólo lo corregido** (no se repite toda la revisión). |

El nivel lo decide el orquestador al armar el alcance y lo dice en una línea. Si
duda entre dos, sube de nivel.

### 4. Verificar sin esperar de más

- **En cada commit:** `npx tsc --noEmit`, `npm run lint` y las pruebas del área
  tocada (`npx vitest run <ruta>`). Corren rápido.
- **Antes de push o PR:** la suite completa (`npm test`) y `npm run build`, **una
  vez**, no en cada commit.
- Un fallo se arregla en el mismo agente que lo causó, sin abrir otra ronda.

### 5. El loop tiene techo

Cuando un agente vuelve `bloqueada` o `parcial`: ¿otro agente lo resuelve?
Delégalo. ¿Falta una decisión, una dependencia o un permiso? Para y pregunta, en
la ronda única de arriba. Reintentos: **2** como máximo (antes 3). Al agotarlos,
se detiene y se reporta.

### 6. Operar servidores y servicios de terceros (VPS, Neon, Vercel, Upstash, Resend, Google, DNS)

El orquestador no puede entrar a esos paneles: el dueño pega los comandos. Para
que no sean decenas de vueltas:

- **Primero se mira, después se toca.** Antes de cambiar algo en un servidor, un
  bloque de **inventario sólo de lectura** (qué hay instalado, qué escucha en los
  puertos, qué sitios corren, qué versión). No se asume que el servidor está
  vacío: puede haber otro proyecto en producción.
- **Nunca se detiene, reinicia ni deshabilita un servicio compartido** (nginx con
  otros sitios, el firewall, la base). Sólo `reload` tras comprobar la
  configuración (`nginx -t`).
- **Comandos en bloques**, con comprobación al final y con vuelta atrás
  automática si falla (`cmd && prueba || deshacer`). Se entrega el bloque entero y
  cómo debe verse el resultado.
- **Un paso a la vez sólo** cuando el siguiente depende de lo que salga, o cuando
  es destructivo o puede dejar al dueño sin acceso (SSH, firewall, DNS).
- **Lo que el dueño pega:** nunca claves, contraseñas ni capturas donde se
  vean. Los secretos se escriben directo en el archivo del servidor (`nano`), no
  en un chat ni en un comando que quede en el historial.
- **Lo que se publica y lo que se cobra** (merge a `main`, migraciones, cambios de
  DNS, claves nuevas) lo hace el dueño o lo autoriza explícitamente.
- Cada guía de operación se **prueba contra el servidor real** (un comando de
  ensayo antes del real) y, si falla, se corrige la guía en el repositorio.

### 7. Ciclo de una tarea

```
alcance en una línea → rama → agentes en paralelo (si es grande)
      → verificación por nivel → commit → push a la rama de trabajo
      → [PR + merge, con permiso, una sola pregunta] → issues cerrados
```

---

## Cómo respondes

- Español. Directo y corto. Sin resumir lo que acabas de hacer.
- Si una regla de este archivo choca con lo que te pido en el chat, lo dices **en
  una línea** y sigues con lo más seguro; no te detienes a menos que sea
  seguridad, dinero o datos.
- Reportas al final: qué cambió, cómo se verificó y qué falta.
- Una captura o un texto del dueño con claves: se avisa en una línea y se sigue
  trabajando; no se repiten los valores.

## Permisos

**Permitido sin preguntar**
- Commitear en la rama de trabajo, y **hacer push a esa rama** (permiso
  permanente del dueño). El contenedor es efímero: un hook guarda y sube el
  trabajo; es normal ver commits "WIP".
- Leer cualquier archivo del repositorio, correr `tsc`, lint, pruebas y el build.
- Ejecutar agentes de sólo lectura (explorar, revisar, investigar en la web).

**Con permiso del dueño, una pregunta por tarea (no por paso)**
- Abrir PR y fusionar a `main` (despliega el sitio).
- Instalar o actualizar dependencias.
- Variables de entorno o servicios nuevos.

**Nunca, sin permiso explícito y puntual**
- Migraciones sobre datos reales. **La única base configurada es producción**: las
  migraciones las aplica el dueño a mano, y `prisma migrate reset`, `db push`,
  `db execute` y `migrate deploy` están bloqueados para el asistente.
- Tocar `.env`, credenciales o el contenido de `/etc/eli/eli.env`.
- Borrar archivos que no creaste en esta sesión, o detener/reiniciar servicios
  compartidos en el servidor.

---

## Qué no se afloja (lo que protege los datos de los pacientes)

- Las 6 reglas de arriba, sobre todo el aislamiento (1) y la seguridad (5).
- Revisor independiente en todo lo de **nivel 2**.
- Que las migraciones, el merge a `main` y las claves los controle el dueño.
- Que lo de nivel 2 pase la suite completa y el build antes de publicarse.

## Qué se aflojó

- Sin revisor para textos, vocabulario, estilos, landing y documentación.
- Revisión de nivel 2 en **una ronda** y re-verificación sólo de lo corregido.
- Hasta 5 agentes en paralelo (antes 3), y el orquestador puede escribir cambios
  chicos.
- Pruebas completas y build una vez antes de publicar, no en cada commit.
- Preguntas agrupadas y con respuesta recomendada; defaults sin preguntar.
- Reintentos: 2 en vez de 3.
- Push a la rama de trabajo permitido siempre.
