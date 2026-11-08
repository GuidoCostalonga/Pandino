#!/usr/bin/env node
/*
 * Verifica del catalogo e del motore (Node, nessuna dipendenza).
 * Uso: node test/verifica-livelli.js
 *
 * Per ogni livello e per ogni livello di riserva, su 4×4, 6×6 e 9×9:
 *  - soluzione completa e valida (AllDifferent su righe, colonne, blocchi)
 *  - indizi coerenti con la soluzione
 *  - soluzione UNICA secondo DLX e secondo MRV con Forward Checking (i due
 *    risolutori devono concordare) e uguale a quella registrata
 *  - riproducibilità: generaPuzzle(n, seed, minimo) restituisce lo stesso puzzle
 *  - fascia coerente con la stima del motore
 *  - livelli distinti anche rinominando i panda (forma canonica)
 *  - suggerimenti corretti: ogni panda suggerito coincide con la soluzione e
 *    nessuna eliminazione toglie il valore giusto
 * Panda Pop: partite simulate fino alla vittoria, controllando che la griglia
 * resti sempre completabile e che il vassoio abbia sempre una tessera posabile.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../src/motore.js');

const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dati', 'livelli.json'), 'utf8'));
let errori = 0;
const sbaglio = msg => { errori++; if (errori < 30) console.error('ERRORE', msg); };
const canonica = t => { const m = {}; let k = 0; return t.split('').map(c => c === '0' ? '0' : (m[c] || (m[c] = String(++k)))).join(''); };

function controlla(l, etichetta) {
  const n = l.n, geo = M.geometria(n);
  const g = M.daTesto(l.soluzione);
  if (l.soluzione.length !== geo.N || !geo.UNITA.every(u => new Set(u.map(p => g[p])).size === n && u.every(p => g[p] >= 1 && g[p] <= n))) sbaglio(etichetta + ': soluzione non valida');
  for (let p = 0; p < geo.N; p++) if (l.puzzle[p] !== '0' && l.puzzle[p] !== l.soluzione[p]) { sbaglio(etichetta + ': indizio incoerente'); break; }
  const pz = M.daTesto(l.puzzle);
  const a = M.contaSoluzioniDLX(geo, pz, 2), b = M.contaSoluzioniMRV(geo, pz, 2);
  if (a.conteggio !== 1) sbaglio(etichetta + ': DLX trova ' + a.conteggio + ' soluzioni');
  if (b.conteggio !== 1) sbaglio(etichetta + ': MRV trova ' + b.conteggio + ' soluzioni');
  if (a.soluzione && M.aTesto(a.soluzione) !== l.soluzione) sbaglio(etichetta + ': soluzione DLX diversa');
  if (b.soluzione && M.aTesto(b.soluzione) !== l.soluzione) sbaglio(etichetta + ': soluzione MRV diversa');
  const r = M.generaPuzzle(n, l.seed, { minimoIndizi: l.minimoIndizi });
  if (M.aTesto(r.puzzle) !== l.puzzle || M.aTesto(r.soluzione) !== l.soluzione) sbaglio(etichetta + ': non riproducibile dal seed ' + l.seed);
  const val = M.valuta(geo, pz);
  if (M.fasciaDi(n, val, l.indizi) !== l.fascia) sbaglio(etichetta + ': fascia ' + l.fascia + ' ma la stima dice ' + M.fasciaDi(n, val, l.indizi));
  const valori = pz.slice(), cand = M.candidatiBase(geo, valori);
  for (let k = 0; k < 3000; k++) {
    const passo = M.prossimoPasso(geo, valori, cand);
    if (!passo) break;
    if (passo.tipo === 'piazza' && passo.valore !== g[passo.cella]) { sbaglio(etichetta + ': suggerimento errato ' + passo.tecnica); break; }
    if (passo.tipo === 'elimina' && passo.eliminazioni.some(e => g[e.cella] === e.valore)) { sbaglio(etichetta + ': eliminazione errata ' + passo.tecnica); break; }
    if (!passo.testo || passo.testo.length < 20) sbaglio(etichetta + ': spiegazione mancante');
    M.applicaPasso(geo, valori, cand, passo);
  }
}

/** Partita Panda Pop simulata con mosse casuali ma valide. */
function simulaPop(l, seedGioco) {
  const geo = M.geometria(l.n), val = M.daTesto(l.puzzle), ini = val.map(v => v ? 1 : 0);
  const rnd = M.generatore(seedGioco);
  let generati = 0, mosse = 0, rinnovi = 0, gruppi = 0;
  let vassoio = [];
  const nuovo = () => { generati++; vassoio = M.generaVassoio(geo, val, M.generatore(l.seed * 31 + 7919 * generati), 3); };
  nuovo();
  while (ini.some(x => x) && mosse < 4000) {
    if (!M.completabile(geo, val)) return { ok: false, motivo: 'griglia non completabile' };
    if (!vassoio.length) return { ok: false, motivo: 'vassoio vuoto' };
    // tutte le posizioni valide di tutte le tessere; si preferisce una che fa scoppiare
    const valide = [];
    vassoio.forEach((t, i) => { for (let a = 0; a < geo.N; a++) { const r = M.provaTessera(geo, val, t, a); if (r.ok) valide.push({ i, r, sat: M.unitaSature(geo, r.griglia, r.celle).length }); } });
    if (!valide.length) { rinnovi++; nuovo(); if (rinnovi > 500) return { ok: false, motivo: 'troppi rinnovi' }; continue; }
    const migliori = valide.filter(v => v.sat === Math.max(...valide.map(x => x.sat)));
    const scelta = rnd() < 0.7 ? migliori[Math.floor(rnd() * migliori.length)] : valide[Math.floor(rnd() * valide.length)];
    const t = vassoio[scelta.i];
    scelta.r.celle.forEach((p, k) => { val[p] = t.valori[k]; });
    vassoio.splice(scelta.i, 1);
    const sature = M.unitaSature(geo, val, scelta.r.celle);
    gruppi += sature.length;
    sature.forEach(u => geo.UNITA[u].forEach(q => { val[q] = 0; ini[q] = 0; }));
    if (!vassoio.length) nuovo();
    mosse++;
  }
  return { ok: !ini.some(x => x), mosse, rinnovi, gruppi, motivo: 'troppe mosse' };
}

