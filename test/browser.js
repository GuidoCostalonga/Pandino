#!/usr/bin/env node
/*
 * Collaudo nel browser con Playwright (Chromium).
 * Uso: node test/browser.js [indirizzo]
 * Senza indirizzo avvia un piccolo server locale su dist/.
 * Con un indirizzo (per esempio https://costalonga.org/pandino/) collauda la pagina pubblicata.
 * Le schermate finiscono in collaudo/ (o nella cartella indicata da FOTO).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const FOTO = process.env.FOTO || path.join(__dirname, '..', 'collaudo');
fs.mkdirSync(FOTO, { recursive: true });
const esiti = []; let falliti = 0;
const ok = (c, d) => { esiti.push((c ? '✔ ' : '✘ ') + d); if (!c) falliti++; };
const foto = (p, nome, intera) => p.screenshot({ path: path.join(FOTO, nome + '.png'), fullPage: !!intera });

function server() {
  return new Promise(res => {
    const s = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(path.join(__dirname, '..', 'dist', 'index.html')).pipe(r); });
    s.listen(0, () => res(s));
  });
}
async function pagina(browser, opz, errori) {
  const ctx = await browser.newContext(opz);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });
  p.on('pageerror', e => errori.push(e.message));
  return { ctx, p };
}
const stato = p => p.evaluate(() => window.Pandino.partita());
const liv = (p, n, id) => p.evaluate(([n, id]) => window.Pandino.livello(n, id), [n, id]);
const vuote = s => [...s].map((c, i) => c === '0' ? i : -1).filter(i => i >= 0);
async function riempi(p, celle, sol) { for (const q of celle) { await p.click(`.cella[data-p="${q}"]`); await p.keyboard.press(sol[q]); } }
async function apri(p, base, modo, n) {
  await p.goto(base);
  await p.click(`[data-modo="${modo}"]`);
  await p.click(`.taglie [data-n="${n}"]`);
  await p.click('#btn-continua');
  await p.waitForSelector('#s-gioco:not([hidden])');
}
/** Gioca Panda Pop seguendo il suggerimento fino alla vittoria (o a un limite di mosse). */
async function giocaPop(p, limite) {
  for (let k = 0; k < limite; k++) {
    const s = await stato(p);
    if (s.finita) return true;
    await p.click('#btn-suggerimento');
    await p.click('#messaggio .btn.primario');
    await p.waitForTimeout(30);
  }
  return (await stato(p)).finita;
}

