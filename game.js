"use strict";

// Los scripts clásicos con defer funcionan tanto en file:// como en GitHub Pages.
const $ = id => document.getElementById(id);
const canvas = $("game-canvas");
const ctx = canvas.getContext("2d");
const ANCHO = 1000, ALTO = 650;
const ZONA = { x: 438, y: 475, lado: 124 };
const COSTO_MEJORA = 60;
const teclas = new Set();
const mouse = { x: 700, y: 325, disparando: false };
const movimientoReducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
let partida = null;
let estado = "inicio";
let estadoAntesDePausa = "jugando";
let numeroPartida = 0;
let ultimoTiempo = 0;

// El navegador permite audio después de un gesto del usuario (Jugar o Reintentar).
let audio = null;
let sonidoActivo = true;
function activarAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!audio && Audio) audio = new Audio();
    if (audio && audio.state === "suspended") audio.resume().catch(() => {});
  } catch (_) { /* Si no hay audio, se conserva toda la retroalimentación visual. */ }
}

function tono(frecuencia, duracion, volumen, tipo = "sine", retraso = 0, final = frecuencia) {
  if (!audio || !sonidoActivo || audio.state !== "running") return;
  const inicio = audio.currentTime + retraso;
  const oscilador = audio.createOscillator();
  const ganancia = audio.createGain();
  oscilador.type = tipo;
  oscilador.frequency.setValueAtTime(frecuencia, inicio);
  oscilador.frequency.exponentialRampToValueAtTime(final, inicio + duracion);
  ganancia.gain.setValueAtTime(volumen, inicio);
  ganancia.gain.exponentialRampToValueAtTime(.001, inicio + duracion);
  oscilador.connect(ganancia).connect(audio.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracion);
  oscilador.onended = () => { oscilador.disconnect(); ganancia.disconnect(); };
}

function efectoSonoro(tipo) {
  if (tipo === "disparo") tono(620, .07, .025, "square", 0, 190);
  if (tipo === "daño") tono(150, .22, .065, "sawtooth", 0, 45);
  if (tipo === "baja") tono(330, .09, .035, "triangle", 0, 660);
  if (tipo === "mejora") [440, 660, 880].forEach((f, i) => tono(f, .18, .06, "sine", i * .10));
  if (tipo === "victoria") [392, 494, 587, 784].forEach((f, i) => tono(f, .32, .065, "triangle", i * .16));
  if (tipo === "derrota") [220, 165, 82].forEach((f, i) => tono(f, .3, .05, "triangle", i * .2));
}

function limpiarEntrada() { teclas.clear(); mouse.disparando = false; }

function iniciarPartida() {
  const nombre = $("team-name").value.trim();
  if (!nombre) { $("team-name").focus(); return; }
  activarAudio();
  numeroPartida++;
  const semilla = nuevaSemilla();
  partida = {
    nombre, semilla, generador: crearGenerador(semilla),
    // Otro generador separa los efectos decorativos del azar de las oleadas.
    azarVisual: mulberry32(semilla ^ 0xABCDEF),
    jugador: { x: 500, y: 325, radio: 15, vida: 100, vidaMax: 100,
      velocidad: 245, invulnerable: 0, disparoEn: 0, mejorado: false },
    enemigos: [], balas: [], particulas: [], textos: [], plan: [],
    oleada: 0, puntos: 0, creditos: 0, bajas: 0, tiempo: 0, tiempoOleada: 0,
    siguiente: 0, transicion: 0, dentroZona: false, escudo: 0, recargaEscudo: 0
  };
  limpiarEntrada();
  $("lobby").hidden = true;
  $("workspace").classList.add("playing");
  document.body.classList.add("combat-active");
  $("combat-info").hidden = false;
  $("preview-tag").hidden = true;
  $("end-screen").hidden = true;
  $("pause-screen").hidden = true;
  $("pause-button").disabled = false;
  $("pause-button").textContent = "PAUSA Ⅱ";
  $("arena-label").textContent = "SISTEMA BAJO ATAQUE";
  $("seed-label").textContent = `SEMILLA / ${semilla.toString(16).toUpperCase().padStart(8, "0")}`;
  prepararOleada();
  actualizarHUD();
  canvas.focus({ preventScroll: true });
  // Ocultar el formulario cambia el alto de la página; vuelve a mostrar el HUD.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function prepararOleada() {
  partida.oleada++;
  partida.plan = partida.generador.oleada(partida.oleada, ANCHO, ALTO);
  partida.siguiente = 0;
  partida.tiempoOleada = 0;
  partida.transicion = 3;
  partida.balas = [];
  mouse.disparando = false;
  estado = "transicion";
  $("transition").hidden = false;
  $("transition-kicker").textContent = partida.oleada === 1 ? "DESPLEGANDO ANTIVIRUS" : "AMENAZAS NEUTRALIZADAS";
  $("transition-title").textContent = `OLEADA 0${partida.oleada}`;
  $("transition-copy").textContent = `${partida.plan.length} amenazas · ${["Contén la intrusión", "La infección se expande", "Defiende el núcleo"][partida.oleada - 1]}`;
  $("transition-count").textContent = "3";
  actualizarHUD();
}

