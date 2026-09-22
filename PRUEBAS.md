# Registro de pruebas

Fecha: 22 de septiembre de 2026.

## Verificaciones automáticas

Comando: `node tests/verify.cjs`. Resultado: **98 verificaciones aprobadas**.

Se ejecuta el JavaScript real dentro de un contexto Node con DOM, almacenamiento y red simulados. No hay dependencias de pruebas ni código de pruebas cargado desde el juego.

- Semillas repetibles y distintas entre reinicios; ocho brechas válidas y tiempos ordenados.
- Diez oleadas de 10 a 46 enemigos, tres tipos garantizados y variación ±12%.
- Movimiento por eventos de teclado y normalización diagonal.
- Colisión del jugador, enemigos y balas contra los cuartos y pasillos del mapa.
- Recorrido de troyanos grandes desde las ocho entradas hasta el núcleo sin atascarse.
- Cámara con seguimiento, coordenadas de apuntado y minimapa.
- Pausa que congela la simulación.
- Compra única por 60 créditos; puntos de récord intactos y cadencia ×1.5.
- Protección permanente y recuperación de integridad dentro de la zona segura; disparo bloqueado dentro de ella.
- Colisión continua de balas, bajas, puntos, partículas y textos.
- Transiciones de las diez oleadas, victoria y derrota por vida cero.
- Reinicio sin navegación, limpieza de estado y nueva semilla.
- Un registro por partida, Top 5 ordenado y nombres insertados como texto.
- `localStorage` bloqueado, JSON corrupto, error de red, HTTP 403 y respuesta inválida.
- Contrato GET/POST remoto con respuestas simuladas y claves publishable.
- Timeout real de cuatro segundos y recuperación local.

Prueba adicional: `node tests/balance.cjs`. Un jugador automático recorre el cuarto central, apunta al enemigo más cercano mediante los controles normales y se repliega a la zona segura cuando necesita recuperar integridad. Con las semillas 42, 12345 y 2026 eliminó los **280 enemigos**, terminó la décima oleada con 74, 74 y 98 de integridad y tardó entre 409 y 419 segundos. Esto comprueba que se puede ganar con la velocidad nueva sin modificar las reglas; no reemplaza las pruebas de dificultad con personas.

## Revisión en navegador

Revisión realizada en el navegador integrado usando HTTP local: carga inicial, formulario, transición, HUD, partida, puntos por eliminación, pausa, derrota, Top 5 local y Reintentar con nueva semilla, 100 de integridad y cero puntos. La consola no registró errores JavaScript. Se inspeccionaron la vista amplia y una vista estrecha de aproximadamente 600 px, sin desbordamiento horizontal. Se corrigió un salto de desplazamiento al ocultar el formulario inicial para mantener visible el HUD.

El navegador de pruebas bloqueó la navegación `file://` por su política de seguridad. Por ello, la apertura directa está preparada mediante rutas relativas y scripts clásicos, pero debe comprobarse manualmente abriendo `index.html`. No se intentó eludir ese bloqueo.

Las pruebas de Supabase usan respuestas simuladas: no se ha probado una cuenta real porque la configuración se entrega vacía.

## Publicación verificada

GitHub Pages activado desde `main` y `/(root)`. URL pública: https://gabarimba.github.io/Proyecto-videojuego/. El 22 de septiembre de 2026 se comprobó que carga la pantalla inicial y que el formulario inicia una partida con HUD, semilla y transición, sin errores de JavaScript. Los cinco archivos del juego son los mismos de la versión local.

## Decisiones y correcciones

- Los puntos del ranking se separaron de los créditos para que comprar no penalice el récord.
- La zona bloquea amenazas y daño, recupera integridad y desactiva el disparo para obligar al jugador a salir y combatir.
- El mapa usa rectángulos conectados para que las colisiones y la búsqueda de rutas puedan explicarse con facilidad.
- Los enemigos consultan un campo de distancias calculado desde el jugador para recorrer pasillos sin atravesar paredes.
- Se garantizan los tres tipos al principio de cada oleada; una selección completamente aleatoria podía omitir un tipo.
- Se usa colisión por segmento para evitar que las balas atraviesen enemigos entre fotogramas.
- Se separa el azar visual del generador de oleadas para preservar la reproducción por semilla.
- El tamaño visible del Canvas conserva su proporción para mantener preciso el apuntado.
- Un identificador de partida evita que respuestas tardías del ranking modifiquen una partida nueva.
- El estado pasa a `fin` antes de guardar para impedir envíos duplicados en el bucle.
