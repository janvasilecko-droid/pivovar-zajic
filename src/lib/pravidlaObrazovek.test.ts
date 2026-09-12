/**
 * 🛡️ PRAVIDLA OBRAZOVEK — testy na to, co se NESMÍ STÁT.
 *
 * Ne klikání po obrazovkách, ale pravidla složená ze stejných dílů a ve
 * stejném pořadí, jak je skládá obrazovka. Rozdíl je podstatný: chyba, kvůli
 * které tenhle soubor vznikl, byla v tom, JAK obrazovka knihovny složila —
 * každá jednotlivá knihovna se přitom chovala správně a měla zelené testy.
 *
 * Každý test tady odpovídá skutečné chybě, která se v provozu stala nebo by
 * se stala nepozorovaně.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  diffOrderItems, rozsahOdpovedi, slozNavrh, vypadaJakoZmenaObjednavky,
} from './whatsappAmendment';
import { APP_VERSION } from './version';
import { NAV, EXTRA_NAV } from '../components/Layout';
import { PAGE_TO_MODULE } from './permissions';

// ---------------------------------------------------------------------------
// 1) Schválení WhatsApp doplňku nesmí smazat položky, o kterých zpráva nemluví
// ---------------------------------------------------------------------------
describe('doplněk objednávky z WhatsAppu', () => {
  // Skutečná zpráva: k objednávce z Manea přišla odpověď
  // „Ty male soudky budou / Desitka 2x 20l / 11sv 1x15l / Tricitky a petky sedi".
  // Odběratel v ní mění JEN malé sudy a výslovně potvrzuje, že třicítky
  // a petky sedí. Když se odpověď vezme jako celý nový obsah objednávky,
  // spadnou z ní 2 třicítky a 24 petek — a nikdo si toho nevšimne, protože
  // schválení vypadá stejně jako každé jiné.
  const ZPRAVA = [
    'Ty male soudky budou',
    'Desitka 2x 20l',
    '11sv 1x15l',
    'Tricitky a petky sedi',
  ].join('\n');

  const OBALY = [
    { id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
    { id: 'keg20', label: 'KEG 20 l', kind: 'keg', volume_l: 20 },
    { id: 'keg15', label: 'KEG 15 l', kind: 'keg', volume_l: 15 },
    { id: 'pet15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5 },
  ];

  const SOUCASNE = [
    { beer_id: 'desitka', package_id: 'keg30', quantity: 2 },
    { beer_id: 'desitka', package_id: 'keg15', quantity: 3 },
    { beer_id: 'jedenactka', package_id: 'keg15', quantity: 2 },
    { beer_id: 'desitka', package_id: 'pet15', quantity: 24 },
  ];

  const Z_ODPOVEDI = [
    { beer_id: 'desitka', package_id: 'keg20', quantity: 2 },
    { beer_id: 'jedenactka', package_id: 'keg15', quantity: 1 },
  ];

  /** Přesně to, co dělá WhatsAppOrderReviewModal před zobrazením rozdílu. */
  function jakToDelaObrazovka() {
    const navrh = slozNavrh({ soucasne: SOUCASNE, zOdpovedi: Z_ODPOVEDI, text: ZPRAVA, obaly: OBALY });
    return { navrh, diff: diffOrderItems(SOUCASNE, navrh) };
  }

  it('potvrzené třicítky a petky v objednávce ZŮSTANOU', () => {
    const { navrh } = jakToDelaObrazovka();
    expect(navrh).toEqual(expect.arrayContaining([
      { beer_id: 'desitka', package_id: 'keg30', quantity: 2 },
      { beer_id: 'desitka', package_id: 'pet15', quantity: 24 },
    ]));
  });

  it('v rozdílu ke schválení není ANI JEDNO odebrání potvrzené položky', () => {
    const { diff } = jakToDelaObrazovka();
    const odebirane = diff
      .filter((r) => r.zmena === 'odebrat')
      .map((r) => r.package_id);
    expect(odebirane).not.toContain('keg30');
    expect(odebirane).not.toContain('pet15');
  });

  it('malé sudy se naopak vymění za to, co je v odpovědi', () => {
    const { navrh } = jakToDelaObrazovka();
    // 20l dvojka z odpovědi tam je…
    expect(navrh).toEqual(expect.arrayContaining([
      { beer_id: 'desitka', package_id: 'keg20', quantity: 2 },
    ]));
    // …a stará desítka v patnáctkách (3 ks), o které odpověď mluví, ne.
    expect(navrh).not.toEqual(expect.arrayContaining([
      { beer_id: 'desitka', package_id: 'keg15', quantity: 3 },
    ]));
  });

  it('rozsah odpovědi pozná, co se nahrazuje a co jen potvrzuje', () => {
    const rozsah = rozsahOdpovedi(ZPRAVA);
    expect(rozsah.nahradit).toContain('maly_sud');
    expect(rozsah.potvrzeno.length).toBeGreaterThan(0);
  });

  it('bez rozsahu (zpráva mluví o celé objednávce) se návrh bere celý', () => {
    // Pojistka do druhé strany: kdyby se „nahrazuje jen část" uplatnilo
    // vždycky, nešlo by objednávku odpovědí přepsat celou.
    const navrh = slozNavrh({ soucasne: SOUCASNE, zOdpovedi: Z_ODPOVEDI, text: 'Nova objednavka:', obaly: OBALY });
    expect(navrh).toEqual(Z_ODPOVEDI);
  });
});

