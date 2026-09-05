# 50 návrhů vylepšení

Seznam nápadů, ze kterých se dá vybírat — seřazené do kategorií, ne podle
priority. U každého je krátce *proč* a odhad velikosti:

- **(S)** malé, hodiny práce
- **(M)** střední, půl dne až den
- **(L)** velké, víc dní / promyšlení
- **🗄️ migrace** = potřebuje změnu v databázi (spouští se ručně v Supabase)

Není to závazek ani pořadí — je to nabídka. Řekni čísla, která chceš, a ta
udělám po dávkách (a po každé nasadím).

---

## A. Objednávky a WhatsApp

**1. Náhled celé objednávky po úpravě, ne jen rozdíl (M).**
U odpovědi „malé sudy budou…, petky sedí" ukázat i finální podobu CELÉ
objednávky (co zůstává + co se mění), ne jen změněné řádky. Obsluha pak vidí
naráz, že petky a třicítky opravdu zůstaly.

**2. Ruční doplnění položky přímo v kontrole (M).**
Když v načtené objednávce něco chybí (třeba se z PDF nevytáhly petky), jít je
přidat rovnou v okně kontroly, ne až po schválení v úpravě objednávky.

**3. Sloučit duplicitní objednávku místo varování (M).**
Dnes appka duplicitu jen ohlásí. Nabídnout „sloučit do stávající" — dva lidé
zapíšou totéž a nevznikne dvojitý závoz.

**4. Historie změn objednávky (M) 🗄️.**
Kdo a kdy objednávku upravil (přidal sud, změnil den). U reklamace „my jsme
objednávali jinak" je vidět, co se dělo.

**5. Rychlé „zopakovat minulý závoz" na jeden klik (S).**
U odběratele předvyplnit poslední objednávku — většina hospod bere pořád to
samé. Půl práce při zadávání ubude.

**6. Našeptávač obvyklého sortimentu odběratele (M).**
U zadávání ukázat „obvykle bere: 12° 4×30, petky 12×1" spočítané z historie —
míň překlepů a zapomenutých položek.

**7. Zvýraznit hledané slovo ve výsledcích (S).**
V objednávkách/historii podbarvit shodu, ať se u dlouhého názvu hospody
nemusí luštit, proč řádek vyhověl.

**8. Stavy objednávky rozlišit barvou i tvarem (S).**
Dnes „expedovaná / vyřízeno / hotová" splývají do jedné zelené. Odstupňovat
a přidat ikonu (tečka → fajfka → dvojfajfka), ať je na seznamu poznat, co je
naloženo a co zaplaceno.

**9. Štítek „Dnes / Zítra / Po termínu" u data závozu (S).**
Datum samo se čte pomalu; slovní štítek u řádku hned řekne, co je akutní.

**10. Odesílatele WhatsAppu spárovat s odběratelem natrvalo (S).**
Když jednou přiřadíš číslo k hospodě, příště to appka ví sama — míň
„Neznámý odběratel".

---

## B. Stáčení (KEG i lahve)

**11. Rychlé zopakování minulé dávky stáčení (S).**
„Stočit jako minule" předvyplní piva a obaly — u pravidelného rytmu ušetří
klikání.

**12. Kontrola součtu proti plánu stáčení (M).**
Po zápisu ukázat „naplánováno 20, stočeno 18 — chybí 2", ať se nedopatřením
nezapomene dostočit.

**13. Našeptat spotřebu korunek/PET víček u lahvování (S).**
U zápisu rovnou ukázat, kolik závěrek to spotřebuje a kolik zbývá — než
dojdou uprostřed stáčení.

**14. Šarže / datum spotřeby na jedno místo (M) 🗄️.**
Evidovat šarži lahvování a spočítat datum spotřeby — u reklamace a u kontroly
se to hledá nejhůř.

**15. Odhad, na kolik závozů vystačí stočené (S).**
Z průměrné spotřeby ukázat „tohle vydrží ~9 dní" — dřív se pozná, že se má
stáčet.

---

## C. Sklad a inventura

**16. Inventura z minula předvyplněná (S).**
Začít s hodnotami z posledního měsíce, jen se přepíšou rozdíly — ruční
opisování celého skladu je nejotravnější část.

**17. Automatické dopočítání rozdílu (účetní vs. napočítaný) (S).**
U inventury hned ukázat manko/přebytek po řádcích, ať se hledá jen tam, kde
sedí čísla špatně.

**18. Upozornění „málo na skladě" jako práh u piva (M) 🗄️.**
Vlastní hranice u každého piva/obalu, ne jen jedna pro všechno — u petek a
u třicítek je „málo" jiné číslo.

**19. Fotka k inventuře / odpisu povinná u velkých rozdílů (S).**
Když se odepisuje moc, chtít fotku — doklad, který po měsíci nikdo nedohledá.

**20. Sklad: sloupec „za jak dlouho dojde" (M).**
Z rychlosti úbytku odhadnout, kdy dojde — plánuje se podle toho stáčení
i nákup.

---

## D. Sklep a tanky

**21. Časová osa obsazenosti tanků (M).**
Vidět dopředu, kdy se tank uvolní a co se do něj vejde — plánování kvašení
bez tužky a papíru.

**22. Upozornění „tank dokvašen / čas přetáčet" (M) 🗄️.**
Podle data zákvasu a stupně hlásit, kdy je čas — dnes se to hlídá z hlavy.

**23. Historie tanku (co v něm bylo) (S) 🗄️.**
U tanku vidět předchozí náplně — dohledání při problému s kvalitou.

