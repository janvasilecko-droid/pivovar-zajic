# 20 grafických vylepšení

Sepsáno 4. 9. 2026. **Každý bod je změřený v kódu**, ne vymyšlený — u
většiny je uvedené číslo, které to dokládá (kolikrát se to v aplikaci
vyskytuje). Poučení z minulého seznamu: osm z 29 bodů popisovalo problém,
který už byl vyřešený, protože jsem je psal z paměti. Tenhle vznikl
čtením `tailwind.config.js`, `src/index.css`, `HomeScreen.css`,
`components/ui.tsx`, `StatistikaVystav.tsx` a měřením přes grep.

Značky pracnosti: **S** = do půl dne · **M** = den · **L** = víc dní.

---

## A. Písmo a velikosti (největší zdroj nesourodosti)

### 1. Velikosti písma nemají škálu (M)
Změřeno: `text-xs` 1578×, `text-[11px]` **882×**, `text-sm` 542×,
`text-lg` 164×, `text-base` 142×, `text-xl` 108×, `text-2xl` 79× a k tomu
`text-[12px]`. Tedy dvě nejčastější velikosti v celé aplikaci jsou 12 px a
**natvrdo napsaných 11 px** — velikost, kterou Tailwind nezná, takže se
nedá zvětšit ani jednotně změnit. Zavést pět rolí (údaj, popisek, text,
podtitul, titul) jako `text-udaj`, `text-popisek`… a 11px hodnotu mít na
jednom místě. Vedlejší efekt: půjde přidat „velké písmo" pro sklep, kde se
kouká přes brýle a v páře.

### 2. Nadpis obrazovky si každá obrazovka dělá po svém (S)
Není žádná komponenta hlavičky stránky. Nadpisy jsou `text-xl
font-display font-black`, jinde `text-lg`, jinde `text-2xl` a někde
s ikonou vlevo, někde bez. Jedna komponenta `HlavickaStranky`
(titul + podtitul + akce vpravo) sjednotí 30+ obrazovek a ušetří místo
na telefonu.

### 3. Ikony mají deset různých velikostí (S)
Změřeno: `size={16}` 204×, `14` 172×, `18` 105×, `13` 102×, `15` 88×,
`20` 70×, `12` 52×, `11` 21×, `22` 16×, `10` 16×. Rozdíl 13 vs. 14 vs. 15
px nikdo nepozná záměrně — je to náhoda podle toho, kdo to psal. Tři
velikosti (14 v textu, 18 v tlačítku, 22 v hlavičce) a hotovo.

### 4. Čísla v tabulkách poskakují (S)
`tabular-nums` je jen ve 14 souborech. Bez něj má „1" jinou šířku než „8",
takže sloupec kusů se při každém přepočtu posouvá a časovač „tancuje".
Patří to na každé místo, kde jsou čísla pod sebou nebo se mění v čase.

---

## B. Stavy, které dnes vypadají jako porucha

