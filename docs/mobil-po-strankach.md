# Ovládání na telefonu — obrazovka po obrazovce

Sepsáno 4. 9. 2026.

**Jak jsem to zjistil (a co to znamená):** na nasazenou appku
(`zajic-pivovar.pages.dev`) ani na Supabase se z mého prostředí nedostanu —
síťová politika je blokuje, takže jsem si obrazovky nemohl otevřít a
proklikat. Prošel jsem je proto v kódu a **změřil** to, co se změřit dá:
velikosti dotykových cílů, pevné šířky tabulek, počty sloupců mřížek,
poměr `hover:` k `active:`, tooltipy `title=` (na dotyku neexistují) a
číselné vstupy. U každého bodu je číslo, které to dokládá. Kde měřit nešlo
(rychlost, jak to opravdu padne do ruky), je to napsané jako domněnka,
ne jako fakt.

Referenční telefon: **360 × 780 px** (běžný Android), palec pravé ruky,
někdy v rukavicích a v páře.

Značky: **S** = do půl dne · **M** = den · **L** = víc dní.

---

## Část 1: Platí pro celou aplikaci

### C1. Dotykový cíl 44 px není pravidlo, jen výjimka (M)
Změřeno: **86 prvků** v aplikaci má rozměr mezi 12 a 32 px
(`w-6 h-6`, `w-8 h-8` apod.) a přitom na ně jde klepnout. Nejhorší jsou
Kalendář (13 takových), Objednávky (12), Upomínky (9), Sklo & Promo (8),
Lahve (8), Závoz (7). Plus/minus u množství už 44 px mají (hotové) — zbytek
ne. Nejde o vzhled: minutí cíle znamená u mazání smazaný záznam.

### C2. `hover:` bez `active:` — telefon nemá kurzor (S)
Změřeno: Závoz **50 × hover, 0 × active**. Objednávky 68/1. Lahve 48/3.
Stáčení KEG 55/1. Na telefonu tedy po klepnutí není žádná odezva a člověk
klepne podruhé — u zápisu do skladu to znamená dva zápisy. Doplnit
`active:scale-95` (nebo `active:bg-…`) tam, kde tlačítko něco dělá.

### C3. Nápověda schovaná v tooltipu, který na dotyku neexistuje (S)
Změřeno: **200 × `title="…"`** — Objednávky 35, Stáčení KEG 23, Sklad 15,
Závoz 13, Inventura 12, Lahve 12. Na telefonu se tooltip nezobrazí NIKDY,
takže vysvětlení „co tohle tlačítko dělá" je pro hlavní zařízení
nedostupné. Kde je to důležité, dát popisek pod ikonu; kde ne, přidat
`aria-label` a smířit se s tím, že to je jen pro klávesnici.

### C4. Přepínače záložek jsou vodorovný pásek, který se nevejde (M)
Vzor „záložky v jednom řádku s `whitespace-nowrap`" je v Závozu, Sklepě,
Historii, Inventuře i Sanitaci. Na 360 px se do řádku vejdou tři, ostatní
jsou za okrajem a šipka na rolování tam není. Návrh: záložky jako
vodorovný „carousel" s viditelným odříznutím (gradient na kraji) a
zapamatovanou poslední záložkou.

### C5. Vratná akce se pořád ptá, nevratná ne (S)
Vzor „udělej a nabídni Vrátit zpět" (`toastZpet`) je hotový u sedmi míst,
ale mazání v Katalogech, Uživatelích a Upomínkách se pořád ptá modálem.
Na telefonu je každé potvrzení klepnutí navíc pokaždé — i pro toho, kdo
se nespletl.

### C6. Písmo 11 px jako hlavní velikost (M)
Změřeno: `text-[11px]` **882 ×**. Ve sklepě, v páře a přes brýle je to
málo. Souvisí s bodem 1 ze `docs/20-grafickych-vylepseni.md` (škála
písma) — a hlavně to umožní přepínač „velké písmo", který dnes udělat
nelze, protože 11 px je natvrdo v 882 místech.

