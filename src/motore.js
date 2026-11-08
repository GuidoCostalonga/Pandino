/*
 * Pandino · motore del rompicapo a zone
 * ===========================================================================
 * Regole
 *   Griglia n×n divisa in n zone (i «boschetti»). Si mette un panda per riga,
 *   uno per colonna e uno per boschetto. Due panda non si toccano mai, né di
 *   lato né in diagonale.
 *
 * Modello (problema di soddisfacimento di vincoli)
 *   Una variabile per riga: col[r] = colonna del panda della riga r.
 *   Vincoli: AllDifferent(col), AllDifferent(boschetto(r, col[r])),
 *   |col[r] - col[r+1]| >= 2 (nessun contatto fra righe vicine).
 *
 * Il file funziona nel browser (self.PandinoMotore) e in Node (module.exports).
 *
 * Indice
 *  1. Geometria precalcolata (righe, colonne, vicine)
 *  2. Generatore pseudocasuale con seed (mulberry32)
 *  3. Conteggio delle soluzioni: backtracking per righe con euristica MRV
 *     (si sceglie la riga con meno colonne possibili) e Forward Checking
 *  4. Generazione: disposizione dei panda, crescita casuale dei boschetti,
 *     ritocco dei confini finché la soluzione è unica
 *  5. Deduzioni logiche per suggerimenti e difficoltà
 */
