"use strict";

// Mulberry32 convierte una semilla en una secuencia repetible de números [0, 1).
// La misma semilla permite explicar y reproducir exactamente una oleada.
function mulberry32(semilla) {
  return function () {
    let valor = semilla += 0x6D2B79F5;
    valor = Math.imul(valor ^ valor >>> 15, valor | 1);
    valor ^= valor + Math.imul(valor ^ valor >>> 7, valor | 61);
    return ((valor ^ valor >>> 14) >>> 0) / 4294967296;
  };
}

let ultimaSemilla = 0;
function nuevaSemilla() {
  const datos = new Uint32Array(1);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(datos);
  } else {
    datos[0] = (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  }
  // Incluso si el azar repite un valor, dos partidas seguidas serán diferentes.
  if (datos[0] === ultimaSemilla) datos[0] = (datos[0] + 1) >>> 0;
  ultimaSemilla = datos[0];
  return datos[0];
}

const TIPOS_MALWARE = Object.freeze({
  virus: { velocidad: 76, vida: 36, radio: 15, puntos: 10, color: "#f17469" },
  gusano: { velocidad: 128, vida: 18, radio: 12, puntos: 15, color: "#ff943d" },
  troyano: { velocidad: 48, vida: 88, radio: 21, puntos: 25, color: "#c397eb" }
});

function crearGenerador(semilla) {
  const azar = mulberry32(semilla);
  const entre = (min, max) => min + azar() * (max - min);
  return {
    oleada(numero, ancho, alto) {
      const cantidad = [10, 16, 23][numero - 1];
      if (!cantidad) throw new Error("La oleada debe estar entre 1 y 3.");
      const tipos = Object.keys(TIPOS_MALWARE);
      let tiempo = 0;
      return Array.from({ length: cantidad }, (_, indice) => {
        // Rotamos los tipos para garantizar las tres amenazas en cada oleada.
        const tipo = tipos[indice < 3 ? indice : Math.floor(azar() * 3)];
        const base = TIPOS_MALWARE[tipo];
        const borde = Math.floor(azar() * 4);
        let x, y;
        if (borde < 2) { x = borde === 0 ? -24 : ancho + 24; y = entre(25, alto - 25); }
        else { x = entre(25, ancho - 25); y = borde === 2 ? -24 : alto + 24; }
        // Las oleadas tienen más enemigos, menos espera y mayores estadísticas.
        tiempo += entre(.85, 1.35) / (1 + (numero - 1) * .22);
        return { tipo, x, y, apareceEn: tiempo,
          velocidad: base.velocidad * (1 + (numero - 1) * .14) * entre(.88, 1.12),
          vida: base.vida * (1 + (numero - 1) * .20) * entre(.88, 1.12),
          fase: entre(0, Math.PI * 2) };
      });
    }
  };
}
