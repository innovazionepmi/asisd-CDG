# ASISD · Controllo di Gestione

Applicazione web che sostituisce il cruscotto Excel "Controllo di Gestione"
del metodo PMOS di ASISD: stesso funnel (traffico → preventivi → produzione
→ economics → cashflow), ma con inserimento dati guidato e visualizzazioni
grafiche al posto delle griglie Excel.

Stack: React + TypeScript + Vite, Tailwind CSS, Recharts, Supabase (Postgres
+ RLS). Vedi [CLAUDE.md](../CLAUDE.md) per la governance del repo
(branching, workflow, variabili d'ambiente).

## Avvio locale

```bash
npm install
npm run dev
```

Senza `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` impostate, l'app usa
automaticamente un **provider di dati demo** con seed realistico persistito
su `localStorage` — utile per sviluppo/demo senza un progetto Supabase.
Con quelle variabili impostate (vedi `.env.example`), l'app legge/scrive
sul database reale via `@supabase/supabase-js`.

## Struttura

- `src/lib/dataProvider.ts` — interfaccia unica su cui parlano tutte le
  pagine; due implementazioni intercambiabili:
  - `localFixtureProvider.ts` (demo, localStorage)
  - `supabaseProvider.ts` (produzione, Supabase)
- `src/lib/fixtureData.ts` — dati demo presi 1:1 dai numeri reali del file
  Excel originale, per una demo credibile.
- `src/pages/*` — una pagina per area del funnel (Traffico, Preventivi,
  Produzione, Economics, Cashflow) + Dashboard riassuntiva. Ogni pagina ha:
  KPI card con scostamento, grafici (donut + trend), form di inserimento
  dati per il periodo selezionato, tabella completa dell'anno.
- `supabase/migrations/*.sql` — schema del database (vedi
  [docs/data-model.md](docs/data-model.md) per la logica di design).

## Note v1

- Nessuno studio-switcher/login: l'app assume un solo studio (demo) o lo
  studio indicato in `VITE_DEFAULT_STUDIO_ID`. Da estendere quando si
  aggiunge l'autenticazione multi-studio.
- Grana dati: mensile per traffico/preventivi/produzione/cashflow,
  trimestrale per il conto economico — coerente con quanto operativamente
  rilevabile (vedi `docs/data-model.md`).
