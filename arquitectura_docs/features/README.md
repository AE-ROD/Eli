# Sistema de features

Una **feature** es la unidad de trabajo. Nada se programa sin una ficha.

## Por qué las carpetas son por estado y no por área

La primera idea natural es `features/backend/`, `features/frontend/`, `features/qa/`.
No conviene, por tres razones:

1. **Una feature casi nunca es de un área sola.** "Login con magic link" es
   backend + frontend + QA. Si la partes en tres carpetas, pierdes el hilo que
   las une y nadie sabe si la feature completa está lista.
2. **El área es un atributo, no un lugar.** Se declara en el encabezado de la
   ficha (`areas:`) y eso basta para filtrar: `grep -l "backend" features/**/*.md`.
3. **Lo que necesitas ver de un vistazo es el estado.** "¿Qué hay en vuelo?" se
   responde con `ls features/en-progreso/`. Con carpetas por área, no se responde.

Entonces: **carpeta = estado. Área = campo. Tareas por área = dentro de la ficha.**

## Flujo

```
backlog/  →  en-progreso/  →  en-revision/  →  hecho/
```

- **backlog/** — escrita y priorizada, nadie la tomó.
- **en-progreso/** — un agente la está ejecutando. Máximo 2 a la vez (son dos personas).
- **en-revision/** — código listo, esperando revisión humana o QA.
- **hecho/** — mergeada. Se conserva: es el historial real del proyecto.

Mover una feature = mover el archivo de carpeta y actualizar el campo `estado`.

## Nombres de archivo

`F-012-login-magic-link.md` — ID correlativo + slug corto. El ID no se reutiliza nunca.

## Reglas del ciclo

1. Sin ficha en `en-progreso/`, no se escribe código.
2. Los **criterios de aceptación** son el contrato. Si no se pueden marcar todos,
   la feature no está lista, aunque el código funcione.
3. Todo lo que aparezca y no esté en la ficha va a **Fuera de alcance detectado**.
   No se implementa: se convierte en una feature nueva en `backlog/`.
4. `max_iteraciones` es un tope duro. Al alcanzarlo el agente **para y reporta**,
   no sigue intentando. Un loop sin techo es la forma más cara de no avanzar.