function pausar() {
  if (estado !== "jugando" && estado !== "transicion") return;
  estadoAntesDePausa = estado;
  estado = "pausa";
  limpiarEntrada();
  $("pause-screen").hidden = false;
  $("pause-button").textContent = "SEGUIR ▷";
  $("resume-button").focus({ preventScroll: true });
}

function continuar() {
  if (estado !== "pausa") return;
  estado = estadoAntesDePausa;
  $("pause-screen").hidden = true;
  $("pause-button").textContent = "PAUSA Ⅱ";
  activarAudio();
  canvas.focus({ preventScroll: true });
}

function emitirTexto(texto, x, y, color) { partida.textos.push({ texto, x, y, color, vida: 1.1 }); }

function explotar(enemigo) {
  for (let i = 0; i < (movimientoReducido ? 3 : 12); i++) {
    const angulo = partida.azarVisual() * Math.PI * 2;
    const velocidad = 35 + partida.azarVisual() * 140;
    partida.particulas.push({ x: enemigo.x, y: enemigo.y, vx: Math.cos(angulo) * velocidad,
      vy: Math.sin(angulo) * velocidad, vida: .5, color: enemigo.color });
  }
}

function disparar() {
  const j = partida.jugador;
  const angulo = Math.atan2(mouse.y - j.y, mouse.x - j.x);
  partida.balas.push({ x: j.x + Math.cos(angulo) * 23, y: j.y + Math.sin(angulo) * 23,
    vx: Math.cos(angulo) * 710, vy: Math.sin(angulo) * 710, vida: 1.6 });
  // Intervalo / 1.5 equivale exactamente a disparar 50% más veces por segundo.
  j.disparoEn = .23 / (j.mejorado ? 1.5 : 1);
  efectoSonoro("disparo");
}

// Distancia de un segmento a un centro: una bala rápida no atraviesa enemigos
// aunque en un fotograma pase de un lado del enemigo al otro.
function distanciaSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const longitud = dx * dx + dy * dy;
  const t = longitud ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / longitud)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function actualizarZona(dt) {
  const j = partida.jugador;
  const dentro = j.x >= ZONA.x && j.x <= ZONA.x + ZONA.lado && j.y >= ZONA.y && j.y <= ZONA.y + ZONA.lado;
  partida.escudo = Math.max(0, partida.escudo - dt);
  partida.recargaEscudo = Math.max(0, partida.recargaEscudo - dt);
  if (dentro && !partida.dentroZona && partida.recargaEscudo === 0) {
    partida.escudo = 2;
    partida.recargaEscudo = 12;
    emitirTexto("ESCUDO · 2 s", j.x, j.y - 35, "#e8ca55");
  }
  if (!dentro) partida.escudo = 0;
  // Compra automática una sola vez, también si consigues créditos desde la zona.
  if (dentro && partida.creditos >= COSTO_MEJORA && !j.mejorado) {
    partida.creditos -= COSTO_MEJORA;
    j.mejorado = true;
    emitirTexto("+50% CADENCIA", j.x, j.y - 58, "#e8ca55");
    efectoSonoro("mejora");
  }
  partida.dentroZona = dentro;
}