(async () => {
  let srv = null, base = process.argv[2];
  if (!base) { srv = await server(); base = 'http://localhost:' + srv.address().port + '/'; }
  const browser = await chromium.launch();
  const errori = [];

  // ================================================== computer: struttura e indicizzazione
  const { ctx, p } = await pagina(browser, { viewport: { width: 1280, height: 900 } }, errori);
  const risp = await p.goto(base);
  ok(risp.status() === 200, 'La pagina risponde 200 (' + base + ')');
  ok(await p.getAttribute('meta[name="robots"]', 'content') === 'noindex, nofollow', 'Meta robots «noindex, nofollow»');
  esiti.push('ℹ Header X-Robots-Tag: ' + (risp.headers()['x-robots-tag'] || 'assente (GitHub Pages non permette header personalizzati)'));
  const conti = await p.evaluate(() => [4, 6, 9].map(n => window.Pandino.livelli(n)));
  ok(conti[2] >= 1000, 'Livelli disponibili: 4×4 ' + conti[0] + ', 6×6 ' + conti[1] + ', 9×9 ' + conti[2]);
  const esterni = await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => !/^(data|blob):/.test(n)));
  ok(esterni.length === 0, 'Nessuna risorsa caricata da Internet');
  await foto(p, '01-inizio', true);

  // ================================================== classico 9×9: tastiera, matita, aiuti, salvataggio
  await apri(p, base, 'c', 9);
  const l1 = await liv(p, 9, 1), v1 = vuote(l1.puzzle), primo = v1[0];
  ok((await stato(p)).n === 9 && (await stato(p)).id === 1, 'Classico 9×9: si apre il livello 1');
  await p.click(`.cella[data-p="${primo}"]`);
  await p.keyboard.press(primo % 9 < 8 ? 'ArrowRight' : 'ArrowLeft');
  ok((await stato(p)).sel === (primo % 9 < 8 ? primo + 1 : primo - 1), 'Le frecce spostano la selezione');
  await p.click(`.cella[data-p="${primo}"]`);
  const sbagliato = String(l1.soluzione[primo] === '9' ? 8 : +l1.soluzione[primo] + 1);
  await p.keyboard.press(sbagliato);
  ok(await p.$('.volante') !== null, 'Il panda vola dalla tavolozza alla casella (curva di Bézier)');
  await p.waitForTimeout(450);
  ok((await stato(p)).val[primo] === sbagliato, 'Il tasto numerico mette il panda');
  ok(await p.$eval(`.cella[data-p="${primo}"]`, el => el.classList.contains('sbagliata') || el.classList.contains('conflitto')), 'Il panda sbagliato viene segnalato (non solo con il colore)');
  const et = await p.getAttribute(`.cella[data-p="${primo}"]`, 'aria-label');
  ok(/Panda \d/.test(et) && /(conflitto|soluzione)/.test(et), 'Nome accessibile: «' + et + '»');
  await p.keyboard.press('Control+z');
  ok((await stato(p)).val[primo] === '0', 'Ctrl+Z annulla');
  await p.keyboard.press('Control+y');
  ok((await stato(p)).val[primo] === sbagliato, 'Ctrl+Y ripristina');
  await p.keyboard.press('Delete');
  ok((await stato(p)).val[primo] === '0', 'Canc svuota la casella');
  const iniz = [...l1.puzzle].findIndex(c => c !== '0');
  await p.click(`.cella[data-p="${iniz}"]`); await p.keyboard.press('Delete');
  ok((await stato(p)).val[iniz] === l1.puzzle[iniz], 'Le caselle iniziali non si modificano');
  await p.click(`.cella[data-p="${primo}"]`);
  await p.keyboard.press('m'); await p.keyboard.press('3'); await p.keyboard.press('7');
  ok(await p.$eval(`.cella[data-p="${primo}"] .note`, el => /3/.test(el.textContent) && /7/.test(el.textContent)), 'La matita scrive le note');
  await p.keyboard.press('7');
  ok(await p.$eval(`.cella[data-p="${primo}"] .note`, el => !/7/.test(el.textContent)), 'La matita toglie una nota');
  await p.keyboard.press('m');
  await p.check('#rapido-auto');
  ok(await p.$$eval('.note.auto', a => a.length) > 10, 'Candidati virtuali automatici visibili');
  await p.uncheck('#rapido-auto');
  await p.click('#btn-suggerimento');
  const msg = await p.textContent('#messaggio');
  ok(/Naked Single|Hidden Single|Pointing|Claiming|Pair|Triple|X-Wing|Swordfish/.test(msg), 'Il suggerimento spiega la tecnica: «' + msg.slice(0, 80) + '…»');
  const prima = (await stato(p)).val;
  await p.click('#messaggio .btn.primario');
  await p.waitForTimeout(450);
  const dopo = (await stato(p)).val, cambiata = [...dopo].findIndex((c, i) => c !== prima[i]);
  ok(cambiata >= 0 && dopo[cambiata] === l1.soluzione[cambiata], 'Il panda suggerito è giusto');
  await p.keyboard.press('Escape');
  ok((await stato(p)).sel === -1, 'Esc toglie la selezione');
  await p.click('#btn-pausa');
  ok(await p.isVisible('#velo-pausa'), 'La pausa nasconde la griglia');
  await p.click('#btn-riprendi');
  await foto(p, '02-classico-9x9');
  const salvato = (await stato(p)).val;
  await p.waitForTimeout(300);
  await p.reload();
  await p.click('#btn-continua');
  await p.waitForSelector('#s-gioco:not([hidden])');
  ok((await stato(p)).val === salvato, 'Dopo la riapertura la partita riprende da dove era');
  await riempi(p, vuote((await stato(p)).val), l1.soluzione);
  await p.waitForSelector('#d-vittoria[open]', { timeout: 8000 });
  ok(true, 'Classico 9×9: completando la griglia compare la vittoria');
  await foto(p, '03-vittoria');
  await p.click('#btn-vai-livelli');
  ok(await p.$eval('.livello-btn[data-id="1"]', b => b.classList.contains('completato')), 'Il livello 1 risulta completato');
  ok(await p.$eval('.livello-btn[data-id="4"]', b => b.disabled), 'Il livello 4 è ancora bloccato');
  ok(await p.$$eval('#pagine button', a => a.length) === 5, 'Paginazione: 5 pagine da 50 livelli per capitolo');
  ok(await p.$$eval('#capitoli button', a => a.length) === 4, 'Quattro capitoli: Facile, Medio, Difficile, Esperto');
  await p.fill('#cerca-livello', '600'); await p.click('#form-vai button');
  ok(/bloccato/.test(await p.textContent('#conteggio-livelli')), 'La ricerca porta al livello 600 e dice che è bloccato');
  await p.selectOption('#filtro', 'completati'); await p.click('#capitoli button >> nth=0');
  ok(await p.$$eval('.livello-btn', a => a.length) === 1, 'Il filtro «Completati» mostra un livello');
  await p.selectOption('#filtro', 'tutti');
  await foto(p, '04-livelli');
  await p.reload(); await p.click('#btn-livelli');
  ok(await p.$eval('.livello-btn[data-id="1"]', b => b.classList.contains('completato')), 'I progressi restano dopo la riapertura');

  // sblocco: completare 2 e 3 apre il 4
  for (const id of [2, 3]) {
    await p.click(`.livello-btn[data-id="${id}"]`);
    const l = await liv(p, 9, id);
    await riempi(p, vuote(l.puzzle), l.soluzione);
    await p.waitForSelector('#d-vittoria[open]', { timeout: 8000 });
    if (id === 3) ok(/Livello 4 sbloccato/.test(await p.textContent('#x-vittoria')), 'Completare il livello 3 sblocca il livello 4');
    await p.click('#btn-vai-livelli');
  }
  ok(await p.$eval('.livello-btn[data-id="4"]', b => !b.disabled), 'Il livello 4 ora è giocabile');
  await p.click('.livello-btn[data-id="4"]');
  const l4 = await liv(p, 9, 4);
  await riempi(p, [vuote(l4.puzzle)[0]], l4.soluzione);
  await p.click('#btn-esci');
  ok(await p.isVisible('#d-conferma'), 'Uscendo da un livello in corso si chiede conferma');
  await p.click('#conferma-no');
  await p.click('#btn-nuova');
  ok(/Ricominciare/.test(await p.textContent('#t-conferma')), '«Nuova» chiede conferma prima di ricominciare');
  await p.click('#conferma-si'); await p.waitForTimeout(300);
  ok((await stato(p)).val === l4.puzzle, 'Dopo la conferma il livello riparte da capo');

  // Esperto: suggerimenti onesti
  await p.evaluate(() => { const k = 'pandino.v2.progresso', d = JSON.parse(localStorage.getItem(k)); d.completati.c[9][750] = { punti: 1, tempo: 1 }; localStorage.setItem(k, JSON.stringify(d)); });
  await p.goto(base); await p.click('[data-modo="c"]'); await p.click('.taglie [data-n="9"]'); await p.click('#btn-livelli');
  await p.fill('#cerca-livello', '751'); await p.click('#form-vai button');
  await p.click('.livello-btn[data-id="751"]');
  const l751 = await liv(p, 9, 751);
  let dichiarato = false, fuori = 0;
  for (let i = 0; i < 300; i++) {
    await p.click('#btn-suggerimento');
    if (/Nessuna mossa sicura/.test(await p.textContent('#messaggio'))) { dichiarato = true; break; }
    await p.click('#messaggio .btn.primario');
    const v = (await stato(p)).val;
    for (let q = 0; q < 81; q++) if (v[q] !== '0' && v[q] !== l751.soluzione[q]) fuori++;
    if ((await stato(p)).finita) break;
  }
  ok(fuori === 0, 'Esperto: tutti i panda suggeriti sono giusti');
  ok(dichiarato, 'Esperto: quando le tecniche non bastano il gioco lo dichiara');
  await foto(p, '05-esperto-onesto');

  // ================================================== 4×4 e 6×6
  for (const n of [4, 6]) {
    await apri(p, base, 'c', n);
    const l = await liv(p, n, 1);
    ok(await p.$$eval('.cella', a => a.length) === n * n && await p.$$eval('.tasto-panda', a => a.length) === n, n + '×' + n + ': griglia di ' + n * n + ' caselle e ' + n + ' panda');
    await p.keyboard.press(String(n + 1 <= 9 ? n + 1 : 9));
    ok((await stato(p)).val === l.puzzle, n + '×' + n + ': il tasto ' + (n + 1) + ' non è accettato');
    await riempi(p, vuote(l.puzzle), l.soluzione);
    await p.waitForSelector('#d-vittoria[open]', { timeout: 8000 });
    ok(true, n + '×' + n + ': livello 1 completato');
    await foto(p, '06-classico-' + n + 'x' + n);
    await p.click('#btn-vai-livelli');
  }

  // ================================================== Panda Pop
  await apri(p, base, 'p', 9);
  let s = await stato(p);
  ok(s.modo === 'p' && s.vassoio.filter(Boolean).length === 3, 'Panda Pop: tre tessere nel vassoio');
  ok(/variante arcade/.test(await p.textContent('#meta-livello')), 'Panda Pop è presentata come variante arcade');
  const daLib0 = s.liberare;
  // tessera rifiutata con spiegazione
  await p.click('.tessera[data-i="0"]');
  const occupata = [...s.val].findIndex(c => c !== '0');
  await p.click(`.cella[data-p="${occupata}"]`);
  ok(/occupat|griglia|già/.test(await p.textContent('#messaggio')), 'Una posa non valida viene rifiutata con la spiegazione');
  await foto(p, '07-pop-rifiuto');
  // posa con il suggerimento
  await p.click('#btn-suggerimento');
  await foto(p, '08-pop-suggerimento');
  await p.click('#messaggio .btn.primario');
  await p.waitForTimeout(500);
  s = await stato(p);
  ok(s.punti > 0, 'Panda Pop: la posa assegna punti (' + s.punti + ')');
  await p.keyboard.press('Control+z');
  ok((await stato(p)).punti === 0, 'Panda Pop: la posa si può annullare');
  await p.keyboard.press('Control+y');
  // trascinamento con il mouse
  const s2 = await stato(p);
  const ti = s2.vassoio.findIndex(Boolean);
  const pos = await p.evaluate(i => {
    // trova una posizione valida per la tessera i usando il motore della pagina
    const M = window.PandinoMotore, g = window.Pandino.partita(), geo = M.geometria(g.n), val = g.val.split('').map(Number);
    for (let a = 0; a < geo.N; a++) if (M.provaTessera(geo, val, g.vassoio[i], a).ok) return a;
    return -1;
  }, ti);
  if (pos >= 0) {
    const tb = await p.$(`.tessera[data-i="${ti}"] .mc.piena`);
    const fr = await tb.boundingBox();
    const forma = s2.vassoio[ti].forma[0];
    const cel = await (await p.$(`.cella[data-p="${pos + forma[0] * 9 + forma[1]}"]`)).boundingBox();
    await p.mouse.move(fr.x + fr.width / 2, fr.y + fr.height / 2);
    await p.mouse.down();
    await p.mouse.move(fr.x + 30, fr.y - 20, { steps: 4 });
    await p.mouse.move(cel.x + cel.width / 2, cel.y + cel.height / 2, { steps: 10 });
    await foto(p, '09-pop-trascinamento');
    await p.mouse.up();
    await p.waitForTimeout(500);
    ok((await stato(p)).vassoio[ti] === null || (await stato(p)).punti > s2.punti, 'Panda Pop: la tessera si posa trascinandola');
  }
  const vinta = await giocaPop(p, 400);
  ok(vinta, 'Panda Pop 9×9: partita giocata fino alla vittoria (liberati ' + daLib0 + ' panda di partenza)');
  await foto(p, '10-pop-vittoria');
  if (await p.isVisible('#d-vittoria')) await p.click('#btn-vai-livelli');

  // impostazioni: indice a puntini e sfida visiva
  await apri(p, base, 'c', 9);
  await p.click('[data-apri="d-impostazioni"]');
  await p.check('input[name="indice"][value="puntini"]');
  await p.click('#form-impostazioni button[value="chiudi"]');
  ok(await p.$$eval('.cella .puntini', a => a.length) > 10, 'Indice di decodifica a puntini');
  await p.click('[data-apri="d-impostazioni"]');
  await p.check('input[name="indice"][value="nessuno"]');
  await p.click('#form-impostazioni button[value="chiudi"]');
  ok(await p.$eval('.cella .num', el => getComputedStyle(el).display === 'none'), 'Sfida visiva: nessun indice sui panda');
  ok(/Panda \d/.test(await p.getAttribute('.cella[aria-label*="Panda"]', 'aria-label')), 'Sfida visiva: lo screen reader legge ancora il numero');
  await foto(p, '11-sfida-visiva');
  await p.click('[data-apri="d-impostazioni"]');
  await p.check('input[name="indice"][value="numero"]');
  await p.click('#form-impostazioni button[value="chiudi"]');

  // partita libera riproducibile
  for (const [n, f] of [[9, 'Difficile'], [6, 'Medio']]) {
    const val = [];
    for (let k = 0; k < 2; k++) {
      await p.goto(base); await p.click('#btn-libera');
      await p.selectOption('#libera-n', String(n)); await p.selectOption('#libera-fascia', f);
      await p.fill('#libera-seed', '12345');
      const t0 = Date.now();
      await p.click('#btn-genera');
      await p.waitForSelector('#s-gioco:not([hidden])', { timeout: 10000 });
      if (!k) ok(true, 'Partita libera ' + n + '×' + n + ' ' + f + ' generata in ' + (Date.now() - t0) + ' ms');
      val.push((await stato(p)).val);
    }
    ok(val[0] === val[1], 'Partita libera ' + n + '×' + n + ': stesso codice, stessa partita');
  }
  await ctx.close();

  // ================================================== smartphone e tablet (tocco)
  for (const [nome, disp] of [['12-smartphone', devices['iPhone 13']], ['13-smartphone-piccolo', devices['iPhone SE']], ['14-tablet', devices['iPad (gen 7)']]]) {
    const m = await pagina(browser, Object.assign({}, disp), errori);
    await m.p.goto(base);
    await m.p.tap('#btn-continua');
    await m.p.waitForSelector('#s-gioco:not([hidden])');
    const l = await liv(m.p, 9, 1), q = vuote(l.puzzle)[0];
    await m.p.tap(`.cella[data-p="${q}"]`);
    await m.p.tap(`.tasto-panda[data-v="${l.soluzione[q]}"]`);
    await m.p.waitForTimeout(450);
    ok((await stato(m.p)).val[q] === l.soluzione[q], nome + ': tocco su casella e panda (classico)');
    const larg = await m.p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(larg[0] <= larg[1], nome + ': nessuno scorrimento orizzontale (' + larg.join(' ≤ ') + ')');
    await foto(m.p, nome + '-classico', true);
    // Panda Pop al tocco
    await m.p.goto(base);
    await m.p.tap('[data-modo="p"]');
    await m.p.tap('#btn-continua');
    await m.p.waitForSelector('#s-gioco:not([hidden])');
    await m.p.tap('#btn-suggerimento');
    const sp = await stato(m.p);
    await m.p.tap('#messaggio .btn.primario');
    await m.p.waitForTimeout(500);
    ok((await stato(m.p)).punti > sp.punti, nome + ': Panda Pop si gioca al tocco');
    const larg2 = await m.p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(larg2[0] <= larg2[1], nome + ': Panda Pop senza scorrimento orizzontale');
    await foto(m.p, nome + '-pop', true);
    await m.ctx.close();
  }

  // ================================================== tema scuro e movimento ridotto
  const sc = await pagina(browser, { viewport: { width: 1000, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' }, errori);
  await sc.p.goto(base);
  ok(!(await sc.p.evaluate(() => document.documentElement.classList.contains('anim'))), 'Con «riduci movimento» le animazioni partono spente');
  await sc.p.click('[data-modo="p"]'); await sc.p.click('#btn-continua');
  await foto(sc.p, '15-tema-scuro');
  await sc.ctx.close();

  ok(errori.length === 0, 'Nessun errore JavaScript in console' + (errori.length ? ': ' + errori.slice(0, 3).join(' | ') : ''));
  await browser.close();
  if (srv) srv.close();
  console.log(esiti.join('\n'));
  console.log(falliti ? '\n' + falliti + ' verifiche non superate' : '\nTutte le verifiche superate.');
  process.exit(falliti ? 1 : 0);
})().catch(e => { console.error(esiti.join('\n')); console.error(e); process.exit(1); });
