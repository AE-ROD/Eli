# Cambios del estándar

Cada proyecto anota en su `reglas/06-stack.md` con qué versión se instaló.
Sin esto, en el cliente 5 no sabrás cuáles proyectos tienen el estándar viejo.

## 1.1.0
- Nueva carpeta `seguridad/` con controles obligatorios: RLS, llaves y secretos,
  rate limiting, entornos y exposición pública.
- `seguridad/verificar.sh`: chequeo automático de patrones filtrables.
- `seguridad/05-checklist-entrega.md`: barrera firmada antes de entregar.
- Protocolo de incidente por filtración de llave.
- Comando `/auditar-seguridad`.
- `reglas/05-seguridad.md` pasa a ser un índice hacia `seguridad/` para evitar
  dos fuentes de verdad.
- Editar `seguridad/` ahora requiere confirmación (lista `ask` de permisos).

## 1.0.0
- Contrato base (`CLAUDE.md`) con las 5 reglas y el rol de orquestador.
- Permisos de Claude Code en `claude-permisos.json`.
- 6 archivos de reglas: arquitectura, código, git, testing, seguridad, stack.
- Sistema de features por estado, con áreas y agentes en la ficha.
- 5 subagentes: explorador, backend, frontend, qa, revisor.
- 4 comandos: nueva-feature, tomar-feature, estado, cerrar-feature.
- ADRs, contexto de cliente y plantillas de PR y QA.
