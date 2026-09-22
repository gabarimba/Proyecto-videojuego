"use strict";

// Canvas mantiene una resolución lógica fija. CSS lo adapta a laptop o proyector.
const $ = id => document.getElementById(id);
const canvas = $("game-canvas");
const ctx = canvas.getContext("2d");
const VISTA_ANCHO = 1000, VISTA_ALTO = 650;
const MUNDO_ANCHO = 2400, MUNDO_ALTO = 1600;
const MAX_OLEADAS = 10, COSTO_MEJORA = 60, TAM_CELDA = 20;

// Rectángulos de piso superpuestos forman habitaciones, puertas y pasillos.
const PISOS = Object.freeze([
  {x:820,y:480,w:760,h:640,nombre:"NÚCLEO"},
  {x:80,y:80,w:650,h:430,nombre:"ARCHIVOS"},{x:650,y:300,w:230,h:130},{x:780,y:300,w:140,h:260},
  {x:1670,y:80,w:650,h:430,nombre:"SERVIDORES"},{x:1520,y:300,w:230,h:130},{x:1480,y:300,w:140,h:260},
  {x:80,y:1090,w:650,h:430,nombre:"RESPALDOS"},{x:650,y:1170,w:230,h:130},{x:780,y:1040,w:140,h:260},
  {x:1670,y:1090,w:650,h:430,nombre:"FIREWALL"},{x:1520,y:1170,w:230,h:130},{x:1480,y:1040,w:140,h:260},
  {x:900,y:40,w:600,h:300,nombre:"TERMINAL NORTE"},{x:1130,y:300,w:140,h:220},
  {x:900,y:1260,w:600,h:300,nombre:"TERMINAL SUR"},{x:1130,y:1080,w:140,h:220}
]);
const ENTRADAS = Object.freeze([
  {x:125,y:145},{x:2275,y:145},{x:125,y:1455},{x:2275,y:1455},
  {x:980,y:95},{x:1420,y:95},{x:980,y:1505},{x:1420,y:1505}
]);
const ZONA = Object.freeze({x:1080,y:720,w:240,h:160});
const ETIQUETAS_OLEADA = ["Primera infección","La red se abre","Defiende el núcleo","Tráfico anómalo","Brecha múltiple","Sistema saturado","Protocolo rojo","Cero confianza","Última muralla","Apocalipsis digital"];
const teclas = new Set();
const mouse = {pantallaX:700,pantallaY:325,x:1400,y:800,disparando:false};
const mascarasFlujo = {};
const movimientoReducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
let partida = null, estado = "inicio", estadoAntesDePausa = "jugando", numeroPartida = 0, ultimoTiempo = 0;

let audio = null, sonidoActivo = true;
function activarAudio(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!audio&&Audio)audio=new Audio();if(audio&&audio.state==="suspended")audio.resume().catch(()=>{});}catch(_){}}
function tono(f,d,v,t="sine",r=0,fin=f){if(!audio||!sonidoActivo||audio.state!=="running")return;const i=audio.currentTime+r,o=audio.createOscillator(),g=audio.createGain();o.type=t;o.frequency.setValueAtTime(f,i);o.frequency.exponentialRampToValueAtTime(fin,i+d);g.gain.setValueAtTime(v,i);g.gain.exponentialRampToValueAtTime(.001,i+d);o.connect(g).connect(audio.destination);o.start(i);o.stop(i+d);o.onended=()=>{o.disconnect();g.disconnect();};}
function efectoSonoro(tipo){if(tipo==="disparo")tono(620,.07,.025,"square",0,190);if(tipo==="daño")tono(150,.22,.065,"sawtooth",0,45);if(tipo==="baja")tono(330,.09,.035,"triangle",0,660);if(tipo==="mejora")[440,660,880].forEach((f,i)=>tono(f,.18,.06,"sine",i*.1));if(tipo==="victoria")[392,494,587,784].forEach((f,i)=>tono(f,.32,.065,"triangle",i*.16));if(tipo==="derrota")[220,165,82].forEach((f,i)=>tono(f,.3,.05,"triangle",i*.2));}

