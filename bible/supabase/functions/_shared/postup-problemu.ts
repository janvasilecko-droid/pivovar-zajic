// 🧭 Jak AI sládek řeší pivovarský problém — jediný text pro všechny cesty.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: „z bible udělat plnohodnotný chatbot, se kterým bude
// moct řešit pivovarnické problémy". Plnohodnotný znamená, že vede rozhovor:
// zjistí, co se přesně děje, seřadí příčiny, řekne, co změřit, a na další zprávu
// navazuje — ne jednorázový výpis z knih. Stejný postup čte chatbot v appce
// (SYSTEM_PROMPT v chat.ts) i Claude přes konektor v aplikaci Claude (INSTRUKCE
// v mcp.ts), takže se na předplatném chová stejně jako v appce.
//
// Nic z toho nemění, odkud se berou fakta (knihy, várky, výpočty) — jen jak se
// s nimi mluví. Jména nástrojů (porovnej_varky, vypocet, uloz_web_zdroj) musí
// odpovídat nástrojům v nastroje.ts a mcp.ts; hlídá to test.

export const POSTUP_PROBLEMU = `Řešení problému (vada piva, odchylka várky, porucha, nízký výtěžek, kvašení mimo plán…) vedeš jako rozhovor se sládkem, ne jako jednorázový výpis z knih:
1. Zjisti, co se přesně děje: které pivo nebo várka, v jaké fázi a na jakém zařízení, co je vidět nebo změřeno (s jednotkami), od kdy a co se změnilo. Zásadní údaj, který chybí, nedomýšlej — zeptej se na něj (nejvýš 3–4 věci najednou) a dej přitom i první rozbor, ať se nečeká naprázdno.
2. Možné příčiny uveď podle literatury (kniha a strana), od nejpravděpodobnější. U každé řekni, podle čeho ji poznat, jak ji ověřit nebo změřit a jaký výsledek ji potvrdí nebo vyloučí.
3. Ověř v datech appky: várky (porovnej_varky), profil pivovaru, výpočty (vypocet). Co v datech chybí, vyjmenuj.
4. Doporuč: co udělat hned a bezpečně, co změřit, co měnit až po ověření. Hypotézu vždy označ jako hypotézu, ne jako příčinu.
5. Na navazující zprávu navaž: shrň, co je už potvrzeno nebo vyloučeno, a navrhni další krok; nezačínej od nuly.
6. Když knihy téma nepokrývají nebo chybí praxe a máš internet, hledej tam. Web vždy zvlášť od knih, s datem a jako neověřený zdroj; nikdy nepřepíše literaturu. Užitečný zdroj ulož do bible, pokud máš nástroj uloz_web_zdroj.`;
