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
const liv = (p, id) => p.evaluate(id => window.Pandino.livello(id), id);
const cella = (p, q) => p.locator(`#griglia .cella[data-p="${q}"]`);
const soluzione = l => l.soluzione.map((c, r) => r * l.n + c);
/** Imposta i progressi prima di caricare la pagina (così il salvataggio automatico non li sovrascrive). */
async function conProgressi(p, base, progresso, imp) {
  await p.goto(base + (base.includes('?') ? '&' : '?') + 'vuota=1');
  await p.evaluate(([pr, im]) => {
    localStorage.setItem('pandino.v3.progresso', JSON.stringify(pr));
    if (im) localStorage.setItem('pandino.v3.impostazioni', JSON.stringify(im));
  }, [progresso, imp]);
  await p.goto(base);
}
async function mettiTutti(p, l) {
  for (const q of soluzione(l)) { if ((await stato(p)).stato[q] !== '2') await cella(p, q).click({ button: 'right' }); }
}

(async () => {
  let srv = null, base = process.argv[2];
  if (!base) { srv = await server(); base = 'http://localhost:' + srv.address().port + '/'; }
  const browser = await chromium.launch();
  const errori = [];

  // ===================================================== struttura e indicizzazione
  const { ctx, p } = await pagina(browser, { viewport: { width: 1280, height: 900 } }, errori);
  const risp = await p.goto(base);
  ok(risp.status() === 200, 'La pagina risponde 200 (' + base + ')');
  ok(await p.getAttribute('meta[name="robots"]', 'content') === 'noindex, nofollow', 'Meta robots «noindex, nofollow»');
  esiti.push('ℹ Header X-Robots-Tag: ' + (risp.headers()['x-robots-tag'] || 'assente (GitHub Pages non permette header personalizzati)'));
  ok(await p.evaluate(() => window.Pandino.totale()) >= 1000, 'Livelli disponibili: ' + await p.evaluate(() => window.Pandino.totale()));
  ok((await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => !/^(data|blob):/.test(n)))).length === 0, 'Nessuna risorsa caricata da Internet');
  await foto(p, '01-inizio', true);

  // ===================================================== livello 1: tocco, cuori, tastiera, trascinamento
  await p.click('#btn-continua');
  await p.waitForSelector('#s-gioco:not([hidden])');
  const l1 = await liv(p, 1), s1 = soluzione(l1);
  const fuori = [...Array(25).keys()].filter(q => !s1.includes(q));
  ok((await stato(p)).n === 5 && await p.locator('#griglia .cella').count() === 25, 'Livello 1: griglia 5×5 con 5 boschetti');
  await cella(p, fuori[0]).click();
  ok((await stato(p)).stato[fuori[0]] === '1', 'Primo tocco: segno ✕');
  await cella(p, fuori[0]).click();
  let s = await stato(p);
  ok(s.cuori === 2 && s.stato[fuori[0]] === '1', 'Secondo tocco con panda nel posto sbagliato: un cuore in meno e la casella resta segnata');
  ok(/non va/.test(await p.textContent('#messaggio')), 'Il messaggio spiega l’errore');
  await p.keyboard.press('Control+z');
  ok((await stato(p)).stato[fuori[0]] === '0', 'Ctrl+Z annulla');
  await p.keyboard.press('Control+y');
  ok((await stato(p)).stato[fuori[0]] === '1', 'Ctrl+Y ripristina');
  await cella(p, 0).focus();
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown');
  ok((await stato(p)).sel === 6, 'Le frecce spostano la selezione');
  const libera = fuori.find(q => (q !== fuori[0]));
  await cella(p, libera).focus();
  await p.keyboard.press('x');
  ok((await stato(p)).stato[libera] === '1', 'Il tasto X mette il segno');
  await p.keyboard.press('Delete');
  ok((await stato(p)).stato[libera] === '0', 'Canc svuota la casella');
  await cella(p, s1[0]).focus();
  await p.keyboard.press('p');
  ok((await stato(p)).stato[s1[0]] === '2', 'Il tasto P mette il panda');
  ok(await p.locator('#griglia .puntino').count() > 0, 'Le caselle escluse dal panda mostrano un puntino');
  const et = await cella(p, s1[0]).getAttribute('aria-label');
  ok(/boschetto [A-J]: panda/.test(et), 'Nome accessibile: «' + et + '»');
  // trascinamento: segna più caselle
  const daSegnare = fuori.filter(q => q !== fuori[0] && Math.floor(q / 5) === Math.floor(fuori[1] / 5)).slice(0, 3);
  if (daSegnare.length >= 2) {
    const a = await cella(p, daSegnare[0]).boundingBox(), b = await cella(p, daSegnare[daSegnare.length - 1]).boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await p.mouse.up();
    const st = (await stato(p)).stato;
    ok(daSegnare.every(q => st[q] === '1' || st[q] === '2'), 'Trascinando si segnano più caselle in un colpo');
  }
  // suggerimento
  await p.click('#btn-suggerimento');
  const msg = await p.textContent('#messaggio');
  ok(/Unico posto|Boschetto chiuso|toglie tutto|Gruppi|controllo/.test(msg), 'Il suggerimento spiega la deduzione: «' + msg.slice(0, 90) + '…»');
  await foto(p, '02-suggerimento');
  await p.click('#messaggio .btn.primario');
  await p.click('#btn-pausa');
  ok(await p.isVisible('#velo-pausa'), 'La pausa nasconde la griglia');
  await p.click('#btn-riprendi');
  const prima = (await stato(p)).stato;
  await p.waitForTimeout(300);
  await p.reload();
  await p.click('#btn-continua');
  await p.waitForSelector('#s-gioco:not([hidden])');
  s = await stato(p);
  ok(s.stato === prima && s.cuori === 2, 'Dopo la riapertura la partita riprende con segni, panda e cuori');
  await mettiTutti(p, l1);
  await p.waitForSelector('#d-fine[open]', { timeout: 8000 });
  ok(/completato/i.test(await p.textContent('#t-fine')), 'Livello 1 completato: compare la vittoria');
  await foto(p, '03-vittoria');
  await p.click('#btn-vai-livelli');
  ok(await p.$eval('.livello-btn[data-id="1"]', b => b.classList.contains('completato')), 'Il livello 1 risulta completato');
  ok(await p.$eval('.livello-btn[data-id="4"]', b => b.disabled), 'Il livello 4 è ancora bloccato');
  ok(await p.locator('#capitoli button').count() === 6, 'Sei capitoli, dal 5×5 al 10×10');
  ok(await p.locator('#pagine button').count() === 2, 'Paginazione: il capitolo 1 ha 2 pagine da 50');
  await p.fill('#cerca-livello', '600'); await p.click('#form-vai button');
  ok(/bloccato/.test(await p.textContent('#conteggio-livelli')), 'La ricerca porta al livello 600 e dice che è bloccato');
  await p.selectOption('#filtro', 'completati'); await p.click('#capitoli button >> nth=0');
  ok(await p.locator('.livello-btn').count() === 1, 'Il filtro «Completati» mostra un livello');
  await p.selectOption('#filtro', 'Esperto');
  ok(await p.locator('.livello-btn').count() > 0 && (await p.locator('.livello-btn .f').allTextContents()).every(t => t === 'Esperto'), 'Il filtro per difficoltà funziona');
  await p.selectOption('#filtro', 'tutti');
  await foto(p, '04-livelli');
  for (const id of [2, 3]) {
    await p.click(`.livello-btn[data-id="${id}"]`);
    await mettiTutti(p, await liv(p, id));
    await p.waitForSelector('#d-fine[open]');
    if (id === 3) ok(/Livello 4 sbloccato/.test(await p.textContent('#x-fine')), 'Completare il livello 3 sblocca il livello 4');
    await p.click('#btn-vai-livelli');
  }
  ok(await p.$eval('.livello-btn[data-id="4"]', b => !b.disabled), 'Il livello 4 ora è giocabile');
  await p.reload(); await p.click('#btn-livelli');
  ok(await p.$eval('.livello-btn[data-id="3"]', b => b.classList.contains('completato')), 'I progressi restano dopo la riapertura');
  // conferme
  await p.click('.livello-btn[data-id="4"]');
  const l4 = await liv(p, 4);
  await cella(p, soluzione(l4)[0]).click({ button: 'right' });
  await p.click('#btn-esci');
  ok(await p.isVisible('#d-conferma'), 'Uscendo da un livello in corso si chiede conferma');
  await p.click('#conferma-no');
  await p.click('#btn-nuova');
  ok(/capo/.test(await p.textContent('#t-conferma')), '«Da capo» chiede conferma');
  await p.click('#conferma-si'); await p.waitForTimeout(300);
  ok(!/2/.test((await stato(p)).stato), 'Dopo la conferma il livello riparte vuoto');
  // cuori finiti
  const sbagliate = [...Array(l4.n * l4.n).keys()].filter(q => !soluzione(l4).includes(q)).slice(0, 3);
  for (const q of sbagliate) await cella(p, q).click({ button: 'right' });
  await p.waitForSelector('#d-fine[open]');
  ok(/Cuori finiti/.test(await p.textContent('#t-fine')) && (await stato(p)).persa, 'Tre errori: cuori finiti e partita da riprovare');
  await foto(p, '05-cuori-finiti');
  await p.click('#btn-rigioca');
  ok((await stato(p)).cuori === 3, '«Riprova» riparte con tre cuori');

  // ===================================================== modo rilassato: conflitti e controllo
  await p.click('[data-apri="d-impostazioni"]');
  await p.check('input[name="cuori"][value="no"]');
  await p.click('#form-impostazioni button[value="chiudi"]');
  ok(await p.isHidden('#box-cuori'), 'Modo rilassato: niente cuori');
  const sb = sbagliate[0], vicina = [sb + 1, sb - 1, sb + l4.n, sb - l4.n].find(q => q >= 0 && q < l4.n * l4.n && Math.abs((q % l4.n) - (sb % l4.n)) <= 1);
  await cella(p, sb).click({ button: 'right' });
  await cella(p, vicina).click({ button: 'right' });
  ok(await cella(p, sb).evaluate(el => el.classList.contains('conflitto')), 'Due panda che si toccano: conflitto segnalato con righe diagonali e «!»');
  ok(/tocca|stessa|stesso/.test(await p.textContent('#messaggio')), 'Il conflitto è spiegato a parole');
  await p.click('#btn-controlla');
  ok(/non (è|sono) al posto giusto/.test(await p.textContent('#messaggio')), '«Controlla» distingue i panda fuori posto dai conflitti');
  await foto(p, '06-rilassato-conflitti');
  await p.click('[data-apri="d-impostazioni"]');
  await p.check('input[name="cuori"][value="si"]');
  await p.click('#form-impostazioni button[value="chiudi"]');

  // ===================================================== livello esperto risolto solo con i suggerimenti
  await conProgressi(p, base, { completati: { 1049: { punti: 1, tempo: 1 } }, inCorso: {}, ultimo: 1050 });
  await p.click('#btn-continua');
  const l1050 = await liv(p, 1050);
  ok(l1050.n === 10, 'Livello 1050: griglia 10×10, ' + l1050.fascia);
  let passi = 0;
  while (!(await stato(p)).finita && passi < 300) {
    await p.click('#btn-suggerimento');
    if (/Nessuna deduzione/.test(await p.textContent('#messaggio'))) break;
    await p.click('#messaggio .btn.primario');
    passi++;
  }
  s = await stato(p);
  ok(s.finita && s.cuori === 3, 'Livello ' + l1050.fascia + ' 10×10 risolto seguendo solo i suggerimenti (' + passi + ' passi, nessun cuore perso)');
  await p.waitForSelector('#d-fine[open]');
  await foto(p, '07-esperto-con-aiuti');
  await p.click('#btn-vai-livelli');

  // ===================================================== partita libera
  const giocate = [];
  for (let k = 0; k < 2; k++) {
    await p.goto(base); await p.click('#btn-libera');
    await p.selectOption('#libera-n', '8'); await p.selectOption('#libera-fascia', 'Difficile');
    await p.fill('#libera-seed', '4242');
    const t0 = Date.now();
    await p.click('#btn-genera');
    await p.waitForSelector('#s-gioco:not([hidden])', { timeout: 10000 });
    if (!k) ok(true, 'Partita libera 8×8 difficile generata in ' + (Date.now() - t0) + ' ms');
    giocate.push(JSON.stringify(await p.evaluate(() => { const c = [...document.querySelectorAll('#griglia .cella')]; return c.map(x => x.className).join('|'); })));
  }
  ok(giocate[0] === giocate[1], 'Partita libera: stesso codice, stesso livello');
  await ctx.close();

  // ===================================================== smartphone e tablet
  for (const [nome, disp, id] of [['08-smartphone', devices['iPhone 13'], 1], ['09-smartphone-piccolo', devices['iPhone SE'], 1001], ['10-tablet', devices['iPad (gen 7)'], 551]]) {
    const m = await pagina(browser, Object.assign({}, disp), errori);
    await conProgressi(m.p, base, { completati: id > 1 ? { [id - 1]: { punti: 1, tempo: 1 } } : {}, inCorso: {}, ultimo: id });
    await m.p.tap('#btn-continua');
    await m.p.waitForSelector('#s-gioco:not([hidden])');
    const l = await liv(m.p, id), sol = soluzione(l);
    await cella(m.p, sol[0]).tap();
    await cella(m.p, sol[0]).tap();
    ok((await stato(m.p)).stato[sol[0]] === '2', nome + ' (' + l.n + '×' + l.n + '): due tocchi mettono il panda');
    const larg = await m.p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(larg[0] <= larg[1], nome + ': nessuno scorrimento orizzontale (' + larg.join(' ≤ ') + ')');
    const lato = await m.p.$eval('#griglia', el => el.getBoundingClientRect().width / window.Pandino.partita().n);
    ok(lato >= 28, nome + ': caselle di ' + Math.round(lato) + ' px');
    await foto(m.p, nome, true);
    await m.ctx.close();
  }

  // ===================================================== tema scuro e movimento ridotto
  const sc = await pagina(browser, { viewport: { width: 1000, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' }, errori);
  await sc.p.goto(base);
  ok(!(await sc.p.evaluate(() => document.documentElement.classList.contains('anim'))), 'Con «riduci movimento» le animazioni partono spente');
  await sc.p.click('#btn-continua');
  await foto(sc.p, '11-tema-scuro');
  await sc.ctx.close();

  ok(errori.length === 0, 'Nessun errore JavaScript in console' + (errori.length ? ': ' + errori.slice(0, 3).join(' | ') : ''));
  await browser.close();
  if (srv) srv.close();
  console.log(esiti.join('\n'));
  console.log(falliti ? '\n' + falliti + ' verifiche non superate' : '\nTutte le verifiche superate.');
  process.exit(falliti ? 1 : 0);
})().catch(e => { console.error(esiti.join('\n')); console.error(e); process.exit(1); });
