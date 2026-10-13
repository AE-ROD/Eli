# Sistema de diseño

Cómo se ve Eli y de dónde sale cada decisión visual. Los tokens viven en
`app/globals.css`; los componentes base, en `components/comunes/`. La landing
y el panel usan los mismos.

> **`mockup-landing.html` es la dirección anterior** (terracota, DM Serif
> Display, grano de papel) y quedó **reemplazada** por este sistema. Se
> conserva como referencia histórica, no como diseño vigente. Las seis
> exploraciones que llevaron a ese mockup siguen en el historial:
> `git show 06aed7a --stat`.

La idea que ordena todo: **claridad y confianza con el dinero**. Exacto,
transparente, calmo. Fondo crema (nunca blanco puro), tarjetas blancas encima,
texto navy, y un pastel por módulo que lo distingue de un vistazo.

## Tokens

Cada token es una variable de `@theme` en `app/globals.css` y Tailwind la
vuelve clase: `--color-navy` → `bg-navy`, `text-navy`, `border-navy`…;
`--radius-tarjeta` → `rounded-tarjeta`. **En el código se usan las clases, no
valores sueltos**: un `#071A31` escrito a mano no cambia cuando cambia el token.

### Color

| Clase | Valor | Para qué |
|---|---|---|
| `crema` | `#FCFBF8` | Fondo de página |
| `superficie` | `#F5F3EE` | Islas y superficies secundarias |
| `tarjeta` | `#FFFFFF` | Tarjetas, paneles y campos |
| `navy` | `#071A31` | Texto, acción primaria, pie y bloques oscuros |
| `texto-2` | `#5F6D77` | Texto secundario y borde de los campos |
| `borde` | `#E7E3DA` | Bordes decorativos; fondo de insignias grises y esqueletos. **No** para el borde de un control: contra crema no llega a 3:1 |
| `error` | `#B91C1C` | Errores de formulario y acciones que no se deshacen |

Un par de pasteles por módulo. `lib/modulos.ts` le asigna uno a cada módulo y
no se repiten:

| Módulo | Fuerte | Suave |
|---|---|---|
| Agenda | `azul` `#84C1FF` | `azul-suave` `#D5E8FE` |
| Tablero | `naranja` `#F5A85A` | `naranja-suave` `#FDEBD8` |
| Clientes | `lila` `#C9B8FF` | `lila-suave` `#EEE8FF` |
| Reportes | `lima` `#CEE67E` | `lima-suave` `#F2F8DE` |
| Equipo | `turquesa` `#8FE0D6` | `turquesa-suave` `#E6F7F5` |

El fuerte es el fondo del ícono del módulo activo; el suave, fondos,
insignias y el halo del foco. El texto sobre cualquiera de los dos es navy.

Los nombres semánticos de shadcn que usa el panel apuntan a la paleta:
`background` = crema · `foreground` = navy · `primary` = navy (con
`primary-foreground` blanco) · `secondary`, `muted` y `accent` = superficie ·
`muted-foreground` = texto-2 · `card` y `popover` = blanco · `border` = borde ·
`input` = texto-2 · `ring` = navy · `destructive` = error. Por eso el panel
cambió de aspecto sin tocar sus archivos. En código nuevo, mejor los nombres
propios.

No hay modo oscuro. Las clases `dark:` no se activan nunca.

### Tipografía

| Clase | Teléfono → desde md (768px) | Fuente |
|---|---|---|
| `titulo-1` | 40 → 72px, interlineado 1.1, tracking −1 → −2px | Geist 500 |
| `titulo-2` | 28 → 48px, 1.1, −0.5 → −2px | Geist 500 |
| `titulo-seccion` | 28 → 48px, 1.1, −0.5 → −1.5px | Fraunces 500 |
| `titulo-3` | 24px, 1.25, −0.5px | peso 500, la fuente que herede |
| `cuerpo-xl` | 18px, 1.4 | |
| `antetitulo` | 12 → 13px, mayúsculas, +0.08em, 500, color texto-2 | |

El cuerpo (16px) y el texto chico (14px) son `text-base` y `text-sm`. Los
titulares llevan siempre tracking negativo.