---

## Část 2: Obrazovka po obrazovce

### Plocha (Domů) — `HomeScreen.tsx`
Nejvíc odladěná obrazovka v celé appce (dlaždice 3 na řádek, pásek
upozornění 44 px, tah dolů na hledání, samoposun při tažení, živé
dlaždice). Co ještě chybí:
- **Přepínání stránek plochy jen tažením do stran** (M) — tři stránky
  dlaždic se přepínají gestem, ale není vidět, kolikátá je zobrazená.
  Tři tečky pod mřížkou (jako u domovské obrazovky telefonu) stojí deset
  řádků a odpoví na „kde to mám".
- **Dlouhý stisk = rychlé akce** je hotový, ale jen s jednorázovou
  nápovědou. Přidat u dlaždice s rychlými akcemi drobný rožek (⌄), ať to
  jde poznat i po tom, co nápověda zmizí.

### Objednávky — `Orders.tsx` (3 734 řádků, nejvytíženější obrazovka)
- **12 dotykových cílů pod 44 px** (C1) — mimo jiné křížky a fajfky
  v řádku objednávky, tedy „připraveno / zavezeno / smazat" těsně vedle
  sebe.
- **35 tooltipů** (C3) — u ikonových tlačítek v řádku, takže na telefonu
  se význam hádá z ikony.
- **68 × hover, 1 × active** (C2).
- **Filtry zabírají celou první obrazovku** (M): hledání, status, obaly,
  pivo, obal, „seskupit dle dne", „jen nezavezené" — sedm ovládacích
  prvků nad seznamem. Na telefonu by měly být schované za jedno tlačítko
  „Filtr (2)" s počtem aktivních; seznam má začínat hned.
- **Karta odběratele** (nová) je nad seznamem — na telefonu ji stáhnout
  do jednoho řádku s rozbalením, ať netlačí seznam dolů.

### Závoz — `Zavoz.tsx` (obrazovka řidiče, v jedoucím autě)
- **Záložky „Nové / Přehled / Závoz" mají výšku ~28 px** (`py-1.5`
  + 11 px text, řádky 409–430). To je nejmenší cíl na obrazovce, kterou
  člověk ovládá jednou rukou u volantu (zaparkovaný, ale přesto).
  Zvětšit na 44 px je nejlevnější zlepšení v celé aplikaci.
- **50 × hover, 0 × active** — jediná obrazovka s nulovou dotykovou
  odezvou (C2).
- **7 cílů pod 44 px.**
- **Návrh (M):** „režim řidiče" — jeden odběratel na celou obrazovku,
  velká tlačítka Zavezeno / Podpis / Vrácené sudy / Navigace, a přechod na
  dalšího tahem do strany. Dnes se v seznamu hledá řádek prstem.

### Stáčení KEG — `Kegging.tsx`
- **23 tooltipů, 55 × hover / 1 × active, 6 cílů pod 44 px.**
- Číselné vstupy jsou v pořádku (**9 × `type=number`, 9 × `inputMode`**) —
  tady se na to myslelo.
- **Návrh (S):** dlaždicový výběr piva je hotový; chybí u něj potvrzení
  „zapsáno" na celou šířku (dnes toast v rohu), aby to bylo vidět
  i s rukou nad displejem.

### Lahvování — `BottlingScreen.tsx`
- **8 cílů pod 44 px, 12 tooltipů, 48 × hover / 3 × active.**
- **3 × vodorovné rolování** — plán stáčení (`BottlingPlanPlanner.tsx`)
  má tabulku s **pevnou šířkou 920 px**, takže na 360 px displeji se roluje
  do strany a hlavička s pivem odjede z dohledu.
- **Návrh (M):** plán stáčení na telefonu jako karty po dnech, tabulku
  nechat pro počítač.