function limpiarEntrada(){teclas.clear();mouse.disparando=false;}
function dentroRect(x,y,r,m=0){return x>=r.x+m&&x<=r.x+r.w-m&&y>=r.y+m&&y<=r.y+r.h-m;}
function tocaRect(x,y,radio,r){const cx=Math.max(r.x,Math.min(x,r.x+r.w)),cy=Math.max(r.y,Math.min(y,r.y+r.h));return Math.hypot(x-cx,y-cy)<radio;}
function puntoEnPiso(x,y){return PISOS.some(r=>dentroRect(x,y,r));}
function esPiso(x,y,radio=0){
  if(!puntoEnPiso(x,y))return false;
  // Se comprueba el círculo contra la unión de todos los pisos. Antes se
  // exigía que cupiera en un solo rectángulo y el troyano se atoraba justo
  // donde dos rectángulos forman una puerta.
  for(let i=0;i<8&&radio;i++){const a=i*Math.PI/4;if(!puntoEnPiso(x+Math.cos(a)*radio,y+Math.sin(a)*radio))return false;}
  return true;
}
function puedeOcupar(x,y,radio,enemigo=false){return esPiso(x,y,radio)&&!(enemigo&&tocaRect(x,y,radio+3,ZONA));}
function moverEntidad(e,dx,dy,enemigo=false){const ax=e.x,ay=e.y;if(puedeOcupar(e.x+dx,e.y,e.radio,enemigo))e.x+=dx;if(puedeOcupar(e.x,e.y+dy,e.radio,enemigo))e.y+=dy;return Math.hypot(e.x-ax,e.y-ay);}
function lineaTransitable(ax,ay,bx,by,evitaZona=false,radio=2){const pasos=Math.ceil(Math.hypot(bx-ax,by-ay)/12);for(let i=0;i<=pasos;i++){const t=pasos?i/pasos:0,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;if(!esPiso(x,y,radio)||(evitaZona&&tocaRect(x,y,radio+3,ZONA)))return false;}return true;}

function iniciarPartida(){
  const nombre=$("team-name").value.trim();if(!nombre){$("team-name").focus();return;}activarAudio();numeroPartida++;
  const semilla=nuevaSemilla();
  partida={nombre,semilla,generador:crearGenerador(semilla),azarVisual:mulberry32(semilla^0xABCDEF),
    jugador:{x:1200,y:800,radio:15,vida:100,vidaMax:100,velocidad:245,invulnerable:0,disparoEn:0,mejorado:false,recuperacion:0},
    camara:{x:700,y:475},flujos:null,flujoEn:0,enemigos:[],balas:[],particulas:[],textos:[],plan:[],
    oleada:0,puntos:0,creditos:0,bajas:0,tiempo:0,tiempoOleada:0,siguiente:0,transicion:0,dentroZona:true};
  limpiarEntrada();$("lobby").hidden=true;$("workspace").classList.add("playing");document.body.classList.add("combat-active");
  $("combat-info").hidden=false;$("preview-tag").hidden=true;$("end-screen").hidden=true;$("pause-screen").hidden=true;
  $("pause-button").disabled=false;$("pause-button").textContent="PAUSA Ⅱ";$("arena-label").textContent="RED INTERNA / MAPA ACTIVO";
  $("seed-label").textContent=`SEMILLA / ${semilla.toString(16).toUpperCase().padStart(8,"0")}`;
  prepararOleada();actualizarHUD();canvas.focus({preventScroll:true});window.scrollTo({top:0,left:0,behavior:"instant"});
}
function prepararOleada(){
  partida.oleada++;partida.plan=partida.generador.oleada(partida.oleada,ENTRADAS);partida.siguiente=0;partida.tiempoOleada=0;
  partida.transicion=3;partida.balas=[];partida.flujos=null;partida.flujoEn=0;mouse.disparando=false;estado="transicion";
  $("transition").hidden=false;$("transition-kicker").textContent=partida.oleada===1?"DESPLEGANDO ANTIVIRUS":"SECTOR LIMPIO / NUEVA BRECHA";
  $("transition-title").textContent=`OLEADA ${String(partida.oleada).padStart(2,"0")}`;
  $("transition-copy").textContent=`${partida.plan.length} amenazas · ${ETIQUETAS_OLEADA[partida.oleada-1]}`;$("transition-count").textContent="3";actualizarHUD();
}
function pausar(){if(estado!=="jugando"&&estado!=="transicion")return;estadoAntesDePausa=estado;estado="pausa";limpiarEntrada();$("pause-screen").hidden=false;$("pause-button").textContent="SEGUIR ▷";$("resume-button").focus({preventScroll:true});}
function continuar(){if(estado!=="pausa")return;estado=estadoAntesDePausa;$("pause-screen").hidden=true;$("pause-button").textContent="PAUSA Ⅱ";activarAudio();canvas.focus({preventScroll:true});}
function emitirTexto(texto,x,y,color){partida.textos.push({texto,x,y,color,vida:1.1});}
function explotar(e){for(let i=0;i<(movimientoReducido?3:12);i++){const a=partida.azarVisual()*Math.PI*2,v=35+partida.azarVisual()*140;partida.particulas.push({x:e.x,y:e.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,vida:.5,color:e.color});}}
function disparar(){const j=partida.jugador;if(partida.dentroZona)return;const a=Math.atan2(mouse.y-j.y,mouse.x-j.x);partida.balas.push({x:j.x+Math.cos(a)*23,y:j.y+Math.sin(a)*23,vx:Math.cos(a)*710,vy:Math.sin(a)*710,vida:1.6});j.disparoEn=.23/(j.mejorado?1.5:1);efectoSonoro("disparo");}
function distanciaSegmento(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l)):0;return Math.hypot(px-ax-t*dx,py-ay-t*dy);}
function actualizarZona(dt=0){const j=partida.jugador,dentro=dentroRect(j.x,j.y,ZONA,j.radio/2);if(dentro&&partida.creditos>=COSTO_MEJORA&&!j.mejorado){partida.creditos-=COSTO_MEJORA;j.mejorado=true;emitirTexto("+50% CADENCIA",j.x,j.y-45,"#e8ca55");efectoSonoro("mejora");}if(dentro&&j.vida<j.vidaMax){j.recuperacion+=14*dt;const puntos=Math.floor(j.recuperacion);if(puntos){j.vida=Math.min(j.vidaMax,j.vida+puntos);j.recuperacion-=puntos;}}else j.recuperacion=0;partida.dentroZona=dentro;}

