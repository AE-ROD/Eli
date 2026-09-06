---
id: F-010
titulo: El rate limit falla abierto
estado: en-progreso
prioridad: alta
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-010 — El rate limit falla abierto

## Problema

Lo marcó el `revisor` en F-004. `lib/rate-limit.ts` **deja pasar todo** cuando
faltan las credenciales de Upstash, y hay un test que consagra ese
comportamiento como correcto.

Contradice la regla 1 del proyecto —los controles fallan cerrados— y el modo de
falla es silencioso: si mañana la variable de entorno desaparece de Vercel por
un despliegue mal hecho, el login, el registro y el restablecimiento de
contraseña quedan **sin ningún tope de intentos** y nada avisa. Un `console.warn`
en los logs de un servidor no lo ve nadie.

El riesgo es concreto: `POST /api/auth/restablecer-password` fija la contraseña
de la cuenta que identifique el token del enlace. Sin tope, ese token se busca a
fuerza de intentos.

## Alcance

**Incluye:**
- Que en producción, sin Upstash configurado, el rate limit **no** deje pasar
  silenciosamente.
- Que en desarrollo se pueda seguir trabajando sin Upstash.
- Actualizar el test que hoy fija el comportamiento contrario.

**NO incluye:**
- Poner rate limit en los endpoints del panel que no lo tienen (es F-012).
- Cambiar los límites ni las ventanas de tiempo.
- Agregar dependencias ni un backend de rate limiting alternativo.

## Criterios de aceptación

- [ ] Con `NODE_ENV=production` y sin credenciales de Upstash, `verificarLimite`
      **no** devuelve "permitido". Falla cerrado.
- [ ] Fuera de producción, sin credenciales, sigue dejando pasar y avisando: no
      se puede romper el desarrollo local ni los tests.
- [ ] El aviso de configuración faltante es inequívoco en el log, no un
      `console.warn` perdido entre otros.
- [ ] El test que hoy fija "deja pasar (fail-open) cuando no hay credenciales"
      se actualiza para reflejar la regla nueva, cubriendo **los dos** entornos.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `lib/rate-limit.ts` y `lib/rate-limit.test.ts`.
- Lo consumen `app/api/auth/registro`, `app/api/auth/olvide-password`,
  `app/api/auth/restablecer-password`, `app/api/equipo/invitacion/[token]/aceptar`
  y la reserva pública.
- **Ojo con el build:** `npm run build` corre sin variables de entorno reales. Si
  el módulo revienta al importarse cuando faltan credenciales, rompe el build —
  es el mismo error que tenía `lib/email.ts` y que se arregló creando el cliente
  en el primer uso, no al importar el módulo.
- No inventes variables de entorno nuevas: `NODE_ENV` ya existe.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- Fallar cerrado en producción y abierto en desarrollo. Un rate limit que rompe
  el desarrollo local se termina desactivando a mano, que es peor.

## Bitácora
