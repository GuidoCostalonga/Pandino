/*
 * Pandino · motore
 * ===========================================================================
 * Modello CSP (problema di soddisfacimento di vincoli)
 *   Variabili  X = { x(i,j) | 1 <= i, j <= n }, salvate in un vettore di n*n
 *              caselle (indice p = i*n + j, partendo da 0); 0 = non assegnata.
 *   Dominio    D(i,j) = S \ { valori già presenti nelle caselle incidenti },
 *              rappresentato da una maschera di n bit.
 *   Vincoli    AllDifferent su ogni riga, ogni colonna e ogni blocco.
 *   Cardinalità  n = 4 (blocchi 2×2), n = 6 (blocchi 2×3), n = 9 (blocchi 3×3).
 *
 * Il file funziona nel browser (self.PandinoMotore) e in Node (module.exports):
 * strumenti, verifiche e gioco usano lo stesso codice.
 *
 * Indice
 *  1. Geometria: relazioni precalcolate fra caselle per ogni n
 *  2. Generatore pseudocasuale con seed (mulberry32)
 *  3. Risolutori
 *     3a. Algorithm X di Knuth con Dancing Links (DLX): conteggio esatto delle soluzioni
 *     3b. Backtracking con euristica MRV e Forward Checking: matrice completa casuale,
 *         completabilità di una griglia parziale
 *  4. Generazione procedurale: matrice completa, fase di scavo simmetrico con
 *     test di unicità, classificazione della difficoltà
 *  5. Euristiche logiche (candidati virtuali, Naked e Hidden Single, Pointing,
 *     Claiming, coppie e terne, X-Wing, Swordfish) per suggerimenti e difficoltà
 *  6. Panda Pop: poliomini, vassoio di tessere, posizionamento e saturazione
 */