function celdaDe(x,y){return{c:Math.max(0,Math.min(MUNDO_ANCHO/TAM_CELDA-1,Math.floor(x/TAM_CELDA))),f:Math.max(0,Math.min(MUNDO_ALTO/TAM_CELDA-1,Math.floor(y/TAM_CELDA)))}};
function obtenerMascaraFlujo(radio){
  if(mascarasFlujo[radio])return mascarasFlujo[radio];
  const columnas=MUNDO_ANCHO/TAM_CELDA,filas=MUNDO_ALTO/TAM_CELDA,m=new Uint8Array(columnas*filas);
  // El mapa y el refugio son fijos; esta máscara se calcula una sola vez.
  for(let f=0;f<filas;f++)for(let c=0;c<columnas;c++)m[f*columnas+c]=Number(puedeOcupar(c*TAM_CELDA+TAM_CELDA/2,f*TAM_CELDA+TAM_CELDA/2,radio,true));
  return mascarasFlujo[radio]=m;
}
function construirFlujo(radio){
  const columnas=MUNDO_ANCHO/TAM_CELDA,filas=MUNDO_ALTO/TAM_CELDA,d=new Int16Array(columnas*filas);d.fill(-1);
  const mascara=obtenerMascaraFlujo(radio);
  let ox=partida.jugador.x,oy=partida.jugador.y;if(partida.dentroZona){ox=ZONA.x-30;oy=partida.jugador.y;}const meta=celdaDe(ox,oy);
  const qc=new Int16Array(columnas*filas),qf=new Int16Array(columnas*filas);let ini=0,fin=0;
  const agregar=(c,f,v)=>{if(c<0||f<0||c>=columnas||f>=filas)return;const i=f*columnas+c;if(d[i]!==-1||!mascara[i])return;d[i]=v;qc[fin]=c;qf[fin++]=f;};
  agregar(meta.c,meta.f,0);while(ini<fin){const c=qc[ini],f=qf[ini++],v=d[f*columnas+c]+1;agregar(c+1,f,v);agregar(c-1,f,v);agregar(c,f+1,v);agregar(c,f-1,v);}return{distancias:d,columnas,filas};
}
function construirFlujos(){partida.flujos={12:construirFlujo(12),15:construirFlujo(15),21:construirFlujo(21)};}
function direccionFlujo(e){
  const j=partida.jugador;if(!partida.dentroZona&&lineaTransitable(e.x,e.y,j.x,j.y,true,e.radio))return Math.atan2(j.y-e.y,j.x-e.x);
  const flujo=partida.flujos&&partida.flujos[e.radio];if(!flujo)return Math.atan2(j.y-e.y,j.x-e.x);const a=celdaDe(e.x,e.y);let mejor=flujo.distancias[a.f*flujo.columnas+a.c],destino=null;
  for(const [dc,df] of [[1,0],[-1,0],[0,1],[0,-1]]){const c=a.c+dc,f=a.f+df;if(c<0||f<0||c>=flujo.columnas||f>=flujo.filas)continue;const v=flujo.distancias[f*flujo.columnas+c];if(v>=0&&(mejor<0||v<mejor)){mejor=v;destino={c,f};}}
  return destino?Math.atan2(destino.f*TAM_CELDA+TAM_CELDA/2-e.y,destino.c*TAM_CELDA+TAM_CELDA/2-e.x):Math.atan2(j.y-e.y,j.x-e.x);
}
function actualizarCamara(dt){if(!partida)return;const j=partida.jugador,c=partida.camara,mx=(mouse.pantallaX-VISTA_ANCHO/2)*.18,my=(mouse.pantallaY-VISTA_ALTO/2)*.18,tx=Math.max(0,Math.min(MUNDO_ANCHO-VISTA_ANCHO,j.x-VISTA_ANCHO/2+mx)),ty=Math.max(0,Math.min(MUNDO_ALTO-VISTA_ALTO,j.y-VISTA_ALTO/2+my)),s=movimientoReducido?1:1-Math.exp(-dt*8);c.x+=(tx-c.x)*s;c.y+=(ty-c.y)*s;mouse.x=c.x+mouse.pantallaX;mouse.y=c.y+mouse.pantallaY;}

