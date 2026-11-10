# Blast Island — videojuego 2.5D multijugador local

Videojuego web de combate en arena con bombas, inspirado en el género de juegos de fiesta y con identidad visual propia. La modalidad aprobada es **exclusivamente multijugador local para un máximo de cuatro personas en una misma computadora y pantalla**.

## Modalidad y controles

- Jugador 1: teclado de la computadora.
- Jugadores 2, 3 y 4: un mando por jugador, conectado por USB o Bluetooth.
- No hay salas online, códigos de invitación, sincronización por internet ni servidor remoto de partidas.
- No se necesita internet para jugar una vez instaladas las dependencias (la fuente tipográfica remota es decorativa; se usan fuentes del sistema como alternativa).

### Teclado — Jugador 1

| Acción | Tecla |
|---|---|
| Movimiento | W, A, S, D o flechas |
| Saltar | Espacio |
| Recoger bomba | E |
| Lanzar bomba | Q |

### Mandos — Jugadores 2 a 4

Se utiliza el mapeo estándar de Gamepad API:

| Acción | Mando |
|---|---|
| Movimiento | Stick izquierdo o cruceta |
| Saltar | A / cruz inferior |
| Recoger bomba | X / cuadrado |
| Lanzar bomba | B / círculo |

La compatibilidad concreta depende de cómo el sistema operativo y el navegador expongan el mando. En algunos mandos genéricos puede ser necesario ajustar el mapeo.

## Requisitos

- Node.js 20 o superior.
- npm.
- Navegador moderno compatible con Gamepad API (Chrome, Edge o Firefox actualizado recomendado).
- Hasta tres mandos USB o Bluetooth adicionales.

## Ejecución local

1. Abre la carpeta `client/` en Visual Studio Code.
2. Abre una terminal dentro de `client/`.
3. Instala dependencias y ejecuta Vite:

```bash
npm install
npm run dev
```

4. Abre la dirección local que indique Vite, normalmente `http://localhost:5173`.
5. Pulsa **Configurar jugadores**. El jugador 1 queda asignado al teclado.
6. Conecta cada mando y presiona cualquier botón para agregarlo como jugador 2, 3 o 4.
7. Selecciona el modo y pulsa **Comenzar partida**.

> Para detectar un mando, el navegador puede requerir que el usuario interactúe primero con la página. Entra al menú de configuración y pulsa un botón del mando.

## Arquitectura actualizada

- HTML5 y CSS3: menú, lobby, HUD y presentación adaptable.
- JavaScript: reglas, gestión de jugadores locales y lectura de controles.
- Phaser 3: escenas, renderizado, personajes, bombas, explosiones y cámara.
- Browser Gamepad API: detección y lectura de hasta tres mandos adicionales.
- Vite: servidor de desarrollo y empaquetado del frontend.

**Eliminado del flujo de juego:** Node.js como backend de partidas, Socket.IO, salas por código, conexión de clientes remotos y alojamiento Render. Supabase no es necesario para jugar localmente; la persistencia de perfiles/estadísticas queda como ampliación opcional y no forma parte de la partida local actual.

## Datos locales, ranking y audio

- Las partidas terminadas de dos o más jugadores se guardan en `localStorage` del navegador: perfiles por nombre, partidas jugadas y victorias.
- El botón **Ver ranking local** muestra los datos almacenados. Estos pertenecen al navegador y dispositivo actual; al borrar los datos del sitio se eliminan.
- Antes de comenzar se puede elegir entre tres arenas. Cada una cambia su apariencia y disposición de bombas.
- El juego incluye efectos generados por el navegador para menú, unión de mando, bombas, eliminaciones y victoria.
- Para añadir música, copia los audios en `client/public/audio/` y registra la lista de archivos en `client/src/data/arenas.js`. La siguiente pista comenzará automáticamente al terminar la anterior.

La aplicación sigue siendo estática: `client/netlify.toml` ya contiene la configuración de compilación para Netlify. No requiere variables de entorno ni una base de datos remota.

## Construcción

Desde `client/`:

```bash
npm run build
npm run preview
```

El resultado de producción se genera en `client/dist/`. Puede publicarse como sitio estático si se desea compartir el juego para que otras personas lo descarguen o ejecuten en su propia computadora; eso no convierte la modalidad en multijugador online.

## Alcance y estado

Esta versión actualiza el flujo de entrada para teclado + hasta tres mandos, genera jugadores locales en una misma escena y procesa entradas por jugador. La prueba física con mandos reales depende de disponer de los dispositivos y del navegador del usuario. Los modos de juego, balance, colisiones avanzadas, animaciones finales y pruebas extensas siguen requiriendo validación y desarrollo.
