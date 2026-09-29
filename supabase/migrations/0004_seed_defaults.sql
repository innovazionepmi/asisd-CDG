-- ============================================================
-- Dati di riferimento condivisi (studio_id null = default ASISD).
-- Ogni studio puo aggiungere le proprie righe extra (es. una nuova
-- campagna marketing, o una voce di costo particolare) senza toccare
-- questi default.
-- ============================================================

insert into treatment_categories (studio_id, name, sort_order) values
  (null, 'Chirurgia', 1),
  (null, 'Implantologia', 2),
  (null, 'Protesi', 3),
  (null, 'Conservativa', 4),
  (null, 'Endodonzia', 5),
  (null, 'Ortodonzia', 6),
  (null, 'Parodontologia', 7),
  (null, 'Igiene', 8),
  (null, 'Altro', 9);

insert into pl_accounts (studio_id, name, account_type, sort_order) values
  (null, 'Ricavi (Compensi professionali)', 'revenue', 1),
  (null, 'Costi per Materiali di consumo dentale', 'variable_cost', 10),
  (null, 'Costo per Energia e acqua', 'variable_cost', 11),
  (null, 'Costi per Compensi ai Collaboratori', 'variable_cost', 12),
  (null, 'Costi per Compenso al Titolare come Operatore', 'variable_cost', 13),
  (null, 'Costi per Laboratorio', 'variable_cost', 14),
  (null, 'Costi per Finanziamenti ai Clienti', 'variable_cost', 15),
  (null, 'Costi Complessivi per Personale', 'fixed_cost', 20),
  (null, 'Costi per Immobili', 'fixed_cost', 21),
  (null, 'Costi per Attrezzature', 'fixed_cost', 22),
  (null, 'Costi Gestionali e Amministrative', 'fixed_cost', 23),
  (null, 'Costi per Marketing', 'fixed_cost', 24);

insert into acquisition_channels (studio_id, name, type, sort_order) values
  (null, 'Visite Spontanee', 'organic_spontaneous', 1),
  (null, 'Visite da Convenzioni', 'convenzione', 2),
  (null, 'Visite da Ricerche Web', 'ricerca_web', 3),
  (null, 'Pazienti Riattivati', 'reactivation', 4);
-- Le campagne marketing (marketing_campaign) sono per natura dinamiche per
-- studio: si aggiungono con studio_id valorizzato quando una campagna parte,
-- non fanno parte dei default condivisi.

insert into metric_catalog (metric_key, label, unit, stage, grain) values
  ('traffic.new_patients.total', 'Nuovi pazienti (prime visite)', 'count', 'traffico', 'month'),
  ('traffic.reactivated.total', 'Pazienti riattivati', 'count', 'traffico', 'month'),
  ('quotes.close_rate', 'Percentuale di chiusura preventivi', 'percent', 'preventivi', 'month'),
  ('production.total', 'Valore produzione eseguita', 'currency', 'produzione', 'month'),
  ('production.hygiene_sessions', 'Numero sedute di igiene', 'count', 'produzione', 'month'),
  ('economics.revenue', 'Ricavi', 'currency', 'economics', 'quarter'),
  ('economics.mol', 'MOL', 'currency', 'economics', 'quarter'),
  ('cashflow.advance_payments', 'Incassi anticipati', 'currency', 'cashflow', 'month');
-- Catalogo di partenza, non esaustivo: aggiungere una riga qui basta a
-- rendere un nuovo KPI targettabile in kpi_targets/kpi_prior_year_baseline,
-- senza migrazioni. grain='quarter' solo per economics (vedi pl_quarterly);
-- tutto il resto resta mensile.
