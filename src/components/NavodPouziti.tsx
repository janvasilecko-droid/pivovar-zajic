import { useState } from 'react';
import { AlarmClock, BarChart3, BookOpen, Car, ChevronDown, ClipboardList, FileSpreadsheet, FlaskConical, Fuel, CircleCheck, Download as DownloadIkona, EllipsisVertical, Hand, Home, Hourglass, KeyRound, LayoutGrid, Info, Lock, Mail, type LucideIcon, Pencil, Plus, Rocket, Search, Settings, Share, SquarePlus, Shield, ShoppingBag, Sparkles, Store, Tag, Users, Zap } from 'lucide-react';
import { IkonaSud, IkonaLahev } from './ikony';
import { APP_VERSION, APP_VERSION_DATE } from '../lib/version';

// 📖 NÁVOD K POUŽITÍ — co která obrazovka umí a jak se to dělá.
// ---------------------------------------------------------------------------
// Nahradil blok „Co je nového ve verzi…", který v Nastavení vypisoval přes
// šedesát záznamů o změnách. Pro toho, kdo appku POUŽÍVÁ, to byl seznam věcí,
// které se mu už staly; potřebuje naopak vědět, co má zmáčknout.
//
// Jeden zdroj pro dvě místa: Nastavení ho ukazuje jako rozbalovací blok a
// horní lišta (Layout.tsx → Hledat) ho nabízí odkudkoli přes „?“.
//
// Proč rozbalovací oddíly a ne jeden dlouhý text: čte se to na telefonu
// u linky. Souvislý text přes patnáct obrazovek se neroluje, ten se vzdá —
// takhle je vidět rozcestník a otevře se jen to, co je zrovna potřeba.

/** Jeden krok „klepni sem“: ikona přesně tak, jak ji uživatel uvidí, a kde ji najde. */
type Krok = { ikona: LucideIcon; co: string; kde: string };

type Oddil = {
  klic: string;
  nazev: string;
  ikona: LucideIcon;
  /** Jedna věta: k čemu ta část aplikace je. */
  kCemu: string;
  /** Konkrétní funkce a postupy. */
  body: { co: string; jak: string; klepni?: Krok[] }[];
  /** Obrázkový slovník: ikona a její význam (pro toho, kdo appku vidí poprvé). */
  ikony?: { ikona: LucideIcon; nazev: string; vyznam: string }[];
};

