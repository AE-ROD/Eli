# Sistema de diseño

Cómo se ve Eli y de dónde sale cada decisión visual. Los tokens viven en
`app/globals.css`; los componentes base, en `components/comunes/`. La landing
y el panel usan los mismos, y la landing suma su paleta propia ("Frutos
rojos", más abajo) y titulares en Geist.

> **El mockup de la dirección anterior** (terracota, DM Serif Display, grano
> de papel) quedó **reemplazado** por este sistema y ya no está en el repo.
> Vive en el historial: `git show 811d178:docs/diseno/mockup-landing.html`.
> Las seis exploraciones que llevaron a ese mockup, también:
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

#### La paleta de la landing: Frutos rojos

**Sólo la landing** (`components/landing/`). El panel, la reserva y el acceso
siguen con navy y los pasteles de módulo. Tres colores con un papel cada uno,
sobre la misma crema; los contrastes están en el comentario de cada token:

| Clase | Valor | Para qué |
|---|---|---|
| `frambuesa`, `-suave`, `-texto` | `#E4336F`, `#FDE6EE`, `#B3194F` | Lo enredado ("enredado."). La fuerte llega a 3,9:1 sobre crema: sólo texto de 24px o más, o decoración. Texto chico, `frambuesa-texto` |
| `ciruela`, `-suave`, `-claro` | `#5B2A86`, `#EFE6F6`, `#D9C7EC` | Lo que Eli ordena. Texto de cualquier tamaño; `-claro`, barras secundarias de gráficos |
| `pistacho`, `-suave`, `-oscuro`, `-texto` | `#A6D65A`, `#EAF6D6`, `#3E6B12`, `#2F5E12` | El toque: puntos, subrayado, tildes. Navy encima del fuerte; `-oscuro` para íconos y tildes, `-texto` para texto chico |
| `anil`, `-suave` | `#1B2A6B`, `#E4E9F2` | El cuarto tinte de los pasos (el de navy) y su texto |
| `lavanda`, `pervinca`, `rosa` (y `-suave`) | `#C79BE0`/`#F1E4F8`, `#8FA8F0`/`#E1E8FA`, `#F59BB9`/`#FDE3EC` | Un par por oficio: peluquería, barbería, spa de uñas (odontología usa pistacho). Tarjeta detrás de la foto y fondo de la sección |
| `orquidea`, `violeta` | `#B8579E`, `#8D5CC4` | Los tramos de `degradado-frutos` |
| `cereza`, `-oscuro` | `#D92B3F`, `#B81F33` | La acción principal ("Crear cuenta", `Boton variante="destacado"`) y su hover |
| `borde-suave` | `#EFEADE` | Bordes de maquetas y separadores. Decorativo |

Utilidades de la landing, en `app/globals.css`:

- `resaltado`: la palabra que Eli ordena, en ciruela con un subrayado grueso
  de pistacho. Otros colores con `--resaltado-texto` y `--resaltado-fondo`.
- `antetitulo-pildora`: el antetítulo en píldora blanca con un punto pistacho.
- `fondo-brillos` (portada) y `fondo-brillos-navy` (pie y cierre): las
  manchas de la paleta sobre crema o sobre navy.
- `fondo-tenue-frambuesa`, `fondo-tenue-pistacho` y `fondo-tenue-ciruela`:
  los brillos suaves detrás de las secciones del medio (dos manchas al 9-18%,
  cada una con su par de colores). Traen una máscara que los apaga arriba y
  abajo, así dos secciones seguidas no dejan costura: van en una capa propia
  detrás del contenido, nunca en el `<section>`. `SeccionDeLanding` la pone
  con `tono`.
- `degradado-frutos`: frambuesa → orquídea → violeta; en texto, con
  `bg-clip-text text-transparent`.
- `animaciones-en-pausa`: congela las animaciones de CSS del bloque y de lo
  de adentro. Va con `BotonDePausa`.

Los nombres semánticos de shadcn (`background`, `foreground`, `primary`,
`muted`, `border`, `ring`…) se retiraron de `app/globals.css`: lo poco que los
usaba pasó a los nombres propios con el mismo valor (`crema`, `navy`, `borde`).
Se usan sólo los nombres de esta paleta. De shadcn quedan los radios
`rounded-sm`/`md`/`lg`/`xl` (8, 10, 12 y 16 px), que el panel todavía usa.

**Los cuatro tintes de la landing** (ciruela, frambuesa, pistacho y añil, en
ese orden) reparten pasos, tarjetas y piezas: el paso 1 es ciruela, el 2
frambuesa, y así. Sus clases, escritas enteras, están en
`components/landing/tonos-de-la-landing.ts` (`CLASES_DE_TONO[tono]`: `suave`,
`texto`, `relleno`, `anillo` y `barra`; `tonoEn(indice)` da el tinte de un
lugar de una lista). **Texto secundario sobre un tinte:** `texto-2` no llega a
4,5:1 sobre el suave de ciruela, frambuesa ni añil; ahí va `text-navy/75`.

No hay modo oscuro. Las clases `dark:` no se activan nunca.

### Tipografía

| Clase | Teléfono → desde md (768px) | Fuente |
|---|---|---|
| `titulo-1` | 40 → 72px, interlineado 1.1, tracking −1 → −2px | Geist 500 |
| `titulo-2` | 28 → 48px, 1.1, −0.5 → −2px | Geist 500 |
| `titulo-seccion` | 28 → 48px, 1.1, −0.5 → −1.5px | Fraunces 500 |
| `titulo-portada` | 40 → 56 (md) → 68px (lg), 1.06, −0.045em | Geist 500. El `<h1>` de la landing |
| `titulo-landing` | 32 → 44 (md) → 54px (lg), 1.04, −0.045em | Geist 500. El `<h2>` de cada sección de la landing (`EncabezadoDeLanding`) |
| `titulo-3` | 24px, 1.25, −0.5px | peso 500, la fuente que herede |
| `cuerpo-xl` | 18px, 1.4 | |
| `antetitulo` | 12 → 13px, mayúsculas, +0.08em, 500, color texto-2 | |

El cuerpo (16px) y el texto chico (14px) son `text-base` y `text-sm`. Los
titulares llevan siempre tracking negativo.

`font-sans` es Geist, la de todo. `font-serif` y `font-display` son Fraunces,
para titulares de sección, citas y chips de palabra, siempre con
`font-medium`. La landing ya no usa Fraunces en sus titulares: van en Geist
con `titulo-portada` y `titulo-landing`. Las carga `next/font` en `app/layout.tsx`, con el eje de tamaño
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
| `rounded-etiqueta` | 14px | Landing: etiquetas flotantes ("WhatsApp", "Cuaderno") |
| `rounded-ficha` | 18px | Landing: filas con ícono y tilde |
| `rounded-maqueta` | 22px | Landing: la tarjeta blanca de una maqueta de producto |
| `rounded-bloque` | 36px | Landing: escenarios y bloques de color grandes |
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
del texto secundario, nunca negras. `shadow-maqueta`, más honda y con el
mismo gris, es la de una maqueta de producto que flota en la landing.

### Movimiento

| Qué | En CSS | En framer-motion (`components/movimiento/tiempos.ts`) |
|---|---|---|
| Hover y colores | `duration-150 ease-suave` | `DURACION.hover`, `CURVA.suave` |
| Sombras | `duration-200 ease-suave` | `DURACION.sombra` |
| Indicadores y píldoras | `duration-300 ease-suave` | `DURACION.pildora` |
| Expandir tarjetas | `duration-500 ease-in-out` | `DURACION.expandir` con `"easeInOut"` |
| Fundidos de contenido | `duration-600 ease-fundido` | `DURACION.fundido`, `CURVA.fundido` |
| Brillo de carga | `animate-brillo` (2,4 s, lineal, sin fin) | — |
| Landing: lo que entra o cambia de lugar solo | `duration-900 ease-llegada` | `DURACION.llegada`, `CURVA.llegada` |
| Landing: las líneas del enredo | — | `CURVA.onda` (`TrazosOndulantes`) |
| Landing: flotar, latido, señalar | `animate-flotar` (7 s), `animate-latido` (3,2 s), `animate-senalar` (1,6 s), sin fin | — |
| Landing: filas que llegan, barras de gráfico | `animate-aparecer` (10 s), `animate-crecer-columna` y `animate-crecer-barra` (9 s), sin fin | — |
| Landing: un punto que recorre una línea | `animate-recorrer` (una capa que va de −100% a 0, 9 s) y `animate-recorrer-camino` (un `<path>` de SVG, 16 s), sin fin | — |
| Landing: el reloj de un paso que avanza solo | `animate-progreso` (una barra que se llena una vez, 6,5 s) | — |

Las animaciones de la landing toman la duración y el retraso de cada elemento
de `--duracion` y `--retraso` (`[--retraso:-2s]`), que no se heredan; por eso
van en un `@theme inline` aparte. Las sin fin se mueven solas más de cinco
segundos: el bloque que las usa lleva un `BotonDePausa`. `flotar` anima
`transform` y se suma a la inclinación de reposo de `rotate-*`; se inclina 2°
en la mitad y `[--giro:0deg]` la deja derecha (una maqueta que sube y baja).
`latido` anima `box-shadow`, así que no va en algo que se enfoca.

- `aparecer`, `crecer-columna` y `crecer-barra` arrancan en su primer cuadro
  mientras esperan su retraso (`backwards`): no se ven llenas y de golpe
  vacías. Las barras crecen desde abajo o la izquierda: `origin-bottom` u
  `origin-left`.
- `recorrer` va en una capa del ancho de la línea, con el punto en su borde
  derecho, y se apaga en los extremos. Con movimiento reducido el punto se
  esconde (`motion-reduce:hidden`).
- `recorrer-camino` va en un `<path>` con `pathLength="1000"`,
  `stroke-dasharray="0.001 999.999"` y punta redonda: el trazo es un solo
  punto, del ancho del trazo, que avanza por cualquier camino. Así se mueve
  por un camino de SVG sin `<animateMotion>`, que no respeta "reducir
  movimiento".
- `progreso` sirve de reloj: quien la usa avanza al terminar
  (`onAnimationEnd`), y la pausa congela la barra y el avance juntos. Con
  movimiento reducido la animación dura 0,01 ms: ahí no se usa (no hay
  avance solo) y `onAnimationEnd` lo vuelve a revisar.

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
  pone `Encabezado`), nada queda escondido debajo de la tarjeta flotante (76px
  en teléfono, 120px desde md):
  - el foco del teclado, por el `scroll-padding-top` del `<html>`, que sólo
    vale con `:focus-visible`: así un clic nunca mueve la página;
  - las anclas, por el `scroll-margin-top` de cada `section[id]`, que vale
    sólo sin foco de teclado para no sumarse al otro.

  Por eso esas secciones no llevan `scroll-mt-*`. El panel no usa nada de
  esto: tiene su propia barra fija y sus propios márgenes.
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
| `boton.tsx` | `Boton` y `clasesDeBoton`. Variantes primario, secundario, fantasma, enlace, invertido y destacado (sólo la landing: cereza, con el cuadro del ícono en pistacho); altos de 36, 48 y 56px; ícono en un cuadro a la izquierda. Con `href` es un `Link`, o un `<a>` común si empieza con `#` (el `Link` de Next no desplaza a un ancla que ya está en la dirección; lo que haga falta al ir va en `onClick`, no en `onNavigate`); sin `href`, un `<button>` con estado `cargando`. De ancho natural no se achica; con `w-full` sí, hasta el ancho de su texto, para que dos compartan una fila |
| `boton-icono.tsx` | `BotonIcono`: cuadrado de sólo ícono, blanco, navy en hover. `etiqueta` es su nombre |
| `boton-primario.tsx` | `BotonPrimario`: la API de siempre de formularios y panel, por dentro un `Boton`. Suma la variante `peligro` |
| `tarjeta.tsx` | `Tarjeta`: blanca, radio de tarjeta, sombra sm. `interactiva` se eleva en hover y con el foco adentro |
| `seccion.tsx` | `Seccion` (isla crema, superficie, navy o degradado, con contenedor de 1440px) y `EncabezadoDeSeccion` (antetítulo, titular con `titulo-landing`, subtítulo). Eran de la landing anterior: la nueva usa `SeccionDeLanding` y hoy nada los usa |
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
- `components/landing/`: las secciones de la landing y lo que comparten:

  | Archivo | Qué es |
  |---|---|
  | `seccion-de-landing.tsx` | `SeccionDeLanding`: una sección del medio, de borde a borde sobre la crema, con los brillos tenues detrás (`tono`) y el contenedor de 1440px (72px de margen a 1440, como el diseño); recorta lo que se sale, así nada deja scroll horizontal. `EncabezadoDeLanding`: el antetítulo en píldora, el `<h2>` con `titulo-landing` (la palabra que importa en `resaltado`) y una bajada; a la izquierda o al centro |
  | `tonos-de-la-landing.ts` | Los cuatro tintes y sus clases (arriba, en "Frutos rojos") |
  | `trazos-de-la-landing.ts` | Las líneas que se ondulan de cada sección, sacadas tal cual del diseño (`formas` de los `values` de cada `<animate>`, `duracion` del `dur`, `desfase` del `begin` sin signo). Cada arreglo dice en su comentario la caja de su `<svg>` |
  | `maquetas/maqueta-piezas.tsx` | Las piezas de las maquetas: `TARJETA_DE_MAQUETA` (blanca, borde, `rounded-maqueta` y `shadow-maqueta`), `MarcoDeMaqueta` (esa tarjeta como imagen con su `etiqueta`), `Avatar`, `Chip`, `Segmentos` y `CuadroDeTono` |
  | `maquetas/*.tsx` | Las maquetas del producto, en HTML: reserva, ficha de clienta, tablero y cobro (el recorrido, con `activa`), los cuatro momentos de un día, las reservas de hoy y quién cobra (tablero), la semana, los turnos, cada profesional y las anuladas (reportes) y la visita con o sin equipo (oficios). Los montos de un mismo gráfico cuadran entre sí y los largos de las barras salen de los montos |
