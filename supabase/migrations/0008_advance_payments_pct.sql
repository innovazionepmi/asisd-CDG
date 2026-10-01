-- ============================================================
-- "% Incassi Anticipati" (foglio CashFlow, riga 8): valore inserito a
-- mano ogni mese — come "% Saturazione", non calcolato automaticamente.
-- L'Excel originale lo calcolava come incassi anticipati / ricavi del
-- mese, ma quel "ricavi del mese" era un dato tracciato solo in quel
-- foglio e non esiste altrove nello schema (i ricavi "ufficiali" sono
-- trimestrali, vedi pl_quarterly) — scelta esplicita di Emilio: evitare
-- di introdurre un proxy e inserirlo a mano, stesso pattern già adottato
-- per la saturazione.
-- ============================================================

alter table cashflow_monthly
  add column advance_payments_pct numeric not null default 0;

insert into metric_catalog (metric_key, label, unit, stage, grain) values
  ('cashflow.advance_payments_pct', '% Incassi anticipati sul totale', 'percent', 'cashflow', 'month');
