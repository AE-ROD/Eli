# Diseño de la landing

`mockup-landing.html` es el diseño vigente de la página de inicio. Se abre con
doble clic: **no necesita servidor ni conexión**, porque las fuentes y las
librerías van incrustadas en el archivo. Se incrustaron porque el contenedor
donde se hizo no alcanza los CDN ni Google Fonts; en el código real se sirven
como corresponde.

> ⚠️ El texto del mockup se escribió cuando Eli no nombraba rubros. Desde el
> reenfoque en salones de belleza, barberías y spas de uñas
> (`docs/PRODUCTO.md` §1), hay que reescribir el texto para esos tres nichos
> antes de llevarlo al código. La estructura visual y las decisiones de abajo
> siguen valiendo.

### Cómo se llegó a este diseño

Antes hubo seis exploraciones; cada una fue una decisión, no una variante
suelta. Se sacaron del repositorio para no tener archivos muertos, pero siguen
en el historial: `git show 06aed7a --stat` las lista y
`git checkout 06aed7a -- diseno/` las trae de vuelta.

| Exploración | Qué probaba | Resultado |
|---|---|---|
| `g1-el-dia` | La página como una jornada: un riel de horas del que cuelga cada sección | La estructura explica el producto sin leer |
| `g2-el-documento` | La página como un paper: notas al margen, secciones `§`, tabla con epígrafe | La más difícil de confundir con otra cosa |
| `g3-el-mostrador` | Grilla asimétrica, titular sangrado fuera del margen | La más linda y la más fácil de copiar |
| `h1-dia-centrado` | `g1` centrada y con el texto justificado | Pedido del dueño del producto |
| `i-compacta` | Tres pantallas en vez de cinco secciones | 2.562 px contra 3.756 |
| `j-brief` | El brief de diseño completo: héroe de tres columnas, bento, avatares de iniciales | 4.668 px — demasiado scroll |
| `k-mockup` → **`mockup-landing.html`** | **El vigente.** `j` comprimido, con GSAP, ScrollTrigger y Lenis | 3.304 px |

## Decisiones que ya están tomadas

**Tipografía.** DM Serif Display en titulares, Charter (o Charis SIL, su versión
libre) en texto corrido, Plus Jakarta Sans en datos y controles. Charter es la
familia que usan los journals; DM Serif Display es de display y en párrafos
largos cansa, por eso no se usa para leer.

> No existe ninguna tipografía comprobada científicamente como más legible. Los
> estudios que se citan para eso comparan tamaños distintos o miden preferencia,
> que no es comprensión.

**Color.** Terracota `#8c3a27`, con `#a8503a` para lo que se toca y `#5e2419`
para los fondos hondos. Papel `#f8f5f0`, cálido, nunca blanco puro. Encima de
todo hay una capa de grano: un rojo perfectamente liso se ve digital por más
que se le baje la saturación.

**Profundidad.** Una sola escala de sombra para todo — reposo y elevado, mismo
tinte y mismo salto. Verificado midiendo el CSS renderizado: 21 superficies, una
sombra. Los botones suman un **canto**, que es la cara de abajo del objeto: es
sólido, no difuso, y se comprime al apretar.

**Movimiento.** Todo respeta `prefers-reduced-motion`. Una landing que marea a
quien tiene vértigo no es fluida, es hostil.

## Lo que falta decidir

**Los precios.** Los tres `$—` son literales y están a propósito: individual,
equipo hasta 5 personas con el administrador incluido, y el monto por persona
extra. Nadie los definió todavía y no se inventan.

**Las librerías.** `mockup-landing.html` usa GSAP 3.12.5 con ScrollTrigger y Lenis
1.1.18, bajadas a una carpeta aparte: **no están en el `package.json`**. Lenis es
MIT. GSAP no: usa su licencia estándar sin cargo, que alcanza para un SaaS pero
conviene leer antes de publicar. Las mismas animaciones se pueden hacer con la
API nativa de scroll del navegador, perdiendo algo de compatibilidad con Safari.

## Lo que el diseño NO muestra, porque el producto no lo hace

Se verificó contra el código, no contra el brief:

- **Elegir profesional al reservar.** El flujo público tiene tres pasos
  (servicio → fecha y hora → datos). `confirmar` no acepta `memberId` y
  `disponibilidad` no la calcula por persona.
- **Porcentaje de ocupación.** No hay ningún cálculo.
- **Ingresos estimados.** Lo que existe son ingresos reales, contados al
  completar la cita.
- **Bloquear horario** y **ver reportes.** No existen.
- **Servicio asignado a un profesional.** `Service` no se relaciona con
  `BusinessMember`.

Ninguna de estas aparece dibujada. Una pantalla que promete algo que al hacer
clic no pasa es el mismo problema que los datos inventados que ya se sacaron.
