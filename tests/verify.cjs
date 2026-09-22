// Pruebas sin instalar paquetes: node tests/verify.cjs
// Se ejecuta el código real en un navegador mínimo simulado. La inspección visual
// y los controles en navegador se verifican aparte; esto prueba reglas y errores.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
let checks = 0;
function ok(condition, message) { assert.ok(condition, message); checks++; console.log('OK', message); }

function environment({ configured = false, storageFails = false, corrupt = false, fetchImpl } = {}) {
  const saved = new Map(corrupt ? [['call-of-malware.scores.v1', '{broken']] : []);
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'team-name' ? 'Equipo prueba' : '', textContent: '', hidden: false,
      style: {}, attrs: {}, children: [], handlers: {}, classList: {add(){},remove(){},toggle(){}},
      focus(){}, setPointerCapture(){}, setAttribute(k,v){this.attrs[k]=v;},
      replaceChildren(){this.children=[];}, append(...children){this.children.push(...children);},
      addEventListener(k,fn){this.handlers[k]=fn;},
      getBoundingClientRect(){return {left:0,top:0,width:1000,height:650};},
      getContext(){return new Proxy({}, {get:(_,k)=>()=>{},set:()=>true});}
    });
    return elements.get(id);
  }
  const handlers = {};
  const context = vm.createContext({
    console, Uint32Array, Int16Array, Math, Date, Object, Number, String, JSON, Array, Set,
    AbortController, setTimeout, clearTimeout, HTMLInputElement: class {},
    crypto: {getRandomValues(array){array[0]=12345;}},
    matchMedia:()=>({matches:false}), requestAnimationFrame(){}, scrollTo(){},
    localStorage: {
      getItem(k){if(storageFails) throw Error('bloqueado'); return saved.get(k) ?? null;},
      setItem(k,v){if(storageFails) throw Error('bloqueado'); saved.set(k,v);}
    },
    fetch: fetchImpl || (async()=>{throw Error('offline');}),
    document: {body:element('body'),getElementById:element,createElement:()=>element(Symbol()),addEventListener(){},hidden:false},
    addEventListener(k,fn){handlers[k]=fn;}
  });
  context.window = context;
  let config = fs.readFileSync(path.join(root,'config.js'),'utf8');
  if (configured) config = config.replace('const SUPABASE_URL = ""','const SUPABASE_URL = "https://example.supabase.co"')
    .replace('const SUPABASE_ANON_KEY = ""','const SUPABASE_ANON_KEY = "sb_publishable_test"');
  vm.runInContext(config,context);
  vm.runInContext(fs.readFileSync(path.join(root,'procedural.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'game.js'),'utf8'),context);
  return {run: code=>vm.runInContext(code,context), elements, handlers, saved};
}

module.exports = { environment };
if (require.main === module) (async()=>{
  const e=environment(), run=e.run;
  const plan=run('JSON.stringify(crearGenerador(42).oleada(1,ENTRADAS))');
  ok(plan===run('JSON.stringify(crearGenerador(42).oleada(1,ENTRADAS))'),'misma semilla reproduce exactamente la oleada');
  ok(plan!==run('JSON.stringify(crearGenerador(43).oleada(1,ENTRADAS))'),'otra semilla cambia la partida');
  ok(run('nuevaSemilla() !== nuevaSemilla()'),'reinicios consecutivos reciben semillas distintas');
  const entradas=JSON.parse(run('JSON.stringify(ENTRADAS)'));
  for(let wave=1;wave<=10;wave++) {
    const data=JSON.parse(run(`JSON.stringify(crearGenerador(99).oleada(${wave},ENTRADAS))`));
    ok(data.length===10+(wave-1)*4,`oleada ${wave}: cantidad progresiva`);
    ok(data.every(p=>entradas.some(e=>Math.abs(p.x-e.x)<=22&&Math.abs(p.y-e.y)<=22)),`oleada ${wave}: apariciones en brechas del mapa`);
    ok(new Set(data.map(p=>p.tipo)).size===3,`oleada ${wave}: aparecen los tres tipos`);
    ok(data.every((p,i)=>i===0||p.apareceEn>data[i-1].apareceEn),`oleada ${wave}: intervalos positivos`);
    ok(run(`crearGenerador(99).oleada(${wave},ENTRADAS).every(e=>{
      const b=TIPOS_MALWARE[e.tipo]; const v=e.velocidad/(b.velocidad*Math.min(1.68,1+(${wave}-1)*.075));
      const h=e.vida/(b.vida*(1+(${wave}-1)*.19)); return v>=.88&&v<=1.12&&h>=.88&&h<=1.12;
    })`),`oleada ${wave}: variación acotada a ±12%`);
  }
  run('iniciarPartida()');
  ok(run('estado === "transicion" && partida.jugador.vida === 100'),'inicio limpio con transición');
  run('actualizar(3.01)');
  ok(run('estado === "jugando"'),'transición inicia el combate');
  e.handlers.keydown({code:'KeyD',target:{},preventDefault(){}});
  run('actualizar(.1)'); e.handlers.keyup({code:'KeyD'});
  ok(run('partida.jugador.x === 1224.5'),'evento D mueve al antivirus');
  run('partida.jugador.x=1200;partida.jugador.y=800;teclas.add("KeyD");teclas.add("KeyS");actualizar(.1);limpiarEntrada()');
  ok(run('Math.abs(Math.hypot(partida.jugador.x-1200,partida.jugador.y-800)-24.5)<.001'),'diagonal tiene la misma velocidad');
  run('pausar();const antes=partida.tiempo;actualizar(1)');
  ok(run('estado === "pausa" && partida.tiempo === antes'),'pausa congela la simulación');
  run('continuar();partida.creditos=60;partida.puntos=60;partida.jugador.x=1200;partida.jugador.y=800;actualizar(.01)');
  ok(run('partida.dentroZona && partida.jugador.mejorado && partida.creditos===0 && partida.puntos===60'),'zona compra mejora sin restar récord');
  run('disparar()');
  ok(run('partida.balas.length===0'),'la zona segura bloquea disparos para evitar abuso');
  run('partida.jugador.x=1000;partida.jugador.y=800;actualizarZona();mouse.x=1100;mouse.y=800;disparar()');
  ok(run('Math.abs(partida.jugador.disparoEn-.23/1.5)<.00001'),'mejora aumenta la cadencia exactamente 50%');
  run('partida.creditos=60;actualizar(.1)');
  ok(run('partida.creditos===60'),'la mejora no se cobra dos veces');
  run('partida.jugador.x=1200;partida.jugador.y=800;actualizarZona();partida.enemigos=[{...TIPOS_MALWARE.virus,tipo:"virus",x:1200,y:800,vidaMax:36,velocidad:0,golpe:0}];actualizar(.1)');
  ok(run('partida.jugador.vida===100'),'zona segura impide daño sin límite de tiempo');
  run('partida.enemigos=[];partida.jugador.x=1000;partida.jugador.y=800;actualizarZona();partida.enemigos=[{...TIPOS_MALWARE.virus,tipo:"virus",x:1000,y:800,vidaMax:36,velocidad:0,golpe:0}];actualizar(.01)');
  ok(run('partida.jugador.vida===84'),'fuera de la zona las colisiones dañan');
  run('actualizar(.1)');
  ok(run('partida.jugador.vida===84'),'invulnerabilidad evita daño cada fotograma');
  run('iniciarPartida();actualizar(3.01);partida.jugador.x=1000;partida.jugador.y=800;actualizarZona();partida.plan=[{apareceEn:9999}];partida.enemigos=[{...TIPOS_MALWARE.gusano,tipo:"gusano",x:1050,y:800,vida:18,vidaMax:18,velocidad:0,golpe:0}];mouse.x=1050;mouse.y=800;disparar();actualizar(.05)');
  ok(run('partida.enemigos.length===0 && partida.puntos===15 && partida.bajas===1'),'bala mata, suma puntos y registra baja');
  ok(run('partida.particulas.length>0 && partida.textos.length>0'),'baja genera partículas y texto flotante');
  ok(run('distanciaSegmento(50,0,0,0,100,0)===0'),'colisión continua evita atravesar enemigos');
  for(let wave=2;wave<=10;wave++){run('partida.enemigos=[];partida.plan=[];partida.siguiente=0;actualizar(.01)');ok(run(`estado==="transicion" && partida.oleada===${wave}`),`limpiar avanza a oleada ${wave}`);run('actualizar(3.01)');}
  run('partida.enemigos=[];partida.plan=[];partida.siguiente=0;actualizar(.01)');
  await new Promise(r=>setTimeout(r,0));
  ok(run('estado==="fin"')&&e.elements.get('end-title').textContent==='RED RECUPERADA.','victoria al terminar diez oleadas');
  ok(e.elements.get('ranking-list').children.length===1,'victoria guarda y muestra ranking');
  const seed=run('partida.semilla');
  e.elements.get('retry-button').handlers.click();
  ok(run('partida.puntos===0 && partida.jugador.vida===100 && partida.oleada===1 && !partida.jugador.mejorado && partida.enemigos.length===0'),'Reintentar restablece la partida completa sin navegación');
  ok(seed!==run('partida.semilla'),'Reintentar renueva la semilla');
  run('actualizar(3.01);partida.jugador.x=1000;partida.jugador.y=800;actualizarZona();partida.jugador.vida=1;partida.enemigos=[{...TIPOS_MALWARE.troyano,tipo:"troyano",x:1000,y:800,velocidad:0,vidaMax:88,golpe:0}];actualizar(.01)');
  await new Promise(r=>setTimeout(r,0));
  ok(run('estado==="fin" && partida.jugador.vida===0')&&e.elements.get('end-title').textContent==='SISTEMA COMPROMETIDO.','derrota por integridad cero');
  ok(run('leerRankingLocal().length===2'),'exactamente un registro por partida terminada');
  e.elements.get('menu-button').handlers.click();
  ok(run('estado==="inicio" && partida===null'),'regreso al inicio restablece la vista');

  for(let i=0;i<7;i++) await run(`guardarPuntaje('Equipo ${i}',${i*100})`);
  const top=await run('obtenerTop5()');
  ok(top.origen==='local'&&top.puntajes.length===5&&top.puntajes[0].score===600,'top 5 local ordenado');
  const blocked=environment({storageFails:true});
  await blocked.run('guardarPuntaje("Memoria",42)');
  const memory=await blocked.run('obtenerTop5()');
  ok(memory.puntajes[0].score===42&&!memory.persistente,'almacenamiento bloqueado conserva ranking en memoria');
  const corrupted=environment({corrupt:true});
  await corrupted.run('guardarPuntaje("Recuperado",33)');
  ok((await corrupted.run('obtenerTop5()')).puntajes[0].score===33,'JSON local corrupto se recupera');
  const calls=[];
  const online=environment({configured:true,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>[{name:'Online',score:250,created_at:'2026-09-22'}]};
  }});
  ok((await online.run('guardarPuntaje("Online",250)')).origen==='en línea','POST remoto exitoso');
  ok((await online.run('obtenerTop5()')).origen==='en línea','GET remoto exitoso');
  ok(calls[0].options.headers.apikey==='sb_publishable_test'&&!calls[0].options.headers.Authorization,'clave pública nueva usa apikey sin Bearer inválido');
  ok(JSON.parse(calls[0].options.body).score===250&&calls[1].url.includes('limit=5'),'contrato REST envía puntaje y solicita top 5');
  const offline=environment({configured:true});
  ok((await offline.run('guardarPuntaje("Offline",80)')).origen==='local','error de red cae a local');
  ok((await offline.run('obtenerTop5()')).puntajes[0].score===80,'ranking sin conexión conserva resultado');
  const rejected=environment({configured:true,fetchImpl:async()=>({ok:false,status:403})});
  ok((await rejected.run('guardarPuntaje("RLS",12)')).origen==='local','error HTTP/RLS cae a local');
  const malformed=environment({configured:true,fetchImpl:async()=>({ok:true,json:async()=>({error:'bad'})})});
  ok((await malformed.run('obtenerTop5()')).origen==='local','respuesta remota inválida cae a local');
  const timeout=environment({configured:true,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))))});
  const before=Date.now();
  ok((await timeout.run('guardarPuntaje("Timeout",10)')).origen==='local'&&Date.now()-before<5000,'petición colgada aborta y cae a local en 4 segundos');
  run('mostrarRanking({puntajes:[{name:"<img src=x onerror=alert(1)>",score:5}],origen:"local",persistente:true},{origen:"local"})');
  ok(e.elements.get('ranking-list').children[0].children[0].textContent.startsWith('<img'),'nombre no confiable se inserta como texto');
  console.log(`\n${checks} verificaciones aprobadas.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
