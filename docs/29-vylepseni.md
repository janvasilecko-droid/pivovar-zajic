# 29 vylepšení — pohodlnější práce, lepší vzhled, nové funkce

Seznam z 3. 9. 2026. Nejsou to obecné rady: každý bod je z toho, co v této
aplikaci opravdu je, a u každého je napsané, **co dnes bolí** a **jak by se to
mělo chovat**. Řazeno podle poměru přínos/riziko, ne podle abecedy.

Značky pracnosti: **S** = do půl dne · **M** = den · **L** = víc dní.
„Migrace" znamená, že to potřebuje spustit SQL v Supabase.

---

## A. Pohodlnější práce (nejvíc ušetřených klepnutí)

### 1. Spodní lišta má jen 4 místa, palec dosáhne na 5 (S)
`DOCK_SIZE = 4` v `homeLayout.ts`. Spodní lišta je jediné místo, kam palec
dosáhne bez přehmátnutí, a přesto v ní chybí Hledat i Poznámky. Povolit 5–6
míst a nechat volbu na uživateli. Dnes se na páté nejčastější věc musí přes
plochu.

### 2. „Naposledy použité" jako první nabídka (M)
Při zápisu stáčení, výdeje i objednávky se vybírá pivo a obal z celého
číselníku. V pivovaru se přitom 90 % zápisů týká tří piv a dvou obalů.
Nabízet nahoře posledních 5 kombinací daného uživatele (z jeho vlastních
zápisů, ne globálně) a zbytek nechat pod nimi.

### 3. Zápis stáčení bez rolování — číselník velkými tlačítky (M)
Dnešní zápis je formulář s poli. Ve sklepě se dělá v rukavicích a mokrou
rukou. Velká tlačítka +1 / +5 / −1 vedle počtu (jako v Inventuře) a
potvrzení palcem dole; klávesnice se nemusí otevřít vůbec.

### 4. Opakovat včerejší závoz jedním klepnutím (M)
Objednávky se opakují každý týden téměř totožně. „Zkopírovat objednávku
k novému datu" existuje, ale ne pro celý den. Tlačítko „Zopakovat čtvrteční
závoz" na Objednávkách udělá z 20 klepnutí jedno + kontrolu.

