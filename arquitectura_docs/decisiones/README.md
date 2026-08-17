# Decisiones de arquitectura (ADR)

Un ADR es una página que registra **una decisión con consecuencias** y por qué se
tomó. Se escribe una vez y se lee muchas.

Para dos socios que son también todo el equipo, esto es lo que evita la pregunta
"¿por qué diablos hicimos esto así?" seis meses y tres clientes después. Y es lo
que le da contexto a Claude Code sin que se lo repitas en cada sesión.

## Cuándo escribir uno

- Elegir entre dos tecnologías o librerías.
- Definir un punto de extensión nuevo en `core/`.
- Aceptar deuda técnica a propósito.
- Cualquier cosa que un socio necesite entender antes de tocar el código.

Si la decisión se puede revertir en una tarde, no necesita ADR.

## Nombres

`ADR-004-cola-de-trabajos.md` — número correlativo, nunca se reutiliza.

## Regla

Los ADR **no se editan ni se borran**. Si una decisión cambia, se escribe uno
nuevo y se marca el anterior como `Reemplazada por ADR-00X`. El historial de por
qué te equivocaste vale tanto como la decisión correcta.