function actualizar(dt){
  if(!partida)return;actualizarCamara(dt);
  if(estado==="transicion"){partida.transicion-=dt;$("transition-count").textContent=Math.max(1,Math.ceil(partida.transicion));if(partida.transicion<=0){estado="jugando";$("transition").hidden=true;}return;}
  if(estado!=="jugando")return;const j=partida.jugador;partida.tiempo+=dt;partida.tiempoOleada+=dt;j.invulnerable=Math.max(0,j.invulnerable-dt);j.disparoEn=Math.max(0,j.disparoEn-dt);
  let dx=Number(teclas.has("KeyD"))-Number(teclas.has("KeyA")),dy=Number(teclas.has("KeyS"))-Number(teclas.has("KeyW"));const l=Math.hypot(dx,dy)||1;moverEntidad(j,dx/l*j.velocidad*dt,dy/l*j.velocidad*dt);actualizarZona(dt);actualizarCamara(dt);if(mouse.disparando&&j.disparoEn===0&&!partida.dentroZona)disparar();
  while(partida.siguiente<partida.plan.length&&partida.plan[partida.siguiente].apareceEn<=partida.tiempoOleada){const datos=partida.plan[partida.siguiente++];partida.enemigos.push({...TIPOS_MALWARE[datos.tipo],...datos,vidaMax:datos.vida,golpe:0});}
  partida.flujoEn-=dt;if(partida.flujoEn<=0){construirFlujos();partida.flujoEn=.3;}
  for(const e of partida.enemigos){const base=direccionFlujo(e),serp=e.tipo==="gusano"?Math.sin(partida.tiempo*6+e.fase)*.22:0;e.angulo=base+serp;const paso=e.velocidad*dt,avance=moverEntidad(e,Math.cos(e.angulo)*paso,Math.sin(e.angulo)*paso,true);e.atascado=avance<paso*.12?(e.atascado||0)+dt:0;if(e.atascado>.35){const lado=e.fase>Math.PI?1:-1;moverEntidad(e,Math.cos(base+lado*Math.PI/2)*paso,Math.sin(base+lado*Math.PI/2)*paso,true);}e.golpe=Math.max(0,e.golpe-dt);}
  for(const b of partida.balas){const ax=b.x,ay=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.vida-=dt;if(!lineaTransitable(ax,ay,b.x,b.y)){b.vida=0;continue;}for(const e of partida.enemigos){if(e.vida<=0||distanciaSegmento(e.x,e.y,ax,ay,b.x,b.y)>e.radio+3)continue;e.vida-=25;e.golpe=.1;b.vida=0;if(e.vida<=0){partida.puntos+=e.puntos;partida.creditos+=e.puntos;partida.bajas++;explotar(e);emitirTexto(`+${e.puntos}`,e.x,e.y-15,"#d2edb9");efectoSonoro("baja");}break;}}
  partida.balas=partida.balas.filter(b=>b.vida>0);partida.enemigos=partida.enemigos.filter(e=>e.vida>0);
  for(const e of partida.enemigos){if(!partida.dentroZona&&Math.hypot(e.x-j.x,e.y-j.y)<e.radio+j.radio&&j.invulnerable===0){j.vida=Math.max(0,j.vida-(e.tipo==="troyano"?24:e.tipo==="gusano"?12:16));j.invulnerable=.85;emitirTexto("INTEGRIDAD −",j.x,j.y-26,"#f17469");efectoSonoro("daño");if(j.vida===0){finalizar(false);return;}}}
  for(const p of partida.particulas){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vida-=dt;}partida.particulas=partida.particulas.filter(p=>p.vida>0);for(const t of partida.textos){t.y-=28*dt;t.vida-=dt;}partida.textos=partida.textos.filter(t=>t.vida>0);actualizarHUD();
  if(partida.siguiente===partida.plan.length&&partida.enemigos.length===0){if(partida.oleada===MAX_OLEADAS)finalizar(true);else prepararOleada();}
}

