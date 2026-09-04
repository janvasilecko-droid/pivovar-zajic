# 29 vylepšení — co je hotové a co zbývá

Seznam vznikl 3. 9. 2026. **Přepsáno 4. 9. 2026 podle skutečného stavu
kódu.** Původní verze byla napsaná zčásti z hledání v kódu a z hlavy — a
osm bodů popisovalo problém, který už dávno vyřešený byl. Tady je stav
tak, jak ho ukazuje kód, ne jak jsem si ho pamatoval.

Zadání od majitele: **udělat všechno kromě bodů 19, 20 a 23.**

Značky: ✅ hotové a nasazené · ⏳ zbývá · ⛔ nedělat (zadání) ·
🟡 hotové jen část, důvod je uvedený

---

## Hotové v této dávce (body 1–29 mimo 19, 20, 23)

| # | Věc | Stav | Kde to je |
| --- | --- | --- | --- |
| 1 | Pátá dlaždice ve spodní liště | ✅ | `homeLayout.ts` — `DEFAULT_DOCK` má 5 míst, strop 6 |
| 2 | Naposledy použitá piva první | ✅ | `naposledyPouzite.ts` |
| 3 | Zápis stáčení bez rolování | ✅ | dlaždicový číselník `BeerTileGrid` byl už dřív; přidáno +5 a 44px cíle |
| 4 | Zopakovat celý závoz | ✅ | `Orders.tsx` — „Zopakovat závoz" |
| 5 | Hledání vede přímo na odběratele | ✅ | `ordersFilter.ts` + `QuickSearchModal` |
| 6 | „Vzít zpět" i po uložení | ✅ | KEG, Lahve, Fasování, Odpis, Prodejna |
| 7 | Číselná klávesnice u čísel | ✅ | 16 ze 17 polí ji mělo už dřív, doplněno poslední (minuty u časovače) |
| 8 | Bez modálu, když je akce vratná | ✅ | mazání přefuku |
| 9 | Barva na dlaždici zase něco znamená | ✅ | `BARVY_UPOZORNENI` + test |
| 10 | Tmavý režim a měřitelný kontrast | 🟡 | mechanismus hotový, 3 z 11 dvojic dopočítané, 8 vypsaných v `zkontroluj-kontrast.mjs --vse` |
| 11 | Prázdné obrazovky říkají, co udělat | ✅ | `EmptyState` s akcí |
| 12 | Čísla a jednotky v jednom tvaru | 🟡 | `cisla.ts` hotové, nasazené na dlaždicích, Sklepě, Objednávkách a Diagnostice; do zbytku obrazovek se doplňuje postupně |
| 13 | Ukazatel plnosti tanku | ✅ | `tankPlnost.ts` + `UkazatelPlnosti` |
| 14 | Souhrn dne | ✅ | `souhrnDne.ts`, na zvětšené dlaždici Sklad |
| 15 | Tisk jako doklad | ✅ | `safePrint.ts` — hlavička, podpisy, jen tisková oblast |
| 16 | Ikony podle významu | ✅ | sud sjednocen na 13 místech, hlídá test `jednotneIkony` |
| 17 | Chytit nesmyslný součet při zápisu | ✅ | `kontrolaZadani.ts` i ve Fasování, Odpisu a Prodejně |
| 18 | Objednávka telefonem přepsaná z hlasu | ✅ | **bylo hotové už dřív** — `VoiceRecorder` + edge funkce `transcribe-audio` + `parseVoiceOrder` |
| 19 | Vratné obaly u odběratele | ⛔ | podle zadání nedělat |
| 20 | Termín sanitace do upozornění | ⛔ | podle zadání nedělat |
| 21 | Spotřeba a zásoba materiálu | ✅ | `materialSklad.ts` — korunky a PET víčka se konečně odečítají; nákupy přesunuty z telefonu do databáze |
| 22 | Předpověď, kdy dojde pivo | ✅ | `predpovedDojiti.ts` |
| 23 | Kalkulace ceny a marže | ⛔ | podle zadání nedělat |
| 24 | Podpis převzetí na displeji | ✅ | **v Závozu byl už dřív**; přidán do detailu objednávky a sjednocen na jednu komponentu `PodpisModal` |
| 25 | Fotka k zápisu | ✅ | `fotkyZaznamu.ts` + `FotkyZaznamu.tsx`, u odpisu a u objednávky |
| 26 | Historie jednoho odběratele | ✅ | `kartaOdberatele.ts`, panel v Objednávkách |
| 27 | Push i se zavřenou aplikací | 🟡 | kód hotový (odběr, service worker, edge funkce `posli-push`), **čeká na VAPID klíče** — viz `docs/push-upozorneni-navod.md` |
| 28 | Přístupy podle rolí | ✅ | předvolba „Řidič" + test `predvolbyRoli` |
| 29 | Nezávislá záloha mimo GitHub | ✅ | připomínka po 7 dnech na ploše (jen admin) |