`font-sans` es Geist, la de todo. `font-serif` y `font-display` son Fraunces,
para titulares de sección, citas y chips de palabra, siempre con
`font-medium`. Las carga `next/font` en `app/layout.tsx`, con el eje de tamaño
óptico de Fraunces para que un titular grande tenga trazo de titular.

### Radios

| Clase | Valor | Para qué |
|---|---|---|
| `rounded-boton` | 16px | Botones sm y md |
| `rounded-boton-lg` | 20px | Botones lg |
| `rounded-campo` | 14px | Campos y selectores |
| `rounded-panel` | 32px | Paneles flotantes, como el del menú |
| `rounded-tarjeta` | 48px | Tarjetas |
| `rounded-seccion` | 64px | Islas |
| `rounded-full` | — | Píldoras |

`squircle` agrega `corner-shape: squircle` donde el navegador lo sabe
dibujar; en el resto queda el radio común. Va **junto** al radio, no en su
lugar, y **nunca con `rounded-full`**: una píldora es una píldora, y la
superelipse le aplana las puntas (Chrome 139 o más). Por eso una píldora no
se arma con `Boton` ni `BotonIcono`, que traen `squircle`. `rounded-sm`, `-md`, `-lg` y `-xl` siguen siendo los del panel (8, 10,
12 y 16px).

### Sombras

`shadow-sm` (en reposo) y `shadow-md` (elevada: tarjeta interactiva en hover,
encabezado flotante) reemplazan a las de Tailwind. Están teñidas con el gris
del texto secundario, nunca negras.

### Movimiento

| Qué | En CSS | En framer-motion (`components/movimiento/tiempos.ts`) |
|---|---|---|
| Hover y colores | `duration-150 ease-suave` | `DURACION.hover`, `CURVA.suave` |
| Sombras | `duration-200 ease-suave` | `DURACION.sombra` |
| Indicadores y píldoras | `duration-300 ease-suave` | `DURACION.pildora` |
| Expandir tarjetas | `duration-500 ease-in-out` | `DURACION.expandir` con `"easeInOut"` |
| Fundidos de contenido | `duration-600 ease-fundido` | `DURACION.fundido`, `CURVA.fundido` |
| Brillo de carga | `animate-brillo` (2,4 s, lineal, sin fin) | — |

Se anima sólo `transform` y `opacity`. Las excepciones son las que pide el
diseño: el ancho de las tarjetas que se expanden y el tamaño del panel del
menú.

**Movimiento reducido.** Con "reducir movimiento" en el sistema:

- `app/globals.css` apaga las animaciones y transiciones de CSS;
- `MotionConfig reducedMotion="user"` (`components/proveedores.tsx`) hace que
  framer-motion no anime desplazamientos ni escalas, sólo fundidos;
- lo que se mueve con el scroll lo apaga cada componente con
  `useReducedMotion`: nada ligado al scroll, sólo fundidos cortos.

### Layout

- `contenedor`: `mx-auto w-full max-w-[1440px]`.
- `isla`: un bloque redondeado (`rounded-seccion`, squircle) separado 8px del
  borde de la pantalla, 24px desde md. La separación vertical entre islas la
  pone quien las apila (`gap-2 md:gap-6`), no cada isla.
- En las páginas con el encabezado público (`data-encabezado-publico`, lo
  pone `Encabezado`), lo que se alcanza con un enlace `#` o con Tab queda
  debajo de la tarjeta flotante gracias al `scroll-padding-top` del `<html>`
  (76px en teléfono, 120px desde md). Por eso esas secciones no llevan
  `scroll-mt-*`: se sumaría. El panel no lo usa: tiene su propia barra fija y
  sus propios márgenes.
- Breakpoints de Tailwind: `md` 768, `lg` 1024, `xl` 1280. Todo tiene que
  funcionar de 360px a 1440px o más sin scroll horizontal.

### Foco

- **`anillo-foco` en todo lo que se enfoca.** En `:focus-visible` pone un
  contorno navy de 2px, separado 2px, y alrededor un halo de 6px del pastel
  suave. El halo solo no llega al contraste de 3:1; el contorno sí. El halo se
  suma a la sombra: una tarjeta con `shadow-sm` no la pierde al enfocarse.
