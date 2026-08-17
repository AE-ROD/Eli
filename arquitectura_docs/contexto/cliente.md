# Contexto del producto

> El estándar original describe acá al cliente de una agencia. Eli es un **producto
> propio**, así que esta ficha describe a quién le vendemos, no a quién nos contrató.

## Qué es Eli

**El sistema de reservas que además reparte el dinero.**

Gestiona agenda, clientes y equipo de cualquier negocio que trabaje con reservas, y
resuelve lo que ninguna herramienta de agendamiento resuelve bien: cuánto le
corresponde a cada profesional por lo que atendió.

## A quién le habla

A cualquier negocio que trabaje con reservas. **No se enumeran rubros.**

Listar rubros ("barberías, consultorios, gimnasios…") excluye a quien no aparece y
degrada a quien aparece último. El posicionamiento apunta al comportamiento
compartido:

> **Si tu negocio trabaja con reservas, Eli es para ti.**

**Consecuencia para el código y la interfaz:** no existe vocabulario por rubro. Se
dice **"Clientes"** en toda la aplicación. Nada de íconos, ejemplos ni imágenes
atados a un tipo de negocio.

## Qué le duele

El profesional que atiende se lleva un porcentaje del servicio y el negocio retiene
el resto. Hoy eso se calcula con planilla, calculadora o memoria.

A fin de mes eso produce tres problemas: **errores** de cálculo, **discusiones** con
el equipo, y **desconfianza** — el empleado no puede verificar el número que le dan.

## Cómo trabaja hoy

Agenda en WhatsApp, datos de clientes en una libreta, y el reparto en una planilla
aparte que nadie más ve. Lo que estamos reemplazando es esa combinación, no un
software.

## Reglas de negocio innegociables

- **La comisión de una cita completada no se recalcula nunca.** Se congela el
  porcentaje y el monto aplicados. Cambiar un porcentaje hoy no puede alterar
  liquidaciones ya pagadas.
- **Una comisión sin configurar no vale cero.** Queda pendiente y se avisa. Asumir
  cero liquida de menos sin que nadie lo note.
- **Sólo el dueño configura porcentajes.** El encargado gestiona la operación pero
  no toca dinero.
- **El profesional no ve la facturación del negocio**, sólo lo suyo.
- **Todo cambio de porcentaje deja registro**: quién, cuándo, de qué valor a qué
  valor. Sin historial, una disputa no se puede resolver.
- **No se vende ninguna función que no exista.** La versión anterior listaba
  "reportes exportables" en planes pagos sin haberlos construido.

## Modelo de negocio

Suscripción mensual por negocio. **No se cobra comisión sobre las reservas**: Eli
administra el dinero del negocio, no lo toca.

Pendiente: precio, límites por plan y duración de la prueba gratuita.

## Integraciones

| Sistema | Para qué | Estado |
|---|---|---|
| Neon (PostgreSQL) | Base de datos | Activo, con migraciones aplicadas |
| Vercel | Hosting y cron de recordatorios | Activo |
| Resend | Correos transaccionales | Configurado en código; falta verificar dominio (SPF/DKIM) |
| Upstash Redis | Rate limiting | Falta crear la cuenta |
| Google OAuth | Login con Google | Configurado en código; faltan credenciales |
| Stripe | Cobro de la suscripción | **No integrado** |

## Qué NO está en alcance de v1

- Cobro online al cliente final (mete a Eli a procesar plata de terceros: comisiones,
  reembolsos, disputas y requisitos legales, sin reforzar el diferenciador)
- Reportes exportables
- Aplicación móvil nativa
- Multi-sucursal
- Super administrador de la plataforma
