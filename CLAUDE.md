# Contrato de trabajo — Eli

> Basado en el estándar SistemaOne v1.1.0, **adaptado a un SaaS multi-tenant**.
> El original asume modelo de agencia (`core/` vs `clientes/<slug>/`); Eli es un
> solo producto con muchos negocios. La regla 1 está traducida en consecuencia.
>
> **Versión ágil, por orden del dueño.** El ciclo anterior (el hilo principal
> sólo orquesta y no escribe código, QA y revisor como agentes aparte después de
> cada etapa, máximo 3 agentes, build completo en cada commit, preguntar ante
> cualquier duda) costaba horas de espera por tareas chicas. Se reemplazó por el
> "Modo ágil" de abajo. Las 6 reglas de seguridad y aislamiento NO cambian. El
> contrato estricto anterior está en el historial: `git log -p -- CLAUDE.md`.

Punto de entrada del proyecto. Este archivo es el contrato completo. Las reglas
de trabajo, las fichas de feature, los agentes con nombre y los comandos vivían
en `arquitectura_docs/`, que se borró a pedido del dueño del producto; lo que
queda del proceso es lo que está acá.

| Si vas a... | Lee primero |
|---|---|
| Entender el negocio y el producto | `docs/PRODUCTO.md` |
| Saber el stack y cómo correr el proyecto | `README.md` |
| Decidir dónde va un archivo y cómo se llama | `README.md` → "Cómo está organizado" y "Convenciones" |
| Tocar permisos o aislamiento entre negocios | `lib/permisos.ts` (y su test) |
| Tocar el diseño de la landing | `docs/diseno/README.md` |

Si hace falta recuperar las reglas, las fichas o los agentes, están en el
historial: `git show e28b487 --stat` los lista, y
`git checkout e28b487 -- arquitectura_docs .claude` los trae de vuelta enteros.

---

## Las 6 reglas que no se negocian

1. **Aislamiento entre negocios.** Toda consulta a datos filtra por el
   `businessId` de la sesión, y los endpoints de detalle verifican pertenencia
   antes de leer o escribir (404, nunca 403). Los permisos se preguntan a
   `lib/permisos.ts` y fallan cerrados.

2. **El alcance se acuerda una vez.** Se acuerda en el chat (o en un issue de
   GitHub) antes de escribir código, y no se empieza sin saber qué entra y qué
   no. Una vez acordado se ejecuta: no se vuelve a pedir confirmación de lo que
   ya está aprobado.

3. **No amplíes el alcance.** Haces lo acordado y nada más. Lo que detectes de
   más se reporta al final; no lo implementas.

4. **No inventes dependencias ni configuración.** Librería nueva, variable de
   entorno o servicio externo: se proponen y se espera aprobación. Lo que el
   dueño ya aprobó en el chat se instala sin volver a preguntar.

5. **Seguridad no es negociable.** Ninguna llave secreta en el frontend, rate
   limit en todo endpoint, staging cerrado y sin datos reales. RLS está aceptado
   como deuda documentada: el aislamiento hoy es de capa de aplicación y debe ser
   impecable justamente porque no hay una segunda barrera detrás.

6. **Deja rastro, sin burocracia.** El porqué de cada cambio va en el mensaje
   del commit. Lo que cambie el producto se anota en `docs/PRODUCTO.md` al cerrar
   el bloque de trabajo, no en cada commit. Lo que quede pendiente se reporta al
   final del bloque.

---

## Modo ágil

### Quién hace el trabajo

- **Claude ejecuta.** Lee, escribe, prueba y commitea él mismo. Es el modo por
  defecto, también para cambios medianos y grandes.
- **Subagentes sólo cuando ahorran tiempo de verdad:** (a) áreas de archivos
  distintas que se pueden hacer a la vez, (b) migraciones mecánicas de muchos
  archivos, (c) leer mucho código para responder una pregunta. Hasta 4 a la vez,
  nunca dos sobre los mismos archivos.
- A un subagente se le da una tarea **completa** (leer, escribir y probar su
  área), con lo acordado y la lista de archivos que puede tocar. No hace commits:
  los hace Claude. Los roles (Explorador, Backend, Frontend) son etiquetas para
  el prompt, no etapas obligatorias.