- **Sobre navy, el contorno es blanco.** `anillo-foco-claro` va una sola vez
  en el contenedor navy (una isla, el pie, una barra) y vale para todo lo que
  tiene adentro, como el halo; no se pone en cada botón. `Seccion
  fondo="navy"` ya lo trae. Una superficie clara dentro de un fondo navy lo
  devuelve a navy con `anillo-foco-oscuro`, y la `Tarjeta` ya lo trae.
- El halo es azul por defecto. `halo-agenda`, `halo-tablero`,
  `halo-clientes`, `halo-reportes` y `halo-equipo` lo cambian por el pastel de
  ese módulo para todo lo que está adentro: se ponen en el contenedor de la
  pantalla del módulo. En el código, `HALO_DE_MODULO[modulo]`
  (`colores-de-modulo.ts`) da la clase de un módulo, escrita entera.

## Dónde vive cada cosa

`components/comunes/`:

| Archivo | Qué es |
|---|---|
| `boton.tsx` | `Boton` y `clasesDeBoton`. Variantes primario, secundario, fantasma, enlace e invertido; altos de 36, 48 y 56px; ícono en un cuadro a la izquierda. Con `href` es un `Link`; sin `href`, un `<button>` con estado `cargando`. De ancho natural no se achica; con `w-full` sí, hasta el ancho de su texto, para que dos compartan una fila |
| `boton-icono.tsx` | `BotonIcono`: cuadrado de sólo ícono, blanco, navy en hover. `etiqueta` es su nombre |
| `boton-primario.tsx` | `BotonPrimario`: la API de siempre de formularios y panel, por dentro un `Boton`. Suma la variante `peligro` |
| `tarjeta.tsx` | `Tarjeta`: blanca, radio de tarjeta, sombra sm. `interactiva` se eleva en hover y con el foco adentro |
| `seccion.tsx` | `Seccion` (isla crema, superficie, navy o degradado, con contenedor de 1440px) y `EncabezadoDeSeccion` (antetítulo, titular en serif, subtítulo) |
| `antetitulo.tsx` | `Antetitulo` |
| `insignia.tsx` | `Insignia`: píldora gris ("Beta", "Nuevo") o del pastel de un módulo |
| `chip-de-palabra.tsx` | `ChipDePalabra`: una palabra en serif sobre píldora blanca |
| `icono-de-modulo.tsx` | `CuadroDeIcono` (un ícono de lucide en un cuadro de pastel, 32, 40 o 48px; `activo` pasa del suave al fuerte), `IconoDeModulo` (el mismo cuadro con el ícono y el color del módulo) e `ICONOS_DE_MODULO` |
| `campo-formulario.tsx` | `CampoFormulario`: etiqueta, campo y error; muestra u oculta la contraseña |
| `selector.tsx` | `Selector`: `<select>` nativo con etiqueta y error |
| `interruptor.tsx` | `Interruptor`: un sí/no con `role="switch"` |
| `esqueleto.tsx` | `Esqueleto`: el lugar de algo que carga, en barra o círculo |
| `logo-eli.tsx` | `LogoEli` |
| `colores-de-modulo.ts` | `FONDO_SUAVE`, `FONDO_FUERTE` (las clases de fondo de cada pastel) y `HALO_DE_MODULO` (la clase de halo de cada módulo) |
| `estilos-de-campo.ts`, `error-de-campo.tsx` | Piezas que comparten los de arriba y `components/panel/estilos.ts` |

Fuera de `comunes/`:

- `lib/modulos.ts`: los cinco módulos, con nombre, frase, ruta y color. El
  menú, el recorrido y los íconos leen de acá.
- `components/movimiento/`: los tiempos (`tiempos.ts`) y los patrones de
  movimiento de la landing, que se cuentan abajo.
- `components/panel/estilos.ts`: las clases de campo y foco del panel, con el
  mismo aspecto que `CampoFormulario` pero más compactas.

Las primitivas de shadcn (`components/ui/button` e `input`) se retiraron:
las reemplazan `Boton` y `CampoFormulario`.

**Cómo se escriben las variantes.** Con class-variance-authority (`cva`) más
`cn`: `cva` junta las clases de cada combinación (la variante y el tamaño del
botón, el fondo de la sección, el tono de la insignia) y `cn` resuelve los
choques al final, así lo que llega en `className` le gana a la variante. Un
componente nuevo con variantes sigue el mismo molde; `boton.tsx` es el
ejemplo más completo, con variantes compuestas.