function actualizarHUD(){if(!partida)return;const j=partida.jugador;$("health-text").textContent=`${j.vida} / ${j.vidaMax}`;$("health-fill").style.width=`${j.vida/j.vidaMax*100}%`;$("health-fill").style.background=j.vida>30?"var(--green)":"#f17469";$("health-meter").setAttribute("aria-valuenow",j.vida);$("score-text").textContent=String(partida.puntos).padStart(4,"0");$("wave-text").textContent=String(partida.oleada).padStart(2,"0");$("credits-text").textContent=partida.creditos;$("upgrade-text").textContent=j.mejorado?"+50% ACTIVA":"ESTÁNDAR";$("kills-text").textContent=partida.bajas;$("remaining").textContent=`AMENAZAS RESTANTES / ${partida.plan.length-partida.siguiente+partida.enemigos.length}`;$("zone-status").classList.toggle("active",partida.dentroZona);const compra=j.mejorado?"Cadencia +50% equipada.":`Mejora: ${COSTO_MEJORA} créditos · Disponibles: ${partida.creditos}.`,aviso=partida.dentroZona?`▣ ZONA SEGURA ACTIVA · Malware bloqueado · Disparo bloqueado · ${compra}`:`▣ FUERA DE ZONA SEGURA · ${compra}`;if($("zone-status").textContent!==aviso)$("zone-status").textContent=aviso;}
function mostrarRanking(resultado,guardado){$("ranking-mode").textContent=resultado.origen.toUpperCase();const lista=$("ranking-list");lista.replaceChildren();for(const fila of resultado.puntajes){const item=document.createElement("li"),nombre=document.createElement("span"),puntos=document.createElement("strong");nombre.textContent=fila.name;nombre.title=fila.name;puntos.textContent=fila.score;item.append(nombre,puntos);lista.append(item);}let nota=resultado.origen==="en línea"?"Ranking global · Supabase.":resultado.persistente?"Ranking local · guardado en este navegador.":"Ranking local temporal · almacenamiento no disponible.";if(guardado.origen==="local"&&resultado.origen==="en línea")nota+=" Tu resultado solo se guardó localmente.";if(!resultado.puntajes.length)nota+=" Aún no hay resultados.";$("ranking-note").textContent=nota;}
async function finalizar(victoria){if(estado==="fin")return;estado="fin";limpiarEntrada();actualizarHUD();const id=numeroPartida,resultadoPartida=partida;$("pause-button").disabled=true;$("transition").hidden=true;$("end-screen").hidden=false;$("end-screen").classList.toggle("defeat",!victoria);$("end-kicker").textContent=victoria?"MISIÓN COMPLETADA / 10 DE 10":`CONEXIÓN PERDIDA / OLEADA ${partida.oleada}`;$("end-title").textContent=victoria?"RED RECUPERADA.":"SISTEMA COMPROMETIDO.";$("end-copy").textContent=victoria?"Sobreviviste las diez oleadas y limpiaste todos los sectores.":"El malware superó tus defensas. Un nuevo protocolo te espera.";$("final-score").textContent=partida.puntos;$("final-stats").textContent=`${partida.bajas} amenazas · Oleada ${partida.oleada} · ${Math.floor(partida.tiempo)} s · Semilla ${partida.semilla}`;$("arena-label").textContent=victoria?"RED RECUPERADA":"SISTEMA DESCONECTADO";$("ranking-mode").textContent="CARGANDO";$("ranking-list").replaceChildren();$("ranking-note").textContent="Guardando resultado…";efectoSonoro(victoria?"victoria":"derrota");$("retry-button").focus({preventScroll:true});const guardado=await guardarPuntaje(resultadoPartida.nombre,resultadoPartida.puntos),ranking=guardado.origen==="local"?{puntajes:leerRankingLocal().slice(0,5),origen:"local",persistente:almacenamientoDisponible}:await obtenerTop5();if(id===numeroPartida&&estado==="fin")mostrarRanking(ranking,guardado);}

