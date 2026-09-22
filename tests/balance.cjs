// Un jugador automático recorre un rectángulo y dispara al enemigo más cercano.
// Solo cambia los controles: no altera daño, salud, enemigos ni puntos.
const assert = require('node:assert/strict');
const { environment } = require('./verify.cjs');
for (const seed of [42, 12345, 2026]) {
  const { run } = environment();
  run(`iniciarPartida(); partida.generador=crearGenerador(${seed}); partida.oleada=0; prepararOleada();`);
  const result = run(`(() => {
    const ruta=[[170,130],[830,130],[830,500],[170,500]];
    let destino=0,frames=0;
    while(estado!=='fin' && frames<60*240) {
      if(estado==='jugando') {
        const j=partida.jugador;
        if(Math.hypot(j.x-ruta[destino][0],j.y-ruta[destino][1])<15) destino=(destino+1)%ruta.length;
        teclas.clear();
        if(j.x<ruta[destino][0]-5) teclas.add('KeyD');
        if(j.x>ruta[destino][0]+5) teclas.add('KeyA');
        if(j.y<ruta[destino][1]-5) teclas.add('KeyS');
        if(j.y>ruta[destino][1]+5) teclas.add('KeyW');
        const objetivo=partida.enemigos.reduce((a,b)=>!a||Math.hypot(b.x-j.x,b.y-j.y)<Math.hypot(a.x-j.x,a.y-j.y)?b:a,null);
        mouse.disparando=Boolean(objetivo);
        if(objetivo) {mouse.x=objetivo.x;mouse.y=objetivo.y;}
      }
      actualizar(1/60); frames++;
    }
    return {oleada:partida.oleada,vida:partida.jugador.vida,bajas:partida.bajas,puntos:partida.puntos,segundos:Math.round(partida.tiempo)};
  })()`);
  console.log('Semilla',seed,JSON.stringify(result));
  assert.equal(result.bajas,49,'Debe poder completar las tres oleadas usando solo controles');
  assert.ok(result.vida>0,'El balance permite sobrevivir');
}
