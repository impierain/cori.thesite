# Cori · Gestionale

Portale per l'associazione: **prima nota di cassa**, **libro soci** (con lettura automatica del modulo di adesione PDF),
**quote associative**, **libro verbali**, **rendiconto annuale**, **progetti/centri di costo** e **area personale dei soci**.

Stack: React + TypeScript (Vite) · Supabase (database, login, archivio file) · Recharts · pdf.js.
È indipendente dal sito Hugo presente nella root del repository.

## Cosa fa

| Sezione | Contenuto |
|---|---|
| Dashboard | Saldo (cassa + banca), entrate/uscite dell'anno, da incassare / da pagare, grafici mensili e per categoria |
| Prima nota | Entrate e uscite con importo, da chi/a chi, categoria, progetto, **data di impegno** e **data effettiva**, conto (cassa/banca), metodo, n. documento, allegati (ricevute). Filtri ed esportazione CSV |
| Libro soci | Anagrafica, n. tessera, stato (attivo/sospeso/cessato), PDF del modulo di adesione. Stampa ed esportazione CSV |
| Quote | Chi ha pagato la quota dell'anno; registrando un pagamento si crea da solo il movimento in prima nota |
| Libro verbali | Assemblea/direttivo/altro: presenti, ordine del giorno, testo, PDF firmato allegato, ricerca. Si può rendere un verbale visibile ai soci |
| Rendiconto | Per categoria e per progetto, criterio di cassa o di competenza, stampa/PDF e CSV |
| Area socio | Il socio vede la propria scheda, le quote e i verbali resi visibili |

**Ruoli:** `direttivo` (accesso a tutto) e `socio` (solo i propri dati). Il socio viene collegato automaticamente alla sua scheda
quando crea/riceve l'account con la **stessa email** indicata nel modulo di adesione.

## Come metterlo online (circa 20 minuti)

1. **Supabase** – crea un progetto gratuito su <https://supabase.com>.
2. In *SQL Editor* incolla ed esegui tutto `supabase/schema.sql` (crea tabelle, permessi, archivio file e categorie iniziali).
3. In *Authentication → Providers → Email* **disattiva "Allow new users to sign up"** (gli account li crei tu).
4. In *Authentication → Users → Add user* crea il tuo utente (email + password, spunta "Auto confirm").
5. In *SQL Editor* rendilo direttivo:
   `update public.profiles set role = 'direttivo' where email = 'la-tua-email@esempio.it';`
6. In *Project Settings → API* copia **Project URL** e **anon public key**.
7. Copia `.env.example` in `.env` e incolla i due valori.
8. In locale: `npm install` poi `npm run dev` (apri l'indirizzo mostrato).
9. Online (Netlify): nuovo sito dallo stesso repository, **Base directory = `gestionale`**, e aggiungi le due variabili
   d'ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Per dare l'accesso a un altro membro del direttivo: crea il suo utente (passo 4) e ripeti il passo 5 con la sua email.
Per i soci: crea l'utente con la stessa email della scheda (non serve altro).

## Lettura automatica del modulo di adesione

`src/lib/pdfParse.ts` legge i **campi compilabili** del PDF oppure cerca nel testo le etichette
(Cognome, Nome, Nato a… il…, Codice fiscale, Residente, CAP, Comune, Prov., Email, Tel.). Dal codice fiscale ricava
anche la data di nascita. I campi non riconosciuti restano **evidenziati in giallo** da completare a mano.
Se il PDF è una scansione (immagine) il testo non è leggibile: i dati si inseriscono a mano e il file viene allegato comunque.
Per adattarlo al vostro modulo reale modificare `FORM_FIELD_MAP` e `LABELS` nello stesso file.

## Privacy

Il libro soci contiene dati personali (GDPR): l'accesso è protetto da login e dalle regole di sicurezza del database
(Row Level Security); i PDF sono in un archivio privato. Non pubblicare mai la *service role key* di Supabase;
nel front-end va usata solo la chiave *anon*.
