# 01 — Arquitectura

> **Adaptado para Eli.** El estándar original de SistemaOne define esta regla como
> `core/` vs `clientes/<slug>/`, que corresponde a un modelo de agencia: sistemas
> a medida para varias empresas.
>
> Eli es un **SaaS multi-tenant**: un solo código para todos los negocios, que se
> separan por filas en la base de datos y no por carpetas. La regla que sostiene
> el negocio es la misma idea — que los datos de un cliente nunca toquen a los de
> otro — pero traducida a esta arquitectura.

---

## La regla que sostiene el negocio: aislamiento por negocio

**Toda consulta a datos de negocio filtra por el `businessId` de la sesión. Sin excepción.**

Un negocio no puede ver, editar ni deducir la existencia de datos de otro. Es el
error más caro posible en este producto: una fuga entre negocios no cuesta un
sprint, cuesta la confianza de todos los clientes a la vez.

### El patrón obligatorio

```ts
// Listados
const items = await prisma.recurso.findMany({
  where: { businessId: session.user.businessId, ... },
  take: 50,                       // todo listado tiene tope
})

// Detalle, edición y borrado: se verifica pertenencia ANTES de tocar el registro
const existente = await prisma.recurso.findFirst({
  where: { id, businessId: session.user.businessId },
})
if (!existente) {
  return NextResponse.json({ error: "No encontrado" }, { status: 404 })
}
```

**Se devuelve 404, no 403.** Un 403 confirma que el recurso existe en otro
negocio; un 404 no revela nada.

### Aislamiento dentro del negocio

El aislamiento tiene un segundo nivel: **el profesional ve sólo lo suyo.**

- Su agenda, sus clientes atendidos y su propia liquidación.
- **No** la facturación del negocio ni las citas de sus compañeros.
- Se resuelve con el filtro que devuelve `lib/permisos.ts`, no a mano en cada endpoint.

---

## Autorización: una sola fuente de verdad

Todo permiso se pregunta a `lib/permisos.ts`. **Ningún endpoint verifica roles por
su cuenta.**

La versión anterior tenía un único chequeo, `role === "owner"`, repartido por los
endpoints. El resultado fue que el rol `admin` existía pero no daba ningún
permiso real: era una etiqueta de color. Centralizar evita exactamente eso.

```ts
// Bien
if (!puedeGestionarEquipo(actor)) return noAutorizado()

// Mal — no se repite lógica de roles en los endpoints
if (session.user.role !== "owner") return noAutorizado()
```

**Los permisos fallan cerrados.** Ante un dato faltante o inesperado se niega el
acceso, nunca se concede. Un profesional sin `memberId` no ve todo: no ve nada.

---

## Dónde va cada cosa

| Carpeta | Qué vive acá |
|---|---|
| `app/` | Rutas, páginas y endpoints (App Router de Next) |
| `app/api/` | Endpoints. Validan con Zod y filtran por `businessId` |
| `components/` | Componentes de interfaz, sin lógica de negocio ni acceso a datos |
| `lib/` | Lógica de negocio reutilizable, permisos, acceso a datos, utilidades |
| `prisma/` | Esquema y migraciones |
| `types/` | Tipos compartidos y declaraciones de módulos |
| `docs/` | Producto y requerimientos |
| `arquitectura_docs/` | Este estándar |

**Las reglas de negocio viven en `lib/`, no en los componentes.** Un componente
que calcula una comisión es un componente que no se puede testear ni reutilizar.

---

## Prohibido

- Cualquier consulta a datos de negocio **sin** filtro por `businessId`.
- Devolver 403 cuando el recurso pertenece a otro negocio (usar 404).
- Verificar roles con comparaciones sueltas en vez de `lib/permisos.ts`.
- Listados sin `take`: una colección sin tope se degrada con el uso real.
- Recalcular una comisión ya congelada en una cita completada.
- `session.user as any` para saltear el tipado en la capa de seguridad.
- Crear una carpeta de primer nivel nueva sin registrarla en este archivo.

---

## Deuda conocida: RLS

El estándar exige *Row Level Security* en la base de datos
(`seguridad/01-base-de-datos.md`). Eli aísla hoy en la **capa de aplicación**, y
está verificado que lo hace de forma consistente en todos los endpoints.

Falta la segunda barrera a nivel Postgres. Con Prisma no es trivial y hoy está
**aceptado como deuda documentada, no como excepción permanente**: si un endpoint
olvidara el filtro, no habría nada detrás que lo detenga.
