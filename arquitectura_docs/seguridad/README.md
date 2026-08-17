# Seguridad

Controles obligatorios. No son recomendaciones: una feature que incumpla
cualquiera de estos **no pasa revisión**, aunque funcione.

| Archivo | Cubre |
|---|---|
| `01-base-de-datos.md` | RLS, menor privilegio, aislamiento entre clientes |
| `02-secretos-y-llaves.md` | Qué llave va dónde, qué nunca llega al navegador |
| `03-rate-limiting.md` | Límites por endpoint y cómo se aplican |
| `04-entornos-y-exposicion.md` | Staging sin indexar, sin datos reales, con auth |
| `05-checklist-entrega.md` | La barrera antes de entregar a un cliente |
| `incidente-fuga-de-llave.md` | Qué hacer en los primeros 15 minutos |
| `verificar.sh` | Chequeo automático de lo que se puede detectar por texto |

## Las cuatro reglas en una línea cada una

1. **Base de datos cerrada por defecto.** RLS activo en toda tabla expuesta. Sin
   política, nadie ve nada.
2. **Ninguna llave secreta llega al navegador.** Si está en el bundle, es pública
   — aunque esté en una variable de entorno.
3. **Todo endpoint tiene límite.** Sin rate limiting, un script te vacía la base
   o te quema el presupuesto de SMS en una tarde.
4. **Staging no es público ni tiene datos reales.** Ni indexado, ni sin
   autenticación, ni con la base de producción copiada.

## Por qué esto importa más en SistemaOne que en un producto propio

Vendemos sistemas llave en mano a empresas. Los datos que se filtren no son
nuestros: son de los clientes de nuestro cliente. Una filtración no cuesta un
sprint, cuesta el contrato completo y la reputación con la que se consiguen los
siguientes.

Y como el modelo es reutilizar `core/` entre clientes: **un agujero en `core/` es
un agujero en todos los clientes a la vez.** Por eso los controles viven acá y no
en la carpeta de cada proyecto.

## Cómo lo usa el agente

- Antes de tocar auth, datos o endpoints: lee el archivo que corresponda.
- El agente `revisor` verifica estos controles en cada feature.
- `/auditar-seguridad` corre la revisión completa contra el checklist.
