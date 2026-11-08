#!/usr/bin/env node
/*
 * Costruisce dist/index.html: un solo file con HTML, CSS, JavaScript e il
 * catalogo dei livelli, senza nessuna risorsa caricata da Internet.
 * Uso: node strumenti/costruisci.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const radice = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(radice, f), 'utf8');
const M = require('../src/motore.js');

const catalogo = JSON.parse(leggi('dati/livelli.json'));
const riga = l => [l.zone, l.soluzione, M.FASCE.indexOf(l.fascia), l.punteggio, l.seed];
const dati = JSON.stringify({ c: catalogo.capitoli.map(c => [c.n, c.livelli.map(riga), c.riserva.map(riga)]) });

// i segnaposto si sostituiscono con funzioni, così i caratteri "$" del codice restano intatti
let html = leggi('src/pagina.html')
  .replace('/*STILE*/', () => leggi('src/stile.css'))
  .replace('/*MOTORE*/', () => leggi('src/motore.js'))
  .replace('/*PANDA*/', () => leggi('src/panda.js'))
  .replace('/*DATI*/', () => dati.replace(/</g, '\\u003c'))
  .replace('/*APP*/', () => leggi('src/app.js'));
if (/<\/script>/i.test(leggi('src/motore.js') + leggi('src/app.js') + leggi('src/panda.js'))) throw new Error('Il codice contiene </script>');
fs.mkdirSync(path.join(radice, 'dist'), { recursive: true });
fs.writeFileSync(path.join(radice, 'dist', 'index.html'), html);
const conti = catalogo.capitoli.map(c => c.n + '×' + c.n + ' ' + c.livelli.length).join(', ');
console.log('dist/index.html:', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB ·', conti);
