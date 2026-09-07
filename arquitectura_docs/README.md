# arquitectura_docs

Estándar de desarrollo de SistemaOne. Se copia dentro de cada proyecto y le da a
Claude Code un contrato fijo de cómo trabajar: qué reglas seguir, qué puede hacer
solo, qué tiene que preguntar, y cómo se reparten las tareas entre agentes.

**Versión:** ver `VERSION` · **Cambios:** ver `CHANGELOG.md`

## Instalar en un proyecto

```bash
cp -r arquitectura_docs/ /ruta/al/proyecto/
cd /ruta/al/proyecto
bash arquitectura_docs/instalar.sh
```

Luego completa `reglas/06-stack.md` y `contexto/cliente.md`. Sin eso el agente
adivina comandos y versiones, y adivina mal.

## Por qué hay archivos fuera de esta carpeta

Claude Code lee `CLAUDE.md` y `.claude/` **desde la raíz del proyecto**, no desde
subcarpetas. El instalador copia el `CLAUDE.md` y los permisos a la raíz, y
enlaza agentes y comandos. La fuente de verdad sigue siendo esta carpeta: editas
acá y se refleja allá.

## Mapa

```
arquitectura_docs/
├── CLAUDE.md              → contrato principal (se copia a la raíz)
├── claude-permisos.json   → permisos      (se copia a .claude/settings.json)
├── instalar.sh
├── VERSION · CHANGELOG.md
│
├── reglas/                cómo se programa acá
│   ├── 01-arquitectura.md   núcleo vs. cliente ← la regla que sostiene el margen
│   ├── 02-codigo.md
│   ├── 03-git-y-flujo.md
│   ├── 04-testing.md
│   ├── 05-seguridad.md      → enruta a seguridad/
│   └── 06-stack.md          ← único que cambia por proyecto
│
├── seguridad/             controles obligatorios, no sugerencias
│   ├── 01-base-de-datos.md      RLS y menor privilegio
│   ├── 02-secretos-y-llaves.md  qué nunca llega al navegador
│   ├── 03-rate-limiting.md      límites por endpoint
│   ├── 04-entornos-y-exposicion.md  staging cerrado y sin indexar
│   ├── 05-checklist-entrega.md  la barrera antes de entregar
│   ├── incidente-fuga-de-llave.md
│   └── verificar.sh             chequeo automático pre-commit
│
├── features/              el tablero de trabajo
│   ├── README.md · _plantilla.md
│   └── backlog/ en-progreso/ en-revision/ hecho/
│
├── agentes/               → .claude/agents/
│   explorador · backend · frontend · qa · revisor
│
├── comandos/              → .claude/commands/
│   /nueva-feature · /tomar-feature · /estado · /cerrar-feature · /auditar-seguridad
│
├── decisiones/            ADRs: por qué las cosas están así
├── contexto/              cliente, entornos, glosario (lo variable por proyecto)
└── plantillas/            PR y reporte de QA
```

## Las dos capas

Lo que cambia por proyecto está aislado a propósito:

| Estable en todos los clientes | Cambia en cada proyecto |
|---|---|
| `CLAUDE.md`, `reglas/01-05`, `seguridad/`, `agentes/`, `comandos/`, `plantillas/` | `reglas/06-stack.md`, `contexto/`, `features/`, `decisiones/` |

Cuando mejores algo de la columna izquierda, súbele la versión y propágalo a los
proyectos activos. Esa columna **es** el activo reutilizable: si crece bien, el
cliente 3 arranca más barato que el 2.

## Día a día

```
/nueva-feature  cobro automático de suscripciones vencidas
/tomar-feature  F-012
/estado
/cerrar-feature F-012
/auditar-seguridad
```

Tú apruebas los pushes, los merges, las dependencias nuevas y todo lo que toque
producción. El agente no tiene esos permisos y no debe pedírtelos: pide la
aprobación, no el permiso.
