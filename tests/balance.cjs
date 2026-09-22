// Un jugador automático recorre el núcleo y dispara al enemigo más cercano.
// Solo cambia los controles: no altera daño, salud, enemigos ni puntos.
const assert = require('node:assert/strict');
const { environment } = require('./verify.cjs');
for (const seed of [42, 12345, 2026]) {
  const { run } = environment();
  run(`iniciarPartida(); partida.generador=crearGenerador(${seed}); partida.oleada=0; prepararOleada();`);
  const result = run(`(() => {
    const ruta=[[950,600],[1450,600],[1450,1000],[950,1000]];
    let destino=0,frames=0,recuperando=false;
    while(estado!=='fin' && frames<60*600) {
      if(estado==='jugando') {
        const j=partida.jugador;
        if(j.vida<48) recuperando=true;
        if(j.vida>92) recuperando=false;
        const punto=recuperando?[1200,800]:ruta[destino];
        if(!recuperando&&Math.hypot(j.x-punto[0],j.y-punto[1])<15) destino=(destino+1)%ruta.length;
        teclas.clear();
        if(j.x<punto[0]-5) teclas.add('KeyD');
        if(j.x>punto[0]+5) teclas.add('KeyA');
        if(j.y<punto[1]-5) teclas.add('KeyS');
        if(j.y>punto[1]+5) teclas.add('KeyW');
        const objetivo=partida.enemigos.reduce((a,b)=>!a||Math.hypot(b.x-j.x,b.y-j.y)<Math.hypot(a.x-j.x,a.y-j.y)?b:a,null);
        mouse.disparando=Boolean(objetivo)&&!recuperando;
        if(objetivo) {
          mouse.pantallaX=objetivo.x-partida.camara.x;
          mouse.pantallaY=objetivo.y-partida.camara.y;
          mouse.x=objetivo.x; mouse.y=objetivo.y;
        }
      }
      actualizar(1/60); frames++;
    }
    return {oleada:partida.oleada,vida:partida.jugador.vida,bajas:partida.bajas,puntos:partida.puntos,segundos:Math.round(partida.tiempo)};
  })()`);
  console.log('Semilla',seed,JSON.stringify(result));
  assert.equal(result.bajas,280,'Debe poder completar las diez oleadas usando solo controles');
  assert.ok(result.vida>0,'El balance permite sobrevivir');
}
