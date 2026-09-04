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

## Interfaz

Dirección **B** de la propuesta de identidad, aprobada como estándar
permanente: aplica a toda pantalla nueva, no a una en particular.

- **Ninguna cifra sin procedencia.** Si un número aparece en pantalla, algo
  cerca dice de qué está hecho. Si no hay nada verdadero que decir, no se
  escribe una línea de relleno.
- **Nada de datos de ejemplo en producción.** Ni nombres por defecto, ni
  contadores fijos, ni porcentajes que se rellenan con `0` cuando falta el
  dato. Si no hay dato, se dice que no hay.
- **No se promete lo que no existe.** Ninguna función se menciona en la
  interfaz —ni en un plan de precios— antes de estar implementada.
- **Cifras tabulares** (`font-variant-numeric: tabular-nums`) donde los
  números se alinean en columna.
- **El color significa algo.** Verde, ámbar y rojo son estado, no decoración,
  y no se usan como color de marca.
- **No todo es una tarjeta.** Borde, relleno, radio y sombra dicen "objeto
  aparte": se gastan donde hay jerarquía que marcar, no por defecto.
- **Un estado vacío explica**, no disimula: por qué está vacío y qué hacer.
