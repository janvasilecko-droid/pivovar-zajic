# Pivovar Zajíc

Výrobní a provozní systém pro minipivovar v Kynšperku nad Ohří. Objednávky,
stáčení do sudů i lahví, sklad, sklep, sanitační deníky, inventura a rozvoz.

Běží jako PWA (funguje offline, jde nainstalovat na plochu) a jako Android
aplikace přes Capacitor. Používá ho ~6 lidí, kteří sdílejí stejná provozní data.

- **Provoz:** https://zajic-pivovar.pages.dev
- **Data:** Supabase (PostgreSQL + auth + realtime)
- **Hosting:** Cloudflare Pages

## Rychlý start

```bash
npm install
npm run dev
```

Potřebuješ `.env` s přístupy k Supabase (vzor je v `.env.example`).

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | Vývojový server na http://localhost:5173 |
| `npm run build` | Kontrola typů + produkční build do `dist/` |
| `npx vitest run` | Testy jednou a konec |
| `npm test` | Testy v režimu sledování (běží dál a čeká na změny) |
| `npx tsc --noEmit` | Jen kontrola typů |

## Nasazení

⚠️ **`npm run deploy` NENÍ jednorázové nasazení.** Spouští `watch-deploy.mjs`,
což je trvale běžící hlídač souborů — nasadí až při dalším uložení souboru a
sám od sebe hned neudělá nic. Kdo ho spustí a čeká, čeká marně.

Ruční nasazení má čtyři kroky a **první z nich se nesmí vynechat**:

```bash
# 1. Zvýšit verzi v src/lib/version.ts A ZÁROVEŇ v public/version.json
#    (bez toho service worker novou verzi nepozná a lidem zůstane stará appka)
# 2. Ověřit
npx tsc --noEmit && npx vitest run
# 3. Build a nasazení
npm run build
npx wrangler pages deploy dist --project-name zajic-pivovar --branch main
# 4. Commit a push
```

Po nasazení appka chvíli ukazuje starou verzi — service worker servíruje z
cache a novou verzi nabídne až po kontrole `version.json`. Není to vada
nasazení; uživatel musí kliknout na „Aktualizovat", nebo appku zavřít a otevřít.

## Kontroly před commitem

`zkontroluj-tridy` a `zkontroluj-kontrast` jsou v CI **podmínkou nasazení** —
`build-and-deploy` na nich visí přes `needs: test`. Když spadnou, deploy job se
ani nezaloží a nic nekřičí; pozná se to jen tím, že „appka nechce aktualizovat".
Takhle skončily tři pushe za sebou.

Obě běží pár sekund, takže je má smysl pustit už před commitem:

```bash
git config core.hooksPath .githooks   # jednou na každém klonu
```

Když potřebuješ commitnout rozpracované, `git commit --no-verify`.

## Databázové migrace

Migrace jsou v `supabase/migrations/`. Na produkci se pouští přes Management
API (token v `.env`):

```bash
node scripts/apply-migration.mjs 20261220000000_nazev_migrace.sql
```

Vzor pro novou tabulku najdeš v poslední existující migraci. Platí:
zapnout RLS, čtení `TO authenticated USING (true)`, zápis přes
`public.user_can_edit_module('modul')`.

## Kde co je

```
src/
  App.tsx          Přepínač obrazovek (žádný router; historie se řeší ručně
                   kvůli tlačítku Zpět na Androidu)
  screens/         Obrazovky — jedna na modul
  components/      Sdílené prvky a modály
  lib/             Veškerá logika a výpočty. Tady se testuje.
supabase/
  migrations/      Schéma databáze
scripts/           Nasazovací a diagnostické skripty
```

Obrazovky se načítají až při otevření (`React.lazy`) — dřív se všech ~40
stahovalo naráz při startu.

## Čtyři pravidla, o která se to opírá

Tohle nejsou názory, ale místa, kde už jednou vznikla chyba. Kdo je poruší,
vyrobí ji znovu.

### 1. Sklad počítá jedině `lib/stockLedger.ts`

Každý zápis v aplikaci je **pohyb se znaménkem**, inventura je **reset**.
Stav k datu = poslední reset + pohyby po něm.

Nikde se nic neořezává na nulu. **Záporný stav je platná odpověď** a znamená,
že se vydalo víc, než evidence zná — aplikace to má ukázat, ne schovat.

Dřív to počítal `getStartingStockMap`, kde se ořezávalo, a schodky se tím
ztrácely. Pokud potřebuješ stav skladu, sáhni po skladové knize; nový výpočet
nepiš.

### 2. Očekávaný stav pro inventuru je čistá teorie

`expectedForMonth` schválně **nezapočítává opravy pořízené při té inventuře** —
ani napočítaný stav, ani dorovnání. Kdyby je počítal, porovnával by se sám se
sebou a manko by nešlo zjistit.

