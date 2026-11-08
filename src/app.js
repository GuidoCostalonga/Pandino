/*
 * Pandino · applicazione
 * ---------------------------------------------------------------------------
 * Sezioni:
 *  A. Catalogo dei livelli (4×4, 6×6, 9×9) e titoli
 *  B. Archivio nel browser (impostazioni, progressi, partite salvate)
 *  C. Stato della partita: conteggi per unità aggiornati a ogni mossa,
 *     candidati virtuali, conflitti; confronto con solution[] a tempo costante
 *  D. Sudoku classico: mosse, annulla e ripristina, suggerimenti
 *  E. Panda Pop a tessere: vassoio di poliomini, posa, saturazione, combo
 *  F. Disegno della griglia, accessibilità, animazioni (volo su curva di Bézier,
 *     squash and stretch all'atterraggio, scoppi)
 *  G. Schermate: inizio, livelli, gioco, partita libera
 *  H. Tastiera, trascinamento, suoni, avvio
 */
(function () {
  'use strict';
  var M = window.PandinoMotore, P = window.PandinoPanda;
  var $ = function (id) { return document.getElementById(id); };
  var bit = M.bit;
  var TAGLIE = [4, 6, 9];
  var BASE_PUNTI = { Facile: 1000, Medio: 2000, Difficile: 3000, Esperto: 4000 };
  var FATTORE_TAGLIA = { 4: 0.25, 6: 0.5, 9: 1 };
  var NOME_MODO = { c: 'Sudoku classico', p: 'Panda Pop' };
  var DESCRIZIONE_TECNICA = {
    'naked-single': 'bastano gli unici candidati e gli unici posti', 'hidden-single': 'bastano gli unici candidati e gli unici posti',
    'pointing': 'servono i candidati bloccati', 'claiming': 'servono i candidati bloccati',
    'naked-pair': 'servono coppie o terne', 'hidden-pair': 'servono coppie o terne', 'naked-triple': 'servono coppie o terne',
    'x-wing': 'serve un X-Wing', 'swordfish': 'serve uno Swordfish', 'oltre': 'va oltre le tecniche dei suggerimenti'
  };

  // =====================================================================
  // A. Catalogo
  // =====================================================================
  var grezzi = JSON.parse($('dati-livelli').textContent);
  var CATALOGO = {};
  TAGLIE.forEach(function (n) {
    var d = grezzi.g[n];
    var conv = function (r, id) {
      return { n: n, id: id, puzzle: r[0], soluzione: r[1], fascia: M.FASCE[r[2]], tecnica: r[3], punteggio: r[4], seed: r[5], minimo: r[6] };
    };
    var livelli = d.l.map(function (r, i) { return conv(r, i + 1); });
    var capitoli = [];
    livelli.forEach(function (l) {
      var ult = capitoli[capitoli.length - 1];
      if (!ult || ult.fascia !== l.fascia) capitoli.push({ fascia: l.fascia, da: l.id, a: l.id });
      else ult.a = l.id;
    });
    CATALOGO[n] = { livelli: livelli, riserva: d.r.map(function (r, i) { return conv(r, 'R' + (i + 1)); }), capitoli: capitoli };
  });
  function totale(n) { return CATALOGO[n].livelli.length; }
  function livello(n, id) { return CATALOGO[n].livelli[id - 1] || null; }
  function capitoloDi(n, id) {
    var c = CATALOGO[n].capitoli;
    for (var i = 0; i < c.length; i++) if (id >= c[i].da && id <= c[i].a) return i;
    return 0;
  }

  var LUOGHI = ['Bosco di bambù', 'Ruscello', 'Radura', 'Collina', 'Sentiero', 'Pagoda', 'Lanterne', 'Nebbiolina',
    'Cascata', 'Giardino', 'Ponticello', 'Laghetto', 'Prato', 'Grotta', 'Vetta', 'Foresta', 'Valle', 'Rifugio',
    'Stagno', 'Boschetto', 'Orto', 'Altopiano', 'Sorgente', 'Terrazza', 'Capanna'];
  var MOMENTI = ['all’alba', 'di mattina', 'a mezzogiorno', 'di pomeriggio', 'al tramonto', 'di sera',
    'sotto le stelle', 'con la pioggia', 'con la neve', 'in primavera', 'in estate', 'in autunno', 'in inverno',
    'col vento', 'al chiaro di luna', 'dopo il temporale', 'in festa', 'a merenda', 'in silenzio', 'col sole',
    'tra le nuvole', 'di buon umore', 'a passo lento', 'in compagnia', 'con l’arcobaleno', 'di nascosto',
    'all’ora del tè', 'con calma', 'in punta di zampe', 'senza fretta', 'con un sorriso', 'a sorpresa',
    'in gran segreto', 'prima di cena', 'a mezzanotte', 'con il fresco', 'nel silenzio', 'a occhi aperti',
    'con le lucciole', 'al primo sole'];
  function titolo(n, id) {
    if (typeof id !== 'number') return 'Partita libera';
    var k = id - 1 + (n === 9 ? 0 : n === 6 ? 7 : 13);
    return LUOGHI[k % LUOGHI.length] + ' ' + MOMENTI[Math.floor(k / LUOGHI.length) % MOMENTI.length];
  }

  // =====================================================================
  // B. Archivio
  // =====================================================================
  var PREFISSO = 'pandino.v2.';
  var archivio = {
    disponibile: true,
    leggi: function (k, d) {
      try { var s = localStorage.getItem(PREFISSO + k); return s ? JSON.parse(s) : d; } catch (e) { this.disponibile = false; return d; }
    },
    scrivi: function (k, v) {
      try { localStorage.setItem(PREFISSO + k, JSON.stringify(v)); return true; } catch (e) { this.disponibile = false; return false; }
    },
    togli: function (k) { try { localStorage.removeItem(PREFISSO + k); } catch (e) { /* niente */ } }
  };
  var moviMeno = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var imp = Object.assign({
    modo: 'c', n: 9, indice: 'numero', errori: 'subito', conflitti: true, auto: false, uguali: true, chiaro: false,
    animazioni: !moviMeno, suoni: true, tema: 'auto'
  }, archivio.leggi('impostazioni', {}));
  if (TAGLIE.indexOf(imp.n) < 0) imp.n = 9;
  function progVuoto() { return { completati: { c: { 4: {}, 6: {}, 9: {} }, p: { 4: {}, 6: {}, 9: {} } }, inCorso: {}, ultimo: {} }; }
  var prog = Object.assign(progVuoto(), archivio.leggi('progresso', {}));
  ['c', 'p'].forEach(function (m) { TAGLIE.forEach(function (n) { prog.completati[m][n] = prog.completati[m][n] || {}; }); });
  function salvaImpostazioni() { archivio.scrivi('impostazioni', imp); }
  function salvaProgresso() { archivio.scrivi('progresso', prog); }
  function chiave(modo, n, id) { return 'partita.' + modo + '.' + n + '.' + id; }
  function completato(modo, n, id) { return !!prog.completati[modo][n][id]; }
  function inCorso(modo, n, id) { return !!prog.inCorso[chiave(modo, n, id)]; }
  /** Regola di sblocco: i primi tre livelli di ogni capitolo sono aperti;
   *  ogni livello completato (in una qualsiasi modalità) apre il successivo. */
  function sbloccato(n, id) {
    var cap = CATALOGO[n].capitoli[capitoloDi(n, id)];
    if (id - cap.da < 3) return true;
    return completato('c', n, id) || completato('p', n, id) || completato('c', n, id - 1) || completato('p', n, id - 1) ||
      inCorso('c', n, id) || inCorso('p', n, id);
  }
  function prossimiSbloccati(modo, n, quanti) {
    var out = [];
    for (var id = 1; id <= totale(n) && out.length < quanti; id++) if (sbloccato(n, id) && !completato(modo, n, id)) out.push(id);
    return out;
  }
  function livelloCorrente(modo, n) {
    var u = prog.ultimo[modo + n];
    if (u && livello(n, u) && sbloccato(n, u) && (!completato(modo, n, u) || inCorso(modo, n, u))) return u;
    var p = prossimiSbloccati(modo, n, 1);
    return p.length ? p[0] : 1;
  }

  // =====================================================================
  // C. Stato della partita
  // =====================================================================
  var G = null, celle = [], tastiPanda = [];

  function nuovaPartita(modo, liv, libera) {
    var n = liv.n, geo = M.geometria(n), N = geo.N;
    G = {
      modo: modo, liv: liv, id: liv.id, n: n, geo: geo, N: N, libera: !!libera,
      sol: new Int8Array(N), iniziale: new Uint8Array(N), val: new Int8Array(N),
      note: new Uint16Array(N), escl: new Uint16Array(N), cont: new Uint8Array(3 * n * 10), controllate: new Uint8Array(N),
      tempo: 0, punti: 0, aiuti: 0, sbagli: 0, storia: [], futuro: [], finita: false, sel: -1, attivo: 0, matita: false, pausa: false,
      suggerimento: null, vis: {},
      pop: modo === 'p' ? { vassoio: [null, null, null], scelta: -1, generati: 0, combo: 0, maxCombo: 0, gruppi: 0, rinnovi: 0 } : null
    };
    for (var p = 0; p < N; p++) {
      G.sol[p] = +liv.soluzione[p];
      if (+liv.puzzle[p]) { G.iniziale[p] = 1; impostaValore(p, +liv.puzzle[p]); }
    }
    return G;
  }
  /** Cambia una casella aggiornando solo i conteggi delle sue tre unità: O(1). */
  function impostaValore(p, v) {
    var vecchio = G.val[p], u = G.geo.UNITA_DI[p];
    if (vecchio === v) return;
    if (vecchio) { G.cont[u[0] * 10 + vecchio]--; G.cont[u[1] * 10 + vecchio]--; G.cont[u[2] * 10 + vecchio]--; }
    G.val[p] = v;
    if (v) { G.cont[u[0] * 10 + v]++; G.cont[u[1] * 10 + v]++; G.cont[u[2] * 10 + v]++; }
    G.controllate[p] = 0;
  }
  function ricostruisciConteggi() {
    G.cont.fill(0);
    for (var p = 0; p < G.N; p++) if (G.val[p]) G.geo.UNITA_DI[p].forEach(function (u) { G.cont[u * 10 + G.val[p]]++; });
  }
  function inConflitto(p) {
    var v = G.val[p], u = G.geo.UNITA_DI[p];
    return v > 0 && (G.cont[u[0] * 10 + v] > 1 || G.cont[u[1] * 10 + v] > 1 || G.cont[u[2] * 10 + v] > 1);
  }
  function candidatiBase(p) {
    if (G.val[p]) return 0;
    var u = G.geo.UNITA_DI[p], m = 0;
    for (var v = 1; v <= G.n; v++) if (!G.cont[u[0] * 10 + v] && !G.cont[u[1] * 10 + v] && !G.cont[u[2] * 10 + v]) m |= bit(v);
    return m;
  }
  function candidatiAuto(p) { return candidatiBase(p) & ~G.escl[p]; }
  /** Validazione a tempo costante: confronto diretto con solution[p]. */
  function sbagliata(p) { return G.modo === 'c' && G.val[p] > 0 && !G.iniziale[p] && G.val[p] !== G.sol[p]; }
  function sbaglioVisibile(p) { return sbagliata(p) && (imp.errori === 'subito' || G.controllate[p]); }
  function piazzati(v) { var t = 0; for (var r = 0; r < G.n; r++) t += G.cont[r * 10 + v]; return t; }
  function piene() { var t = 0; for (var p = 0; p < G.N; p++) if (G.val[p]) t++; return t; }
  function giuste() { var t = 0; for (var p = 0; p < G.N; p++) if (G.val[p] === G.sol[p]) t++; return t; }
  function modificabile(p) { return p >= 0 && !G.iniziale[p]; }
  function puoAgire() { return G && !G.finita && !G.pausa; }
  function nomeUnita(u) { return M.nomeUnita(G.geo, u); }
  function nomeCasella(p) { return M.nomeCasella(G.geo, p); }
  function maiuscola(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function baseFascia() { return Math.round((BASE_PUNTI[G.liv.fascia] || 1000) * FATTORE_TAGLIA[G.n]); }

  // =====================================================================
  // D. Sudoku classico
  // =====================================================================
  function statoCella(p) { return [G.val[p], G.note[p], G.escl[p]]; }
  function applicaStatoCella(p, s) { impostaValore(p, s[0]); G.note[p] = s[1]; G.escl[p] = s[2]; }

  /** Esegue una modifica come mossa unica annullabile. */
  function transazione(fn) {
    var prima = {}, ordine = [];
    function tocca(p) { if (!(p in prima)) { prima[p] = statoCella(p); ordine.push(p); } }
    fn(tocca);
    var mossa = { c: [] };
    ordine.forEach(function (p) { var d = statoCella(p); if (d.join() !== prima[p].join()) mossa.c.push([p, prima[p], d]); });
    if (mossa.c.length) { G.storia.push(mossa); if (G.storia.length > 400) G.storia.shift(); G.futuro = []; }
    return mossa.c.map(function (x) { return x[0]; });
  }

  function annulla() {
    if (!puoAgire()) return;
    var m = G.storia.pop();
    if (!m) { annuncia('Non ci sono mosse da annullare.'); return; }
    if (m.pop) { ripristinaFoto(m.s0); G.futuro.push(m); ridisegnaTutto(); salvaPartita(); annuncia('Mossa annullata.'); return; }
    for (var i = m.c.length - 1; i >= 0; i--) applicaStatoCella(m.c[i][0], m.c[i][1]);
    G.futuro.push(m);
    dopoMossa(m.c.map(function (x) { return x[0]; }));
    annuncia('Mossa annullata.');
  }
  function ripristina() {
    if (!puoAgire()) return;
    var m = G.futuro.pop();
    if (!m) { annuncia('Non ci sono mosse da ripristinare.'); return; }
    if (m.pop) { ripristinaFoto(m.s1); G.storia.push(m); ridisegnaTutto(); salvaPartita(); annuncia('Mossa ripristinata.'); return; }
    m.c.forEach(function (x) { applicaStatoCella(x[0], x[2]); });
    G.storia.push(m);
    dopoMossa(m.c.map(function (x) { return x[0]; }));
    annuncia('Mossa ripristinata.');
  }

  function mettiPanda(p, v, forzato) {
    if (!puoAgire()) return;
    if (p < 0) { annuncia('Scegli prima una casella.'); return; }
    if (v > G.n) return;
    if (G.iniziale[p]) { avvisa('Questa è una casella iniziale: non si può cambiare.'); return; }
    G.attivo = v;
    if (G.matita && !forzato) {
      if (G.val[p]) { avvisa('Per scrivere una nota, svuota prima la casella.'); return; }
      var t = transazione(function (tocca) { tocca(p); G.note[p] ^= bit(v); });
      dopoMossa(t);
      annuncia((G.note[p] & bit(v) ? 'Nota aggiunta: ' : 'Nota tolta: ') + M.nomePanda(v) + '.');
      suono('nota');
      return;
    }
    if (G.val[p] === v) { aggiornaEvidenze(); return; }
    var giusto = v === G.sol[p];
    var toccate = transazione(function (tocca) {
      tocca(p);
      impostaValore(p, v);
      G.note[p] = 0;
      G.geo.VICINE[p].forEach(function (q) { if (G.note[q] & bit(v)) { tocca(q); G.note[q] &= ~bit(v); } });
    });
    if (!giusto && !forzato) G.sbagli++;
    // volo del panda dalla tavolozza alla casella, poi schiacciamento all'atterraggio
    var cella = celle[p];
    if (imp.animazioni && tastiPanda[v - 1] && tastiPanda[v - 1].offsetParent) {
      cella.classList.add('in-arrivo');
      vola(P.uso(v), tastiPanda[v - 1].getBoundingClientRect(), cella.getBoundingClientRect(), 360, function () {
        cella.classList.remove('in-arrivo'); anima([p], 'appena', 450);
      });
    } else anima([p], 'appena', 450);
    dopoMossa(toccate.concat(G.geo.VICINE[p], [p]));
    var chiusi = G.geo.UNITA_DI[p].filter(function (u) { return G.geo.UNITA[u].every(function (q) { return G.val[q] && !inConflitto(q); }); });
    if (chiusi.length) {
      setTimeout(function () { anima([].concat.apply([], chiusi.map(function (u) { return G.geo.UNITA[u]; })), 'lampo', 700); }, imp.animazioni ? 360 : 0);
      suono('gruppo');
    } else suono('metti');
    if (inConflitto(p) && imp.conflitti) {
      var testo = 'il ' + M.nomePanda(v) + ' compare già ' + doveConflitto(p) + '.';
      mostraMessaggio('attenzione', '<p><strong>Conflitto:</strong> ' + testo + '</p>');
      annuncia('Conflitto: ' + testo);
      suono('errore');
    } else if (!giusto && imp.errori === 'subito' && !forzato) {
      mostraMessaggio('attenzione', '<p><strong>Non è il panda giusto.</strong> Rispetta le regole, ma non corrisponde alla soluzione di questo livello.</p>');
      annuncia('Non è il panda giusto per questa casella.');
      suono('errore');
    } else nascondiMessaggio();
    controllaFineClassico();
  }
  function doveConflitto(p) {
    var v = G.val[p], dove = [];
    G.geo.UNITA_DI[p].forEach(function (u) { if (G.cont[u * 10 + v] > 1) dove.push((u < 2 * G.n ? 'nella ' : 'nel ') + nomeUnita(u)); });
    return dove.join(' e ');
  }
  function svuota(p) {
    if (!puoAgire()) return;
    if (p < 0) { annuncia('Scegli prima una casella.'); return; }
    if (G.iniziale[p]) { avvisa('Le caselle iniziali non si possono svuotare.'); return; }
    if (!G.val[p] && !G.note[p]) { annuncia('La casella è già vuota.'); return; }
    var t = transazione(function (tocca) { tocca(p); if (G.val[p]) impostaValore(p, 0); else G.note[p] = 0; });
    dopoMossa(t.concat(G.geo.VICINE[p]));
    nascondiMessaggio();
    annuncia('Casella svuotata.');
  }

  function punteggioAttuale() {
    if (G.modo === 'p') return Math.max(0, G.punti - 50 * G.aiuti);
    var base = baseFascia();
    return Math.max(Math.round(base * 0.2), base - Math.floor(G.tempo / 2000) - 60 * G.aiuti - 30 * G.sbagli);
  }
  function controllaFineClassico() {
    if (giuste() === G.N) { vittoria(); return; }
    if (piene() === G.N) {
      var k = 0;
      for (var p = 0; p < G.N; p++) if (sbagliata(p)) { k++; G.controllate[p] = 1; }
      ridisegnaTutto();
      mostraMessaggio('attenzione', '<p><strong>La griglia è piena</strong>, ma ' + k + (k === 1 ? ' casella non corrisponde' : ' caselle non corrispondono') +
        ' alla soluzione. Le trovi segnate con il bordo tratteggiato e il segno ✕.</p>');
      annuncia('La griglia è piena ma ci sono ' + k + ' errori.');
    }
  }
  function controlla() {
    if (!puoAgire() || G.modo !== 'c') return;
    var k = 0, conf = 0;
    for (var p = 0; p < G.N; p++) { if (sbagliata(p)) { k++; G.controllate[p] = 1; } if (inConflitto(p)) conf++; }
    ridisegnaTutto();
    var testo = !k && !conf ? 'Finora è tutto giusto: nessun conflitto e nessun panda fuori posto.' :
      (k ? k + (k === 1 ? ' casella non corrisponde' : ' caselle non corrispondono') + ' alla soluzione (bordo tratteggiato e ✕). ' : '') +
      (conf ? conf + (conf === 1 ? ' casella è' : ' caselle sono') + ' in conflitto con le regole (righe diagonali e !).' : '');
    mostraMessaggio(k || conf ? 'attenzione' : 'ok', '<p>' + testo + '</p>');
    annuncia(testo);
  }

  // suggerimenti del classico
  function suggerimento() {
    if (!puoAgire()) return;
    if (G.modo === 'p') { suggerimentoPop(); return; }
    togliSuggerimento();
    for (var p = 0; p < G.N; p++) {
      if (sbagliata(p)) {
        G.aiuti++;
        evidenzia([p]); seleziona(p);
        mostraMessaggio('aiuto', '<p><span class="tec">Prima un controllo</span>Nella casella ' + nomeCasella(p) + ' il ' + M.nomePanda(G.val[p]) +
          ' non corrisponde alla soluzione. Ogni deduzione partirebbe da un dato sbagliato: conviene toglierlo.</p>',
          [{ testo: 'Togli il panda', primario: true, fn: (function (q) { return function () { togliSuggerimento(); svuota(q); }; })(p) },
            { testo: 'Chiudi', fn: chiudiSuggerimento }]);
        aggiornaContatori();
        annuncia('Suggerimento: nella casella ' + nomeCasella(p) + ' c’è un panda fuori posto.');
        return;
      }
    }
    var valori = Array.from(G.val), cand = [];
    for (p = 0; p < G.N; p++) cand.push(valori[p] ? 0 : candidatiAuto(p));
    var passo = M.prossimoPasso(G.geo, valori, cand);
    G.aiuti++;
    aggiornaContatori();
    if (passo && passo.tipo === 'piazza' && passo.valore === G.sol[passo.cella]) {
      evidenzia([passo.cella]); seleziona(passo.cella);
      mostraMessaggio('aiuto', '<p><span class="tec">' + passo.nomeTecnica + '</span>' + passo.testo + '</p>',
        [{ testo: 'Metti il ' + M.nomePanda(passo.valore), primario: true, fn: function () { togliSuggerimento(); seleziona(passo.cella); mettiPanda(passo.cella, passo.valore, true); } },
          { testo: 'Ci penso io', fn: chiudiSuggerimento }]);
      annuncia('Suggerimento. ' + passo.testo);
      return;
    }
    if (passo && passo.tipo === 'elimina') {
      evidenzia(passo.evidenzia.concat(passo.eliminazioni.map(function (e) { return e.cella; })));
      mostraMessaggio('aiuto', '<p><span class="tec">' + passo.nomeTecnica + '</span>' + passo.testo + '</p>' +
        '<p>Non è ancora un panda da mettere, ma toglie possibilità: dopo questo passo chiedi un altro aiuto.</p>',
        [{ testo: 'Togli questi candidati', primario: true, fn: function () {
          var t = transazione(function (tocca) {
            passo.eliminazioni.forEach(function (e) { tocca(e.cella); G.escl[e.cella] |= bit(e.valore); G.note[e.cella] &= ~bit(e.valore); });
          });
          togliSuggerimento(); dopoMossa(t);
          mostraMessaggio('ok', '<p>Candidati tolti.' + (imp.auto ? '' : ' Accendi «Mostra i candidati possibili» per vederli nella griglia.') + '</p>');
          annuncia('Candidati tolti.');
        } }, { testo: 'Chiudi', fn: chiudiSuggerimento }]);
      annuncia('Suggerimento. ' + passo.testo);
      return;
    }
    mostraMessaggio('aiuto', '<p><span class="tec">Nessuna mossa sicura trovata</span>Con le tecniche che conosco (unico candidato, unico posto, candidati bloccati, coppie e terne, X-Wing e Swordfish) non trovo una mossa certa in questa posizione. Non tiro a indovinare.</p>' +
      '<p>Se vuoi, posso rivelarti una casella presa dalla soluzione: conta come aiuto.</p>',
      [{ testo: 'Rivela una casella', primario: true, fn: rivelaCasella }, { testo: 'Chiudi', fn: chiudiSuggerimento }]);
    annuncia('Nessuna mossa sicura trovata con le tecniche conosciute.');
  }
  function rivelaCasella() {
    if (!puoAgire()) return;
    var migliore = -1, minimo = 99;
    for (var p = 0; p < G.N; p++) if (!G.val[p]) { var k = M.CONTA_BIT[candidatiAuto(p)]; if (k < minimo) { minimo = k; migliore = p; } }
    if (migliore < 0) return;
    G.aiuti++;
    togliSuggerimento(); seleziona(migliore);
    mettiPanda(migliore, G.sol[migliore], true);
    if (!G.finita) mostraMessaggio('ok', '<p>Ecco il ' + M.nomePanda(G.sol[migliore]) + ' nella casella ' + nomeCasella(migliore) + ', preso dalla soluzione.</p>');
  }
  function evidenzia(arr) { G.suggerimento = arr.slice(); arr.forEach(function (p) { celle[p].classList.add('suggerita'); }); }
  function togliSuggerimento() {
    if (G && G.suggerimento) G.suggerimento.forEach(function (p) { if (celle[p]) celle[p].classList.remove('suggerita'); });
    if (G) G.suggerimento = null;
  }
  function chiudiSuggerimento() { togliSuggerimento(); togliAnteprima(); nascondiMessaggio(); }

  // =====================================================================
  // E. Panda Pop a tessere
  // =====================================================================
  function fotoPop() {
    return { val: Array.from(G.val), ini: Array.from(G.iniziale), vass: JSON.parse(JSON.stringify(G.pop.vassoio)),
      punti: G.punti, combo: G.pop.combo, max: G.pop.maxCombo, gruppi: G.pop.gruppi, rinnovi: G.pop.rinnovi, generati: G.pop.generati };
  }
  function ripristinaFoto(f) {
    for (var p = 0; p < G.N; p++) { G.val[p] = f.val[p]; G.iniziale[p] = f.ini[p]; }
    ricostruisciConteggi();
    G.pop.vassoio = JSON.parse(JSON.stringify(f.vass));
    G.punti = f.punti; G.pop.combo = f.combo; G.pop.maxCombo = f.max; G.pop.gruppi = f.gruppi; G.pop.rinnovi = f.rinnovi; G.pop.generati = f.generati;
    G.pop.scelta = -1;
  }
  /** Nuovo vassoio da tre tessere, riproducibile: dipende dal seed del livello e da quanti vassoi sono già usciti. */
  function nuovoVassoio() {
    G.pop.generati++;
    var casuale = M.generatore(((G.liv.seed >>> 0) * 31 + 7919 * G.pop.generati) >>> 0);
    var v = M.generaVassoio(G.geo, Array.from(G.val), casuale, 3);
    G.pop.vassoio = [0, 1, 2].map(function (i) { return v[i] ? { forma: v[i].forma, valori: v[i].valori } : null; });
    G.pop.scelta = -1;
  }
  function daLiberare() { var k = 0; for (var p = 0; p < G.N; p++) if (G.iniziale[p]) k++; return k; }
  /** Prova veloce (caselle libere e regole) prima del controllo di completabilità. */
  function entraQui(t, a) { return M.provaTessera(G.geo, G.val, t, a); }
  function qualcunaEntra() {
    for (var i = 0; i < 3; i++) {
      var t = G.pop.vassoio[i];
      if (!t) continue;
      for (var a = 0; a < G.N; a++) if (entraQui(t, a).ok) return true;
    }
    return false;
  }
  function motivoRifiuto(r) {
    if (r.motivo === 'fuori') return 'La tessera uscirebbe dalla griglia.';
    if (r.motivo === 'occupata') return 'Alcune di quelle caselle sono già occupate.';
    if (r.motivo === 'conflitto') {
      var u = G.geo.UNITA_DI[r.cella].filter(function (x) { return G.geo.UNITA[x].indexOf(r.con) >= 0; })[0];
      return 'Il ' + M.nomePanda(r.valore) + ' è già ' + (u < 2 * G.n ? 'nella ' : 'nel ') + nomeUnita(u) + ' (casella ' + nomeCasella(r.con) + ').';
    }
    return 'Così la griglia non si potrebbe più completare: nessuna disposizione dei panda rispetterebbe tutte le regole.';
  }

  /** Posa la tessera i con l'angolo in alto a sinistra nella casella `ancora`. */
  function posaTessera(i, ancora, origini) {
    if (!puoAgire() || G.modo !== 'p') return false;
    var t = G.pop.vassoio[i];
    if (!t) return false;
    var r = entraQui(t, ancora);
    if (!r.ok) { avvisa(motivoRifiuto(r)); return false; }
    var s0 = fotoPop();
    togliAnteprima(); togliSuggerimento();
    r.celle.forEach(function (p, k) { impostaValore(p, t.valori[k]); });
    G.pop.vassoio[i] = null;
    G.pop.scelta = -1;
    G.punti += 5 * r.celle.length;
    var sature = M.unitaSature(G.geo, G.val, r.celle), scoppiate = [], guadagno = 0;
    if (sature.length) {
      G.pop.combo++;
      G.pop.maxCombo = Math.max(G.pop.maxCombo, G.pop.combo);
      G.pop.gruppi += sature.length;
      guadagno = 90 * sature.length * sature.length * G.pop.combo;
      G.punti += guadagno;
      var insieme = {};
      sature.forEach(function (u) { G.geo.UNITA[u].forEach(function (q) { insieme[q] = 1; }); });
      scoppiate = Object.keys(insieme).map(Number);
      scoppiate.forEach(function (q) { G.vis[q] = G.val[q]; });     // restano visibili fino all'atterraggio
      scoppiate.forEach(function (q) { impostaValore(q, 0); G.iniziale[q] = 0; });
    } else G.pop.combo = 0;
    var rinnovoAuto = false;
    if (G.pop.vassoio.every(function (x) { return !x; })) nuovoVassoio();
    else if (!qualcunaEntra()) { nuovoVassoio(); G.punti = Math.max(0, G.punti - 30); G.pop.rinnovi++; rinnovoAuto = true; }
    G.storia.push({ pop: 1, s0: s0, s1: fotoPop() });
    if (G.storia.length > 80) G.storia.shift();
    G.futuro = [];

    // animazione: ogni panda vola dalla tessera alla sua casella
    r.celle.forEach(function (p) { celle[p].classList.add('in-arrivo'); });
    ridisegnaTutto();
    var durata = imp.animazioni ? 380 : 0;
    r.celle.forEach(function (p, k) {
      var da = origini && origini[k] ? origini[k] : null;
      if (da && imp.animazioni) vola(P.uso(t.valori[k]), da, celle[p].getBoundingClientRect(), durata, null);
    });
    suono('metti');
    var messaggioPrima = numeroMessaggio;
    setTimeout(function () {
      if (!G) return;
      // se nel frattempo è comparso un altro messaggio (per esempio un aiuto), non lo si copre
      var libero = numeroMessaggio === messaggioPrima;
      r.celle.forEach(function (p) { celle[p].classList.remove('in-arrivo'); });
      anima(r.celle, 'appena', 450);
      if (scoppiate.length) {
        scoppiate.forEach(function (q) { if (imp.animazioni) scoppio(q, G.vis[q]); delete G.vis[q]; });
        ridisegnaTutto();
        puntiVolanti(scoppiate, '+' + guadagno);
        suono('pop');
        var nomi = sature.map(nomeUnita).join(', ');
        if (libero) mostraMessaggio('ok', '<p><strong>Pop!</strong> ' + maiuscola(nomi) + ' ' + (sature.length > 1 ? 'completati' : 'completata') +
          '. Combo ×' + G.pop.combo + ' · +' + guadagno + ' punti.' + (rinnovoAuto ? ' Nessuna tessera entrava più: vassoio rinnovato (−30).' : '') + '</p>');
        annuncia('Pop! ' + nomi + ' liberati. Combo per ' + G.pop.combo + '. Restano ' + daLiberare() + ' panda di partenza.');
      } else if (rinnovoAuto && libero) {
        mostraMessaggio('aiuto', '<p>Nessuna tessera entrava più nella griglia: Pandino ha rinnovato il vassoio (−30 punti). Le nuove tessere entrano sempre.</p>');
        annuncia('Vassoio rinnovato.');
      } else if (libero) { nascondiMessaggio(); annuncia('Tessera posata.'); }
      if (!daLiberare()) vittoria();
    }, durata);
    salvaPartita();
    return true;
  }

  function rinnova() {
    if (!puoAgire() || G.modo !== 'p') return;
    var s0 = fotoPop();
    nuovoVassoio();
    G.punti = Math.max(0, G.punti - 30);
    G.pop.rinnovi++;
    G.pop.combo = 0;
    G.storia.push({ pop: 1, s0: s0, s1: fotoPop() });
    G.futuro = [];
    ridisegnaTutto();
    salvaPartita();
    mostraMessaggio('ok', '<p>Nuove tessere nel vassoio (−30 punti). La combo riparte da zero.</p>');
    annuncia('Vassoio rinnovato.');
  }

  function scegliTessera(i) {
    if (!puoAgire() || G.modo !== 'p') return;
    if (!G.pop.vassoio[i]) { annuncia('La tessera ' + (i + 1) + ' è già stata posata.'); return; }
    G.pop.scelta = G.pop.scelta === i ? -1 : i;
    disegnaVassoio();
    if (G.pop.scelta >= 0) {
      annuncia('Tessera ' + (i + 1) + ' scelta. ' + descriviTessera(G.pop.vassoio[i]) + ' Scegli la casella dove va il suo angolo in alto a sinistra, poi premi Invio.');
      if (G.sel >= 0) mostraAnteprima(G.sel);
    } else { togliAnteprima(); annuncia('Nessuna tessera scelta.'); }
    aggiornaStato();
  }
  function descriviTessera(t) {
    var d = M.dimensioniForma(t.forma);
    return t.valori.length + (t.valori.length === 1 ? ' panda' : ' panda') + ', ingombro ' + d[0] + ' righe per ' + d[1] + ' colonne: ' +
      t.forma.map(function (c, k) { return M.nomePanda(t.valori[k]) + ' in riga ' + (c[0] + 1) + ' colonna ' + (c[1] + 1); }).join('; ') + '.';
  }

  var anteprima = [];
  function togliAnteprima() {
    anteprima.forEach(function (p) {
      var el = celle[p];
      if (!el) return;
      el.classList.remove('anteprima-ok', 'anteprima-ko');
      var f = el.querySelector('.fantasma'); if (f) f.remove();
    });
    anteprima = [];
  }
  function mostraAnteprima(ancora, indice) {
    togliAnteprima();
    var i = typeof indice === 'number' ? indice : G.pop.scelta;
    if (!G || G.modo !== 'p' || i < 0 || !G.pop.vassoio[i] || ancora < 0) return null;
    var t = G.pop.vassoio[i], cel = M.celleForma(G.geo, t.forma, ancora);
    if (!cel) {
      // la parte che entra viene comunque mostrata in rosso
      cel = [];
      t.forma.forEach(function (c) {
        var r = G.geo.RIGA[ancora] + c[0], cc = G.geo.COLONNA[ancora] + c[1];
        if (r < G.n && cc < G.n) cel.push(r * G.n + cc);
      });
      cel.forEach(function (p) { celle[p].classList.add('anteprima-ko'); anteprima.push(p); });
      return { ok: false, motivo: 'fuori' };
    }
    var r = entraQui(t, ancora);
    cel.forEach(function (p, k) {
      celle[p].classList.add(r.ok ? 'anteprima-ok' : 'anteprima-ko');
      if (!G.val[p]) celle[p].insertAdjacentHTML('beforeend', P.uso(t.valori[k], 'fantasma'));
      anteprima.push(p);
    });
    return r;
  }

  function suggerimentoPop() {
    togliSuggerimento(); togliAnteprima();
    var migliore = null;
    for (var i = 0; i < 3; i++) {
      var t = G.pop.vassoio[i];
      if (!t) continue;
      for (var a = 0; a < G.N; a++) {
        var r = entraQui(t, a);
        if (!r.ok) continue;
        var sat = M.unitaSature(G.geo, r.griglia, r.celle);
        var pregio = sat.length * 100 + t.valori.length * 3 - a / 1000;
        if (!migliore || pregio > migliore.pregio) migliore = { i: i, a: a, sat: sat, pregio: pregio };
      }
    }
    G.aiuti++;
    aggiornaContatori();
    if (!migliore) {
      mostraMessaggio('aiuto', '<p>Nessuna tessera entra nella griglia: rinnova il vassoio.</p>', [{ testo: 'Rinnova', primario: true, fn: rinnova }]);
      return;
    }
    G.pop.scelta = migliore.i;
    disegnaVassoio();
    seleziona(migliore.a);
    mostraAnteprima(migliore.a);
    var perche = migliore.sat.length
      ? 'così completi ' + migliore.sat.map(nomeUnita).join(', ') + ' e i panda scoppiano.'
      : 'nessuna posa fa scoppiare un gruppo adesso: questa è la tessera più grande che entra, e prepara il terreno.';
    var testo = 'Posa la tessera ' + (migliore.i + 1) + ' con l’angolo in alto a sinistra nella casella ' + nomeCasella(migliore.a) + ': ' + perche;
    mostraMessaggio('aiuto', '<p><span class="tec">Suggerimento</span>' + testo + '</p>',
      [{ testo: 'Posala qui', primario: true, fn: function () { posaTessera(migliore.i, migliore.a, origineTessera(migliore.i)); } },
        { testo: 'Ci penso io', fn: chiudiSuggerimento }]);
    annuncia(testo);
  }
  function origineTessera(i) {
    var el = $('vassoio').children[i], t = G.pop.vassoio[i];
    if (!el || !t) return null;
    return t.forma.map(function (c) {
      var m = el.querySelector('.mc.piena[data-r="' + c[0] + '"][data-c="' + c[1] + '"]');
      return m ? m.getBoundingClientRect() : null;
    });
  }

  // =====================================================================
  // Fine partita
  // =====================================================================
  function vittoria() {
    if (G.finita) return;
    G.finita = true;
    var punti = G.modo === 'p' ? punteggioAttuale() + Math.round(baseFascia() / 2) : punteggioAttuale();
    var righe = '<tr><th scope="row">Tempo</th><td>' + formatoTempo(G.tempo) + '</td></tr><tr><th scope="row">Punti</th><td>' + punti.toLocaleString('it-IT') + '</td></tr>' +
      '<tr><th scope="row">Aiuti</th><td>' + G.aiuti + '</td></tr>' +
      (G.modo === 'p'
        ? '<tr><th scope="row">Gruppi scoppiati</th><td>' + G.pop.gruppi + '</td></tr><tr><th scope="row">Combo massima</th><td>×' + G.pop.maxCombo + '</td></tr>'
        : '<tr><th scope="row">Panda fuori posto</th><td>' + G.sbagli + '</td></tr>');
    var testo = '<p>Hai completato <strong>' + (G.libera ? 'la partita libera' : 'il livello ' + G.id) + '</strong> (' + G.n + '×' + G.n + ', ' + NOME_MODO[G.modo] +
      ').' + (G.modo === 'p' ? ' Tutti i panda di partenza sono liberi!' : '') + '</p><table class="tabella">' + righe + '</table>';
    var record = false;
    if (!G.libera) {
      var tab = prog.completati[G.modo][G.n], vecchio = tab[G.id];
      record = !vecchio || punti > vecchio.punti || (punti === vecchio.punti && G.tempo < vecchio.tempo);
      var eraAperto = G.id < totale(G.n) && sbloccato(G.n, G.id + 1);
      tab[G.id] = vecchio ? { punti: Math.max(vecchio.punti, punti), tempo: Math.min(vecchio.tempo, G.tempo), volte: (vecchio.volte || 1) + 1 }
        : { punti: punti, tempo: G.tempo, volte: 1 };
      if (vecchio && record) testo += '<p class="messaggio ok"><strong>Nuovo record!</strong> Prima avevi ' + vecchio.punti.toLocaleString('it-IT') + ' punti.</p>';
      else if (vecchio) testo += '<p>Il tuo record resta di ' + vecchio.punti.toLocaleString('it-IT') + ' punti in ' + formatoTempo(vecchio.tempo) + '.</p>';
      if (G.id < totale(G.n) && !eraAperto) testo += '<p><strong>Livello ' + (G.id + 1) + ' sbloccato!</strong></p>';
      $('btn-successivo').hidden = G.id >= totale(G.n);
      prog.ultimo[G.modo + G.n] = Math.min(totale(G.n), G.id + 1);
    } else {
      testo += '<p>Codice della partita: <strong>' + G.liv.seed + '</strong> (' + G.n + '×' + G.n + ', ' + G.liv.fascia + '). Inseriscilo in «Partita libera» per rigiocarla identica.</p>';
      $('btn-successivo').hidden = true;
    }
    var k = chiave(G.modo, G.n, G.id);
    archivio.togli(k);
    delete prog.inCorso[k];
    salvaProgresso();
    aggiornaContatori();
    suono('vittoria');
    anima(Array.from({ length: G.N }, function (_, i) { return i; }), 'lampo', 900);
    $('x-vittoria').innerHTML = testo;
    $('t-vittoria').textContent = record && !G.libera ? 'Livello completato · nuovo record!' : 'Livello completato!';
    annuncia('Livello completato in ' + formatoTempo(G.tempo) + ' con ' + punti + ' punti.');
    setTimeout(function () { apri('d-vittoria'); }, imp.animazioni ? 650 : 0);
  }

  // =====================================================================
  // F. Disegno, accessibilità, animazioni
  // =====================================================================
  function indiceHtml(v) {
    if (imp.indice === 'puntini') return '<span class="num" aria-hidden="true">' + P.puntini(v) + '</span>';
    return '<span class="num" aria-hidden="true">' + v + '</span>';
  }
  function costruisciGriglia() {
    var gr = $('griglia'), n = G.n, geo = G.geo;
    gr.innerHTML = '';
    gr.style.setProperty('--n', n);
    $('tavolozza').style.setProperty('--n', n);
    gr.setAttribute('aria-label', 'Griglia ' + n + ' per ' + n + ' con blocchi ' + geo.bh + ' per ' + geo.bw);
    celle = [];
    for (var r = 0; r < n; r++) {
      var riga = document.createElement('div');
      riga.className = 'riga-g';
      riga.setAttribute('role', 'row');
      for (var c = 0; c < n; c++) {
        var p = r * n + c, el = document.createElement('div');
        el.className = 'cella' + ((c + 1) % geo.bw === 0 && c < n - 1 ? ' b-dx' : '') + ((r + 1) % geo.bh === 0 && r < n - 1 ? ' b-giu' : '');
        el.setAttribute('role', 'gridcell');
        el.tabIndex = -1;
        el.dataset.p = p;
        riga.appendChild(el);
        celle.push(el);
      }
      gr.appendChild(riga);
    }
    $('istruzioni-griglia').textContent = G.modo === 'p'
      ? 'Scegli una tessera con i tasti 1, 2 o 3, spostati con le frecce sulla casella dove va il suo angolo in alto a sinistra e premi Invio. R rinnova le tessere, S chiede un suggerimento.'
      : 'Usa le frecce per spostarti, i tasti da 1 a ' + n + ' per mettere un panda, Canc per toglierlo, M per la matita, S per un suggerimento, Ctrl più Z per annullare.';
  }
  function costruisciTavolozza() {
    var t = $('tavolozza');
    t.innerHTML = '';
    tastiPanda = [];
    for (var v = 1; v <= G.n; v++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tasto-panda';
      b.dataset.v = v;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = P.uso(v, 'icona') + '<span class="n" aria-hidden="true">' + v + '</span><span class="nome" aria-hidden="true">' +
        P.PANDA[v].nome + '</span><span class="resta" aria-hidden="true"></span>';
      b.addEventListener('click', function () {
        var val = +this.dataset.v;
        if (!G) return;
        G.attivo = val;
        if (G.sel >= 0 && modificabile(G.sel)) mettiPanda(G.sel, val);
        else { annuncia('Panda attivo: ' + M.nomePanda(val) + '. Scegli una casella modificabile.'); aggiornaEvidenze(); }
      });
      t.appendChild(b);
      tastiPanda.push(b);
    }
  }
  function disegnaVassoio() {
    var box = $('vassoio');
    if (!G || G.modo !== 'p') { box.innerHTML = ''; return; }
    var lato = Math.max(18, Math.min(30, Math.floor(($('griglia').getBoundingClientRect().width || 300) / G.n * 0.55)));
    var html = '';
    G.pop.vassoio.forEach(function (t, i) {
      if (!t) {
        html += '<button type="button" class="tessera vuota" data-i="' + i + '" aria-label="Tessera ' + (i + 1) + ': già posata" disabled><span class="etichetta-t">' + (i + 1) + ' · posata</span></button>';
        return;
      }
      var d = M.dimensioniForma(t.forma), mappa = {};
      t.forma.forEach(function (c, k) { mappa[c[0] + ',' + c[1]] = t.valori[k]; });
      var mini = '<span class="mini" style="--mc:' + lato + 'px;grid-template-columns:repeat(' + d[1] + ',' + lato + 'px)">';
      for (var r = 0; r < d[0]; r++) for (var c = 0; c < d[1]; c++) {
        var v = mappa[r + ',' + c];
        mini += v ? '<span class="mc piena" data-r="' + r + '" data-c="' + c + '">' + P.uso(v) + (imp.indice === 'nessuno' ? '' : indiceHtml(v)) + '</span>' : '<span class="mc"></span>';
      }
      mini += '</span>';
      html += '<button type="button" class="tessera" data-i="' + i + '" aria-pressed="' + (G.pop.scelta === i) + '" aria-label="Tessera ' + (i + 1) + ': ' +
        descriviTessera(t) + '"><span class="etichetta-t" aria-hidden="true">' + (i + 1) + '</span>' + mini + '</button>';
    });
    box.innerHTML = html;
  }

  function etichettaCella(p) {
    var v = G.val[p];
    var s = 'Riga ' + (G.geo.RIGA[p] + 1) + ', colonna ' + (G.geo.COLONNA[p] + 1) + ', blocco ' + (G.geo.BLOCCO[p] + 1) + ': ';
    if (v) {
      s += M.nomePanda(v);
      if (G.iniziale[p]) s += G.modo === 'p' ? ', panda di partenza da liberare' : ', casella iniziale';
      if (inConflitto(p) && imp.conflitti) s += ', in conflitto con le regole';
      if (sbaglioVisibile(p)) s += ', non corrisponde alla soluzione';
    } else {
      s += 'vuota';
      if (G.modo === 'c') {
        var k = G.note[p] || (imp.auto ? candidatiAuto(p) : 0);
        if (k) s += (G.note[p] ? ', note: ' : ', candidati: ') + M.valoriDi(k).join(', ');
      }
    }
    return s;
  }
  function disegnaCella(p) {
    var el = celle[p], v = G.vis[p] || G.val[p], h = '';
    var conf = imp.conflitti && inConflitto(p), sb = sbaglioVisibile(p);
    if (v) {
      h = P.uso(v) + indiceHtml(v);
      if (G.modo === 'p' && (G.iniziale[p] || G.vis[p])) h += '<span class="stellina" aria-hidden="true">★</span>';
      else if (conf) h += '<span class="segno" aria-hidden="true">!</span>';
      else if (sb) h += '<span class="segno" aria-hidden="true">✕</span>';
    } else if (G.modo === 'c') {
      var k = G.note[p], m = k || (imp.auto ? candidatiAuto(p) : 0);
      if (m) {
        h = '<span class="note' + (k ? '' : ' auto') + '" aria-hidden="true" style="grid-template-columns:repeat(' + G.geo.bw + ',1fr);grid-template-rows:repeat(' + G.geo.bh + ',1fr)">';
        for (var x = 1; x <= G.n; x++) h += '<span>' + (m & bit(x) ? x : '') + '</span>';
        h += '</span>';
      }
    }
    el.innerHTML = h;
    el.classList.toggle('iniziale', !!G.iniziale[p] && G.modo === 'c');
    el.classList.toggle('conflitto', conf);
    el.classList.toggle('sbagliata', sb && !conf);
    el.setAttribute('aria-label', etichettaCella(p));
    el.setAttribute('aria-readonly', G.iniziale[p] || G.modo === 'p' ? 'true' : 'false');
  }
  function ridisegnaTutto() {
    if (!G) return;
    togliAnteprima();
    for (var p = 0; p < G.N; p++) disegnaCella(p);
    if (G.modo === 'p') { disegnaVassoio(); if (G.pop.scelta >= 0 && G.sel >= 0) mostraAnteprima(G.sel); }
    aggiornaEvidenze();
    if (G.modo === 'c') aggiornaTavolozza();
    aggiornaContatori();
  }
  function dopoMossa(toccate) {
    var set = {};
    toccate.forEach(function (p) { set[p] = 1; G.geo.VICINE[p].forEach(function (q) { set[q] = 1; }); });
    Object.keys(set).forEach(function (p) { disegnaCella(+p); });
    aggiornaEvidenze(); aggiornaTavolozza(); aggiornaContatori();
    salvaPartita();
  }
  function pandaEvidenziato() {
    if (!G) return 0;
    if (G.sel >= 0 && G.val[G.sel]) return G.val[G.sel];
    return G.modo === 'c' ? G.attivo || 0 : 0;
  }
  function aggiornaEvidenze() {
    if (!G) return;
    var s = G.sel, v = imp.uguali ? pandaEvidenziato() : 0, geo = G.geo;
    for (var p = 0; p < G.N; p++) {
      var el = celle[p];
      var zona = s >= 0 && p !== s && (geo.RIGA[p] === geo.RIGA[s] || geo.COLONNA[p] === geo.COLONNA[s] || geo.BLOCCO[p] === geo.BLOCCO[s]);
      el.classList.toggle('selezionata', p === s);
      el.classList.toggle('zona', zona);
      el.classList.toggle('uguale', v > 0 && G.val[p] === v && p !== s);
      el.setAttribute('aria-selected', p === s ? 'true' : 'false');
      el.tabIndex = (p === (s >= 0 ? s : 0)) ? 0 : -1;
    }
    tastiPanda.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i + 1 === pandaEvidenziato())); });
    aggiornaStato();
  }
  function aggiornaStato() {
    if (!G) return;
    var s = G.sel, t;
    t = s < 0 ? 'Nessuna casella selezionata.' : '<strong>Casella:</strong> riga ' + (G.geo.RIGA[s] + 1) + ', colonna ' + (G.geo.COLONNA[s] + 1) + ' · ' +
      (G.val[s] ? M.nomePanda(G.val[s]) + (G.iniziale[s] ? (G.modo === 'p' ? ' (di partenza)' : ' (iniziale)') : '') : 'vuota');
    if (G.modo === 'c') {
      var a = pandaEvidenziato();
      t += '<br><strong>Panda attivo:</strong> ' + (a ? M.nomePanda(a) : 'nessuno') + ' · <strong>Matita:</strong> ' + (G.matita ? 'accesa' : 'spenta');
    } else {
      t += '<br><strong>Tessera scelta:</strong> ' + (G.pop.scelta >= 0 ? (G.pop.scelta + 1) + ' (' + G.pop.vassoio[G.pop.scelta].valori.map(M.nomePanda).join(', ') + ')' : 'nessuna');
    }
    $('stato').innerHTML = t;
  }
  function aggiornaTavolozza() {
    if (!G || G.modo !== 'c') return;
    for (var v = 1; v <= G.n; v++) {
      var resta = G.n - piazzati(v), b = tastiPanda[v - 1];
      b.querySelector('.resta').innerHTML = resta > 0 ? '<span class="lungo">mancano </span>' + resta : '✓<span class="lungo"> completo</span>';
      b.classList.toggle('finito', resta <= 0);
      b.setAttribute('aria-label', M.nomePanda(v) + ', ' + P.PANDA[v].tratto + '. ' + (resta > 0 ? 'Ne mancano ' + resta : 'Tutti inseriti') + '.');
    }
  }
  function aggiornaContatori() {
    if (!G) return;
    $('tempo').textContent = formatoTempo(G.tempo);
    $('punti').textContent = punteggioAttuale().toLocaleString('it-IT');
    if (G.modo === 'p') {
      $('combo').textContent = '×' + Math.max(1, G.pop.combo);
      $('da-liberare').textContent = daLiberare();
    } else $('percentuale').textContent = Math.round(piene() / G.N * 100) + '%';
    $('btn-annulla').disabled = !G.storia.length;
    $('btn-ripristina').disabled = !G.futuro.length;
    $('btn-matita').setAttribute('aria-pressed', String(G.matita));
    $('btn-pausa').setAttribute('aria-pressed', String(G.pausa));
  }
  function seleziona(p, conFocus) {
    if (!G) return;
    G.sel = p;
    aggiornaEvidenze();
    if (G.modo === 'p' && G.pop.scelta >= 0) mostraAnteprima(p);
    if (conFocus !== false && p >= 0) celle[p].focus({ preventScroll: true });
  }

  /** Volo di uno sprite lungo una curva di Bézier quadratica, con arco verso l'alto. */
  function vola(html, da, a, durata, poi) {
    if (!imp.animazioni || !da || !a || typeof document.body.animate !== 'function') { if (poi) poi(); return; }
    var el = document.createElement('div');
    el.className = 'volante';
    el.innerHTML = html;
    var w = a.width * 0.82, h = a.height * 0.82;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    document.body.appendChild(el);
    var x0 = da.left + da.width / 2 - w / 2, y0 = da.top + da.height / 2 - h / 2;
    var x2 = a.left + a.width / 2 - w / 2, y2 = a.top + a.height / 2 - h / 2;
    var x1 = (x0 + x2) / 2, y1 = Math.min(y0, y2) - Math.max(50, Math.abs(x2 - x0) * 0.3);
    var s0 = Math.max(0.5, Math.min(1.6, da.width / w)), frame = [];
    for (var k = 0; k <= 20; k++) {
      var t = k / 20, u = 1 - t;
      var x = u * u * x0 + 2 * u * t * x1 + t * t * x2, y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      var s = s0 + (1 - s0) * t;
      frame.push({ transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')', offset: t });
    }
    var an = el.animate(frame, { duration: durata, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
    an.onfinish = function () { el.remove(); if (poi) poi(); };
    setTimeout(function () { if (el.parentNode) { el.remove(); } }, durata + 500);
  }
  function scoppio(p, v) {
    var r = celle[p].getBoundingClientRect(), el = document.createElement('div');
    el.className = 'scoppio';
    el.style.left = r.left + r.width * 0.1 + 'px'; el.style.top = r.top + r.height * 0.1 + 'px';
    el.style.width = r.width * 0.8 + 'px'; el.style.height = r.height * 0.8 + 'px';
    el.innerHTML = P.uso(v);
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 650);
  }
  function puntiVolanti(arr, testo) {
    if (!imp.animazioni || !arr.length) return;
    var x = 0, y = 0;
    arr.forEach(function (p) { var r = celle[p].getBoundingClientRect(); x += r.left + r.width / 2; y += r.top + r.height / 2; });
    var el = document.createElement('div');
    el.className = 'punti-volanti';
    el.textContent = testo;
    el.style.left = (x / arr.length - 30) + 'px'; el.style.top = (y / arr.length - 20) + 'px';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }
  function anima(arr, classe, durata) {
    if (!imp.animazioni) return;
    arr.forEach(function (p) {
      var el = celle[p];
      if (!el) return;
      el.classList.remove(classe); void el.offsetWidth; el.classList.add(classe);
      setTimeout(function () { el.classList.remove(classe); }, durata);
    });
  }

  var numeroMessaggio = 0;
  function mostraMessaggio(tipo, html, azioni) {
    numeroMessaggio++;
    var box = $('messaggio');
    box.className = 'messaggio ' + tipo;
    box.innerHTML = html;
    if (azioni && azioni.length) {
      var d = document.createElement('div');
      d.className = 'azioni';
      azioni.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn piccolo' + (a.primario ? ' primario' : '');
        b.textContent = a.testo;
        b.addEventListener('click', a.fn);
        d.appendChild(b);
      });
      box.appendChild(d);
    }
    box.hidden = false;
  }
  function nascondiMessaggio() { $('messaggio').hidden = true; }
  function avvisa(t) { mostraMessaggio('attenzione', '<p>' + t + '</p>'); annuncia(t); suono('errore'); }
  var tAnnuncio = null;
  function annuncia(t) { var a = $('annuncio'); a.textContent = ''; clearTimeout(tAnnuncio); tAnnuncio = setTimeout(function () { a.textContent = t; }, 40); }
  function formatoTempo(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  // =====================================================================
  // Salvataggio
  // =====================================================================
  var tSalva = null;
  function salvaPartita() { if (!G || G.finita) return; clearTimeout(tSalva); tSalva = setTimeout(salvaSubito, 120); }
  function salvaSubito() {
    if (!G || G.finita) return;
    var k = chiave(G.modo, G.n, G.id);
    var d = {
      val: Array.from(G.val).join(','), ini: Array.from(G.iniziale).join(''), note: Array.from(G.note), escl: Array.from(G.escl),
      tempo: G.tempo, punti: G.punti, aiuti: G.aiuti, sbagli: G.sbagli,
      storia: G.storia.slice(G.modo === 'p' ? -40 : -150), futuro: G.futuro.slice(-20), agg: Date.now(),
      pop: G.pop ? { vassoio: G.pop.vassoio, generati: G.pop.generati, combo: G.pop.combo, maxCombo: G.pop.maxCombo, gruppi: G.pop.gruppi, rinnovi: G.pop.rinnovi } : null
    };
    if (G.libera) d.liv = G.liv;
    archivio.scrivi(k, d);
    prog.inCorso[k] = { agg: d.agg };
    if (!G.libera) prog.ultimo[G.modo + G.n] = G.id;
    var chiavi = Object.keys(prog.inCorso);
    if (chiavi.length > 40) {
      chiavi.sort(function (a, b) { return prog.inCorso[a].agg - prog.inCorso[b].agg; });
      chiavi.slice(0, chiavi.length - 40).forEach(function (x) { archivio.togli(x); delete prog.inCorso[x]; });
    }
    salvaProgresso();
  }
  function ripristinaPartita(d) {
    var val = d.val.split(',').map(Number);
    for (var p = 0; p < G.N; p++) {
      G.val[p] = val[p] || 0; G.iniziale[p] = +d.ini[p] || 0;
      G.note[p] = d.note[p] || 0; G.escl[p] = d.escl[p] || 0;
    }
    ricostruisciConteggi();
    G.tempo = d.tempo || 0; G.punti = d.punti || 0; G.aiuti = d.aiuti || 0; G.sbagli = d.sbagli || 0;
    G.storia = d.storia || []; G.futuro = d.futuro || [];
    if (G.pop && d.pop) Object.assign(G.pop, d.pop, { scelta: -1 });
  }

  // =====================================================================
  // G. Schermate
  // =====================================================================
  function mostraSchermata(id) {
    ['s-inizio', 's-livelli', 's-gioco'].forEach(function (s) { $(s).hidden = s !== id; });
    if (id !== 's-gioco') { fermaTimer(); document.title = 'Pandino'; togliAnteprima(); }
    document.body.className = 'modo-' + (id === 's-gioco' && G ? G.modo : imp.modo);
    if (id === 's-inizio') disegnaInizio();
    if (id === 's-livelli') disegnaLivelli();
    window.scrollTo(0, 0);
  }
  function disegnaInizio() {
    document.querySelectorAll('[data-modo]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.modo === imp.modo)); });
    document.querySelectorAll('.taglie [data-n]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.n === imp.n)); });
    var r = '';
    TAGLIE.slice().reverse().forEach(function (n) {
      r += '<div class="dato"><b>' + Object.keys(prog.completati[imp.modo][n]).length + ' / ' + totale(n) + '</b><span>' + n + '×' + n + ' completati · ' + NOME_MODO[imp.modo] + '</span></div>';
    });
    var cor = livelloCorrente(imp.modo, imp.n);
    r += '<div class="dato"><b>Livello ' + cor + '</b><span>Livello corrente ' + imp.n + '×' + imp.n + ' · ' + livello(imp.n, cor).fascia + '</span></div>';
    $('riepilogo').innerHTML = r;
    var pr = prossimiSbloccati(imp.modo, imp.n, 8);
    $('prossimi').textContent = (pr.length ? 'Livelli ' + imp.n + '×' + imp.n + ' sbloccati da giocare in ' + NOME_MODO[imp.modo] + ': ' + pr.join(', ') + '.' : 'Hai completato tutti i livelli sbloccati di questa griglia.') +
      (archivio.disponibile ? '' : ' Attenzione: questo browser non permette di salvare, i progressi andranno persi alla chiusura.');
    $('btn-continua').textContent = (inCorso(imp.modo, imp.n, cor) ? 'Riprendi il livello ' : 'Gioca il livello ') + cor + ' (' + imp.n + '×' + imp.n + ')';
  }

  var vista = { capitolo: 0, pagina: 0, filtro: 'tutti', pagLung: 50 };
  function disegnaLivelli(focusId) {
    var n = imp.n, cat = CATALOGO[n];
    $('livelli-modo').textContent = NOME_MODO[imp.modo] + ' · ' + n + '×' + n;
    var tg = $('taglie-livelli');
    tg.innerHTML = '';
    TAGLIE.slice().reverse().forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.setAttribute('aria-pressed', String(k === n));
      b.innerHTML = '<span>Griglia ' + k + '×' + k + '</span><small>' + totale(k) + ' livelli</small>';
      b.addEventListener('click', function () { imp.n = k; salvaImpostazioni(); vista.capitolo = 0; vista.pagina = 0; disegnaLivelli(); });
      tg.appendChild(b);
    });
    if (vista.capitolo >= cat.capitoli.length) vista.capitolo = 0;
    var cap = $('capitoli');
    cap.innerHTML = '';
    cat.capitoli.forEach(function (c, i) {
      var fatti = 0;
      for (var id = c.da; id <= c.a; id++) if (completato(imp.modo, n, id)) fatti++;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.setAttribute('aria-pressed', String(i === vista.capitolo));
      b.innerHTML = '<span>Capitolo ' + (i + 1) + ' · ' + c.fascia + '</span><small>Livelli ' + c.da + '–' + c.a + ' · ' + fatti + ' completati</small>';
      b.addEventListener('click', function () { vista.capitolo = i; vista.pagina = 0; disegnaLivelli(); });
      cap.appendChild(b);
    });
    var c0 = cat.capitoli[vista.capitolo], ids = [];
    for (var id = c0.da; id <= c0.a; id++) {
      var ok = vista.filtro === 'tutti' ||
        (vista.filtro === 'sbloccati' && sbloccato(n, id) && !completato(imp.modo, n, id)) ||
        (vista.filtro === 'in-corso' && inCorso(imp.modo, n, id)) ||
        (vista.filtro === 'completati' && completato(imp.modo, n, id));
      if (ok) ids.push(id);
    }
    var pagine = Math.max(1, Math.ceil(ids.length / vista.pagLung));
    if (vista.pagina >= pagine) vista.pagina = pagine - 1;
    var mostra = ids.slice(vista.pagina * vista.pagLung, (vista.pagina + 1) * vista.pagLung);
    $('conteggio-livelli').textContent = ids.length ? ids.length + ' livelli in questo capitolo con il filtro scelto. Pagina ' + (vista.pagina + 1) + ' di ' + pagine + '.'
      : 'Nessun livello in questo capitolo con il filtro scelto.';
    var ul = $('elenco-livelli'), corrente = livelloCorrente(imp.modo, n);
    ul.innerHTML = '';
    mostra.forEach(function (id) {
      var li = document.createElement('li'), b = document.createElement('button');
      var aperto = sbloccato(n, id), fatto = prog.completati[imp.modo][n][id], corso = inCorso(imp.modo, n, id);
      b.type = 'button';
      b.className = 'livello-btn' + (fatto ? ' completato' : '') + (corso ? ' in-corso' : '') + (id === corrente ? ' corrente' : '');
      b.dataset.id = id;
      b.innerHTML = '<span class="n">' + id + '</span><span class="st">' + (!aperto ? '🔒 bloccato' : corso ? '▶ in corso' : fatto ? '✓ ' + formatoTempo(fatto.tempo) : 'da giocare') + '</span>';
      b.setAttribute('aria-label', 'Livello ' + id + ', ' + titolo(n, id) + ', ' + livello(n, id).fascia + ', ' +
        (!aperto ? 'bloccato: completa il livello ' + (id - 1) + ' per aprirlo' : corso ? 'partita in corso' : fatto ? 'completato, record ' + fatto.punti + ' punti in ' + formatoTempo(fatto.tempo) : 'da giocare') +
        (id === corrente ? ', livello corrente' : ''));
      b.disabled = !aperto;
      b.addEventListener('click', function () { apriLivello(imp.modo, n, id); });
      li.appendChild(b); ul.appendChild(li);
    });
    var nav = $('pagine');
    nav.innerHTML = '';
    if (pagine > 1) {
      for (var i = 0; i < pagine; i++) (function (i) {
        var b = document.createElement('button');
        var primo = ids[i * vista.pagLung], ultimo = ids[Math.min(ids.length, (i + 1) * vista.pagLung) - 1];
        b.type = 'button'; b.className = 'btn piccolo';
        b.textContent = primo + '–' + ultimo;
        b.setAttribute('aria-label', 'Pagina ' + (i + 1) + ', livelli da ' + primo + ' a ' + ultimo);
        b.setAttribute('aria-pressed', String(i === vista.pagina));
        if (i === vista.pagina) b.setAttribute('aria-current', 'page');
        b.addEventListener('click', function () { vista.pagina = i; disegnaLivelli(); });
        nav.appendChild(b);
      })(i);
    }
    $('cerca-livello').max = totale(n);
    $('cerca-livello').placeholder = '1 – ' + totale(n);
    if (focusId) { var el = ul.querySelector('[data-id="' + focusId + '"]'); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }
  }
  function vaiAlLivello(id) {
    var n = imp.n;
    if (!(id >= 1 && id <= totale(n))) { $('conteggio-livelli').textContent = 'Scrivi un numero da 1 a ' + totale(n) + '.'; annuncia($('conteggio-livelli').textContent); return; }
    vista.capitolo = capitoloDi(n, id);
    vista.filtro = 'tutti'; $('filtro').value = 'tutti';
    vista.pagina = Math.floor((id - CATALOGO[n].capitoli[vista.capitolo].da) / vista.pagLung);
    disegnaLivelli(id);
    if (!sbloccato(n, id)) {
      var t = 'Il livello ' + id + ' è ancora bloccato: completa il livello ' + (id - 1) + ' per aprirlo.';
      $('conteggio-livelli').textContent = t; annuncia(t);
    }
  }

  /** All'apertura DLX verifica che il puzzle abbia una sola soluzione, uguale a quella del catalogo. */
  function verificaLivello(liv) {
    try {
      var r = M.contaSoluzioniDLX(M.geometria(liv.n), M.daTesto(liv.puzzle), 2);
      return r.conteggio === 1 && M.aTesto(r.soluzione) === liv.soluzione;
    } catch (e) { return false; }
  }

  function apriLivello(modo, n, id, opz) {
    opz = opz || {};
    var k = chiave(modo, n, id), salvata = opz.ricomincia ? null : archivio.leggi(k, null);
    var liv = opz.liv || (typeof id === 'number' ? livello(n, id) : salvata && salvata.liv);
    if (!liv) { mostraSchermata('s-livelli'); return; }
    var avviso = '';
    if (!verificaLivello(liv)) {
      var sost = CATALOGO[n].riserva.filter(function (r) { return r.fascia === liv.fascia; })[0] || CATALOGO[n].riserva[0];
      liv = Object.assign({}, sost, { id: liv.id });
      salvata = null;
      avviso = 'Il livello non ha superato il controllo di unicità: lo sostituisco con un livello di riserva verificato della stessa difficoltà.';
    }
    nuovaPartita(modo, liv, typeof id !== 'number');
    if (opz.ricomincia) { archivio.togli(k); delete prog.inCorso[k]; salvaProgresso(); }
    var ripreso = false;
    if (salvata && salvata.val) { ripristinaPartita(salvata); ripreso = true; }
    if (modo === 'p' && !G.pop.vassoio.some(function (x) { return x; })) nuovoVassoio();
    if (typeof id === 'number') { prog.ultimo[modo + n] = id; salvaProgresso(); }
    document.body.className = 'modo-' + modo;
    costruisciGriglia();
    costruisciTavolozza();
    $('t-gioco').textContent = (typeof id === 'number' ? 'Livello ' + id + ' · ' : '') + titolo(n, id);
    $('meta-livello').innerHTML = (modo === 'p' ? '<span class="pop-banner">💥 Panda Pop · variante arcade a tessere</span> ' : 'Sudoku classico · ') +
      n + '×' + n + ' · ' + liv.fascia + ' (stima: ' + (DESCRIZIONE_TECNICA[liv.tecnica] || 'tecnica stimata') + ')' +
      (typeof id === 'number' ? ' · completati ' + Object.keys(prog.completati[modo][n]).length + ' su ' + totale(n) : ' · codice ' + liv.seed);
    document.title = 'Pandino · ' + (typeof id === 'number' ? 'Livello ' + id + ' (' + n + '×' + n + ')' : 'Partita libera');
    $('velo-pausa').hidden = true;
    $('griglia').removeAttribute('aria-hidden');
    $('griglia').inert = false;
    mostraSchermata('s-gioco');
    ridisegnaTutto();
    var primo = 0;
    for (var p = 0; p < G.N; p++) if (!G.val[p]) { primo = p; break; }
    seleziona(primo);
    if (avviso) mostraMessaggio('attenzione', '<p>' + avviso + '</p>');
    else if (ripreso) mostraMessaggio('ok', '<p>Partita ripresa da dove l’avevi lasciata (' + formatoTempo(G.tempo) + ').</p>');
    else if (modo === 'p') mostraMessaggio('aiuto', '<p><strong>Obiettivo:</strong> liberare i ' + daLiberare() + ' panda di partenza (★). Scegli una tessera e posala: quando una riga, una colonna o un blocco si riempie, i suoi panda scoppiano.</p>');
    else if (typeof id === 'number' && completato(modo, n, id)) mostraMessaggio('ok', '<p>Hai già completato questo livello: rigiocalo per battere il tuo record di ' + prog.completati[modo][n][id].punti.toLocaleString('it-IT') + ' punti.</p>');
    else nascondiMessaggio();
    annuncia((ripreso ? 'Partita ripresa. ' : '') + $('t-gioco').textContent + '. ' + NOME_MODO[modo] + ', griglia ' + n + ' per ' + n + ', ' + liv.fascia + '. Soluzione unica verificata.');
    avviaTimer();
  }

  function esciDalGioco() {
    var vai = function () { mostraSchermata(G && G.libera ? 's-inizio' : 's-livelli'); };
    if (G && !G.finita && G.storia.length) {
      conferma('Lasci il livello?', 'La partita resta salvata in questo browser: potrai riprenderla da dove l’hai lasciata.', 'Esci').then(function (ok) { if (ok) { salvaSubito(); vai(); } });
    } else vai();
  }
  function ricomincia() {
    if (!G) return;
    var fn = function () { apriLivello(G.modo, G.n, G.id, { ricomincia: true, liv: G.libera ? G.liv : null }); };
    if (G.storia.length && !G.finita) conferma('Ricominciare il livello?', 'Le mosse fatte finora andranno perse. Il tempo riparte da zero.', 'Ricomincia').then(function (ok) { if (ok) fn(); });
    else fn();
  }
  function pausa(forza) {
    if (!G || G.finita) return;
    G.pausa = typeof forza === 'boolean' ? forza : !G.pausa;
    $('velo-pausa').hidden = !G.pausa;
    $('griglia').inert = G.pausa;
    if (G.pausa) $('griglia').setAttribute('aria-hidden', 'true'); else $('griglia').removeAttribute('aria-hidden');
    aggiornaContatori();
    annuncia(G.pausa ? 'Gioco in pausa: la griglia è nascosta.' : 'Gioco ripreso.');
    if (G.pausa) $('btn-riprendi').focus(); else seleziona(G.sel >= 0 ? G.sel : 0);
    salvaPartita();
  }
  var tTimer = null, ultimoTick = 0, ultimoSalva = 0;
  function avviaTimer() {
    fermaTimer();
    ultimoTick = performance.now();
    tTimer = setInterval(function () {
      var ora = performance.now(), d = ora - ultimoTick;
      ultimoTick = ora;
      if (!G || G.finita || G.pausa || document.hidden) return;
      G.tempo += Math.min(d, 2000);
      $('tempo').textContent = formatoTempo(G.tempo);
      if (G.modo === 'c') $('punti').textContent = punteggioAttuale().toLocaleString('it-IT');
      if (G.tempo - ultimoSalva > 5000) { ultimoSalva = G.tempo; salvaSubito(); }
    }, 250);
  }
  function fermaTimer() { if (tTimer) clearInterval(tTimer); tTimer = null; }

  // --- partita libera: generazione in un Worker con limite di tempo e riserva ---
  var FASCE_TAGLIA = { 9: ['Facile', 'Medio', 'Difficile', 'Esperto'], 6: ['Facile', 'Medio', 'Difficile'], 4: ['Facile'] };
  var MINIMO_FACILE = { 9: 34, 6: 16, 4: 7 };
  var CODICE_WORKER = [
    'self.onmessage = function (e) {',
    '  var M = self.PandinoMotore, n = e.data.n, f = e.data.fascia, s = e.data.seed >>> 0, minimo = e.data.minimo, geo = M.geometria(n);',
    '  for (var t = 0; t < 20000; t++) {',
    '    var seed = (s + t) >>> 0; if (!seed) continue;',
    '    var g = M.generaPuzzle(n, seed, { minimoIndizi: minimo });',
    '    var v = M.valuta(geo, g.puzzle);',
    '    if (M.fasciaDi(n, v, g.indizi) === f && M.contaSoluzioniDLX(geo, g.puzzle, 2).conteggio === 1) {',
    '      self.postMessage({ fatto: true, liv: { n: n, seed: seed, minimo: minimo, puzzle: M.aTesto(g.puzzle), soluzione: M.aTesto(g.soluzione), fascia: f, tecnica: M.tecnicaPrincipale(v), punteggio: v.punteggio } });',
    '      return;',
    '    }',
    '    if (t % 10 === 0) self.postMessage({ tentativi: t + 1 });',
    '  }',
    '  self.postMessage({ fallito: true });',
    '};'
  ].join('\n');
  function aggiornaFasceLibera() {
    var n = +$('libera-n').value, sel = $('libera-fascia');
    sel.innerHTML = FASCE_TAGLIA[n].map(function (f) { return '<option>' + f + '</option>'; }).join('');
  }
  var lavoratore = null;
  function creaPartitaLibera() {
    var n = +$('libera-n').value, fascia = $('libera-fascia').value;
    var su = parseInt($('libera-seed').value, 10);
    var seed = su > 0 ? su >>> 0 : Math.floor(Math.random() * 4294967294) + 1;
    var minimo = fascia === 'Facile' ? MINIMO_FACILE[n] : 0;
    $('libera-scelta').hidden = true; $('libera-attesa').hidden = false;
    $('libera-testo').textContent = 'Sto preparando una partita ' + n + '×' + n + ' ' + fascia.toLowerCase() + ' con una sola soluzione…';
    var finito = false;
    function riserva(motivo) {
      if (finito) return;
      finito = true;
      if (lavoratore) { lavoratore.terminate(); lavoratore = null; }
      var lista = CATALOGO[n].riserva.filter(function (r) { return r.fascia === fascia; });
      var r = lista[seed % lista.length] || CATALOGO[n].riserva[0];
      avviaLibera(Object.assign({}, r, { id: 'R' + r.seed }), motivo);
    }
    var limite = setTimeout(function () { riserva('La generazione ha richiesto troppo tempo: ti propongo un livello di riserva già verificato.'); }, 6000);
    try {
      var url = URL.createObjectURL(new Blob([$('codice-motore').textContent + '\n' + CODICE_WORKER], { type: 'text/javascript' }));
      lavoratore = new Worker(url);
      URL.revokeObjectURL(url);
      lavoratore.onmessage = function (e) {
        if (finito) return;
        if (e.data.tentativi) { $('libera-testo').textContent = 'Sto preparando la partita… (' + e.data.tentativi + ' tentativi)'; return; }
        clearTimeout(limite);
        if (e.data.fallito) { riserva('Non ho trovato in tempo un puzzle di questa difficoltà: ti propongo un livello di riserva verificato.'); return; }
        finito = true;
        lavoratore.terminate(); lavoratore = null;
        var liv = e.data.liv;
        liv.id = 'L' + n + '-' + liv.seed + liv.fascia.charAt(0);
        avviaLibera(liv, '');
      };
      lavoratore.onerror = function () { clearTimeout(limite); riserva('Questo browser non permette di generare al momento: ti propongo un livello di riserva verificato.'); };
      lavoratore.postMessage({ n: n, fascia: fascia, seed: seed, minimo: minimo });
    } catch (err) {
      clearTimeout(limite);
      riserva('Questo browser non permette di generare al momento: ti propongo un livello di riserva verificato.');
    }
  }
  function avviaLibera(liv, avviso) {
    chiudi('d-libera');
    $('libera-scelta').hidden = false; $('libera-attesa').hidden = true;
    apriLivello(imp.modo, liv.n, liv.id, { liv: liv, ricomincia: true });
    if (avviso) mostraMessaggio('attenzione', '<p>' + avviso + '</p>');
  }

  // --- finestre ---------------------------------------------------------------
  var ultimoFocus = null;
  function apri(id) {
    var d = $(id);
    if (d.open) return;
    ultimoFocus = document.activeElement;
    if (id === 'd-impostazioni') riempiImpostazioni();
    if (id === 'd-legenda') $('leg-chiaro').checked = !!imp.chiaro;
    if (id === 'd-libera') { $('libera-n').value = String(imp.n); aggiornaFasceLibera(); }
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function chiudi(id) { var d = $(id); if (d.open) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); } }
  function conferma(t, x, si) {
    return new Promise(function (ris) {
      var d = $('d-conferma');
      $('t-conferma').textContent = t; $('x-conferma').textContent = x; $('conferma-si').textContent = si;
      d.returnValue = '';
      var fine = function () { d.removeEventListener('close', fine); ris(d.returnValue === 'si'); };
      d.addEventListener('close', fine);
      apri('d-conferma');
    });
  }
  function riempiLegenda() {
    var ul = $('legenda');
    ul.innerHTML = '';
    for (var v = 1; v <= 9; v++) {
      var li = document.createElement('li');
      li.innerHTML = P.uso(v, 'icona') + '<b aria-hidden="true">' + v + '</b><span><strong>' + P.PANDA[v].nome + '</strong><span class="specie">' + P.PANDA[v].specie +
        '</span><small>' + maiuscola(P.PANDA[v].tratto) + '</small></span>';
      li.setAttribute('aria-label', 'Numero ' + v + ': ' + P.PANDA[v].nome + ', ' + P.PANDA[v].tratto);
      ul.appendChild(li);
    }
    var sf = $('sfilata');
    sf.innerHTML = '';
    for (v = 1; v <= 9; v++) { var s = document.createElement('span'); s.innerHTML = P.uso(v, 'icona'); s.title = v + ' · ' + P.PANDA[v].nome; sf.appendChild(s); }
    $('marchio-panda').innerHTML = P.uso(9, 'icona');
  }
  function riempiImpostazioni() {
    var f = $('form-impostazioni');
    f.errori.value = imp.errori; f.tema.value = imp.tema; f.indice.value = imp.indice;
    ['conflitti', 'auto', 'uguali', 'chiaro', 'animazioni', 'suoni'].forEach(function (k) { f[k].checked = !!imp[k]; });
  }
  function applicaImpostazioni() {
    var root = document.documentElement;
    root.classList.toggle('anim', !!imp.animazioni);
    if (imp.tema === 'auto') root.removeAttribute('data-tema'); else root.setAttribute('data-tema', imp.tema);
    $('contenuto').classList.toggle('chiaro', !!imp.chiaro);
    $('contenuto').classList.toggle('senza-indice', imp.indice === 'nessuno');
    $('rapido-auto').checked = !!imp.auto;
    if (G && !$('s-gioco').hidden) ridisegnaTutto();
  }

  // =====================================================================
  // H. Tastiera, mouse, tocco, trascinamento, suoni
  // =====================================================================
  function finestraAperta() { return !!document.querySelector('dialog[open]'); }
  document.addEventListener('keydown', function (e) {
    if (finestraAperta() || $('s-gioco').hidden || !G) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    var k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) ripristina(); else annulla(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); ripristina(); return; }
    if (mod || e.altKey) return;
    if (k === 'p' || k === 'P') { e.preventDefault(); pausa(); return; }
    if (G.pausa) return;
    var s = G.sel, n = G.n;
    if (k.indexOf('Arrow') === 0) {
      var dentro = $('griglia').contains(document.activeElement) || document.activeElement === document.body;
      if (!dentro && document.activeElement && document.activeElement.closest('.tavolozza, .vassoio, .strumenti, .azioni, .messaggio')) return;
      e.preventDefault();
      if (s < 0) s = 0;
      var r = G.geo.RIGA[s], c = G.geo.COLONNA[s];
      if (k === 'ArrowUp') r = Math.max(0, r - 1);
      if (k === 'ArrowDown') r = Math.min(n - 1, r + 1);
      if (k === 'ArrowLeft') c = Math.max(0, c - 1);
      if (k === 'ArrowRight') c = Math.min(n - 1, c + 1);
      seleziona(r * n + c);
      return;
    }
    if (k === 's' || k === 'S') { e.preventDefault(); suggerimento(); return; }
    if (k === 'Escape') {
      e.preventDefault();
      if (G.suggerimento || anteprima.length && G.modo !== 'p') chiudiSuggerimento();
      else if (G.modo === 'p' && G.pop.scelta >= 0) { G.pop.scelta = -1; togliAnteprima(); disegnaVassoio(); aggiornaStato(); annuncia('Nessuna tessera scelta.'); }
      else { G.sel = -1; aggiornaEvidenze(); }
      return;
    }
    if (G.modo === 'p') {
      if (/^[1-3]$/.test(k)) { e.preventDefault(); scegliTessera(+k - 1); return; }
      if ((k === 'Enter' || k === ' ') && $('griglia').contains(document.activeElement)) {
        e.preventDefault();
        if (G.pop.scelta < 0) { annuncia('Scegli prima una tessera con i tasti 1, 2 o 3.'); return; }
        posaTessera(G.pop.scelta, s, origineTessera(G.pop.scelta));
        return;
      }
      if (k === 'r' || k === 'R') { e.preventDefault(); rinnova(); return; }
      return;
    }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); if (+k > n) return; if (s >= 0) mettiPanda(s, +k); else { G.attivo = +k; aggiornaEvidenze(); } return; }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); svuota(s); return; }
    if (k === 'm' || k === 'M') { e.preventDefault(); attivaMatita(); return; }
  });
  function attivaMatita() {
    if (!G || G.modo !== 'c') return;
    G.matita = !G.matita;
    aggiornaContatori(); aggiornaStato();
    annuncia(G.matita ? 'Matita accesa: i panda verranno scritti come note.' : 'Matita spenta.');
  }

  // griglia: clic, passaggio del puntatore (anteprima delle tessere)
  function collegaGriglia() {
    var gr = $('griglia');
    gr.addEventListener('click', function (e) {
      var el = e.target.closest('.cella');
      if (!el || !G || G.pausa) return;
      var p = +el.dataset.p;
      if (G.modo === 'p' && G.pop.scelta >= 0) { seleziona(p); posaTessera(G.pop.scelta, p, origineTessera(G.pop.scelta)); return; }
      seleziona(p, true);
    });
    gr.addEventListener('pointermove', function (e) {
      if (!G || G.modo !== 'p' || G.pop.scelta < 0 || trascina || e.pointerType === 'touch') return;
      var el = e.target.closest('.cella');
      if (el && +el.dataset.p !== G.sel) { G.sel = +el.dataset.p; aggiornaEvidenze(); mostraAnteprima(G.sel); }
    });
    gr.addEventListener('focusin', function (e) {
      var el = e.target.closest('.cella');
      if (el && G && +el.dataset.p !== G.sel) seleziona(+el.dataset.p, false);
    });
  }

  // vassoio: scelta con un tocco, oppure trascinamento con il dito o il mouse
  var trascina = null;
  function collegaVassoio() {
    var box = $('vassoio');
    box.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.tessera');
      if (!b || b.disabled || !G || G.pausa) return;
      var mc = e.target.closest('.mc.piena');
      trascina = { i: +b.dataset.i, b: b, x: e.clientX, y: e.clientY, attivo: false, dr: mc ? +mc.dataset.r : 0, dc: mc ? +mc.dataset.c : 0, id: e.pointerId, el: null };
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* niente */ }
    });
    box.addEventListener('pointermove', function (e) {
      if (!trascina || e.pointerId !== trascina.id) return;
      if (!trascina.attivo && Math.hypot(e.clientX - trascina.x, e.clientY - trascina.y) > 8) iniziaTrascinamento();
      if (trascina.attivo) muoviTrascinamento(e.clientX, e.clientY);
    });
    var fine = function (e) {
      if (!trascina || e.pointerId !== trascina.id) return;
      var t = trascina;
      trascina = null;
      if (!t.attivo) { scegliTessera(t.i); return; }
      var ancora = t.ancora, origini = t.el ? Array.prototype.map.call(t.el.querySelectorAll('.mc'), function (m) { return m.getBoundingClientRect(); }) : null;
      if (t.el) t.el.remove();
      t.b.classList.remove('trascinata');
      if (e.type === 'pointerup' && ancora >= 0) {
        G.pop.scelta = t.i;
        if (!posaTessera(t.i, ancora, origini)) { G.pop.scelta = -1; togliAnteprima(); disegnaVassoio(); }
      } else { togliAnteprima(); G.pop.scelta = -1; disegnaVassoio(); }
    };
    box.addEventListener('pointerup', fine);
    box.addEventListener('pointercancel', fine);
    box.addEventListener('click', function (e) {
      // attivazione da tastiera (Invio o Spazio sul pulsante della tessera)
      var b = e.target.closest('.tessera');
      if (b && e.detail === 0) scegliTessera(+b.dataset.i);
    });
  }
  function iniziaTrascinamento() {
    var t = trascina, tes = G.pop.vassoio[t.i];
    if (!tes) { trascina = null; return; }
    t.attivo = true;
    t.b.classList.add('trascinata');
    var lato = celle[0].getBoundingClientRect().width, d = M.dimensioniForma(tes.forma);
    var el = document.createElement('div');
    el.className = 'trascinamento';
    el.style.gridTemplateColumns = 'repeat(' + d[1] + ',' + lato + 'px)';
    el.style.gridTemplateRows = 'repeat(' + d[0] + ',' + lato + 'px)';
    tes.forma.forEach(function (c, k) {
      var m = document.createElement('div');
      m.className = 'mc';
      m.style.gridRow = String(c[0] + 1); m.style.gridColumn = String(c[1] + 1);
      m.innerHTML = P.uso(tes.valori[k]);
      el.appendChild(m);
    });
    document.body.appendChild(el);
    t.el = el; t.lato = lato; t.ancora = -1;
  }
  function muoviTrascinamento(x, y) {
    var t = trascina, lato = t.lato;
    // il dito non copre la tessera: la si solleva un po' sopra il punto di contatto
    var su = 0;
    var ox = x - (t.dc + 0.5) * lato, oy = y - (t.dr + 0.5) * lato - su;
    t.el.style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
    var cx = ox + lato / 2, cy = oy + lato / 2;
    var sotto = document.elementFromPoint(cx, cy), cel = sotto && sotto.closest && sotto.closest('.cella');
    var ancora = cel ? +cel.dataset.p : -1;
    if (ancora !== t.ancora) {
      t.ancora = ancora;
      if (ancora >= 0) { G.sel = ancora; aggiornaEvidenze(); mostraAnteprima(ancora, t.i); } else togliAnteprima();
    }
  }

  // suoni: generati dal browser, solo dopo la prima interazione
  var audio = null, interagito = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { interagito = true; }, { capture: true, passive: true }); });
  function suono(tipo) {
    if (!imp.suoni || !interagito) return;
    try {
      if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; audio = new AC(); }
      if (audio.state === 'suspended') audio.resume();
      var note = { metti: [[620, .07]], nota: [[880, .04]], errore: [[200, .16]], gruppo: [[660, .08], [880, .12]],
        pop: [[700, .06], [940, .06], [1250, .1]], vittoria: [[523, .12], [659, .12], [784, .12], [1047, .25]] }[tipo] || [[600, .06]];
      var t0 = audio.currentTime;
      note.forEach(function (x) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = tipo === 'errore' ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(x[0], t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + x[1]);
        o.connect(g); g.connect(audio.destination);
        o.start(t0); o.stop(t0 + x[1] + 0.02);
        t0 += x[1] * 0.8;
      });
    } catch (e) { /* audio non disponibile */ }
  }

  function collega() {
    document.querySelectorAll('[data-apri]').forEach(function (b) { b.addEventListener('click', function () { apri(b.dataset.apri); }); });
    document.querySelectorAll('[data-chiudi]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });
    document.querySelectorAll('[data-vai]').forEach(function (b) { b.addEventListener('click', function () { mostraSchermata(b.dataset.vai); }); });
    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('close', function () { if (ultimoFocus && document.contains(ultimoFocus) && !ultimoFocus.closest('[hidden]')) ultimoFocus.focus({ preventScroll: true }); });
      d.addEventListener('click', function (e) { if (e.target === d && d.id !== 'd-vittoria') d.close(); });
    });
    document.querySelectorAll('[data-modo]').forEach(function (b) { b.addEventListener('click', function () { imp.modo = b.dataset.modo; salvaImpostazioni(); disegnaInizio(); document.body.className = 'modo-' + imp.modo; }); });
    document.querySelectorAll('.taglie [data-n]').forEach(function (b) { b.addEventListener('click', function () { imp.n = +b.dataset.n; salvaImpostazioni(); disegnaInizio(); }); });
    $('btn-livelli').addEventListener('click', function () {
      var c = livelloCorrente(imp.modo, imp.n);
      vista.capitolo = capitoloDi(imp.n, c);
      vista.pagina = Math.floor((c - CATALOGO[imp.n].capitoli[vista.capitolo].da) / vista.pagLung);
      mostraSchermata('s-livelli');
    });
    $('btn-continua').addEventListener('click', function () { apriLivello(imp.modo, imp.n, livelloCorrente(imp.modo, imp.n)); });
    $('btn-libera').addEventListener('click', function () { apri('d-libera'); });
    $('libera-n').addEventListener('change', aggiornaFasceLibera);
    $('btn-genera').addEventListener('click', creaPartitaLibera);
    $('form-vai').addEventListener('submit', function (e) { e.preventDefault(); vaiAlLivello(parseInt($('cerca-livello').value, 10)); });
    $('filtro').addEventListener('change', function () { vista.filtro = this.value; vista.pagina = 0; disegnaLivelli(); });
    $('btn-matita').addEventListener('click', attivaMatita);
    $('btn-suggerimento').addEventListener('click', suggerimento);
    $('btn-annulla').addEventListener('click', annulla);
    $('btn-ripristina').addEventListener('click', ripristina);
    $('btn-cancella').addEventListener('click', function () { if (G) svuota(G.sel); });
    $('btn-controlla').addEventListener('click', controlla);
    $('btn-rinnova').addEventListener('click', rinnova);
    $('btn-pausa').addEventListener('click', function () { pausa(); });
    $('btn-riprendi').addEventListener('click', function () { pausa(false); });
    $('btn-nuova').addEventListener('click', ricomincia);
    $('btn-esci').addEventListener('click', esciDalGioco);
    $('rapido-auto').addEventListener('change', function () { imp.auto = this.checked; salvaImpostazioni(); ridisegnaTutto(); });
    $('leg-chiaro').addEventListener('change', function () { imp.chiaro = this.checked; salvaImpostazioni(); applicaImpostazioni(); });
    $('form-impostazioni').addEventListener('change', function (e) {
      var nome = e.target.name;
      if (nome === 'errori' || nome === 'tema' || nome === 'indice') imp[nome] = this[nome].value; else if (nome) imp[nome] = e.target.checked;
      salvaImpostazioni(); applicaImpostazioni();
    });
    $('btn-azzera').addEventListener('click', function () {
      chiudi('d-impostazioni');
      conferma('Cancellare tutti i progressi?', 'Livelli completati, record e partite salvate verranno eliminati da questo browser. Non si può tornare indietro.', 'Cancella tutto').then(function (ok) {
        if (!ok) return;
        Object.keys(prog.inCorso).forEach(function (k) { archivio.togli(k); });
        prog = progVuoto(); salvaProgresso(); G = null;
        mostraSchermata('s-inizio'); annuncia('Progressi cancellati.');
      });
    });
    $('btn-successivo').addEventListener('click', function () { chiudi('d-vittoria'); if (G && typeof G.id === 'number' && G.id < totale(G.n)) apriLivello(G.modo, G.n, G.id + 1); });
    $('btn-rigioca').addEventListener('click', function () { chiudi('d-vittoria'); if (G) apriLivello(G.modo, G.n, G.id, { ricomincia: true, liv: G.libera ? G.liv : null }); });
    $('btn-vai-livelli').addEventListener('click', function () { chiudi('d-vittoria'); mostraSchermata(G && G.libera ? 's-inizio' : 's-livelli'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) salvaSubito(); });
    window.addEventListener('pagehide', salvaSubito);
    collegaGriglia();
    collegaVassoio();
  }

  function avvio() {
    $('simboli').innerHTML = P.simboli();
    riempiLegenda();
    collega();
    applicaImpostazioni();
    mostraSchermata('s-inizio');
  }

  // Interfaccia minima per le verifiche automatiche (nessun effetto sul gioco)
  window.Pandino = {
    livelli: function (n) { return totale(n || 9); },
    livello: function (n, id) { return livello(n, id); },
    partita: function () {
      return G && { modo: G.modo, n: G.n, id: G.id, val: Array.from(G.val).join(''), ini: Array.from(G.iniziale).join(''), tempo: G.tempo, punti: G.punti,
        finita: G.finita, sel: G.sel, vassoio: G.pop ? G.pop.vassoio : null, scelta: G.pop ? G.pop.scelta : -1, liberare: G.pop ? daLiberare() : 0 };
    },
    verifica: verificaLivello
  };
  avvio();
})();
