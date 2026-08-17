# Entornos

| Entorno | URL | Base de datos | Quién despliega |
|---|---|---|---|
| local | | | cualquiera |
| staging | | | |
| producción | | | **solo humano** |

## Variables de entorno

> Solo el **nombre** y para qué sirve. **Nunca el valor.**
> El agente tiene denegada la lectura de `.env` por permisos.

| Variable | Para qué | Dónde se obtiene |
|---|---|---|
| | | |

## Despliegue

```bash
# staging
# producción
```

## Reglas
- Producción no se toca desde una sesión de agente. Nunca.
- Las migraciones sobre datos reales las corre una persona.
- Antes de cualquier despliegue: tests en verde y QA aprobado.