**24. Výpočet zbývajícího objemu na sudy (S).**
„V tanku je 480 l = 16×30 nebo 24×20" — hned je vidět, na co to stačí.

---

## E. Kniha jízd a auta

**25. Připomínka STK / dálniční známky s předstihem (S) 🗄️.**
Ne až po termínu — 30 dní předem, ať se stihne objednat.

**26. Rychlý zápis jízdy z GPS/naposledy (S).**
Předvyplnit trasu a km z minulé stejné jízdy — závozy jsou pořád stejné.

**27. Spotřeba a náklad na km přehledně (M).**
Z tankování a km spočítat l/100 km a Kč/km — vidět, jestli auto nežere víc,
než má.

**28. Export knihy jízd pro účetní (S).**
Měsíční přehled jízd a PHM jedním tlačítkem do Excelu — ať to nedělá ručně.

---

## F. Prodejna a fasování

**29. Rychlé tlačítko „prodej jako minule" (S).**
Typický denní prodej na jeden klik — večerní zápis je pak otázka vteřin.

**30. Denní/týdenní souhrn prodejny (M).**
Kolik se prodalo, čeho nejvíc — bez louskání jednotlivých zápisů.

**31. Fasování personálu s limitem (S) 🗄️.**
Volitelný měsíční strop na osobu a upozornění při překročení.

---

## G. Materiál (korunky, PET víčka, etikety)

**32. Předpověď, kdy dojde materiál (S).**
Z obvyklé spotřeby na stáčení odhadnout, na kolik stáčení zbývá — dřív se
objedná.

**33. Nákupní seznam z aktuálních zásob (M).**
Appka navrhne, co dokoupit (a kolik), podle prahů a plánu stáčení.

**34. Evidence dodavatele a ceny materiálu (S) 🗄️.**
U nákupu i od koho a za kolik — porovnání cen a rychlé doobjednání.

---

## H. Mobilní ovládání a UX

**35. Kostra místo spinneru při načítání (M).**
Nejčastější stížnost „když kliknu, vrací mě to nahoru" — obsah zůstane na
místě, jen zešedne, ne že zmizí a odroluje se.

**36. Potvrzení nebezpečných akcí „táhni pro smazání" (S).**
U mazání zápisu gesto místo malého křížku vedle plusu — míň omylů palcem.

**37. Offline fronta viditelnější a s ručním odesláním (S).**
Kolik zápisů čeká na síť a tlačítko „odeslat teď" přímo na ploše.

**38. Zvětšit klíčová čísla na dotykové obrazovky (S).**
Součty a stavy velkým písmem — čte se to ve sklepě a za jízdy.

**39. Rychlé akce z dlaždice podržením (S).**
U KEG/Lahve po podržení rovnou „nové stočení / přehled" — bez mezikroku.

**40. Našeptávač piv/obalů i při ručním zápisu (S).**
Stejný chytrý výběr jako u WhatsAppu i tam, kde se píše ručně.

---

## I. Vzhled a jednotný styl

**41. Dokončit převod tlačítek na role (M).**
Zbývá ~550 ručně malovaných tlačítek; po dávkách je převést na `.btn-*`, ať
appka vypadá všude stejně (hlídá to už kontrola).

**42. Tmavý režim dotáhnout i v grafech (M).**
Grafy zatím tmavý režim neznají — v noci svítí bílým.

**43. Malý graf u čísla (sparkline) (M).**
U klíčových čísel drobný trend za posledních pár týdnů — kontext bez
otvírání statistiky.

**44. Prázdno vs. chyba vs. „ještě nevím" rozlišit (S).**
„Nemáš objednávky" a „nepodařilo se načíst" dnes vypadají stejně — u druhého
nabídnout „zkusit znovu".

**45. Konzistentní velikosti písma (škála) (M).**
Sjednotit natvrdo psané velikosti do jedné škály — čitelnější a snáz se
udržuje.

---

## J. Spolehlivost, data, notifikace

**46. Připomínka zálohy zpět jako odznak na dlaždici (S).**
Na dlaždici „Stáhnout zálohu" ukázat „X dní" a zvýraznit, když je po termínu
— tichá pojistka, ať se nezapomene.

**47. Push „přišla WhatsApp objednávka" i se zavřenou appkou (M) 🗄️.**
Kód je hotový, chybí jen VAPID klíč a nasazení funkce — dodělat celé.

**48. Denní shrnutí na telefon (M) 🗄️.**
Ráno push: co se má dnes stočit, kolik závozů, co je po termínu — místo
otvírání a proklikávání.

**49. Kontrola konzistence dat (audit) (M).**
Najít nesrovnalosti (záporné zůstatky, objednávka bez položek, osiřelé
zápisy) a nabídnout opravu — dřív, než se to projeví ve skladu.

**50. Práva podrobněji (kdo co smí) (M) 🗄️.**
Jemnější role (řidič vidí jen závozy, brigádník jen prodejnu) — míň omylů
a čistší plocha pro každého.

---

## Kdybych měl vybrat pět, se kterými začít

1. **č. 35** (kostra místo spinneru) — řeší nejčastější stížnost „vrací mě to
   nahoru".
2. **č. 1 + 2** (náhled celé objednávky + ruční doplnění) — přímo navazuje na
   opravu úprav přes WhatsApp, kterou budeme v úterý testovat.
3. **č. 5 + 6** (zopakovat / našeptat sortiment) — nejvíc ušetří času při
   denním zadávání.
4. **č. 47** (push notifikace) — kód je skoro hotový, chce dotáhnout.
5. **č. 16 + 17** (inventura z minula + rozdíly) — nejotravnější měsíční
   práce.

Napiš čísla, která chceš, a jedu po dávkách.