- `components/panel/`: las piezas del panel, que se cuentan más abajo, en
  "El panel".

De shadcn no queda ningún componente ni su configuración (`components/ui/` y
`components.json` se retiraron): `Boton` y `CampoFormulario` reemplazan a
sus primitivas. Tampoco quedan sus nombres semánticos de color; sólo sus
radios, que se cuentan arriba.

**Cómo se escriben las variantes.** Con class-variance-authority (`cva`) más
`cn`: `cva` junta las clases de cada combinación (la variante y el tamaño del
botón, el fondo de la sección, el tono de la insignia) y `cn` resuelve los
choques al final, así lo que llega en `className` le gana a la variante. Un
componente nuevo con variantes sigue el mismo molde; `boton.tsx` es el
ejemplo más completo, con variantes compuestas.

### El panel

Las pantallas de adentro usan las piezas de `comunes/` con un lenguaje más
denso: tarjetas blancas de radio 32 sobre crema, el título de cada tarjeta en
serif a 24px y el pastel del módulo de cada pantalla. Inicio,
configuración y ayuda no son un módulo y van en gris (Chats está escondido
hasta que exista WhatsApp). Lo que comparten las
pantallas vive en `components/panel/`:

| Archivo | Qué es |
|---|---|
| `secciones-del-panel.ts` | Las secciones del panel (inicio, los cinco módulos de `lib/modulos.ts`, configuración y ayuda), con nombre, ruta y módulo, y `seccionDeLaRuta(ruta)`, que dice de qué sección es una página. De acá salen los enlaces de la barra lateral, el antetítulo de cada página y el halo del foco: una sección nueva se agrega acá. `seccionConNombreDelRubro` y `seccionesConNombreDelRubro` le dan a cada sección el nombre de su rubro (en una clínica dental, Clientes es "Pacientes" y Tablero, "Sala de espera") sin tocar su id, su ruta, su color ni su ícono; en cualquier otro rubro la devuelven igual |
| `contexto-rubro.tsx` | `ProveedorDeRubro` y `useRubroDelPanel()`: el rubro del negocio para las piezas de cliente del panel. Lo pone el layout del panel con el rubro del actor del servidor, así la primera pintura ya dice "Pacientes" (con la sesión del navegador, que llega después, el antetítulo decía "Clientes" un instante); sin proveedor, el de la sesión. Las palabras salen de `vocabularioDe(useRubroDelPanel())` (`lib/vocabulario.ts`); qué se muestra lo sigue decidiendo `lib/permisos.ts` |
| `icono-de-seccion.tsx` | `CuadroDeSeccion`: el ícono de una sección en su cuadro. El de un módulo es `IconoDeModulo`, en su pastel fuerte; el de las demás, gris. De 32px en la barra lateral y de 20px en el antetítulo |
| `barra-lateral.tsx`, `contexto-barra-lateral.tsx` | La isla de la izquierda desde lg (240px, 76 colapsada, con la sección actual en la píldora de su pastel y `aria-current`) y, por debajo, el cajón del teléfono con su manejo del foco |
| `barra-superior.tsx` | `BarraSuperior`: el encabezado de cada página (antetítulo con la sección de la ruta, título en serif, subtítulo, búsqueda y acción principal) y, por debajo de lg, la fila fija con el botón del menú |
| `contenido-del-panel.tsx` | El `<main>` de cada vista: deja el lugar de la barra y pone el `halo-<módulo>` de la ruta, así cada página y sus modales enfocan con su pastel sin hacer nada |
| `marco-de-modal.tsx` | `MarcoDeModal`: velo navy, tarjeta blanca de radio 32, título en serif y la X. Se anuncia como diálogo, atrapa el foco, se cierra con Escape y devuelve el foco a lo que lo abrió, también si adentro un campo lleva `autoFocus`. Además de `titulo` y `alCerrar`: `descripcion`, `bloqueado` (mientras guarda no se cierra), `antetitulo` (el módulo o el paso) y `ancho` (`md` 448px por defecto, `lg` 672, `xl` 896) |
| `aviso.tsx` | `Aviso`: un mensaje que no es de un campo, con ícono y fondo según el tono: `error` (por defecto, rojo, se anuncia con `role="alert"`), `info` (gris), `atencion` (naranja suave: lo que se ve está incompleto) y `listo` (lima suave: algo salió bien). Fuera del error no se anuncia salvo que se pida `rol="status"` o `rol="alert"`. `titulo` pone una primera línea en negrita, y `accion`, un botón como "Reintentar" a la derecha o debajo |
| `estado-vacio.tsx` | `EstadoVacio`: el lugar de una lista que todavía no tiene nada, con borde punteado para que no se lea como una tarjeta más |
| `encabezado-de-tarjeta.tsx` | `EncabezadoDeTarjeta`: la cabecera de una tarjeta, con el ícono en su cuadro, el título en serif, una bajada y una acción a la derecha que baja de renglón si no entra |
| `tarjeta-cita.tsx`, `avatar-usuario.tsx` | `TarjetaCita` (compacta en las listas, o completa; con `onClick` es un botón) y `AvatarUsuario` (la foto o las iniciales navy sobre un pastel fuerte; es decorativo, va siempre junto al nombre) |
| `odontograma/` | El odontograma de la ficha clínica, en arcada (abajo, en "Lo que suma la clínica dental") |
| `estilos.ts` | Las clases que no son un componente: `CAMPO` (el aspecto de `CampoFormulario` en 44px de alto en vez de 48: lo mínimo para un dedo), `CAMPO_CON_ERROR`, `ETIQUETA`, `ERROR_DE_CAMPO`, `ANILLO_DE_FOCO`, `TARJETA_DEL_PANEL` (blanca, radio 32 y sombra sm, para lo que no es `Tarjeta`) y `TITULO_DE_TARJETA` (la serif a 24px del `<h2>` de una tarjeta) |

