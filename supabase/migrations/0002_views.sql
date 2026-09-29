-- ============================================================
-- Viste di rollup — sostituiscono i blocchi triplicati (cumulato /
-- trimestrale / proiezione fine anno) e il confronto vs AFP dell'Excel.
-- Set illustrativo: non copre ancora ogni KPI del cruscotto originale,
-- va esteso una volta validato lo schema base.
-- ============================================================

-- Conto economico: MDC/MOL calcolati al volo, mai salvati. Grana trimestrale
-- (non mensile): coerente con pl_quarterly, dati contabili disponibili solo a trimestre.
create view v_pl_summary_quarterly as
select
  m.studio_id,
  m.period_quarter,
  sum(m.amount) filter (where a.account_type = 'revenue') as revenue,
  sum(m.amount) filter (where a.account_type = 'variable_cost') as variable_costs,
  sum(m.amount) filter (where a.account_type = 'fixed_cost') as fixed_costs,
  sum(m.amount) filter (where a.account_type = 'revenue')
    - sum(m.amount) filter (where a.account_type = 'variable_cost') as mdc,
  sum(m.amount) filter (where a.account_type = 'revenue')
    - sum(m.amount) filter (where a.account_type = 'variable_cost')
    - sum(m.amount) filter (where a.account_type = 'fixed_cost') as mol
from pl_quarterly m
join pl_accounts a on a.id = m.account_id
group by m.studio_id, m.period_quarter;
comment on view v_pl_summary_quarterly is 'Ricavi/MDC/MOL per trimestre. Per YTD/anno: aggregare ulteriormente con date_trunc(''year'', period_quarter) lato query.';

-- Traffico: nuovi pazienti vs riattivati, per mese.
create view v_new_patients_monthly as
select
  v.studio_id,
  v.period_month,
  sum(v.visit_count) filter (where c.type <> 'reactivation') as new_patients_total,
  sum(v.visit_count) filter (where c.type = 'reactivation') as reactivated_patients
from monthly_visits v
join acquisition_channels c on c.id = v.channel_id
group by v.studio_id, v.period_month;

-- Preventivi: vista "generali" (somma dei segmenti) con % chiusura.
create view v_quotes_monthly_general as
select
  studio_id,
  period_month,
  sum(issued_count) as issued_count,
  sum(issued_value) as issued_value,
  sum(confirmed_count) as confirmed_count,
  sum(confirmed_value) as confirmed_value,
  sum(lost_count) as lost_count,
  sum(lost_value) as lost_value,
  case when sum(issued_count) > 0
    then sum(confirmed_count)::numeric / sum(issued_count)
    else null end as close_rate
from quotes_monthly
group by studio_id, period_month;

-- Portafoglio preventivi in corso: saldo cumulato (opening + emessi - confermati - persi).
create view v_quotes_portfolio_running as
select
  q.studio_id,
  q.patient_segment,
  q.period_month,
  o.opening_count
    + sum(q.issued_count) over w
    - sum(q.confirmed_count) over w
    - sum(q.lost_count) over w as portfolio_count,
  o.opening_value
    + sum(q.issued_value) over w
    - sum(q.confirmed_value) over w
    - sum(q.lost_value) over w as portfolio_value
from quotes_monthly q
join quotes_portfolio_opening o
  on o.studio_id = q.studio_id
  and o.patient_segment = q.patient_segment
  and o.fiscal_year = extract(year from q.period_month)::int
window w as (partition by q.studio_id, q.patient_segment order by q.period_month);
comment on view v_quotes_portfolio_running is 'Sostituisce le formule di saldo progressivo (es. riga 28-29 Aggregato Trimestrale) con una window function.';

-- Confronto anno su anno per l'economics (trimestrale). Prova prima il dato
-- reale del trimestre dell'anno precedente nella stessa tabella; se assente
-- (studio nuovo, storico non ancora inserito), ripiega sul valore "AFP"
-- inserito a mano in kpi_prior_year_baseline (annuale, diviso per 4) —
-- esattamente come fa l'Excel con "Media Trim. AFP" = Totale AFP / 4.
-- Lo stesso pattern (COALESCE reale -> baseline manuale) va replicato per
-- le altre viste (traffico/preventivi/produzione/cashflow) quando si
-- costruiscono i rispettivi confronti anno su anno.
create view v_pl_year_over_year as
select
  curr.studio_id,
  curr.period_quarter,
  curr.revenue as revenue_current,
  coalesce(prior.revenue, baseline_rev.annual_value / 4.0) as revenue_prior_year,
  (prior.revenue is null and baseline_rev.annual_value is not null) as revenue_prior_is_estimated,
  curr.mol as mol_current,
  coalesce(prior.mol, baseline_mol.annual_value / 4.0) as mol_prior_year,
  (prior.mol is null and baseline_mol.annual_value is not null) as mol_prior_is_estimated
from v_pl_summary_quarterly curr
left join v_pl_summary_quarterly prior
  on prior.studio_id = curr.studio_id
  and prior.period_quarter = (curr.period_quarter - interval '1 year')::date
left join kpi_prior_year_baseline baseline_rev
  on baseline_rev.studio_id = curr.studio_id
  and baseline_rev.metric_key = 'economics.revenue'
  and baseline_rev.fiscal_year = extract(year from curr.period_quarter)::int - 1
left join kpi_prior_year_baseline baseline_mol
  on baseline_mol.studio_id = curr.studio_id
  and baseline_mol.metric_key = 'economics.mol'
  and baseline_mol.fiscal_year = extract(year from curr.period_quarter)::int - 1;
comment on view v_pl_year_over_year is 'Confronto anno su anno trimestre per trimestre. Il flag *_prior_is_estimated dice all''UI se il dato e'' reale o stimato dal valore AFP inserito a mano, cosi'' si puo'' segnalarlo (es. badge "stimato").';