function actualizar(dt) {
  if (estado === "transicion") {
    partida.transicion -= dt;
    $("transition-count").textContent = Math.max(1, Math.ceil(partida.transicion));
    if (partida.transicion <= 0) { estado = "jugando"; $("transition").hidden = true; }
    return;
  }
  if (estado !== "jugando") return;
  const j = partida.jugador;
  partida.tiempo += dt;
  partida.tiempoOleada += dt;
  j.invulnerable = Math.max(0, j.invulnerable - dt);
  j.disparoEn = Math.max(0, j.disparoEn - dt);
  let dx = Number(teclas.has("KeyD")) - Number(teclas.has("KeyA"));
  let dy = Number(teclas.has("KeyS")) - Number(teclas.has("KeyW"));
  const longitud = Math.hypot(dx, dy) || 1;
  // Normalizar evita que moverse en diagonal sea más rápido.
  j.x = Math.max(j.radio, Math.min(ANCHO - j.radio, j.x + dx / longitud * j.velocidad * dt));
  j.y = Math.max(j.radio, Math.min(ALTO - j.radio, j.y + dy / longitud * j.velocidad * dt));
  actualizarZona(dt);
  if (mouse.disparando && j.disparoEn === 0) disparar();

  while (partida.siguiente < partida.plan.length && partida.plan[partida.siguiente].apareceEn <= partida.tiempoOleada) {
    const datos = partida.plan[partida.siguiente++];
    partida.enemigos.push({ ...TIPOS_MALWARE[datos.tipo], ...datos, vidaMax: datos.vida, golpe: 0 });
  }

  for (const e of partida.enemigos) {
    const angulo = Math.atan2(j.y - e.y, j.x - e.x);
    // El gusano serpentea; virus y troyano persiguen con distinta velocidad y vida.
    const serpenteo = e.tipo === "gusano" ? Math.sin(partida.tiempo * 6 + e.fase) * .65 : 0;
    e.x += Math.cos(angulo + serpenteo) * e.velocidad * dt;
    e.y += Math.sin(angulo + serpenteo) * e.velocidad * dt;
    e.angulo = angulo + serpenteo;
    e.golpe = Math.max(0, e.golpe - dt);
  }

  for (const bala of partida.balas) {
    const ax = bala.x, ay = bala.y;
    bala.x += bala.vx * dt; bala.y += bala.vy * dt; bala.vida -= dt;
    for (const e of partida.enemigos) {
      if (e.vida <= 0 || distanciaSegmento(e.x, e.y, ax, ay, bala.x, bala.y) > e.radio + 3) continue;
      e.vida -= 25; e.golpe = .10; bala.vida = 0;
      if (e.vida <= 0) {
        partida.puntos += e.puntos; partida.creditos += e.puntos; partida.bajas++;
        explotar(e); emitirTexto(`+${e.puntos}`, e.x, e.y - 15, "#d2edb9"); efectoSonoro("baja");
      }
      break;
    }
  }
  partida.balas = partida.balas.filter(b => b.vida > 0 && b.x > -10 && b.x < ANCHO + 10 && b.y > -10 && b.y < ALTO + 10);
  partida.enemigos = partida.enemigos.filter(e => e.vida > 0);
  for (const e of partida.enemigos) {
    if (Math.hypot(e.x - j.x, e.y - j.y) < e.radio + j.radio && j.invulnerable === 0 && partida.escudo === 0) {
      j.vida = Math.max(0, j.vida - (e.tipo === "troyano" ? 24 : e.tipo === "gusano" ? 12 : 16));
      j.invulnerable = .85;
      emitirTexto("INTEGRIDAD −", j.x, j.y - 26, "#f17469");
      efectoSonoro("daño");
      if (j.vida === 0) { finalizar(false); return; }
    }
  }

  for (const p of partida.particulas) { p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; }
  partida.particulas = partida.particulas.filter(p => p.vida > 0);
  for (const t of partida.textos) { t.y -= 28 * dt; t.vida -= dt; }
  partida.textos = partida.textos.filter(t => t.vida > 0);
  actualizarHUD();
  // Termina solo cuando aparecieron todos Y no quedan enemigos vivos.
  if (partida.siguiente === partida.plan.length && partida.enemigos.length === 0) {
    if (partida.oleada === 3) finalizar(true);
    else prepararOleada();
  }
}

