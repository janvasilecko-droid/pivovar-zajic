create table if not exists public.fasovani (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  beer_id uuid references public.beers(id) on delete set null,
  beer_name text,
  package_id uuid references public.packages(id) on delete set null,
  package_label text,
  quantity numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.fasovani enable row level security;

create policy "select_own_fasovani" on public.fasovani for select
  to authenticated using (true);
create policy "insert_own_fasovani" on public.fasovani for insert
  to authenticated with check (true);
create policy "update_own_fasovani" on public.fasovani for update
  to authenticated using (true) with check (true);
create policy "delete_own_fasovani" on public.fasovani for delete
  to authenticated using (true);
