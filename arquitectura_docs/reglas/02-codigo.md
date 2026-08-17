# 02 — Estándares de código

## Antes de escribir

1. Busca si ya existe. `grep` antes de crear. Este repo se rompe por duplicación,
   no por falta de código.
2. Lee un archivo vecino y copia su estilo. La consistencia del repo gana sobre
   tu preferencia personal.

## Al escribir

- **Nombres en inglés** en el código; **comentarios y docs en español**.
- Funciones cortas, un nivel de abstracción por función.
- Nada de abstracciones "por si acaso". Se abstrae a la tercera repetición, no a la primera.
- Errores explícitos: nada de `catch` vacío ni de tragarse excepciones.
- Sin números ni strings mágicos: constante nombrada o config.

## Comentarios

Se comenta el **por qué**, nunca el **qué**. Si necesitas explicar qué hace una
línea, reescribe la línea.

```
// mal:  incrementa el contador en 1
// bien: el proveedor cobra por lote, no por unidad — por eso agrupamos de a 50
```

## Al terminar un archivo

- Sin código muerto, sin `console.log`, sin `TODO` sin ticket asociado.
- Sin imports sin usar.
- Corre el linter y el formateador del proyecto (ver `06-stack.md`).

## Límites duros

- Ningún archivo pasa de ~300 líneas sin justificación.
- Ninguna función pasa de ~50 líneas.
- Si vas a superarlos, párate y propone cómo dividirlo.