function actualizarHUD() {
  if (!partida) return;
  const j = partida.jugador;
  $("health-text").textContent = `${j.vida} / ${j.vidaMax}`;
  $("health-fill").style.width = `${j.vida / j.vidaMax * 100}%`;
  $("health-fill").style.background = j.vida > 30 ? "var(--green)" : "#f17469";
  $("health-meter").setAttribute("aria-valuenow", j.vida);
  $("score-text").textContent = String(partida.puntos).padStart(4, "0");
  $("wave-text").textContent = `0${partida.oleada}`;
  $("credits-text").textContent = partida.creditos;
  $("upgrade-text").textContent = j.mejorado ? "+50% ACTIVA" : "ESTÁNDAR";
  $("kills-text").textContent = partida.bajas;
  $("remaining").textContent = `AMENAZAS RESTANTES / ${partida.plan.length - partida.siguiente + partida.enemigos.length}`;
  $("zone-status").classList.toggle("active", partida.dentroZona);
  const compra = j.mejorado ? "Mejora de cadencia equipada." : `Mejora: ${COSTO_MEJORA} créditos · Disponibles: ${partida.creditos}.`;
  const escudo = partida.escudo > 0 ? `Escudo activo ${Math.ceil(partida.escudo)} s.` : partida.recargaEscudo > 0 ? `Escudo recarga ${Math.ceil(partida.recargaEscudo)} s; sal y vuelve a entrar.` : "Escudo listo: entra para activarlo 2 s.";
  const aviso = `${partida.dentroZona ? "▣ DENTRO DE ZONA SEGURA" : "▣ ZONA SEGURA"} · ${compra} ${escudo}`;
  // Solo anunciamos cambios reales para no saturar el lector de pantalla.
  if ($("zone-status").textContent !== aviso) $("zone-status").textContent = aviso;
}

function mostrarRanking(resultado, guardado) {
  $("ranking-mode").textContent = resultado.origen.toUpperCase();
  const lista = $("ranking-list");
  lista.replaceChildren();
  for (const fila of resultado.puntajes) {
    const item = document.createElement("li");
    const nombre = document.createElement("span");
    const puntos = document.createElement("strong");
    // textContent impide que un nombre del ranking se interprete como HTML.
    nombre.textContent = fila.name; nombre.title = fila.name; puntos.textContent = fila.score;
    item.append(nombre, puntos); lista.append(item);
  }
  let nota = resultado.origen === "en línea" ? "Ranking global · Supabase." : resultado.persistente ? "Ranking local · guardado en este navegador." : "Ranking local temporal · almacenamiento no disponible.";
  if (guardado.origen === "local" && resultado.origen === "en línea") nota += " Tu resultado solo se guardó localmente.";
  if (!resultado.puntajes.length) nota += " Aún no hay resultados.";
  $("ranking-note").textContent = nota;
}

async function finalizar(victoria) {
  // El estado cambia antes del await: así no se guarda una partida dos veces.
  if (estado === "fin") return;
  estado = "fin";
  limpiarEntrada(); actualizarHUD();
  const id = numeroPartida;
  const resultadoPartida = partida;
  $("pause-button").disabled = true;
  $("transition").hidden = true;
  $("end-screen").hidden = false;
  $("end-screen").classList.toggle("defeat", !victoria);
  $("end-kicker").textContent = victoria ? "MISIÓN COMPLETADA / 03 DE 03" : "CONEXIÓN PERDIDA / INTEGRIDAD 0";
  $("end-title").textContent = victoria ? "SISTEMA PROTEGIDO." : "SISTEMA COMPROMETIDO.";
  $("end-copy").textContent = victoria ? "Contuviste las tres oleadas. La red vuelve a estar a salvo." : "El malware superó tus defensas. Un nuevo protocolo te espera.";
  $("final-score").textContent = partida.puntos;
  $("final-stats").textContent = `${partida.bajas} amenazas eliminadas · ${Math.floor(partida.tiempo)} s · Semilla ${partida.semilla}`;
  $("arena-label").textContent = victoria ? "AMENAZAS CONTENIDAS" : "SISTEMA DESCONECTADO";
  $("ranking-mode").textContent = "CARGANDO";
  $("ranking-list").replaceChildren();
  $("ranking-note").textContent = "Guardando resultado…";
  efectoSonoro(victoria ? "victoria" : "derrota");
  $("retry-button").focus({ preventScroll: true });
  const guardado = await guardarPuntaje(resultadoPartida.nombre, resultadoPartida.puntos);
  // Si falla el envío mostramos el ranking local que sí contiene esta partida.
  const ranking = guardado.origen === "local"
    ? { puntajes: leerRankingLocal().slice(0, 5), origen: "local", persistente: almacenamientoDisponible }
    : await obtenerTop5();
  // Una petición lenta de la partida anterior no puede cambiar la nueva pantalla.
  if (id === numeroPartida && estado === "fin") mostrarRanking(ranking, guardado);
}

