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
- `SUPABASE_BIBLE_ACCESS_TOKEN` (uložen 31. 10. 2026): podle majitele **bez
  vypršení („never")** — tedy nejspíš starší typ tokenu s přístupem k celému
  účtu. Funguje; bezpečnější je omezený token
  (https://supabase.com/dashboard/account/tokens): preset No access, jen projekt
  `cegrelgvkygcatupqwrx`, práva Edge Functions + Edge Function Secrets (obě
  Read-write). Ten ale vyprší nejpozději za rok a práva nejdou měnit — pak krok
  „Edge funkce projektu bible" v Build & Deploy zčervená (web se nasadí dál)
  a v souhrnu běhu jsou odkazy na výměnu.

## Databáze
- **Uzavřené měsíce se nemění.** Říjen 2026 je uzavřený — majitel 18. 11. 2026:
  „Na data ze října nesahej, to je uzavřený". Objednávky, pohyby skladu ani jiné
  záznamy s datem v uzavřeném měsíci neopravuj, nepřepisuj a nedorovnávej — ani
  migrací, ani přímo v databázi, ani když v nich najdeš chybu. Chybu jen oznam
  majiteli a nech to na něm. Který další měsíc je uzavřený, řekne majitel.
- **Data neopravuj.** Majitel 19. 11. 2026: „Neopravuj žádný data". Chyby
  v objednávkách, skladu, pohybech ani jinde (zdvojené zápisy, rozdíl proti
  fyzickému stavu …) neopravuj, nepřepisuj, nemaž ani nedorovnávej — ani
  migrací, ani přímo v databázi. Jen je oznam a pošli odkaz, kde je majitel
  vidí; opraví je sám v appce. Opravu dělej, až když o ni majitel výslovně
  požádá.
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
- Hledání v knihách je dvojí: podle slov a podle významu (vektory, R38: OpenAI embeddingy, klíč
  `OPENAI_API_KEY` v app_secrets hlavního projektu; bez klíče, migrace nebo vektorů se hledá jen podle
  slov). Vektory počítá worker v Actions; stav je ve Správě znalostí → AI a náklady.
- AI sládek běží i jako samostatná instalovatelná aplikace na `/sladek/` (R39, kořen `src/screens/SladekApp.tsx`,
  vlastní manifest, ikona a klíč přihlášení jako Zajíc 2) nad stejnými komponentami a daty jako v bibli.
- Repo je veřejné: obsah knih nesmí do gitu, migrací, logů ani artefaktů Actions.
