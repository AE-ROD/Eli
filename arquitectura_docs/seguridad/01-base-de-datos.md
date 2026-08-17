# 01 — Base de datos

## Regla base

**La base está cerrada por defecto y se abre fila por fila.** Nunca al revés.

En Postgres (y en Supabase, que es Postgres) eso se llama Row Level Security. Sin
RLS, cualquiera con la llave pública del cliente lee la tabla completa. La llave
pública **está** en el navegador: eso es normal y correcto. Lo que impide el
desastre es RLS, no esconder la llave.

## Obligatorio en toda tabla expuesta

```sql
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
```

Activar RLS sin políticas = nadie lee nada. Ese es el punto de partida correcto:
se abre después, con intención, caso por caso.

Adicionalmente, para que ni el dueño de la tabla la esquive:

```sql
ALTER TABLE public.pedidos FORCE ROW LEVEL SECURITY;
```

## Políticas: una por operación, nunca `FOR ALL`

```sql
-- lectura: solo mis filas
CREATE POLICY pedidos_select ON public.pedidos
  FOR SELECT TO authenticated
  USING ( user_id = (SELECT auth.uid()) );

-- inserción: no puedo crear filas a nombre de otro
CREATE POLICY pedidos_insert ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK ( user_id = (SELECT auth.uid()) );

-- actualización: USING y WITH CHECK, las dos
CREATE POLICY pedidos_update ON public.pedidos
  FOR UPDATE TO authenticated
  USING      ( user_id = (SELECT auth.uid()) )
  WITH CHECK ( user_id = (SELECT auth.uid()) );
```

Tres errores que se ven siempre:

| Error | Qué pasa |
|---|---|
| `USING (true)` | RLS activo pero abierto: la peor combinación, porque parece seguro |
| `UPDATE` sin `WITH CHECK` | El usuario mueve su fila al `user_id` de otro y se la regala |
| `INSERT` sin `WITH CHECK` | Cualquiera inserta filas a nombre de quien quiera |

## Multi-cliente: aislamiento por `tenant_id`

Si una instancia atiende a varios clientes, **toda** tabla lleva `tenant_id` y la
política compara contra el claim del token, no contra un parámetro que mande el
frontend:

```sql
CREATE POLICY tenant_aislado ON public.pedidos
  FOR SELECT TO authenticated
  USING ( tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid );
```

Nunca filtres por tenant en el `WHERE` de la aplicación y lo llames aislamiento.
Un `WHERE` se olvida en un endpoint; una política no.

## Trampas que hay que conocer

- **Vistas.** Por defecto una vista corre con los permisos de quien la creó y
  esquiva el RLS de las tablas de abajo. En Postgres 15+:
  `CREATE VIEW ... WITH (security_invoker = true)`.
- **Funciones `SECURITY DEFINER`.** Bypassean RLS por diseño. Se usan solo cuando
  no hay alternativa, siempre con `SET search_path = ''` y con el `SECURITY
  DEFINER` justificado en un ADR.
- **Rendimiento.** Indexa la columna de la política (`user_id`, `tenant_id`). Y
  envuelve las funciones en subconsulta —`(SELECT auth.uid())`— para que se
  evalúen una vez y no por fila.
- **Realtime / suscripciones.** También pasan por RLS, pero se configuran aparte.
  Verifícalo explícitamente.

## Menor privilegio en el resto

- Un rol de aplicación distinto del dueño del esquema. La app no hace DDL.
- `REVOKE` de lo que no se usa. `GRANT` explícito por tabla y operación.
- Base de datos sin IP pública, o con lista blanca. Nunca `0.0.0.0/0`.
- Backups cifrados y con restauración probada. Un backup que nunca se restauró
  no es un backup.

## Definición de terminado

Ninguna tabla nueva se da por lista sin:

- [ ] `ENABLE ROW LEVEL SECURITY` + `FORCE`
- [ ] Una política por operación que se use
- [ ] `WITH CHECK` en `INSERT` y `UPDATE`
- [ ] Índice sobre la columna de la política
- [ ] **Un test que inicia sesión como usuario A y verifica que NO ve las filas
      de usuario B.** Sin ese test, la tabla no está terminada.

Ese último test es el que de verdad protege. Las políticas se escriben una vez y
se rompen sin avisar en la migración siguiente.
