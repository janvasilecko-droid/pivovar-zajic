import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./functionAuth', () => ({ authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }) }));
vi.mock('./obrazek', async (orig) => ({
  ...(await orig<typeof import('./obrazek')>()),
  zmensenyDataUrl: vi.fn(async () => 'data:image/jpeg;base64,ANALYZA'),
  oriznutyDataUrl: vi.fn(async () => 'data:image/jpeg;base64,VYREZ'),
}));

import {
  bilanceRadkuLahve,
  ctiTabulkuZFotky,
  navrhOdData,
  obalPodleObjemu,
  radkyLahveZTabulky,
  radkyObalyZTabulky,
  vychoziDen,
  type ObalKatalog,
  type PametFotky,
} from './tabulkaStaceni';
import { oriznutyDataUrl, zmensenyDataUrl } from './obrazek';
import { POZNAMKA_AUTOMATICKY } from './staceniZPolozky';
import { posledniRucniZapis } from './posledniZapis';
import { prepisTabulky, type RadekTabulky } from '../../supabase/functions/_shared/tabulka-staceni';
import { VISION_TABULKA_PUVODNI } from '../../supabase/functions/_shared/tabulka-vision.fixture';

// Obaly tak, jak jsou v databázi (popisky jsou jen objemy, rozhoduje objem a druh).
const OBALY: ObalKatalog[] = [
  { id: 'k50', label: ' 50l', volume_l: 50, kind: 'keg' },
  { id: 'k30', label: '30l', volume_l: 30, kind: 'keg' },
  { id: 'k20', label: '20l', volume_l: 20, kind: 'keg' },
  { id: 'k15', label: ' 15l', volume_l: 15, kind: 'keg' },
  { id: 'k10', label: ' 10l', volume_l: 10, kind: 'keg' },
  { id: 'p15', label: '1.5l', volume_l: 1.5, kind: 'bottle' },
  { id: 'p1', label: '1l', volume_l: 1, kind: 'bottle' },
  { id: 'p05', label: '0.5l', volume_l: 0.5, kind: 'bottle' },
  { id: 'p033', label: '0.33l', volume_l: 0.33, kind: 'bottle' },
];

const radek = (p: Partial<RadekTabulky>): RadekTabulky => ({
  cislo: 555, datumVBunce: null, datum: '2026-10-13', pivo: '12 Světlá', pivoId: 's12', sudy: [], lahve: [], varovani: [], ...p,
});

describe('navrhOdData — den po posledním zápisu', () => {
  it('den po', () => {
    expect(navrhOdData('2026-10-12')).toBe('2026-10-13');
    expect(navrhOdData('2026-10-31')).toBe('2026-11-01');
    expect(navrhOdData('2026-12-31')).toBe('2027-01-01');
  });
  it('bez zápisu nebo s nesmyslem prázdné — čte se celá tabulka', () => {
    expect(navrhOdData(null)).toBe('');
    expect(navrhOdData(undefined)).toBe('');
    expect(navrhOdData('včera')).toBe('');
  });
});

describe('posledniRucniZapis — odkud se tabulka čte, aby se nic nezapsalo podruhé', () => {
  it('nejnovější datum ručního zápisu', () => {
    expect(posledniRucniZapis([
      { entry_date: '2026-10-06', quantity: 20, note: null },
      { entry_date: '2026-10-12', quantity: 35, note: 'dopoledne' },
      { entry_date: '2026-10-09', quantity: 44, note: null },
    ])).toBe('2026-10-12');
  });

  it('zápisy, které založila appka sama, a minusové opravy se nepočítají', () => {
    expect(posledniRucniZapis([
      { entry_date: '2026-10-06', quantity: 20, note: null },
      { entry_date: '2026-10-14', quantity: 12, note: `${POZNAMKA_AUTOMATICKY} Seeberg` },
      { entry_date: '2026-10-15', quantity: -3, note: null },
      { entry_date: '2026-10-15', quantity: 0, note: null },
    ])).toBe('2026-10-06');
  });

  it('žádný zápis = null', () => {
    expect(posledniRucniZapis([])).toBeNull();
    expect(posledniRucniZapis([{ entry_date: null, quantity: 5 }])).toBeNull();
  });
});

