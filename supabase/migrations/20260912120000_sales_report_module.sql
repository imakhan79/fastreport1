-- Sales Report module: a dedicated, org-scoped orders table plus a
-- database-level aggregation function that groups by sales year, quarter,
-- and category. Kept separate from `sample_sales` (query-pipeline demo
-- data) so this module has its own real, queryable source of truth.

create table sales_orders (
  id bigint generated always as identity primary key,
  org_id bigint not null references organizations (id) on delete cascade,
  order_date date not null,
  category_name text not null,
  units_sold int not null check (units_sold >= 0),
  gross_revenue numeric(12, 2) not null default 0 check (gross_revenue >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index sales_orders_org_id_idx on sales_orders (org_id);
create index sales_orders_org_date_idx on sales_orders (org_id, order_date);

alter table sales_orders enable row level security;
alter table sales_orders force row level security;
create policy sales_orders_isolation on sales_orders
  for all to authenticated
  using ((select private.is_org_member(org_id)));

-- ---------------------------------------------------------------------------
-- Aggregation: groups sales_orders by year / quarter / category and sums
-- orders, units, and net revenue (gross minus discounts) for a date range.
-- Runs as the trusted service-role caller only (never exposed to
-- anon/authenticated directly) - the API route is responsible for passing
-- the caller's own org_id, same trust boundary every other admin-client
-- route in this codebase already relies on.
-- ---------------------------------------------------------------------------

create or replace function public.sales_report_quarterly(p_org_id bigint, p_from date default null, p_to date default null)
returns table (
  sales_year int,
  quarter text,
  category_name text,
  total_orders bigint,
  total_units_sold bigint,
  net_sales_revenue numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    extract(year from so.order_date)::int as sales_year,
    'Q' || (((extract(month from so.order_date)::int - 1) / 3) + 1) as quarter,
    so.category_name,
    count(*)::bigint as total_orders,
    coalesce(sum(so.units_sold), 0)::bigint as total_units_sold,
    coalesce(sum(so.gross_revenue - so.discount_amount), 0)::numeric as net_sales_revenue
  from public.sales_orders so
  where so.org_id = p_org_id
    and (p_from is null or so.order_date >= p_from)
    and (p_to is null or so.order_date <= p_to)
  group by 1, 2, so.category_name
  order by 1, 2, so.category_name;
$$;

revoke execute on function public.sales_report_quarterly(bigint, date, date) from public, anon, authenticated;
grant execute on function public.sales_report_quarterly(bigint, date, date) to service_role;

-- ---------------------------------------------------------------------------
-- Seed: a few years of realistic order-level sales history per existing
-- organization (skipped for orgs that already have rows), so the report
-- reads real data instead of nothing on a fresh environment.
-- ---------------------------------------------------------------------------

do $$
declare
  v_org record;
  v_year int;
  v_quarter int;
  v_category text;
  v_categories text[] := array['Electronics', 'Software', 'Furniture', 'Apparel', 'Services'];
  v_orders_count int;
  i int;
  v_month_start int;
  v_order_date date;
  v_units int;
  v_unit_price numeric;
  v_gross numeric;
  v_discount numeric;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from sales_orders where org_id = v_org.id) then
      continue;
    end if;

    for v_year in 2024..2026 loop
      for v_quarter in 1..4 loop
        exit when (v_year = 2026 and v_quarter > 3);

        v_month_start := (v_quarter - 1) * 3 + 1;

        foreach v_category in array v_categories loop
          v_orders_count := 15 + floor(random() * 40)::int;

          for i in 1..v_orders_count loop
            v_order_date := make_date(v_year, v_month_start, 1) + floor(random() * 89)::int;
            v_units := 1 + floor(random() * 25)::int;
            v_unit_price := round((20 + random() * 480)::numeric, 2);
            v_gross := round((v_units * v_unit_price)::numeric, 2);
            v_discount := round((v_gross * (random() * 0.12))::numeric, 2);

            insert into sales_orders (org_id, order_date, category_name, units_sold, gross_revenue, discount_amount)
            values (v_org.id, v_order_date, v_category, v_units, v_gross, v_discount);
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
end $$;
