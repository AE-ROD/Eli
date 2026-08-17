# 04 — Entornos y exposición pública

## La regla

**Staging no es público y no tiene datos reales.** Las dos cosas, siempre. Cada
una por su lado no basta.

Un staging indexado por Google con la base de producción copiada es la filtración
más común y más evitable que existe. Y en nuestro caso los datos no son
nuestros: son de los clientes de nuestro cliente.

## Nivel 1 — Que no se pueda entrar

Esta es la defensa real. Lo demás es refuerzo.

- Autenticación a nivel de plataforma delante de todo: HTTP basic auth, lista
  blanca de IP o VPN. Antes de la aplicación, no dentro de ella.
- Subdominio propio (`staging.cliente.cl`), nunca una ruta de producción.
- Credenciales, llaves y base de datos **distintas** de producción.

Si staging pide contraseña a nivel de servidor, Google no puede indexarlo aunque
quiera. Ese es el control fuerte.

## Nivel 2 — Que no aparezca en buscadores

Cabecera en **todas** las respuestas de staging:

```
X-Robots-Tag: noindex, nofollow, noarchive
```

Y en el HTML, como respaldo:

```html
<meta name="robots" content="noindex, nofollow">
```

### `robots.txt` no es un control de seguridad

Dos motivos, y conviene entenderlos bien:

1. **Es público y es un mapa.** `/robots.txt` lo lee cualquiera. Si listas
   `Disallow: /admin`, acabas de publicar dónde está tu panel.
2. **`Disallow` no impide la indexación.** Le dice a Google que no *rastree* la
   página. Si alguien enlaza esa URL desde afuera, Google puede indexarla igual,
   sin contenido pero con la dirección visible. Peor: al no poder rastrearla,
   nunca ve tu `noindex`.

Por eso el orden correcto es: **contraseña primero**, y si el sitio debe quedar
accesible, `X-Robots-Tag: noindex` **permitiendo** el rastreo para que Google
efectivamente lea la instrucción.

Además en staging: sin `sitemap.xml`, sin enlaces desde producción, sin
herramientas de analítica de producción.

## Nivel 3 — Que no haya nada que filtrar

Aunque entren, que no encuentren datos de personas reales.

- **Prohibido copiar la base de producción a staging.** Sin excepciones.
- Los datos de prueba se **generan**. Si hace falta volumen realista, se
  anonimiza en el proceso de copia, no después:
  - nombres, RUT, correos y teléfonos reemplazados por valores falsos
  - direcciones generalizadas
  - montos alterados con ruido si son sensibles comercialmente
- **Correo saliente capturado**, nunca enviado a direcciones reales. Un envío
  masivo de prueba a la base de clientes del cliente es un incidente grave.
- Pasarelas de pago en modo prueba, siempre.
- Integraciones con terceros apuntando a los ambientes de prueba de ellos.

## Producción

- HTTPS obligatorio, HSTS activo, sin contenido mixto.
- Sin `.git`, `.env`, backups ni carpetas de administración accesibles por URL.
- Errores genéricos hacia afuera; el detalle va al log, no a la pantalla.
- Sin trazas de error visibles al usuario: revelan rutas, versiones y estructura.
- Modo depuración apagado. Un `DEBUG=true` en producción publica variables de
  entorno completas en cualquier error.

## Verificación periódica

Una vez al mes, y siempre antes de entregar:

```
site:staging.cliente.cl          en Google
site:cliente.cl inurl:admin
```

Si aparece algo indexado: quítalo, pide la remoción de URL en Search Console y
revisa qué quedó cacheado.

## Definición de terminado

- [ ] Staging detrás de autenticación de plataforma
- [ ] `X-Robots-Tag: noindex` en todas sus respuestas
- [ ] Sin sitemap ni enlaces desde producción
- [ ] Cero datos reales; los de prueba están generados o anonimizados
- [ ] Correo saliente capturado
- [ ] Credenciales distintas de producción
- [ ] Búsqueda `site:` sin resultados