describe('vychoziDen — který den se nabídne k vložení', () => {
  it('jeden den: ten', () => {
    expect(vychoziDen([{ datum: '2026-10-13', radku: 4 }], '2026-10-10')).toBe('2026-10-13');
    expect(vychoziDen([{ datum: null, radku: 3 }], null)).toBeNull();
  });
  it('víc dnů od zadaného data: od nejstaršího; bez data: nejnovější', () => {
    const dny = [{ datum: '2026-10-06', radku: 3 }, { datum: '2026-10-13', radku: 4 }];
    expect(vychoziDen(dny, '2026-10-01')).toBe('2026-10-06');
    expect(vychoziDen(dny, null)).toBe('2026-10-13');
  });
  it('řádky bez data se nenabízejí, když jsou i dny s datem', () => {
    const dny = [{ datum: null, radku: 3 }, { datum: '2026-09-08', radku: 1 }, { datum: '2026-09-15', radku: 5 }];
    expect(vychoziDen(dny, null)).toBe('2026-09-15');
    expect(vychoziDen(dny, '2026-09-01')).toBe('2026-09-08');
  });
  it('nic není z čeho vybírat', () => {
    expect(vychoziDen([], null)).toBeUndefined();
  });
});

describe('obal podle objemu', () => {
  it('sud je kind keg, lahev všechno ostatní; popisek se nepoužívá', () => {
    expect(obalPodleObjemu(OBALY, 'sud', 50)?.id).toBe('k50');
    expect(obalPodleObjemu(OBALY, 'lahev', 1.5)?.id).toBe('p15');
    expect(obalPodleObjemu(OBALY, 'lahev', 0.33)?.id).toBe('p033');
    expect(obalPodleObjemu(OBALY, 'sud', 1.5)).toBeUndefined();
    expect(obalPodleObjemu(OBALY, 'lahev', 50)).toBeUndefined();
  });
  it('objem v databázi jako text', () => {
    expect(obalPodleObjemu([{ id: 'x', label: '0.5l', volume_l: '0.5', kind: 'bottle' }], 'lahev', 0.5)?.id).toBe('x');
  });
});

