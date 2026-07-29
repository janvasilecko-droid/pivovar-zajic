/*
# Cenik piv + Sklep (tanky 1-8) + propojeni staceni kegu s tankem

1. Nove tabulky
- `price_list` — cenik piv: pivo, obal, cena za kus, mena, platnost od/do, poznamka.
- `cellar_tanks` — sklep s tanky 1-8: label (Tank 1..8), kapacita v litrech, aktualni pivo, aktualni objem, stav (aktivni/prazdny), poznamka.
- `cellar_transfers` — preteceni z tanku do tanku / do staceni: datum, ze ktereho tanku, do ktereho tanku (volitelne), pivo, objem litry, ztrata litry, poznamka.

2. Upravy existujicich tabulek
- `kegging` — pridat `cellar_tank_id` (odkaz na cellar_tanks) a `source_volume_l` (objem z tanku pro dany zaznam staceni) a `loss_l` (ztrata).
- `kegging_tanks` — pridat `cellar_tank_id` (volitelny odkaz na sklep tank, ze ktereho se stacelo).

3. Bezpecnost
- RLS povoleno na vsech novych tabulkach.
- 4 politiky (SELECT/INSERT/UPDATE/DELETE) pro authenticated uzivatele (aplikace ma prihlaseni).
*/

-- ===== Cenik piv =====
create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  beer_id uuid references public.beers(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  price_per_unit numeric(10,2) not null,
  currency text not null default 'CZK',
  valid_from date,
  valid_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.price_list enable row level security;

drop policy if exists "select_own_price_list" on public.price_list;
create policy "select_own_price_list" on public.price_list
  for select to authenticated using (true);
drop policy if exists "insert_own_price_list" on public.price_list;
create policy "insert_own_price_list" on public.price_list
  for insert to authenticated with check (true);
drop policy if exists "update_own_price_list" on public.price_list;
create policy "update_own_price_list" on public.price_list
  for update to authenticated using (true) with check (true);
drop policy if exists "delete_own_price_list" on public.price_list;
create policy "delete_own_price_list" on public.price_list
  for delete to authenticated using (true);

-- ===== Sklep — tanky 1-8 =====
create table if not exists public.cellar_tanks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  capacity_l numeric(10,2) not null default 2000,
  current_beer_id uuid references public.beers(id) on delete set null,
  current_beer_name text,
  current_volume_l numeric(10,2) not null default 0,
  status text not null default 'empty' check (status in ('empty','filling','active','emptying','cleaning')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cellar_tanks enable row level security;

drop policy if exists "select_own_cellar_tanks" on public.cellar_tanks;
create policy "select_own_cellar_tanks" on public.cellar_tanks
  for select to authenticated using (true);
drop policy if exists "insert_own_cellar_tanks" on public.cellar_tanks;
create policy "insert_own_cellar_tanks" on public.cellar_tanks
  for insert to authenticated with check (true);
drop policy if exists "update_own_cellar_tanks" on public.cellar_tanks;
create policy "update_own_cellar_tanks" on public.cellar_tanks
  for update to authenticated using (true) with check (true);
drop policy if exists "delete_own_cellar_tanks" on public.cellar_tanks;
create policy "delete_own_cellar_tanks" on public.cellar_tanks
  for delete to authenticated using (true);

-- ===== Preteceni / transfery mezi tanky =====
create table if not exists public.cellar_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null default current_date,
  from_tank_id uuid references public.cellar_tanks(id) on delete set null,
  to_tank_id uuid references public.cellar_tanks(id) on delete set null,
  beer_id uuid references public.beers(id) on delete set null,
  beer_name text,
  volume_l numeric(10,2) not null,
  loss_l numeric(10,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.cellar_transfers enable row level security;

drop policy if exists "select_own_cellar_transfers" on public.cellar_transfers;
create policy "select_own_cellar_transfers" on public.cellar_transfers
  for select to authenticated using (true);
drop policy if exists "insert_own_cellar_transfers" on public.cellar_transfers;
create policy "insert_own_cellar_transfers" on public.cellar_transfers
  for insert to authenticated with check (true);
drop policy if exists "update_own_cellar_transfers" on public.cellar_transfers;
create policy "update_own_cellar_transfers" on public.cellar_transfers
  for update to authenticated using (true) with check (true);
drop policy if exists "delete_own_cellar_transfers" on public.cellar_transfers;
create policy "delete_own_cellar_transfers" on public.cellar_transfers
  for delete to authenticated using (true);

-- ===== Propojeni kegging se sklepem =====
alter table public.kegging
  add column if not exists cellar_tank_id uuid references public.cellar_tanks(id) on delete set null,
  add column if not exists source_volume_l numeric(10,2),
  add column if not exists loss_l numeric(10,2) default 0;

alter table public.kegging_tanks
  add column if not exists cellar_tank_id uuid references public.cellar_tanks(id) on delete set null;

-- ===== Realtime pro nove tabulky =====
alter publication supabase_realtime add table public.price_list;
alter publication supabase_realtime add table public.cellar_tanks;
alter publication supabase_realtime add table public.cellar_transfers;