create table if not exists public.kegging_tanks (
  id uuid primary key default gen_random_uuid(),
  label text,
  beer_id uuid references public.beers(id) on delete set null,
  beer_name text,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.kegging_tanks enable row level security;

create policy "select_own_tanks" on public.kegging_tanks for select
  to authenticated using (true);
create policy "insert_own_tanks" on public.kegging_tanks for insert
  to authenticated with check (true);
create policy "update_own_tanks" on public.kegging_tanks for update
  to authenticated using (true) with check (true);
create policy "delete_own_tanks" on public.kegging_tanks for delete
  to authenticated using (true);

alter table public.kegging add column if not exists tank_id uuid references public.kegging_tanks(id) on delete set null;
