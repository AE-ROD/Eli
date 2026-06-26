# Stripe Checkout desde el modal de precios

## Objetivo

Conectar los planes pagados del modal del dashboard con el endpoint existente `POST /api/stripe/checkout`, mostrando progreso, redirección y errores legibles.

## Diseño

- `ProviderPrecios` será responsable de la petición y mantendrá `planCargando` y `error`.
- Solo `pro` y `team` iniciarán Stripe Checkout. Seleccionar `free` mostrará que el plan gratuito no requiere pago.
- Antes de cada intento se limpiará el error anterior y se marcará el plan seleccionado como cargando.
- Una respuesta no exitosa usará el campo `error` de la API cuando exista; de lo contrario mostrará un mensaje genérico.
- Una respuesta exitosa debe incluir `url`; el navegador redirigirá mediante `window.location.href`.
- `ModalPrecios` recibirá `planCargando` y `error`. El botón seleccionado mostrará spinner y todos los CTA quedarán deshabilitados durante la petición para evitar solicitudes duplicadas.
- El error se mostrará con `role="alert"` usando tokens `destructive` del sistema de diseño.
- `periodo` se acepta pero se ignora hasta que el endpoint soporte precios anuales.

## Verificación

- Ejecutar `npm test`.
- Ejecutar `npx tsc --noEmit`.
- Confirmar que no se modifican `app/reservar/[slug]/` ni `__tests__/`.