---

## Co ještě čeká na majitele (nejde to udělat z kódu)

### 1. Spustit migrace v Supabase

Aplikace je nasazená, ale tyhle migrace nikdo nepustil — dokud se
nepustí, příslušná funkce v appce **napíše, co chybí**, a nedělá, že
funguje:

```
20261226070000_tydenni_inventura.sql
20261226080000_whatsapp_vlastni_zpravy_uz_neobchazi_branu.sql
20261227000000_chyby_aplikace.sql
20261227010000_evidence_migraci.sql
20261227020000_tank_uprava_jednou.sql
20261228000000_nakupy_obalu_a_zavirek.sql
20261228020000_fotky_zaznamu.sql
20261228030000_push_odbery.sql
```

**Všechno v jednom souboru:** `docs/spustit-vsechny-migrace.sql` — jedno
vložení do Supabase → SQL Editor → Run. Jde to pustit i opakovaně, nic se
nezdvojí (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

Stav se dá zkontrolovat v **Nastavení → Diagnostika** (seznam „migrace
čekají"). Po spuštění se každá zapíše sama do evidence.

### 2. VAPID klíče pro push (bod 27)

Klíče jsou už vygenerované: **veřejný je v kódu** (je veřejný z podstaty),
**soukromý** patří do projektových secrets Supabase — do repozitáře nikdy.
Zbývá ho tam vložit a nasadit funkci `posli-push`; postup v
`docs/push-upozorneni-navod.md`. Push zatím nic neposílá automaticky, takže
tohle může počkat na počítač.

### 3. Nepovinné: WhatsApp hláška při pádu CI

GitHub issue se zakládá samo a bez nastavení. Kdo chce navíc zprávu na
WhatsApp, přidá do repozitáře secret `SEND_TOKEN` a proměnné
`BRIDGE_URL` a `BRIDGE_CHAT_ID`.

---

## Co jsem v původním seznamu napsal špatně

Osm bodů popisovalo problém, který už vyřešený byl. Napsal jsem je z
hledání v kódu a z paměti, ne z přečtení té části aplikace:

- **1, 3, 6, 7, 17, 28** — částečně nebo úplně hotové už před tímhle
  seznamem (u některých jsem dodělal jen zbytek: jedno chybějící číselné
  pole, jednu předvolbu role).
- **18** — hlas se nahrával a přepisoval už dávno (edge funkce
  `transcribe-audio`), včetně kontroly před uložením.
- **24** — podpis prstem existoval v Závozu (`SignatureModal`). Místo
  druhé evidence jsem podpis přidal do detailu objednávky a sjednotil ho
  na jednu komponentu, která píše do stejných sloupců.

---

## Pravidla, která u všeho platí (viz README)

- Sklad počítá **jen** `lib/stockLedger.ts`; minus je platná odpověď.
- `expectedForMonth` zůstává čistá teorie.
- Databáze je originál, `localStorage` jen zrcadlo.
- Tanky jsou litry, sklad kusy.
- Rostoucí tabulky se čtou přes `fetchAllRows` — Supabase vrátí nejvýš
  1000 řádků a zbytek zahodí **bez chyby**.