## Patrones de movimiento

Viven en `components/movimiento/` y arman la landing. Todos respetan el
movimiento reducido: no toman el scroll, no se desplazan solos y dejan sólo
fundidos. Donde piden un ícono, va ya en su cuadro (`CuadroDeIcono` o
`IconoDeModulo`): el patrón no le pone color.

| Archivo | Qué hace | Lo que recibe |
|---|---|---|
| `revelar.tsx` | `Revelar`: entra una sola vez al aparecer en pantalla, con un fundido y 16px de subida | `retraso?` (segundos), `como?` (`div`, `li` o `section`), `className?` |
| `escenario-con-scroll.tsx` | `EscenarioConScroll`: una tarjeta que queda fija mientras se baja y cambia de paso con el scroll, con pestañas de íconos, una maqueta por paso y "Saltar el recorrido". En el teléfono, en ventanas de menos de 640px de alto y con movimiento reducido, las pestañas cambian el paso y también se desliza con el dedo | `pasos` (`id`, `modulo`, `titulo`, `texto`, `puntos?`, `maqueta(activa)`), `etiqueta`, `saltarA` |
| `lista-fija.tsx` | `ListaFija`: titular y visual fijos al lado de una lista; el ítem que cruza el centro de la pantalla decide qué muestra el visual | `encabezado`, `items` (`id`, `icono`, `titulo`, `texto`, `visual`), `invertida?`, `fondoDelVisual?` |
| `tarjetas-expandibles.tsx` | `TarjetasExpandibles`: cuatro tarjetas en fila; la activa crece y muestra su línea de pasos. Por debajo de xl se apilan, abiertas | `tarjetas` (justo cuatro: `id`, `icono`, `titulo`, `corto`, `largo`, `pasos`) |
| `carrusel-de-historias.tsx` | `CarruselDeHistorias`: una tarjeta grande y las demás historias como píldoras a los lados. Avanza solo cada 5 s, con botón de pausa | `historias` (`id`, `oficio`, `titulo`, `texto`, `color`, `escena`), `etiqueta` |
| `marquesina.tsx` | `Marquesina`: una fila de palabras que se desplaza sin fin. Se detiene con el cursor encima, fuera de pantalla y con su botón de pausa | `palabras`, `etiqueta` |
| `grilla-de-iconos.tsx` | `GrillaDeIconos`: tiles grises unidos por puentes cóncavos | `tiles` (`id`, `titulo`, `icono`) |
| `usar-direccion-de-scroll.ts` | `useDireccionDeScroll()`: el estado del encabezado (`arriba`, `oculto` o `flotante`); la regla está en `lib/direccion-de-scroll.ts` | — |
| `usar-coincide-media.ts` | `useCoincideMedia(consulta, enServidor?)`: si la ventana cumple una media query. Mientras hidrata vale lo mismo que el HTML del servidor; es para cuando la consulta decide el marcado (para elegir sólo una curva alcanza `useReducedMotion`) | — |

Un ejemplo, el recorrido de la landing (`components/landing/seccion-recorrido.tsx`):

```tsx
const PASOS: readonly PasoDelEscenario[] = [
  {
    id: "agenda",
    modulo: "agenda", // el color y el ícono de la pestaña
    titulo: "Reservan solas",
    texto: "Cada negocio tiene su página de reservas…",
    puntos: ["Servicio, día y hora, y sus datos"],
    // Todas las maquetas quedan montadas: `activa` vuelve a animar la del paso elegido.
    maqueta: (activa) => <MaquetaReserva activa={activa} />,
  },
  // …un paso más por módulo
]

<EscenarioConScroll pasos={PASOS} etiqueta="Pasos del recorrido" saltarA="un-dia" />
```

## Cómo extender los tokens

Todo token nuevo va en el bloque `@theme static` de `app/globals.css`, con un
comentario de para qué es. `static` hace que la variable exista siempre en
`:root`, aunque ninguna clase la use todavía.

**Un color de módulo.**

