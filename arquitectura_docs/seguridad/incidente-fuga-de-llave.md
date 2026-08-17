# Incidente: filtración de una llave o credencial

Aplica si una llave llegó a un repositorio, a un bundle, a un log, a un ticket, a
una captura de pantalla o a un chat.

## Primeros 15 minutos

1. **Rota la llave ya.** No investigues primero. Rotar es reversible; una llave
   filtrada activa, no.
2. **Revoca la vieja**, no basta con crear una nueva.
3. **Avisa al socio.** Nadie maneja esto solo.

Nota: borrar el commit **no sirve**. Si estuvo en un repositorio remoto, asume que
fue clonado e indexado. La única respuesta válida es la rotación.

## Siguientes 2 horas

4. **Determina el alcance.** Qué permitía esa llave: ¿leer? ¿escribir? ¿bypassear
   RLS? ¿gastar dinero?
5. **Revisa los registros de acceso** desde la fecha en que se filtró, no desde
   hoy. Busca consultas masivas, accesos fuera de horario, IPs desconocidas.
6. **Revisa el gasto** si era una llave de un servicio pagado.
7. **Busca otras llaves** en el mismo lugar. Rara vez se filtra una sola.

## Mismo día

8. **Escribe qué pasó** en `decisiones/` o en un registro de incidentes: cómo se
   filtró, qué la detectó, qué la habría evitado.
9. **Si hay indicio de acceso a datos de personas**, es un asunto legal y
   contractual, no solo técnico. Se lo comunicas al cliente el mismo día. En
   Chile aplica la Ley 19.628 y su reforma; el plazo de notificación no se
   negocia con el ánimo de "revisar un poco más".
10. **Cierra el hueco.** Si se filtró por un flujo que se repite, el arreglo es
    ese flujo, no esa llave.

## Lo que no se hace

- Esperar a ver si alguien la usó.
- Rotarla y no avisar.
- Asumir que un repositorio privado es seguro. Los privados se vuelven públicos
  por error todo el tiempo.
