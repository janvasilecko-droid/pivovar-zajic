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
  diffOrderItems, rozsahOdpovedi, slozNavrh,
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
    timer: 'časovač — nástroj bez dat pivovaru',
    stopwatch: 'stopky — nástroj bez dat pivovaru',
    keg_timer: 'odpočet ke stáčení — nástroj bez dat pivovaru',
    radio: 'rádio — nástroj bez dat pivovaru',
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