// ---------------------------------------------------------------------------
// 1b) Ruční napojení přídavku nesmí objednávku přepsat
// ---------------------------------------------------------------------------
describe('ruční napojení přídavku na objednávku', () => {
  // Skutečný případ (6. 9. 2026): fotka papíru se dvěma limonádami
  // a popiskem „Pro Radka jeste plus toto". Nově se dá taková zpráva
  // v kontrole napojit na existující objednávku — a právě tady číhá past:
  // schválení jde přes tutéž větev jako odpověď s citací, jenže ta bere
  // položky ze zprávy jako CELÝ nový obsah objednávky. Napojení přídavku
  // by tedy z Radkovy objednávky nechalo dvě limonády a zbytek smazalo.
  const OBALY = [
    { id: 'keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
    { id: 'keg10', label: 'KEG 10l', kind: 'keg', volume_l: 10 },
  ];
  const RADKOVA_OBJEDNAVKA = [
    { beer_id: 'des', package_id: 'keg30', quantity: 2 },
    { beer_id: '11sv', package_id: 'keg10', quantity: 3 },
  ];
  const Z_FOTKY = [
    { beer_id: 'limo-visen', package_id: 'keg30', quantity: 1 },
    { beer_id: 'limo-kiwi', package_id: 'keg30', quantity: 1 },
  ];

  it('schválení napojeného přídavku nic z objednávky neodebere', () => {
    // Přesně to, co dělá Orders.tsx ve větvi `if (message.amends_order_id)`.
    const navrh = slozNavrh({
      soucasne: RADKOVA_OBJEDNAVKA,
      zOdpovedi: Z_FOTKY,
      text: 'Pro Radka jeste plus toto',
      obaly: OBALY,
    });
    const diff = diffOrderItems(RADKOVA_OBJEDNAVKA, navrh);
    expect(diff.filter((d) => d.zmena === 'odebrano')).toEqual([]);
    expect(navrh).toHaveLength(4);
  });

  it('„malé sudy budou takhle" vybranou objednávku UPRAVÍ, nezaloží druhou', () => {
    // Zadání z provozu: napojit nejde jen přídavek. Když zpráva říká, co
    // v objednávce má být jinak, musí se do vybrané objednávky zapracovat —
    // jmenovaná skupina se přepíše, zbytek zůstane.
    const zprava = 'Ty male soudky budou Desitka 2x 10l';
    expect(vypadaJakoZmenaObjednavky(zprava)).toBe('uprava');

    const navrh = slozNavrh({
      soucasne: RADKOVA_OBJEDNAVKA,
      zOdpovedi: [{ beer_id: 'des', package_id: 'keg10', quantity: 2 }],
      text: zprava,
      obaly: OBALY,
    });
    // Malé sudy (10l) se vyměnily…
    expect(navrh).toEqual(expect.arrayContaining([
      { beer_id: 'des', package_id: 'keg10', quantity: 2 },
    ]));
    // …a třicítky, o kterých zpráva nemluví, zůstaly.
    expect(navrh).toEqual(expect.arrayContaining([
      { beer_id: 'des', package_id: 'keg30', quantity: 2 },
    ]));
    // Nesmí to skončit jako přičtení — jedenáctka v malých sudech měla zmizet.
    expect(navrh).not.toEqual(expect.arrayContaining([
      { beer_id: '11sv', package_id: 'keg10', quantity: 3 },
    ]));
  });

  it('náhled i import rozlišují přídavek a úpravu STEJNĚ', () => {
    // Kdyby žlutý pruh nabídl „Přidat k téhle" a import zprávu zapracoval
    // jako přepis (nebo naopak), obsluha by potvrdila něco jiného, než co se
    // zapíše. Rozhoduje jedno pravidlo: diktát skupiny přebíjí slovo „plus".
    const zprava = 'Jeste plus male soudky budou 2x10 desitka';
    expect(vypadaJakoZmenaObjednavky(zprava)).toBe('uprava');
    const navrh = slozNavrh({
      soucasne: RADKOVA_OBJEDNAVKA,
      zOdpovedi: [{ beer_id: 'des', package_id: 'keg10', quantity: 2 }],
      text: zprava,
      obaly: OBALY,
    });
    // Zapracovalo se jako úprava (3 ks jedenáctky pryč), ne jako přičtení.
    expect(navrh).toHaveLength(2);
  });

  it('import i náhled rozdílu skládají návrh STEJNĚ (přes slozNavrh)', () => {
    // Kdyby si jedna strana položky brala rovnou z parsed_items, ukázal by
    // náhled něco jiného, než co se pak zapíše — a obsluha by potvrdila
    // rozdíl, který nevidí. Obě místa musí projít slozNavrh.
    const importObrazovka = readFileSync('src/screens/Orders.tsx', 'utf8');
    const kontrola = readFileSync('src/components/WhatsAppOrderReviewModal.tsx', 'utf8');
    expect(importObrazovka).toContain('slozNavrh(');
    expect(kontrola).toContain('slozNavrh(');
  });

  it('napojení se zapisuje jen do amends_order_id, ne do stavu zprávy', () => {
    // Napojení říká, KAM se zpráva schválí — ne že se schválila. Kdyby
    // sáhlo na `status`, zmizela by zpráva ze seznamu ke schválení dřív,
    // než ji někdo potvrdil.
    const api = readFileSync('src/lib/whatsappApi.ts', 'utf8');
    const usek = api.slice(api.indexOf('export async function napojNaObjednavku'));
    const telo = usek.slice(0, usek.indexOf('\n}'));
    expect(telo).toContain('amends_order_id');
    expect(telo).not.toContain('status');
  });
});

// ---------------------------------------------------------------------------
// 1c) „Chybí skladem" se nesmí hlásit u objednávky, která už odjela
// ---------------------------------------------------------------------------
describe('odznak „chybí skladem" u odbavené objednávky', () => {
  // Z provozu 8. 9. 2026: „stočil jsem 4×30 na Duck and Dog a u přehledu mi
  // to píše, že 4×30 12sv chybí ve stáčení." Objednávka měla stav Zavezeno.
  //
  // Ten odznak neměří „na tuhle objednávku nemám pivo", ale „tahle kombinace
  // piva a obalu je ke konci týdne závozu v mínusu" — přes VŠECHNY pohyby
  // toho týdne. U objednávky, která už fyzicky odjela, je to rada, kterou
  // nejde uposlechnout: to pivo je pryč.
  const zdroj = readFileSync('src/screens/Orders.tsx', 'utf8');

  it('schodek se u odbavené objednávky vůbec nepočítá', () => {
    expect(zdroj).toContain('const odbaveno =');
    // Výpočet schodku musí být na tom příznaku závislý, ne až jeho vykreslení:
    // spočítat ho a pak schovat by znamenalo, že se někde jinde stejně ukáže.
    expect(zdroj).toMatch(/odbaveno \? \[\] : schodkyObjednavky\(/);
  });

  it('za odbavenou se považuje zavezená, vyřízená i stornovaná', () => {
    const radek = zdroj.slice(zdroj.indexOf('const odbaveno ='));
    const telo = radek.slice(0, radek.indexOf(';'));
    expect(telo).toContain('is_delivered');
    expect(telo).toContain('jeVyrizena');
    expect(telo).toContain('storno');
  });

  it('popisek odznaku říká, že jde o celý TÝDEN, ne o tu objednávku', () => {
    // Původní „Chybí: 12° Světlá 30 L 4 ks" se četlo jako výrok o objednávce.
    expect(zdroj).toContain('Ke konci týdne chybí:');
  });
});

// ---------------------------------------------------------------------------
// 2) Verze v kódu a ve version.json si musí odpovídat
// ---------------------------------------------------------------------------
describe('číslo verze', () => {
  it('src/lib/version.ts a public/version.json mají STEJNÉ číslo', () => {
    // Když se rozejdou, service worker novou verzi NIKDY nenabídne:
    // aplikace porovnává version.json ze serveru se svým APP_VERSION.
    // Uživatel to vidí jen tak, že „appka nechce aktualizovat" — přesně
    // ten příznak, po kterém se to hledá nejhůř. Stalo se to dvakrát za
    // jeden den, protože se zvedl jen jeden ze dvou souborů.
    const json = JSON.parse(readFileSync('public/version.json', 'utf8'));
    expect(json.version).toBe(APP_VERSION);
  });
});

// ---------------------------------------------------------------------------
// 3) Každá obrazovka v nabídce musí mít přiřazený modul oprávnění
// ---------------------------------------------------------------------------
describe('oprávnění obrazovek', () => {
  /**
   * Obrazovky, které modul oprávnění NEMAJÍ, a je to tak správně.
   * Každá potřebuje důvod — protože `canUserView` bez modulu vrací `true`,
   * tedy „uvidí to každý". Když se sem něco přidává, je to rozhodnutí,
   * ne opomenutí.
   */
  const BEZ_MODULU_ZAMERNE: Record<string, string> = {
    home: 'plocha (launcher), ne modul s daty',
    signout: 'odhlášení, ne obrazovka',
    users: 'hlídá se přímo rolí admina (HomeScreen.tsx a Layout.tsx: if (n.id === "users") return isAdmin)',
    zaloha: 'hlídá se přímo rolí admina (Layout.tsx: if (n.id === "zaloha") return isAdmin); otevírá Uživatele, nemá vlastní modul',
    timer: 'časovač — nástroj bez dat pivovaru',
    stopwatch: 'stopky — nástroj bez dat pivovaru',
    keg_timer: 'odpočet ke stáčení — nástroj bez dat pivovaru',
    radio: 'rádio — nástroj bez dat pivovaru',
    navod: 'návod k použití — nápověda, ne data; zamknout ji znamená nechat člověka bez pomoci',
  };

  it('žádná obrazovka nezůstala bez modulu oprávnění NEDOPATŘENÍM', () => {
    // Obrazovka bez záznamu v PAGE_TO_MODULE se chová jako veřejná —
    // uvidí ji každý, komu se nabídka vykreslí. To je tichá chyba: nová
    // obrazovka se prostě objeví všem, dokud si toho někdo nevšimne.
    // Test proto nevynucuje modul u všech, ale vynucuje ROZHODNUTÍ:
    // buď modul, nebo záznam v seznamu výše s důvodem.
    const bezRozhodnuti = [...NAV, ...EXTRA_NAV]
      .map((n) => n.id)
      .filter((id) => !(id in PAGE_TO_MODULE) && !(id in BEZ_MODULU_ZAMERNE));
    expect(bezRozhodnuti).toEqual([]);
  });

  it('seznam výjimek neobsahuje obrazovky, které modul mezitím dostaly', () => {
    // Aby seznam výjimek nezůstal ležet a nemátl: co má modul, nemá
    // v něm co dělat.
    const zbytecne = Object.keys(BEZ_MODULU_ZAMERNE).filter((id) => id in PAGE_TO_MODULE);
    expect(zbytecne).toEqual([]);
  });

  it('každá položka nabídky má popisek i ikonu', () => {
    // Položka bez popisku se v launcheru vykreslí jako prázdná dlaždice
    // a bez ikony spadne render dlaždice na undefined komponentě.
    const rozbite = [...NAV, ...EXTRA_NAV]
      .filter((n) => !n.label || !n.icon)
      .map((n) => n.id);
    expect(rozbite).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4) „Vrátit zpět" nesmí hledat řádek podle hodnot
// ---------------------------------------------------------------------------
describe('vrácení zpět po uložení', () => {
  // Skutečná past: po uložení stáčení nabídne appka „Vrátit zpět" a ta
  // dohledávala řádek ke smazání podle data, piva, obalu a počtu — vždy
  // ten nejnovější. Když ten den stočili dva lidé stejné pivo ve stejném
  // obalu ve stejném počtu (u desítky v 50l KEGu běžné), vrácení smazalo
  // CIZÍ zápis a u KEGů vrátilo objem do tanku, ze kterého se nebral.
  //
  // Správně je vzít id z `.insert(...).select('id')` a mazat podle něj.
  // Test hlídá, aby se ten vzorec nevrátil — nesnaží se spustit obrazovku,
  // ale čte, čím se maže, protože právě SLOŽENÍ dotazu byla ta chyba.
  //
  // Kegging.tsx a BottlingScreen.tsx tu od 9. 9. 2026 CHYBÍ schválně: na
  // přání uživatele („neukazuj uloženo a zpět") „Vrátit zpět" po uložení
  // úplně zmizelo — stáčí se průběžně a to okno jen zdržovalo. `toastZpet`
  // v nich zůstal jen u MAZÁNÍ řádku (undo podle už známého `id`, ne podle
  // hodnot), což tuhle past nemá — mazaný řádek se nehledá, už se ví, který
  // to je. Bod, který test hlídá, se týká jen ProdejnaScreen.tsx.
  const ZAPISOVE_OBRAZOVKY = [
    'src/screens/ProdejnaScreen.tsx',
  ];

  it('zápisové obrazovky získávají id vloženého řádku', () => {
    const bezIdcka = ZAPISOVE_OBRAZOVKY.filter((cesta) => {
      const zdroj = readFileSync(cesta, 'utf8');
      // Vložení řádků k zápisu se pozná podle toho, že se hned nabízí
      // vrácení zpět; takové vložení musí id vrátit.
      return zdroj.includes('toastZpet(') && !zdroj.includes(".select('id')");
    });
    expect(bezIdcka).toEqual([]);
  });

  it('nikde se řádek ke smazání nedohledává podle množství', () => {
    const podezrele = ZAPISOVE_OBRAZOVKY.filter((cesta) =>
      readFileSync(cesta, 'utf8').includes(".eq('quantity',"),
    );
    expect(podezrele).toEqual([]);
  });
});