- Informe de un subagente: `ESTADO / ARCHIVOS / QUÉ HICE / VERIFICACIÓN /
  SIGUIENTE`, máximo 250 palabras.

### Preguntas y permisos

- No se pregunta por lo ya acordado ni por detalles reversibles. Se elige la
  opción recomendada, se dice en una línea y se sigue.
- **Sí se pregunta, y se espera,** cuando la decisión cambia lo que ve el usuario
  final o el comportamiento del producto, toca dinero, permisos o datos reales,
  trae una dependencia, servicio o variable de entorno nueva, o es difícil de
  revertir.
- Si una regla de este archivo choca con lo que el dueño pide en el chat, gana lo
  que pide el dueño, **salvo** las 6 reglas de arriba y la lista "Sin permiso
  explícito, nunca": ahí se avisa y se espera.

### Verificación en dos velocidades

- **Antes de cada commit:** `npx tsc --noEmit`, `npm run lint` y los tests de lo
  tocado (`npx vitest run <rutas>`).
- **Al cerrar una etapa, antes del push:** `npm test` completo y `npm run build`.
- Los comandos están en `README.md`.

### QA y revisión

- **Una sola vez por bloque de trabajo (la rama), antes del PR a `main`.** No hay
  QA ni revisión por etapa.
- La hace Claude mismo, rápido: prueba en el navegador (Playwright) los flujos
  tocados (que cargue, el camino principal y un rol sin permiso) y, si el bloque
  toca consultas, endpoints o permisos, revisa en el diff el aislamiento por
  `businessId` y los permisos. Lo que encuentre se corrige en el momento.
- No se arman QA ni revisor con varios agentes, ni pasos de "reproducir" y
  "refutar", ni workflows de verificación en cadena, salvo que el dueño lo pida.
  Para algo de seguridad que de verdad pida un segundo par de ojos, se delega UNA
  revisión de sólo lectura a un agente.
- Esto incluye cualquier modo de la sesión que pida verificación exhaustiva con
  muchos agentes: en este repo manda este archivo.

### Commits y push

- **Commit al cerrar cada etapa.** Es obligatorio: el contenedor es efímero y una
  sesión entera se perdió por acumular cambios sin guardar.
- **Push de la rama de trabajo al cerrar cada etapa, sin pedir permiso.** La rama
  de trabajo es la que el dueño autorizó para esta tanda; nunca `main`.
- PR, merge a `main` y despliegues: sólo con permiso explícito.

### Reinicios y esperas

- Si la sesión se reinicia, se retoma desde el último commit y `git status`. **No
  se rehace nada de lo ya hecho:** sólo se continúa lo que quedó a medias.
- Nada espera sin motivo. Lo que depende de una respuesta del dueño se anota y se
  avanza con lo demás. Si algo lleva más de unos 10 minutos sin avance, se avisa
  en una línea con el motivo.
- Los mensajes de avance son cortos: qué se cerró, qué sigue y qué se necesita del
  dueño. Sin tablas largas ni repetir lo que ya se dijo.

### El loop tiene techo

Si algo falla 3 veces seguidas con el mismo enfoque, para y reporta qué probaste.
Si falta una decisión, una dependencia o un permiso, para y pregunta. Iterar sin
límite no es autonomía, es quemar tiempo sin avanzar.

---

## Cómo respondes

- Español. Directo.
- Reportas al final de cada bloque: archivos tocados, comandos a correr, qué falta.

## Sin permiso explícito, nunca

- `git push` a `main`, merge a `main`, PR y despliegues. (El push de la rama de
  trabajo está permitido: ver "Commits y push".)
- Migraciones sobre datos reales. **La única base configurada es producción**:
  `prisma migrate reset`, `db push`, `db execute` y `migrate deploy` están
  bloqueados por permisos.
- Instalar o actualizar dependencias que el dueño no haya aprobado en el chat.
- Tocar `.env` o credenciales.
- Borrar archivos que no creaste en esta sesión.