const ODDILY: Oddil[] = [
  {
    klic: 'zaciname',
    nazev: 'Začínáme — první spuštění',
    ikona: Rocket,
    kCemu: 'Návod od nuly: jak appku dostat do telefonu, přihlásit se a co která ikona znamená.',
    body: [
      {
        co: '1. Otevři odkaz z e-mailu',
        jak: 'V e-mailu od správce je odkaz na aplikaci — otevři ho v telefonu (Android: Chrome, iPhone: Safari). Nic se nestahuje z obchodu Google Play ani z App Store, aplikace běží v prohlížeči.',
      },
      {
        co: '2. Dej si ikonu na plochu — Android (Chrome)',
        jak: 'Otevři odkaz v Chromu a udělej tohle (nic se nestahuje z Google Play ani z App Store). Na ploše se objeví ikona se zajícem a aplikace se z ní otevírá na celou obrazovku.',
        klepni: [
          { ikona: EllipsisVertical, co: 'Klepni na tři svislé tečky', kde: 'Vpravo nahoře v Chromu (ikona ⋮).' },
          { ikona: DownloadIkona, co: 'Klepni na „Nainstalovat aplikaci“', kde: 'V rozbaleném menu; někdy se jmenuje „Přidat na plochu“.' },
          { ikona: CircleCheck, co: 'Potvrď „Nainstalovat“', kde: 'V okénku, které vyskočí. Ikona je pak na ploše telefonu.' },
        ],
      },
      {
        co: '2. Dej si ikonu na plochu — iPhone (Safari)',
        jak: 'Na iPhonu to jde jen v Safari (ne v Chromu). Otevři odkaz v Safari a udělej tohle.',
        klepni: [
          { ikona: Share, co: 'Klepni na Sdílet', kde: 'Dole uprostřed v Safari — čtvereček se šipkou nahoru.' },
          { ikona: SquarePlus, co: 'Klepni na „Přidat na plochu“', kde: 'Sjeď v nabídce trochu níž; ikona je čtvereček s plusem.' },
          { ikona: CircleCheck, co: 'Vpravo nahoře klepni na „Přidat“', kde: 'Ikona se zajícem je pak na ploše.' },
        ],
      },
      {
        co: '2. Dej si ikonu na plochu — počítač a později',
        jak: 'Na počítači (Chrome nebo Edge) klepni vpravo v adresním řádku na ikonku instalace (monitor se šipkou) → „Nainstalovat“. Kdykoli později to jde v aplikaci: Nastavení → „Instalace aplikace“ → tlačítko „Nainstalovat aplikaci na plochu“.',
      },
      {
        co: '3. První přihlášení — nastav si heslo',
        jak: 'Správce ti schválí e-mail a na něj přijde pozvánka s odkazem. Otevři ji v telefonu a klepni na odkaz — aplikace se ti rovnou otevře a nabídne „Založte si své heslo“. Vymysli si heslo (aspoň 6 znaků), ulož a jsi uvnitř. Příště se přihlásíš e-mailem a svým heslem. Pozvánka nedorazila? Podívej se do spamu, nebo na přihlašovací obrazovce klepni na „Zapomněl(a) jsem heslo / první přihlášení“ — pošle se ti nový odkaz. Odkaz platí krátce a jen jednou. Na svém telefonu zůstaneš přihlášený, neodhlašuj se, když nemusíš.',
        klepni: [
          { ikona: Mail, co: 'Otevři e-mail od správce', kde: 'Pozvánka do aplikace Pivovar Zajíc. Nedorazila? Podívej se do spamu.' },
          { ikona: Hand, co: 'Klepni na žluté tlačítko „Otevřít aplikaci a nastavit heslo“', kde: 'Aplikace se ti sama otevře.' },
          { ikona: KeyRound, co: 'Napiš si své heslo do obou polí', kde: 'Okno „Založte si své heslo“. Aspoň 6 znaků.' },
          { ikona: CircleCheck, co: 'Klepni na „Uložit heslo a pokračovat“', kde: 'Jsi uvnitř. Příště e-mail a tvoje heslo.' },
        ],
      },
      {
        co: '4. Kde to jsem: plocha',
        jak: 'Po přihlášení vidíš plochu s dlaždicemi (velká barevná tlačítka). Klepnutím se dlaždice otevře, tlačítko Zpět nebo klepnutí na Domů dole tě vrátí. Přejetím prstem do stran se listuje mezi třemi stránkami dlaždic. Nic se nerozbije — nejhorší, co se může stát, je, že omylem otevřeš jinou obrazovku.',
        klepni: [
          { ikona: LayoutGrid, co: 'Dlaždice = velká barevná tlačítka', kde: 'Klepnutím na dlaždici otevřeš obrazovku (Objednávky, Sklep, Fasování…).' },
          { ikona: Home, co: 'Domů — dole na liště', kde: 'Vždy tě vrátí na plochu s dlaždicemi.' },
          { ikona: Search, co: 'Lupa — hledání', kde: 'Najde odběratele, pivo i obrazovku.' },
          { ikona: Info, co: 'Info — tenhle návod', kde: 'Dlaždice na ploše; otevře návody ke všemu.' },
        ],
      },
      {
        co: '5. Jak se zapisuje (stejně všude)',
        jak: 'Vybereš pivo, obal (sud, lahev), napíšeš počet a klepneš na Uložit. Hotovo — zápis vidí hned všichni kolegové. Co jsi nestihl dopsat, zůstane rozepsané a neztratí se. Omylem uložený řádek jde v přehledu smazat nebo opravit; sklad se přepočítá sám.',
      },
      {
        co: '6. Co když nejde signál',
        jak: 'Ve sklepě je to normální. Zápis se uloží do telefonu a odešle se sám, až se signál vrátí. Zelená tečka vpravo nahoře = jsi online, červená = offline, modré „Čeká N změn“ = zápisy čekají na odeslání (klepnutím je pošleš hned).',
      },
      {
        co: 'Odpočty: časovač',
        jak: 'Dlaždice Časovač (ikona budíku): hotová tlačítka (kotel, chmelení…) i vlastní čas. Klepnutím se odpočet spustí a objeví se na ploše; když doběhne, zazvoní i při zamčeném telefonu. Stopky měří čas nahoru. U stáčení je ještě odpočet jednoho sudu.',
      },
      {
        co: 'Odpočty: odečítání ze skladu',
        jak: 'Sklad se mění sám, když něco zapíšeš: stáčení kusy PŘIČTE, objednávka po dni závozu je ODEČTE, Fasování, Prodejna a Odpis odečtou hned. Ve Skladu vidíš tři čísla: „Stav“ (je teď), „Odejde“ (objednávky, které ještě neodjely) a „Zbude“ (stav minus odejde). Žlutá karta s přesýpacími hodinami „Čeká na odpočet ze skladu“ znamená, že zavezená objednávka se ještě neodečetla — klepni na „Odečíst teď“. Normálně se odečte sama hned.',
      },
      {
        co: 'Zapomenuté heslo',
        jak: 'Na přihlašovací obrazovce klepni na „Zapomněl(a) jsem heslo / první přihlášení“, napiš svůj schválený e-mail a klepni na „Poslat odkaz do e-mailu“. V poště klepni na odkaz — aplikace se ti otevře a nastavíš si nové heslo. Nedorazilo to? Zkus spam, nebo požádej správce o „Znovu poslat pozvánku“ (případně o dočasné heslo).',
      },
      {
        co: 'Co když se spletu',
        jak: 'Nic nemaž naslepo. Špatný zápis oprav nebo smaž v přehledu (u řádku je tužka a koš) a zapiš správný. Když číslo ve Skladu nesedí, otevři Sklad → Pohyby: je tam každý pohyb po dnech a vidíš, kde se to rozešlo. Nevíš si rady? Napiš do „Zpětné vazby“ — vidí to správce.',
      },
    ],
    ikony: [
      { ikona: Home, nazev: 'Domů', vyznam: 'Spodní lišta, vpravo. Vrátí tě na plochu s dlaždicemi.' },
      { ikona: IkonaLahev, nazev: 'Lahve', vyznam: 'Stáčení piva do lahví a jeho přehled.' },
      { ikona: BarChart3, nazev: 'Sklad', vyznam: 'Kolik čeho je: sudy, lahve, pohyby po dnech.' },
      { ikona: ClipboardList, nazev: 'Objednávky', vyznam: 'Co si kdo objednal. Červené číslo = WhatsApp zprávy, které čekají na kontrolu.' },
      { ikona: Store, nazev: 'Fasování', vyznam: 'Pivo pro personál a do prodejny; zapisuje se, kdo si co vzal.' },
      { ikona: IkonaSud, nazev: 'KEG', vyznam: 'Stáčení do sudů, plán „co stočit na který den“, přefuk a řezání.' },
      { ikona: Search, nazev: 'Lupa', vyznam: 'Hledání odběratele, piva nebo obrazovky. Nahoře na telefonu.' },
      { ikona: Info, nazev: 'Info', vyznam: 'Tenhle návod. Dlaždice na ploše.' },
      { ikona: AlarmClock, nazev: 'Časovač', vyznam: 'Odpočty s alarmem a stopky.' },
      { ikona: Hourglass, nazev: 'Přesýpací hodiny', vyznam: 'Něco čeká na odečtení ze skladu — klepni na „Odečíst teď“.' },
      { ikona: Settings, nazev: 'Nastavení', vyznam: 'Velikost písma, upozornění, instalace na plochu, menu.' },
    ],
  },
  {
    klic: 'oaplikaci',
    nazev: 'O aplikaci',
    ikona: Info,
    kCemu: 'Co to je, kde jsou data a kam hlásit, když něco nesedí.',
    body: [
      {
        co: 'K čemu appka je',
        jak: 'Vede objednávky, sklad a výrobu pivovaru Zajíc na jednom místě — od stočení sudu po podpis při předání. Nahrazuje papíry a tabulky, ve kterých se to dřív vedlo každé zvlášť.',
      },
      {
        co: 'Verze',
        jak: `Teď máš v${APP_VERSION} z ${APP_VERSION_DATE}. Když vyjde nová, appka se ozve sama a nabídne „Aktualizovat"; jde ji vynutit i v Nastavení tlačítkem „Vynutit stažení nejnovější verze".`,
      },
      {
        co: 'Kde jsou data',
        jak: 'V jedné společné databázi, ne v telefonu. Co uložíš ty, vidí hned i ostatní — a naopak, jejich zápis se ti na obrazovce sám obnoví.',
      },
      {
        co: 'Záloha',
        jak: 'Objednávky a stáčení se každý den samy zálohují. Admin si navíc může stáhnout kopii k sobě (dlaždice „Stáhnout zálohu") — to je jediná kopie, která je mimo, takže ji stojí za to občas stáhnout.',
      },
      {
        co: 'Přepínání účtů (jen správce)',
        jak: 'Nastavení → „Přepínání účtů“ → „Přidat účet do přepínače“: napiš e-mail a heslo druhého účtu (třeba běžného uživatele). Heslo se neukládá, aplikace si jen pamatuje přihlášení v tomhle zařízení. Pak u účtu klepni na „Přepnout“ — aplikace se načte jako ten účet. Nahoře svítí červený pruh a „Zpět na správce“ tě vrátí. Hodí se na kontrolu, co a jak vidí běžný uživatel.',
      },
      {
        co: 'Zajíc 2 — druhá aplikace s jiným účtem',
        jak: 'Nastavení → „Zajíc 2“ → „Otevřít Zajíc 2“, přihlas se jiným účtem a dej si ji na plochu (ikona je zajíc s červenou 2). Hlavní aplikace zůstane přihlášená jako správce, Zajíc 2 má přihlášení zvlášť — hodí se na kontrolu, co a jak vidí běžný uživatel. Nahoře svítí červený štítek, pod kterým účtem jsi.',
      },
      {
        co: 'Funguje i bez signálu',
        jak: 'Ve sklepě a na cestě se zápis uloží do telefonu a odešle se, jakmile je signál. Appka to u takového zápisu napíše, takže se nestane, že si myslíš, že je uložený, a přitom čeká.',
      },
      {
        co: 'Na telefon jde přidat na plochu',
        jak: 'V Nastavení → „Instalace aplikace“ (nebo přes nabídku prohlížeče „Přidat na plochu“) — ikona se přidá rovnou z prohlížeče, ne z obchodu Google Play. Pak se otevírá jako běžná aplikace, na celou obrazovku a bez adresního řádku. Postup krok za krokem je v oddílu „Začínáme“.',
      },
      {
        co: 'Když něco nesedí',
        jak: 'Napiš to do Zpětné vazby (Nástroje → Zpětná vazba). Vidí to všichni kolegové a nezapadne to. U chyby pomůže napsat, na které obrazovce byla a co jsi zrovna dělal.',
      },
      {
        co: 'Kdo co smí',
        jak: 'Práva nastavuje admin v Uživatelích — podle nich se lidem ukazují jen obrazovky, které mají mít. Návod a tenhle přehled vidí každý.',
      },
    ],
  },
  {
    klic: 'plocha',
    nazev: 'Plocha a ovládání',
    ikona: LayoutGrid,
    kCemu: 'Úvodní obrazovka s dlaždicemi — odsud se chodí všude.',
    body: [
      {
        co: 'Tři stránky dlaždic',
        jak: 'Přejeď prstem do stran. Prostřední je „Stáčení a objednávky“ (to, na co se sahá denně), vlevo „Výpočty a přehledy“, vpravo „Ostatní“.',
      },
      {
        co: 'Výchozí plocha',
        jak: 'Kdo si plochu ještě nepřizpůsobil, má ji stejnou, jako ji má správce — stejné barvy, velikosti a rozložení. Ukážou se jen dlaždice, na které máš právo; zbytek se srovná, aby nezůstaly díry. Jakmile s plochou pohneš, je tvoje a už se nemění. „Obnovit výchozí rozložení“ ji vrátí.',
      },
      {
        co: 'Přerovnat si plochu',
        jak: 'PODRŽ prst na dlaždici (zavibruje, jakmile ji máš „v ruce") a teprve pak táhni — i na jinou stránku. Samotné přejetí dlaždicí nehne, tím se listuje. Přes ozubené kolečko se mění barva a velikost. Rozložení je uložené jen v tomhle telefonu.',
      },
      {
        co: 'Spodní lišta',
        jak: 'Objednávky, KEG, Lahve a Domů jsou vždycky po ruce. Červené číslo u Objednávek = tolik WhatsApp zpráv čeká na kontrolu.',
      },
      {
        co: 'Hledání a nápověda',
        jak: 'Lupa nahoře hledá odběratele, piva i obrazovky. Vedle ní je „?“ — otevře tenhle návod odkudkoli.',
      },
      {
        co: 'Dlaždice Info',
        jak: 'Dlaždice „Info" na ploše (a „?" vedle lupy) otevře tenhle text — návody ke všem funkcím i údaje o aplikaci. Klepni na oddíl a rozbalí se, co v něm která věc dělá.',
      },
      {
        co: 'Tlačítko Zpět',
        jak: 'Zavře otevřené okno, ne celou obrazovku. Rozepsaná práce se tím neztratí.',
      },
    ],
  },
  {
    klic: 'kegy',
    nazev: 'Stáčení KEG',
    ikona: IkonaSud as unknown as LucideIcon,
    kCemu: 'Zápis stočených sudů a plán, co se má který den stočit.',
    body: [
      {
        co: 'Začátek stáčení',
        jak: 'Vyber pivo dlaždicí, obal a počet kusů. Uložit. Před prvním stáčením dne se prokliká Příprava (Checklist) — zapíše se do sanitačního deníku.',
      },
      {
        co: 'Limonády (Citron, Grep…)',
        jak: 'Limonáda nemá tank. Stáčí se bez něj, do skladu se zapíše normálně a appka ji nikde nehlásí jako „Stáčení bez tanku“ (ani v Auditu, ani ve Sklepě).',
      },
      {
        co: 'Konec stáčení (Checklist)',
        jak: 'Po stáčení se prokliká úklid — i ten jde do sanitačního deníku. Musí být vyplněný každý den, kdy se stáčelo. Když v 16:00 chybí, přijde upozornění na telefon; když v 18:00 pořád chybí, přijde znovu a klepnutím se rovnou otevře tabulka k vyplnění.',
      },
      {
        co: 'Přehled',
        jak: 'Všechny záznamy za den, týden nebo měsíc. Nahoře je počet záznamů i celkový počet kusů. U řádku jde počet opravit (tužka nebo − / +) nebo ho smazat křížkem.',
      },
      {
        co: 'Co stočit na který den',
        jak: 'Tabule podle dnů závozu: kolik je objednáno, kolik hotovo, kolik chybí. Klepni na den nahoře a vidíš jen ten.',
      },
      {
        co: 'Zbývá stočit po sudech',
        jak: 'Nad seznamem je součet podle VELIKOSTI sudu (50l 18, 30l 24…) — podle toho se chystají prázdné sudy. Velikosti, které jsou hotové, se nevypisují.',
      },
      {
        co: 'Z čeho je číslo „hotovo“',
        jak: 'Pod položkou se píše „z toho X nachystáno/zavezeno · Y ze zásoby skladem“. Pozor: nachystané kusy se z té zásoby VZALY, nepřičítají se k ní. A „ze zásoby skladem“ neznamená, že se stočilo tenhle týden — může to být i starší zásoba nebo počáteční stav z inventury.',
      },
      {
        co: 'Přihrádka „Bez termínu“',
        jak: 'Objednávky, u kterých není uvedený den dovozu. Appka je nehádá na dnešek — doplň den v Objednávkách a přeskočí, kam patří.',
      },
      {
        co: 'Kapka „Stočeno" u objednávky zápis ZALOŽÍ',
        jak: 'Zaškrtnutí kapky u položky objednávky (jen u sudů) rovnou založí záznam ve stáčení, ať se totéž nepíše dvakrát. V seznamu záznamů je takový řádek označený „Založeno zaškrtnutím Stočeno u objednávky" — podle toho poznáš, že ho appka napsala sama.',
      },
      {
        co: 'Řezání piva (tank A + tank B + sudy ze skladu)',
        jak: 'Tlačítko „Řezání“ ve stáčení: vybereš tank A, tank B, poměr a kolik sudů se stočilo — litry se z tanků odečtou podle poměru. Když část piva do řezu nešla z tanku, ale z hotových sudů na skladě (třeba 1× 30 l, 1× 20 l a 1× 15 l desítky), vyplň „Sudy ze skladu do podílu B“: vyber pivo a počty sudů. Jejich litry se počítají do podílu B (tank B pak může zůstat prázdný, nebo pokryje jen zbytek) a sudy se ze skladu odečtou — ve Skladu i Pohybech je uvidíš jako přefuk „do řezu“. Když sklad na tolik sudů nestačí, appka se zeptá. Smazáním prvního řádku řezu ve stáčení se sudy vrátí na sklad. U řádků, ke kterým jsou sudy navázané, nejde měnit počet ani obal — smaž řádek a zapiš řez znovu.',
      },
      {
        co: 'Rozepsané se neztratí',
        jak: 'Co jsi zadal a neuložil, zůstává v telefonu — i když odejdeš z obrazovky, zavřeš dlaždici nebo ti appku něco vypne. Po návratu se řádky vrátí a nahoře svítí modrý pruh „Rozepsaný zápis je zpátky“. Zmizí, až zápis uložíš, nebo ho zahodíš tlačítkem „Zahodit“ či „Vymazat vše“ (appka se napřed zeptá).',
      },
      {
        co: 'Odškrtávátko v PLÁNU stáčení nezapisuje',
        jak: 'Fajfky v plánu jsou jen pracovní pomůcka pro stáčeče. Skutečný zápis se dělá v „Začátek stáčení“, jinak by vznikl dvojí záznam.',
      },
    ],
  },
  {
    klic: 'lahve',
    nazev: 'Stáčení lahví',
    ikona: IkonaLahev as unknown as LucideIcon,
    kCemu: 'Totéž co KEG, jen pro lahve a PET — včetně plánu po dnech.',
    body: [
      { co: 'Zápis stáčení', jak: 'Stejný postup jako u sudů: pivo, obal, počet, uložit. Zavření dlaždice (křížek, „Zavřít a nechat rozepsané“, klepnutí vedle) zadané nezahodí — řádek zůstane v zápisu dole a uloží se až fajfkou nebo tlačítkem „Uložit stáčení lahví“.' },
      {
        co: 'Přehled po dnech',
        jak: 'Každý den má svůj pás („Pondělí 12. 10.“, vpravo kusy a litry za celý den) a pod ním tabulku jako v exportu do Excelu: řádek je jedno stáčení, sloupce jsou Z sudů (50, 30, 20, 15, 10 l) a Stočeno lahví (1,5, 1,0, 0,5, 0,33 l). Pod řádkem je vidět, kolik se stočilo z kolika litrů a jaká je výtrata — červená, když nevychází (záporná nebo moc vysoká). Číslo v buňce se přepíše: klepni, napiš, Enter. Prázdné políčko nebo nula záznam smaže (s „Vrátit zpět“). Číslo napsané do jiné velikosti sudu sudy do té velikosti přesune; druhý sud jiné velikosti je „Další sud“ v podrobnostech. Klepnutí na název piva otevře podrobnosti: záznamy (− / +, tužka, křížek), změnu dne a piva a smazání celého řádku. Na telefonu jsou vidět jen použité sloupce, ostatní po „Všechny sloupce“. Řádek, kde chybí velikost sudu, svítí červeně — velikost doplníš klepnutím do sloupce té správné. Filtry piva a obalu jsou na telefonu pod tlačítkem „Filtry“.',
      },
      { co: 'Plán po dnech', jak: 'Tatáž tabule „Co stočit na který den“ včetně rozpadu po obalech.' },
      {
        co: 'Sklo, etikety, podtácky',
        jak: 'Vlastní záložka na obalový materiál: nákupy a spotřeba. Korunky a PET víčka se odečítají zvlášť — jedna zavřená lahev = jedna závěrka.',
      },
      {
        co: 'Plán stáčení',
        jak: 'Samostatná obrazovka: kolik chybí stočit proti tomu, co je objednané. Založí úkol, který se pak sám nabídne v zápisu stáčení.',
      },
    ],
  },
  {
    klic: 'objednavky',
    nazev: 'Objednávky',
    ikona: ClipboardList,
    kCemu: 'Evidence objednávek od zadání po podpis při předání.',
    body: [
      {
        co: 'Pět způsobů zadání',
        jak: 'Klepni na tlačítko Odběratel — v okně ho napiš (seznam se při psaní zúží na odpovídající odběratele), nebo vyber z tlačítek: nahoře jsou Nejčastější, pod nimi všichni podle abecedy s nadpisy písmen a lištou písmen na rychlý skok (třeba M → Martin). Pak piva dlaždicemi, nebo vložením textu, z WhatsApp zprávy či vyfocením papíru. Bez závozu a Stočit dnes jsou pod pivy.',
      },
      {
        co: 'Kontrola WhatsApp zpráv',
        jak: 'Zelená dlaždice bliká, když zpráva čeká. V kontrole je vidět originál vedle toho, co z něj AI přečetla; položky se dají opravit a oprava se zapamatuje pro příště.',
      },
      {
        co: 'Přídavek k objednávce',
        jak: 'Zpráva typu „Pro Radka ještě plus toto“ nabídne objednávky toho odběratele kolem dneška — tlačítkem „Přidat k téhle“ se položky PŘIČTOU místo založení druhé objednávky.',
      },
      {
        co: 'Úprava objednávky zprávou',
        jak: 'Zpráva typu „Ty malé soudky budou 2×20l“ přepíše jen jmenované skupiny obalů; o čem zpráva nemluví (nebo říká „sedí“), zůstane.',
      },
      {
        co: 'Duplicita',
        jak: 'Před uložením objednávky (ručně, z fotky, z WhatsAppu i „To co posledně“) appka zkontroluje, jestli stejný odběratel nemá stejnou objednávku — ve stejný den, nebo celou stejnou v témže týdnu. Když ano, ukáže ji (kdy a jak byla zadaná) a zeptá se: Nezakládat / Přesto vytvořit; u zprávy z WhatsAppu i Ignorovat zprávu. Zavřít okno = nezaložit nic. Totéž při přidání položky do uložené objednávky (ručně i z fotky): když tam pivo v tom obalu už je, appka se zeptá, než ho přidá podruhé. Druhá objednávka by totiž sklad odečetla podruhé.',
      },
      {
        co: 'Smazání řádku, který už odjel',
        jak: 'Křížek u položky, která je už zavezená a odepsaná ze skladu, se zeptá „Smazat i s odpočtem“ — sklad se vrátí o ty kusy, jako by řádek v objednávce nikdy nebyl (hodí se na řádek, který tam je omylem dvakrát). Jde to jen u odpočtu z tohoto týdne; starší odpočet zůstává, aby se nerozházela uzavřená inventura — tam zruš celou objednávku (kusy se vrátí dnešním dnem) nebo použij Vrácení piva.',
      },
      {
        co: 'Odznak „Ke konci týdne chybí“',
        jak: 'Neříká „na tuhle objednávku nemám pivo“, ale že ta kombinace piva a obalu je ke konci týdne závozu v mínusu — přes všechny pohyby toho týdne. U zavezených objednávek se neukazuje.',
      },
      {
        co: 'Karta odběratele a „To co posledně“',
        jak: 'Když vyfiltruješ jednoho odběratele, ukáže se, kdy bral naposledy, jak často bere a co nejvíc. Tlačítko založí novou objednávku se stejnými položkami jako minule.',
      },
      {
        co: 'Přehled na úvodní stránce',
        jak: 'Úplně nahoře na ploše jsou ležácké tanky 1–8 (pivo v barvě z nastavení piv, hl a pruh plnosti) — klepnutí otevře Sklep. Pod nimi okno „Co stočit" — po otevření je sbalené na jeden řádek s počty, klepnutím se rozbalí. Ukazuje celý týden; klepnutý den si pamatuje, dokud nevybereš jiný, a den dalšího závozu je šedý s autíčkem. Přehled nakládky — okno Nakládka závoz (tabulka jako Co stočit: řádek = pivo, sloupce = obaly, kusy na nejbližší závoz; klepnutím na nadpis se sbalí) — si dáš na plochu zaškrtnutím „Přehled na plochu" v Rozvozu (vedle „Skrýt zavezené"), nebo přes úpravu plochy → Přidat dlaždici — tlačítko „Otevřít rozvoz“ otevře Rozvoz rovnou na „Co naložit do auta" pro ten den.',
      },
      {
        co: 'Malé sudy',
        jak: 'Dlaždice Malé sudy (a záložka v Objednávkách) — naklikáš, kolik máš prázdných KEG 20, 15 a 10 l. Počet platí do neděle a ubývá o sudy objednávek, které od zadání odjely (pod číslem je napsané odkud). Při zadání i úpravě objednávky pak u malého sudu uvidíš „můžeš dát max N“; co je navíc a nemá sud, svítí červeně. Dlaždice na ploše ukazuje, kolik sudů je ještě volných.',
      },
      {
        co: 'Přehled stáčení KEG jako tabulka',
        jak: 'Stáčení KEG → Přehled je ve stejném stylu jako přehled lahví: každý den má pás („Pondělí 12. 10." a součet kusů a litrů), pod ním tabulku — řádek je pivo v barvě piva, sloupce jsou velikosti sudů (50 · 30 · 20 · 15 · 10 l; prázdné se nekreslí), dole Celkem. Pod řádkem je, kolik litrů se stočilo, z kolika litrů z tanku a jaká byla výtrata (jen když je objem z tanku znám u všech záznamů dávky). Číslo v buňce přepíšeš klepnutím (Enter uloží); klepnutí na název piva otevře záznamy po jednom (úprava, ±1 sud, smazání).',
      },
      {
        co: 'Přehled objednávek jako tabulka',
        jak: 'V Objednávkách je pod vyhledáváním přepínač Karty / Tabulka (pamatuje si volbu). Tabulka dává objednávku na jeden řádek — odběratel, den, položky, stav. Klepnutí na řádek ho rozbalí do původní karty se všemi funkcemi (úprava, odbavení, WhatsApp, smazání…), zaškrtávátko na začátku řádku vybírá objednávku bez rozbalení. Filtry, seskupení i hledání fungují stejně jako u karet.',
      },
      {
        co: 'Řezání „jen odečíst"',
        jak: 'Když sudy z řezu už máš zapsané zvlášť (běžným stáčením), zaškrtni v Řezání „Sudy z řezu už mám zapsané jinde". Řez pak jen odečte pivo z tanků (a sudy ze skladu), do skladu nic nepřičte. Počty sudů slouží jen k výpočtu litrů. Odečet se nevrací sám — smaže se ručně (Sklep → přetočení „Do řezu", Přefuk).',
      },
      {
        co: 'Přefuk „do řezu"',
        jak: 'Šlo-li pivo do řezu z hotových sudů na skladě místo z tanku a nezapsalo se to při stáčení, doplníš to dodatečně: Stáčení KEG → Přefuk KEG, vyber pivo a sud „ZE", u „DO sudů" zaškrtni „Do řezu (nic se nepřičte)" a ulož. Sudy se jen odečtou ze skladu; každá velikost sudu je samostatný zápis. V historii přefuků je u nich „do řezu" a jdou smazat.',
      },
      {
        co: 'Víc dnů závozu z jedné fotky',
        jak: 'V kontrole čtení objednávky z fotky je nahoře „Den závozu" pro celou fotku (Po–Pá nebo datum) a u každé položky výběr „Den závozu" — ve výchozím stavu „Společný den". Vybereš-li u položky jiný den (i víkend nebo den, který už proběhl), uloží se jako samostatná objednávka na ten den; Restaurace na úterý a na čtvrtek jsou dvě objednávky. Dole appka před uložením napíše, kolik objednávek z fotky vznikne a na které dny. Závoz, který už proběhl, se po uložení hned odečte ze skladu — appka na to upozorní. Má-li řádek v textu napsaný den („v úterý", „na čtvrtek"), předvyplní se u něj sám (nejbližší takový den); den napsaný zvlášť v záhlaví nad řádky appka nepozná, ten vyber ručně. Do už uložené objednávky se den nevybírá, položky jdou do ní.',
      },
      {
        co: 'Oříznout fotku',
        jak: 'Při čtení z fotky (objednávky, stáčení lahví a KEG, prodejna) je na liště nad fotkou tlačítko „✂️ Oříznout" — ořízneš nebo otočíš fotku a appka ji přečte znovu (u objednávky nahradí položky z té fotky, ručně přidané zůstanou). Tlačítko „Oříznout fotku" u fotoaparátu zapne ořez ještě před prvním čtením; volba se pamatuje v telefonu.',
      },
      {
        co: 'Tabulka z Excelu — číst od data',
        jak: 'Ve stáčení lahví (a volitelně ve stáčení KEG a ve výdeji) je nad tlačítky fotky přepínač „Seznam / zpráva" ↔ „Tabulka z Excelu". U tabulky (Datum, Pivo, sudy 50–10 l, lahve 1,5–0,33 l) zadáš „Číst od data" — výchozí je den po posledním zápisu v appce — a appka přečte jen řádky od toho dne. Fotku ořezávat nemusíš: ořízne a zvětší se sama. Datum v tabulce platí i pro prázdná políčka pod ním, dokud se neobjeví další. Je-li od zadaného data víc dnů, vloží se všechny najednou — každý řádek na svůj den, který jde u řádku přepsat (tlačítka s dny výběr jen zúží). Ve stáčení lahví jdou řádky do tabulky; ve stáčení KEG a ve Fasování / Prodejně / Odpisu se z víc dnů objeví pod zápisem seznam „Řádky z fotky po dnech" (jde v něm opravit počet nebo řádek odstranit) a uloží se spolu se zápisem jeho tlačítkem, každý řádek na svůj den; z jednoho dne jdou řádky do zápisu jako dřív. Jeden řádek tabulky je jedna dávka: sud nebo dva, počet sudů a až čtyři druhy lahví (1,5 / 1 / 0,5 / 0,33 l) — všechny se zapíšou se stejným sudem. Řádky z fotky se přidají k tomu, co už je rozepsané, a před uložením se appka zeptá, když na ten den a pivo už ve stáčení něco je (u KEG a výdeje: když na ten den, pivo a obal už něco zapsané je). U každého řádku je číslo řádku z excelu, litry stočené proti sudu a výtrata — když čísla nesedí, ukáže se varování. Prázdné pivo v tabulce zůstane prázdné, vybereš ho sám.',
      },
      {
        co: 'Rozbor',
        jak: 'Žlutá dlaždice Rozbor na ploše otevře Sklad → Pohyby na celém aktuálním měsíci od 1. dne (každý pohyb: stočeno, závozy, fasování, odpisy, přefuky; filtr piva, obalu a druhu pohybu). Tlačítky „Jen týden“ nad pohyby vybereš jediný týden měsíce. Nahoře je tabulka po položkách (na začátku, stočeno, závozy, fasování, akce, odpisy, ostatní, konec); když vybereš jedno pivo a obal, pod ní je tabulka den po dni se součty a stavem na konci dne; pod datem je napsáno, komu se ten den vydalo (odběratel u závozu, jinak druh pohybu, např. Fasování personál). Starší přehled Rozbor (menu → Výroba) zůstává: všechny položky objednané tento týden (obj. N · stočit N, případně mínus ve skladu). Nahoře se přepíná Týden / Měsíc (měsíc se listuje šipkami; stoč. a obj. jsou za celý měsíc, sklad je stav teď) a vybírá odběratel: u něj se ukáže jen to, co objednal v daném týdnu nebo měsíci — stočeno a sklad se u odběratele neukazují, protože se stáčí do zásoby, ne pro odběratele. Klepnutí na položku otevře Sklad → Pohyby toho piva a obalu za týden (u měsíce za celý měsíc): co se stočilo, co odjelo v závozech, vrácení a inventury. Období a pivo jdou v Pohybech přepnout.',
      },
      {
        co: 'Dva závozy za den, Sudy / Lahve v nakládce',
        jak: 'V Rozvozu má každá objednávka tlačítka „1. závoz" / „2. závoz" a výběr „Přesunout na…" jiný den týdne (posune se i datum). Když má den něco ve 2. závozu, nahoře se objeví přepínač Oba / 1. závoz / 2. závoz — podle něj se filtruje trasa i Co naložit. Přepínač Sudy / Lahve / Vše nahoře platí pro trasy i Co naložit; volba se pamatuje v telefonu, takže kdo chystá lahve, vidí jen lahve. 1. / 2. závoz jde nastavit i v Objednávkách (tlačítka „1.z" / „2.z" vedle dnů). Při čtení objednávky z WhatsAppu nebo z fotky jsou nahoře tlačítka Po–Pá — den závozu se vybere hned (nejbližší takový den).',
      },
      {
        co: 'Hlídání při zadávání a ranní úklid',
        jak: 'Při čtení objednávky z WhatsAppu nebo fotky appka zná zvyklosti odběratele: předvyplní 2. závoz, jezdí-li jím, a u položky s neobvykle vysokým množstvím ukáže „obvykle N× — zkontroluj". Den ani datum závozu si nikdy nedomýšlí: platí jen to, co je ve zprávě nebo co vybereš rukou (když zpráva den neuvede, zůstane „nevybráno"). Když by objednávka spadla do minulého týdne, appka se před uložením zeptá. Objednávky se závozem v minulosti se berou jako zavezené (každou noc se samy odškrtnou) — co nejelo, se smaže nebo řeší přes Vrácení.',
      },
      {
        co: 'Rozvoz a podpis',
        jak: 'V Rozvozu se objednávky odškrtávají po dnech. „Podpis převzetí“ (v Rozvozu i v detailu objednávky) rovnou označí objednávku jako zavezenou.',
      },
    ],
  },
  {
    klic: 'vydeje',
    nazev: 'Fasování, Prodejna, Odpis',
    ikona: Store,
    kCemu: 'Tři podoby výdeje ze skladu — stejný formulář, jiná tabulka.',
    body: [
      { co: 'Fasování', jak: 'Pivo pro personál. Zapisuje se kdo si bere. Rozepsaný výdej se pamatuje zvlášť pro Fasování, Prodejnu a Odpis a zůstává, dokud ho neuložíš nebo nezahodíš.' },
      { co: 'Prodejna', jak: 'Prodej na podnikové prodejně. V Přehledu je dnešek, týden i měsíc a co jde nejvíc.' },
      { co: 'Odpis', jak: 'Zkažené, rozbité, prošlé. Dá se připojit fotka jako doklad k reklamaci.' },
      {
        co: 'Vrátit na sklad',
        jak: 'Přepínačem „Vrácení“ se zápis obrátí — pivo se přičte zpátky. Po uložení se přepínač sám vypne, aby další zápis omylem nepřičítal.',
      },
      {
        co: 'Vrátit zpět',
        jak: 'Hned po uložení se nabídne „Vrátit zpět“. Maže přesně to, co se právě uložilo, i kdyby někdo zapsal totéž ve stejnou chvíli.',
      },
    ],
  },
  {
    klic: 'obchod',
    nazev: 'Obchod',
    ikona: ShoppingBag,
    kCemu: 'Všechno o podnikové prodejně na jednom místě — vlastní sklad obchodu, uzávěrky z pokladny, fasování, inventura a statistiky.',
    body: [
      {
        co: 'Sklad obchodu',
        jak: 'Obchod má vlastní sklad — nejsou v něm jen piva, ale i ostatní zboží. Stav se nikde neukládá, počítá se: poslední inventura + fasování z pivovaru + příjem − prodej z uzávěrek − odpis. Zboží, které ještě nemá inventuru, ukazuje „bez inventury“, ne nulu.',
      },
      {
        co: 'Uzávěrka z pokladny',
        jak: 'V záložce Uzávěrky zvol Denní, Týdenní nebo Měsíční a vyfoť účtenku „Sumář prodeje“. Appka přečte zboží a množství, zkontroluje, že kusy × cena sedí na částku i na „Celkem“, a teprve potom jde uložit. Co nesedí, je vidět u řádku, i s nabídkou „Podle částky je to N ks“.',
      },
      {
        co: 'Přidat zboží dlaždicemi',
        jak: 'Ve Skladu „Přidat zboží“: nejdřív skupina (Piva, Půllitry, Kosmetika, Ostatní), v ní dlaždice zboží — klepáním se jich vybere víc a „Přidat vybrané“ je přidá najednou. Je tu připravené zboží z účtenky „Sumář prodeje“ (kód z pokladny, název a cena). U piva je vidět, ke kterému pivu a obalu se přiřadí; kdo v katalogu piv a obalů chybí, má dlaždici šedou a řekne proč. Co v nabídce není, jde přidat ručně přes „Jiné zboží“.',
      },
      {
        co: 'Nové zboží z pokladny',
        jak: 'Když je v uzávěrce kód, který appka nezná, navrhne k němu pivo a obal. Navržené spojení musíš jednou potvrdit (nebo zvolit „ostatní zboží“) — pak si ho pamatuje a příště už se neptá.',
      },
      {
        co: 'Fasování do obchodu',
        jak: 'Záložka Fasování je stávající „Fasování → Prodejna“. Co se tam nafasuje ze skladu pivovaru, odečte se ze skladu pivovaru a přičte do skladu obchodu (u piv a obalů, ke kterým je zboží spárované).',
      },
      {
        co: 'Inventura na konci měsíce',
        jak: 'V záložce Inventura napočítáš, co je na regálu; „Sedí“ doplní očekávaný stav. První inventura je počáteční stav obchodu. Rozdíl proti očekávanému stavu se ukáže před uložením a zůstane v historii. Konec měsíce a první dny dalšího to appka připomene nahoře ve Skladu obchodu.',
      },
      {
        co: 'Hlídání zásob',
        jak: 'U zboží si v rozbaleném řádku nastavíš minimum. Pod ním, na nule nebo do mínusu se zboží ukáže nahoře ve Skladu s upozorněním. Mínus obvykle znamená, že chybí fasování nebo příjem.',
      },
      {
        co: 'Statistika',
        jak: 'Tržba po dnech, týdnech a měsících, prodej po pivech v litrech a nejprodávanější zboží — vše z uzávěrek. Prodej se připisuje ke konci období uzávěrky.',
      },
      {
        co: 'Odpis zboží',
        jak: 'Rozbitá láhev, prošlé zboží, ztráta: ve Skladu tlačítko „Odpis“ (nahoře, nebo v rozbaleném zboží). Zvol důvod a kusy — odečte se ze skladu obchodu. Pivo z pivovaru se tím nevrací, to se odečetlo už Fasováním. Omylem zapsaný odpis nebo příjem jde smazat v „Posledních pohybech“ zboží.',
      },
      {
        co: 'Uzávěrka přes inventuru',
        jak: 'Inventura na konci měsíce a týdenní uzávěrka, která začíná před ní a končí po ní (třeba týden 26. 10.–1. 11. a inventura 31. 10.): prodej do inventury už je v napočítaném stavu a odečetl by se podruhé. Appka to pozná, napíše nahoře ve Skladu, u Inventury i při zadávání uzávěrky a bez tvého souhlasu ji neuloží. Správně: za ty dny zadat denní uzávěrky, nebo dělat inventuru k poslednímu dni uzávěrky.',
      },
      {
        co: 'Chybějící uzávěrky',
        jak: 'Chybí-li uzávěrka za nějaké dny, sklad obchodu ukazuje víc, než je na regálu — appka to napíše nahoře ve Skladu i v Uzávěrkách. Tam u každé mezery zvolíš „Zadat uzávěrku“, nebo „Zavřeno“, když se ten den neprodávalo (neděle, svátek). Označení jde zase zrušit. Hlídá se posledních asi dva měsíce a dnešek se nepočítá, uzávěrka se dělá večer.',
      },
      {
        co: 'Odznak na dlaždici',
        jak: 'Na dlaždici Obchod na ploše je číslo se znakem ⚠ — kolik věcí čeká: zboží pod minimem nebo v mínusu, chybějící uzávěrky, fasování bez zboží a chybějící inventura. Co přesně, uvidíš po otevření dlaždice.',
      },
      {
        co: 'Smazání uzávěrky',
        jak: 'Smazáním uzávěrky se prodané kusy vrátí do skladu obchodu. Překrývající se období stejné pokladny appka nepustí, aby se prodej neodečetl dvakrát.',
      },
    ],
  },
  {
    klic: 'sklad',
    nazev: 'Sklad, Sklep, Inventura',
    ikona: BarChart3,
    kCemu: 'Kolik čeho je, co zraje v tancích a měsíční uzávěrka.',
    body: [
      {
        co: 'Sklad',
        jak: 'Aktuální stav po pivech a obalech. Sloupce: Obal / Stav / Odejde / Zbude. Místo „0 (−10)“ se píše „chybí 10“.',
      },
      {
        co: 'Sklad → Pohyby',
        jak: 'Každý pohyb ve vybraném týdnu den po dni: stočeno, závozy s odběratelem, fasování, odpisy, inventura. Filtr pivo / obal / druh pohybu. Pod každým dnem „Stav večer“ — stejné číslo jako Sklad. Když fyzický stav nesedí, hledejte první den, kdy se stav večer od skutečnosti odchýlil.',
      },
      {
        co: 'Sklep a tanky',
        jak: 'Kvasné tanky na spilce a ležácké tanky, průběh kvašení a varné listy. U tanku je vidět, na kolik sudů zbývající objem vyjde.',
      },
      {
        co: 'Inventura',
        jak: 'Zadává se na konci měsíce. „Spočítat z fotek“ přečte napsané počty z fotky papíru. „Schválit & převést“ stavy uzamkne a přenese do počátečního stavu dalšího měsíce — to je krok, který nejde vzít zpět.',
      },
      {
        co: 'Týdenní inventura a její hodnota',
        jak: 'Na každém řádku je „Čeká se“, ty napíšeš „Napočítáno“ a vyjde rozdíl. Pod počty je rámeček Hodnota napočítaného v Kč a Rozdíl proti skladu (přebytky minus manka); u každého přebytku a manka je i jeho částka. Cena je z Ceníku (Číselníky) platná ke dni počítání; kde v ceníku chybí, počítá se orientačně podle velikosti obalu (sud 1 500 Kč, velká lahev 250 Kč, malá 45 Kč — stejně jako v měsíční inventuře) a rámeček to napíše. Počítají se jen řádky, které už jsi napočítal, a jen ty, které jsou vidět (přepínač Vše / Lahve / Sudy). Je to prodejní cena, ne nákladová — slouží k představě, jak velký rozdíl je, ne jako účetní hodnota.',
      },
      {
        co: 'Rozpad piva',
        jak: 'Každý pohyb jednoho piva za libovolné období — odkud se vzalo a kam šlo. Tohle je místo, kde se dohledává, proč nějaké číslo nesedí.',
      },
      {
        co: 'Systém',
        jak: 'Dlaždice Systém (odkaz je i v Nastavení) sdružuje všechny kontroly. Hloubkový audit se pouští za týden nebo měsíc a mimo jiné porovná objednávky z WhatsAppu se zprávami (tmavé zapsané jako světlé svítí červeně). Adminovi je úplně nahoře blok Databázové migrace (po nasazení tlačítko „Spustit“). Dál jsou tam audit objednávek, příjem WhatsAppu, Inventura vs. Sklad a pro admina Diagnostika a historie změn.',
      },
    ],
  },
  {
    klic: 'prehledy',
    nazev: 'Statistika a export',
    ikona: FileSpreadsheet,
    kCemu: 'Čísla za období a sešit do Excelu.',
    body: [
      { co: 'Statistika', jak: 'Výstav po pivech a obalech, grafy za zvolené období.' },
      {
        co: 'Export do Excelu',
        jak: 'U každého listu je zaškrtávátko — dá se stáhnout jen KEG nebo jen Lahve. Záporné řádky (ruční opravy přepočtu) se ve výchozím stavu vynechávají.',
      },
      {
        co: 'Načíst z Excelu',
        jak: 'Pro sešity, do kterých zapisuje kolega mimo appku (evidence mimo appku). „Načíst přímo z Disku" stáhne soubor automaticky (jednou nastavený servisní účet appky), nebo ho nahraj ručně. Nahoře v náhledu vybereš, které dny načíst (Včera — výchozí, Dnes, Tento týden, Tento měsíc, Od – do, Vše) — starší historie ze souboru se nezapíše. Appka ukáže, co jde zapsat rovnou a co potřebuje kontrolu, a zapíše teprve po potvrzení. Druhé nahrání/načtení stejného souboru přidá jen nové řádky.',
      },
    ],
  },
  {
    klic: 'nastroje',
    nazev: 'Kalkulačky a časovače',
    ikona: FlaskConical,
    kCemu: 'Pomůcky při vaření a stáčení.',
    body: [
      { co: 'Časovač a stopky', jak: 'Odpočet s alarmem (kotel, chmelení) a stopky s mezičasy. Alarm zazvoní i při zamčeném telefonu.' },
      { co: 'Stočení sudu', jak: 'Odpočet přímo pro stáčení jednoho sudu.' },
      {
        co: 'Kalkulačky',
        jak: 'Dlaždice Kalkulačky (Nástroje): kolik sudů vyjde z množství v tanku, ředění sanitační chemie a převod jednotek.',
      },
    ],
  },
  {
    klic: 'bible',
    nazev: 'Pivovarská bible',
    ikona: BookOpen,
    kCemu: 'Odborná knihovna pivovarské literatury a AI sládek, který odpovídá jen z nahraných a zpracovaných knih — s citací knihy, kapitoly a strany.',
    body: [
      {
        co: 'Kdo ji vidí',
        jak: 'Knihy jsou soukromé, proto je dlaždice jen pro admina, šéfa, sládka a manažera. Ostatním ji admin povolí v Uživatelé → Práva → „Pivovarská bible“: vidět = číst, upravovat = i nahrávat knihy.',
      },
      {
        co: 'Nahrát knihy',
        jak: 'Pivovarská bible → Knihovna dokumentů → „Nahrát knihy“. Vyber jeden nebo víc souborů (klidně celou složku) — PDF, EPUB, DjVu, DOCX, XLSX, CSV, TXT, MD nebo fotky stran. U každého zkontroluj navržený název, potvrď, že dokumenty smíte interně používat, a klepni na „Nahrát“ nahoře. Stejný soubor se podruhé nenahraje.',
      },
      {
        co: 'Stav zpracování',
        jak: 'U každé knihy je vidět, jestli čeká, zpracovává se, je hotová, nebo má chybu, a kolik má stran, kapitol a pasáží. Dokud kniha není zpracovaná, AI z ní neodpovídá. Popis (autor, rok, vydání, oblasti A–T) jde doplnit tlačítkem „Upravit popis“.',
      },
      {
        co: 'Číst knihu',
        jak: 'U zpracované knihy klepni na „Číst“. Obsah ukáže kapitoly (klepnutím otevřeš jejich stranu), Čtení listuje stranu po straně šipkami nebo skokem na číslo strany a Tabulky a vzorce ukáže tabulky a vzorce rozpoznané v přepisu skenů. Strana „s. 158“ je vytištěné číslo, „list 170“ pořadí v souboru. U strany ke kontrole ověř čísla v originále.',
      },
      {
        co: 'Správa znalostí',
        jak: 'Dlaždice Správa znalostí ukazuje tematické oblasti A–T s počtem dokumentů, kdo má přístup a kolik místa zabírá databáze a úložiště. Ostatní dlaždice (chatbot, výpočty, technologie, várky) řeknou, ve které etapě přijdou.',
      },
    ],
  },
  {
    klic: 'sanitace',
    nazev: 'Sanitace a hygiena',
    ikona: Shield,
    kCemu: 'Doklady o čištění — tohle chce kontrola vidět.',
    body: [
      {
        co: 'Sanitační deníky',
        jak: 'Zvlášť pro tanky a zařízení, lahvovou linku, KEGy a výčepy. Zápis z checklistu při stáčení se do deníku propíše sám.',
      },
      { co: 'Sanitační postupy & Řád', jak: 'Psané postupy (HACCP) — co, čím a jak často.' },
      { co: 'Check-listy & Návody', jak: 'Postupy k obsluze strojů, odškrtávají se při práci.' },
    ],
  },
  {
    klic: 'auta',
    nazev: 'Auta a kniha jízd',
    ikona: Car,
    kCemu: 'Vozový park, jízdy a hlídání termínů.',
    body: [
      { co: 'Vozový park', jak: 'Auta, STK a známky. Po termínu se to ozve na ploše.' },
      {
        co: 'Kniha jízd',
        jak: 'Evidenční list jízd a tankování za měsíc, po autech. Jízdy z objednávek se zapíšou jedním klepnutím (objednávky, které jedou druhým autem — Kačenou — k druhému autu), jízdy mimo objednávky a tankování přidáš ručně. Každá jízda navazuje tachometrem na předchozí jízdu téhož auta. Průměrná spotřeba l/100 km se počítá z tankování. Excel a tisk jsou pod tlačítkem ⋯.',
        klepni: [
          { ikona: Zap, co: 'Klepni na „Generovat z objednávek“', kde: 'Kniha jízd, nahoře. Z dnů závozu ve vybraném měsíci sestaví jízdy; před uložením je uvidíš a zkontroluješ.' },
          { ikona: Plus, co: 'Jízda mimo objednávky: klepni na „Jízda“ s plusem', kde: 'Vedle výběru měsíce. Napiš kam jedeš, účel a ujeté km — odhad stačí, rozdíl se doladí při uzavření měsíce. Návrat do Kynšperku se doplní sám.' },
          { ikona: Fuel, co: 'Tankování: klepni na ikonu čerpací stanice', kde: 'Vedle tlačítka „Jízda“. Zapíše natankované litry; podle nich se počítá spotřeba.' },
        ],
      },
      {
        co: 'Oprava a smazání jízdy',
        jak: 'U každé jízdy je tužka (upravit) a koš (smazat). Změna nebo smazání posune tachometr jen pozdějších jízd téhož auta ve stejném měsíci, aby na sebe pořád navazovaly — appka před uložením napíše, kolika jízd se to týká. Jízdy v uzavřeném měsíci jsou zamčené (zámek) a nejdou měnit.',
        klepni: [
          { ikona: Pencil, co: 'Klepni na tužku u jízdy', kde: 'V seznamu jízd. Jde změnit datum, auto, řidiče, trasu, účel i ujeté km — i u jízdy, která vznikla z objednávek.' },
        ],
      },
      {
        co: 'Uzávěrka měsíce',
        jak: 'Jednou měsíčně srovnej knihu s tachometrem na palubní desce: zadáš stav na konci měsíce a rozdíl proti trasám se rozpočítá mezi jízdy — rovnoměrně, nebo úměrně délce jízdy. Tankování se nemění. Před uzavřením je v náhledu vidět, kolik kterou jízdu přibude (nebo ubude). Uzavřený měsíc se zamkne. Znovu otevřít ho může jen správce, tlačítkem „Otevřít měsíc“ na stejné kartě.',
        klepni: [
          { ikona: Lock, co: 'Klepni na „Uzavřít měsíc“', kde: 'Kniha jízd → karta „Uzávěrka měsíce“, u auta. Zadej tachometr na konci měsíce, zkontroluj náhled a potvrď.' },
        ],
      },
    ],
  },
  {
    klic: 'planovani',
    nazev: 'Kalendář, upozornění, poznámky',
    ikona: AlarmClock,
    kCemu: 'Co se kdy má stát a na co se nesmí zapomenout.',
    body: [
      { co: 'Kalendář', jak: 'Stáčení, závozy a akce v jednom měsíci. Klepnutím na den se rozbalí, co ten den je.' },
      { co: 'Upozornění a připomínky', jak: 'Vlastní připomínky k datu. Na ploše svítí, co je po termínu.' },
      { co: 'Poznámky', jak: 'Lísteček na ploše — pro vzkazy mezi směnami.' },
      { co: 'Zpětná vazba', jak: 'Co by se mělo vylepšit nebo opravit. Vidí to všichni kolegové.' },
      {
        co: 'Hlášení',
        jak: 'Najdeš ho v Nastavení (tlačítko „Otevřít Hlášení“). Vyhlásí zprávu, která všem naskočí přes celou obrazovku a musí ji odklepnout — odstávka varny, změna závozu. Napiš nadpis, text a druh (technické / důležité / informace) a vyhlas. Platí jedno hlášení najednou; zrušíš ho tamtéž.',
      },
    ],
  },
  {
    klic: 'akce',
    nazev: 'Akce a exkurze',
    ikona: Sparkles,
    kCemu: 'Festivaly, akce a návštěvy pivovaru.',
    body: [
      { co: 'Akce', jak: 'Co se odvezlo a co se vrátilo — do skladu se počítá rozdíl, ne celé odvezené množství.' },
      { co: 'Exkurze', jak: 'Termíny návštěv, počty lidí a kdo je provází. Zapíše se sem i to, co se při exkurzi vytočilo — aby to nechybělo ve skladu.' },
      { co: 'Výčepy (zápůjčky)', jak: 'Komu je půjčená technika a odkdy. Když se výčep zmíní v objednávce, appka ho nabídne rezervovat.' },
    ],
  },
  {
    klic: 'ciselniky',
    nazev: 'Číselníky',
    ikona: Tag,
    kCemu: 'Seznamy, ze kterých čerpá zbytek aplikace.',
    body: [
      { co: 'Odběratelé', jak: 'Jména, telefony a adresy. Odsud se berou do objednávek.' },
      { co: 'Piva', jak: 'Název, stupňovitost a BARVA — ta barva se pak používá na štítcích v celé aplikaci.' },
      { co: 'Obaly', jak: 'Sudy, lahve, PET, podtácky. U sudu je objem, podle kterého se počítají litry.' },
      { co: 'Ceník', jak: 'Ceny za litr piva a za obal. Odsud se počítají částky v objednávkách a v exportu; když se cena změní, změň ji tady a projeví se všude.' },
    ],
  },
  {
    klic: 'nastaveni',
    nazev: 'Uživatelé a nastavení',
    ikona: Settings,
    kCemu: 'Kdo smí co a jak se aplikace chová na tomhle telefonu.',
    body: [
      { co: 'Uživatelé a práva', jak: 'Kdo se dostane na kterou obrazovku a kdo smí mazat. Nastavuje admin.' },
      { co: 'Hustota zobrazení', jak: 'XS až XL — velikost písma a prvků. Pro práci v rukavicích se hodí L nebo XL.' },
      {
        co: 'Plynulost',
        jak: 'Když se appka na starším telefonu seká, zapni „méně efektů“ — vypne skleněné rozostření a blikání. Upozornění nezmizí, dostanou jen stálý rámeček.',
      },
      { co: 'Odezva při dotyku', jak: 'Krátké zavibrování při odškrtnutí — nemusí se kontrolovat očima, jestli klepnutí prošlo.' },
      { co: 'Upozornění do telefonu', jak: 'Push i se zavřenou aplikací (nová objednávka na WhatsAppu, výčep po termínu).' },
      {
        co: 'Stáhnout zálohu',
        jak: 'Kopie dat k sobě. Denní záloha jde do stejného místa jako kód aplikace, takže stažená kopie je jediná skutečná pojistka. Vidí to jen admin.',
      },
      { co: 'Čekající migrace', jak: 'Změny v databázi, které je potřeba pustit. Jde to rovnou z telefonu.' },
    ],
  },
  {
    klic: 'offline',
    nazev: 'Když není signál',
    ikona: Users,
    kCemu: 'Ve sklepě a na cestě aplikace funguje dál.',
    body: [
      {
        co: 'Zápis do fronty',
        jak: 'Bez signálu se zápis uloží do telefonu a hláška to řekne nahlas. Odešle se, až se signál chytne.',
      },
      { co: 'Odeslat teď', jak: 'Dlaždice „Čeká na odeslání“ pošle čekající zápisy hned, jakmile jsi online.' },
      { co: 'Práce ve dvou', jak: 'Když někdo uloží zápis, ostatním se obrazovka sama obnoví. V pozadí se nepřenačítá, ať to nežere data.' },
      {
        co: 'Čísla nemusí být aktuální',
        jak: 'Když server včas neodpoví (slabý signál), Sklad ukáže poslední čísla z telefonu a nahoře žlutý pruh „čísla jsou z paměti telefonu“. Appka to sama zkouší znovu, jde i tlačítkem „Načíst znovu“. Když se nenačte všechno, svítí červený pruh — radši žádné číslo než špatné. Zápis, který z takových čísel vychází (týdenní kontrola), se napřed zeptá.',
      },
    ],
  },
];

