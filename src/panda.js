/*
 * Pandino · i nove panda (SVG in linea, nessuna immagine esterna)
 * ---------------------------------------------------------------------------
 * L'insieme dei simboli S = {p1 … p9} corrisponde uno a uno agli interi 1…9.
 * I panda si distinguono su più canali visivi insieme:
 *   sottospecie  panda gigante (bianco e nero) o panda minore (rosso)
 *   espressione  sorriso, occhiolino, stupore, occhi chiusi, sonno
 *   posa         testa dritta o inclinata, coda in vista, zampa con il bambù
 *   accessorio   forme diverse: canna, fiocco, occhiali, cuffie, sciarpa, berretto
 * Il numero (o i puntini) resta sempre disponibile come indice di decodifica,
 * così il gioco si legge anche senza distinguere i colori.
 */
(function (radice) {
  'use strict';
  var NERO = '#1d1d1f', ROSSO = '#c9541f', ROSSO_SCURO = '#7a2c10', CREMA = '#fff6ea';
  var tratto = ' stroke="' + NERO + '" stroke-width="2.4" stroke-linejoin="round"';

  // ---------------------------------------------------------- occhi e bocche
  var OCCHI = {
    aperti: '<circle cx="37.5" cy="52.5" r="3.6" fill="#fff"/><circle cx="62.5" cy="52.5" r="3.6" fill="#fff"/>' +
      '<circle cx="38.4" cy="53.4" r="1.7" fill="' + NERO + '"/><circle cx="61.6" cy="53.4" r="1.7" fill="' + NERO + '"/>',
    occhiolino: '<path d="M32 53 q5 -4 10 0" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
      '<circle cx="62.5" cy="52.5" r="3.6" fill="#fff"/><circle cx="61.6" cy="53.4" r="1.7" fill="' + NERO + '"/>',
    stupiti: '<circle cx="37" cy="52" r="5.4" fill="#fff"/><circle cx="63" cy="52" r="5.4" fill="#fff"/>' +
      '<circle cx="37" cy="52" r="2.4" fill="' + NERO + '"/><circle cx="63" cy="52" r="2.4" fill="' + NERO + '"/>',
    felici: '<path d="M32 55 q5 -6 10 0 M58 55 q5 -6 10 0" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
    sonno: '<path d="M31 53 q5 4 10 0 M59 53 q5 4 10 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
  };
  var BOCCHE = {
    sorriso: '<path d="M43 72 q7 7 14 0" stroke="' + NERO + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    risata: '<path d="M42 71 q8 11 16 0 z" fill="#b8323c" stroke="' + NERO + '" stroke-width="2.2" stroke-linejoin="round"/>',
    piccola: '<path d="M46 73 q4 3 8 0" stroke="' + NERO + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    o: '<ellipse cx="50" cy="75" rx="3.6" ry="4.4" fill="#b8323c" stroke="' + NERO + '" stroke-width="2"/>'
  };

  /** Testa di panda gigante: orecchie nere, mascherine nere attorno agli occhi. */
  function gigante(occhi, bocca) {
    return '<circle cx="24" cy="30" r="13" fill="' + NERO + '"/><circle cx="76" cy="30" r="13" fill="' + NERO + '"/>' +
      '<ellipse cx="50" cy="57" rx="36" ry="32" fill="#fff"' + tratto.replace('2.4', '3') + '/>' +
      '<ellipse cx="36" cy="54" rx="8.5" ry="11.5" transform="rotate(-28 36 54)" fill="' + NERO + '"/>' +
      '<ellipse cx="64" cy="54" rx="8.5" ry="11.5" transform="rotate(28 64 54)" fill="' + NERO + '"/>' +
      OCCHI[occhi] +
      '<ellipse cx="50" cy="66" rx="6" ry="4.2" fill="' + NERO + '"/>' + BOCCHE[bocca] +
      '<ellipse cx="28" cy="70" rx="5" ry="3" fill="#f6a5b5" opacity=".75"/><ellipse cx="72" cy="70" rx="5" ry="3" fill="#f6a5b5" opacity=".75"/>';
  }
  /** Testa di panda minore (panda rosso): orecchie a punta, muso e sopracciglia bianchi. */
  function minore(occhi, bocca) {
    var o = occhi === 'aperti'
      ? '<circle cx="37" cy="52" r="4.4" fill="' + NERO + '"/><circle cx="63" cy="52" r="4.4" fill="' + NERO + '"/>' +
        '<circle cx="38.3" cy="50.7" r="1.4" fill="#fff"/><circle cx="64.3" cy="50.7" r="1.4" fill="#fff"/>'
      : '<path d="M32 54 q5 -6 10 0 M58 54 q5 -6 10 0" stroke="' + NERO + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>';
    return '<path d="M14 36 L20 8 L40 26 Z" fill="' + ROSSO + '"' + tratto + '/><path d="M86 36 L80 8 L60 26 Z" fill="' + ROSSO + '"' + tratto + '/>' +
      '<path d="M20 30 L23 16 L33 26 Z" fill="' + CREMA + '"/><path d="M80 30 L77 16 L67 26 Z" fill="' + CREMA + '"/>' +
      '<ellipse cx="50" cy="57" rx="37" ry="31" fill="' + ROSSO + '"' + tratto.replace('2.4', '3') + '/>' +
      '<ellipse cx="34" cy="42" rx="6" ry="4" fill="' + CREMA + '"/><ellipse cx="66" cy="42" rx="6" ry="4" fill="' + CREMA + '"/>' +
      '<path d="M30 60 q20 26 40 0 q-8 -6 -20 -6 q-12 0 -20 6z" fill="' + CREMA + '"/>' +
      '<path d="M37 58 q-3 8 -8 12 M63 58 q3 8 8 12" stroke="' + ROSSO_SCURO + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      o + '<ellipse cx="50" cy="65" rx="5.5" ry="3.8" fill="' + NERO + '"/>' + BOCCHE[bocca];
  }

  var PANDA = [
    null,
    { nome: 'Bambù', specie: 'panda gigante', tratto: 'panda gigante sorridente che tiene una canna di bambù',
      disegno: function () {
        return gigante('aperti', 'sorriso') +
          '<g transform="rotate(-20 86 64)"><rect x="81" y="28" width="10" height="66" rx="4" fill="#3c9a4a"' + tratto + '/>' +
          '<path d="M81 49 h10 M81 70 h10" stroke="' + NERO + '" stroke-width="2.4"/>' +
          '<path d="M90 42 q15 -10 12 -23 q-12 4 -12 23z" fill="#66c25a" stroke="' + NERO + '" stroke-width="2"/></g>' +
          '<ellipse cx="80" cy="82" rx="9" ry="7" fill="' + NERO + '"/>';
      } },
    { nome: 'Fiocco', specie: 'panda gigante', tratto: 'panda gigante che fa l’occhiolino, con un fiocco a farfalla',
      disegno: function () {
        return gigante('occhiolino', 'sorriso') +
          '<path d="M50 24 L30 12 L32 36 Z" fill="#ef5b93"' + tratto + '/><path d="M50 24 L70 12 L68 36 Z" fill="#ef5b93"' + tratto + '/>' +
          '<circle cx="50" cy="24" r="6" fill="#c2255c"' + tratto + '/>';
      } },
    { nome: 'Occhialino', specie: 'panda gigante', tratto: 'panda gigante serio con gli occhiali tondi',
      disegno: function () {
        return gigante('aperti', 'piccola') +
          '<circle cx="37" cy="53" r="11" fill="rgba(160,200,255,.25)" stroke="#1c6dd0" stroke-width="4"/>' +
          '<circle cx="63" cy="53" r="11" fill="rgba(160,200,255,.25)" stroke="#1c6dd0" stroke-width="4"/>' +
          '<path d="M48 52 q2 -3 4 0 M26 51 L16 47 M74 51 L84 47" stroke="#1c6dd0" stroke-width="4" fill="none" stroke-linecap="round"/>';
      } },
    { nome: 'Rossino', specie: 'panda minore', tratto: 'panda minore, il panda rosso, con le orecchie a punta',
      disegno: function () { return minore('aperti', 'sorriso'); } },
    { nome: 'Stupito', specie: 'panda gigante', tratto: 'panda gigante stupito, con la bocca a «o» e il ciuffo dritto',
      disegno: function () {
        return gigante('stupiti', 'o') +
          '<path d="M44 26 q-4 -14 2 -20 M50 25 q0 -14 6 -19 M56 26 q4 -12 12 -14" stroke="' + NERO + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
          '<path d="M6 40 l8 4 M4 54 l9 0 M94 40 l-8 4 M96 54 l-9 0" stroke="#d99a00" stroke-width="3" stroke-linecap="round"/>';
      } },
    { nome: 'Cuffiette', specie: 'panda gigante', tratto: 'panda gigante felice a occhi chiusi, con le cuffie',
      disegno: function () {
        return gigante('felici', 'risata') +
          '<path d="M14 52 Q14 6 50 6 Q86 6 86 52" fill="none" stroke="#e8590c" stroke-width="6" stroke-linecap="round"/>' +
          '<rect x="6" y="44" width="14" height="24" rx="6" fill="#ff8a3d"' + tratto + '/><rect x="80" y="44" width="14" height="24" rx="6" fill="#ff8a3d"' + tratto + '/>' +
          '<path d="M90 20 l0 -12 l7 -2 l0 10" stroke="' + NERO + '" stroke-width="2" fill="none"/><circle cx="88" cy="20" r="2.6" fill="' + NERO + '"/>';
      } },
    { nome: 'Sciarpina', specie: 'panda gigante', tratto: 'panda gigante con la testa inclinata e la sciarpa a righe',
      disegno: function () {
        return '<g transform="rotate(-16 50 60)">' + gigante('aperti', 'sorriso') + '</g>' +
          '<path d="M16 82 Q50 98 84 82 L86 92 Q50 108 14 92 Z" fill="#e03131"' + tratto + '/>' +
          '<path d="M28 88 l3 9 M43 91 l1 9 M58 91 l-1 9 M72 88 l-3 9" stroke="#fff" stroke-width="3"/>' +
          '<path d="M68 92 l5 11 l11 -4 l-6 -12z" fill="#e03131"' + tratto + '/>';
      } },
    { nome: 'Codarossa', specie: 'panda minore', tratto: 'panda minore felice con la coda ad anelli in vista',
      disegno: function () {
        return '<path d="M70 96 q30 -4 28 -36 q-1 -12 -10 -16 q4 14 -4 26 q-6 10 -20 14z" fill="' + ROSSO + '"' + tratto + '/>' +
          '<path d="M90 50 q3 6 1 12 M93 66 q-2 6 -7 10 M84 82 q-5 4 -10 5" stroke="' + ROSSO_SCURO + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
          minore('felici', 'risata');
      } },
    { nome: 'Dormiglione', specie: 'panda gigante', tratto: 'panda gigante che dorme con il berretto da notte',
      disegno: function () {
        return gigante('sonno', 'piccola') +
          '<path d="M24 34 Q40 4 76 18 Q92 24 94 40 Q80 28 72 32 Q52 22 24 34 Z" fill="#15aabf"' + tratto + '/>' +
          '<circle cx="94" cy="42" r="6" fill="#fff"' + tratto + '/>' +
          '<text x="2" y="24" font-family="system-ui, sans-serif" font-weight="900" font-size="16" fill="#0b7285">z</text>' +
          '<text x="11" y="12" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#0b7285">z</text>';
      } }
  ];

  function simboli() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    for (var v = 1; v <= 9; v++) s += '<symbol id="panda-' + v + '" viewBox="-4 -4 108 112">' + PANDA[v].disegno() + '</symbol>';
    return s + '</defs></svg>';
  }
  function uso(v, classe) {
    return '<svg class="' + (classe || 'panda') + '" viewBox="-4 -4 108 112" aria-hidden="true" focusable="false"><use href="#panda-' + v + '"/></svg>';
  }
  /** Indice di decodifica in puntini, come sui dadi (alternativa al numero). */
  function puntini(v) {
    var pos = {
      1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]],
      5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
      7: [[1, 1], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1], [3, 3]], 8: [[1, 1], [1, 2], [1, 3], [2, 1], [2, 3], [3, 1], [3, 2], [3, 3]],
      9: [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [3, 3]]
    }[v];
    return '<svg class="puntini" viewBox="0 0 4 4" aria-hidden="true" focusable="false">' +
      pos.map(function (p) { return '<circle cx="' + p[1] + '" cy="' + p[0] + '" r=".42" fill="currentColor"/>'; }).join('') + '</svg>';
  }

  radice.PandinoPanda = { PANDA: PANDA, simboli: simboli, uso: uso, puntini: puntini };
})(typeof self !== 'undefined' ? self : this);
