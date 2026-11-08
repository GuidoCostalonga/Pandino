# Pandino

Il Sudoku dei panda, in un'unica pagina HTML senza dipendenze esterne.
Pubblicato su **https://costalonga.org/pandino/**: raggiungibile da chi conosce
l'indirizzo, escluso dai motori di ricerca (vedi «Indicizzazione»).

| | |
|---|---|
| Livelli | **1.300** verificati: 1.000 su 9×9, 200 su 6×6, 100 su 4×4, più 80 di riserva |
| Modalità | Sudoku classico · Panda Pop, variante arcade a tessere |
| Griglie | 4×4 (blocchi 2×2), 6×6 (blocchi 2×3), 9×9 (blocchi 3×3) |
| Tecnologia | HTML, CSS e JavaScript in un solo file, nessuna risorsa da Internet |

## Struttura del repository

| Percorso | Contenuto |
|---|---|
| `src/motore.js` | Motore CSP: geometria, DLX, MRV con Forward Checking, generazione, euristiche, poliomini |
| `src/panda.js` | I nove panda in SVG |
| `src/app.js` | Interfaccia, partite, salvataggio, accessibilità, animazioni |
| `src/stile.css`, `src/pagina.html` | Stile e scheletro della pagina |
| `dati/livelli.json` | Catalogo dei livelli con seed, puzzle, soluzione, difficoltà |
| `strumenti/genera-livelli.js` | Rigenera il catalogo |
| `strumenti/costruisci.js` | Produce `dist/index.html`, il file da pubblicare |
| `test/verifica-livelli.js` | Verifica di catalogo, unicità, suggerimenti, Panda Pop |
| `test/browser.js` | Collaudo nel browser (Playwright) |

```sh
node strumenti/genera-livelli.js   # catalogo (circa 25 secondi)
node strumenti/costruisci.js       # dist/index.html
node test/verifica-livelli.js      # verifiche sul catalogo
node test/browser.js               # collaudo locale
node test/browser.js https://costalonga.org/pandino/   # collaudo della pagina pubblicata
```

## Come funziona

### Modello dei vincoli
La griglia è un vettore di n·n variabili con dominio {1…n}. Ogni casella
conosce in anticipo la sua riga, colonna, blocco e le caselle vicine
(`geometria(n)`). I 3n vincoli AllDifferent sono tenuti da contatori per
unità e valore, aggiornati soltanto per le tre unità della casella toccata.
Il controllo di un conflitto e il confronto con `solution[]` costano un tempo
costante: dopo una mossa non si risolve né si rigenera nulla.

### Generazione delle soluzioni
`matriceCompleta` riempie una griglia vuota con backtracking, euristica MRV
(si sceglie la casella con meno valori possibili) e Forward Checking (dopo ogni
assegnazione nessuna vicina deve restare senza valori). L'ordine dei valori
viene mescolato da un generatore pseudocasuale con seed (mulberry32): stesso
seed, stessa matrice.

### Conteggio delle soluzioni
`contaSoluzioniDLX` usa l'Algorithm X di Knuth con Dancing Links: 4·n² colonne
(casella occupata, valore in riga, in colonna, in blocco) e n³ righe. Si ferma a
due soluzioni, che bastano per sapere se la soluzione è unica.
`contaSoluzioniMRV` fa lo stesso conto con l'altro metodo: le verifiche
controllano che i due risolutori concordino su ogni livello.

### Generazione e gestione dei livelli
`generaPuzzle(n, seed, { minimoIndizi })` parte dalla matrice completa e la
scava a coppie di caselle simmetriche; ogni scavo resta solo se DLX trova una
sola soluzione. La difficoltà è il **rango della tecnica logica minima**
necessaria per risolvere senza tentativi, non il numero di caselle vuote:

| Griglia | Fasce |
|---|---|
| 9×9 | Facile 1–250 (solo singoli, almeno 32 indizi) · Medio 251–500 (candidati bloccati) · Difficile 501–750 (coppie, terne, X-Wing, Swordfish) · Esperto 751–1000 (oltre le tecniche implementate) |
| 6×6 | Facile 1–80 · Medio 81–160 · Difficile 161–200 |
| 4×4 | Facile 1–100 |

