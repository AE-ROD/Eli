---
id: F-009
titulo: Inyección de HTML en los correos
estado: en-progreso
prioridad: alta
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-009 — Inyección de HTML en los correos

## Problema

Lo encontró el `revisor` al cerrar F-004. `lib/email.ts` arma el HTML de cada
correo interpolando datos que escribió una persona, **sin escapar nada**:

```ts
intro: `Hola <strong>${datos.nombreTrabajador}</strong>, te invitaron...`
```

Quien invita elige ese nombre. Si escribe `<a href="http://sitio-falso">` o una
etiqueta cualquiera, eso llega **dentro de un correo que la víctima recibe de
parte de Eli**, con nuestro dominio como remitente. Lo mismo aplica al nombre
del cliente, el del negocio y los comentarios de la reserva.

No es sólo el equipo: los comentarios del cliente al reservar
(`Appointment.clientComments`) viajan al correo del profesional, y esos los
escribe cualquiera que entre a la página pública de reservas.

## Alcance

**Incluye:**
- Escapar todo dato de origen humano antes de interpolarlo en el HTML de un
  correo.
- Que sea difícil olvidarse: la plantilla escapa por defecto, en vez de pedirle
  a cada llamador que se acuerde.

**NO incluye:**
- Rediseñar los correos.
- Validar el largo o el contenido de los nombres al guardarlos. Se escapa al
  mostrar, no se restringe al guardar.
- Los enlaces (`enlaceAceptar`, `enlaceRestablecer`): los arma el servidor, no
  vienen de nadie.

## Criterios de aceptación

- [ ] Un nombre con `<script>`, `<a href>` o `"` llega al correo como texto
      literal, no como etiqueta.
- [ ] La protección es por defecto: agregar un correo nuevo sin acordarse de
      escapar **no** reintroduce el agujero. Mismo criterio que `whereDeAgenda`
      en F-006 — una convención que hay que recordar no es una protección.
- [ ] Los comentarios del cliente en `enviarAvisoProfesional` también se escapan.
- [ ] Tests que fijen el escapado de al menos un caso con etiqueta y uno con
      comillas.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `lib/email.ts` — la función `enviar()` arma el HTML; los campos que vienen de
  personas son `nombreCliente`, `nombreNegocio`, `nombreTrabajador`,
  `nombreUsuario`, `servicio`, `comentarios` y los valores de `detalle`.
- Hoy `intro` y `cierre` reciben HTML a propósito (llevan `<strong>`). Hay que
  resolver eso sin volver a abrir la puerta: por ejemplo, que el llamador pase
  las partes variables por separado y la plantilla las escape.
- No hace falta una librería: escapar `& < > " '` alcanza para un atributo o un
  cuerpo de HTML.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

<!-- El agente registra acá las que surjan. -->

## Bitácora