function dibujarFondo() {
  ctx.fillStyle = "#151b13"; ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.strokeStyle = "#232c1f"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= ANCHO; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, ALTO); }
  for (let y = 0; y <= ALTO; y += 50) { ctx.moveTo(0, y); ctx.lineTo(ANCHO, y); }
  ctx.stroke();
  // Circuitos decorativos, sin colisiones: dejan toda la arena transitable.
  ctx.strokeStyle = "#303c29"; ctx.lineWidth = 2;
  [[70,90,260,150],[790,75,920,185],[70,485,285,580],[730,475,935,570]].forEach(([x,y,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.strokeRect(x-4,y-4,8,8); ctx.strokeRect(x2-4,y2-4,8,8);
  });
  ctx.strokeStyle = "#34412c"; ctx.setLineDash([4, 8]);
  ctx.strokeRect(22, 22, ANCHO - 44, ALTO - 44); ctx.setLineDash([]);
  ctx.font = "11px Consolas, monospace"; ctx.fillStyle = "#748267";
  ctx.fillText("SECTOR 07 / NÚCLEO DEL SISTEMA", 43, 52);
  ctx.fillText("1000 × 650 / RED INTERNA", 758, 611);
  ctx.strokeStyle = "#313e29";
  ctx.beginPath(); ctx.arc(500,325,113,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(500,325,121,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle = "#718164";
  for (const [x,y] of [[130,330],[830,320],[330,80],[620,110],[350,480],[650,580]]) {
    ctx.fillRect(x-4,y,9,1); ctx.fillRect(x,y-4,1,9);
  }
}

function dibujarZona() {
  ctx.fillStyle = partida && partida.dentroZona ? "#4a431b" : "#2a2b16";
  ctx.fillRect(ZONA.x, ZONA.y, ZONA.lado, ZONA.lado);
  ctx.strokeStyle = "#e8ca55"; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
  ctx.strokeRect(ZONA.x, ZONA.y, ZONA.lado, ZONA.lado); ctx.setLineDash([]);
  ctx.textAlign = "center"; ctx.fillStyle = "#e8ca55"; ctx.font = "11px Consolas, monospace";
  ctx.fillText("ZONA SEGURA", 500, 510); ctx.font = "24px Consolas, monospace";
  ctx.fillText("+", 500, 547); ctx.font = "10px Consolas, monospace";
  ctx.fillText(partida && partida.jugador.mejorado ? "MEJORA ACTIVA" : "60 CR / CADENCIA", 500, 576);
  ctx.textAlign = "left";
}

function dibujarEnemigo(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.fillStyle = e.golpe > 0 ? "#ffffff" : e.color;
  ctx.strokeStyle = e.color; ctx.lineWidth = 2;
  if (e.tipo === "virus") {
    ctx.rotate(Math.PI / 4); ctx.fillRect(-11,-11,22,22); ctx.strokeRect(-17,-17,34,34);
    ctx.fillStyle = "#612a26"; ctx.fillRect(-4,-4,8,8);
  } else if (e.tipo === "gusano") {
    ctx.rotate(e.angulo || 0); ctx.beginPath(); ctx.moveTo(17,0); ctx.lineTo(-13,-11); ctx.lineTo(-7,0); ctx.lineTo(-13,11); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .4; ctx.fillRect(-22,-5,5,10);
  } else {
    ctx.fillStyle = e.golpe > 0 ? "#fff" : "#573767"; ctx.fillRect(-20,-20,40,40); ctx.strokeRect(-20,-20,40,40);
    ctx.strokeRect(-12,-12,24,24); ctx.fillStyle=e.color; ctx.fillRect(-5,-5,10,10);
  }
  ctx.restore();
  if (e.vida < e.vidaMax) {
    ctx.fillStyle = "#402f34"; ctx.fillRect(e.x-20,e.y-e.radio-12,40,3);
    ctx.fillStyle = e.color; ctx.fillRect(e.x-20,e.y-e.radio-12,40*Math.max(0,e.vida/e.vidaMax),3);
  }
}

function dibujarJugador(j, tiempo) {
  ctx.save(); ctx.translate(j.x,j.y);
  if (j.invulnerable > 0 && !movimientoReducido && Math.floor(tiempo*14)%2===0) ctx.globalAlpha = .35;
  if (partida && partida.escudo > 0) { ctx.strokeStyle = "#e8ca55"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,29,0,Math.PI*2); ctx.stroke(); }
  ctx.fillStyle = "#243e5a"; ctx.fillRect(-21,-21,42,42);
  ctx.strokeStyle = j.invulnerable > 0 ? "#fff" : "#92c7ff"; ctx.lineWidth=2; ctx.strokeRect(-16,-16,32,32);
  ctx.fillStyle = "#64adff"; ctx.fillRect(-12,-12,24,24);
  ctx.fillStyle = "#d8edff"; ctx.fillRect(-4,-4,8,8);
  ctx.rotate(Math.atan2(mouse.y-j.y,mouse.x-j.x)); ctx.fillStyle = "#b4d9ff"; ctx.fillRect(17,-3,14,6);
  ctx.restore();
  if (!partida) { ctx.fillStyle="#94bde9"; ctx.textAlign="center"; ctx.font="11px Consolas, monospace"; ctx.fillText("ANTIVIRUS / TÚ",j.x,j.y+47); ctx.textAlign="left"; }
}

function dibujar(tiempo) {
  dibujarFondo(); dibujarZona();
  if (!partida) {
    // La vista inicial usa los mismos dibujos que la partida, sin archivos externos.
    [{tipo:"virus",x:245,y:210},{tipo:"gusano",x:750,y:225},{tipo:"troyano",x:790,y:435},{tipo:"virus",x:210,y:410}].forEach(e=>dibujarEnemigo({...TIPOS_MALWARE[e.tipo],...e}));
    ctx.strokeStyle="#466139"; ctx.setLineDash([5,7]); ctx.beginPath(); ctx.moveTo(500,325); ctx.lineTo(725,235); ctx.stroke(); ctx.setLineDash([]);
    dibujarJugador({x:500,y:325,invulnerable:0},tiempo);
    ctx.fillStyle="#708362"; ctx.font="10px Consolas, monospace"; ctx.fillText("INTRUSIÓN DETECTADA",135,160); ctx.fillText("PERÍMETRO VULNERABLE",665,150);
    return;
  }
  for(const e of partida.enemigos) dibujarEnemigo(e);
  ctx.fillStyle="#c9e7ff";
  for(const b of partida.balas) { ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill(); }
  for(const p of partida.particulas) { ctx.globalAlpha=Math.max(0,p.vida*2); ctx.fillStyle=p.color; ctx.fillRect(p.x-2,p.y-2,4,4); }
  ctx.globalAlpha=1; dibujarJugador(partida.jugador,partida.tiempo);
  ctx.font="bold 15px Consolas, monospace"; ctx.textAlign="center";
  for(const t of partida.textos) { ctx.globalAlpha=Math.min(1,t.vida*2); ctx.fillStyle=t.color; ctx.fillText(t.texto,t.x,t.y); }
  ctx.globalAlpha=1; ctx.textAlign="left";
  if (estado === "jugando") {
    ctx.strokeStyle="#b6d79e"; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,8,0,Math.PI*2);
    ctx.moveTo(mouse.x-13,mouse.y); ctx.lineTo(mouse.x-5,mouse.y); ctx.moveTo(mouse.x+5,mouse.y); ctx.lineTo(mouse.x+13,mouse.y);
    ctx.moveTo(mouse.x,mouse.y-13); ctx.lineTo(mouse.x,mouse.y-5); ctx.moveTo(mouse.x,mouse.y+5); ctx.lineTo(mouse.x,mouse.y+13); ctx.stroke();
  }
}

