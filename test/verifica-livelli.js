#!/usr/bin/env node
/*
 * Verifica del catalogo e del motore (Node, nessuna dipendenza).
 * Uso: node test/verifica-livelli.js
 *
 * Per ogni livello e per ogni livello di riserva:
 *  - n boschetti, ognuno connesso (caselle unite per un lato)
 *  - la soluzione rispetta le regole: un panda per riga, colonna, boschetto,
 *    nessun contatto nemmeno in diagonale
 *  - soluzione UNICA (conteggio con limite 2) e uguale a quella registrata
 *  - riproducibilità: generaLivello(n, seed) restituisce lo stesso livello
 *  - fascia coerente con la stima del motore
 *  - livelli tutti diversi
 *  - suggerimenti corretti: percorrendo tutta la catena logica ogni panda
 *    suggerito è nella soluzione, nessuna esclusione tocca una casella della
 *    soluzione, e la catena arriva fino in fondo
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../src/motore.js');

const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dati', 'livelli.json'), 'utf8'));
let errori = 0;
const sbaglio = m => { errori++; if (errori < 30) console.error('ERRORE', m); };

function controlla(l, et) {
  const n = l.n, g = M.geometria(n);
  const zone = l.zone.split('').map(c => M.NOMI_ZONA.indexOf(c));
  const sol = l.soluzione.split(',').map(Number);
  if (zone.length !== n * n || zone.some(z => z < 0 || z >= n)) { sbaglio(et + ': boschetti non validi'); return; }
  for (let z = 0; z < n; z++) {
    const celle = []; zone.forEach((x, p) => { if (x === z) celle.push(p); });
    if (!celle.length) { sbaglio(et + ': boschetto vuoto'); continue; }
    const visto = new Set([celle[0]]), coda = [celle[0]];
    while (coda.length) { const a = coda.pop(); g.LATI[a].forEach(b => { if (zone[b] === z && !visto.has(b)) { visto.add(b); coda.push(b); } }); }
    if (visto.size !== celle.length) sbaglio(et + ': boschetto ' + M.NOMI_ZONA[z] + ' spezzato');
  }
  if (new Set(sol).size !== n) sbaglio(et + ': due panda nella stessa colonna');
  if (new Set(sol.map((c, r) => zone[r * n + c])).size !== n) sbaglio(et + ': due panda nello stesso boschetto');
  for (let r = 1; r < n; r++) if (Math.abs(sol[r] - sol[r - 1]) < 2) sbaglio(et + ': panda che si toccano');
  const conta = M.contaSoluzioni(n, zone, 2);
  if (conta.conteggio !== 1) sbaglio(et + ': soluzioni trovate ' + conta.conteggio);
  else if (conta.soluzione.join() !== sol.join()) sbaglio(et + ': soluzione diversa da quella registrata');
  const rig = M.generaLivello(n, l.seed);
  if (!rig || rig.zone.join() !== zone.join() || rig.soluzione.join() !== sol.join()) sbaglio(et + ': non riproducibile dal seed ' + l.seed);
  const val = M.valuta(n, zone);
  if (M.fasciaDi(val) !== l.fascia) sbaglio(et + ': fascia ' + l.fascia + ' ma la stima dice ' + M.fasciaDi(val));
  // catena dei suggerimenti
  const solCella = new Set(sol.map((c, r) => r * n + c)), stato = new Array(n * n).fill(0);
  let piazzati = 0;
  for (let k = 0; k < 400 && piazzati < n; k++) {
    const passo = M.prossimoPasso(n, zone, stato);
    if (!passo) { sbaglio(et + ': i suggerimenti si fermano prima della fine'); break; }
    if (!passo.testo || passo.testo.length < 30) sbaglio(et + ': spiegazione mancante');
    if (passo.tipo === 'piazza') { if (!solCella.has(passo.cella)) { sbaglio(et + ': panda suggerito nel posto sbagliato'); break; } stato[passo.cella] = 2; piazzati++; }
    else { if (passo.celle.some(p => solCella.has(p))) { sbaglio(et + ': esclusione sbagliata (' + passo.tecnica + ')'); break; } passo.celle.forEach(p => { stato[p] = 1; }); }
  }
}

const inizio = Date.now();
let totale = 0;
const viste = new Set();
cat.capitoli.forEach(c => {
  const per = {};
  c.livelli.forEach(l => {
    totale++;
    if (l.id !== totale) sbaglio('numerazione interrotta al livello ' + totale);
    controlla(l, 'Livello ' + l.id);
    per[l.fascia] = (per[l.fascia] || 0) + 1;
    viste.add(l.n + ':' + l.zone);
  });
  c.riserva.forEach((l, i) => { controlla(l, c.n + '×' + c.n + ' riserva ' + (i + 1)); viste.add(l.n + ':' + l.zone); });
  console.log('  ' + c.n + '×' + c.n + ': ' + c.livelli.length + ' livelli ' + JSON.stringify(per) + ' + ' + c.riserva.length + ' di riserva');
});
const conRiserva = totale + cat.capitoli.reduce((a, c) => a + c.riserva.length, 0);
if (viste.size !== conRiserva) sbaglio('livelli ripetuti');
if (totale < 1000) sbaglio('meno di 1000 livelli');
console.log('Livelli verificati: ' + totale + ' (+ ' + (conRiserva - totale) + ' di riserva), tutti diversi: ' + (viste.size === conRiserva) + ', in ' + ((Date.now() - inizio) / 1000).toFixed(1) + ' s');
if (errori) { console.error(errori + ' errori'); process.exit(1); }
console.log('Tutto in ordine: soluzione unica, regole rispettate, riproducibili dal seed, suggerimenti corretti fino all’ultimo panda.');
