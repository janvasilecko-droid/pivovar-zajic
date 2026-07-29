-- Enable pg_cron for scheduled jobs (Supabase supports it in the extensions catalog)
create extension if not exists pg_cron with schema extensions;

-- Grant usage to postgres (the role that runs migrations)
grant usage on schema extensions to postgres;

-- Monthly tank auto-close: on day 1 of each month at 00:05, close all open kegging tanks
-- and reset the active tank so the next month starts fresh.
create or replace function public.close_all_open_tanks()
returns void
language plpgsql
security definer
as $$
begin
  update public.kegging_tanks
    set closed_at = coalesce(closed_at, now())
    where closed_at is null;
end;
$$;

-- Schedule it: 5 minutes past midnight on the 1st of every month
select cron.schedule(
  'monthly-tank-close',
  '5 0 1 * *',
  $$select public.close_all_open_tanks();$$
);

comment on function public.close_all_open_tanks() is 'Automaticky uzavre vsechny otevrene kegging tanky (mesicni reset).';