function fotograma(tiempo) {
  // Segundos entre fotogramas: la velocidad no depende de los FPS del proyector.
  const dt = Math.min((tiempo - ultimoTiempo) / 1000 || 0, .05);
  ultimoTiempo = tiempo;
  actualizar(dt); dibujar(tiempo / 1000);
  requestAnimationFrame(fotograma);
}

$("start-form").addEventListener("submit", e => { e.preventDefault(); iniciarPartida(); });
$("retry-button").addEventListener("click", iniciarPartida);
$("pause-button").addEventListener("click", () => estado === "pausa" ? continuar() : pausar());
$("resume-button").addEventListener("click", continuar);
$("menu-button").addEventListener("click", () => {
  numeroPartida++; partida=null; estado="inicio"; limpiarEntrada();
  $("workspace").classList.remove("playing"); $("lobby").hidden=false;
  document.body.classList.remove("combat-active");
  $("end-screen").hidden=true; $("combat-info").hidden=true; $("preview-tag").hidden=false;
  $("arena-label").textContent="VISTA DEL SISTEMA"; $("seed-label").textContent="ESPERANDO DESPLIEGUE";
  $("health-text").textContent="100 / 100"; $("health-fill").style.width="100%"; $("health-fill").style.background="var(--green)";
  $("health-meter").setAttribute("aria-valuenow","100"); $("score-text").textContent="0000"; $("wave-text").textContent="01";
  $("remaining").textContent="ANTIVIRUS v1.0"; $("zone-status").classList.remove("active");
  $("zone-status").textContent="▣ ZONA SEGURA · Entra con 60 puntos disponibles para comprar +50% de cadencia.";
  $("team-name").focus({preventScroll:true});
  window.scrollTo({top:0,left:0,behavior:"instant"});
});
function alternarSonido() {
  sonidoActivo=!sonidoActivo; if(sonidoActivo) activarAudio();
  $("sound-button").textContent=`SONIDO: ${sonidoActivo?"ON":"OFF"}`;
  $("sound-button").setAttribute("aria-pressed",String(sonidoActivo));
}
$("sound-button").addEventListener("click",alternarSonido);
window.addEventListener("keydown",e=>{
  if(e.target instanceof HTMLInputElement) return;
  if(["KeyW","KeyA","KeyS","KeyD"].includes(e.code) && estado==="jugando") { e.preventDefault(); teclas.add(e.code); }
  if(e.code==="Escape" && !e.repeat) { if(estado==="pausa") continuar(); else pausar(); }
  if(e.code==="KeyM" && !e.repeat) alternarSonido();
});
window.addEventListener("keyup",e=>teclas.delete(e.code));
function apuntar(e) {
  const rect=canvas.getBoundingClientRect();
  mouse.x=(e.clientX-rect.left)*ANCHO/rect.width;
  mouse.y=(e.clientY-rect.top)*ALTO/rect.height;
}
canvas.addEventListener("pointermove",apuntar);
canvas.addEventListener("pointerdown",e=>{
  if(e.button!==0 || estado!=="jugando") return;
  e.preventDefault(); apuntar(e); activarAudio(); mouse.disparando=true;
  canvas.focus({preventScroll:true}); canvas.setPointerCapture(e.pointerId);
});
window.addEventListener("pointerup",()=>mouse.disparando=false);
canvas.addEventListener("pointercancel",()=>mouse.disparando=false);
canvas.addEventListener("lostpointercapture",()=>mouse.disparando=false);
window.addEventListener("blur",()=>{ limpiarEntrada(); pausar(); });
document.addEventListener("visibilitychange",()=>{ if(document.hidden) { limpiarEntrada(); pausar(); } });
requestAnimationFrame(fotograma);
