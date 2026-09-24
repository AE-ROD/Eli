---
id: F-018
titulo: El helper de tests no puede mentir
estado: backlog
prioridad: alta
areas: [testing]
rama: por definir
estimacion: chica
max_iteraciones: 2
---

# F-018 — El helper de tests no puede mentir

## Problema

Los tests de los endpoints de agenda mockean Prisma con un helper que simula el
filtrado: `coincide(item, where)`, duplicado hoy en
`app/api/citas/route.test.ts` y `app/api/citas/[id]/route.test.ts`. Entiende
tres formas de `where`: igualdad, `{ in: [...] }` y `AND` anidado — las que
`lib/permisos.ts` produce hoy.

Ante cualquier otra clave **devuelve `false` en silencio**. Y eso no falla del
lado seguro, falla del lado que da confianza falsa. Comprobado en la segunda
pasada de QA de F-016, mutando el filtro del profesional a
`{ businessId, OR: [{ memberId }, { memberId: null }] }` — un agujero de
aislamiento real:

- Fallan los tests de **"el worker sí llega a su propia cita"**, que no tienen
  nada que ver con la mutación.
- Los tests de **"el worker no llega a la cita de un colega"** y **"no llega a
  la cita sin profesional"** siguen **en verde**: como `coincide` devuelve
  `false` para todo, cualquier pedido de un worker termina en 404. Pasan por la
  razón equivocada.

O sea que la batería de tests de aislamiento del endpoint **no detecta un
agujero de aislamiento** si el agujero se escribe con un operador que el helper
no conoce. Señala el lugar equivocado y calla donde importa.

Lo que hoy salva a la suite es otro archivo, ajeno a esas fichas:
`lib/permisos.test.ts` compara la forma cruda del filtro con `toEqual`, sin
pasar por `coincide`, y con esa mutación falla apuntando a `lib/permisos.ts`. CI
se pone rojo — pero por una casualidad de arquitectura de tests. Un test que
pasa por la razón equivocada es peor que un test que falta: el que falta se ve.

## Alcance

**Incluye:**
- `coincide()` **falla ruidosamente** ante una clave de `where` que no sabe
  interpretar, en vez de devolver `false`.
- El helper deja de estar duplicado: se extrae a un solo lugar y los dos
  archivos de test lo importan.
- Se agrega el caso a la suite: un test que demuestre que un `where` con una
  clave desconocida hace explotar el helper (si no, el arreglo no queda
  protegido de la próxima simplificación).

**NO incluye:**
- Enseñarle a `coincide` a interpretar `OR`, `NOT`, `gte`/`lte` ni ningún
  operador nuevo. El objetivo no es emular Prisma —ese camino no tiene final—
  sino que el arnés avise cuando se queda corto. Si algún día `lib/permisos.ts`
  necesita `OR`, la ficha que lo introduzca enseña al helper esa forma, con la
  explosión como red.
- Tocar `lib/permisos.ts` ni ningún endpoint. Esta ficha es de tests.
- Reescribir los tests existentes. Deben seguir pasando tal como están.

## Criterios de aceptación

- [ ] `coincide()` lanza un error con mensaje claro (qué clave no entendió, en
      qué `where`) ante cualquier clave fuera de las que sabe interpretar.
- [ ] El helper vive en un solo archivo y los dos `route.test.ts` lo importan.
      El lugar sigue las reglas de `01-arquitectura.md`; si no hay un lugar
      obvio para helpers de test compartidos, se propone uno en la ficha antes
      de inventarlo.
- [ ] La suite completa sigue en verde sin modificar ningún test existente. Si
      alguno falla, es un hallazgo: significa que estaba pasando por una forma
      de `where` que el helper no entendía.
- [ ] **La verificación es la mutación de F-016, repetida:** con el filtro del
      profesional mutado a `OR`, la suite falla **señalando el helper**, no los
      tests de "el worker sí llega a lo suyo". Queda escrito en la bitácora con
      la salida real.
- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` en verde.

## Contexto técnico

- Duplicado hoy en `app/api/citas/route.test.ts:19-28` y
  `app/api/citas/[id]/route.test.ts:18-30`. Por `02-codigo.md` se abstrae a la
  tercera repetición; el revisor de F-016 anotó que la tercera llega apenas se
  arregle otro endpoint de detalle. Esta ficha la adelanta porque el motivo ya
  no es el duplicado, es la mentira.
- `lib/permisos.test.ts` es el que hoy cubre el hueco, comparando la forma del
  filtro con `toEqual`. **No se toca**: es la fuente de verdad que funcionó.
- Las formas que `lib/permisos.ts` produce hoy son `{ AND: [...] }`, igualdad
  por `businessId`/`memberId` y `{ id: { in: [] } }` (la negación `NADA`).

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

<!-- El agente completa acá. -->

## Bitácora
