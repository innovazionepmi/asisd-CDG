-- ============================================================
-- Budget MENSILI (nodo "Inserimento dati"): preventivi, crediti scaduti, ricavi + policy di delete.
-- Come per le visite,
-- nel foglio Excel l'obiettivo e' definito per mese e il totale annuo e' la
-- somma dei mesi. Servono le chiavi nel catalogo dei KPI targettabili
-- (kpi_targets.metric_key ha una foreign key su metric_catalog).
--   emessi / confermati (generali): numero e valore in €
--   di cui prima visita: valore in € (i numeri della prima visita si derivano
--   dal budget dei nuovi pazienti e dalla % di chiusura)
-- Idempotente.
-- ============================================================

insert into metric_catalog (metric_key, label, unit, stage, grain) values
  ('quotes.issued_count', 'Preventivi emessi (numero)', 'count', 'preventivi', 'month'),
  ('quotes.confirmed_count', 'Preventivi confermati (numero)', 'count', 'preventivi', 'month'),
  ('quotes.issued_value', 'Preventivi emessi (€)', 'currency', 'preventivi', 'month'),
  ('quotes.confirmed_value', 'Preventivi confermati (€)', 'currency', 'preventivi', 'month'),
  ('quotes.issued_value_pv', 'Preventivi emessi prima visita (€)', 'currency', 'preventivi', 'month'),
  ('quotes.confirmed_value_pv', 'Preventivi confermati prima visita (€)', 'currency', 'preventivi', 'month')
on conflict (metric_key) do nothing;

-- ------------------------------------------------------------
-- Budget MENSILI del foglio "CashFlow" dell'Excel:
--   crediti scaduti: obiettivo del livello a fine mese (annuo = media)
--   ricavi del periodo: obiettivo mensile (annuo = somma dei mesi); la chiave
--   trimestrale economics.revenue resta valida come alternativa.
-- ------------------------------------------------------------
insert into metric_catalog (metric_key, label, unit, stage, grain) values
  ('cashflow.credits_overdue', 'Crediti scaduti (obiettivo)', 'currency', 'cashflow', 'month'),
  ('economics.revenue_monthly', 'Ricavi del periodo (obiettivo mensile)', 'currency', 'economics', 'month')
on conflict (metric_key) do nothing;

-- Gli obiettivi mensili si inseriscono dal nodo "Inserimento dati" (solo titolare): una
-- casella svuotata elimina l'obiettivo del mese, quindi serve la policy di delete.
drop policy if exists "owner_can_delete_kpi_targets" on kpi_targets;
create policy "owner_can_delete_kpi_targets" on kpi_targets
  for delete using (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role = 'owner'
  ));
