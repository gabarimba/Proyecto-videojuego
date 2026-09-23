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
  // El aumento es moderado: entre 6% y 8% frente al balance anterior.
  virus: { velocidad: 82, vida: 36, radio: 15, puntos: 10, color: "#f17469" },
  gusano: { velocidad: 136, vida: 18, radio: 12, puntos: 15, color: "#ff943d" },
  // Su cuerpo sigue siendo grande para disparos y daño; al caminar usa un
  // círculo algo menor para no rozar los marcos de las puertas.
  troyano: { velocidad: 52, vida: 88, radio: 21, radioMovimiento: 18, puntos: 25, color: "#c397eb" }
});

function crearGenerador(semilla) {
  const azar = mulberry32(semilla);
  const entre = (min, max) => min + azar() * (max - min);
  return {
    oleada(numero, puntosAparicion) {
      if (!Number.isInteger(numero) || numero < 1) throw new Error("La oleada debe ser un entero positivo.");
      if (!Array.isArray(puntosAparicion) || puntosAparicion.length === 0) {
        throw new Error("El mapa necesita puntos de aparición.");
      }
      // Hay diez rondas: cada una añade cuatro amenazas, hasta llegar a 46.
      const cantidad = Math.min(10 + (numero - 1) * 4, 46);
      const tipos = Object.keys(TIPOS_MALWARE);
      let tiempo = 0;
      return Array.from({ length: cantidad }, (_, indice) => {
        // Rotamos los tipos para garantizar las tres amenazas en cada oleada.
        const tipo = tipos[indice < 3 ? indice : Math.floor(azar() * 3)];
        const base = TIPOS_MALWARE[tipo];
        const entrada = puntosAparicion[Math.floor(azar() * puntosAparicion.length)];
        // Variar unos píxeles cada entrada hace que no aparezcan todos apilados.
        const x = entrada.x + entre(-22, 22);
        const y = entrada.y + entre(-22, 22);
        // Cada ronda reduce la espera. Se limita para conservar claridad visual.
        tiempo += entre(.72, 1.12) / Math.min(1.9, 1 + (numero - 1) * .10);
        const factorVelocidad = Math.min(1.68, 1 + (numero - 1) * .075);
        const factorVida = 1 + (numero - 1) * .19;
        return { tipo, x, y, apareceEn: tiempo,
          velocidad: base.velocidad * factorVelocidad * entre(.88, 1.12),
          vida: base.vida * factorVida * entre(.88, 1.12),
          fase: entre(0, Math.PI * 2) };
      });
    }
  };
}
