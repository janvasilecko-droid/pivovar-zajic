import { useState } from 'react';
import {
  AlarmClock, BarChart3, Beer as BeerIcon, Bell, Car, ChevronDown, ClipboardCheck,
  ClipboardList, FileSpreadsheet, FlaskConical, Factory, GlassWater, LayoutGrid,
  type LucideIcon, Settings, Shield, Snowflake, Sparkles, Store, Tag, Truck, Users,
} from 'lucide-react';
import { IkonaSud, IkonaLahev } from './ikony';

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

type Oddil = {
  klic: string;
  nazev: string;
  ikona: LucideIcon;
  /** Jedna věta: k čemu ta část aplikace je. */
  kCemu: string;
  /** Konkrétní funkce a postupy. */
  body: { co: string; jak: string }[];
};

const ODDILY: Oddil[] = [
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
        co: 'Návod k použití',
        jak: 'Dlaždice „Návod k použití" na ploše (a „?" vedle lupy) otevře tenhle text. Klepni na oddíl a rozbalí se, co v něm která věc dělá.',
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
        jak: 'Pod položkou se píše „z toho X nachystáno/zavezeno · Y stočeno tento týden“. Pozor: nachystané kusy se z těch stočených VZALY, nepřičítají se k nim.',
      },
      {
        co: 'Přihrádka „Bez termínu“',
        jak: 'Objednávky, u kterých není uvedený den dovozu. Appka je nehádá na dnešek — doplň den v Objednávkách a přeskočí, kam patří.',
      },
      {
        co: 'Odškrtávátko NEZAPISUJE stáčení',
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
      { co: 'Zápis stáčení', jak: 'Stejný postup jako u sudů: pivo, obal, počet, uložit.' },
      { co: 'Plán po dnech', jak: 'Tatáž tabule „Co stočit na který den“ včetně rozpadu po obalech.' },
      {
        co: 'Sklo, etikety, podtácky',
        jak: 'Vlastní záložka na obalový materiál: nákupy a spotřeba. Korunky a PET víčka se odečítají zvlášť — jedna zavřená lahev = jedna závěrka.',
      },
      {
        co: 'Potřeby stáčení',
        jak: 'Samostatná obrazovka: kolik je skladem proti tomu, co je objednané.',
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
        jak: 'Ručně dlaždicemi piv, hlasem (Hlasové zadání), vložením textu, z WhatsApp zprávy nebo vyfocením papíru.',
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
        jak: 'Když už stejná objednávka existuje, appka se zeptá: Ignorovat zprávu / Přesto vytvořit / Zpět.',
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
      { co: 'Fasování', jak: 'Pivo pro personál. Zapisuje se kdo si bere.' },
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
        co: 'Sklep a tanky',
        jak: 'Kvasné tanky na spilce a ležácké tanky, průběh kvašení a varné listy. U tanku je vidět, na kolik sudů zbývající objem vyjde.',
      },
      {
        co: 'Inventura',
        jak: 'Zadává se na konci měsíce. „Spočítat z fotek“ přečte napsané počty z fotky papíru. „Schválit & převést“ stavy uzamkne a přenese do počátečního stavu dalšího měsíce — to je krok, který nejde vzít zpět.',
      },
      {
        co: 'Rozpad piva',
        jak: 'Každý pohyb jednoho piva za libovolné období — odkud se vzalo a kam šlo. Tohle je místo, kde se dohledává, proč nějaké číslo nesedí.',
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
    ],
  },
  {
    klic: 'nastroje',
    nazev: 'Kalkulačky a časovače',
    ikona: FlaskConical,
    kCemu: 'Výpočty, které se dřív dělaly na papíře.',
    body: [
      {
        co: 'Kalkulačky',
        jak: 'Dotáčení KEG sudů (kolik sudů vyjde z tanku), šrotování sladu, sanitační chemie, náročnost várky a přepočet jednotek.',
      },
      { co: 'Časovač a stopky', jak: 'Odpočet s alarmem (kotel, chmelení) a stopky s mezičasy. Alarm zazvoní i při zamčeném telefonu.' },
      { co: 'Stočení sudu', jak: 'Odpočet přímo pro stáčení jednoho sudu.' },
      { co: 'Pivovarské rádio', jak: 'Hraje při práci, ovládá se z lišty dole.' },
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
      { co: 'Kniha jízd', jak: 'Jízdy, tankování a evidenční list za měsíc. Počítá se i průměrná spotřeba l/100 km.' },
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NavodPouziti() {
  // Nic otevřené: rozcestník se vejde na obrazovku celý a je z něj vidět,
  // co všechno appka umí. Otevře se to, co je zrovna potřeba.
  const [otevreny, setOtevreny] = useState<string | null>(null);

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
