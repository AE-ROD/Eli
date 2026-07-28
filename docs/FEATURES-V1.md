# Features — Primera Versión

> Desglose de trabajo derivado de `AUDITORIA-V1.md`.
> Cada feature es una unidad cerrada: se puede desarrollar, probar y revisar por separado.
> **Nada se implementa hasta aprobar la feature.**

**Convención de estados:** `⬜ pendiente` · `🟦 en curso` · `✅ hecho` · `⛔ bloqueada`

---

## Bloque 0 — Cimientos

> Sin este bloque, los bloques 1, 2 y 3 no son implementables.

### F-01 · Módulo central de permisos ⬜
**Problema:** el control de acceso está disperso y `admin` no tiene ningún permiso real (`AUDITORIA-V1.md` §4.1).
**Entrega:** `lib/permisos.ts` con funciones explícitas (`puedeGestionarEquipo`, `puedeVerIngresosDelNegocio`, `puedeEditarComisiones`, …) + `docs/PERMISOS.md` con la matriz rol × recurso.
**Toca:** archivo nuevo + documentación. No cambia comportamiento todavía.
**Listo cuando:** existe una única fuente de verdad de permisos y está documentada.
**Depende de:** nada. **Bloquea:** F-03, F-04, F-06, F-08.

### F-02 · Asignar citas a un trabajador ⬜
**Problema:** `Appointment.memberId` existe pero nunca se escribe (`AUDITORIA-V1.md` §4.2).
**Entrega:** selector de profesional al crear cita en el dashboard + guardado de `memberId`.
**Toca:** `app/api/citas/route.ts`, `modalNuevaCita.tsx`.
**Listo cuando:** toda cita nueva queda asociada a un miembro del equipo.
**Depende de:** nada. **Bloquea:** F-05, F-06, F-07.

### F-03 · Migración de datos existentes ⬜
**Problema:** las citas creadas antes de F-02 quedan sin trabajador asignado.
**Entrega:** decisión y script — asignar al `owner` por defecto, o dejarlas sin asignar y mostrarlas como "sin asignar".
**Listo cuando:** no hay citas huérfanas que rompan las vistas por trabajador.
**Depende de:** F-02.

---

## Bloque 1 — Panel de administrador

### F-04 · Cambiar el rol de un miembro ⬜
**Problema:** no existe endpoint para modificar el rol de alguien del equipo (`AUDITORIA-V1.md` §4.1).
**Entrega:** `PATCH /api/equipo/[id]` + selector de rol en la lista de equipo.
**Toca:** ruta nueva, `listaEquipo.tsx`.
**Listo cuando:** un administrador puede promover un trabajador a administrador y viceversa.
**Depende de:** F-01.

### F-05 · Quitar un miembro del equipo ⬜
**Entrega:** `DELETE /api/equipo/[id]` + confirmación en la interfaz.
**Cuidado:** definir qué pasa con las citas asignadas a esa persona (¿se reasignan? ¿quedan históricas?).
**Depende de:** F-01, F-03.

### F-06 · Dar acceso de gestión al rol `admin` ⬜
**Problema:** `/api/equipo` es exclusivo del `owner`; un `admin` no puede gestionar nada.
**Entrega:** reemplazar `role !== "owner"` por las funciones de F-01 en `app/api/equipo/route.ts:12,41` y mostrar el menú "Equipo" también a administradores (`barra-lateral.tsx:114`).
**Depende de:** F-01.

---

## Bloque 2 — Panel de empleado

### F-07 · Vista "Mi agenda" ⬜
**Entrega:** pantalla donde el trabajador ve sus citas del día y próximas, con estado y cliente.
**Toca:** ruta nueva en `app/dashboard/`, entrada en el menú lateral.
**Listo cuando:** un trabajador entra y ve su jornada sin ruido de otros.
**Depende de:** F-02.

### F-08 · Aislamiento real de datos por trabajador ⬜
**Problema:** hoy un trabajador ve la agenda completa, todos los clientes y **los ingresos totales del negocio** (`AUDITORIA-V1.md` §4.3).
**Entrega:** aplicar filtro por `memberId` en `citas`, `pacientes`, `dashboard/stats` y `chats`, siguiendo el patrón ya correcto de `configuracion/horarios/route.ts:8-20`.
**⚠️ Requiere decisión previa:** pregunta 3 y 4 de la auditoría (¿el trabajador ve sólo lo suyo?).
**Depende de:** F-01, F-02.

### F-09 · Trabajos pendientes del empleado ⬜
**Entrega:** listado de citas por confirmar / completar, con acción para marcarlas como completadas.
**Depende de:** F-07.

---

## Bloque 3 — Comisiones

> **Bloqueado hasta responder las preguntas 1, 2 y 5 de la auditoría.**

### F-10 · Modelo de datos de comisiones ⛔
**Entrega:** esquema Prisma + migración. Debe incluir **histórico**: el porcentaje y el monto se congelan en la cita al completarse, no se leen dinámicamente (`AUDITORIA-V1.md` §4.4, punto 2 — es el error caro clásico).
**⚠️ Requiere decisión previa:** nivel del porcentaje (trabajador / servicio / combinación) y base de cálculo.
**Depende de:** F-02.