**El estado de una cita** se ve igual en todo el panel, siempre en palabras
y nunca sólo por el color: gris la pendiente, azul la confirmada, el naranja
del tablero la que se está atendiendo, el lima de lo cobrado la completada y
el rojo de error la cancelada. Lo usan `TarjetaCita` y la agenda
(`app/dashboard/agenda/_componentes/estados-de-cita.ts`, para la insignia del
detalle y el bloque de la semana).

#### Lo que suma la clínica dental

Sólo en el rubro `odontologia` (qué se ve lo decide `lib/permisos.ts`); en
los otros rubros el panel queda igual que antes. Tres reglas valen para todo
lo que sigue:

- **Las palabras son del rubro.** "Cliente", "profesional" y "tablero" no se
  escriben fijos en una pantalla del panel: salen de
  `vocabularioDe(useRubroDelPanel())`, en minúscula, con `conMayuscula` para
  empezar una frase. Los nombres de
  `lib/modulos.ts` no cambian, porque la landing los lee y habla de todos los
  rubros; la barra y el antetítulo los cambian al mostrarlos
  (`seccionConNombreDelRubro`). El color y el ícono de cada módulo siguen
  iguales: Pacientes en lila, Sala de espera en naranja.
- **Los colores son los de siempre.** Lo que se está atendiendo, en el
  naranja del tablero; lo libre, en gris (`superficie`); las alergias, en el
  naranja de atención y siempre con su título o su ícono, no sólo por el
  color (en la cita y en Pacientes, un `Aviso` de tono `atencion`; en la
  ficha, la primera tarjeta del resumen). La excepción es el odontograma
  (abajo).
