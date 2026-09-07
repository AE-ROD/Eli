---
id: F-017
titulo: El dueño configura las comisiones
estado: backlog
prioridad: alta
areas: [backend, frontend]
rama: por definir
estimacion: media
max_iteraciones: 3
depende_de: F-003
---

# F-017 — El dueño configura las comisiones

## Problema

F-003 dejó el modelo de datos de comisiones: porcentaje por defecto en el
profesional, excepción por profesional × servicio, auditoría de cambios. **No
hay una sola pantalla que lo escriba.** Hoy los porcentajes sólo se pueden
cargar con `psql`, o sea que el diferenciador del producto (`docs/PRODUCTO.md`
§2) existe en el esquema y no existe para el cliente.

Es lo que hay que construir antes del cálculo: no se puede congelar una comisión
al completar una cita si nadie pudo configurarla.

**No arranca hasta que F-003 esté mergeada y su migración aplicada.** Escribir
esta feature contra un modelo que todavía puede cambiar es rehacerla.

## Alcance

**Incluye:**
- Pantalla de comisiones: por cada profesional, su porcentaje por defecto y sus
  excepciones por servicio.
- Endpoints para leer y escribir porcentajes (`CommissionRate` y
  `BusinessMember.commissionPercent`).
- Cada escritura deja su fila en `CommissionChange`, con el `scope` correcto y
  los snapshots de nombre que el modelo ya pide.
- Estado **"sin configurar"** visible y distinto de 0%.

**NO incluye:**
- El cálculo al completar la cita ni el congelado. Es otra feature.
- La pantalla de liquidación.
- Cambiar el modelo de datos. Si aparece algo que el modelo no soporta, va a
  "Fuera de alcance detectado" y se decide aparte; no se migra sobre la marcha.

## Criterios de aceptación

- [ ] Sólo el dueño entra: los endpoints preguntan por `puedeEditarComisiones`
      (`= esDueño`), y fallan cerrado. El encargado recibe 401 aunque gestione
      todo lo demás del negocio (`docs/PRODUCTO.md` §3.4: el límite del
      encargado es el dinero, no la operación).
- [ ] Toda lectura y escritura filtra por el `businessId` de la sesión, y el
      detalle verifica pertenencia antes de escribir (404, nunca 403).
- [ ] La pantalla distingue tres estados por profesional y servicio: **con
      porcentaje propio**, **heredando el del profesional**, y **sin
      configurar**. "Sin configurar" no se dibuja como 0%: son cosas distintas y
      confundirlas es liquidar de menos sin que nadie lo note.
- [ ] Guardar un porcentaje escribe la fila de `CommissionChange` en la misma
      transacción que el cambio. Si la auditoría falla, el cambio no queda.
- [ ] `scope` se escribe explícito ("default" o "service"), no se infiere de si
      `serviceId` es `null` — el modelo es explícito justamente para que esto no
      se deduzca (ver el comentario de `CommissionChange` en el esquema).
- [ ] Un porcentaje fuera de 0–100 se rechaza en el endpoint, no sólo en el
      formulario ni sólo en el `CHECK` de la base.
- [ ] Borrar una excepción vuelve al porcentaje heredado, y eso también queda
      auditado.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- Modelos y comentarios: `prisma/schema.prisma`, bloques `CommissionRate` y
  `CommissionChange`. Los comentarios explican por qué cada FK es como es;
  conviene leerlos antes de escribir la consulta.
- La cascada se resuelve con `findUnique` por `memberId_serviceId`. Esa consulta
  **no filtra por negocio** (la clave única no lo incluye): por eso el modelo
  tiene FK compuesta contra `(id, businessId)`, para que una fila de tenant
  cruzado no pueda existir. Nada de esto exime al endpoint de filtrar por
  `businessId` igual.
- Permisos: `puedeEditarComisiones` ya existe en `lib/permisos.ts`. No hace
  falta agregar nada; si hiciera falta, se agrega ahí y no en el endpoint.
- Borrar un servicio con comisiones configuradas falla (`Restrict`) y el
  endpoint devuelve 409. La pantalla de servicios ya muestra ese mensaje; esta
  feature es la que le da al dueño el lugar donde quitar esas comisiones.
- Falta `@@index([serviceId])` en `CommissionRate`: si esta pantalla consulta
  por servicio, es el momento de evaluarlo (anotado en la ficha de F-003).

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

<!-- El agente completa acá. -->

## Bitácora
