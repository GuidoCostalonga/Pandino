/*
 * Pandino · applicazione
 * ---------------------------------------------------------------------------
 * Sezioni:
 *  A. Catalogo dei livelli e titoli
 *  B. Archivio nel browser (impostazioni, progressi, partite salvate)
 *  C. Stato della partita: per ogni casella vuota / segno / panda; per ogni
 *     casella quanti panda la «coprono» (stessa riga, colonna, boschetto o
 *     contatto), aggiornato a ogni mossa senza ricalcolare tutto
 *  D. Mosse, annulla e ripristina, cuori, vittoria
 *  E. Suggerimenti
 *  F. Disegno della griglia e accessibilità
 *  G. Schermate: inizio, livelli, gioco, partita libera
 *  H. Tocco, trascinamento, tastiera, suoni, avvio
 */
(function () {
  'use strict';
  var M = window.PandinoMotore, P = window.PandinoPanda;
  var $ = function (id) { return document.getElementById(id); };
  var FATTORE = { Facile: 1, Medio: 1.4, Difficile: 1.8, Esperto: 2.4 };
  var NOMI_CAPITOLO = ['Foresta', 'Montagna', 'Vetta'];

  // =====================================================================
  // A. Catalogo
  // =====================================================================
  var grezzi = JSON.parse($('dati-livelli').textContent);
  var LIVELLI = [], CAPITOLI = [], RISERVA = {};
  function daRiga(n, r, id) {
    return { n: n, id: id, zone: r[0].split('').map(function (ch) { return M.NOMI_ZONA.indexOf(ch); }),
      soluzione: r[1].split(',').map(Number), fascia: M.FASCE[r[2]], punteggio: r[3], seed: r[4] };
  }
  grezzi.c.forEach(function (c, i) {
    var n = c[0], da = LIVELLI.length + 1;
    c[1].forEach(function (r) { LIVELLI.push(daRiga(n, r, LIVELLI.length + 1)); });
    CAPITOLI.push({ n: n, da: da, a: LIVELLI.length, nome: NOMI_CAPITOLO[i] || ('Capitolo ' + (i + 1)) });
    RISERVA[n] = c[2].map(function (r, k) { return daRiga(n, r, 'R' + n + '-' + (k + 1)); });
  });
  var TOTALE = LIVELLI.length;
  function livello(id) { return LIVELLI[id - 1] || null; }
  function capitoloDi(id) { for (var i = 0; i < CAPITOLI.length; i++) if (id >= CAPITOLI[i].da && id <= CAPITOLI[i].a) return i; return 0; }
  var LUOGHI = ['Bosco di bambù', 'Ruscello', 'Radura', 'Collina', 'Sentiero', 'Pagoda', 'Lanterne', 'Nebbiolina', 'Cascata', 'Giardino',
    'Ponticello', 'Laghetto', 'Prato', 'Grotta', 'Vetta', 'Foresta', 'Valle', 'Rifugio', 'Stagno', 'Boschetto', 'Orto', 'Altopiano', 'Sorgente', 'Terrazza', 'Capanna'];
  var MOMENTI = ['all’alba', 'di mattina', 'a mezzogiorno', 'di pomeriggio', 'al tramonto', 'di sera', 'sotto le stelle', 'con la pioggia',
    'con la neve', 'in primavera', 'in estate', 'in autunno', 'in inverno', 'col vento', 'al chiaro di luna', 'dopo il temporale', 'in festa',
    'a merenda', 'in silenzio', 'col sole', 'tra le nuvole', 'di buon umore', 'a passo lento', 'in compagnia', 'con l’arcobaleno',
    'di nascosto', 'all’ora del tè', 'con calma', 'in punta di zampe', 'senza fretta', 'con un sorriso', 'a sorpresa', 'in gran segreto',
    'prima di cena', 'a mezzanotte', 'con il fresco', 'nel silenzio', 'a occhi aperti', 'con le lucciole', 'al primo sole', 'tra i fiori', 'dopo la pioggia', 'a colazione', 'in viaggio'];
  function titolo(id) {
    if (typeof id !== 'number') return 'Partita libera';
    return LUOGHI[(id - 1) % LUOGHI.length] + ' ' + MOMENTI[Math.floor((id - 1) / LUOGHI.length) % MOMENTI.length];
  }

  // =====================================================================
  // B. Archivio
  // =====================================================================
  var PREFISSO = 'pandino.v3.';
  var archivio = {
    disponibile: true,
    leggi: function (k, d) { try { var s = localStorage.getItem(PREFISSO + k); return s ? JSON.parse(s) : d; } catch (e) { this.disponibile = false; return d; } },
    scrivi: function (k, v) { try { localStorage.setItem(PREFISSO + k, JSON.stringify(v)); return true; } catch (e) { this.disponibile = false; return false; } },
    togli: function (k) { try { localStorage.removeItem(PREFISSO + k); } catch (e) { /* niente */ } }
  };
  var moviMeno = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var imp = Object.assign({ cuori: true, ombre: true, conflitti: true, lettere: true, animazioni: !moviMeno, suoni: true, tema: 'auto', strumento: 'ciclo' },
    archivio.leggi('impostazioni', {}));
  function progVuoto() { return { completati: {}, inCorso: {}, ultimo: 0 }; }
  var prog = Object.assign(progVuoto(), archivio.leggi('progresso', {}));
  function salvaImp() { archivio.scrivi('impostazioni', imp); }
  function salvaProg() { archivio.scrivi('progresso', prog); }
  function chiave(id) { return 'partita.' + id; }
  function completato(id) { return !!prog.completati[id]; }
  function inCorso(id) { return !!prog.inCorso[id]; }
  /** I primi tre livelli di ogni capitolo sono aperti; ogni livello completato apre il successivo. */
  function sbloccato(id) {
    var c = CAPITOLI[capitoloDi(id)];
    return id - c.da < 3 || completato(id) || completato(id - 1) || inCorso(id);
  }
  function prossimi(k) { var o = []; for (var id = 1; id <= TOTALE && o.length < k; id++) if (sbloccato(id) && !completato(id)) o.push(id); return o; }
  function corrente() {
    var u = prog.ultimo;
    if (u && livello(u) && sbloccato(u) && (!completato(u) || inCorso(u))) return u;
    var p = prossimi(1);
    return p.length ? p[0] : 1;
  }

  // =====================================================================
  // C. Stato della partita
  // =====================================================================
  var G = null, celle = [];
  function nuovaPartita(liv) {
    var n = liv.n, geo = M.geometria(n), N = n * n, ombre = [];
    for (var p = 0; p < N; p++) ombre.push(Object.keys(M.ombra(n, liv.zone, p)).map(Number));
    G = {
      liv: liv, id: liv.id, n: n, N: N, geo: geo, zone: liv.zone, ombre: ombre, U: M.unita(n, liv.zone),
      solCella: new Uint8Array(N), stato: new Uint8Array(N), coperta: new Uint8Array(N), controllate: new Uint8Array(N),
      cuori: 3, persi: 0, tempo: 0, aiuti: 0, storia: [], futuro: [], finita: false, persa: false, sel: -1, pausa: false, suggerite: []
    };
    liv.soluzione.forEach(function (c, r) { G.solCella[r * n + c] = 1; });
    return G;
  }
  /** Cambia una casella; se entra o esce un panda aggiorna solo le caselle che copre. */
  function imposta(p, v) {
    var vecchio = G.stato[p];
    if (vecchio === v) return;
    if (vecchio === 2) G.ombre[p].forEach(function (q) { G.coperta[q]--; });
    G.stato[p] = v;
    if (v === 2) G.ombre[p].forEach(function (q) { G.coperta[q]++; });
    G.controllate[p] = 0;
  }
  function ricostruisci() {
    G.coperta.fill(0);
    for (var p = 0; p < G.N; p++) if (G.stato[p] === 2) G.ombre[p].forEach(function (q) { G.coperta[q]++; });
  }
  function conflitto(p) { return G.stato[p] === 2 && G.coperta[p] > 0; }
  /** Confronto immediato con la soluzione: la casella ospita davvero un panda? */
  function sbagliata(p) { return G.stato[p] === 2 && !G.solCella[p]; }
  function contaPanda() { var k = 0; for (var p = 0; p < G.N; p++) if (G.stato[p] === 2) k++; return k; }
  function puoAgire() { return G && !G.finita && !G.pausa; }
  function nomeCasella(p) { return M.nomeCasella(G.geo, p); }

  // =====================================================================
  // D. Mosse
  // =====================================================================
  /** Applica più cambi come una sola mossa annullabile. */
  function mossa(cambi, opz) {
    opz = opz || {};
    var reali = cambi.filter(function (c) { return G.stato[c[0]] !== c[1]; }).map(function (c) { return [c[0], G.stato[c[0]], c[1]]; });
    if (!reali.length) return [];
    reali.forEach(function (c) { imposta(c[0], c[2]); });
    G.storia.push(reali);
    if (G.storia.length > 500) G.storia.shift();
    G.futuro = [];
    dopoMossa(reali.map(function (c) { return c[0]; }));
    return reali;
  }
  function annulla() {
    if (!puoAgire()) return;
    var m = G.storia.pop();
    if (!m) { annuncia('Non ci sono mosse da annullare.'); return; }
    for (var i = m.length - 1; i >= 0; i--) imposta(m[i][0], m[i][1]);
    G.futuro.push(m);
    dopoMossa(m.map(function (c) { return c[0]; }));
    annuncia('Mossa annullata.');
  }
  function ripristina() {
    if (!puoAgire()) return;
    var m = G.futuro.pop();
    if (!m) { annuncia('Non ci sono mosse da ripristinare.'); return; }
    m.forEach(function (c) { imposta(c[0], c[2]); });
    G.storia.push(m);
    dopoMossa(m.map(function (c) { return c[0]; }));
    annuncia('Mossa ripristinata.');
  }

  /** Un tocco sulla casella, secondo lo strumento scelto. */
  function tocca(p, strumento) {
    if (!puoAgire() || p < 0) return;
    var s = G.stato[p], nuovo;
    strumento = strumento || imp.strumento;
    if (strumento === 'panda') nuovo = s === 2 ? 0 : 2;
    else if (strumento === 'segno') nuovo = s === 1 ? 0 : 1;
    else nuovo = s === 0 ? 1 : s === 1 ? 2 : 0;
    imposta0(p, nuovo);
  }
  function imposta0(p, nuovo) {
    togliSuggerimento();
    if (nuovo === 2) return mettiPanda(p);
    mossa([[p, nuovo]]);
    nascondiMessaggio();
    annuncia(nuovo === 1 ? 'Segno messo in ' + nomeCasella(p) + '.' : 'Casella ' + nomeCasella(p) + ' svuotata.');
    suono(nuovo === 1 ? 'segno' : 'via');
  }
  function mettiPanda(p, forzato) {
    if (imp.cuori && !G.solCella[p] && !forzato) {
      // con i cuori, un panda nel posto sbagliato costa un cuore e la casella si segna
      G.cuori--; G.persi++;
      mossa([[p, 1]]);
      anima([p], 'scuoti', 450);
      suono('errore');
      if (G.cuori <= 0) { sconfitta(); return; }
      mostraMessaggio('attenzione', '<p><strong>Qui il panda non va.</strong> Perdi un cuore: ne restano ' + G.cuori + '. La casella è segnata con ✕.</p>');
      annuncia('Qui il panda non va. Restano ' + G.cuori + ' cuori.');
      aggiornaContatori();
      return;
    }
    mossa([[p, 2]]);
    anima([p], 'appena', 450);
    suono('panda');
    if (conflitto(p) && imp.conflitti) {
      var testo = 'Questo panda ' + perche(p) + '.';
      mostraMessaggio('attenzione', '<p><strong>Conflitto:</strong> ' + testo + '</p>');
      annuncia('Conflitto: ' + testo);
    } else nascondiMessaggio();
    annuncia('Panda in ' + nomeCasella(p) + '. ' + contaPanda() + ' su ' + G.n + '.');
    controllaFine();
  }
  function perche(p) {
    var g = G.geo, ragioni = [];
    for (var q = 0; q < G.N; q++) {
      if (q === p || G.stato[q] !== 2 || G.ombre[p].indexOf(q) < 0) continue;
      if (g.RIGA[q] === g.RIGA[p]) ragioni.push('è nella stessa riga del panda in ' + nomeCasella(q));
      else if (g.COLONNA[q] === g.COLONNA[p]) ragioni.push('è nella stessa colonna del panda in ' + nomeCasella(q));
      else if (G.zone[q] === G.zone[p]) ragioni.push('è nello stesso boschetto del panda in ' + nomeCasella(q));
      else ragioni.push('tocca il panda in ' + nomeCasella(q));
    }
    return ragioni.join(' e ');
  }
  function controllaFine() {
    if (contaPanda() !== G.n) return;
    var giusti = 0;
    for (var p = 0; p < G.N; p++) if (G.stato[p] === 2 && G.solCella[p]) giusti++;
    if (giusti === G.n) { vittoria(); return; }
    mostraMessaggio('attenzione', '<p>Hai messo tutti i ' + G.n + ' panda, ma qualcosa non torna. Premi «Controlla» per vedere dove.</p>');
  }
  function controlla() {
    if (!puoAgire()) return;
    var sb = 0, conf = 0;
    for (var p = 0; p < G.N; p++) {
      if (sbagliata(p)) { sb++; G.controllate[p] = 1; }
      if (conflitto(p)) conf++;
    }
    ridisegna();
    var t = !sb && !conf ? 'Finora è tutto giusto: ' + contaPanda() + ' panda su ' + G.n + ', tutti al posto giusto.'
      : (sb ? sb + (sb === 1 ? ' panda non è' : ' panda non sono') + ' al posto giusto (bordo rosso e «?»). ' : '') +
        (conf ? conf + (conf === 1 ? ' panda è' : ' panda sono') + ' in conflitto con le regole (righe diagonali e «!»).' : '');
    mostraMessaggio(sb || conf ? 'attenzione' : 'ok', '<p>' + t + '</p>');
    annuncia(t);
  }
  function punteggio() {
    var base = Math.round(G.N * 10 * (FATTORE[G.liv.fascia] || 1));
    return Math.max(Math.round(base * 0.2), base - Math.floor(G.tempo / 2000) - 40 * G.aiuti - 80 * G.persi);
  }
  function vittoria() {
    G.finita = true;
    var punti = punteggio(), testo, record = false, aperto = false;
    testo = '<p>Tutti i ' + G.n + ' panda hanno trovato il loro boschetto!</p><table class="tabella">' +
      '<tr><th scope="row">Tempo</th><td>' + tempo(G.tempo) + '</td></tr><tr><th scope="row">Punti</th><td>' + punti.toLocaleString('it-IT') + '</td></tr>' +
      '<tr><th scope="row">Aiuti</th><td>' + G.aiuti + '</td></tr>' + (imp.cuori ? '<tr><th scope="row">Cuori rimasti</th><td>' + G.cuori + ' su 3</td></tr>' : '') + '</table>';
    if (typeof G.id === 'number') {
      var v = prog.completati[G.id];
      record = !v || punti > v.punti;
      aperto = G.id < TOTALE && sbloccato(G.id + 1);
      prog.completati[G.id] = v ? { punti: Math.max(v.punti, punti), tempo: Math.min(v.tempo, G.tempo), volte: (v.volte || 1) + 1 } : { punti: punti, tempo: G.tempo, volte: 1 };
      if (v && record) testo += '<p class="messaggio ok"><strong>Nuovo record!</strong> Prima avevi ' + v.punti.toLocaleString('it-IT') + ' punti.</p>';
      else if (v) testo += '<p>Il tuo record resta di ' + v.punti.toLocaleString('it-IT') + ' punti.</p>';
      if (G.id < TOTALE && !aperto) testo += '<p><strong>Livello ' + (G.id + 1) + ' sbloccato!</strong></p>';
      prog.ultimo = Math.min(TOTALE, G.id + 1);
      $('btn-successivo').hidden = G.id >= TOTALE;
    } else {
      testo += '<p>Codice del livello: <strong>' + G.liv.seed + '</strong> (' + G.n + '×' + G.n + '). Inseriscilo in «Partita libera» per rigiocarlo.</p>';
      $('btn-successivo').hidden = true;
    }
    archivio.togli(chiave(G.id)); delete prog.inCorso[G.id]; salvaProg();
    aggiornaContatori();
    suono('vittoria');
    if (imp.animazioni) {
      var k = 0;
      for (var p = 0; p < G.N; p++) if (G.stato[p] === 2) { celle[p].style.setProperty('--ritardo', (k++ * 0.08) + 's'); }
      anima(Array.from({ length: G.N }, function (_, i) { return i; }).filter(function (q) { return G.stato[q] === 2; }), 'festa', 1400);
    }
    $('t-fine').textContent = record && typeof G.id === 'number' && prog.completati[G.id].volte > 1 ? 'Livello completato · nuovo record!' : 'Livello completato!';
    $('x-fine').innerHTML = testo;
    $('btn-rigioca').textContent = 'Rigioca';
    annuncia('Livello completato in ' + tempo(G.tempo) + ' con ' + punti + ' punti.');
    setTimeout(function () { apri('d-fine'); }, imp.animazioni ? 900 : 0);
  }
  function sconfitta() {
    G.finita = true; G.persa = true;
    archivio.togli(chiave(G.id)); delete prog.inCorso[G.id]; salvaProg();
    aggiornaContatori(); ridisegna();
    $('t-fine').textContent = 'Cuori finiti';
    $('x-fine').innerHTML = '<p>Hai usato tutti e tre i cuori. Niente paura: il livello è sempre lì, riprova con calma.</p>' +
      '<p class="nota">Nelle impostazioni puoi scegliere il modo rilassato, senza cuori.</p>';
    $('btn-successivo').hidden = true;
    $('btn-rigioca').textContent = 'Riprova';
    annuncia('Cuori finiti. Puoi riprovare il livello.');
    setTimeout(function () { apri('d-fine'); }, 500);
  }

  // =====================================================================
  // E. Suggerimenti
  // =====================================================================
  function suggerimento() {
    if (!puoAgire()) return;
    togliSuggerimento();
    G.aiuti++;
    aggiornaContatori();
    for (var p = 0; p < G.N; p++) {
      if (sbagliata(p)) {
        evidenzia([p]); seleziona(p);
        mostraMessaggio('aiuto', '<p><span class="tec">Prima un controllo</span>Il panda in ' + nomeCasella(p) + ' non è al posto giusto: ogni ragionamento partirebbe storto. Conviene toglierlo.</p>',
          [{ testo: 'Togli il panda', primario: true, fn: (function (q) { return function () { togliSuggerimento(); mossa([[q, 0]]); nascondiMessaggio(); }; })(p) }, { testo: 'Chiudi', fn: chiudiSuggerimento }]);
        annuncia('Il panda in ' + nomeCasella(p) + ' non è al posto giusto.');
        return;
      }
    }
    for (p = 0; p < G.N; p++) {
      if (G.stato[p] === 1 && G.solCella[p]) {
        evidenzia([p]); seleziona(p);
        mostraMessaggio('aiuto', '<p><span class="tec">Prima un controllo</span>Hai segnato con ✕ la casella ' + nomeCasella(p) + ', ma lì invece può stare un panda. Togli il segno e ragiona di nuovo su quella zona.</p>',
          [{ testo: 'Togli il segno', primario: true, fn: (function (q) { return function () { togliSuggerimento(); mossa([[q, 0]]); nascondiMessaggio(); }; })(p) }, { testo: 'Chiudi', fn: chiudiSuggerimento }]);
        annuncia('Il segno in ' + nomeCasella(p) + ' è sbagliato.');
        return;
      }
    }
    var passo = M.prossimoPasso(G.n, G.zone, Array.from(G.stato));
    if (passo && passo.tipo === 'piazza' && G.solCella[passo.cella]) {
      evidenzia([passo.cella], passo.evidenzia); seleziona(passo.cella);
      mostraMessaggio('aiuto', '<p><span class="tec">' + passo.nomeTecnica + '</span>' + passo.testo + '</p>',
        [{ testo: 'Metti il panda', primario: true, fn: function () { togliSuggerimento(); mettiPanda(passo.cella, true); } }, { testo: 'Ci penso io', fn: chiudiSuggerimento }]);
      annuncia('Suggerimento. ' + passo.testo);
      return;
    }
    if (passo && passo.tipo === 'escludi') {
      evidenzia(passo.celle, passo.evidenzia);
      mostraMessaggio('aiuto', '<p><span class="tec">' + passo.nomeTecnica + '</span>' + passo.testo + '</p>',
        [{ testo: 'Segna con ✕', primario: true, fn: function () {
          togliSuggerimento();
          mossa(passo.celle.map(function (q) { return [q, 1]; }));
          mostraMessaggio('ok', '<p>Caselle segnate. Chiedi un altro aiuto se ti serve.</p>');
        } }, { testo: 'Ci penso io', fn: chiudiSuggerimento }]);
      annuncia('Suggerimento. ' + passo.testo);
      return;
    }
    mostraMessaggio('aiuto', '<p><span class="tec">Nessuna deduzione trovata</span>Con i ragionamenti che conosco non trovo una mossa sicura in questa posizione, e non tiro a indovinare.</p><p>Posso mostrarti dove sta un panda, contandolo come aiuto.</p>',
      [{ testo: 'Mostra un panda', primario: true, fn: rivela }, { testo: 'Chiudi', fn: chiudiSuggerimento }]);
    annuncia('Nessuna deduzione sicura trovata.');
  }
  function rivela() {
    if (!puoAgire()) return;
    for (var r = 0; r < G.n; r++) {
      var p = r * G.n + G.liv.soluzione[r];
      if (G.stato[p] !== 2) { togliSuggerimento(); G.aiuti++; seleziona(p); mettiPanda(p, true); return; }
    }
  }
  function evidenzia(celleS, contorno) {
    G.suggerite = celleS.slice().concat(contorno || []);
    (contorno || []).forEach(function (p) { celle[p].classList.add('evidenza'); });
    celleS.forEach(function (p) { celle[p].classList.add('suggerita'); });
  }
  function togliSuggerimento() {
    if (!G) return;
    G.suggerite.forEach(function (p) { if (celle[p]) celle[p].classList.remove('suggerita', 'evidenza'); });
    G.suggerite = [];
  }
  function chiudiSuggerimento() { togliSuggerimento(); nascondiMessaggio(); }

  // =====================================================================
  // F. Disegno e accessibilità
  // =====================================================================
  function costruisciGriglia() {
    var gr = $('griglia'), n = G.n, z = G.zone;
    gr.innerHTML = '';
    gr.style.setProperty('--n', n);
    gr.setAttribute('aria-label', 'Griglia ' + n + ' per ' + n + ' con ' + n + ' boschetti');
    celle = [];
    var prima = {};
    for (var r = 0; r < n; r++) {
      var riga = document.createElement('div');
      riga.setAttribute('role', 'row');
      riga.style.display = 'contents';
      for (var c = 0; c < n; c++) {
        var p = r * n + c, el = document.createElement('div'), zz = z[p];
        var cl = 'cella z' + zz;
        if (r > 0 && z[p - n] !== zz) cl += ' zt';
        if (c > 0 && z[p - 1] !== zz) cl += ' zl';
        if (c < n - 1 && z[p + 1] !== zz) cl += ' zr';
        if (r < n - 1 && z[p + n] !== zz) cl += ' zb';
        el.className = cl;
        el.setAttribute('role', 'gridcell');
        el.tabIndex = -1;
        el.dataset.p = p;
        if (!(zz in prima)) { prima[zz] = p; el.dataset.lettera = M.NOMI_ZONA[zz]; }
        riga.appendChild(el);
        celle.push(el);
      }
      gr.appendChild(riga);
    }
  }
  function etichetta(p) {
    var s = 'Riga ' + (G.geo.RIGA[p] + 1) + ', colonna ' + (G.geo.COLONNA[p] + 1) + ', ' + M.nomeZona(G.zone[p]) + ': ';
    var st = G.stato[p];
    if (st === 2) {
      s += 'panda';
      if (conflitto(p) && imp.conflitti) s += ', in conflitto: ' + perche(p);
      if (sbagliata(p) && G.controllate[p]) s += ', non è al posto giusto';
    } else if (st === 1) s += 'segnata con una croce';
    else s += 'vuota' + (G.coperta[p] && imp.ombre ? ', esclusa da un panda' : '');
    return s;
  }
  function disegnaCella(p) {
    var el = celle[p], st = G.stato[p], h = '';
    if (imp.lettere && el.dataset.lettera) h += '<span class="lettera" aria-hidden="true">' + el.dataset.lettera + '</span>';
    if (st === 2) {
      h += P.uso(G.zone[p] % 10 + 1);
      if (conflitto(p) && imp.conflitti) h += '<span class="allarme" aria-hidden="true">!</span>';
      else if (sbagliata(p) && G.controllate[p]) h += '<span class="allarme" aria-hidden="true">?</span>';
    } else if (st === 1) h += '<span class="segno" aria-hidden="true">✕</span>';
    else if (G.coperta[p] && imp.ombre) h += '<span class="puntino" aria-hidden="true"></span>';
    el.innerHTML = h;
    el.classList.toggle('conflitto', st === 2 && conflitto(p) && imp.conflitti);
    el.classList.toggle('sbagliata', sbagliata(p) && !!G.controllate[p]);
    el.setAttribute('aria-label', etichetta(p));
  }
  function ridisegna() {
    if (!G) return;
    for (var p = 0; p < G.N; p++) disegnaCella(p);
    evidenziaSelezione(); aggiornaContatori();
  }
  function dopoMossa(toccate) {
    var set = {};
    toccate.forEach(function (p) { set[p] = 1; G.ombre[p].forEach(function (q) { set[q] = 1; }); });
    Object.keys(set).forEach(function (p) { disegnaCella(+p); });
    evidenziaSelezione(); aggiornaContatori(); salva();
  }
  function evidenziaSelezione() {
    if (!G) return;
    for (var p = 0; p < G.N; p++) {
      celle[p].classList.toggle('selezionata', p === G.sel);
      celle[p].setAttribute('aria-selected', p === G.sel ? 'true' : 'false');
      celle[p].tabIndex = p === (G.sel >= 0 ? G.sel : 0) ? 0 : -1;
    }
    var s = G.sel;
    $('stato').innerHTML = (s < 0 ? 'Nessuna casella selezionata.' : '<strong>Casella:</strong> ' + nomeCasella(s) + ' · ' + M.nomeZona(G.zone[s]) + ' · ' +
      (G.stato[s] === 2 ? 'panda' : G.stato[s] === 1 ? 'segno ✕' : 'vuota')) +
      '<br><strong>Un tocco:</strong> ' + { ciclo: 'segno, poi panda, poi vuota', panda: 'mette o toglie il panda', segno: 'mette o toglie il segno' }[imp.strumento];
  }
  function aggiornaContatori() {
    if (!G) return;
    $('tempo').textContent = tempo(G.tempo);
    $('conta-panda').textContent = contaPanda() + ' / ' + G.n;
    $('box-cuori').hidden = !imp.cuori;
    var h = '';
    for (var i = 0; i < 3; i++) h += '<span class="cuore' + (i < G.cuori ? '' : ' perso') + '" aria-hidden="true">❤️</span>';
    $('cuori').innerHTML = h + '<span class="nascosto">' + G.cuori + ' cuori su 3</span>';
    $('btn-annulla').disabled = !G.storia.length;
    $('btn-ripristina').disabled = !G.futuro.length;
    $('btn-pausa').setAttribute('aria-pressed', String(G.pausa));
    document.querySelectorAll('[data-strumento]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.strumento === imp.strumento)); });
  }
  function seleziona(p, focus) {
    if (!G) return;
    G.sel = p;
    evidenziaSelezione();
    if (focus !== false && p >= 0) celle[p].focus({ preventScroll: true });
  }
  function anima(arr, classe, durata) {
    if (!imp.animazioni) return;
    arr.forEach(function (p) {
      var el = celle[p]; if (!el) return;
      el.classList.remove(classe); void el.offsetWidth; el.classList.add(classe);
      setTimeout(function () { el.classList.remove(classe); }, durata);
    });
  }
  var nMsg = 0;
  function mostraMessaggio(tipo, html, azioni) {
    nMsg++;
    var box = $('messaggio');
    box.className = 'messaggio ' + tipo;
    box.innerHTML = html;
    if (azioni) {
      var d = document.createElement('div');
      d.className = 'azioni';
      azioni.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn piccolo' + (a.primario ? ' primario' : '');
        b.textContent = a.testo; b.addEventListener('click', a.fn);
        d.appendChild(b);
      });
      box.appendChild(d);
    }
    box.hidden = false;
  }
  function nascondiMessaggio() { $('messaggio').hidden = true; }
  var tAnn = null;
  function annuncia(t) { var a = $('annuncio'); a.textContent = ''; clearTimeout(tAnn); tAnn = setTimeout(function () { a.textContent = t; }, 40); }
  function tempo(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  // salvataggio
  var tSalva = null;
  function salva() { if (!G || G.finita) return; clearTimeout(tSalva); tSalva = setTimeout(salvaSubito, 120); }
  function salvaSubito() {
    if (!G || G.finita) return;
    var d = { stato: Array.from(G.stato).join(''), cuori: G.cuori, persi: G.persi, tempo: G.tempo, aiuti: G.aiuti,
      storia: G.storia.slice(-200), futuro: G.futuro.slice(-50), agg: Date.now() };
    if (typeof G.id !== 'number') d.liv = G.liv;
    archivio.scrivi(chiave(G.id), d);
    prog.inCorso[G.id] = d.agg;
    if (typeof G.id === 'number') prog.ultimo = G.id;
    var k = Object.keys(prog.inCorso);
    if (k.length > 40) {
      k.sort(function (a, b) { return prog.inCorso[a] - prog.inCorso[b]; });
      k.slice(0, k.length - 40).forEach(function (x) { archivio.togli(chiave(x)); delete prog.inCorso[x]; });
    }
    salvaProg();
  }

  // =====================================================================
  // G. Schermate
  // =====================================================================
  function mostra(id) {
    ['s-inizio', 's-livelli', 's-gioco'].forEach(function (s) { $(s).hidden = s !== id; });
    if (id !== 's-gioco') { fermaTimer(); document.title = 'Pandino'; }
    if (id === 's-inizio') disegnaInizio();
    if (id === 's-livelli') disegnaLivelli();
    window.scrollTo(0, 0);
  }
  function disegnaInizio() {
    var c = corrente(), r = '';
    CAPITOLI.forEach(function (cap, i) {
      var fatti = 0;
      for (var id = cap.da; id <= cap.a; id++) if (completato(id)) fatti++;
      var tot = cap.a - cap.da + 1;
      r += '<div class="dato"><b>' + fatti + ' / ' + tot + '</b><span>Capitolo ' + (i + 1) + ' · ' + cap.nome + ' · ' + cap.n + '×' + cap.n + '</span>' +
        '<div class="barra" aria-hidden="true"><i style="width:' + Math.round(fatti / tot * 100) + '%"></i></div></div>';
    });
    $('riepilogo').innerHTML = r;
    var pr = prossimi(8);
    $('prossimi').textContent = 'Livelli completati: ' + Object.keys(prog.completati).length + ' su ' + TOTALE + '. ' +
      (pr.length ? 'Da giocare adesso: ' + pr.join(', ') + '.' : '') + (archivio.disponibile ? '' : ' Attenzione: questo browser non permette di salvare i progressi.');
    $('btn-continua').textContent = (inCorso(c) ? 'Riprendi il livello ' : 'Gioca il livello ') + c;
  }
  var vista = { capitolo: 0, pagina: 0, filtro: 'tutti', lung: 50 };
  function disegnaLivelli(focusId) {
    var cap = $('capitoli');
    cap.innerHTML = '';
    CAPITOLI.forEach(function (c, i) {
      var fatti = 0;
      for (var id = c.da; id <= c.a; id++) if (completato(id)) fatti++;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.setAttribute('aria-pressed', String(i === vista.capitolo));
      b.innerHTML = '<span>' + (i + 1) + ' · ' + c.nome + ' · ' + c.n + '×' + c.n + '</span><small>Livelli ' + c.da + '–' + c.a + ' · ' + fatti + ' completati</small>';
      b.addEventListener('click', function () { vista.capitolo = i; vista.pagina = 0; disegnaLivelli(); });
      cap.appendChild(b);
    });
    var c0 = CAPITOLI[vista.capitolo], ids = [];
    for (var id = c0.da; id <= c0.a; id++) {
      var f = vista.filtro, ok = f === 'tutti' || (f === 'sbloccati' && sbloccato(id) && !completato(id)) || (f === 'in-corso' && inCorso(id)) ||
        (f === 'completati' && completato(id)) || livello(id).fascia === f;
      if (ok) ids.push(id);
    }
    var pagine = Math.max(1, Math.ceil(ids.length / vista.lung));
    if (vista.pagina >= pagine) vista.pagina = pagine - 1;
    $('conteggio-livelli').textContent = ids.length ? ids.length + ' livelli con questo filtro. Pagina ' + (vista.pagina + 1) + ' di ' + pagine + '.' : 'Nessun livello con questo filtro in questo capitolo.';
    var ul = $('elenco-livelli'), cor = corrente();
    ul.innerHTML = '';
    ids.slice(vista.pagina * vista.lung, (vista.pagina + 1) * vista.lung).forEach(function (id) {
      var li = document.createElement('li'), b = document.createElement('button'), l = livello(id);
      var ap = sbloccato(id), fatto = prog.completati[id], corso = inCorso(id);
      b.type = 'button';
      b.className = 'livello-btn' + (fatto ? ' completato' : '') + (corso ? ' in-corso' : '') + (id === cor ? ' corrente' : '');
      b.dataset.id = id;
      b.innerHTML = '<span class="n">' + id + '</span><span class="f">' + l.fascia + '</span><span class="st">' +
        (!ap ? '🔒 bloccato' : corso ? '▶ in corso' : fatto ? '✓ ' + tempo(fatto.tempo) : 'da giocare') + '</span>';
      b.setAttribute('aria-label', 'Livello ' + id + ', ' + titolo(id) + ', ' + l.n + ' per ' + l.n + ', ' + l.fascia + ', ' +
        (!ap ? 'bloccato: completa il livello ' + (id - 1) + ' per aprirlo' : corso ? 'partita in corso' : fatto ? 'completato in ' + tempo(fatto.tempo) + ', record ' + fatto.punti + ' punti' : 'da giocare') +
        (id === cor ? ', livello corrente' : ''));
      b.disabled = !ap;
      b.addEventListener('click', function () { apriLivello(id); });
      li.appendChild(b); ul.appendChild(li);
    });
    var nav = $('pagine');
    nav.innerHTML = '';
    if (pagine > 1) for (var i = 0; i < pagine; i++) (function (i) {
      var b = document.createElement('button'), a = ids[i * vista.lung], z = ids[Math.min(ids.length, (i + 1) * vista.lung) - 1];
      b.type = 'button'; b.className = 'btn piccolo'; b.textContent = a + '–' + z;
      b.setAttribute('aria-label', 'Pagina ' + (i + 1) + ', livelli da ' + a + ' a ' + z);
      b.setAttribute('aria-pressed', String(i === vista.pagina));
      b.addEventListener('click', function () { vista.pagina = i; disegnaLivelli(); });
      nav.appendChild(b);
    })(i);
    $('cerca-livello').max = TOTALE; $('cerca-livello').placeholder = '1 – ' + TOTALE;
    if (focusId) { var el = ul.querySelector('[data-id="' + focusId + '"]'); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }
  }
  function vaiA(id) {
    if (!(id >= 1 && id <= TOTALE)) { $('conteggio-livelli').textContent = 'Scrivi un numero da 1 a ' + TOTALE + '.'; return; }
    vista.capitolo = capitoloDi(id); vista.filtro = 'tutti'; $('filtro').value = 'tutti';
    vista.pagina = Math.floor((id - CAPITOLI[vista.capitolo].da) / vista.lung);
    disegnaLivelli(id);
    if (!sbloccato(id)) { var t = 'Il livello ' + id + ' è ancora bloccato: completa il livello ' + (id - 1) + ' per aprirlo.'; $('conteggio-livelli').textContent = t; annuncia(t); }
  }
  /** All'apertura si ricontrolla che la soluzione sia unica e sia quella del catalogo. */
  function verifica(liv) {
    try {
      var r = M.contaSoluzioni(liv.n, liv.zone, 2);
      return r.conteggio === 1 && r.soluzione.join() === liv.soluzione.join();
    } catch (e) { return false; }
  }
  function apriLivello(id, opz) {
    opz = opz || {};
    var salvata = opz.daCapo ? null : archivio.leggi(chiave(id), null);
    var liv = opz.liv || (typeof id === 'number' ? livello(id) : salvata && salvata.liv);
    if (!liv) { mostra('s-livelli'); return; }
    var avviso = '';
    if (!verifica(liv)) {
      liv = Object.assign({}, RISERVA[liv.n][0], { id: liv.id });
      salvata = null;
      avviso = 'Il livello non ha superato il controllo di unicità: lo sostituisco con un livello di riserva verificato della stessa grandezza.';
    }
    nuovaPartita(liv);
    if (opz.daCapo) { archivio.togli(chiave(id)); delete prog.inCorso[id]; salvaProg(); }
    var ripresa = false;
    if (salvata && salvata.stato) {
      for (var p = 0; p < G.N; p++) G.stato[p] = +salvata.stato[p] || 0;
      ricostruisci();
      G.cuori = salvata.cuori == null ? 3 : salvata.cuori; G.persi = salvata.persi || 0; G.tempo = salvata.tempo || 0; G.aiuti = salvata.aiuti || 0;
      G.storia = salvata.storia || []; G.futuro = salvata.futuro || [];
      ripresa = true;
    }
    if (typeof id === 'number') { prog.ultimo = id; salvaProg(); }
    costruisciGriglia();
    $('t-gioco').textContent = (typeof id === 'number' ? 'Livello ' + id + ' · ' : '') + titolo(id);
    $('meta-livello').textContent = liv.n + '×' + liv.n + ' · ' + liv.fascia + ' (stima)' +
      (typeof id === 'number' ? ' · capitolo ' + (capitoloDi(id) + 1) + ' · completati ' + Object.keys(prog.completati).length + ' su ' + TOTALE : ' · codice ' + liv.seed);
    document.title = 'Pandino · ' + (typeof id === 'number' ? 'Livello ' + id : 'Partita libera');
    $('velo-pausa').hidden = true; $('griglia').inert = false; $('griglia').removeAttribute('aria-hidden');
    mostra('s-gioco');
    ridisegna();
    seleziona(0);
    if (avviso) mostraMessaggio('attenzione', '<p>' + avviso + '</p>');
    else if (ripresa) mostraMessaggio('ok', '<p>Partita ripresa da dove l’avevi lasciata (' + tempo(G.tempo) + ').</p>');
    else if (typeof id === 'number' && id <= 3 && !Object.keys(prog.completati).length) mostraMessaggio('aiuto', '<p><strong>Benvenuto!</strong> Metti un panda in ogni riga, colonna e boschetto colorato, senza che due panda si tocchino. Tocca una casella per segnarla con ✕, toccala ancora per mettere il panda. Se ti blocchi, premi «Aiuto».</p>');
    else if (typeof id === 'number' && completato(id)) mostraMessaggio('ok', '<p>Hai già completato questo livello: rigiocalo per battere il record di ' + prog.completati[id].punti.toLocaleString('it-IT') + ' punti.</p>');
    else nascondiMessaggio();
    annuncia((ripresa ? 'Partita ripresa. ' : '') + $('t-gioco').textContent + '. Griglia ' + liv.n + ' per ' + liv.n + ', ' + liv.fascia + '.' + (imp.cuori ? ' Hai ' + G.cuori + ' cuori.' : ''));
    avviaTimer();
  }
  function esci() {
    var vai = function () { mostra(G && typeof G.id !== 'number' ? 's-inizio' : 's-livelli'); };
    if (G && !G.finita && G.storia.length) conferma('Lasci il livello?', 'La partita resta salvata in questo browser: potrai riprenderla da dove l’hai lasciata.', 'Esci').then(function (ok) { if (ok) { salvaSubito(); vai(); } });
    else vai();
  }
  function daCapo() {
    if (!G) return;
    var fn = function () { apriLivello(G.id, { daCapo: true, liv: typeof G.id === 'number' ? null : G.liv }); };
    if (G.storia.length && !G.finita) conferma('Ricominciare da capo?', 'Panda e segni verranno tolti, i cuori tornano tre e il tempo riparte da zero.', 'Ricomincia').then(function (ok) { if (ok) fn(); });
    else fn();
  }
  function pausa(forza) {
    if (!G || G.finita) return;
    G.pausa = typeof forza === 'boolean' ? forza : !G.pausa;
    $('velo-pausa').hidden = !G.pausa; $('griglia').inert = G.pausa;
    if (G.pausa) $('griglia').setAttribute('aria-hidden', 'true'); else $('griglia').removeAttribute('aria-hidden');
    aggiornaContatori();
    annuncia(G.pausa ? 'Gioco in pausa.' : 'Gioco ripreso.');
    if (G.pausa) $('btn-riprendi').focus(); else seleziona(G.sel >= 0 ? G.sel : 0);
    salva();
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
      $('tempo').textContent = tempo(G.tempo);
      if (G.tempo - ultimoSalva > 5000) { ultimoSalva = G.tempo; salvaSubito(); }
    }, 250);
  }
  function fermaTimer() { if (tTimer) clearInterval(tTimer); tTimer = null; }

  // partita libera: generazione in un Worker, con limite di tempo e riserva
  var CODICE_WORKER = [
    'self.onmessage = function (e) {',
    '  var M = self.PandinoMotore, n = e.data.n, f = e.data.fascia, s = e.data.seed >>> 0;',
    '  for (var t = 0; t < 5000; t++) {',
    '    var seed = (s + t) >>> 0; if (!seed) continue;',
    '    var l = M.generaLivello(n, seed); if (!l) continue;',
    '    var v = M.valuta(n, l.zone), fa = M.fasciaDi(v);',
    '    if (fa && (!f || fa === f) && M.contaSoluzioni(n, l.zone, 2).conteggio === 1) {',
    '      self.postMessage({ liv: { n: n, seed: seed, zone: l.zone, soluzione: l.soluzione, fascia: fa, punteggio: v.punteggio } }); return;',
    '    }',
    '    self.postMessage({ tentativi: t + 1 });',
    '  }',
    '  self.postMessage({ fallito: true });',
    '};'
  ].join('\n');
  var lavoratore = null;
  function creaLibera() {
    var n = +$('libera-n').value, f = $('libera-fascia').value, su = parseInt($('libera-seed').value, 10);
    var seed = su > 0 ? su >>> 0 : Math.floor(Math.random() * 4294967294) + 1, finito = false;
    $('libera-scelta').hidden = true; $('libera-attesa').hidden = false;
    $('libera-testo').textContent = 'Sto preparando un livello ' + n + '×' + n + (f ? ' ' + f.toLowerCase() : '') + ' con una sola soluzione…';
    function riserva(motivo) {
      if (finito) return;
      finito = true;
      if (lavoratore) { lavoratore.terminate(); lavoratore = null; }
      var lista = RISERVA[n], r = lista.filter(function (x) { return !f || x.fascia === f; })[0] || lista[seed % lista.length];
      avvia(Object.assign({}, r, { id: 'R' + r.seed }), motivo);
    }
    var limite = setTimeout(function () { riserva('La generazione ha richiesto troppo tempo: ti propongo un livello di riserva già verificato.'); }, 6000);
    try {
      var url = URL.createObjectURL(new Blob([$('codice-motore').textContent + '\n' + CODICE_WORKER], { type: 'text/javascript' }));
      lavoratore = new Worker(url);
      URL.revokeObjectURL(url);
      lavoratore.onmessage = function (e) {
        if (finito) return;
        if (e.data.tentativi) { $('libera-testo').textContent = 'Sto preparando il livello… (' + e.data.tentativi + ' tentativi)'; return; }
        clearTimeout(limite);
        if (e.data.fallito) { riserva('Non ho trovato in tempo un livello di questa difficoltà: ti propongo un livello di riserva verificato.'); return; }
        finito = true; lavoratore.terminate(); lavoratore = null;
        var liv = e.data.liv; liv.id = 'L' + n + '-' + liv.seed;
        avvia(liv, '');
      };
      lavoratore.onerror = function () { clearTimeout(limite); riserva('Questo browser non permette di generare al momento: ti propongo un livello di riserva verificato.'); };
      lavoratore.postMessage({ n: n, fascia: f, seed: seed });
    } catch (err) { clearTimeout(limite); riserva('Questo browser non permette di generare al momento: ti propongo un livello di riserva verificato.'); }
  }
  function avvia(liv, avviso) {
    chiudi('d-libera');
    $('libera-scelta').hidden = false; $('libera-attesa').hidden = true;
    apriLivello(liv.id, { liv: liv, daCapo: true });
    if (avviso) mostraMessaggio('attenzione', '<p>' + avviso + '</p>');
  }

  // finestre
  var ultimoFocus = null;
  function apri(id) {
    var d = $(id);
    if (d.open) return;
    ultimoFocus = document.activeElement;
    if (id === 'd-impostazioni') riempiImp();
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function chiudi(id) { var d = $(id); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } }
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
  function riempiImp() {
    var f = $('form-impostazioni');
    f.cuori.value = imp.cuori ? 'si' : 'no'; f.tema.value = imp.tema;
    ['ombre', 'conflitti', 'lettere', 'animazioni', 'suoni'].forEach(function (k) { f[k].checked = !!imp[k]; });
  }
  function applicaImp() {
    var root = document.documentElement;
    root.classList.toggle('anim', !!imp.animazioni);
    if (imp.tema === 'auto') root.removeAttribute('data-tema'); else root.setAttribute('data-tema', imp.tema);
    if (G && !$('s-gioco').hidden) ridisegna();
  }
  /** Esempio risolto nella finestra delle regole: il primo livello del catalogo. */
  function disegnaEsempio() {
    var l = LIVELLI[0], n = l.n, h = '<div class="griglia" style="--n:' + n + '">';
    for (var p = 0; p < n * n; p++) {
      var r = Math.floor(p / n), c = p % n, z = l.zone[p], cl = 'cella z' + z;
      if (r > 0 && l.zone[p - n] !== z) cl += ' zt';
      if (c > 0 && l.zone[p - 1] !== z) cl += ' zl';
      if (c < n - 1 && l.zone[p + 1] !== z) cl += ' zr';
      if (r < n - 1 && l.zone[p + n] !== z) cl += ' zb';
      h += '<div class="' + cl + '">' + (l.soluzione[r] === c ? P.uso(z % 10 + 1) : '') + '</div>';
    }
    $('esempio').innerHTML = h + '</div>';
  }

  // =====================================================================
  // H. Tocco, trascinamento, tastiera, suoni
  // =====================================================================
  var tratto = null;
  function cellaDa(x, y) { var el = document.elementFromPoint(x, y); el = el && el.closest && el.closest('#griglia .cella'); return el ? +el.dataset.p : -1; }
  function collegaGriglia() {
    var gr = $('griglia');
    gr.addEventListener('pointerdown', function (e) {
      if (!puoAgire() || e.button > 0) return;
      var p = cellaDa(e.clientX, e.clientY);
      if (p < 0) return;
      e.preventDefault();
      tratto = { inizio: p, id: e.pointerId, toccate: [p], valore: G.stato[p] === 1 ? 0 : 1, attivo: false };
      try { gr.setPointerCapture(e.pointerId); } catch (err) { /* niente */ }
      seleziona(p, false);
    });
    gr.addEventListener('pointermove', function (e) {
      if (!tratto || e.pointerId !== tratto.id) return;
      var p = cellaDa(e.clientX, e.clientY);
      if (p < 0 || tratto.toccate.indexOf(p) >= 0) return;
      // trascinando si segnano (o si cancellano) i ✕; i panda non si toccano
      tratto.attivo = true;
      tratto.toccate.push(p);
      [tratto.inizio, p].forEach(function (q) {
        if (G.stato[q] !== 2 && G.stato[q] !== tratto.valore) { celle[q].innerHTML = tratto.valore ? '<span class="segno" aria-hidden="true">✕</span>' : ''; }
      });
      seleziona(p, false);
    });
    var fine = function (e) {
      if (!tratto || e.pointerId !== tratto.id) return;
      var t = tratto; tratto = null;
      if (!t.attivo) { tocca(t.inizio); celle[t.inizio].focus({ preventScroll: true }); return; }
      var cambi = t.toccate.filter(function (q) { return G.stato[q] !== 2; }).map(function (q) { return [q, t.valore]; });
      mossa(cambi);
      ridisegna();
      annuncia((t.valore ? 'Segnate ' : 'Liberate ') + cambi.length + ' caselle.');
      suono('segno');
    };
    gr.addEventListener('pointerup', fine);
    gr.addEventListener('pointercancel', function (e) { if (tratto && e.pointerId === tratto.id) { tratto = null; ridisegna(); } });
    gr.addEventListener('contextmenu', function (e) {
      // clic destro: panda diretto
      e.preventDefault();
      var p = cellaDa(e.clientX, e.clientY);
      if (p >= 0) { seleziona(p, false); tocca(p, 'panda'); }
    });
    gr.addEventListener('focusin', function (e) { var el = e.target.closest('.cella'); if (el && G && +el.dataset.p !== G.sel) seleziona(+el.dataset.p, false); });
  }
  function finestraAperta() { return !!document.querySelector('dialog[open]'); }
  document.addEventListener('keydown', function (e) {
    if (finestraAperta() || $('s-gioco').hidden || !G) return;
    var t = e.target;
    if (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return;
    var k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && /^[zZ]$/.test(k)) { e.preventDefault(); if (e.shiftKey) ripristina(); else annulla(); return; }
    if (mod && /^[yY]$/.test(k)) { e.preventDefault(); ripristina(); return; }
    if (mod || e.altKey || G.pausa) return;
    var dentro = $('griglia').contains(document.activeElement) || document.activeElement === document.body;
    var s = G.sel, n = G.n;
    if (k.indexOf('Arrow') === 0) {
      if (!dentro) return;
      e.preventDefault();
      if (s < 0) s = 0;
      var r = G.geo.RIGA[s], c = G.geo.COLONNA[s];
      if (k === 'ArrowUp') r = Math.max(0, r - 1); if (k === 'ArrowDown') r = Math.min(n - 1, r + 1);
      if (k === 'ArrowLeft') c = Math.max(0, c - 1); if (k === 'ArrowRight') c = Math.min(n - 1, c + 1);
      seleziona(r * n + c);
      return;
    }
    if ((k === ' ' || k === 'Enter') && dentro && s >= 0) { e.preventDefault(); tocca(s, 'ciclo'); return; }
    if ((k === 'p' || k === 'P') && s >= 0) { e.preventDefault(); tocca(s, 'panda'); return; }
    if ((k === 'x' || k === 'X') && s >= 0) { e.preventDefault(); tocca(s, 'segno'); return; }
    if ((k === 'Backspace' || k === 'Delete') && s >= 0) { e.preventDefault(); if (G.stato[s]) imposta0(s, 0); return; }
    if (k === 's' || k === 'S') { e.preventDefault(); suggerimento(); return; }
    if (k === 'Escape') { e.preventDefault(); if (G.suggerite.length) chiudiSuggerimento(); else { G.sel = -1; evidenziaSelezione(); } }
  });

  var audio = null, interagito = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { interagito = true; }, { capture: true, passive: true }); });
  function suono(tipo) {
    if (!imp.suoni || !interagito) return;
    try {
      if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; audio = new AC(); }
      if (audio.state === 'suspended') audio.resume();
      var note = { panda: [[620, .08], [830, .09]], segno: [[420, .04]], via: [[300, .04]], errore: [[200, .18]],
        vittoria: [[523, .12], [659, .12], [784, .12], [1047, .28]] }[tipo] || [[600, .06]];
      var t0 = audio.currentTime;
      note.forEach(function (x) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = tipo === 'errore' ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(x[0], t0);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + x[1]);
        o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + x[1] + 0.02);
        t0 += x[1] * 0.8;
      });
    } catch (e) { /* audio non disponibile */ }
  }

  function collega() {
    document.querySelectorAll('[data-apri]').forEach(function (b) { b.addEventListener('click', function () { apri(b.dataset.apri); }); });
    document.querySelectorAll('[data-chiudi]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });
    document.querySelectorAll('[data-vai]').forEach(function (b) { b.addEventListener('click', function () { mostra(b.dataset.vai); }); });
    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('close', function () { if (ultimoFocus && document.contains(ultimoFocus) && !ultimoFocus.closest('[hidden]')) ultimoFocus.focus({ preventScroll: true }); });
      d.addEventListener('click', function (e) { if (e.target === d && d.id !== 'd-fine') d.close(); });
    });
    document.querySelectorAll('[data-strumento]').forEach(function (b) {
      b.addEventListener('click', function () { imp.strumento = b.dataset.strumento; salvaImp(); aggiornaContatori(); evidenziaSelezione(); annuncia('Un tocco ora: ' + b.textContent.trim() + '.'); });
    });
    $('btn-continua').addEventListener('click', function () { apriLivello(corrente()); });
    $('btn-livelli').addEventListener('click', function () { var c = corrente(); vista.capitolo = capitoloDi(c); vista.pagina = Math.floor((c - CAPITOLI[vista.capitolo].da) / vista.lung); mostra('s-livelli'); });
    $('btn-libera').addEventListener('click', function () { apri('d-libera'); });
    $('btn-genera').addEventListener('click', creaLibera);
    $('form-vai').addEventListener('submit', function (e) { e.preventDefault(); vaiA(parseInt($('cerca-livello').value, 10)); });
    $('filtro').addEventListener('change', function () { vista.filtro = this.value; vista.pagina = 0; disegnaLivelli(); });
    $('btn-suggerimento').addEventListener('click', suggerimento);
    $('btn-annulla').addEventListener('click', annulla);
    $('btn-ripristina').addEventListener('click', ripristina);
    $('btn-controlla').addEventListener('click', controlla);
    $('btn-pausa').addEventListener('click', function () { pausa(); });
    $('btn-riprendi').addEventListener('click', function () { pausa(false); });
    $('btn-nuova').addEventListener('click', daCapo);
    $('btn-esci').addEventListener('click', esci);
    $('form-impostazioni').addEventListener('change', function (e) {
      var nome = e.target.name;
      if (nome === 'tema') imp.tema = this.tema.value;
      else if (nome === 'cuori') imp.cuori = this.cuori.value === 'si';
      else if (nome) imp[nome] = e.target.checked;
      salvaImp(); applicaImp();
    });
    $('btn-azzera').addEventListener('click', function () {
      chiudi('d-impostazioni');
      conferma('Cancellare tutti i progressi?', 'Livelli completati, record e partite salvate verranno eliminati da questo browser. Non si può tornare indietro.', 'Cancella tutto').then(function (ok) {
        if (!ok) return;
        Object.keys(prog.inCorso).forEach(function (k) { archivio.togli(chiave(k)); });
        prog = progVuoto(); salvaProg(); G = null; mostra('s-inizio'); annuncia('Progressi cancellati.');
      });
    });
    $('btn-successivo').addEventListener('click', function () { chiudi('d-fine'); if (G && typeof G.id === 'number' && G.id < TOTALE) apriLivello(G.id + 1); });
    $('btn-rigioca').addEventListener('click', function () { chiudi('d-fine'); if (G) apriLivello(G.id, { daCapo: true, liv: typeof G.id === 'number' ? null : G.liv }); });
    $('btn-vai-livelli').addEventListener('click', function () { chiudi('d-fine'); mostra(G && typeof G.id !== 'number' ? 's-inizio' : 's-livelli'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) salvaSubito(); });
    window.addEventListener('pagehide', salvaSubito);
    collegaGriglia();
  }

  function avvio() {
    $('simboli').innerHTML = P.simboli();
    $('marchio-panda').innerHTML = P.uso(9, 'icona');
    disegnaEsempio();
    collega();
    applicaImp();
    mostra('s-inizio');
  }

  // Interfaccia minima per le verifiche automatiche (nessun effetto sul gioco)
  window.Pandino = {
    totale: function () { return TOTALE; },
    livello: function (id) { return livello(id); },
    partita: function () { return G && { id: G.id, n: G.n, stato: Array.from(G.stato).join(''), cuori: G.cuori, tempo: G.tempo, finita: G.finita, persa: G.persa, sel: G.sel, aiuti: G.aiuti }; },
    verifica: verifica
  };
  avvio();
})();