function OddilBlok({ oddil, otevreny, prepni }: { oddil: Oddil; otevreny: boolean; prepni: () => void }) {
  const Ikona = oddil.ikona;
  return (
    <div className="border border-neutral-200 rounded overflow-hidden bg-white">
      <button
        type="button"
        onClick={prepni}
        aria-expanded={otevreny}
        className="w-full flex items-center gap-2.5 text-left px-3.5 py-3 min-h-[44px] hover:bg-amber-50 transition"
      >
        <Ikona className="ikona-text text-amber-700 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-display font-black text-neutral-900 text-sm leading-tight">{oddil.nazev}</span>
          <span className="block text-udaj font-bold text-neutral-500 mt-0.5">{oddil.kCemu}</span>
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-neutral-400 transition-transform ${otevreny ? 'rotate-180' : ''}`}
        />
      </button>

      {otevreny && (
        <ul className="border-t border-neutral-200 divide-y divide-neutral-100">
          {oddil.body.map((b) => (
            <li key={b.co} className="px-3.5 py-2.5">
              <div className="font-black text-neutral-900 text-sm">{b.co}</div>
              <div className="text-sm text-neutral-700 leading-relaxed mt-0.5">{b.jak}</div>
              {b.klepni && (
                <ol className="mt-2 space-y-2" aria-label="Kam klepnout">
                  {b.klepni.map((k, i) => (
                    <li key={k.co} className="flex items-center gap-3 rounded border border-amber-200 bg-amber-50/60 p-2">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-neutral-950 text-xs font-black grid place-items-center">{i + 1}</span>
                      <span className="shrink-0 w-12 h-12 grid place-items-center rounded-lg bg-white border-2 border-amber-400 text-neutral-900">
                        <k.ikona size={26} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 text-sm leading-snug">
                        <strong className="text-neutral-900">{k.co}</strong>
                        <span className="block text-neutral-600">{k.kde}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
          {oddil.ikony && (
            <li className="px-3.5 py-2.5 bg-neutral-50">
              <div className="font-black text-neutral-900 text-sm mb-1.5">Co která ikona znamená</div>
              <ul className="space-y-1.5">
                {oddil.ikony.map((i) => (
                  <li key={i.nazev} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <span className="shrink-0 w-8 h-8 grid place-items-center rounded bg-white border border-neutral-200 text-amber-800">
                      <i.ikona className="ikona-text" />
                    </span>
                    <span className="min-w-0 pt-1"><strong className="text-neutral-900">{i.nazev}</strong> — {i.vyznam}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function NavodPouziti() {
  // Otevřené je jen „Začínáme“ — nový člověk začne tam. Zbytek je rozcestník,
  // který se vejde na obrazovku celý; otevře se to, co je zrovna potřeba.
  const [otevreny, setOtevreny] = useState<string | null>('zaciname');

  return (
    <div className="space-y-2">
      <p className="text-sm text-neutral-600 leading-relaxed">
        Klepni na oddíl a rozbalí se, co v něm která věc dělá a jak se to
        ovládá. Tenhle návod je k dispozici odkudkoli přes <strong>„?“</strong> vedle lupy nahoře.
      </p>

      {ODDILY.map((o) => (
        <OddilBlok
          key={o.klic}
          oddil={o}
          otevreny={otevreny === o.klic}
          prepni={() => setOtevreny((p) => (p === o.klic ? null : o.klic))}
        />
      ))}

      <p className="text-udaj font-bold text-neutral-400 pt-1">
        Něco tu chybí nebo nesedí? Napiš to do <strong>Zpětné vazby</strong> — vidí to všichni.
      </p>
    </div>
  );
}

/** Oddíly návodu — vystavené kvůli testu, který hlídá pokrytí obrazovek. */
export const NAVOD_ODDILY = ODDILY;
