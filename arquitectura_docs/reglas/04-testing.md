# 04 — Testing

## Qué se testea sí o sí

| Zona | Cobertura esperada |
|---|---|
| `core/` — lógica de negocio | Alta. Es lo que se reutiliza en todos los clientes. |
| `core/` — adaptadores e I/O | Test de integración, al menos el camino feliz y un fallo. |
| `clientes/<slug>/` | Solo lo que tenga lógica propia. Configuración no se testea. |
| Bugs | **Siempre**: primero un test que falle reproduciéndolo, después el arreglo. |

La prioridad no es el porcentaje de cobertura. Es que `core/` no se pueda romper
en silencio, porque romper `core/` rompe a todos los clientes a la vez.

## Cómo se escribe un test

- Un test verifica **un** comportamiento.
- Nombre en español que describa el caso: `devuelve_error_si_el_rut_es_invalido`.
- Estructura Arrange / Act / Assert, con línea en blanco entre bloques.
- Sin dependencias entre tests: cada uno se para solo y en cualquier orden.
- Nada de red real, reloj real ni base de datos real en tests unitarios.

## Prohibido

- Modificar o borrar un test para que pase el build. Si un test estorba, se
  discute con la persona; no se toca.
- Marcar tests como `skip` sin dejar el motivo y un ticket.
- Dar una feature por terminada sin correr la suite completa.