Ogni livello registra ID, seed, puzzle, soluzione, difficoltà e tecnica
principale. All'apertura la pagina rifà il conteggio con DLX; se fallisse,
userebbe un livello di riserva della stessa fascia. La «partita libera» genera
un puzzle al momento in un Web Worker, con indicatore di caricamento; dopo 6
secondi passa a un livello di riserva verificato.

### Candidati e suggerimenti
I candidati virtuali di una casella sono i valori assenti dalle sue tre unità,
meno quelli esclusi dai suggerimenti già applicati. Il suggerimento cerca, in
quest'ordine: un panda fuori posto, Naked Single, Hidden Single, Pointing,
Claiming, Naked Pair, Hidden Pair, Naked Triple, X-Wing, Swordfish. Spiega la
deduzione in parole semplici. Se nessuna tecnica trova una mossa lo dichiara, e
offre di rivelare una casella contandola come aiuto. Le verifiche percorrono
l'intera catena di suggerimenti di ogni livello: nessun panda suggerito è
sbagliato e nessuna eliminazione toglie il valore giusto.

### Panda Pop, variante a tessere
Il vassoio contiene tre poliomini da 1 a 5 caselle (fino a 3 su 4×4 e fino a 4
su 6×6). Le tessere si ricavano da una matrice completa compatibile con la
griglia attuale: tutte e tre si possono quindi posare. Una posa è valida se le
caselle sono libere, se non viola nessun AllDifferent e se la griglia resta
completabile. Alla saturazione di una riga, colonna o blocco le sue variabili
tornano a zero: 90 punti per gruppo, moltiplicati per i gruppi chiusi insieme e
per la combo. Si vince liberando tutti i panda di partenza. Se nessuna tessera
entra, il vassoio si rinnova (−30 punti): la partita non si blocca mai. Le
verifiche simulano partite intere su 4×4, 6×6 e 9×9, fino alla vittoria.

### Salvataggio dei progressi
Tutto resta in `localStorage`, con prefisso `pandino.v2.`: impostazioni,
livelli completati con record, ultimo livello per modalità e griglia, partite in
corso (al massimo 40) con la cronologia di annulla e ripristina. Il salvataggio
avviene a ogni mossa, ogni 5 secondi di gioco e quando la pagina si chiude.
Sblocco: i primi tre livelli di ogni capitolo sono aperti, ogni livello
completato apre il successivo.

## Accessibilità
- Griglia con ruoli `grid`, `row` e `gridcell`, tabindex mobile e nome
  accessibile per ogni casella (riga, colonna, blocco, panda, stato).
- Annunci in una regione `aria-live` per mosse, errori, suggerimenti e vittorie.
- Errori mai affidati al solo colore: conflitto con righe diagonali e «!»,
  panda sbagliato con bordo tratteggiato e «✕».
- Indice di decodifica a scelta: numero, puntini oppure nessuno (sfida visiva,
  che alza di proposito il carico percettivo; lo screen reader legge comunque
  il numero).
- `prefers-reduced-motion` rispettato; animazioni e suoni disattivabili;
  nessun suono prima della prima interazione.

## Indicizzazione
La pagina deve essere raggiungibile con l'indirizzo, ma non comparire nei
motori di ricerca.
- `<meta name="robots" content="noindex, nofollow">` (più `googlebot` e `bingbot`).
- **Header `X-Robots-Tag`: non impostabile.** Il sito è servito da GitHub Pages,
  che non permette header HTTP personalizzati. Per averlo servirebbe un proxy
  davanti al dominio, per esempio Cloudflare con una regola di trasformazione
  sulle risposte di `/pandino*`.
- `/pandino/` non è nella `sitemap.xml` del sito e non ha collegamenti da altre pagine.
- `robots.txt` **non** blocca `/pandino/`, ed è voluto: se il percorso fosse
  bloccato, i motori non leggerebbero il `noindex` e potrebbero indicizzare
  l'indirizzo senza contenuto.

Il codice sorgente di questo repository è pubblico su GitHub: GitHub lo può
mostrare nelle sue ricerche, ma la pagina di gioco su costalonga.org resta esclusa.

## Pubblicazione
`dist/index.html` va copiato in `pandino/index.html` del repository
`GuidoCostalonga/GuidoCostalonga.github.io`, quello che serve costalonga.org. Il
repository `Pandino` non viene pubblicato con GitHub Pages: finirebbe su
`/Pandino`, con la maiuscola, e i percorsi distinguono maiuscole e minuscole.