### F-11 · Configurar porcentajes ⛔
**Entrega:** interfaz donde el administrador define el porcentaje de cada trabajador.
**Ejemplo objetivo:** barbería 30% local / 70% barbero.
**Depende de:** F-10, F-01.

### F-12 · Registro de cambios de porcentaje ⛔
**Problema:** es dinero. Sin registro de quién cambió qué y cuándo, una disputa entre dueño y empleado no se puede resolver.
**Entrega:** log de auditoría de cambios de comisión.
**Depende de:** F-10.

### F-13 · Vista de liquidación ⛔
**Entrega:** el administrador ve lo que debe pagar a cada trabajador en un período; el trabajador ve lo que le corresponde a él.
**Depende de:** F-10, F-08.

---

## Bloque 4 — Contenido y diseño

> Los primeros dos son de bajo esfuerzo y alto riesgo: pueden adelantarse en cualquier momento.

### F-14 · Quitar afirmaciones no verificables 🔴 ⬜
**Problema:** "+1,200 negocios", "miles de profesionales", 5 estrellas y avatares inventados (`AUDITORIA-V1.md` §2.1).
**Entrega:** eliminar o sustituir por mensaje honesto de lanzamiento.
**Por qué urge:** es publicidad engañosa en una página que va a cobrar con tarjeta.
**Toca:** `hero-section.tsx:127-142`, `precios-section.tsx:107`.

### F-15 · Alinear planes con funciones reales 🔴 ⬜
**Problema:** se venden "reportes exportables" y límites por plan que no existen (`AUDITORIA-V1.md` §2.2).
**Entrega:** quitar de los planes lo que no existe, **o** construirlo antes de activar cobros.
**Por qué urge:** cobrar por funciones inexistentes es motivo directo de reembolso y disputa.

### F-16 · Arreglar elementos rotos ⬜
**Entrega:**
- Formulario de contacto: hoy **no envía nada** (`contact-section.tsx:93` sin `onSubmit`).
- `/dashboard/ayuda`: enlace del menú lleva a 404 (`barra-lateral.tsx:33`).
- Badge de chats: `notificaciones: 3` hardcodeado (`barra-lateral.tsx:28`).
- Datos ficticios de respaldo "María García" (`barra-lateral.tsx:52-56`).

### F-17 · Reescritura orientada a solución ⬜
**Problema:** las funciones se presentan por su nombre técnico, no por lo que resuelven (`AUDITORIA-V1.md` §1.1).
**Entrega:** reescribir `what-is-section.tsx` en clave de beneficio y subir el bloque de valor que hoy está enterrado en precios (`precios-section.tsx:9-14`), que ya tiene el tono correcto.

### F-18 · Sección "Quiénes somos" ⬜
**Problema:** no existe; el enlace del footer va a `#` (`footer.tsx:14`).
**Entrega:** sección nueva + página. **Necesito que me pases el contenido real** (quién está detrás, por qué existe Eli).

### F-19 · Vocabulario por rubro ⬜
**Problema:** la interfaz dice "Pacientes" a barberías y estudios de fotografía (`AUDITORIA-V1.md` §1.3).
**Entrega:** vocabulario según `Business.type` (cliente / paciente / alumno) + `docs/GLOSARIO.md`.

### F-20 · Unificación cromática ⬜
**Problema:** 8+ colores compitiendo sin significado (`AUDITORIA-V1.md` §3.1).
**Entrega:** un acento (azul de marca) + neutros; color semántico sólo para estados reales.

### F-21 · Corrección ortográfica ⬜
**Problema:** ~15 errores en `target-section.tsx`, incluido "centro de **unas**" por "uñas".
**Entrega:** corrección completa de la sección.

### F-22 · Alinear la vista previa con el producto real ⬜
**Problema:** muestra un gráfico y un chat "En línea" que no existen (`AUDITORIA-V1.md` §3.4).
**Entrega:** que el mockup refleje la interfaz que el usuario realmente recibe.

---

## Resumen de dependencias

```
F-01 (permisos) ──┬─→ F-04, F-05, F-06   [panel admin]
                  ├─→ F-08               [aislamiento]
                  └─→ F-11               [comisiones]

F-02 (asignar    ─┬─→ F-03 → F-05
     citas)       ├─→ F-07 → F-09        [panel empleado]
                  ├─→ F-08
                  └─→ F-10 → F-11, F-12, F-13  [comisiones]

Bloque 4 ──────────── independiente, se puede hacer en cualquier momento
```

**Ruta crítica:** F-01 y F-02 desbloquean todo lo demás. Son el primer trabajo real.

---

## Decisiones pendientes que bloquean desarrollo

| # | Pregunta | Bloquea |
|---|----------|---------|
| 1 | ¿Porcentaje por trabajador, por servicio, o combinación? | F-10 |
| 2 | ¿Se calcula sobre el total o descontando insumos? | F-10 |
| 3 | ¿El trabajador ve sólo sus citas o la agenda completa? | F-08 |
| 4 | ¿El trabajador puede ver la facturación del negocio? | F-08 |
| 5 | ¿Un `admin` puede tocar comisiones o sólo el `owner`? | F-11 |
| 6 | Contenido real para "Quiénes somos" | F-18 |
