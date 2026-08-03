// Verze aplikace — zvyšuje se při každé provedené úpravě, aby šlo v UI poznat,
// jestli je načtená nejnovější nasazená verze (řeší problémy s cachí prohlížeče/PWA).
export const APP_VERSION = '1.417';
export const APP_VERSION_DATE = '3.8.2026 10:57';

// Stručný přehled změn v aktuální verzi (zobrazuje se v admin sekci Nastavení)
export const APP_CHANGELOG: string[] = [
  '🍾 Stáčení lahví: přidán druhý sloupec „Lahve 2“ — z jednoho sudu lze stočit více druhů obalů najednou (např. 0,5L i 1,5L); opravena nabídka lahví, kde chyběly 1,5L lahve',
  '🍾 Stáčení lahví: při stáčení do lahví ze sudů se zadává počet použitých sudů (např. 6×50L) vedle obalu; tyto sudy se odečtou ze skladu KEG (jako objednávka) a v přehledu vytraty je vidět zdroj ze sudů, stočeno do lahví a ztráta (litry i %)',

  '🛢️ Stáčení KEG: přehled je nyní na samostatné záložce „Přehled“ (odděleno od zápisu); nahoře je vidět „Zbývá stočit keg“ a pod ním přehled stočených sudů s filtrem podle dne/týdne/měsíce a podle piva',


  '🏚️ Sklep & Spilka: na kartě tanku je nyní přímá volba piva a počátečního objemu (bez otevírání „Upravit“); u každého tanku je vidět počáteční objem a kolik piva zbývá v HL',
  '🏚️ Sklep & Spilka: odstraněn HACCP banner nahoře; statistiky (souhrn měsíc/rok, historie cyklů a přetáčení) přesunuty do Statistiky — ve Sklepu zůstává jen přehled tanků a spilky',
  '📋 Objednávky: karty objednávek mají nyní jednotnou bílou barvu (bez podbarvení dnem/pivem); jednotlivá piva jsou barevně rozlišená tečkou u názvu ve stejném stylu jako Stáčení (keg/lahve)',
  '📋 Objednávky: záložka „Objednávky“ přejmenována na „Přehled“; v přehledu a závozu sjednoceny ikony do jednotného stylu (lucide) a zpřehledněny barvy — tmavě žluté texty nahrazeny čitelnějšími (černá na žlutém podkladu, bílá na jantarovém)',
  '📋 Objednávky: Závoz je nyní třetí záložkou vedle Nové a Objednávky — nahoře jsou vždy záložky Nové / Objednávky / Závoz, ať kliknete na kteroukoli; obsah závozu se zobrazí přímo v objednávkách',
  '🎨 Objednávky a Závoz: sjednoceny ikony do jednotného stylu (lucide) — Nové (+), Objednávky (faktura), Závoz (dodávka), WhatsApp, Fotka/AI, Tisk, Export, Fasování, Smazat, Vybrat vše a další',
  '📋 Objednávky: „Detaily obj.“ přejmenováno na „Objednávky“; v kartě objednávky je hlavní datum akce/závozu (např. 21.8) a datum zadání je vedlejší; opravena kontrola „Vše skladem“ — počítá se podle týdne závozu, ne zadání; „Připr.“ je vedle „Vše skladem“; záložka „Nové“ zobrazuje jen formulář zadávání, seznam a detaily jen v „Objednávky“',
  '📋 Objednávky: tlačítka Zadání objednávek, Detaily objednávek a Závoz na jednom řádku; opraven filtr položek — výběr piva a velikosti obalu se kombinuje (např. 11SV + 30L zobrazí jen objednávky s obojím)',
  '📋 Objednávky: záložka „Přehled“ přejmenována na „Zadání objednávek“; v „Detaily objednávek“ odstraněn formulář zadávání, pole „Den“ přejmenováno na „Závoz“, odstraněno Fasování, opravena viditelnost tlačítek Zrušit/Smazat na telefonu a přidány filtry podle piva a velikosti obalu',
  '📋 Objednávky: Přehled nyní zobrazuje VŠECHNY zadané objednávky — lze nastavit den závozu, upravit objednávku a vidět všechny objednané položky',
  '🚚 Závoz: filtr dnů — „Všechny dny“ přejmenováno na „Všechny“, odstraněna čísla, zvýrazněny jen dny se závozem',
  '🚚 Historie a přehled tras přesunuty ze Závozu do Statistiky (záložka „Historie a přehled tras“)',
  '🚚 Závoz: datum zmenšen, tlačítka Zadávání objednávek a Přehled objednávek přesunuta nahoru, odstraněno Diktovat hlasem, Celková váha a Zavezeno na jednom řádku a zmenšeny',
  '🚚 Závoz: historie a přehled tras — přidány filtry (dny/týdny/měsíce, odběrné místo, pivo, velikost obalu)',
  '📋 Objednávky: grafická optimalizace karet objednávek na kompaktní řádky, aby se v telefonu vešlo více položek',
  '📋 Objednávky: tlačítka Přehled, Detaily objednávek a Závoz přesunuty nahoru nad hlasové zadávání, WhatsApp a fotku',
  '📋 Objednávky: odstraněn souhrn týdne (přehled objednávek a kusů jednotlivých sudů)',
  '🚚 Objednávky: tlačítko Závoz nahoře otevírá stránku Závoz',
  '🚰 Rezervace výčepu: rozpoznávání všech synonym (jednokohout, dvojkohout, dvojpípa, trojpípa, pípa, výčep…) a výběr druhu výčepu',
  '🚰 Rezervace výčepu se propisuje do záložky Výčepy',
  '📝 Zadávání objednávek: odstraněn sloupec Odběratel z tabulky, roztažen sloupec Pivo (odběratel je nahoře v hlavičce)',
];