### Fasování / Odpis / Prodejna — `ProdejnaScreen.tsx`
Nejlépe připravená zápisová obrazovka (dlaždice, rozepsaný zápis přežije
zavření, kontrola překlepu o řád, naposledy použitá piva, fotka
u odpisu).
- **4 cíly pod 44 px, 6 tooltipů, 17 × hover / 0 × active.**
- **Návrh (S):** součet zapsaného držet přilepený u spodní hrany
  (`TileTotalBar` existuje) i při rolování formuláře — dnes se odroluje
  a člověk neví, kolik už zapsal.

### Sklad — `Stock.tsx`
- **15 tooltipů, 3 tabulky a jen 1 mobilní karta** — na telefonu se
  tabulky rolují do strany.
- **5 hustých mřížek** (3+ sloupce bez mobilní varianty).
- **Návrh (M):** místo tabulky karta na položku: pivo + obal velkým, stav
  vpravo, pod tím řádek předpovědi dojití (hotové) a tlačítko „vydat".

### Sklep — `Cellar.tsx`
Ukazatel plnosti tanku je hotový (pruh + slovní popis).
- **Návrh (S):** tanky na telefonu do jednoho sloupce s velkým číslem
  (dnes mřížka), a tank, ze kterého se právě stáčí, nahoru — stejně jako
  to už dělá živá dlaždice na ploše.

### Inventura — `InventoryScreen.tsx` (2 871 řádků)
- **Tabulka s pevnou šířkou 900 px** (řádek 2500) — na telefonu
  nepoužitelná, roluje se do strany a nevidíš, u kterého piva jsi.
- **12 tooltipů, 37 × hover / 4 × active, 5 hustých mřížek.**
- **Návrh (L):** „průvodce inventurou" — jedna položka na obrazovku,
  velké číselné pole, možnost přeskočit, na konci souhrn rozdílů. Dnes
  se počítá ve sklepě do papíru a přepisuje se v kanceláři, přesně proto,
  že tabulku na telefonu nelze obsluhovat.

### Historie — `History.tsx` (2 093 řádků)
- **10 hustých mřížek** — mimo jiné pětisloupcová mřížka sudů
  (50/30/20/15/10 l) s 11 px textem, na 360 px má buňka ~55 px.
  Čte se, neťuká se do ní, takže to není chyba — ale je to hranice
  čitelnosti.
- **3 tabulky, 2 mobilní karty** (nejlepší poměr v aplikaci).
- **23 × hover / 1 × active.**

### Sklo & Promo — `SkloPromoScreen.tsx`
Nejhorší poměr v měření: **9 hustých mřížek, 3 tabulky, 0 mobilních
karet, 8 cílů pod 44 px.**
- Formuláře nákupu mají `sm:grid-cols-4`, takže na telefonu je to čtyři
  pole pod sebou a tlačítko až pod nimi — to je v pořádku. Problém jsou
  tabulky historie: bez mobilní karty a bez vodorovného rolování u jedné
  z nich.
- **Návrh (M):** historie příjmů jako karty; nový přehled závěrek
  (korunky / PET víčka) už karty má, takže je z čeho vzít vzor.

### Statistika — `Statistika.tsx` + `StatistikaVystav.tsx`
- **Grafy neznají tmavý režim** (koláč obtažený natvrdo `stroke="#fff"`).
- **Návrh (M):** na telefonu graf otočit — vodorovné pruhy místo
  svislých, protože názvy piv se na 360 px do osy X nevejdou a dnes se
  zkracují na „Desít…".

### Kalendář — `Calendar.tsx`
- **13 dotykových cílů pod 44 px** — nejvíc v celé aplikaci; jsou to
  ikonky v buňkách dne (zvonek 12 px, koš 16 px).
- **Návrh (M):** na telefonu měsíční mřížka jen jako přehled (počet
  událostí tečkou) a klepnutí na den otevře seznam pod tím. Ikonky
  v buňce jsou na dotyk moc malé, ať se udělá cokoliv jiného.