function dibujarFondo(){
  ctx.fillStyle="#090c0a";ctx.fillRect(0,0,MUNDO_ANCHO,MUNDO_ALTO);
  // Primero se dibujan todos los muros y luego se repone el piso. Así las
  // zonas superpuestas quedan como puertas abiertas, no como líneas falsas.
  ctx.fillStyle="#151b13";for(const r of PISOS)ctx.fillRect(r.x,r.y,r.w,r.h);
  for(const r of PISOS){ctx.strokeStyle="#090c0a";ctx.lineWidth=14;ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.strokeStyle="#47523f";ctx.lineWidth=2;ctx.strokeRect(r.x,r.y,r.w,r.h);}
  ctx.fillStyle="#151b13";for(const r of PISOS)ctx.fillRect(r.x,r.y,r.w,r.h);
  for(const r of PISOS){
    ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();ctx.strokeStyle="#222a20";ctx.lineWidth=1;ctx.beginPath();
    for(let x=r.x;x<=r.x+r.w;x+=50){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.h);}for(let y=r.y;y<=r.y+r.h;y+=50){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.w,y);}ctx.stroke();ctx.restore();
    if(r.nombre){ctx.fillStyle="#65715d";ctx.font="12px Consolas, monospace";ctx.fillText(`// ${r.nombre}`,r.x+28,r.y+36);}
  }
  ctx.strokeStyle="#ff7b32";ctx.lineWidth=3;for(const p of ENTRADAS){ctx.beginPath();ctx.arc(p.x,p.y,25,0,Math.PI*2);ctx.stroke();}
}
function dibujarZona(){ctx.fillStyle=partida&&partida.dentroZona?"#51491d":"#302d17";ctx.fillRect(ZONA.x,ZONA.y,ZONA.w,ZONA.h);ctx.strokeStyle="#e8ca55";ctx.lineWidth=4;ctx.setLineDash([12,7]);ctx.strokeRect(ZONA.x,ZONA.y,ZONA.w,ZONA.h);ctx.setLineDash([]);ctx.textAlign="center";ctx.fillStyle="#e8ca55";ctx.font="bold 14px Consolas, monospace";ctx.fillText("ZONA SEGURA",ZONA.x+ZONA.w/2,ZONA.y+48);ctx.font="32px Consolas, monospace";ctx.fillText("+",ZONA.x+ZONA.w/2,ZONA.y+94);ctx.font="11px Consolas, monospace";ctx.fillText(partida&&partida.jugador.mejorado?"CADENCIA +50%":"60 CR / CADENCIA",ZONA.x+ZONA.w/2,ZONA.y+132);ctx.textAlign="left";}
function dibujarEnemigo(e){ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.golpe>0?"#fff":e.color;ctx.strokeStyle=e.color;ctx.lineWidth=2;if(e.tipo==="virus"){ctx.rotate(Math.PI/4);ctx.fillRect(-11,-11,22,22);ctx.strokeRect(-17,-17,34,34);ctx.fillStyle="#612a26";ctx.fillRect(-4,-4,8,8);}else if(e.tipo==="gusano"){ctx.rotate(e.angulo||0);ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(-13,-11);ctx.lineTo(-7,0);ctx.lineTo(-13,11);ctx.closePath();ctx.fill();}else{ctx.fillStyle=e.golpe>0?"#fff":"#573767";ctx.fillRect(-20,-20,40,40);ctx.strokeRect(-20,-20,40,40);ctx.strokeRect(-12,-12,24,24);ctx.fillStyle=e.color;ctx.fillRect(-5,-5,10,10);}ctx.restore();if(e.vida<e.vidaMax){ctx.fillStyle="#402f34";ctx.fillRect(e.x-20,e.y-e.radio-12,40,3);ctx.fillStyle=e.color;ctx.fillRect(e.x-20,e.y-e.radio-12,40*Math.max(0,e.vida/e.vidaMax),3);}}
function dibujarJugador(j,t){ctx.save();ctx.translate(j.x,j.y);if(j.invulnerable>0&&!movimientoReducido&&Math.floor(t*14)%2===0)ctx.globalAlpha=.35;if(partida&&partida.dentroZona){ctx.strokeStyle="#e8ca55";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.stroke();}ctx.fillStyle="#243e5a";ctx.fillRect(-21,-21,42,42);ctx.strokeStyle="#92c7ff";ctx.lineWidth=2;ctx.strokeRect(-16,-16,32,32);ctx.fillStyle="#64adff";ctx.fillRect(-12,-12,24,24);ctx.fillStyle="#d8edff";ctx.fillRect(-4,-4,8,8);ctx.rotate(Math.atan2(mouse.y-j.y,mouse.x-j.x));ctx.fillStyle="#b4d9ff";ctx.fillRect(17,-3,14,6);ctx.restore();}
function dibujarMinimapa(){const x=806,y=18,w=176,h=112,sx=w/MUNDO_ANCHO,sy=h/MUNDO_ALTO;ctx.fillStyle="rgba(7,9,7,.88)";ctx.fillRect(x,y,w,h);ctx.strokeStyle="#697360";ctx.strokeRect(x,y,w,h);ctx.fillStyle="#34402f";for(const r of PISOS)ctx.fillRect(x+r.x*sx,y+r.y*sy,r.w*sx,r.h*sy);ctx.fillStyle="#e8ca55";ctx.fillRect(x+ZONA.x*sx,y+ZONA.y*sy,ZONA.w*sx,ZONA.h*sy);ctx.fillStyle="#f17469";for(const e of partida.enemigos)ctx.fillRect(x+e.x*sx-1,y+e.y*sy-1,3,3);ctx.fillStyle="#64adff";ctx.fillRect(x+partida.jugador.x*sx-2,y+partida.jugador.y*sy-2,5,5);ctx.font="9px Consolas, monospace";ctx.fillStyle="#c4cbbb";ctx.fillText("MAPA / RED",x+7,y+12);}
function dibujarVistaPrevia(){ctx.fillStyle="#090c0a";ctx.fillRect(0,0,VISTA_ANCHO,VISTA_ALTO);ctx.save();ctx.translate(62,30);ctx.scale(.365,.365);dibujarFondo();ctx.fillStyle="#e8ca55";ctx.fillRect(ZONA.x,ZONA.y,ZONA.w,ZONA.h);dibujarJugador({x:1200,y:800,invulnerable:0},0);ctx.restore();ctx.fillStyle="#b1bea6";ctx.font="11px Consolas, monospace";ctx.fillText("MAPA MULTISECTOR / 7 SALAS / 8 BRECHAS",40,620);}
function dibujar(t){if(!partida){dibujarVistaPrevia();return;}ctx.fillStyle="#090c0a";ctx.fillRect(0,0,VISTA_ANCHO,VISTA_ALTO);ctx.save();ctx.translate(-partida.camara.x,-partida.camara.y);dibujarFondo();dibujarZona();for(const e of partida.enemigos)dibujarEnemigo(e);ctx.fillStyle="#c9e7ff";for(const b of partida.balas){ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fill();}for(const p of partida.particulas){ctx.globalAlpha=Math.max(0,p.vida*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}ctx.globalAlpha=1;dibujarJugador(partida.jugador,partida.tiempo);ctx.font="bold 15px Consolas, monospace";ctx.textAlign="center";for(const x of partida.textos){ctx.globalAlpha=Math.min(1,x.vida*2);ctx.fillStyle=x.color;ctx.fillText(x.texto,x.x,x.y);}ctx.globalAlpha=1;ctx.textAlign="left";ctx.restore();dibujarMinimapa();if(estado==="jugando"){ctx.strokeStyle=partida.dentroZona?"#e8ca55":"#b6d79e";ctx.lineWidth=1;ctx.beginPath();ctx.arc(mouse.pantallaX,mouse.pantallaY,8,0,Math.PI*2);ctx.moveTo(mouse.pantallaX-13,mouse.pantallaY);ctx.lineTo(mouse.pantallaX-5,mouse.pantallaY);ctx.moveTo(mouse.pantallaX+5,mouse.pantallaY);ctx.lineTo(mouse.pantallaX+13,mouse.pantallaY);ctx.moveTo(mouse.pantallaX,mouse.pantallaY-13);ctx.lineTo(mouse.pantallaX,mouse.pantallaY-5);ctx.moveTo(mouse.pantallaX,mouse.pantallaY+5);ctx.lineTo(mouse.pantallaX,mouse.pantallaY+13);ctx.stroke();}}
function fotograma(t){const dt=Math.min((t-ultimoTiempo)/1000||0,.05);ultimoTiempo=t;actualizar(dt);dibujar(t/1000);requestAnimationFrame(fotograma);}

$("start-form").addEventListener("submit",e=>{e.preventDefault();iniciarPartida();});$("retry-button").addEventListener("click",iniciarPartida);$("pause-button").addEventListener("click",()=>estado==="pausa"?continuar():pausar());$("resume-button").addEventListener("click",continuar);
$("menu-button").addEventListener("click",()=>{numeroPartida++;partida=null;estado="inicio";limpiarEntrada();$("workspace").classList.remove("playing");$("lobby").hidden=false;document.body.classList.remove("combat-active");$("end-screen").hidden=true;$("combat-info").hidden=true;$("preview-tag").hidden=false;$("arena-label").textContent="VISTA DEL SISTEMA";$("seed-label").textContent="ESPERANDO DESPLIEGUE";$("health-text").textContent="100 / 100";$("health-fill").style.width="100%";$("health-fill").style.background="var(--green)";$("health-meter").setAttribute("aria-valuenow","100");$("score-text").textContent="0000";$("wave-text").textContent="01";$("remaining").textContent="ANTIVIRUS v2.0";$("zone-status").classList.remove("active");$("zone-status").textContent="▣ ZONA SEGURA · El malware no puede entrar · 60 créditos para +50% de cadencia.";$("team-name").focus({preventScroll:true});window.scrollTo({top:0,left:0,behavior:"instant"});});
function alternarSonido(){sonidoActivo=!sonidoActivo;if(sonidoActivo)activarAudio();$("sound-button").textContent=`SONIDO: ${sonidoActivo?"ON":"OFF"}`;$("sound-button").setAttribute("aria-pressed",String(sonidoActivo));}$("sound-button").addEventListener("click",alternarSonido);
window.addEventListener("keydown",e=>{if(e.target instanceof HTMLInputElement)return;if(["KeyW","KeyA","KeyS","KeyD"].includes(e.code)&&estado==="jugando"){e.preventDefault();teclas.add(e.code);}if(e.code==="Escape"&&!e.repeat){if(estado==="pausa")continuar();else pausar();}if(e.code==="KeyM"&&!e.repeat)alternarSonido();});window.addEventListener("keyup",e=>teclas.delete(e.code));
function apuntar(e){const r=canvas.getBoundingClientRect();mouse.pantallaX=(e.clientX-r.left)*VISTA_ANCHO/r.width;mouse.pantallaY=(e.clientY-r.top)*VISTA_ALTO/r.height;if(partida){mouse.x=partida.camara.x+mouse.pantallaX;mouse.y=partida.camara.y+mouse.pantallaY;}}
canvas.addEventListener("pointermove",apuntar);canvas.addEventListener("pointerdown",e=>{if(e.button!==0||estado!=="jugando")return;e.preventDefault();apuntar(e);activarAudio();mouse.disparando=true;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);});window.addEventListener("pointerup",()=>mouse.disparando=false);canvas.addEventListener("pointercancel",()=>mouse.disparando=false);canvas.addEventListener("lostpointercapture",()=>mouse.disparando=false);window.addEventListener("blur",()=>{limpiarEntrada();pausar();});document.addEventListener("visibilitychange",()=>{if(document.hidden){limpiarEntrada();pausar();}});requestAnimationFrame(fotograma);
