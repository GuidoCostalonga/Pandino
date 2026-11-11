# Pandino

Rompicapo a zone con i panda, in un'unica pagina HTML senza dipendenze esterne.
Pubblicato su **https://costalonga.org/pandino/**: raggiungibile da chi conosce
l'indirizzo, escluso dai motori di ricerca (vedi «Indicizzazione»).

## Le regole
Su una griglia n×n divisa in n boschetti colorati:
- un panda in ogni **riga**;
- un panda in ogni **colonna**;
- un panda in ogni **boschetto**;
- due panda **non si toccano mai**, nemmeno in diagonale.

È un rompicapo dello stesso genere di Star Battle e Queens, con nome, panda e
grafica originali.

| | |
|---|---|
| Livelli | **1.050** verificati, in 3 capitoli: 10×10 (450), 11×11 (350), 12×12 (250), più 15 di riserva |
| Difficoltà | Facile, Medio, Difficile, Esperto, stimate dal ragionamento più impegnativo necessario |
| Modi | Con tre cuori, oppure rilassato con controllo manuale |
| Tecnologia | HTML, CSS e JavaScript in un solo file, nessuna risorsa da Internet |

## Struttura del repository

| Percorso | Contenuto |
|---|---|
| `src/motore.js` | Motore: geometria, conteggio delle soluzioni, generazione, deduzioni logiche |
| `src/panda.js` | I dieci panda in SVG; il panda posato è quello del suo boschetto |
| `src/app.js` | Interfaccia, partite, salvataggio, accessibilità |
| `src/stile.css`, `src/pagina.html` | Stile e scheletro della pagina |
| `dati/livelli.json` | Catalogo dei livelli: seed, boschetti, soluzione, difficoltà |
| `strumenti/genera-livelli.js` | Rigenera il catalogo (circa un minuto) |
| `strumenti/costruisci.js` | Produce `dist/index.html`, il file da pubblicare |
| `test/verifica-livelli.js` | Verifica del catalogo e dei suggerimenti |
| `test/browser.js` | Collaudo nel browser (Playwright) |

```sh
node strumenti/genera-livelli.js
node strumenti/costruisci.js
node test/verifica-livelli.js
node test/browser.js                                   # in locale
node test/browser.js https://costalonga.org/pandino/   # pagina pubblicata
```

## Come funziona

### Modello e conteggio delle soluzioni
Una variabile per riga: la colonna del suo panda. I vincoli sono: colonne tutte
diverse, boschetti tutti diversi, colonne di righe vicine distanti almeno 2.
`contaSoluzioni` usa il backtracking con maschere di bit. A ogni passo calcola
le colonne ancora ammesse per ogni riga (Forward Checking) e controlla che ogni
riga, colonna e boschetto abbia ancora un posto. Poi si ramifica sul vincolo con
meno possibilità, riga o boschetto (MRV). Si ferma a due soluzioni, che bastano
per sapere se la soluzione è unica. Tempo medio di generazione di un livello:
circa 13 ms per il 10×10, 46 ms per l'11×11, 140 ms per il 12×12.

### Generazione dei livelli
`generaLivello(n, seed)`:
1. dispone n panda a caso, uno per riga e colonna, senza contatti;
2. fa crescere un boschetto attorno a ogni panda, a caso e con pesi diversi,
   finché la griglia è piena;
3. cerca una soluzione diversa da quella voluta; se c'è, sposta in un
   boschetto vicino una casella usata da quella soluzione, senza spezzare il
   boschetto, e riprova.

Il generatore pseudocasuale ha un seed: lo stesso seed dà sempre lo stesso
livello. Il catalogo tiene solo i livelli che le deduzioni logiche risolvono
fino in fondo, quindi il suggerimento trova sempre una mossa.

### Deduzioni (suggerimenti e difficoltà)
Le caselle escluse dai panda già posati (stessa riga, colonna, boschetto o
contatto) si ricavano in automatico. Poi, in ordine:

| Rango | Deduzione | Fascia |
|---|---|---|
| 1 | **Unico posto**: in una riga, colonna o boschetto resta una sola casella | Facile |
| 2 | **Boschetto chiuso in una linea**: le caselle libere di un boschetto stanno in una sola riga o colonna (o il contrario) | Medio |
| 3 | **Casella che toglie tutto**: un panda lì lascerebbe una riga, colonna o boschetto senza posto | Difficile |
| 4 | **Gruppi**: k boschetti chiusi in k righe o colonne (o il contrario), con k da 2 a 4 | Esperto |