1. En `@theme static`, el par: `--color-<nombre>` y `--color-<nombre>-suave`.
   Eso crea `bg-<nombre>`, `text-<nombre>-suave` y el resto.
2. Su halo, al lado de los otros:
   `@utility halo-<módulo> { --halo: var(--color-<nombre>-suave); }`.
3. En `lib/modulos.ts`, el nombre en `ColorDeModulo`; si el módulo es nuevo,
   su id en `ModuloId` y su entrada en `MODULOS`. El test exige que los
   colores no se repitan.
4. En `components/comunes/colores-de-modulo.ts`, sus clases en `FONDO_SUAVE`
   y `FONDO_FUERTE`, escritas enteras: Tailwind no ve una clase armada con
   `${color}`. Si es un módulo nuevo, su ícono en `ICONOS_DE_MODULO`.
   TypeScript avisa lo que falte.
5. Comprueba el contraste del texto navy sobre el fuerte y sobre el suave:
   4,5:1 como mínimo.

**Un radio.** En `@theme static`, `--radius-<nombre>: 24px;`. Crea
`rounded-<nombre>`, `rounded-t-<nombre>` y el resto. Suma el nombre a la lista
`radius` de `lib/utils.ts` (ver abajo). Si va en un componente, agrégale
`squircle`.

**Una sombra.** En `@theme static`, `--shadow-<nombre>: …;`, teñida con el gris
del texto secundario (`#5f6d77` más un alfa), nunca negra. Crea
`shadow-<nombre>`. Si el nombre no es un tamaño (`sm`, `md`, `lg`…), súmalo a
`shadow` en `lib/utils.ts`. Cambiar `--shadow-sm` o `--shadow-md` cambia todas
las tarjetas, de la landing y del panel.

**Un nivel de tipografía.** Un `@utility` con el tamaño de teléfono y, dentro
de `@media (width >= 48rem)`, el de escritorio. Tamaños en `rem`, para que
respeten el tamaño de letra que eligió la persona.

**Un tiempo o una curva.** En los dos lados: `app/globals.css` y
`components/movimiento/tiempos.ts`. Si no, la misma interacción se mueve
distinto según la anime CSS o JavaScript. Una curva nueva suma su nombre a
`ease` en `lib/utils.ts`, y una animación nueva, a `animate`.

### `cn` y los nombres propios

`cn` (`lib/utils.ts`) resuelve los choques entre clases quedándose con la
última, y conoce los radios, las curvas y la animación propios:
`cn("rounded-tarjeta", "rounded-[24px]")` deja `rounded-[24px]`. Colores y
sombras con nombre de tamaño los reconoce solo. Un radio, una curva, una
animación o una sombra con otro nombre que no esté en sus listas deja las dos
clases, y gana la que el CSS escriba después, que va por orden alfabético: por
eso cada token nuevo de esos tipos se suma ahí.

## Accesibilidad

No es opcional:

- foco visible con `anillo-foco`;
- contraste AA: `texto-2` da 5,1:1 sobre crema y 4,8:1 sobre superficie (pasa
  justo: no le bajes la opacidad). Sobre navy, blanco al 70% o más;
- objetivos táctiles de 44px como mínimo (el botón sm y el `BotonIcono` sm los
  estiran con `::after`);
- teclado completo, con `aria-expanded` y `aria-selected` donde corresponda;
- lo que se mueve solo más de 5 segundos se puede detener (WCAG 2.2.2): la
  marquesina y el carrusel tienen su botón de pausa;
- movimiento reducido, como dice arriba.

## Lo que una pantalla no puede mostrar

Las maquetas del producto se arman con HTML real animado, nunca con imágenes,
y muestran sólo lo que Eli hace (`docs/PRODUCTO.md`). Datos de ejemplo sí, con
nombres comunes y montos de ejemplo en pesos.

**No se dibuja, porque el producto no lo hace:** elegir profesional al
reservar, porcentaje de ocupación, bloquear horarios, comisiones calculadas
solas, pagos en línea, WhatsApp u otras integraciones, app nativa.

**Tampoco:** testimonios, nombres de negocios reales, logos de clientes, cifras
de marketing ("+500 salones") ni precios de planes, que no están definidos.

Una pantalla que promete algo que al hacer clic no pasa es el mismo problema
que los datos inventados.