Pozor na datum: fyzická i schválená inventura se ukládá k **prvnímu** dni
měsíce, na stejné datum jako počáteční stav. Nestačí proto vyřadit inventury
„novější než první den".

### 3. Originál dat je v databázi, `localStorage` je jen kopie

Když něco existuje jen v prohlížeči, existuje to jen na jednom telefonu.
Přesně tak se roky ztrácely rezervace výčepů.

Kde `localStorage` zůstal (checklisty), je to **lokální zrcadlo** sdíleného
stavu, protože bránu čte spousta míst synchronně při vykreslování. Zrcadlo se
s databází srovnává **sjednocením** — kdo odškrtával offline, o svou práci
nepřijde.

### 4. Tanky jsou litry, sklad kusy

Objem tanku není součástí skladové knihy; odečítá ho RPC `adjust_tank_volume`
zvlášť, až po uložení stáčení. Když ten druhý krok selže, stáčení je uložené a
tank zůstane plný. Proto Sklep objem **dopočítává ze zapsaných pohybů a rozdíl
hlásí** (`lib/tankKontrola.ts`).

Kontrolují se jen tanky s živým cyklem — u vymytého spadne objem na nulu,
zatímco `initial_volume_l` drží starý cyklus.

## Testy

```bash
npx vitest run                    # vše
npx vitest run src/lib/nazev.test.ts   # jeden soubor
```

Logika patří do `lib/`, kde jde otestovat. Obrazovky testy skoro nemají — to je
známá slabina, viz `Orders.tsx` (přes 3 000 řádků).

Za pozornost stojí dva testy, které hlídají celek, ne detail:

- `lib/auditRetezce.test.ts` — celý řetězec od prázdné aplikace: tank → sudy →
  lahve → výdej → přefuk → inventura. Ověřuje i to, co se stát **nesmí**
  (lahve neubírají tank, sourozenecké řádky odečtou sudy jen jednou).
- `lib/rokProvozu.test.ts` — simulace roku provozu proti skladové knize.

Když píšeš test na výpočet, zkus ho **schválně rozbít** a ověř, že spadne.
Test, který nemůže selhat, je horší než žádný — vypadá jako pojistka.

## Poznámky k provozu

- **Datum se bere přes `businessDateISO()`**, ne `new Date()`. Pivovar jede v
  Praze bez ohledu na to, jak má kdo nastavený telefon.
- **Sanitační deníky jsou HACCP záznamy.** Nezakládej je „na zkoušku" —
  dokládají, že sanitace proběhla.
- **Checklist „Začátek stáčení" odemyká zápis stáčení.** Brána se kontroluje i
  při ukládání, ne jen v UI.

## Náhled obrazovek bez databáze

Ladit vzhled se dá jen tak, že ho člověk vidí — appka se ale bez přístupu k
Supabase zastaví na přihlášení. Proto je tu náhledová stránka: vykreslí panel
samostatně, nad vymyšlenými daty a s podstrčenou náhradou Supabase.

```bash
npx vite --config vite.nahled.config.ts    # http://localhost:5199
```

Přepíná se šířka (telefon / tablet / počítač), zápisy do „databáze" se vypisují
vedle panelu a „Začít znovu" vrátí data do výchozího stavu. Zápisy MĚNÍ data
v paměti, takže srovnání rozdílu jde vyzkoušet celé.

Panel běží v `iframe` (`nahled/panel.html`), a to schválně: Tailwind rozhoduje
o `sm:`/`md:` podle šířky OKNA, ne rodičovského prvku. Dokud se vykresloval
přímo ve stránce, „Telefon (390)" jen zúžil rámeček a uvnitř zůstalo
desktopové rozložení — takže se právě to, kvůli čemu náhled vznikl, nedalo
vidět. Iframe má vlastní okno, takže zadaná šířka platí.

Na `/plocha.html` je druhá stránka: srovnání rozložení domovské plochy na
telefonu (390 px) ve třech variantách vedle sebe, s přepínačem upozornění.
Není to obrazovka Domů z aplikace — ta se bez databáze nespustí — ale mřížka
ze stejného CSS (`HomeScreen.css`), takže na otázky rozvržení (kolik dlaždic
na řádek, co dělají upozornění s výškou) odpovídá věrně. Na cokoliv, co
závisí na obsahu, se tím spoléhat nedá.

Do produkčního buildu to nechodí — ten bere `index.html` v korenu. Nová data
patří do `nahled/mock/data.ts`, náhrada Supabase je v `nahled/mock/supabase.ts`.
Rámování stránky je schválně v `style`, ne v Tailwindu: `tailwind.config.js`
prochází jen `src/`, takže třídy napsané v `nahled/` by se nevygenerovaly.