Ogni suggerimento si spiega a parole. Prima di dedurre, il gioco segnala un
panda fuori posto o un segno ✕ messo su una casella giusta. Se nessuna
deduzione funziona lo dice, e offre di mostrare un panda contandolo come aiuto.

### Partita
- Per ogni casella si tiene lo stato (vuota, segno, panda) e quanti panda la
  escludono. A ogni mossa si aggiornano solo le caselle interessate.
- Il confronto con la soluzione è immediato.
- **Con i cuori**: un panda nel posto sbagliato costa un cuore e la casella si
  segna con ✕. Finiti i tre cuori, si riprova il livello.
- **Rilassato**: nessuna penalità; i conflitti con le regole si vedono subito
  (righe diagonali e «!»), i panda fuori posto si vedono con «Controlla»
  (bordo rosso e «?»).
- **Comandi**: un tocco mette o toglie la ✕ (e su un panda lo toglie); un
  **doppio tocco veloce** (entro 350 ms, o un doppio clic) mette il panda, senza
  lasciare la ✕ intermedia nella cronologia. In alternativa ci sono gli
  strumenti «Solo panda» e «Solo segni». Trascinando si segnano più caselle. Il
  clic destro mette o toglie il panda.
- **Tastiera**: frecce, Spazio (✕), Invio (panda), P, X, Canc, S, Ctrl+Z e Ctrl+Y, Esc.
- **Livelli**: tre capitoli, paginazione da 50, ricerca per numero, filtri per
  stato e per difficoltà. I primi tre livelli di ogni capitolo sono aperti;
  ogni livello completato apre il successivo.
- **Partita libera**: generata al momento in un Web Worker; dopo 6 secondi
  passa a un livello di riserva verificato.

### Salvataggio dei progressi
In `localStorage`, con prefisso `pandino.v3.`: impostazioni, livelli completati
con tempo e punteggio migliori, livello corrente, partite in corso (al massimo
40) con segni, panda, cuori e cronologia per annulla e ripristina. Il
salvataggio avviene a ogni mossa, ogni 5 secondi e quando la pagina si chiude.

## Accessibilità
- I boschetti si distinguono per colore, motivo a righe (nessun motivo a pois
  o a quadretti, per non confondersi con i segni del gioco), bordo spesso e
  lettera su etichetta chiara di almeno 12 px: mai per il solo colore. Tema
  chiaro e scuro.
- Le caselle escluse dai panda mostrano un trattino con contrasto di almeno 3
  a 1; accanto alla griglia un ✓ segna righe e colonne che hanno già il panda
  («!» se ne hanno due).
- Le regole sono illustrate da quattro schemi in SVG. Il gesto (tocco = ✕,
  doppio tocco = panda) ha una sequenza animata comandata con Indietro,
  Avanti e Riproduci, mai in ciclo continuo.
- Griglia con ruoli `grid`, `row` e `gridcell`, tabindex mobile e nome
  accessibile per ogni casella (riga, colonna, boschetto, contenuto, conflitti).
- Annunci a voce per mosse, errori, suggerimenti e vittoria.
- `prefers-reduced-motion` rispettato; animazioni e suoni disattivabili; nessun
  suono prima della prima interazione.

## Indicizzazione
- `<meta name="robots" content="noindex, nofollow">`, più `googlebot` e `bingbot`.
- **Header `X-Robots-Tag`: non impostabile**, perché GitHub Pages non permette
  header HTTP personalizzati. Per averlo servirebbe un proxy davanti al
  dominio, per esempio Cloudflare.
- `/pandino/` non è nella `sitemap.xml` e non ha collegamenti da altre pagine del sito.
- `robots.txt` non blocca `/pandino/`, ed è voluto: se lo bloccasse, i motori
  non leggerebbero il `noindex`.

## Pubblicazione
`dist/index.html` va copiato in `pandino/index.html` del repository
`GuidoCostalonga/GuidoCostalonga.github.io`, quello che serve costalonga.org.
