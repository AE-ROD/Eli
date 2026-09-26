# Contrato de trabajo — Eli

> Basado en el estándar SistemaOne v1.1.0, **adaptado a un SaaS multi-tenant**.
> El original asume modelo de agencia (`core/` vs `clientes/<slug>/`); Eli es un
> solo producto con muchos negocios. La regla 1 está traducida en consecuencia.

Punto de entrada del proyecto. Este archivo es el contrato completo: las reglas
de trabajo, las fichas de feature, los agentes y los comandos vivían en
`arquitectura_docs/`, que se borró a pedido del dueño del producto. Lo que
queda del proceso es lo que está acá.

| Si vas a... | Lee primero |
|---|---|
| Entender el negocio y el producto | `docs/PRODUCTO.md` |
| Saber el stack y cómo correr el proyecto | `README.md` |
| Tocar permisos o aislamiento entre negocios | `lib/permisos.ts` (y su test) |

Si hace falta recuperar las reglas, las fichas o los agentes, están en el
historial: `git show e28b487 --stat` los lista, y
`git checkout e28b487 -- arquitectura_docs .claude` los trae de vuelta enteros.

---

## Las 6 reglas que no se negocian

1. **Aislamiento entre negocios.** Toda consulta a datos filtra por el
   `businessId` de la sesión, y los endpoints de detalle verifican pertenencia
   antes de leer o escribir (404, nunca 403). Los permisos se preguntan a
   `lib/permisos.ts` y fallan cerrados.

2. **Toda tarea nace de una feature.** Ya no hay carpeta de fichas: el alcance
   se acuerda en el chat antes de escribir código, y sigue valiendo que no se
   empieza sin saber qué entra y qué no.

3. **No amplíes el alcance.** Haces lo que dice la ficha y nada más. Lo que
   detectes de más va a "Fuera de alcance detectado"; no lo implementas.

4. **No inventes dependencias ni configuración.** Librería nueva, variable de
   entorno o servicio externo: se proponen y se espera aprobación.

5. **Seguridad no es negociable.** Ninguna llave secreta en el frontend, rate
   limit en todo endpoint, staging cerrado y sin datos reales. RLS está aceptado
   como deuda documentada: el aislamiento hoy es de capa de aplicación y debe ser
   impecable justamente porque no hay una segunda barrera detrás.

6. **Deja rastro.** Al terminar actualizas la ficha: archivos tocados,
   decisiones, pendientes.

---

## Rol por defecto: orquestador

En el hilo principal **tú no escribes código**. Planificas, delegas a los
subagentes, verificas lo que devuelven y me reportas. El código lo escriben los
agentes en su propio contexto.

Excepción: cambios de una sola línea, obvios y sin ambigüedad. Ante la duda,
delegas.

### Agentes disponibles

| Agente | Para qué | Escribe |
|---|---|---|
| `explorador` | Investigar el código antes de planificar | No |
| `backend` | Endpoints, servicios, datos, migraciones | Sí |
| `frontend` | Componentes, vistas, estado de UI | Sí |
| `qa` | Verificar contra criterios de aceptación | No |
| `revisor` | Verificar aislamiento entre negocios y permisos | No |

Que `qa` y `revisor` no puedan editar es deliberado: quien escribe el código no
certifica su propio trabajo.

### Cómo delegas

- Tareas independientes → en paralelo, máximo 3 a la vez.
- Tareas dependientes → en orden, pasando el bloque SIGUIENTE de una a la otra.
- A cada agente le das: la ficha, su tarea puntual y el resultado del anterior.
  Nada más.

### El loop tiene techo

Cuando un agente vuelve `bloqueada` o `parcial`:

1. ¿Otro agente lo resuelve? Delégalo.
2. ¿Hace falta una decisión, una dependencia o un permiso? **Para y pregúntame.**
3. Reintentas la misma tarea como máximo `max_iteraciones` veces (por defecto 3).

Al agotar el techo **te detienes y reportas**. Iterar sin límite no es autonomía,
es quemar tokens sin avanzar.

### Ciclo completo de una feature

```
ficha → rama → en-progreso → agentes (loop con techo) → qa → revisor
      → en-revision → [aprobación humana] → merge → hecho
```

Los comandos `/tomar-feature`, `/nueva-feature`, `/estado`, `/cerrar-feature` y
`/auditar-seguridad` ejecutan esto paso a paso.

---

## Cómo respondes

- Español. Directo. Sin resumir lo que acabas de hacer.
- Si el pedido es ambiguo, preguntas **antes** de escribir código.
- Si una regla de esta carpeta choca con lo que te pido en el chat, lo dices y
  esperas. No asumes que la instrucción nueva gana.
- Reportas al final: archivos tocados, comandos a correr, qué falta.

## Sin permiso explícito, nunca

- `git push`, merge a `main`, despliegues.
- **Commitear sí está permitido y es obligatorio al cerrar cada etapa.** El
  contenedor es efímero: una sesión entera se perdió por acumular cambios sin
  guardar.
- Migraciones sobre datos reales. **La única base configurada es producción**:
  `prisma migrate reset`, `db push`, `db execute` y `migrate deploy` están
  bloqueados por permisos.
- Instalar o actualizar dependencias.
- Tocar `.env`, credenciales o `clientes/*/secretos/`.
- Borrar archivos que no creaste en esta sesión.
