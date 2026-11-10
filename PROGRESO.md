# Progreso del proyecto — Blast Island

**Modalidad aprobada:** exclusivamente multijugador local (misma computadora y pantalla).
**Máximo:** 4 jugadores (1 teclado + hasta 3 mandos).
**Fase actual:** actualización de arquitectura y controles locales.

| Fase | Estado | Evidencia / alcance |
|---|---|---|
| 1. Estructura y menú | Implementado | Menú local, configuración de jugadores y lobby para 1–4 participantes. |
| 2. Mapa y físicas | Implementación inicial | Arena 2.5D, movimiento, salto, límites y profundidad visual. Falta prueba de jugabilidad completa. |
| 3. Bombas y combate | Implementación inicial | Bombas recogibles, lanzamiento, temporizador, explosión, empuje y eliminación básica. Falta balance y pruebas de colisión. |
| 4. Multijugador local | Implementación inicial | Jugador 1 con teclado y jugadores 2–4 con Gamepad API; entradas independientes en una misma escena. Pendiente validar con mandos físicos variados. |
| 5. Modos | En desarrollo | Selector FFA, equipos y supervivencia. Las reglas completas y condiciones de victoria aún deben desarrollarse y probarse. |
| 6. Perfiles y persistencia | Opcional / pendiente | Supabase no es necesario para jugar localmente. Se puede reincorporar únicamente para guardar perfiles y estadísticas si se solicita. |
| 7. Publicación | Pendiente | El frontend se puede publicar como sitio estático. No existe servidor remoto de partidas. |

## Cambios de arquitectura realizados

- Eliminada la dependencia de Socket.IO en el frontend.
- Eliminada la dependencia del cliente Supabase en el flujo de juego.
- Eliminado el servidor Node.js de salas y su configuración Render.
- Eliminadas las acciones de crear/unirse a sala y códigos de invitación.
- Incorporado el lobby local con teclado fijo para P1 y detección de mandos para P2–P4.
- Incorporada lectura de ejes, cruceta y botones estándar de Gamepad API.
- Actualizada la documentación y los controles.

## Pruebas pendientes

- `npm install` y `npm run build` en entorno limpio.
- Prueba con teclado únicamente.
- Prueba con un mando Xbox/compatible.
- Prueba con mando PlayStation/compatible.
- Prueba simultánea de teclado + tres mandos.
- Desconexión/reconexión de mandos durante lobby y partida.
- Verificar mapeos de mandos genéricos y ajustes de deadzone.
- Verificar reglas de los tres modos de juego.

No se declara la compatibilidad con todos los mandos ni la experiencia completa como verificada hasta ejecutar las pruebas físicas correspondientes.
