# 50 návrhů vylepšení — audit proti kódu

Původní seznam byl nápad „od stolu". Po projití kódu se ukázalo, že **appka
už umí většinu z toho**. Tady je pravdivý stav u každého bodu:

- ✅ **hotovo** — už v appce je
- 🧩 **částečně** — základ je, dá se dotáhnout
- 🔨 **chybí** — reálná mezera, má smysl udělat
- 🗄️ potřebuje migraci (SQL v Supabase)

Vyloučeno na přání: **#11, #14, #16, #22.**

---

## A. Objednávky a WhatsApp
*(kód se do úterního testu záměrně nemění; tyhle až po testu)*

1. 🧩 Náhled celé objednávky po úpravě — dnes se ukazuje jen rozdíl, ne celý finální obsah.
2. 🔨 Ruční doplnění položky přímo v kontrole.
3. 🧩 Sloučit duplicitní objednávku — detekce duplicit je, sloučení chybí.
4. 🔨 🗄️ Historie změn objednávky (kdo/kdy co).
5. ✅ Zopakovat závoz — „Zopakovat závozový den" existuje.
6. 🧩 Našeptat sortiment — „Poslední závoz" a duplicita v týdnu jsou; „obvykle bere" ne.
7. 🔨 Zvýraznit hledané slovo ve výsledcích.
8. 🧩 Stavy objednávky barvou i tvarem — „po termínu" logika je, odstupňování stavů ne.
9. 🔨 Štítek Dnes/Zítra/Po termínu u data.
10. ✅ Číslo WhatsAppu k odběrateli natrvalo — aliasy odběratelů fungují.

## B. Stáčení
11. — (vyloučeno)
12. ✅ Kontrola proti plánu — plán stáčení („KeggingDayPlan") existuje.
13. 🧩 Našeptat spotřebu korunek/PET víček u lahvování — materiál se eviduje, našeptat u zápisu ne.
14. — (vyloučeno)
15. 🔨 Odhad, na kolik závozů stočené vystačí.

## C. Sklad a inventura
16. — (vyloučeno)
17. ✅ Dopočet rozdílu (manko/přebytek, i v Kč, i dorovnání) — hotové.
18. 🧩 🗄️ Práh „málo" u každého piva/obalu — u materiálu je medián „obvyklé stáčení", per‑pivo práh ne.
19. 🧩 Fotka u odpisů — fotky u odpisu jsou, povinné u velkých rozdílů ne.
20. 🔨 Sklad: „za jak dlouho dojde".

## D. Sklep a tanky
21. ✅ Časová osa obsazenosti tanků — „TankOccupancyPlanner" existuje.
22. — (vyloučeno)
23. 🔨 🗄️ Historie tanku (co v něm bylo) — dnes jen aktuální stav náplně.
24. ✅ Výpočet zbývajícího objemu na sudy — *doplněno v této dávce* (viz níže).

## E. Kniha jízd a auta
25. 🧩 🗄️ STK/známka s předstihem — upozornění existují, jde doladit předstih 30 dní.
26. 🔨 Rychlý zápis jízdy z minula.
27. 🧩 Spotřeba — *l/100 km doplněno v této dávce*; Kč/km chybí (potřebuje 🗄️ sloupec s cenou paliva).
28. ✅ Export knihy jízd do Excelu — existuje.

## F. Prodejna a fasování
29. 🔨 „Prodej jako minule" na klik.
30. ✅ Denní/týdenní souhrn prodejny — hotovo (Dnes/Týden/Měsíc + nejprodávanější).
31. 🔨 🗄️ Fasování personálu s limitem.

## G. Materiál
32. 🧩 Předpověď, kdy dojde materiál — medián „obvyklé stáčení" je, dojezd ve dnech ne.
33. 🔨 Nákupní seznam z aktuálních zásob.
34. 🔨 🗄️ Evidence dodavatele a ceny materiálu.

## H. Mobilní ovládání
35. 🧩 Kostra místo spinneru — hlavní bolest („vrací mě to nahoru") už vyřešena tichým přenačítáním + kotvou pozice; zbývá jen vzhled prvního načtení.
36. 🔨 „Táhni pro smazání" (gesto — vyšší riziko kolize se scrollem).
37. ✅ Fronta „Odeslat teď" — *hotovo (v2.273)*.
38. ✅ Velká čísla — číselné dlaždice už jsou 2xl/3xl.
39. ✅ Rychlé akce z dlaždice podržením — existuje.
40. ✅ Našeptávač u zadávání — dlaždice piv + parser textu + combobox odběratele.

## I. Vzhled
41. 🧩 Dokončit převod tlačítek na role — ~550 ručně malovaných zbývá.
42. 🔨 Tmavý režim v grafech — roztroušené v 8 souborech, chce samostatný průchod.
43. 🔨 Sparkline (malý graf u čísla).
44. ✅ Prázdno vs. chyba — *mechanismus hotov (v2.273)*, obrazovky ho přebírají.
45. 🔨 Sjednotit velikosti písma — 512× natvrdo psaných `text-[11px]` ve screenech.

## J. Spolehlivost, data, notifikace
46. ✅ Záloha jako odznak na dlaždici — *hotovo (v2.273)*.
47. 🧩 🗄️ Push „přišla objednávka" — kód je, chybí VAPID klíč + nasazení funkce.
48. 🧩 🗄️ Denní shrnutí na telefon — souhrn dne existuje v appce, push verze ne.
49. ✅ Audit konzistence dat — „auditSkladu" a „orderAudit" existují.
50. ✅ Práva (kdo co smí) — práva na moduly + předvolby rolí existují; jde jen jemnit.

---

## Skutečné mezery (🔨), seřazené podle hodnoty

**Mimo objednávky (dají se dělat hned, bez rizika pro úterní test):**
- **#24** zbývající objem → sudy *(hotovo v této dávce)*
- **#20** sklad „za jak dlouho dojde" — plánování stáčení i nákupu
- **#30** souhrn prodejny — kolik se prodalo, čeho nejvíc
- **#15** odhad, na kolik závozů stočené vystačí
- **#29** „prodej jako minule"
- **#33** nákupní seznam materiálu
- **#26 + #27** jízda z minula, Kč/km
- **#23** 🗄️ historie tanku
- **#43** sparkline · **#42** tmavé grafy · **#45** škála písma (větší, vzhledové)
- **#36** táhni pro smazání (gesto, riziko)

**Objednávky (až po úterním testu):**
- **#2** ruční doplnění položky · **#7** zvýraznit hledané · **#9** Dnes/Zítra štítek
- **#8** odstupňovat stavy · **#1** náhled celé objednávky · **#3** sloučit duplicitu · **#6** našeptat sortiment · **#4** 🗄️ historie změn

**Potřebují migraci (kód teď, SQL v neděli):** #4, 18, 23, 31, 34, 47, 48.

Řekni čísla, nebo nech na mně — jedu odshora po skutečných mezerách.
