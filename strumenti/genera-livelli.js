#!/usr/bin/env node
/*
 * Prepara il catalogo dei livelli di Pandino: dati/livelli.json
 *
 * Pipeline per ogni livello (src/motore.js):
 *   1. matrice completa casuale (MRV + Forward Checking, seed riproducibile)
 *   2. scavo simmetrico: ogni rimozione resta solo se DLX trova una sola soluzione
 *   3. classificazione: rango della tecnica logica minima necessaria
 * Ogni livello è riproducibile con generaPuzzle(n, seed, { minimoIndizi }).
 *
 * Catalogo
 *   9×9  1.000 livelli: Facile 1–250, Medio 251–500, Difficile 501–750, Esperto 751–1000
 *   6×6    200 livelli: Facile 1–80, Medio 81–160, Difficile 161–200
 *   4×4    100 livelli: Facile
 *   Riserva: 10 livelli verificati per ogni fascia di ogni dimensione, usati
 *   se la generazione di una partita libera nel browser non termina in tempo.
 * Si scartano i puzzle che differiscono da uno già scelto solo per i nomi dei panda.
 *
 * Uso: node strumenti/genera-livelli.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../src/motore.js');

const PIANO = {
  9: { Facile: 250, Medio: 250, Difficile: 250, Esperto: 250 },
  6: { Facile: 80, Medio: 80, Difficile: 40 },
  4: { Facile: 100 }
};
// serie di seed: [base, minimoIndizi]; la prima serie dà puzzle con più indizi
// ogni serie riempie solo le fasce indicate
const SERIE = {
  9: [[100000, 34, ['Facile']], [1, 0, ['Medio', 'Difficile', 'Esperto']]],
  6: [[300000, 16, ['Facile']], [200000, 0, ['Medio', 'Difficile']]],
  4: [[500000, 8, ['Facile']], [600000, 6, ['Facile']], [400000, 0, ['Facile']]]
};
const RISERVA_PER_FASCIA = 10;

function canonica(testo) {
  const mappa = {}; let k = 0;
  return testo.split('').map(ch => ch === '0' ? '0' : (mappa[ch] || (mappa[ch] = String(++k)))).join('');
}

const visti = new Set();
function prova(n, seed, minimo) {
  const geo = M.geometria(n);
  const g = M.generaPuzzle(n, seed, { minimoIndizi: minimo });
  const testo = M.aTesto(g.puzzle), can = canonica(testo);
  if (visti.has(can)) return null;
  if (M.contaSoluzioniDLX(geo, g.puzzle, 2).conteggio !== 1) throw new Error('Soluzione non unica: n=' + n + ' seed=' + seed);
  const val = M.valuta(geo, g.puzzle);
  const fascia = M.fasciaDi(n, val, g.indizi);
  if (!fascia) return null;
  return {
    n, seed, minimoIndizi: minimo, fascia, puzzle: testo, soluzione: M.aTesto(g.soluzione), indizi: g.indizi,
    punteggio: val.punteggio, rango: val.rango, tecnica: M.tecnicaPrincipale(val), _can: can
  };
}

function riempi(n, secchi, quote, serieSeed, limite) {
  for (const [base, minimo, fasce] of serieSeed) {
    // per 4×4 le serie si alternano: ognuna dà al massimo un terzo dei livelli
    const tetto = n === 4 ? Math.ceil(quote.Facile / serieSeed.length) : Infinity;
    let presi = 0;
    for (let s = 1; s <= limite; s++) {
      if (fasce.every(f => secchi[f].length >= quote[f]) || presi >= tetto) break;
      const l = prova(n, base + s, minimo);
      if (l && fasce.indexOf(l.fascia) >= 0 && secchi[l.fascia].length < quote[l.fascia]) {
        presi++;
        visti.add(l._can);
        secchi[l.fascia].push(l);
      }
    }
  }
  const mancano = Object.keys(quote).filter(f => secchi[f].length < quote[f]);
  if (mancano.length) throw new Error('Livelli insufficienti per n=' + n + ': ' + mancano.join(', '));
}

const inizio = Date.now();
const uscita = { versione: 2, nota: 'Generato da strumenti/genera-livelli.js con src/motore.js', griglie: {} };
for (const n of [9, 6, 4]) {
  const quote = PIANO[n];
  const secchi = {}, riserva = {};
  Object.keys(quote).forEach(f => { secchi[f] = []; riserva[f] = []; });
  riempi(n, secchi, quote, SERIE[n], 400000);
  // riserva da seed distinti
  const quoteRiserva = {};
  Object.keys(quote).forEach(f => { quoteRiserva[f] = RISERVA_PER_FASCIA; });
  riempi(n, riserva, quoteRiserva, SERIE[n].map(([b, m, f]) => [b + 5000000, m, f]), 400000);
  const livelli = [];
  Object.keys(quote).forEach(f => {
    secchi[f].sort((a, b) => a.punteggio - b.punteggio || a.indizi - b.indizi || a.seed - b.seed);
    secchi[f].forEach(l => { delete l._can; livelli.push(Object.assign({ id: livelli.length + 1 }, l)); });
  });
  const ris = [];
  Object.keys(quote).forEach(f => riserva[f].forEach(l => { delete l._can; ris.push(l); }));
  uscita.griglie[n] = { livelli, riserva: ris };
  const stat = {};
  livelli.forEach(l => { const k = l.fascia + ' · ' + l.tecnica; stat[k] = (stat[k] || 0) + 1; });
  console.log(n + '×' + n + ':', livelli.length, 'livelli,', ris.length, 'di riserva', stat);
}
fs.mkdirSync(path.join(__dirname, '..', 'dati'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dati', 'livelli.json'), JSON.stringify(uscita));
console.log('Tempo:', ((Date.now() - inizio) / 1000).toFixed(1), 's');