### Upomínky — `RemindersScreen.tsx`
- **9 cílů pod 44 px, 12 × hover / 1 × active.**
- **Návrh (S):** odklepnutí upomínky tahem do strany (jako mail), místo
  malé fajfky.

### Katalogy (odběratelé, piva, obaly) — `Catalogs.tsx`
- **30 × hover / 2 × active, 3 husté mřížky.**
- **Návrh (S):** u odběratele mít na telefonu první dvě věci volání
  a navigaci (telefon už je odkaz `tel:`, hotové) — jako dva velké
  řádky, ne jako drobný text v kartě.

### Uživatelé — `Users.tsx`
- **2 tabulky, 0 mobilních karet** — matice oprávnění (19 modulů × 2
  práva) v tabulce na telefonu nejde obsluhovat.
- **Nově je předvolba „Řidič"**, takže nejčastější případ se dá vyřešit
  jedním klepnutím; matice zůstává pro výjimky.
- **Návrh (M):** na telefonu ukázat jen předvolby a „upravit ručně"
  otevřít jako seznam modulů s dvěma přepínači na řádek.

### Nastavení — `AppSettingsScreen.tsx`
Dlouhá stránka s mnoha sekcemi (upozornění, push, záloha, diagnostika…).
- **Návrh (S):** rejstřík nahoře (odkazy na sekce) — dnes se hledá
  rolováním. Na telefonu je to nejdelší stránka aplikace.

### HACCP a sanitační deníky — `HaccpScreen.tsx`, `SanitaceTabbed.tsx`
- **4 husté mřížky, 0 mobilních karet, 2 × vodorovné rolování.**
- Kontrast v nouzovém panelu je opravený (4. 9. 2026).
- **Návrh (M):** sanitační záznam jako průvodce třemi kroky (co, čím,
  kdo) — vyplňuje se to v gumových rukavicích u kotle.

### Akce — `Akce.tsx`
- **5 cílů pod 44 px, 27 × hover / 0 × active.**
- **Návrh (S):** „přidat položku" jako velké tlačítko na spodní hraně
  (dnes v hlavičce, tedy palcem nejdál).

### Exkurze, Kniha jízd, Výčepy, Depozitář
- Exkurze: **3 tabulky / 1 karta, 3 × vodorovné rolování**.
- Kniha jízd: zápis jízdy má víc polí pod sebou; **návrh (S)** —
  předvyplnit „odkud" posledním „kam" (řetězení jízd).
- Výčepy: kauce a termíny jsou tabulka; **návrh (S)** — karta na výčep
  s velkým stavem.

### Časovače a stopky — `TimersScreen.tsx`
- **3 husté mřížky, 1 cíl pod 44 px.** Číselná klávesnice u minut je
  doplněná (4. 9. 2026).
- **Návrh (S):** předvolby (5 / 15 / 30 / 60 min) jako velké dlaždice —
  časovač se ve varně nastavuje mokrou rukou.

### Diagnostika (v Nastavení) — `AdminDiagnostika.tsx`
- **2 tabulky, 0 mobilních karet.** Je to administrátorská obrazovka, na
  telefonu se na ni kouká výjimečně — nechat, ale doplnit vodorovné
  rolování, ať se dá aspoň přečíst.

---

## Kdybych měl vybrat pět, se kterými začít

1. **Závoz: záložky 28 px → 44 px** (S) — nejmenší práce, nejhorší
   současný stav, a je to obrazovka, kterou se appka používá venku.
2. **C2: `active:` odezva** (S) — 200+ tlačítek dnes na klepnutí
   neodpoví, a to je příčina dvojích zápisů.
3. **Objednávky: filtry pod jedno tlačítko** (M) — vrátí seznamu první
   obrazovku telefonu.
4. **Inventura: průvodce po jedné položce** (L) — jediná věc, která
   sundá papír ze sklepa.
5. **C1: dotykové cíle v Kalendáři a v Objednávkách** (M) — 25 cílů,
   u kterých se dá minout a smazat.