### 5. Načítání zhasne celou obrazovku (M)
Změřeno: **12 obrazovek** dělá `if (loading) return <Spinner />`. To
znamená, že se při každém přenačtení odmountuje obsah — a s ním spadne
odrolování na začátek (přesně ta stížnost „když kliknu odečíst, vrací mě
to nahoru"). Kostra (`skeleton`) místo spinneru: šedé pruhy v rozměrech
skutečného obsahu, obsah zůstane na místě.

### 6. Klávesová fokus není vidět (S)
Změřeno: `focus-visible` je v `index.css` jen **2×**. Kdo appku obsluhuje
klávesnicí (na počítači v kanceláři to je většina zápisů), nevidí, kde
stojí. Jeden jasný rámeček z barvy primary přes všechna tlačítka, vstupy a
dlaždice.

### 7. Vypnutá tlačítka vypadají jako rozbitá (S)
Vzor v aplikaci je `disabled:opacity-40` — vybledlé tlačítko bez důvodu.
Lepší: zachovat plnou barvu, ubrat sytost a přidat důvod do `title`
(a u důležitých míst větu pod tlačítko: „nejdřív vyber pivo").

### 8. Pulzuje 42 míst (S)
`animate-pulse` je na 42 místech — od skutečného alarmu (dojezd tanku) po
dekoraci. Když bliká všechno, neznamená blikání nic. Nechat pulz jen tam,
kde něco hoří, a všude jinde ho zrušit; `prefers-reduced-motion` je v CSS
zatím **jen jednou**, takže komu se z animací dělá špatně, tomu appka
stejně bliká.

### 9. Prázdno vs. chyba vs. „ještě nevím" splývá (S)
`EmptyState` už umí větu a tlačítko (hotové), ale chybová a „nezjištěno"
varianta ne — takže „nemáš objednávky" a „nepodařilo se je načíst" vypadají
stejně, přitom v prvním případě se nemá nic dělat a v druhém zkusit znovu.

---

## C. Barva jako informace

### 10. Čtyři různé stavy objednávky mají JEDNU barvu (S)
V `Orders.tsx` mají `expedovana`, `vyrizeno_zavoz`, `vyrizeno`, `vyrizena`
a `hotova` všechny `bg-emerald-50 text-emerald-700` — pět stavů, jeden
štítek. Na seznamu se pak nedá poznat, co je naloženo a co už zaplaceno.
Odstupňovat (světle zelená → zelená → tmavá) a mít u toho tvar (tečka,
fajfka, dvojfajfka), ať to nese informaci i bez barvy.

### 11. Barevný štítek nemá tvar (S)
Stav dnes nese jen barva. Pro člověka, který barvy rozlišuje jinak (a ve
sklepě v mizerném světle to je každý), přidat k barvě ikonu nebo prefix —
stejný princip, jaký už používá popis plnosti tanku slovem.

### 12. Zvýraznění hledaného slova (S)
Hledání v Objednávkách a v Historii vrátí seznam, ale nenajdené slovo
v řádku nezvýrazní. Podbarvit shodu jantarovou — u dlouhého názvu hospody
se pak nemusí luštit, proč řádek vyhověl.

### 13. Dnešek v seznamu není vidět na první pohled (S)
Datumy jsou všude stejnou barvou. „Dnes", „zítra" a „po termínu" jsou tři
stavy, které se čtou nejčastěji — patří jim slovní štítek, ne jen datum.

---

## D. Telefon: hustota, prsty, okraje

### 14. Bezpečná zóna telefonu je řešená jedinou třídou (S)
`env(safe-area-inset-bottom)` je v CSS jen v `.pb-safe`. Na telefonech
s gesty (a na iPhonu s челkou) se spodní lišta a plovoucí tlačítka mohou
dostat pod systémový pruh. Projít všechna přilepená (`fixed`) místa.

### 15. Přilepená hlavička tabulky (M)
`.table` má stylované `thead`, ale nelepí se. U dvaceti řádků závozu se
při rolování ztratí, co který sloupec znamená. `position: sticky` na
hlavičku a na první sloupec (odběratel).

### 16. Zebra a zvýraznění řádku pod prstem (S)
Tabulky mají jen spodní linku. Střídavý podklad a zvýraznění řádku, na
který se právě ťuká, u dlouhých seznamů výrazně snižují přečtení špatného
řádku — a to je chyba, která se pak zapíše do skladu.

### 17. Dvě hustoty zobrazení (M)
Ve sklepě se kouká z metru a v rukavicích, v kanceláři se chce vidět
třicet řádků. Přepínač „velké / hustě" (jen třídy, žádná nová logika),
který si appka pamatuje na zařízení.

### 18. Bezpečná mezera u nebezpečných tlačítek (S)
Vzor „křížek za mezerou od plusu" je hotový jen v Prodejně (a je
komentářem popsaný jako záměr). Jinde stojí mazání hned vedle přidávání.
Projít místa, kde je destruktivní akce vedle běžné, a udělat to všude
stejně.

---

## E. Grafy a čísla

### 19. Graf nezná tmavý režim (M)
V `StatistikaVystav.tsx` je koláč obtažený natvrdo `stroke="#fff"` a
mřížka/písmo mají pevné hodnoty. V tmavém režimu jsou to bílé linky
v černém grafu a text, který se buď ztrácí, nebo svítí. Barvy grafu vzít
z CSS proměnných, které už pro tmavý režim existují (`tailwind.config.js`
je celé postavené na nich).

### 20. Malý graf u čísla (sparkline) (M)
`UkazatelPlnosti` (pruh plnosti tanku) ukázal, že jeden pruh vysvětlí
číslo lepší než odstavec. Stejný princip chybí u skladu (vývoj za 14 dní
u položky), u odběratele (jak často bere — data už karta odběratele
počítá) a u výstavu na dlaždici. Bez knihovny, čistý SVG, pár desítek
řádků.

---

## Kdybych měl vybrat pět, se kterými začít

1. **č. 5** (kostra místo spinneru) — řeší tu nejčastější stížnost, tedy
   „vrací mě to nahoru".
2. **č. 1** (škála písma) — 882 natvrdo napsaných 11 px je dluh, který
   každé další vylepšení zdražuje.
3. **č. 10** (pět stavů, jedna barva) — dnes se z barvy nedá přečíst
   pravda.
4. **č. 4 + 15 + 16** (čísla, přilepená hlavička, zebra) — tabulky jsou
   místo, kde se chyba zapíše do skladu.
5. **č. 6** (viditelný fokus) — půl dne práce a appka se dá obsluhovat
   klávesnicí.

Pravidla, která platí u všeho (viz README): barva se bere z proměnných
v `tailwind.config.js`, ne z literálů; kontrast musí projít
`scripts/zkontroluj-kontrast.mjs` (od 4. 9. 2026 nula nezměřitelných
dvojic — nová průhledná barva musí říct, co je pod ní); a každá nová třída
musí existovat v CSS, což hlídá `scripts/zkontroluj-tridy.mjs`.