(function (radice) {
  'use strict';

  // =========================================================================
  // 1. Geometria
  // =========================================================================
  var cache = {};
  function geometria(n) {
    if (cache[n]) return cache[n];
    var N = n * n, g = { n: n, N: N, RIGA: [], COLONNA: [], VICINE: [], LATI: [] };
    for (var p = 0; p < N; p++) {
      var r = Math.floor(p / n), c = p % n;
      g.RIGA.push(r); g.COLONNA.push(c);
      var v = [], l = [];
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        v.push(rr * n + cc);
        if (!dr || !dc) l.push(rr * n + cc);
      }
      g.VICINE.push(v); g.LATI.push(l);
    }
    cache[n] = g;
    return g;
  }

  // =========================================================================
  // 2. Generatore pseudocasuale
  // =========================================================================
  function generatore(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mescola(arr, casuale) {
    for (var x = arr.length - 1; x > 0; x--) { var y = Math.floor(casuale() * (x + 1)), t = arr[x]; arr[x] = arr[y]; arr[y] = t; }
    return arr;
  }

  // =========================================================================
  // 3. Conteggio delle soluzioni
  // =========================================================================
  /**
   * Conta le soluzioni fino a `limite`. `zone` è un vettore di n*n indici di
   * boschetto. `escluse` (facoltativo) vieta alcune caselle, `fissi`
   * (facoltativo) impone il panda in alcune righe: col[r] = fissi[r] se >= 0.
   * MRV: a ogni passo si sceglie la riga con meno colonne ammesse.
   * Forward Checking: se una riga resta senza colonne si torna indietro subito.
   */
  function contaSoluzioni(n, zone, limite, escluse, fissi) {
    limite = limite || 2;
    var col = new Int8Array(n).fill(-1), usataC = 0, usataZ = 0, conteggio = 0, prima = null;
    function ammessa(r, c) {
      var p = r * n + c;
      if (escluse && escluse[p]) return false;
      if (usataC & (1 << c) || usataZ & (1 << zone[p])) return false;
      if (r > 0 && col[r - 1] >= 0 && Math.abs(col[r - 1] - c) < 2) return false;
      if (r < n - 1 && col[r + 1] >= 0 && Math.abs(col[r + 1] - c) < 2) return false;
      return true;
    }
    function cerca() {
      var migliore = -1, min = 99, scelte = null;
      for (var r = 0; r < n; r++) {
        if (col[r] >= 0) continue;
        var s = [];
        for (var c = 0; c < n; c++) if (ammessa(r, c)) s.push(c);
        if (s.length < min) { min = s.length; migliore = r; scelte = s; if (min === 0) return false; }
      }
      if (migliore < 0) { conteggio++; if (!prima) prima = Array.from(col); return conteggio >= limite; }
      for (var k = 0; k < scelte.length; k++) {
        var c2 = scelte[k], z = zone[migliore * n + c2];
        col[migliore] = c2; usataC |= 1 << c2; usataZ |= 1 << z;
        var fine = cerca();
        col[migliore] = -1; usataC &= ~(1 << c2); usataZ &= ~(1 << z);
        if (fine) return true;
      }
      return false;
    }
    if (fissi) {
      for (var r = 0; r < n; r++) if (fissi[r] >= 0) {
        if (!ammessa(r, fissi[r])) return { conteggio: 0, soluzione: null };
        col[r] = fissi[r]; usataC |= 1 << fissi[r]; usataZ |= 1 << zone[r * n + fissi[r]];
      }
    }
    cerca();
    return { conteggio: conteggio, soluzione: prima };
  }

  // =========================================================================
  // 4. Generazione
  // =========================================================================
  function disposizioneCasuale(n, casuale) {
    var col = [], usate = {};
    (function passo(r) {
      if (r === n) return true;
      var ordine = mescola(Array.from({ length: n }, function (_, i) { return i; }), casuale);
      for (var k = 0; k < n; k++) {
        var c = ordine[k];
        if (usate[c] || (r > 0 && Math.abs(col[r - 1] - c) < 2)) continue;
        col[r] = c; usate[c] = 1;
        if (passo(r + 1)) return true;
        usate[c] = 0;
      }
      return false;
    })(0);
    return col;
  }

  /** Boschetti: ogni zona parte dal suo panda e cresce a caso verso caselle libere confinanti. */
  function cresciZone(n, sol, casuale) {
    var g = geometria(n), zone = new Int8Array(g.N).fill(-1), libere = g.N - n;
    var etichette = mescola(Array.from({ length: n }, function (_, i) { return i; }), casuale);
    var peso = [];
    for (var r = 0; r < n; r++) { zone[r * n + sol[r]] = etichette[r]; peso.push(0.3 + casuale() * 1.7); }
    var membri = [];
    for (r = 0; r < n; r++) membri[etichette[r]] = [r * n + sol[r]];
    var pesi = []; for (r = 0; r < n; r++) pesi[etichette[r]] = peso[r];
    while (libere > 0) {
      // zona scelta in proporzione al suo peso: zone grandi e piccole
      var tot = 0, z;
      for (z = 0; z < n; z++) tot += pesi[z];
      var x = casuale() * tot;
      for (z = 0; z < n - 1; z++) { x -= pesi[z]; if (x < 0) break; }
      var bordo = [];
      membri[z].forEach(function (p) { g.LATI[p].forEach(function (q) { if (zone[q] < 0) bordo.push(q); }); });
      if (!bordo.length) { pesi[z] = 0.0001; continue; }
      var q = bordo[Math.floor(casuale() * bordo.length)];
      zone[q] = z; membri[z].push(q); libere--;
    }
    return zone;
  }
  function connessa(n, zone, z, senza) {
    var g = geometria(n), celle = [];
    for (var p = 0; p < g.N; p++) if (zone[p] === z && p !== senza) celle.push(p);
    if (!celle.length) return false;
    var visto = {}, coda = [celle[0]]; visto[celle[0]] = 1;
    while (coda.length) {
      var a = coda.pop();
      g.LATI[a].forEach(function (b) { if (!visto[b] && b !== senza && zone[b] === z) { visto[b] = 1; coda.push(b); } });
    }
    return Object.keys(visto).length === celle.length;
  }

  /**
   * Genera un livello con soluzione unica. Se i boschetti ammettono più
   * soluzioni, si sposta di boschetto una casella occupata dalla soluzione
   * alternativa (senza staccare il boschetto) e si riprova.
   */
  function generaLivello(n, seed) {
    var casuale = generatore(seed);
    for (var tentativo = 0; tentativo < 200; tentativo++) {
      var sol = disposizioneCasuale(n, casuale);
      var zone = cresciZone(n, sol, casuale);
      for (var ritocco = 0; ritocco < 60; ritocco++) {
        var r = contaSoluzioni(n, zone, 2);
        if (r.conteggio === 1) return { n: n, seed: seed, zone: Array.from(zone), soluzione: sol };
        var alt = r.soluzione;
        if (alt.join() === sol.join()) alt = contaSoluzioniDiversa(n, zone, sol);
        if (!alt) break;
        var righe = mescola(Array.from({ length: n }, function (_, i) { return i; }), casuale), fatto = false;
        for (var k = 0; k < n && !fatto; k++) {
          var rr = righe[k];
          if (alt[rr] === sol[rr]) continue;
          var q = rr * n + alt[rr], vecchia = zone[q];
          var vicine = mescola(geometria(n).LATI[q].slice(), casuale);
          for (var v = 0; v < vicine.length; v++) {
            var nz = zone[vicine[v]];
            if (nz === vecchia || !connessa(n, zone, vecchia, q)) continue;
            zone[q] = nz; fatto = true; break;
          }
        }
        if (!fatto) break;
      }
    }
    return null;
  }
  function contaSoluzioniDiversa(n, zone, sol) {
    // cerca una soluzione diversa da sol vietando, a turno, una sua casella
    for (var r = 0; r < n; r++) {
      var escl = new Uint8Array(n * n); escl[r * n + sol[r]] = 1;
      var x = contaSoluzioni(n, zone, 1, escl);
      if (x.conteggio) return x.soluzione;
    }
    return null;
  }

  // =========================================================================
  // 5. Deduzioni logiche
  // =========================================================================
  /*
   * Stato di lavoro: per ogni casella 0 = libera, 1 = esclusa, 2 = panda.
   * Le esclusioni dovute ai panda già posati (stessa riga, colonna, boschetto,
   * caselle che li toccano) si ricavano sempre in automatico.
   */
  var NOMI_ZONA = 'ABCDEFGHIJ';
  function nomeZona(z) { return 'boschetto ' + NOMI_ZONA[z]; }
  function nomeCasella(g, p) { return 'riga ' + (g.RIGA[p] + 1) + ', colonna ' + (g.COLONNA[p] + 1); }
  function sigla(g, p) { return 'R' + (g.RIGA[p] + 1) + 'C' + (g.COLONNA[p] + 1); }
  function elenco(g, arr) { return arr.map(function (p) { return sigla(g, p); }).join(', '); }

  /** Unità: righe (0..n-1), colonne (n..2n-1), boschetti (2n..3n-1). */
  function unita(n, zone) {
    var g = geometria(n), U = [];
    for (var u = 0; u < 3 * n; u++) U.push([]);
    for (var p = 0; p < g.N; p++) { U[g.RIGA[p]].push(p); U[n + g.COLONNA[p]].push(p); U[2 * n + zone[p]].push(p); }
    return U;
  }
  function nomeUnita(n, u) { return u < n ? 'riga ' + (u + 1) : u < 2 * n ? 'colonna ' + (u - n + 1) : nomeZona(u - 2 * n); }
  function della(n, u) { return u < 2 * n ? 'della ' : 'del '; }
  function nella(n, u) { return u < 2 * n ? 'nella ' : 'nel '; }

  /** Caselle escluse da un panda in p: stessa riga, colonna, boschetto e caselle che lo toccano. */
  function ombra(n, zone, p) {
    var g = geometria(n), out = {};
    for (var q = 0; q < g.N; q++) if (q !== p && (g.RIGA[q] === g.RIGA[p] || g.COLONNA[q] === g.COLONNA[p] || zone[q] === zone[p])) out[q] = 1;
    g.VICINE[p].forEach(function (q) { out[q] = 1; });
    return out;
  }
  /** Stato completo: alle esclusioni scritte si aggiungono quelle implicite dei panda. */
  function statoPieno(n, zone, stato) {
    var s = Array.from(stato);
    for (var p = 0; p < n * n; p++) if (stato[p] === 2) {
      var o = ombra(n, zone, p);
      for (var q in o) if (s[q] === 0) s[q] = 1;
    }
    return s;
  }
  function liberi(s, celle) { return celle.filter(function (p) { return s[p] === 0; }); }
  function haPanda(s, celle) { return celle.some(function (p) { return s[p] === 2; }); }

  // a. Unico posto
  function unicoPosto(n, zone, s, U) {
    var g = geometria(n), ordine = [];
    for (var u = 2 * n; u < 3 * n; u++) ordine.push(u);
    for (u = 0; u < 2 * n; u++) ordine.push(u);
    for (var k = 0; k < ordine.length; k++) {
      u = ordine[k];
      if (haPanda(s, U[u])) continue;
      var l = liberi(s, U[u]);
      if (l.length === 1) {
        return { tecnica: 'unico-posto', tipo: 'piazza', cella: l[0], evidenzia: U[u], unita: u,
          testo: (u < 2 * n ? 'Nella ' : 'Nel ') + nomeUnita(n, u) + ' resta una sola casella dove il panda può stare: ' + nomeCasella(g, l[0]) +
            '. Tutte le altre sono già escluse.' };
      }
    }
    return null;
  }
  // b. Confinamento: boschetto chiuso in una riga o colonna, o riga/colonna chiusa in un boschetto
  function confinamento(n, zone, s, U) {
    var g = geometria(n);
    for (var z = 0; z < n; z++) {
      var Z = U[2 * n + z];
      if (haPanda(s, Z)) continue;
      var l = liberi(s, Z);
      if (l.length < 2) continue;
      var assi = [[g.RIGA, 0, 'riga'], [g.COLONNA, n, 'colonna']];
      for (var a = 0; a < 2; a++) {
        var arr = assi[a][0], linea = arr[l[0]];
        if (!l.every(function (p) { return arr[p] === linea; })) continue;
        var u = assi[a][1] + linea;
        var via = liberi(s, U[u]).filter(function (p) { return zone[p] !== z; });
        if (via.length) {
          return { tecnica: 'confinamento', tipo: 'escludi', celle: via, evidenzia: l, unita: u,
            testo: 'Nel ' + nomeZona(z) + ' le caselle libere stanno tutte nella ' + assi[a][2] + ' ' + (linea + 1) + '. Il panda di quel boschetto occuperà quindi la ' +
              assi[a][2] + ' ' + (linea + 1) + ': nelle altre sue caselle (' + elenco(g, via) + ') non può esserci un panda.' };
        }
      }
    }
    for (var u2 = 0; u2 < 2 * n; u2++) {
      if (haPanda(s, U[u2])) continue;
      var l2 = liberi(s, U[u2]);
      if (l2.length < 2) continue;
      var zz = zone[l2[0]];
      if (!l2.every(function (p) { return zone[p] === zz; })) continue;
      var via2 = liberi(s, U[2 * n + zz]).filter(function (p) { return U[u2].indexOf(p) < 0; });
      if (via2.length) {
        return { tecnica: 'confinamento', tipo: 'escludi', celle: via2, evidenzia: l2, unita: u2,
          testo: 'Nella ' + nomeUnita(n, u2) + ' le caselle libere stanno tutte nel ' + nomeZona(zz) + '. Il panda di quel boschetto starà quindi nella ' +
            nomeUnita(n, u2) + ': nelle altre caselle del boschetto (' + elenco(g, via2) + ') non può esserci un panda.' };
      }
    }
    return null;
  }
  // c. Tocca tutti: un panda in quella casella lascerebbe una riga, colonna o boschetto senza posto
  function toccaTutti(n, zone, s, U) {
    var g = geometria(n);
    for (var p = 0; p < g.N; p++) {
      if (s[p] !== 0) continue;
      var o = ombra(n, zone, p);
      for (var u = 0; u < 3 * n; u++) {
        if (U[u].indexOf(p) >= 0 || haPanda(s, U[u])) continue;
        var l = liberi(s, U[u]);
        if (l.length && l.every(function (q) { return o[q]; })) {
          return { tecnica: 'tocca-tutti', tipo: 'escludi', celle: [p], evidenzia: l, unita: u,
            testo: 'Se mettessi un panda in ' + nomeCasella(g, p) + ', ' + nella(n, u) + nomeUnita(n, u) +
              ' non resterebbe nessuna casella libera: le sue caselle (' + elenco(g, l) + ') toccano quella casella oppure stanno nella sua riga, colonna o boschetto. Quindi lì non può esserci un panda.' };
        }
      }
    }
    return null;
  }
  // d. Gruppi: k boschetti chiusi in k righe (o colonne), oppure k righe chiuse in k boschetti
  function gruppi(n, zone, s, U) {
    var g = geometria(n);
    function combinazioni(arr, k) {
      var out = [];
      (function passo(da, sc) {
        if (sc.length === k) { out.push(sc.slice()); return; }
        for (var i = da; i < arr.length; i++) { sc.push(arr[i]); passo(i + 1, sc); sc.pop(); }
      })(0, []);
      return out;
    }
    var aperti = [];
    for (var z = 0; z < n; z++) if (!haPanda(s, U[2 * n + z])) aperti.push(z);
    for (var k = 2; k <= Math.min(4, aperti.length - 1); k++) {
      var combo = combinazioni(aperti, k);
      for (var a = 0; a < 2; a++) {
        var arr = a ? g.COLONNA : g.RIGA, base = a ? n : 0, nomeL = a ? 'colonne' : 'righe';
        for (var c = 0; c < combo.length; c++) {
          var linee = {}, celleG = [];
          combo[c].forEach(function (zz) { liberi(s, U[2 * n + zz]).forEach(function (p) { linee[arr[p]] = 1; celleG.push(p); }); });
          var ll = Object.keys(linee).map(Number);
          if (ll.length !== k) continue;
          var via = [];
          ll.forEach(function (L) { liberi(s, U[base + L]).forEach(function (p) { if (combo[c].indexOf(zone[p]) < 0) via.push(p); }); });
          if (via.length) {
            return { tecnica: 'gruppi', tipo: 'escludi', celle: via, evidenzia: celleG,
              testo: 'I ' + k + ' boschetti ' + combo[c].map(function (zz) { return NOMI_ZONA[zz]; }).join(', ') + ' hanno le caselle libere solo nelle ' + nomeL + ' ' +
                ll.map(function (x) { return x + 1; }).join(', ') + '. Quei ' + k + ' panda riempiranno quindi quelle ' + k + ' ' + nomeL +
                ': nelle altre loro caselle (' + elenco(g, via) + ') non può esserci un panda.' };
          }
        }
        // verso opposto: k linee chiuse dentro k boschetti
        var lineeAperte = [];
        for (var L = 0; L < n; L++) if (!haPanda(s, U[base + L])) lineeAperte.push(L);
        var comboL = combinazioni(lineeAperte, k);
        for (c = 0; c < comboL.length; c++) {
          var zz2 = {}, celleL = [];
          comboL[c].forEach(function (L2) { liberi(s, U[base + L2]).forEach(function (p) { zz2[zone[p]] = 1; celleL.push(p); }); });
          var zk = Object.keys(zz2).map(Number);
          if (zk.length !== k) continue;
          var via3 = [];
          zk.forEach(function (z3) { liberi(s, U[2 * n + z3]).forEach(function (p) { if (comboL[c].indexOf(arr[p]) < 0) via3.push(p); }); });
          if (via3.length) {
            return { tecnica: 'gruppi', tipo: 'escludi', celle: via3, evidenzia: celleL,
              testo: 'Le ' + nomeL + ' ' + comboL[c].map(function (x) { return x + 1; }).join(', ') + ' hanno le caselle libere solo nei boschetti ' +
                zk.map(function (x) { return NOMI_ZONA[x]; }).join(', ') + '. Quei ' + k + ' boschetti avranno quindi il panda in quelle ' + nomeL +
                ': nelle altre loro caselle (' + elenco(g, via3) + ') non può esserci un panda.' };
          }
        }
      }
    }
    return null;
  }

  var TECNICHE = [unicoPosto, confinamento, toccaTutti, gruppi];
  var RANGO = { 'unico-posto': 1, 'confinamento': 2, 'tocca-tutti': 3, 'gruppi': 4 };
  var PESO = { 'unico-posto': 1, 'confinamento': 4, 'tocca-tutti': 9, 'gruppi': 16 };
  var NOME_TECNICA = {
    'unico-posto': 'Unico posto', 'confinamento': 'Boschetto chiuso in una linea',
    'tocca-tutti': 'Casella che toglie tutto', 'gruppi': 'Gruppi di boschetti'
  };

  /** Prossimo passo logico sullo stato dato (le esclusioni implicite si aggiungono da sole). */
  function prossimoPasso(n, zone, stato) {
    var s = statoPieno(n, zone, stato), U = unita(n, zone);
    for (var t = 0; t < TECNICHE.length; t++) {
      var passo = TECNICHE[t](n, zone, s, U);
      if (passo) { passo.nomeTecnica = NOME_TECNICA[passo.tecnica]; return passo; }
    }
    return null;
  }
  /** Risolve con la sola logica; restituisce rango, punteggio e se basta. */
  function valuta(n, zone) {
    var stato = new Array(n * n).fill(0), rango = 0, punteggio = 0, passi = 0, conteggi = {};
    for (;;) {
      var piazzati = stato.filter(function (x) { return x === 2; }).length;
      if (piazzati === n) break;
      var passo = prossimoPasso(n, zone, stato);
      if (!passo) return { risolto: false, rango: 9, punteggio: punteggio + 100, conteggi: conteggi };
      conteggi[passo.tecnica] = (conteggi[passo.tecnica] || 0) + 1;
      rango = Math.max(rango, RANGO[passo.tecnica]);
      punteggio += PESO[passo.tecnica];
      if (passo.tipo === 'piazza') stato[passo.cella] = 2; else passo.celle.forEach(function (p) { stato[p] = 1; });
      if (++passi > 500) return { risolto: false, rango: 9, punteggio: 999, conteggi: conteggi };
    }
    return { risolto: true, rango: rango, punteggio: punteggio, conteggi: conteggi };
  }
  var FASCE = ['Facile', 'Medio', 'Difficile', 'Esperto'];
  function fasciaDi(val) { return val.risolto ? FASCE[Math.min(4, Math.max(1, val.rango)) - 1] : null; }

  var API = {
    geometria: geometria, generatore: generatore, mescola: mescola, contaSoluzioni: contaSoluzioni,
    generaLivello: generaLivello, unita: unita, ombra: ombra, statoPieno: statoPieno,
    prossimoPasso: prossimoPasso, valuta: valuta, fasciaDi: fasciaDi, FASCE: FASCE, RANGO: RANGO, NOME_TECNICA: NOME_TECNICA,
    NOMI_ZONA: NOMI_ZONA, nomeZona: nomeZona, nomeCasella: nomeCasella, nomeUnita: nomeUnita
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else radice.PandinoMotore = API;
})(typeof self !== 'undefined' ? self : this);