- **La tarjeta del paciente es un enlace por debajo de lg.**
  En una clínica, la tarjeta de Pacientes
  (`app/dashboard/clientes/_componentes/tarjeta-cliente.tsx`) lleva a la
  ficha clínica por debajo de lg, donde no está la ficha de al lado
  (`lg:hidden`); desde lg sigue siendo el botón que abre la de al lado, que
  tiene "Abrir ficha clínica" (`hidden lg:block`). Se dibujan las dos y el
  CSS muestra una: el HTML del servidor ya es el correcto, sin esperar a
  medir la ventana.

**La grilla del día** (`app/dashboard/agenda/_grilla-del-dia.ts` hace las
cuentas, puras y con test; `_componentes/grilla-del-dia.tsx` dibuja). Es la
vista Día de la clínica:

- filas de 15 minutos de **32 px** (`ALTO_DE_FILA`), con la hora cada media
  hora; la línea de la media hora, más marcada que la del cuarto;
- una columna por sillón o por odontólogo, de 148 px como mínimo, y la de las
  horas, de 56. La grilla se desplaza dentro de su caja, a lo alto y a lo
  ancho, nunca la página; la fila de los nombres y la columna de las horas
  quedan fijas (`sticky`);
- **"Ver por"** son dos botones con `aria-pressed` en una píldora
  `superficie`, el elegido en navy (36 px a la vista, 44 con el `::after`);