describe('řádky tabulky → zadávání lahví', () => {
  it('řádek 555: sud 50 l ×1, tři druhy lahví, datum a pivo z tabulky', () => {
    const [r] = radkyLahveZTabulky([radek({ sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }, { objemL: 0.33, ks: 60 }] })], OBALY);
    expect(r).toMatchObject({
      beerId: 's12', kegPkgId: 'k50', kegQty: '1', keg2PkgId: '', keg2Qty: '',
      pkgId: 'p15', qty: '11', pkg2Id: 'p05', qty2: '20', pkg3Id: 'p033', qty3: '60',
      datum: '2026-10-13', cisloRadku: 555, pivoText: '12 Světlá', varovani: [],
    });
  });

  it('dva sudy různé velikosti (řádek 554: 50 l + 20 l) jdou do prvního a druhého sudu', () => {
    const [r] = radkyLahveZTabulky([radek({ cislo: 554, pivo: 'Desítka', pivoId: 'des', sudy: [{ objemL: 50, ks: 1 }, { objemL: 20, ks: 1 }], lahve: [{ objemL: 1.5, ks: 16 }, { objemL: 1, ks: 38 }] })], OBALY);
    expect(r).toMatchObject({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '1', pkgId: 'p15', qty: '16', pkg2Id: 'p1', qty2: '38', pkg3Id: '', qty3: '' });
  });

  it('řádek bez sudu (jen lahve, jako 538) zůstane bez sudu', () => {
    const [r] = radkyLahveZTabulky([radek({ cislo: 538, lahve: [{ objemL: 1.5, ks: 7 }] })], OBALY);
    expect(r).toMatchObject({ kegPkgId: '', kegQty: '', pkgId: 'p15', qty: '7' });
  });

  it('čtyři druhy lahví (řádek 544): čtvrtý jde do dalšího řádku bez sudu, obě místa to řeknou', () => {
    const rr = radkyLahveZTabulky([radek({ cislo: 544, sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 12 }, { objemL: 1, ks: 10 }, { objemL: 0.5, ks: 28 }, { objemL: 0.33, ks: 12 }] })], OBALY);
    expect(rr).toHaveLength(2);
    expect(rr[0]).toMatchObject({ kegQty: '1', pkgId: 'p15', pkg2Id: 'p1', pkg3Id: 'p05', qty3: '28' });
    expect(rr[0].varovani.join(' ')).toContain('Čtvrtý druh lahví (12× 0,33 l)');
    expect(rr[1]).toMatchObject({ beerId: 's12', kegPkgId: '', kegQty: '', pkgId: 'p033', qty: '12', datum: '2026-10-13' });
    expect(rr[1].varovani.join(' ')).toContain('Patří k témuž sudu');
  });

  it('třetí velikost sudu se nepřidá a řekne se to', () => {
    const [r] = radkyLahveZTabulky([radek({ sudy: [{ objemL: 50, ks: 1 }, { objemL: 30, ks: 1 }, { objemL: 20, ks: 1 }], lahve: [{ objemL: 1, ks: 90 }] })], OBALY);
    expect(r.keg2PkgId).toBe('k30');
    expect(r.varovani.join(' ')).toContain('3 velikosti sudů, formulář umí dvě — 1× 20 l přidej ručně');
  });

  it('obal, který katalog nemá, zůstane prázdný s varováním (nehádá se)', () => {
    const bezPet = OBALY.filter((o) => o.id !== 'p15');
    const [r] = radkyLahveZTabulky([radek({ sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 11 }] })], bezPet);
    expect(r.pkgId).toBe('');
    expect(r.qty).toBe('11');
    expect(r.varovani.join(' ')).toContain('Lahev 1,5 l v katalogu obalů není');
  });

  it('pivo, které se nespárovalo, zůstane prázdné; varování z čtení se přenese', () => {
    const [r] = radkyLahveZTabulky([radek({ pivo: null, pivoId: null, sudy: [{ objemL: 50, ks: 2 }], lahve: [{ objemL: 1, ks: 72 }], varovani: ['Číslo 72 přepis nevidí.'] })], OBALY);
    expect(r.beerId).toBe('');
    expect(r.pivoText).toBeNull();
    expect(r.varovani).toEqual(['Číslo 72 přepis nevidí.']);
  });
});

describe('řádky tabulky → zadávání sudů a výdeje', () => {
  const tabulka = [
    radek({ cislo: 554, sudy: [{ objemL: 50, ks: 1 }, { objemL: 20, ks: 1 }], lahve: [{ objemL: 1, ks: 38 }] }),
    radek({ cislo: 538, sudy: [], lahve: [{ objemL: 1.5, ks: 7 }] }),
  ];

  it('stáčení sudů: jen sloupce sudů, každá buňka jeden řádek; řádek jen s lahvemi se přeskočí', () => {
    const v = radkyObalyZTabulky(tabulka, OBALY, { sudy: true, lahve: false });
    expect(v.radky.map((r) => [r.pkgId, r.qty])).toEqual([['k50', '1'], ['k20', '1']]);
    expect(v.preskoceno).toBe(1);
    expect(v.radky[0]).toMatchObject({ beerId: 's12', datum: '2026-10-13', cisloRadku: 554 });
  });

  it('výdej: sudy i lahve, jeden řádek na buňku', () => {
    const v = radkyObalyZTabulky(tabulka, OBALY, { sudy: true, lahve: true });
    expect(v.radky.map((r) => [r.pkgId, r.qty])).toEqual([['k50', '1'], ['k20', '1'], ['p1', '38'], ['p15', '7']]);
    expect(v.preskoceno).toBe(0);
  });

  it('chybějící obal v katalogu zůstane prázdný s varováním', () => {
    const v = radkyObalyZTabulky([radek({ sudy: [{ objemL: 15, ks: 2 }] })], OBALY.filter((o) => o.id !== 'k15'), { sudy: true, lahve: false });
    expect(v.radky[0].pkgId).toBe('');
    expect(v.radky[0].varovani.join(' ')).toContain('Sud 15 l v katalogu obalů není');
  });
});