const inizio = Date.now();
const riepilogo = [];
for (const n of Object.keys(cat.griglie).map(Number)) {
  const { livelli, riserva } = cat.griglie[n];
  livelli.forEach((l, i) => { if (l.id !== i + 1) sbaglio(n + '×' + n + ': numerazione interrotta al ' + (i + 1)); });
  const tutti = livelli.concat(riserva);
  const can = new Set(tutti.map(l => canonica(l.puzzle)));
  if (can.size !== tutti.length) sbaglio(n + '×' + n + ': livelli che differiscono solo per i nomi dei panda');
  const per = {};
  livelli.forEach(l => { controlla(l, n + '×' + n + ' livello ' + l.id); per[l.fascia] = (per[l.fascia] || 0) + 1; });
  riserva.forEach((l, i) => controlla(l, n + '×' + n + ' riserva ' + (i + 1)));
  riepilogo.push(n + '×' + n + ': ' + livelli.length + ' livelli ' + JSON.stringify(per) + ', riserva ' + riserva.length + ', distinti ' + can.size);
}
if (cat.griglie[9].livelli.length < 1000) sbaglio('meno di 1000 livelli 9×9');
console.log('Catalogo verificato in ' + ((Date.now() - inizio) / 1000).toFixed(1) + ' s');
riepilogo.forEach(r => console.log('  ' + r));

// Panda Pop
const t0 = Date.now();
const campione = [[4, [1, 50, 100]], [6, [1, 100, 200]], [9, [1, 250, 500, 750, 1000]]];
let vinte = 0, giocate = 0;
campione.forEach(([n, ids]) => ids.forEach(id => {
  const l = cat.griglie[n].livelli[id - 1];
  const r = simulaPop(l, id * 13 + n);
  giocate++;
  if (r.ok) vinte++; else sbaglio('Panda Pop ' + n + '×' + n + ' livello ' + id + ': ' + r.motivo);
  console.log('  Panda Pop ' + n + '×' + n + ' livello ' + id + ': ' + (r.ok ? 'vinta in ' + r.mosse + ' pose, ' + r.gruppi + ' gruppi scoppiati, ' + r.rinnovi + ' rinnovi' : 'NON completata'));
}));
console.log('Panda Pop: ' + vinte + ' partite simulate su ' + giocate + ' arrivate alla vittoria (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');

if (errori) { console.error(errori + ' errori'); process.exit(1); }
console.log('Tutto in ordine.');