### 5. Hledání i podle odběratele a čísla (S)
Rychlé hledání (Ctrl+K, nově i „/" a tah dolů) prohledává obrazovky, ne
data. Přidat do něj odběratele, piva a obaly, aby se dalo psát „Maneo" a
skočit rovnou do jeho objednávek.

### 6. Vrátit poslední zápis („Vzít zpět") všude, ne jen v Inventuře (M)
`toastZpet` v Inventuře je nejlepší věc v celé aplikaci — pojistka proti
překliknutí. Ve stáčení, výdeji a odpisech chybí, a přitom jsou to zápisy,
které hýbou skladem.

### 7. Klávesnice na telefonu: číselná tam, kde se píší čísla (S)
Některá pole nemají `inputMode="numeric"`, takže vyskočí textová klávesnice
a čísla se hledají přes přeřazovač. Malá věc, dělá se ve dvě odpoledne, a
poznají to všichni.

### 8. Potvrzení bez modálního okna, když je akce vratná (S)
Dnes se potvrzuje i to, co se dá vzít zpět. Kde existuje „Vzít zpět", má
akce proběhnout hned a nabídnout vrácení — modál navíc je klepnutí, které
nic nechrání.

---

## B. Lepší a funkčnější vzhled

### 9. Jedna dlaždice = jeden stav, i barvou (S)
Barvy dlaždic si dnes volí uživatel, takže „červená" nemá význam. Nechat
volbu, ale **rezervovat** červenou/žlutou pro upozornění (jako v pásku), ať
barva něco znamená. Dnes vypadá plná plocha stejně naléhavě jako prázdná.

### 10. Tmavý režim doladit na dlaždicích a v grafech (M)
Kontrast písma je hlídaný testem, ale poloprůhledné dlaždice a barvy grafů
v tmavém režimu nikdo neproměřil (kontrolní skript 11 dvojic spočítat
neumí). Projít je a přebarvit; ve sklepě se svítí málo a appka se v tmavém
používá víc, než se čeká.

### 11. Prázdné obrazovky mají říct, co udělat (S)
Většina obrazovek při prázdném seznamu ukáže prázdno. Má tam být jedna věta
a tlačítko („Zatím žádné stáčení — Zapsat stočení"). Nový člověk v pivovaru
se to jinak učí od někoho, kdo má práci.

### 12. Čísla zarovnat na jedno místo a jednu jednotku (S)
V přehledech se mísí `l`, `hl` a kusy a někde chybí zarovnání na desetiny,
takže se sloupec nedá přeběhnout okem. Sjednotit formát (tabulární číslice
už v CSS jsou) a jednotku psát vždy, nikdy jen číslo.

### 13. Skutečný ukazatel plnosti tanku (M)
Sklep říká litry. Tank má `capacity_l`, takže jde nakreslit svislý ukazatel
plnosti — na první pohled je vidět „skoro plný / na dojezdu", což je to, co
se z čísla počítá v hlavě.

### 14. Souhrn dne na jednu obrazovku (M)
„Co se dnes stalo" — stočeno, vydáno, odepsáno, zavezeno, jedním sloupcem
odshora. Dnes se to skládá z pěti obrazovek a nikdo to nedělá.

### 15. Tisk a PDF, které vypadají jako doklad (M)
Závozový list se dnes tiskne jako webová stránka. Vlastní tiskové CSS
(hlavička s pivovarem, bez navigace, jeden odběratel na blok) — řidič to
má v ruce a zákazník to podepisuje.

### 16. Ikony a popisky sjednotit podle významu, ne podle obrazovky (S)
Tatáž věc má na různých obrazovkách jinou ikonu (sud, lahev, výčep).
Sjednotit přes `components/ikony.tsx` a doplnit chybějící; je to den práce
a appka se tím zklidní.

---

## C. Nové funkce, které něco ušetří

### 17. Chytat, když součet nedává smysl, ve chvíli zápisu (M)
Sklad umí být záporný a to je správně (je to odpověď, ne chyba). Ale
zápis 500 sudů místo 50 nikdo nezachytí. Při odchylce od obvyklého o víc
než trojnásobek se zeptat „opravdu 500?" — jednou za měsíc to zachrání
inventuru.

### 18. Objednávka telefonem: nahrát hlas a nechat přepsat (L)
Objednávky přes WhatsApp už appka čte. Zákazníci ale volají. Nahrát
hlasovku, převést na text a poslat stejnou cestou jako WhatsApp zprávu
(kontrola před schválením zůstává).

### 19. Vratné obaly u odběratele — kolik jich kde leží (M)
Kauce za výčepy se hlídají, sudy a přepravky u zákazníků ne. Přehled
„u koho je co" z rozdílu dodáno/vráceno; je to reálný majetek, který se
dnes hlídá pamětí.

### 20. Termín sanitace jako upozornění, ne jako deník (S)
Sanitační deníky evidují, co se udělalo. Neřeknou „u výčepu X je to za
14 dní". Z data poslední sanitace a intervalu spočítat další termín a
poslat do pásku upozornění, který už na ploše je.

### 21. Spotřeba a zásoba materiálu (etikety, korunky, PET) (M)
`labelStock` řeší etikety. Korunky, kapsle, PET a přepravky ne — a zastaví
stáčení stejně spolehlivě. Odečítat je při stáčení podle receptury obalu a
hlásit, když zbývá na méně než jedno stáčení.

### 22. Předpověď, kdy dojde pivo (M)
Ze `stockLedger` a rychlosti prodeje spočítat „desítka v 30l vydrží
9 dní". Je to to, co se dnes odhaduje z hlavy při plánování stáčení.

### 23. Kalkulace ceny a marže na objednávku (M)
Ceník existuje, marže nikde. U objednávky ukázat, kolik je to peněz a
kolik z toho zůstane — u akcí a výčepů se to počítá v hlavě.

### 24. Podpis převzetí na displeji (M)
Řidič dnes veze papír. Zákazník podepíše prstem na telefonu, podpis se
uloží k objednávce a je konec dohadování, co bylo dovezeno.

### 25. Fotka k zápisu (S, migrace)
K odpisu, k rozbitému sudu i k závozu se hodí fotka. `obrazek.ts` už
zvládne zmenšení; chybí úložiště (Supabase Storage) a políčko u zápisu.

### 26. Historie jednoho odběratele na jednom místě (M)
Dnes se skládá z Objednávek, Závozu a Ceníku. Karta odběratele: co bere,
jak často, kolik dluží obalů, poslední závoz.

### 27. Upozornění na telefon, i když appka neběží (M, migrace)
Notifikace jsou v appce (`notifications.ts`), ale jen když je otevřená.
Skutečný push (WhatsApp objednávka, výčep po termínu) znamená uložit
zařízení a poslat to ze serveru.

### 28. Přístupy podle rolí, ne podle zaškrtávátek (M)
Oprávnění jsou dnes po modulech na uživatele. Role „stáčeč", „řidič",
„vedení" s předvolbami by nového člověka nastavily jedním klepnutím —
a nezůstalo by mu omylem víc, než má mít.

### 29. Nezávislá záloha mimo GitHub (S)
Zálohy jdou do GitHubu, kde je i kód. Kdyby se ztratil přístup k účtu,
zmizí obojí naráz. Přidat druhé místo (třeba měsíční XLSX do e-mailu),
protože záloha na jednom účtu není záloha.

---

## Kdybych měl vybrat pět, se kterými začít

1. **č. 1** (pátá dlaždice ve spodní liště) — nejmenší práce, denní zisk.
2. **č. 2** (naposledy použité) — zkracuje každý jednotlivý zápis.
3. **č. 6** (Vzít zpět všude) — jediná věc, která opravdu chrání sklad.
4. **č. 20** (termín sanitace do upozornění) — hotová data, chybí výpočet.
5. **č. 17** (nesmyslný součet při zápisu) — chytí chybu tam, kde vzniká.

Pravidla, která u všeho platí (viz README): sklad počítá **jen**
`lib/stockLedger.ts`, `expectedForMonth` zůstává čistá teorie, databáze je
originál a `localStorage` jen zrcadlo, tanky jsou litry a sklad kusy.
