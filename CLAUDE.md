# Pivovar Zajíc — pokyny pro Claude

## Komunikace s majitelem
- Odpovídej česky, stručně.
- **Vždycky posílej přesné odkazy** na místo, kde má něco udělat (Supabase,
  GitHub, stránka v appce). Majitel nechce nic hledat — „pošli mi odkazy,
  nechci nic hledat, pamatuj si to" (9. 10. 2026).
- Nikdy nežádej, ať do chatu vloží klíč, token nebo heslo.
- Data v databázi nemazat a nehádat; správnost má přednost před rychlostí
  („radši ať je to pomalé, ale správné").

## Odkazy, které se hodí
- Supabase projekt: https://supabase.com/dashboard/project/sasqexjadvlqyticxwja
- Supabase klíče projektu (Secret key `sb_secret_…` = dřívější service_role):
  https://supabase.com/dashboard/project/sasqexjadvlqyticxwja/settings/api-keys
- Supabase osobní tokeny (pro GitHub `SUPABASE_ACCESS_TOKEN`):
  https://supabase.com/dashboard/account/tokens
- GitHub secret pro nasazení:
  https://github.com/janvasilecko-droid/pivovar-zajic/settings/secrets/actions/SUPABASE_ACCESS_TOKEN
- GitHub Actions (běhy nasazení):
  https://github.com/janvasilecko-droid/pivovar-zajic/actions
- URL projektu: https://sasqexjadvlqyticxwja.supabase.co
- **Projekt bible** (samostatný Supabase, rozhodnutí R12 — knihy, zpracování,
  náklady na AI): https://supabase.com/dashboard/project/cegrelgvkygcatupqwrx
  · klíče: https://supabase.com/dashboard/project/cegrelgvkygcatupqwrx/settings/api-keys
  · URL: https://cegrelgvkygcatupqwrx.supabase.co
- GitHub secrets pro bibli: `SUPABASE_BIBLE_ACCESS_TOKEN` (nasazení funkcí bible)
  a `BIBLE_SUPABASE_SERVICE_ROLE_KEY` (worker a záloha):
  https://github.com/janvasilecko-droid/pivovar-zajic/settings/secrets/actions

## Databáze
- Migrace se NEspouští samy (`AUTO_MIGRACE` není „ano"). Majitel je pouští
  v appce: Audit → Databázové migrace. Migrace projektu bible
  (`bible/supabase/migrations`, nikdy do `supabase/migrations`) tamtéž v bloku
  „Databáze bible".
- Supabase má pg_safeupdate: každý UPDATE/DELETE v migraci musí mít WHERE.
- Přístup Claude do databáze: proměnné prostředí `VITE_SUPABASE_URL`
  a `SUPABASE_SERVICE_ROLE_KEY` v nastavení prostředí (projeví se v nové relaci).

## Pivovarská bible (odborná knihovna + AI sládek)
- AI je **Claude (Anthropic API), ne Gemini** — rozhodnutí majitele 30. 10. 2026
  („chci aby to bylo napojené na Claude", „ne gemini"). Klíč ANTHROPIC_API_KEY
  je v app_secrets hlavního projektu. Návrh, etapy a rozhodnutí: docs/pivovarska-bible/.
- Bible žije v samostatném projektu Supabase (R12). Databáze bible je pro
  prohlížeč zavřená; appka chodí jen přes edge funkci bible-api
  (`bible/supabase/functions`, ověří přihlášení v hlavním projektu).
- Přístup je fail-closed (`bible_pristup()` v DB, `lib/bibleOpravneni.ts`).
- Repo je veřejné: obsah knih nesmí do gitu, migrací, logů ani artefaktů Actions.
