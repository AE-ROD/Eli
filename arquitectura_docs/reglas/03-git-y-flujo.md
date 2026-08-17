# 03 — Git y flujo de trabajo

## Ramas

```
main                      estable, desplegable siempre
  └── feat/F-012-login    una rama por feature, nombrada con su ID
      fix/F-031-timeout
      chore/actualizar-deps
```

Nunca se trabaja directo sobre `main`.

## Commits

Formato: `tipo(alcance): descripción en imperativo`

```
feat(core/auth): agregar login con magic link
fix(clientes/acme): corregir zona horaria en reportes
test(core/facturacion): cubrir caso de nota de crédito
docs(arquitectura): registrar ADR-004
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

Reglas:
- Un commit = un cambio con sentido propio. Nada de "avances varios".
- El commit debe dejar el repo en verde (compila y pasan los tests).
- Referencia el ID de la feature en el cuerpo cuando aplique.

## Lo que el agente NO hace solo

`git push`, `merge`, `rebase`, borrar ramas y cualquier despliegue **requieren
aprobación humana explícita**. Están en la lista `ask` de `claude-permisos.json`
justamente para eso. No pidas que se te levante el permiso; pide la aprobación.

## Antes de pedir revisión

- [ ] La rama está al día con `main`
- [ ] Tests en verde
- [ ] Linter en verde
- [ ] La ficha de la feature está actualizada
- [ ] El PR usa `arquitectura_docs/plantillas/pull-request.md`