(function (radice) {
  'use strict';

  // =========================================================================
  // 1. Geometria
  // =========================================================================
  var CONTA_BIT = new Uint8Array(512);
  var VALORE_DI_BIT = {};
  var i0;
  for (i0 = 1; i0 < 512; i0++) CONTA_BIT[i0] = CONTA_BIT[i0 >> 1] + (i0 & 1);
  for (i0 = 1; i0 <= 9; i0++) VALORE_DI_BIT[1 << (i0 - 1)] = i0;
  var BLOCCHI = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };
  var cacheGeo = {};

  /** Relazioni precalcolate per una griglia n×n: si calcolano una volta sola. */
  function geometria(n) {
    if (cacheGeo[n]) return cacheGeo[n];
    if (!BLOCCHI[n]) throw new Error('Dimensione non prevista: ' + n);
    var bh = BLOCCHI[n][0], bw = BLOCCHI[n][1], N = n * n, p, u;
    var g = {
      n: n, N: N, bh: bh, bw: bw, TUTTI: (1 << n) - 1,
      RIGA: new Array(N), COLONNA: new Array(N), BLOCCO: new Array(N),
      UNITA: [], UNITA_DI: [], VICINE: []
    };
    for (p = 0; p < N; p++) {
      g.RIGA[p] = Math.floor(p / n);
      g.COLONNA[p] = p % n;
      g.BLOCCO[p] = Math.floor(g.RIGA[p] / bh) * (n / bw) + Math.floor(g.COLONNA[p] / bw);
    }
    for (u = 0; u < 3 * n; u++) g.UNITA.push([]);
    for (p = 0; p < N; p++) {
      g.UNITA[g.RIGA[p]].push(p);
      g.UNITA[n + g.COLONNA[p]].push(p);
      g.UNITA[2 * n + g.BLOCCO[p]].push(p);
      g.UNITA_DI.push([g.RIGA[p], n + g.COLONNA[p], 2 * n + g.BLOCCO[p]]);
    }
    for (p = 0; p < N; p++) {
      var visto = {}, vic = [];
      for (var k = 0; k < 3; k++) {
        g.UNITA[g.UNITA_DI[p][k]].forEach(function (q) { if (q !== p && !visto[q]) { visto[q] = 1; vic.push(q); } });
      }
      g.VICINE.push(vic);
    }
    cacheGeo[n] = g;
    return g;
  }

  function bit(v) { return 1 << (v - 1); }
  function valoriDi(m) { var out = []; for (var v = 1; v <= 9; v++) if (m & (1 << (v - 1))) out.push(v); return out; }

  // =========================================================================
  // 2. Generatore pseudocasuale riproducibile
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
    for (var x = arr.length - 1; x > 0; x--) {
      var y = Math.floor(casuale() * (x + 1)), t = arr[x];
      arr[x] = arr[y]; arr[y] = t;
    }
    return arr;
  }

  // =========================================================================
  // 3a. Algorithm X con Dancing Links (DLX)
  // =========================================================================
  /**
   * Copertura esatta: 4·N colonne (casella occupata, valore in riga, valore in
   * colonna, valore in blocco) e N·n righe (una per ogni coppia casella-valore).
   * Le liste circolari doppiamente collegate stanno in vettori tipizzati.
   * Restituisce { conteggio, soluzione } fermandosi a `limite` soluzioni.
   */
  function contaSoluzioniDLX(geo, griglia, limite) {
    limite = limite || 2;
    var n = geo.n, N = geo.N, nc = 4 * N, totale = 1 + nc + N * n * 4;
    var L = new Int32Array(totale), R = new Int32Array(totale), U = new Int32Array(totale), D = new Int32Array(totale);
    var C = new Int32Array(totale), S = new Int32Array(nc + 1), RIGA_DI = new Int32Array(totale), inizio = new Int32Array(N * n);
    var x;
    for (x = 0; x <= nc; x++) { L[x] = x - 1; R[x] = x + 1; U[x] = x; D[x] = x; C[x] = x; }
    L[0] = nc; R[nc] = 0;
    var k = nc + 1;
    for (var p = 0; p < N; p++) {
      for (var v = 0; v < n; v++) {
        var col = [1 + p, 1 + N + geo.RIGA[p] * n + v, 1 + 2 * N + geo.COLONNA[p] * n + v, 1 + 3 * N + geo.BLOCCO[p] * n + v];
        var primo = k;
        inizio[p * n + v] = k;
        for (var t = 0; t < 4; t++) {
          var c = col[t];
          C[k] = c; RIGA_DI[k] = p * n + v;
          U[k] = U[c]; D[k] = c; D[U[c]] = k; U[c] = k; S[c]++;
          L[k] = t === 0 ? k + 3 : k - 1;
          R[k] = t === 3 ? primo : k + 1;
          k++;
        }
      }
    }
    function copri(c) {
      L[R[c]] = L[c]; R[L[c]] = R[c];
      for (var i = D[c]; i !== c; i = D[i]) {
        for (var j = R[i]; j !== i; j = R[j]) { U[D[j]] = U[j]; D[U[j]] = D[j]; S[C[j]]--; }
      }
    }
    function scopri(c) {
      for (var i = U[c]; i !== c; i = U[i]) {
        for (var j = L[i]; j !== i; j = L[j]) { S[C[j]]++; U[D[j]] = j; D[U[j]] = j; }
      }
      L[R[c]] = c; R[L[c]] = c;
    }
    // le caselle già assegnate scelgono subito la loro riga
    var coperta = new Uint8Array(nc + 1), scelte = [];
    for (p = 0; p < N; p++) {
      if (!griglia[p]) continue;
      var r0 = inizio[p * n + griglia[p] - 1], j0 = r0;
      do { if (coperta[C[j0]]) return { conteggio: 0, soluzione: null }; j0 = R[j0]; } while (j0 !== r0);
      j0 = r0;
      do { coperta[C[j0]] = 1; copri(C[j0]); j0 = R[j0]; } while (j0 !== r0);
    }
    var conteggio = 0, soluzione = null;
    function cerca() {
      if (R[0] === 0) {
        conteggio++;
        if (!soluzione) {
          soluzione = Array.prototype.slice.call(griglia);
          scelte.forEach(function (rr) { soluzione[Math.floor(rr / n)] = rr % n + 1; });
        }
        return conteggio >= limite;
      }
      var c = R[0], min = S[c];
      for (var cc = R[c]; cc !== 0; cc = R[cc]) if (S[cc] < min) { min = S[cc]; c = cc; }
      if (min === 0) return false;
      copri(c);
      for (var r = D[c]; r !== c; r = D[r]) {
        scelte.push(RIGA_DI[r]);
        for (var j = R[r]; j !== r; j = R[j]) copri(C[j]);
        var fine = cerca();
        for (j = L[r]; j !== r; j = L[j]) scopri(C[j]);
        scelte.pop();
        if (fine) { scopri(c); return true; }
      }
      scopri(c);
      return false;
    }
    cerca();
    return { conteggio: conteggio, soluzione: soluzione };
  }

  // =========================================================================
  // 3b. Backtracking con MRV e Forward Checking
  // =========================================================================
  /**
   * Sceglie sempre la variabile con il dominio più piccolo (MRV); dopo ogni
   * assegnazione controlla che nessuna casella vicina resti senza valori
   * (Forward Checking). `casuale` mescola l'ordine dei valori; `maxNodi`
   * interrompe la ricerca (risultato { interrotto: true }).
   */
  function contaSoluzioniMRV(geo, griglia, limite, casuale, maxNodi) {
    limite = limite || 2;
    var n = geo.n, N = geo.N, TUTTI = geo.TUTTI, RIGA = geo.RIGA, COL = geo.COLONNA, BLO = geo.BLOCCO, VIC = geo.VICINE;
    var g = Array.prototype.slice.call(griglia);
    var righe = new Int32Array(n), colonne = new Int32Array(n), blocchi = new Int32Array(n);
    for (var p = 0; p < N; p++) {
      var v = g[p];
      if (!v) continue;
      var m = bit(v);
      if ((righe[RIGA[p]] | colonne[COL[p]] | blocchi[BLO[p]]) & m) return { conteggio: 0, soluzione: null };
      righe[RIGA[p]] |= m; colonne[COL[p]] |= m; blocchi[BLO[p]] |= m;
    }
    var conteggio = 0, soluzione = null, nodi = 0, interrotto = false;
    var ordine = []; for (v = 1; v <= n; v++) ordine.push(v);
    function dominio(q) { return TUTTI & ~(righe[RIGA[q]] | colonne[COL[q]] | blocchi[BLO[q]]); }
    function cerca() {
      if (maxNodi && ++nodi > maxNodi) { interrotto = true; return true; }
      var migliore = -1, mm = 0, min = 99;
      for (var q = 0; q < N; q++) {
        if (g[q] === 0) {
          var d = dominio(q), c = CONTA_BIT[d];
          if (c < min) { min = c; migliore = q; mm = d; if (c <= 1) break; }
        }
      }
      if (migliore < 0) { conteggio++; if (!soluzione) soluzione = g.slice(); return conteggio >= limite; }
      if (min === 0) return false;
      var valori = casuale ? mescola(ordine.slice(), casuale) : ordine;
      var r = RIGA[migliore], c2 = COL[migliore], b = BLO[migliore], vic = VIC[migliore];
      for (var t = 0; t < n; t++) {
        var val = valori[t], mb = bit(val);
        if (!(mm & mb)) continue;
        g[migliore] = val; righe[r] |= mb; colonne[c2] |= mb; blocchi[b] |= mb;
        // Forward Checking: nessuna vicina vuota deve restare senza dominio
        var vuoto = false;
        for (var z = 0; z < vic.length; z++) { var w = vic[z]; if (g[w] === 0 && !dominio(w)) { vuoto = true; break; } }
        var stop = !vuoto && cerca();
        g[migliore] = 0; righe[r] &= ~mb; colonne[c2] &= ~mb; blocchi[b] &= ~mb;
        if (stop) return true;
      }
      return false;
    }
    cerca();
    return { conteggio: interrotto ? -1 : conteggio, soluzione: interrotto ? null : soluzione, interrotto: interrotto };
  }

  // =========================================================================
  // 4. Generazione procedurale
  // =========================================================================
  /** Fase 1: matrice completa casuale (MRV + Forward Checking, valori mescolati). */
  function matriceCompleta(geo, casuale) {
    return contaSoluzioniMRV(geo, new Array(geo.N).fill(0), 1, casuale).soluzione;
  }

  /**
   * Fasi 1 e 2: matrice completa e scavo. Le caselle si tolgono a coppie
   * simmetriche rispetto al centro; dopo ogni rimozione DLX conta le
   * soluzioni: se restano esattamente 1 lo scavo si conferma, altrimenti
   * il valore torna al suo posto.
   */
  function generaPuzzle(n, seed, opzioni) {
    opzioni = opzioni || {};
    var geo = geometria(n), N = geo.N;
    var minimo = opzioni.minimoIndizi || 0;
    var casuale = generatore(seed);
    var soluzione = matriceCompleta(geo, casuale);
    var puzzle = soluzione.slice(), celle = [];
    for (var p = 0; p <= Math.floor((N - 1) / 2); p++) celle.push(p);
    mescola(celle, casuale);
    var indizi = N;
    for (var t = 0; t < celle.length; t++) {
      var a = celle[t], b = N - 1 - a, togli = a === b ? 1 : 2;
      if (indizi - togli < minimo) continue;
      var va = puzzle[a], vb = puzzle[b];
      puzzle[a] = 0; puzzle[b] = 0;
      if (contaSoluzioniDLX(geo, puzzle, 2).conteggio !== 1) { puzzle[a] = va; puzzle[b] = vb; }
      else indizi -= togli;
    }
    return { n: n, seed: seed, puzzle: puzzle, soluzione: soluzione, indizi: indizi };
  }

  // =========================================================================
  // 5. Euristiche logiche
  // =========================================================================
  var NOMI_PANDA = ['', 'Bambù', 'Fiocco', 'Occhialino', 'Rossino', 'Stupito', 'Cuffiette', 'Sciarpina', 'Codarossa', 'Dormiglione'];
  var LIVELLO_TECNICA = {
    'naked-single': 1, 'hidden-single': 1, 'pointing': 2, 'claiming': 2,
    'naked-pair': 3, 'hidden-pair': 3, 'naked-triple': 3, 'x-wing': 4, 'swordfish': 5
  };
  var PESO_TECNICA = {
    'naked-single': 1, 'hidden-single': 1.5, 'pointing': 6, 'claiming': 7,
    'naked-pair': 12, 'hidden-pair': 15, 'naked-triple': 18, 'x-wing': 30, 'swordfish': 45
  };
  var NOME_TECNICA = {
    'naked-single': 'Unico candidato (Naked Single)',
    'hidden-single': 'Unico posto (Hidden Single)',
    'pointing': 'Candidati bloccati: Pointing',
    'claiming': 'Candidati bloccati: Claiming',
    'naked-pair': 'Coppia esclusiva (Naked Pair)',
    'hidden-pair': 'Coppia nascosta (Hidden Pair)',
    'naked-triple': 'Terna esclusiva (Naked Triple)',
    'x-wing': 'X-Wing',
    'swordfish': 'Swordfish'
  };
  function nomePanda(v) { return 'Panda ' + v + ' ' + NOMI_PANDA[v]; }
  function nomeCasella(geo, p) { return 'riga ' + (geo.RIGA[p] + 1) + ', colonna ' + (geo.COLONNA[p] + 1); }
  function sigla(geo, p) { return 'R' + (geo.RIGA[p] + 1) + 'C' + (geo.COLONNA[p] + 1); }
  function nomeUnita(geo, u) {
    var n = geo.n;
    if (u < n) return 'riga ' + (u + 1);
    if (u < 2 * n) return 'colonna ' + (u - n + 1);
    return 'blocco ' + (u - 2 * n + 1);
  }
  function nella(geo, u) { return u < 2 * geo.n ? 'nella ' : 'nel '; }
  function della(geo, u) { return u < 2 * geo.n ? 'della ' : 'del '; }
  function elenco(geo, arr) { return arr.map(function (p) { return sigla(geo, p); }).join(', '); }
  function unisci(arr) { return arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]; }
  function combinazioni(arr, k) {
    var out = [];
    (function passo(da, sc) {
      if (sc.length === k) { out.push(sc.slice()); return; }
      for (var z = da; z < arr.length; z++) { sc.push(arr[z]); passo(z + 1, sc); sc.pop(); }
    })(0, []);
    return out;
  }

  /** Candidati virtuali di base: valori assenti fra le caselle incidenti. */
  function candidatiBase(geo, valori) {
    var n = geo.n, cand = new Array(geo.N);
    var righe = new Int32Array(n), colonne = new Int32Array(n), blocchi = new Int32Array(n), p;
    for (p = 0; p < geo.N; p++) if (valori[p]) {
      var m = bit(valori[p]);
      righe[geo.RIGA[p]] |= m; colonne[geo.COLONNA[p]] |= m; blocchi[geo.BLOCCO[p]] |= m;
    }
    for (p = 0; p < geo.N; p++) cand[p] = valori[p] ? 0 : geo.TUTTI & ~(righe[geo.RIGA[p]] | colonne[geo.COLONNA[p]] | blocchi[geo.BLOCCO[p]]);
    return cand;
  }
  function posizioni(cand, unita, m) { var out = []; for (var t = 0; t < unita.length; t++) if (cand[unita[t]] & m) out.push(unita[t]); return out; }
  function presente(valori, unita, v) { for (var t = 0; t < unita.length; t++) if (valori[unita[t]] === v) return true; return false; }

  function nakedSingle(geo, valori, cand) {
    for (var p = 0; p < geo.N; p++) {
      if (!valori[p] && CONTA_BIT[cand[p]] === 1) {
        var v = VALORE_DI_BIT[cand[p]];
        return { tecnica: 'naked-single', tipo: 'piazza', cella: p, valore: v, evidenzia: [p], unita: [],
          testo: 'Nella casella ' + nomeCasella(geo, p) + ' può stare soltanto il ' + nomePanda(v) +
            ': tutti gli altri panda sono già nella sua riga, nella sua colonna o nel suo blocco.' };
      }
    }
    return null;
  }
  function hiddenSingle(geo, valori, cand) {
    var n = geo.n, ordine = [], u;
    for (u = 2 * n; u < 3 * n; u++) ordine.push(u);
    for (u = 0; u < 2 * n; u++) ordine.push(u);
    for (var t = 0; t < ordine.length; t++) {
      var U = ordine[t], unita = geo.UNITA[U];
      for (var v = 1; v <= n; v++) {
        if (presente(valori, unita, v)) continue;
        var pos = posizioni(cand, unita, bit(v));
        if (pos.length === 1) {
          return { tecnica: 'hidden-single', tipo: 'piazza', cella: pos[0], valore: v, evidenzia: [pos[0]], unita: [U],
            testo: 'Il ' + nomePanda(v) + ' può stare soltanto in questa casella ' + della(geo, U) + nomeUnita(geo, U) +
              ' (' + nomeCasella(geo, pos[0]) + '): nelle altre caselle libere ' + della(geo, U) + nomeUnita(geo, U) +
              ' è escluso da una riga, da una colonna o da un blocco.' };
        }
      }
    }
    return null;
  }
  function pointing(geo, valori, cand) {
    var n = geo.n;
    for (var b = 0; b < n; b++) {
      var unita = geo.UNITA[2 * n + b];
      for (var v = 1; v <= n; v++) {
        var m = bit(v), pos = posizioni(cand, unita, m);
        if (pos.length < 2) continue;
        var assi = [['riga', geo.RIGA, 0], ['colonna', geo.COLONNA, n]];
        for (var q = 0; q < 2; q++) {
          var arr = assi[q][1], linea = arr[pos[0]], tutte = true;
          for (var z = 1; z < pos.length; z++) if (arr[pos[z]] !== linea) { tutte = false; break; }
          if (!tutte) continue;
          var U = assi[q][2] + linea, elim = [];
          geo.UNITA[U].forEach(function (p) { if (geo.BLOCCO[p] !== b && (cand[p] & m)) elim.push({ cella: p, valore: v }); });
          if (elim.length) {
            return { tecnica: 'pointing', tipo: 'elimina', eliminazioni: elim, valore: v, evidenzia: pos, unita: [2 * n + b, U],
              testo: 'Nel blocco ' + (b + 1) + ' il ' + nomePanda(v) + ' può stare soltanto nella ' + assi[q][0] + ' ' + (linea + 1) +
                ' (caselle ' + elenco(geo, pos) + '). Quindi nella ' + assi[q][0] + ' ' + (linea + 1) + ', fuori dal blocco ' + (b + 1) +
                ', il ' + nomePanda(v) + ' non può stare: lo togliamo dai candidati di ' + elenco(geo, elim.map(function (e) { return e.cella; })) + '.' };
          }
        }
      }
    }
    return null;
  }
  function claiming(geo, valori, cand) {
    var n = geo.n;
    for (var U = 0; U < 2 * n; U++) {
      var unita = geo.UNITA[U];
      for (var v = 1; v <= n; v++) {
        var m = bit(v), pos = posizioni(cand, unita, m);
        if (pos.length < 2) continue;
        var b = geo.BLOCCO[pos[0]], stesso = true;
        for (var z = 1; z < pos.length; z++) if (geo.BLOCCO[pos[z]] !== b) { stesso = false; break; }
        if (!stesso) continue;
        var elim = [];
        geo.UNITA[2 * n + b].forEach(function (p) { if (unita.indexOf(p) < 0 && (cand[p] & m)) elim.push({ cella: p, valore: v }); });
        if (elim.length) {
          return { tecnica: 'claiming', tipo: 'elimina', eliminazioni: elim, valore: v, evidenzia: pos, unita: [U, 2 * n + b],
            testo: 'Nella ' + nomeUnita(geo, U) + ' il ' + nomePanda(v) + ' può stare soltanto dentro il blocco ' + (b + 1) +
              ' (caselle ' + elenco(geo, pos) + '). Allora nel blocco ' + (b + 1) + ' il ' + nomePanda(v) + ' deve stare in quella ' +
              (U < n ? 'riga' : 'colonna') + ': lo togliamo dalle altre caselle del blocco, ' + elenco(geo, elim.map(function (e) { return e.cella; })) + '.' };
        }
      }
    }
    return null;
  }
  function nakedSubset(geo, valori, cand, dim) {
    for (var U = 0; U < 3 * geo.n; U++) {
      var unita = geo.UNITA[U], libere = [];
      unita.forEach(function (p) { var c = CONTA_BIT[cand[p]]; if (!valori[p] && c >= 2 && c <= dim) libere.push(p); });
      if (libere.length < dim) continue;
      var sc = combinazioni(libere, dim);
      for (var s = 0; s < sc.length; s++) {
        var gr = sc[s], un = 0;
        gr.forEach(function (p) { un |= cand[p]; });
        if (CONTA_BIT[un] !== dim) continue;
        var elim = [];
        unita.forEach(function (p) {
          if (gr.indexOf(p) < 0 && !valori[p]) valoriDi(cand[p] & un).forEach(function (v) { elim.push({ cella: p, valore: v }); });
        });
        if (elim.length) {
          return { tecnica: dim === 2 ? 'naked-pair' : 'naked-triple', tipo: 'elimina', eliminazioni: elim, evidenzia: gr, unita: [U],
            testo: (dim === 2 ? 'Le due caselle ' : 'Le tre caselle ') + elenco(geo, gr) + ' ' + nella(geo, U) + nomeUnita(geo, U) +
              ' possono contenere soltanto ' + unisci(valoriDi(un).map(function (v) { return 'il ' + nomePanda(v); })) +
              '. Questi panda finiranno per forza lì, quindi li togliamo dalle altre caselle ' + della(geo, U) + nomeUnita(geo, U) + '.' };
        }
      }
    }
    return null;
  }
  function hiddenPair(geo, valori, cand) {
    for (var U = 0; U < 3 * geo.n; U++) {
      var unita = geo.UNITA[U], pos = {};
      for (var v = 1; v <= geo.n; v++) { var pp = posizioni(cand, unita, bit(v)); if (pp.length === 2) pos[v] = pp; }
      var vals = Object.keys(pos).map(Number);
      for (var a = 0; a < vals.length; a++) for (var b = a + 1; b < vals.length; b++) {
        var pa = pos[vals[a]], pb = pos[vals[b]];
        if (pa[0] !== pb[0] || pa[1] !== pb[1]) continue;
        var tieni = bit(vals[a]) | bit(vals[b]), elim = [];
        pa.forEach(function (p) { valoriDi(cand[p] & ~tieni).forEach(function (x) { elim.push({ cella: p, valore: x }); }); });
        if (elim.length) {
          var testa = nella(geo, U);
          return { tecnica: 'hidden-pair', tipo: 'elimina', eliminazioni: elim, evidenzia: pa, unita: [U],
            testo: testa.charAt(0).toUpperCase() + testa.slice(1) + nomeUnita(geo, U) + ' il ' + nomePanda(vals[a]) + ' e il ' + nomePanda(vals[b]) +
              ' possono stare soltanto nelle caselle ' + elenco(geo, pa) + '. Quelle due caselle sono riservate a loro: togliamo gli altri candidati.' };
        }
      }
    }
    return null;
  }
  /** X-Wing (dim 2) e Swordfish (dim 3): configurazioni a rettangolo su linee parallele. */
  function pesce(geo, valori, cand, dim) {
    var n = geo.n;
    for (var v = 1; v <= n; v++) {
      var m = bit(v);
      for (var verso = 0; verso < 2; verso++) {
        var basi = [];
        for (var L = 0; L < n; L++) {
          var pos = posizioni(cand, geo.UNITA[verso === 0 ? L : n + L], m);
          if (pos.length >= 2 && pos.length <= dim) {
            var copre = 0;
            pos.forEach(function (p) { copre |= 1 << (verso === 0 ? geo.COLONNA[p] : geo.RIGA[p]); });
            basi.push({ linea: L, pos: pos, copre: copre });
          }
        }
        if (basi.length < dim) continue;
        var sc = combinazioni(basi, dim);
        for (var s = 0; s < sc.length; s++) {
          var gr = sc[s], cop = 0;
          gr.forEach(function (x) { cop |= x.copre; });
          if (CONTA_BIT[cop] !== dim) continue;
          var linee = gr.map(function (x) { return x.linea; }), elim = [];
          for (var x = 0; x < n; x++) {
            if (!(cop & (1 << x))) continue;
            geo.UNITA[verso === 0 ? n + x : x].forEach(function (p) {
              var lp = verso === 0 ? geo.RIGA[p] : geo.COLONNA[p];
              if (linee.indexOf(lp) < 0 && (cand[p] & m)) elim.push({ cella: p, valore: v });
            });
          }
          if (elim.length) {
            var tutte = [], coperte = [];
            gr.forEach(function (z) { tutte = tutte.concat(z.pos); });
            for (x = 0; x < n; x++) if (cop & (1 << x)) coperte.push(String(x + 1));
            var nb = verso === 0 ? 'righe' : 'colonne', nc = verso === 0 ? 'colonne' : 'righe';
            return { tecnica: dim === 2 ? 'x-wing' : 'swordfish', tipo: 'elimina', eliminazioni: elim, valore: v, evidenzia: tutte,
              unita: linee.map(function (l) { return verso === 0 ? l : n + l; }),
              testo: 'Nelle ' + nb + ' ' + unisci(linee.map(function (l) { return String(l + 1); })) + ' il ' + nomePanda(v) +
                ' può stare soltanto nelle ' + nc + ' ' + unisci(coperte) + '. Comunque si dispongano, questi ' + dim +
                ' panda occuperanno quelle ' + nc + ': nel resto delle ' + nc + ' ' + unisci(coperte) + ' il ' + nomePanda(v) +
                ' non può stare (' + elenco(geo, elim.map(function (e) { return e.cella; })) + ').' };
          }
        }
      }
    }
    return null;
  }

  var TECNICHE = [
    nakedSingle, hiddenSingle, pointing, claiming,
    function (g, v, c) { return nakedSubset(g, v, c, 2); }, hiddenPair,
    function (g, v, c) { return nakedSubset(g, v, c, 3); },
    function (g, v, c) { return pesce(g, v, c, 2); },
    function (g, v, c) { return pesce(g, v, c, 3); }
  ];

  /** Prossimo passo logico, oppure null se nessuna tecnica implementata trova una mossa. */
  function prossimoPasso(geo, valori, cand) {
    cand = cand || candidatiBase(geo, valori);
    for (var t = 0; t < TECNICHE.length; t++) {
      var passo = TECNICHE[t](geo, valori, cand);
      if (passo) { passo.nomeTecnica = NOME_TECNICA[passo.tecnica]; return passo; }
    }
    return null;
  }
  function applicaPasso(geo, valori, cand, passo) {
    if (passo.tipo === 'piazza') {
      valori[passo.cella] = passo.valore; cand[passo.cella] = 0;
      var m = bit(passo.valore);
      geo.VICINE[passo.cella].forEach(function (p) { cand[p] &= ~m; });
    } else passo.eliminazioni.forEach(function (e) { cand[e.cella] &= ~bit(e.valore); });
  }

  /**
   * Fase 3, classificazione: risolve con le sole euristiche, senza tentativi.
   * Il rango è la tecnica più impegnativa necessaria (6 = non bastano).
   */
  function valuta(geo, puzzle) {
    var valori = Array.prototype.slice.call(puzzle), cand = candidatiBase(geo, valori);
    var conteggi = {}, punteggio = 0, rango = 0, passi = 0;
    for (;;) {
      var vuote = 0;
      for (var p = 0; p < geo.N; p++) if (!valori[p]) vuote++;
      if (!vuote) break;
      var passo = prossimoPasso(geo, valori, cand);
      if (!passo) return { risolto: false, rango: 6, punteggio: Math.round(punteggio) + 200, conteggi: conteggi, passi: passi, restanti: vuote };
      conteggi[passo.tecnica] = (conteggi[passo.tecnica] || 0) + 1;
      punteggio += PESO_TECNICA[passo.tecnica];
      rango = Math.max(rango, LIVELLO_TECNICA[passo.tecnica]);
      applicaPasso(geo, valori, cand, passo);
      passi++;
    }
    return { risolto: true, rango: rango, punteggio: Math.round(punteggio), conteggi: conteggi, passi: passi, restanti: 0 };
  }
  function tecnicaPrincipale(val) {
    if (!val.risolto) return 'oltre';
    return Object.keys(val.conteggi).sort(function (a, b) {
      return LIVELLO_TECNICA[b] - LIVELLO_TECNICA[a] || PESO_TECNICA[b] - PESO_TECNICA[a];
    })[0] || 'naked-single';
  }

  /**
   * Fascia di difficoltà, la stessa per catalogo e partite libere.
   * Dipende dal rango della tecnica minima necessaria; per le griglie
   * ridotte le fasce sono meno numerose.
   *   9×9: Facile = solo singoli (almeno 32 indizi), Medio = candidati bloccati,
   *        Difficile = coppie, terne, X-Wing, Swordfish, Esperto = oltre.
   *   6×6: Facile = solo singoli (almeno 14 indizi), Medio = candidati bloccati
   *        o singoli con pochi indizi, Difficile = rango 3 o più.
   *   4×4: Facile.
   */
  var FASCE = ['Facile', 'Medio', 'Difficile', 'Esperto'];
  function fasciaDi(n, val, indizi) {
    if (n === 4) return 'Facile';
    if (n === 6) {
      if (!val.risolto || val.rango >= 3) return 'Difficile';
      if (val.rango === 2 || indizi < 14) return 'Medio';
      return 'Facile';
    }
    if (!val.risolto) return 'Esperto';
    if (val.rango >= 3) return 'Difficile';
    if (val.rango === 2) return 'Medio';
    return indizi >= 32 ? 'Facile' : null;
  }

  // =========================================================================
  // 6. Panda Pop: poliomini
  // =========================================================================
  /** Poliomini da 1 a 5 caselle, come scostamenti [riga, colonna] dall'angolo. */
  var FORME = [
    [[0, 0]],
    [[0, 0], [0, 1]], [[0, 0], [1, 0]],
    [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 1], [1, 1], [2, 1], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [2, 1]], [[0, 0], [1, 0], [1, 1], [2, 0]], [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 1], [1, 0], [1, 1], [2, 0]],
    [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
    [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]
  ];
  function dimensioniForma(f) {
    var h = 0, w = 0;
    f.forEach(function (c) { h = Math.max(h, c[0] + 1); w = Math.max(w, c[1] + 1); });
    return [h, w];
  }
  /** Caselle occupate da una forma con l'angolo in `ancora`, oppure null se esce dalla griglia. */
  function celleForma(geo, forma, ancora) {
    var r0 = geo.RIGA[ancora], c0 = geo.COLONNA[ancora], out = [];
    for (var k = 0; k < forma.length; k++) {
      var r = r0 + forma[k][0], c = c0 + forma[k][1];
      if (r >= geo.n || c >= geo.n) return null;
      out.push(r * geo.n + c);
    }
    return out;
  }
  /** Una griglia parziale è completabile se esiste almeno una matrice completa che la estende. */
  function completabile(geo, griglia) {
    var r = contaSoluzioniMRV(geo, griglia, 1, null, 60000);
    return r.conteggio === 1 ? r.soluzione : null;
  }

  /**
   * Vassoio di tessere: si calcola una matrice completa compatibile con la
   * griglia attuale e si ritagliano i poliomini su caselle vuote, con i panda
   * di quella matrice. Così ogni tessera, e anche tutte insieme, si possono
   * posare: la partita non si blocca mai.
   */
  function generaVassoio(geo, griglia, casuale, quante) {
    var completa = contaSoluzioniMRV(geo, griglia, 1, casuale, 200000).soluzione;
    if (!completa) return [];
    var libere = {}, nLibere = 0, p;
    for (p = 0; p < geo.N; p++) if (!griglia[p]) { libere[p] = 1; nLibere++; }
    var vassoio = [], massimo = geo.n === 4 ? 3 : geo.n === 6 ? 4 : 5;
    for (var t = 0; t < quante && nLibere > 0; t++) {
      var desiderata = 1 + Math.floor(casuale() * massimo);
      var trovata = null;
      for (var dim = desiderata; dim >= 1 && !trovata; dim--) {
        var forme = mescola(FORME.filter(function (f) { return f.length === dim; }), casuale);
        var ancore = mescola(Object.keys(libere).map(Number), casuale);
        for (var a = 0; a < forme.length && !trovata; a++) {
          for (var b = 0; b < ancore.length; b++) {
            var cel = celleForma(geo, forme[a], ancore[b]);
            if (cel && cel.every(function (q) { return libere[q]; })) { trovata = { forma: forme[a], celle: cel }; break; }
          }
        }
      }
      if (!trovata) break;
      trovata.celle.forEach(function (q) { delete libere[q]; nLibere--; });
      vassoio.push({ forma: trovata.forma, valori: trovata.celle.map(function (q) { return completa[q]; }) });
    }
    return vassoio;
  }

  /**
   * Controlla se una tessera si può posare con l'angolo in `ancora`:
   * caselle dentro la griglia e vuote, nessun AllDifferent violato,
   * griglia ancora completabile. Restituisce { ok, motivo, celle }.
   */
  function provaTessera(geo, griglia, tessera, ancora) {
    var cel = celleForma(geo, tessera.forma, ancora);
    if (!cel) return { ok: false, motivo: 'fuori', celle: null };
    var g = Array.prototype.slice.call(griglia), k;
    for (k = 0; k < cel.length; k++) if (g[cel[k]]) return { ok: false, motivo: 'occupata', celle: cel };
    for (k = 0; k < cel.length; k++) {
      var p = cel[k], v = tessera.valori[k];
      for (var z = 0; z < geo.VICINE[p].length; z++) {
        if (g[geo.VICINE[p][z]] === v) return { ok: false, motivo: 'conflitto', celle: cel, cella: p, valore: v, con: geo.VICINE[p][z] };
      }
      g[p] = v;
    }
    if (!completabile(geo, g)) return { ok: false, motivo: 'bloccherebbe', celle: cel };
    return { ok: true, celle: cel, griglia: g };
  }

  /** Unità sature (piene) fra quelle che contengono le caselle indicate. */
  function unitaSature(geo, griglia, celle) {
    var viste = {}, out = [];
    celle.forEach(function (p) {
      geo.UNITA_DI[p].forEach(function (u) {
        if (viste[u]) return;
        viste[u] = 1;
        if (geo.UNITA[u].every(function (q) { return griglia[q]; })) out.push(u);
      });
    });
    return out;
  }

  function daTesto(s) { return s.split('').map(Number); }
  function aTesto(g) { return Array.prototype.join.call(g, ''); }

  var API = {
    geometria: geometria, CONTA_BIT: CONTA_BIT, VALORE_DI_BIT: VALORE_DI_BIT,
    NOMI_PANDA: NOMI_PANDA, NOME_TECNICA: NOME_TECNICA, LIVELLO_TECNICA: LIVELLO_TECNICA, FASCE: FASCE, FORME: FORME,
    bit: bit, valoriDi: valoriDi, generatore: generatore, mescola: mescola,
    contaSoluzioniDLX: contaSoluzioniDLX, contaSoluzioniMRV: contaSoluzioniMRV, matriceCompleta: matriceCompleta,
    generaPuzzle: generaPuzzle, candidatiBase: candidatiBase, prossimoPasso: prossimoPasso, applicaPasso: applicaPasso,
    valuta: valuta, tecnicaPrincipale: tecnicaPrincipale, fasciaDi: fasciaDi,
    dimensioniForma: dimensioniForma, celleForma: celleForma, completabile: completabile, generaVassoio: generaVassoio,
    provaTessera: provaTessera, unitaSature: unitaSature,
    nomePanda: nomePanda, nomeCasella: nomeCasella, sigla: sigla, nomeUnita: nomeUnita, daTesto: daTesto, aTesto: aTesto
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else radice.PandinoMotore = API;
})(typeof self !== 'undefined' ? self : this);
