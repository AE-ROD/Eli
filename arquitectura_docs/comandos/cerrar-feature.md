---
description: Cerrar una feature ya mergeada y capitalizar lo aprendido
---

Feature a cerrar: $ARGUMENTS

1. Verifica que esté en `en-revision/` y que su rama esté mergeada en `main`.
   Si no, para y dime qué falta.
2. Marca todos los criterios de aceptación y confirma que están cumplidos.
3. Mueve la ficha a `hecho/` y actualiza `estado`.
4. Convierte cada línea de "Fuera de alcance detectado" en una ficha nueva en
   `backlog/`, usando la plantilla.
5. **Capitalización** — responde estas dos, que es lo que hace que esto valga la pena:
   - ¿Qué de esta feature quedó reutilizable para el próximo cliente?
   - ¿Qué habría que mover a `core/` para que la próxima vez sea más barata?
   Si sale algo, créalo como ficha en `backlog/` con capa `core`.
6. Si hubo una decisión con consecuencias de largo plazo, escribe el ADR en
   `arquitectura_docs/decisiones/`.