- cada cita es un botón que empieza en su hora y mide lo que dura, menos 4 px
  de separación, y nunca menos de 28 (una de 5 minutos se lee y se toca). Las
  que se pisan van lado a lado (`_disposicion.ts`, como en la Semana). Fondo
  y barra izquierda, los del estado (`estados-de-cita.ts`); la cancelada,
  además, tachada. Adentro: el rango, el paciente y **el estado en palabras
  antes del motivo**, para que en una columna angosta lo que se corte sea el
  motivo; si no hay alto para tres renglones, uno con la hora y el paciente.
  El nombre accesible (y el `title`) lo dice todo, con el sillón o el
  odontólogo de la otra vista y "primera vez". La elegida lleva un borde navy
  por dentro; la que no tiene odontólogo, un contorno punteado naranja;
- **la línea de ahora**: navy, de 2 px, sobre todas las columnas, con la hora
  en una píldora navy fija a la izquierda. Hoy la grilla se abre un poco más
  de una hora antes de esa línea, y después queda donde la deje quien mira;
- **los bloqueos van dos veces**: una lista de botones encima de la grilla (a
  quién bloquean, el motivo y las horas; abren su detalle) y, en la grilla,
  una franja rayada de `superficie` y `borde` detrás de las citas, que no se
  toca ni se anuncia: ya lo dice la lista.

