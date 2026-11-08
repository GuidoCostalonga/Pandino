#!/usr/bin/env node
/*
 * Prepara il catalogo dei livelli: dati/livelli.json
 *
 * Per ogni livello: disposizione casuale dei panda, crescita dei boschetti,
 * ritocco dei confini finché la soluzione è unica (src/motore.js).
 * Si tengono solo i livelli che le deduzioni logiche risolvono senza
 * tentativi: così il suggerimento trova sempre una mossa.
 * Ogni livello si rigenera identico con generaLivello(n, seed).
 *
 * Capitoli: 10×10 (450), 11×11 (350), 12×12 (250), per un totale di 1.050 livelli; dentro ogni capitolo i livelli vanno dal più
 * facile al più difficile. Più 5 livelli di riserva per dimensione.
 *
 * Uso: node strumenti/genera-livelli.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../src/motore.js');

const PIANO = [[10, 450], [11, 350], [12, 250]];
const RISERVA = 5;
const inizio = Date.now();
const visti = new Set();
const capitoli = [];
for (const [n, quanti] of PIANO) {
  const scelti = [], riserva = [];
  for (let s = 1; scelti.length < quanti || riserva.length < RISERVA; s++) {
    const seed = n * 1000003 + s;
    const l = M.generaLivello(n, seed);
    if (!l) continue;
    const chiave = l.zone.map(z => M.NOMI_ZONA[z]).join('');
    if (visti.has(chiave)) continue;
    const val = M.valuta(n, l.zone);
    const fascia = M.fasciaDi(val);
    if (!fascia) continue;
    visti.add(chiave);
    const voce = { n, seed, zone: chiave, soluzione: l.soluzione.join(','),
      fascia, rango: val.rango, punteggio: val.punteggio };
    if (scelti.length < quanti) scelti.push(voce); else riserva.push(voce);
    if (s > 200000) throw new Error('Troppi tentativi per n=' + n);
  }
  scelti.sort((a, b) => a.rango - b.rango || a.punteggio - b.punteggio || a.seed - b.seed);
  capitoli.push({ n, livelli: scelti, riserva });
  const d = {}; scelti.forEach(l => { d[l.fascia] = (d[l.fascia] || 0) + 1; });
  console.log(n + '×' + n + ':', scelti.length, 'livelli', JSON.stringify(d));
}
let id = 0;
capitoli.forEach(c => c.livelli.forEach(l => { l.id = ++id; }));
fs.writeFileSync(path.join(__dirname, '..', 'dati', 'livelli.json'), JSON.stringify({ versione: 3, capitoli }));
console.log('Totale', id, 'livelli in', ((Date.now() - inizio) / 1000).toFixed(1), 's');