describe('bilanceRadkuLahve — živě podle toho, co je v řádku', () => {
  it('50 l → 1,5 l ×11 + 0,5 l ×20 + 0,33 l ×60 = 46,3 l, výtrata 7,4 %', () => {
    expect(bilanceRadkuLahve({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: '', keg2Qty: '', pkgId: 'p15', qty: '11', pkg2Id: 'p05', qty2: '20', pkg3Id: 'p033', qty3: '60' }, OBALY))
      .toEqual({ zdrojL: 50, stoceneL: 46.3, vytrataProc: 7.4 });
  });
  it('dva sudy se sečtou', () => {
    expect(bilanceRadkuLahve({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '1', pkgId: 'p15', qty: '16', pkg2Id: 'p1', qty2: '38', pkg3Id: '', qty3: '' }, OBALY).zdrojL).toBe(70);
  });
  it('prázdné a nevyplněné políčko se nepočítá; bez sudu výtrata není', () => {
    const b = bilanceRadkuLahve({ kegPkgId: '', kegQty: '', keg2PkgId: '', keg2Qty: '', pkgId: 'p1', qty: '27', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '' }, OBALY);
    expect(b).toEqual({ zdrojL: 0, stoceneL: 27, vytrataProc: null });
  });
});

describe('ctiTabulkuZFotky — dvě volání funkce, výřez od zvoleného data', () => {
  const prepis = JSON.parse(JSON.stringify(prepisTabulky(VISION_TABULKA_PUVODNI)));
  const PIVA = [{ id: 's12', name: '12° Světlá', degree: '12°' }];
  const radkyOdpoved = {
    tabulka: {
      radky: [radek({ sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1, ks: 45 }] })],
      dny: [{ datum: '2026-10-13', radku: 1 }], varovani: [], vynechano: 0, bezData: 0, ocr: true,
    },
  };
  const foto = { dataUrl: 'data:image/png;base64,NAHLED', soubor: new File(['x'], 'tabulka.png', { type: 'image/png' }) };
  let pamet: PametFotky;
  let fetchMock: ReturnType<typeof vi.fn>;
  const telo = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);

  beforeEach(() => {
    vi.mocked(zmensenyDataUrl).mockClear();
    vi.mocked(oriznutyDataUrl).mockReset().mockResolvedValue('data:image/jpeg;base64,VYREZ');
    pamet = {};
    fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const b = JSON.parse(init.body);
      return new Response(JSON.stringify(b.rezim === 'tabulka-okno' ? { tabulka: { prepis } } : radkyOdpoved), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('od 10. 10.: krok 1 s celou fotkou, pak výřez 4 řádků, zvětšený, s datem prvního řádku', async () => {
    const v = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(v.stav).toBe('ok');
    if (v.stav !== 'ok') return;
    expect(v.orezano).toBe(true);
    expect(v.radky).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(telo(0)).toMatchObject({ rezim: 'tabulka-okno', imageBase64: 'ANALYZA', imageMimeType: 'image/jpeg' });
    expect(telo(1)).toMatchObject({ rezim: 'tabulka', imageBase64: 'VYREZ', vyrez: true, odData: '2026-10-10', datumOkna: '2026-10-13' });
    expect(telo(1).beers).toEqual([{ id: 's12', name: '12° Světlá', degree: '12°' }]);
    // výřez se bere z obrázku pro čtení a od zvoleného dne (řádky 555–558 = 39 % až 48 %)
    const [zdroj, okno] = vi.mocked(oriznutyDataUrl).mock.calls[0];
    expect(zdroj).toBe('data:image/jpeg;base64,ANALYZA');
    expect(okno.y0).toBeGreaterThan(0.38);
    expect(okno.y1).toBeLessThan(0.49);
  });

  it('obrázek pro čtení je z původního souboru ve větším rozlišení než náhled', async () => {
    await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(zmensenyDataUrl).toHaveBeenCalledWith(foto.soubor, { maxStrana: 2400, kvalita: 0.85, maxZnaku: 4_800_000 });
  });

  it('bez souboru (fotka po ruční úpravě) se čte z náhledu', async () => {
    await ctiTabulkuZFotky({ foto: { dataUrl: 'data:image/png;base64,UPRAVENA' }, odData: '2026-10-10', piva: PIVA, pamet });
    expect(zmensenyDataUrl).not.toHaveBeenCalled();
    expect(telo(0).imageBase64).toBe('UPRAVENA');
    expect(telo(0).imageMimeType).toBe('image/png');
  });

  it('změna data fotku nepřepisuje znovu — krok 1 se neopakuje, obrázek se nezmenšuje znovu', async () => {
    await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    await ctiTabulkuZFotky({ foto, odData: '2026-10-06', piva: PIVA, pamet });
    expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).rezim)).toEqual(['tabulka-okno', 'tabulka', 'tabulka']);
    expect(zmensenyDataUrl).toHaveBeenCalledTimes(1);
    expect(telo(2)).toMatchObject({ odData: '2026-10-06', datumOkna: '2026-10-06' });
  });

  it('po posledním datu není co číst: krok 2 se nevolá, vrátí poslední datum na fotce', async () => {
    const v = await ctiTabulkuZFotky({ foto, odData: '2026-10-14', piva: PIVA, pamet });
    expect(v).toMatchObject({ stav: 'nic-od-data', odData: '2026-10-14', posledniDatum: '2026-10-13' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bez data se čte celá tabulka (výřez od prvního řádku)', async () => {
    const v = await ctiTabulkuZFotky({ foto, odData: null, piva: PIVA, pamet });
    expect(v.stav).toBe('ok');
    expect(telo(1)).toMatchObject({ odData: null, vyrez: true });
  });

  it('Vision nic nepřepsal: čte se celá fotka a „od data" hlídá kód', async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) =>
      new Response(JSON.stringify(JSON.parse(init.body).rezim === 'tabulka-okno' ? { tabulka: { prepis: null } } : radkyOdpoved), { status: 200 }));
    const v = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(v).toMatchObject({ stav: 'ok', orezano: false });
    expect(telo(1)).toMatchObject({ imageBase64: 'ANALYZA', vyrez: false, odData: '2026-10-10', datumOkna: null });
    expect(oriznutyDataUrl).not.toHaveBeenCalled();
  });

  it('výřez se nepodařilo vyrobit: čte se celá fotka', async () => {
    vi.mocked(oriznutyDataUrl).mockResolvedValue(null);
    const v = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(v).toMatchObject({ stav: 'ok', orezano: false });
    expect(telo(1)).toMatchObject({ imageBase64: 'ANALYZA', vyrez: false, datumOkna: null });
  });

  it('chyba funkce: srozumitelná zpráva, žádná výjimka', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'AI nepřečetla tabulku.' }), { status: 502 }));
    const v = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(v).toEqual({ stav: 'chyba', zprava: 'HTTP 502: AI nepřečetla tabulku.' });
  });

  it('spadlé spojení: stav chyba, ne výjimka', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const v = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(v).toEqual({ stav: 'chyba', zprava: 'Failed to fetch' });
  });

  it('chyba kroku 2 po úspěšném kroku 1 nezahodí přepis — další pokus už Vision nevolá', async () => {
    let volani = 0;
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const b = JSON.parse(init.body);
      if (b.rezim === 'tabulka-okno') return new Response(JSON.stringify({ tabulka: { prepis } }), { status: 200 });
      return volani++ === 0 ? new Response('Internal Server Error', { status: 500 }) : new Response(JSON.stringify(radkyOdpoved), { status: 200 });
    });
    const prvni = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(prvni).toMatchObject({ stav: 'chyba' });
    const druhy = await ctiTabulkuZFotky({ foto, odData: '2026-10-10', piva: PIVA, pamet });
    expect(druhy.stav).toBe('ok');
    expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).rezim)).toEqual(['tabulka-okno', 'tabulka', 'tabulka']);
  });
});