**Asignar sillón** (`app/dashboard/agenda/_componentes/asignar-sillon.tsx`):
el selector (los sillones activos, el actual aunque esté desactivado y "Sin
sillón") y un botón "Asignar" aparte. Guarda el botón, no el cambio del
selector: con el teclado, recorrer las opciones no guarda nada. Un sillón
ocupado se dice en un `Aviso` con el título "Sillón ocupado" y el mensaje del
servidor, sin "guardar igual"; lo guardado, en un `Aviso` `listo` ("Quedó en
Sillón 2."). Lo usan el panel de la cita y la sala de espera del inicio.

**Sillones ahora** (`app/dashboard/_componentes/inicio-de-la-clinica.tsx`):
una tarjeta por sillón, de radio 24, en el **naranja suave** del tablero si
está atendiendo y en **gris** (`superficie`) si está libre; una por fila en
el teléfono y dos desde sm. El estado va siempre en palabras, en una
insignia blanca ("Atendiendo", "Libre" o, para el odontólogo, "Sin citas
tuyas ahora"), y el titular dice a quién se atiende o hasta cuándo está
libre. Mientras carga, cuatro tarjetas grises con esqueletos, del mismo alto:
nada salta cuando llegan.

**El odontograma** (`components/panel/odontograma/`):

| Archivo | Qué es |
|---|---|
| `odontograma.tsx` | `Odontograma`: la barra de herramientas, la dentición (permanente o temporal), la arcada, el panel de la pieza elegida con sus caras, el resumen con los hallazgos por pieza y la leyenda. Controlado: las marcas entran y cada toque devuelve la lista nueva con `alCambiar`; sin `alCambiar` sólo se mira. Cada cambio se anuncia ("Pieza 16: …") en un `role="status"` |
| `arcada.tsx` | `Arcada`: el SVG de las dos arcadas. Cada pieza es **un** botón, con nombre accesible completo ("Pieza 16, primer molar superior derecho: caries oclusal"). Tab entra a la pieza elegida (una sola parada para toda la arcada); las flechas recorren las piezas (de lado por la fila, arriba y abajo a la otra arcada) e Inicio y Fin van a las puntas; Enter o Espacio tocan el número, y la letra de una cara (V, M, D, O, I, P, L) toca esa cara. Se achica con su caja hasta una escala mínima, con los números siempre a 12 px; más angosta, se desplaza de lado dentro de su caja, empezando por el centro |
| `geometria.ts` | Dónde va cada pieza, en unidades de un dibujo de 620 × 700: las dos arcadas en U vistas de frente, con la derecha del paciente a la izquierda de quien mira (cuadrantes 1 y 4, o 5 y 8). Cada pieza es un cuadrado girado: su lado de afuera es la cara vestibular, el de adentro la palatina o lingual, el centro la oclusal o incisal y los costados mesial y distal; los molares, más grandes que los incisivos. Qué cara es cada lado lo dice `lib/odontograma.ts`; acá sólo se ubica. Puro, con test |
| `marcas.ts` | Lo que hace cada toque, puro y con test: una cara lleva una sola marca (tocarla con la misma herramienta la saca, con otra la cambia), las marcas de pieza se ponen y se sacan, y "Borrar" en el número limpia la pieza entera |
| `colores.ts` | Los colores clínicos, con el contraste de cada uno anotado (abajo) |
| `muestra.tsx` | `MuestraDeMarca`: cada marca en chico, igual que en el dibujo, para la barra, la leyenda y los botones de cara. Decorativa: va siempre junto al nombre de la marca |

**Los colores del odontograma no son tokens.** Son los del dibujo clínico de
siempre: rojo lo que hay que tratar (caries y la X de la extracción
indicada), azul lo ya tratado (obturación), verde azulado el sellante, ámbar
el contorno de la corona, morado el triángulo de la endodoncia y gris la X de
la pieza ausente. Viven en `colores.ts` y se aplican con `style` en el SVG,
no en `app/globals.css`: sólo los usa esta pantalla y no son pasteles de
módulo. **Todos pasan 3:1** contra el blanco de la pieza y contra crema
(WCAG 1.4.11, objetos gráficos), cada uno con su contraste en un comentario;
el sellante y la corona del diseño no llegaban sobre `superficie` y se
oscurecieron. **Nunca son la única pista:** cada marca se nombra en el nombre
accesible de la pieza, en "Pieza seleccionada" y en los hallazgos, y la
leyenda las dice en palabras. El sellante, además, va **rayado** (en el SVG y
en `RAYAS_DE_SELLANTE` para las muestras): contra la caries no se distingue
sólo por el tono para quien no ve el rojo. Un color clínico nuevo va en
`colores.ts`, con su contraste anotado, no como token.

**Las pestañas de la ficha**
(`app/dashboard/clientes/[id]/_componentes/pestanas.tsx`): el patrón de
pestañas de ARIA, como el selector de vista de Reportes. Tab entra sólo a la
elegida; las flechas pasan de una a otra, e Inicio y Fin van a las puntas. La
elegida va en el lila de Clientes **y en negrita**, no sólo por el color. Cada
una mide 40 px y el `::after` la lleva a 44; en el teléfono la fila se
desplaza de lado dentro de su píldora. Los paneles no se desmontan al cambiar
de pestaña (un odontograma marcado y sin guardar sigue ahí al volver), y las
pestañas que no son para quien mira no aparecen.

**Cambios sin guardar** (`pestana-odontograma.tsx`). Mientras el odontograma
tiene cambios, una barra **navy** dice "Tienes cambios sin guardar en el
odontograma." con "Descartar cambios" (fantasma, en blanco) y "Guardar
odontograma" (invertido), y lleva `anillo-foco-claro`. Va **pegada abajo**
(`sticky bottom-3`) mientras se ve el odontograma, para que los cambios no se
pierdan de vista; la pega el bloque que la envuelve y no la barra, porque un
`sticky` se mueve sólo dentro de su padre. El navegador pregunta antes de
cerrar o recargar.

**El foco cuando el botón que se usó desaparece.** Al guardar o descartar, la
barra se va con el botón que tenía el foco, y el foco caería al `<body>`. Si
cae ahí, va al bloque que envolvía la barra (`tabIndex={-1}`), que ahora
muestra el resultado y se lee al llegar; si la persona ya lo movió a otra
parte, se respeta. Lo mismo en la sala de espera del inicio: después de
"Asignar sillón", el formulario se va y el foco pasa a "Pasar al sillón", que
aparece en su lugar. Todo lo que hace desaparecer el botón que se apretó
dice adónde va el foco.

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
| `marquesina.tsx` | `Marquesina`: una fila de palabras que se desplaza sin fin. Se detiene con el cursor encima, fuera de pantalla y con su botón de pausa. Con movimiento reducido, quieta y en varias filas | `palabras`, `etiqueta`, `sentido?` (`izquierda` o `derecha`), `pausada?` (la pausa la lleva quien la usa: sin botón propio), `ficha?` (cómo se dibuja cada palabra; por defecto, `ChipDePalabra`), `sinEscala?` |
| `pila-de-tarjetas.tsx` | `PilaDeTarjetas`: tarjetas que quedan fijas una debajo de otra, cada una un paso más abajo (debajo del encabezado si está flotante); mientras la siguiente pasa encima, la de abajo se achica levemente, sube 8px y se vela con navy. Una tarjeta más alta que la ventana queda fija recién cuando se ve su final. Con movimiento reducido y en ventanas de menos de 640px de alto, tarjetas apiladas comunes | `tarjetas` (`id`, `contenido`: la tarjeta entera, con `rounded-tarjeta`) |
| `grilla-de-iconos.tsx` | `GrillaDeIconos`: tiles grises unidos por puentes cóncavos | `tiles` (`id`, `titulo`, `icono`) |
| `boton-de-pausa.tsx` | `BotonDePausa`: el botón de dos estados (`aria-pressed`) que detiene lo que se mueve solo en un bloque. Quien lo usa guarda el estado, pone `animaciones-en-pausa` en el bloque y frena lo que mueva con JavaScript | `pausado`, `alCambiar`, `etiqueta?` |
| `usar-bloque-en-movimiento.ts` | `useBloqueEnMovimiento()`: el estado de un bloque que se mueve solo sin fin. `ref` va en el bloque; `quieto` (en pausa o fuera de la pantalla) dice cuándo poner `animaciones-en-pausa` y `enPausa` de `TrazosOndulantes`; `pausado` y `setPausado` son los del `BotonDePausa` | — |
| `trazos-ondulantes.tsx` | `TrazosOndulantes`: líneas de SVG que pasan de una forma a otra sin fin (un `<g>` dentro del `<svg>` de quien lo usa). Con framer-motion y no con `<animate>`, que no respeta "reducir movimiento"; con movimiento reducido quedan en la primera forma | `trazos` (constante del módulo: `formas`, `duracion`, `desfase?`, `color`, `opacidad?`, `grosor?`), `enPausa` |
| `usar-direccion-de-scroll.ts` | `useDireccionDeScroll()`: el estado del encabezado (`arriba`, `oculto` o `flotante`); la regla está en `lib/direccion-de-scroll.ts` | — |
| `usar-coincide-media.ts` | `useCoincideMedia(consulta, enServidor?)`: si la ventana cumple una media query. Mientras hidrata vale lo mismo que el HTML del servidor; es para cuando la consulta decide el marcado (para elegir sólo una curva alcanza `useReducedMotion`) | — |

**Sin uso en la landing nueva** (no se borraron): `EscenarioConScroll`,
`ListaFija`, `TarjetasExpandibles`, `CarruselDeHistorias`, `PilaDeTarjetas` y
`GrillaDeIconos`. Las secciones que los usaban se rehicieron con el diseño
nuevo, que no tiene scroll fijo ni pilas.

Un ejemplo, un bloque que se mueve solo (`components/landing/seccion-tablero.tsx`):

```tsx
const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()

<SeccionDeLanding id="tablero" etiquetadaPor="tablero-titulo" tono="frambuesa">
  <div ref={ref} className={cn(quieto && "animaciones-en-pausa")}>
    <svg aria-hidden="true" viewBox="0 0 700 170" width="700" height="170">
      <TrazosOndulantes trazos={TRAZOS_DEL_TABLERO} enPausa={quieto} />
    </svg>
    {/* …lo que flota, con animate-flotar */}
    <div className="flex justify-end motion-reduce:hidden">
      <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar la animación del tablero" />
    </div>
  </div>
</SeccionDeLanding>
```

### Las secciones de la landing nueva

Cada una en su archivo de `components/landing/`, en el orden del diseño:

| Sección | Qué tiene | Lo que se mueve solo |
|---|---|---|
| `seccion-recorrido.tsx` | Acordeón de cuatro pasos (botones con `aria-expanded` y `aria-controls`; el panel cerrado es `inert`) y, al lado, el escenario del tinte del paso con su número gigante, la maqueta, dos etiquetas y las líneas. "Crear mi cuenta" y "Ver planes" (`#planes`) | Avanza un paso cada 6,5 s (lo mide `animate-progreso`). Se detiene con el cursor encima, con el foco del teclado adentro, fuera de pantalla y con la pausa. Con movimiento reducido no avanza |
| `seccion-un-dia.tsx` | Cuatro tarjetas sobre una línea de tiempo; desde lg en fila, con la línea de centro a centro y las líneas que llegan a su comienzo; por debajo, de arriba abajo | Los números laten, el punto recorre la línea, las maquetas flotan |
| `seccion-tablero.tsx` | La caja pistacho con "Reservas de hoy" y "Quién puede cobrar", y la lista de cuatro puntos | Las filas entran (`aparecer`), la maqueta y la etiqueta flotan |
| `seccion-reportes.tsx` | Cuatro tarjetas de tinte en dos filas (746 y 526, la segunda al revés: una grilla de tres columnas) | Las barras crecen, las maquetas flotan |
| `seccion-oficios.tsx` | "Si trabajas solo / Si tienes equipo" (`aria-pressed`) cambia la historia y la maqueta; los otros oficios en etiquetas con su foto; la caja ciruela con una foto por oficio | Cambia sola cada 5,5 s (se detiene como el recorrido); las fotos y la maqueta flotan |
| `seccion-funciones.tsx` | Las diez piezas: desde lg, dos filas unidas por un camino en S medido sobre las piezas (entra y sale por los bordes de la pantalla); por debajo, una columna con una línea | El punto recorre el camino (`recorrer-camino`), las piezas flotan |
| `seccion-precios.tsx` | El titular con tres píldoras, lo incluido en los dos planes, Independiente y Equipo lado a lado (la que da la calculadora, con un borde de su color) y la calculadora (1 a 30 personas) | Las líneas del titular y las de lo incluido, cada una con su pausa |
| `seccion-cierre.tsx` | El bloque navy, "Deja de complicarte. Pásate a Eli." y dos marquesinas en sentidos opuestos (la segunda es decorativa y con movimiento reducido no está) | Las marquesinas y las líneas, con una sola pausa |

**Fotos de los oficios.** No vienen con el diseño: mientras falten, un
reemplazo de color con el ícono del oficio (nunca un `<img>` roto). Se
esperan en `public/landing/oficios/` (JPG verticales de 3:4, unos 600×800 px):
`peluqueria.jpg`, `barberia.jpg`, `unas.jpg` y `odontologia.jpg`. Al subir
una, se escribe su nombre en `archivo` (`FOTOS` en `seccion-oficios.tsx`); la
misma foto va grande en la caja y chica en la etiqueta del oficio. Las de
Áreas están en `seccion-areas.tsx`.

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
  justo: no le bajes la opacidad). Sobre los tintes de la landing, navy al
  75%. Sobre navy, blanco al 70% o más;
- objetivos táctiles de 44px como mínimo (el botón sm y el `BotonIcono` sm los
  estiran con `::after`);
- teclado completo, con `aria-expanded`, `aria-selected` y `aria-pressed`
  donde corresponda;
- lo que se mueve solo más de 5 segundos se puede detener (WCAG 2.2.2): el
  enredo de la portada, las áreas y cada sección del medio de la landing que
  se mueve sola tienen su botón de pausa (abajo a la derecha del bloque);
  fuera de la pantalla se detienen solas. Lo que avanza solo (el recorrido,
  solo / con equipo) también se detiene con el cursor encima y con el foco del
  teclado adentro;
- movimiento reducido, como dice arriba.

## Lo que una pantalla no puede mostrar

Las maquetas del producto se arman con HTML real animado, nunca con imágenes,
y muestran sólo lo que Eli hace (`docs/PRODUCTO.md`). Datos de ejemplo sí, con
nombres comunes y montos de ejemplo en pesos.

**No se dibuja, porque el producto no lo hace:** pagos en línea del cliente
final, mensajes automáticos por WhatsApp u otras integraciones (sí se agrega
la reserva al calendario, con .ics o a Google Calendar), inventario de
productos, app nativa y, en la clínica dental, el envío del presupuesto al
paciente ("Presentar" sólo registra que se le mostró), el PDF del plan, los
abonos o pagos del plan y las radiografías o documentos.

**Tampoco:** testimonios, nombres de negocios reales, logos de clientes, cifras
de marketing ("+500 salones").

**Sí se dibuja, porque ya existe** (`docs/PRODUCTO.md`): elegir profesional
al reservar, o "cualquiera disponible"; los bloqueos de horario de la agenda;
la ocupación por profesional (Reportes › Llenar horas), y la comisión de
cada línea, que se calcula y se congela **al cobrar**. Una línea sin % queda
pendiente: nunca se dibuja una comisión en $0 ni una que se calcula antes de
cobrar.

Los precios de los planes sí se muestran, siempre leídos de `lib/precios.ts`,
nunca escritos a mano en la pantalla.

Una pantalla que promete algo que al hacer clic no pasa es el mismo problema
que los datos inventados.
