// Položky checklistů stáčení (lahve, KEG) — jen data, bez obrazovek.
// Žijí tady, ať je může číst malé MonthlyCleanupWarning z hlavního kusu aplikace, aniž by
// s sebou táhlo celá okna checklistů (limit velikosti startu, scripts/zkontroluj-velikost.mjs).

export type ChecklistItem = {
  id: string;
  category: string;
  text: string;
  required?: boolean;
  // Položka, kterou stačí splnit JEDNOU TÝDNĚ: jakmile je odškrtnutá v kterýkoli
  // „Stáčecí den\" aktuálního ISO týdne, v dalších dnech týdne se v checklistu
  // „1. Začátek stáčení\" už nezobrazuje a neblokuje vstup do zápisu stáčení.
  weekly?: boolean;
};

export const DEFAULT_ITEMS: ChecklistItem[] = [
  // 1. Začátek stáčení
  { id: 'start_1', category: '1. Začátek stáčení', text: 'Zkontrolovat veškeré vnější plochy u stáčeček', required: true },
  { id: 'start_2', category: '1. Začátek stáčení', text: 'Zkontrolovat vnitřky stáčeček a vyčistit kartáčem vnitřní a vnější plochy všech stáčeček (na kterých se bude stáčet) studeným louhem o koncentraci 2% a důkladně opláchnout čistou vodou', required: true, weekly: true },
  { id: 'start_3', category: '1. Začátek stáčení', text: 'Zkontrolovat vnější i vnitřní povrch naražečů', required: true },
  { id: 'start_4', category: '1. Začátek stáčení', text: 'Pivní vedení propláchnout čistou vodou', required: true },
  { id: 'start_5', category: '1. Začátek stáčení', text: 'Pivní vedení propláchnout 1% louhem, nechat působit 20 min (příprava sudů, lahví, víček, zátkovaček...)', required: true },
  { id: 'start_7', category: '1. Začátek stáčení', text: 'Zkontrolovat všechny plochy stolů a odkladových ploch', required: true },
  { id: 'start_9', category: '1. Začátek stáčení', text: 'Zkontrolovat všechny nádoby (na oplach, na víčka, na odkládání nástavců na sklo)', required: true },
  { id: 'start_11', category: '1. Začátek stáčení', text: 'Zkontrolovat vnitřek zátkovačky na PET lahve', required: true },
  { id: 'start_12', category: '1. Začátek stáčení', text: 'Zkontrolovat zátkovačku na korunky', required: true },
  { id: 'start_13', category: '1. Začátek stáčení', text: 'Propláchnout pivní vedení čistou vodou (po 1% louhu)', required: true },

  // 2. Konec stáčení
  { id: 'end_1', category: '2. Konec stáčení', text: 'Vylít pivo a pěnu z nádoby na zbytky piva', required: true },
  { id: 'end_2', category: '2. Konec stáčení', text: 'Důkladný proplach pivních cest čistou vodou', required: true },
  { id: 'end_3', category: '2. Konec stáčení', text: 'Sundat nástavce na lahve a opláchnout povrch stáčeček a pivního vedení ZE VŠECH STRAN!!! (včetně rychlospojek, hadic, naražečů,........)', required: true },
  { id: 'end_4', category: '2. Konec stáčení', text: 'Odšroubovat červený ventil na regulaci odtoku zbytků piva, zkontrolovat (případně vyčistit) a opláchnout čistou vodou včetně vnitřního a vnějšího závitu', required: true },
  { id: 'end_5', category: '2. Konec stáčení', text: 'Nasadit nástavce na lahve, nasadit lahve, povolit kohout na rychlost odtlakování, naplnit lahve vodou a nechat vodu protékat skrz lahve cestou na odtok zbytků piva a pěny, poté vodu z lahví vylít', required: true },
  { id: 'end_6', category: '2. Konec stáčení', text: 'Sundat vrchní kryt stáčečky a zkontrolovat, zda je vnitřek z obou stran čistý, bez povlaku, zbytků od piva, pěny, plísní (pokud ne, vyčistit louhem a kartáčem) a vnitřky vypláchnout čistou vodou', required: true },
  { id: 'end_7', category: '2. Konec stáčení', text: 'Zkontrolovat vnější a vnitřní povrch všech naražečů', required: true },
  { id: 'end_8', category: '2. Konec stáčení', text: 'Na stáčečkách nastavit program na CO2, ať „vyprská“ voda ze vzduchového vedení (pokud se tam během oplachu dostala), nasadit PET lahve a natlakovat', required: true },
  { id: 'end_9', category: '2. Konec stáčení', text: 'Opláchnout čistou vodou povrch stáčeček (stáčečky ze všech stran, hlavně všechny škvíry, kam se potenciálně mohlo dostat pivo)', required: true },
  { id: 'end_10', category: '2. Konec stáčení', text: 'Oplach naražečů, povrch hadic a rychlospojek', required: true },
  { id: 'end_11', category: '2. Konec stáčení', text: 'Opláchnout nástavec naražeče na oplach vodou pivní cesty ze všech stran, včetně uchycení ke konzoli, mezer na šrouby atd.....', required: true },
  { id: 'end_12', category: '2. Konec stáčení', text: 'Oplach konzole ze všech stran', required: false },
  { id: 'end_13', category: '2. Konec stáčení', text: 'Oplach CELÉHO povrchu stěny (včetně spár)', required: false },
  { id: 'end_14', category: '2. Konec stáčení', text: 'Oplach povrchu stolů (důkladně oplachovat zespodu)', required: true },
  { id: 'end_15', category: '2. Konec stáčení', text: 'Oplach celého povrchu odkládací plochy na automatické stáčečce skleněných lahví', required: true },
  { id: 'end_16', category: '2. Konec stáčení', text: 'Čistou vodou opláchnout nádobu na zbytky (otočit a nechat odkapat)', required: true },
  { id: 'end_17', category: '2. Konec stáčení', text: 'Oplach podlah (pozor hlavně na nohy od stáčecí linky, palety a veškerá místa, která se blbě oplachují a může zde pivo zůstávat a plesnivět), u bomb, atd....', required: true },
  { id: 'end_18', category: '2. Konec stáčení', text: 'Oplach zátkovačky na korunky (v případě, že se stáčelo sklo)', required: false },
  { id: 'end_19', category: '2. Konec stáčení', text: 'Naražeč nasadit na nástavec na oplach', required: true },
  { id: 'end_20', category: '2. Konec stáčení', text: 'Otřít zátkovačku vlhkým hadrem (odpojenou od el. sítě) a umístit ji do sucha', required: true },
  { id: 'end_21', category: '2. Konec stáčení', text: 'Vyndat hlavu zátkovačky na PET lahve, opláchnout ji pod tekoucí vodou (případně ji vyčistit pomocí louhu a kartáče) a nechat odkapat', required: true },
  { id: 'end_22', category: '2. Konec stáčení', text: 'Stáhnout stěrkou veškerou vodu ze stolů a podlah', required: true },
  { id: 'end_23', category: '2. Konec stáčení', text: 'Nevyužitá víčka opláchnout čistou vodou a nechat odkapat', required: false },
  { id: 'end_24', category: '2. Konec stáčení', text: 'Opláchnout a vyčistit všechny nádoby, misky, mřížky na odkapávání, případně všechny ostatní věci, které byly během stáčení použity a nechat odkapat (hlavně kraje nádob)', required: true },

  // 3. Týdenní kontrola
  { id: 'week_1', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat stoly, povrch automatické stáčecí linky na sklo a vnitřek/povrch u stáčeček', required: false },
  { id: 'week_2', category: '3. Týdenní kontrola (1x týdně)', text: 'Stáčečky otevřít a zkontrolovat vnitřek vizuálně i čichem (při zápachu rozebrat, 1% louh na 24h)', required: false },
  { id: 'week_3', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat povrch červeného ventilu na rychlost odtlakování vč. vnitřního závitu', required: false },
  { id: 'week_4', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat, zda je dobře opláchnutá zeď a netvoří se ve spárách plíseň', required: false },
  { id: 'week_5', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat konzoli a nástavec na oplach vodou pro naražeč', required: false },
  { id: 'week_6', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat vnější a vnitřní povrchy naražečů', required: false },
  { id: 'week_7', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat, zda jsou čisté hadice a rychlospojky', required: false },
  { id: 'week_8', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat veškeré nádoby, zátkovačky, nástavce', required: false },

  // 4. Měsíční údržba (1x měsíčně — první nebo poslední týden v měsíci)
  { id: 'month_1', category: '4. Měsíční údržba (1x měsíčně)', text: 'Odšroubovat stáčečky od odvodní trubky (č. 17 na obrázku), odpojit od nápojové a CO2 cesty a rozebrat na jednotlivé díly dle návodu, vše nechat několik hodin (minimálně 1 hodinu) v 1% louhu', required: true },
  { id: 'month_2', category: '4. Měsíční údržba (1x měsíčně)', text: 'Rozebrat naražeče včetně rychlospojek a nechat minimálně hodinu v 1% louhu', required: true },
  { id: 'month_3', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit podlahy (kolem stáčecí linky, za kanálem, u sodovky, všude kam se odkládají plné i prázdné lahve)', required: true },
  { id: 'month_4', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch stěn', required: true },
  { id: 'month_5', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch konzole', required: true },
  { id: 'month_6', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch hadic, rychlospojek', required: true },
  { id: 'month_7', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit stoly ze všech stran (ideálně je otočit)', required: true },
  { id: 'month_8', category: '4. Měsíční údržba (1x měsíčně)', text: 'Mechanicky vyčistit všechny díly stáčeček a naražečů', required: true },
  { id: 'month_9', category: '4. Měsíční údržba (1x měsíčně)', text: 'Důkladně zkontrolovat a opláchnout čistou vodou všechny díly stáčeček a naražečů', required: true },
  { id: 'month_10', category: '4. Měsíční údržba (1x měsíčně)', text: 'Do sudu připravit 1% louh, natlakovat VZDUCHEM!!! Do stáčeček dát nástavce na lahve se sanitačními lahvemi, nechat otevřený červený ventil na odfuk a projet louhem nápojové cesty včetně odtokové na zbytky piva (nevyčerpat všechen louh ze sudu, aby ho tlak vzduchu nevyfoukal) a nechat alespoň 24 hodin', required: true },
  { id: 'month_11', category: '4. Měsíční údržba (1x měsíčně)', text: 'Přehodit hadice na naražeči (odpojit vzduchovou hadici od hodin, aby se do nich nedostal louh!!!) a projet cestu louhem, poté nastavit na stáčečkách program na CO2 a projet i cesty ke stáčečkám včetně odfuku (stále nechat otevřený červený ventil na odfuk), opět platí nevyčerpat všechen louh ze sudu, aby ho tlak vzduchu nevyfoukal', required: true },
];

export const MONTHLY_CATEGORY_PREFIX = '4.';

export type KegChecklistItem = {
  id: string;
  category: string;
  text: string;
  required?: boolean;
  weekly?: boolean; // Splněno jednou týdně
  choice?: boolean; // Krok s volbou mezi NaOH a Persterilem (vybere se JEDEN)
};

export const KEG_DEFAULT_ITEMS: KegChecklistItem[] = [
  // 1. Začátek stáčení
  { id: 'keg_start_1', category: '1. Začátek stáčení', text: 'Proplach pivních cest: NaOH 2% (20 minut) NEBO Persteril 0.2% (10 minut) — vyberte jeden postup', required: true, choice: true },
  { id: 'keg_start_valves_spray', category: '1. Začátek stáčení', text: 'Vystříkat klapky Persterilem 0.2%', required: true },
  { id: 'keg_start_valves_rinse', category: '1. Začátek stáčení', text: 'Oplach klapek vodou', required: true },
  { id: 'keg_start_bottler_rinse', category: '1. Začátek stáčení', text: 'Oplach vodou stáčečku (2 minuty)', required: true },

  // 2. Konec stáčení
  { id: 'keg_end_1', category: '2. Konec stáčení', text: 'Po konci stáčení: důkladný proplach pivních cest vodou', required: true },
  { id: 'keg_end_2', category: '2. Konec stáčení', text: 'Opláchnutí stáčecích klapek vodou', required: true },
  { id: 'keg_end_3', category: '2. Konec stáčení', text: 'Oplach narážečů vodou a jejich vizuální kontrola', required: true },
  { id: 'keg_end_4', category: '2. Konec stáčení', text: 'Spláchnutí podlah ve sklepě vodou', required: true },
  { id: 'keg_end_5', category: '2. Konec stáčení', text: 'Spláchnutí podlahy a stěn u stáčeček', required: true },
  { id: 'keg_end_6', category: '2. Konec stáčení', text: 'Ponořit hlavy narážečů do kýble s roztokem Persterilu', required: true },

  // 4. Měsíční údržba
  { id: 'keg_month_1', category: '4. Měsíční údržba (1x měsíčně)', text: 'Kompletně rozebrat VŠECHNY narážeče a rychlospojky a naložit je do louhu NaOH', required: true },
  { id: 'keg_month_2', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit rozebrané díly narážečů a rychlospojek kartáčem a nechat v louhu 24 hodin', required: true },
  { id: 'keg_month_3', category: '4. Měsíční údržba (1x měsíčně)', text: 'Poté důkladný oplach všech částí čistou vodou', required: true },
  { id: 'keg_month_4', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vizuální kontrola čistoty a stavu těsnění', required: true },
];

export const KEG_MONTHLY_CATEGORY_PREFIX = '4. Měsíční';
