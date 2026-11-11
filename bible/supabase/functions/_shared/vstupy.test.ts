// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AKCE, ChybaVstupu, dotazZkusenosti, idDokumentu, idZkusenosti, klicPrehledu, jeAkce, popisDokumentu, predchoziVydani, prekladChybyDb, souborKNahrani, stavDokumentu, zacatekObdobi, zkusenostVstup,
  idZaznamu, parametryVstup, pivovarVstup, postupProvozuVstup, prevzetiVstup, vyberPivovaru, zarizeniVstup,
  datumVstup, hodnotyVarkyVstup, recepturaVstup, varkaVstup,
  overeniVstup, problemVstup, stavZjisteniVstup, urlVstup, webZdrojVstup, zjisteniVstup,
  stropVstup, filtrHledani, filtrMimoKnihu, dodatekKOdeslani,
} from './vstupy';

const SHA = 'a'.repeat(64);
const soubor = (navic: Record<string, unknown> = {}) => ({ nazev: 'Kunze.pdf', jmeno: 'Kunze.pdf', velikost: 1234, mime: 'application/pdf', sha256: SHA, ...navic });

describe('akce a práva', () => {
  it('čtení pro čtenáře, zápis pro přispěvatele, kapacita a útrata jen pro správce', () => {
    expect(AKCE.dokumenty).toBe('cte');
    expect(AKCE.odkaz).toBe('cte');
    expect(AKCE.zalozit_nahrani).toBe('prispiva');
    expect(AKCE.upravit_popis).toBe('prispiva');
    expect(AKCE.kapacita).toBe('spravuje');
    expect(AKCE.naklady).toBe('spravuje');
    // Čtení zpracované knihy smí každý, kdo má přístup (stejně jako stažení originálu).
    expect(AKCE.kniha).toBe('cte');
    expect(AKCE.listy).toBe('cte');
    expect(AKCE.hledej).toBe('cte');
    expect(AKCE.prehledy).toBe('cte');
    expect(AKCE.prehled).toBe('cte');
    expect(AKCE.objekty).toBe('cte');
    // AI sládek: vlastní konverzace každý, kdo má přístup; strop útraty jen správce.
    expect(AKCE.chat_stav).toBe('cte');
    expect(AKCE.konverzace).toBe('cte');
    expect(AKCE.konverzace_detail).toBe('cte');
    expect(AKCE.konverzace_smazat).toBe('cte');
    expect(AKCE.strop_nastavit).toBe('spravuje');
    expect(jeAkce('dokumenty')).toBe(true);
    expect(jeAkce('toString')).toBe(false);
    expect(jeAkce('__proto__')).toBe(false);
    expect(jeAkce(undefined)).toBe(false);
  });
});

describe('filtr hledání (etapa 4b)', () => {
  const ID = '11111111-2222-3333-4444-555555555555';
  it('prázdný = null; hodnoty se očistí a převedou', () => {
    expect(filtrHledani(undefined)).toBeNull();
    expect(filtrHledani({ autor: '  ', jazyk: '', rok_od: null })).toBeNull();
    expect(filtrHledani({ autor: ' Kunze ', rok_od: '1970', rok_do: 1989, jazyk: 'de', druh: 'clanek', oblast: 'D' }, ID.toUpperCase()))
      .toEqual({ dokument: ID, autor: 'Kunze', rok_od: 1970, rok_do: 1989, jazyk: 'de', druh: 'clanek', oblast: 'D' });
    expect(filtrHledani({ dokument: ID })).toEqual({ dokument: ID });
  });
  it('neplatné hodnoty česky odmítne', () => {
    for (const spatny of [{ jazyk: 'fr' }, { druh: 'kniha2' }, { oblast: 'Z' }, { oblast: 'd' }, { rok_od: 1300 }, { rok_do: '20x0' },
      { rok_od: 1990, rok_do: 1980 }, { autor: 'x'.repeat(101) }, { autor: 5 }, { dokument: '1; drop' }]) {
      expect(() => filtrHledani(spatny), JSON.stringify(spatny)).toThrow(ChybaVstupu);
    }
    expect(() => filtrHledani('jazyk=de')).toThrow(ChybaVstupu);
    expect(() => filtrHledani([])).toThrow(ChybaVstupu);
  });
  it('filtr jen knihou umí i hledání před migrací', () => {
    expect(filtrMimoKnihu(null)).toBe(false);
    expect(filtrMimoKnihu({ dokument: ID })).toBe(false);
    expect(filtrMimoKnihu({ dokument: ID, jazyk: 'de' })).toBe(true);
  });
});

describe('dodatek k PDF pro čtečku strany', () => {
  it('bytea z PostgRESTu (\\x…) → base64; nic divného se nepošle', () => {
    expect(dodatekKOdeslani({ delka_originalu: 1000, data: '\\x0a2525454f460a' })).toEqual({ delka_originalu: 1000, data: btoa('\n%%EOF\n') });
    expect(dodatekKOdeslani({ delka_originalu: '1000', data: '\\x0a' })).toEqual({ delka_originalu: 1000, data: 'Cg==' });
    expect(dodatekKOdeslani(null)).toBeNull();
    expect(dodatekKOdeslani({ delka_originalu: 1000, data: null })).toBeNull();
    expect(dodatekKOdeslani({ delka_originalu: 0, data: '\\x0a' })).toBeNull();
    expect(dodatekKOdeslani({ delka_originalu: 1000, data: '\\x0a2' })).toBeNull();
    expect(dodatekKOdeslani({ delka_originalu: 1000, data: '\\xzz' })).toBeNull();
    expect(dodatekKOdeslani({ delka_originalu: 1000, data: '0a25' })).toBeNull();
  });
});

describe('strop útraty za AI', () => {
  it('0 až 1000 USD, na centy, i s desetinnou čárkou', () => {
    expect(stropVstup({ usd: 20 })).toBe(20);
    expect(stropVstup({ usd: '7,555' })).toBe(7.56);
    expect(stropVstup({ usd: 0 })).toBe(0);
    for (const spatne of [-1, 1000.01, 'abc', '', null, undefined, Number.NaN]) expect(() => stropVstup({ usd: spatne })).toThrow(ChybaVstupu);
  });
});

describe('kontrola vstupů', () => {
  it('id dokumentu jen jako uuid', () => {
    expect(idDokumentu({ id: 'AAAAAAAA-1111-2222-3333-444444444444' })).toBe('aaaaaaaa-1111-2222-3333-444444444444');
    expect(() => idDokumentu({ id: "1' OR '1'='1" })).toThrow(ChybaVstupu);
    expect(() => idDokumentu({})).toThrow(ChybaVstupu);
  });

  it('popis bere jen známá pole', () => {
    const p = popisDokumentu({ nazev: 'Kunze', rok: 2016, oblasti: ['A'], stav: 'hotovo', nahral: 'x', pokusy: 9 });
    expect(p).toEqual({ nazev: 'Kunze', autor: null, vydani: null, rok: 2016, isbn: null, jazyk: null, druh: null, oblasti: ['A'], zdroj: null, licence: null });
    expect(Object.keys(p)).not.toContain('stav');
  });

  it.each([
    [{ nazev: '' }, /Název/],
    [{ nazev: 'x', rok: '2016' }, /Rok/],
    [{ nazev: 'x', rok: 20.5 }, /Rok/],
    [{ nazev: 'x', oblasti: 'A' }, /Oblasti/],
    [{ nazev: 'x', oblasti: ['AAA'] }, /Oblasti/],
    [{ nazev: 'x', autor: 5 }, /Autor/],
    [{ nazev: 'x'.repeat(501) }, /dlouhý/],
    [null, /popis/],
  ])('neplatný popis %j', (vstup, chyba) => {
    expect(() => popisDokumentu(vstup)).toThrow(chyba);
  });

  it('soubor: velikost, otisk a bezpečné jméno', () => {
    expect(souborKNahrani(soubor())).toEqual({
      soubor_nazev: 'Kunze.pdf', soubor_jmeno: 'Kunze.pdf', soubor_velikost: 1234, soubor_mime: 'application/pdf', soubor_sha256: SHA,
    });
    expect(() => souborKNahrani(soubor({ velikost: 0 }))).toThrow(/velikost/);
    expect(() => souborKNahrani(soubor({ velikost: '1234' }))).toThrow(/velikost/);
    expect(() => souborKNahrani(soubor({ sha256: 'A'.repeat(64) }))).toThrow(/SHA-256/);
    expect(() => souborKNahrani(soubor({ jmeno: '../auth/x.pdf' }))).toThrow(/jméno/);
    expect(() => souborKNahrani(soubor({ jmeno: '..' }))).toThrow(/jméno/);
    expect(() => souborKNahrani(soubor({ jmeno: 'a b.pdf' }))).toThrow(/jméno/);
    expect(() => souborKNahrani(soubor({ mime: undefined }))).toThrow(/Typ/);
  });

  it('stav ručně jen „čeká" nebo „pozastaveno"', () => {
    expect(stavDokumentu('ceka')).toBe('ceka');
    expect(stavDokumentu('pozastaveno')).toBe('pozastaveno');
    expect(() => stavDokumentu('hotovo')).toThrow(ChybaVstupu);
  });

  it('začátek období útraty', () => {
    const ted = new Date('2026-10-31T12:00:00Z');
    expect(zacatekObdobi('2026-10-01T00:00:00.000Z', ted)).toBe('2026-10-01T00:00:00.000Z');
    expect(() => zacatekObdobi('včera', ted)).toThrow(ChybaVstupu);
    expect(() => zacatekObdobi('1900-01-01', ted)).toThrow(/rozsah/);
    expect(() => zacatekObdobi(5, ted)).toThrow(ChybaVstupu);
  });
});

describe('překlad chyb databáze', () => {
  it.each([
    ['PGRST205', 503, 'bez_migrace'],
    ['PGRST202', 503, 'bez_migrace'],
    ['42P01', 503, 'bez_migrace'],
    ['42501', 403, 'zakazano'],
    ['23505', 409, 'duplicita'],
    ['54000', 413, 'velky_soubor'],
    ['22023', 400, 'neplatny_vstup'],
    ['23514', 400, 'neplatny_vstup'],
    ['XX000', 500, 'chyba'],
  ])('%s → %i %s', (code, status, kod) => {
    expect(prekladChybyDb({ code, message: 'zpráva' })).toMatchObject({ status, kod });
  });
  it('migrace chybí → rada, kde ji spustit', () => {
    expect(prekladChybyDb({ code: 'PGRST205' }).zprava).toMatch(/Databáze bible/);
  });
  it('neznámá chyba neprozradí text z databáze', () => {
    expect(prekladChybyDb({ code: 'XX000', message: 'tajný řádek' }).zprava).not.toMatch(/tajný/);
    expect(prekladChybyDb(null)).toMatchObject({ status: 500 });
  });
});

describe('klíč přehledu', () => {
  it('jen malá písmena, číslice a podtržítko', () => {
    expect(klicPrehledu('chmelovar')).toBe('chmelovar');
    expect(() => klicPrehledu('Chmelovar')).toThrow(ChybaVstupu);
    expect(() => klicPrehledu("x'; drop")).toThrow(ChybaVstupu);
    expect(() => klicPrehledu(undefined)).toThrow(ChybaVstupu);
  });
});

describe('zkušenosti sládků', () => {
  it('čtení pro čtenáře, zápis, úprava a smazání pro přispěvatele', () => {
    expect(AKCE.zkusenosti).toBe('cte');
    expect(AKCE.zkusenost_zapsat).toBe('prispiva');
    expect(AKCE.zkusenost_upravit).toBe('prispiva');
    expect(AKCE.zkusenost_smazat).toBe('prispiva');
  });
  it('zkušenost: výchozí druh a úroveň 4, oblasti bez opakování a seřazené', () => {
    expect(zkusenostVstup({ nazev: 'Pěnění', text: 'Pomohlo snížit výkon.', oblasti: ['F', 'D', 'F'] })).toEqual({
      typ: 'provozni_zkusenost', nazev: 'Pěnění', text: 'Pomohlo snížit výkon.', oblasti: ['D', 'F'], uroven: 4, zdroj: null,
    });
  });
  it('zkušenost: neznámé druhy, oblasti i úrovně se odmítnou, prázdný název taky', () => {
    expect(() => zkusenostVstup({ nazev: 'x', text: 'y', typ: 'tajne' })).toThrow(ChybaVstupu);
    expect(() => zkusenostVstup({ nazev: 'x', text: 'y', oblasti: ['Z'] })).toThrow(ChybaVstupu);
    expect(() => zkusenostVstup({ nazev: 'x', text: 'y', uroven: 6 })).toThrow(ChybaVstupu);
    expect(() => zkusenostVstup({ nazev: 'x', text: 'y', uroven: '4' })).toThrow(ChybaVstupu);
    expect(() => zkusenostVstup({ nazev: '  ', text: 'y' })).toThrow(ChybaVstupu);
    expect(() => zkusenostVstup({ nazev: 'x', text: 'y'.repeat(8001) })).toThrow(ChybaVstupu);
    expect(() => zkusenostVstup(null)).toThrow(ChybaVstupu);
  });
  it('id zkušenosti je uuid', () => {
    expect(idZkusenosti({ id: '3F2504E0-4F89-41D3-9A0C-0305E82C3301' })).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(() => idZkusenosti({ id: 'x' })).toThrow(ChybaVstupu);
  });
  it('dotaz: bez dotazu nejnovější, filtr oblasti a důvěryhodnosti', () => {
    expect(dotazZkusenosti({})).toEqual({ dotaz: null, oblast: null, nejhorsi: 5, volne: false });
    expect(dotazZkusenosti({ dotaz: ' pěnění ', oblast: 'F', nejhorsi: 4 })).toEqual({ dotaz: 'pěnění', oblast: 'F', nejhorsi: 4, volne: false });
    // Volné hledání jen na výslovné přání (Hledání v knihách), ne z „ano" nebo 1.
    expect(dotazZkusenosti({ dotaz: 'proč málo pění', volne: true }).volne).toBe(true);
    expect(dotazZkusenosti({ dotaz: 'pěna', volne: 'ano' }).volne).toBe(false);
    expect(() => dotazZkusenosti({ oblast: 'Z' })).toThrow(ChybaVstupu);
    expect(() => dotazZkusenosti({ nejhorsi: 0 })).toThrow(ChybaVstupu);
    expect(() => dotazZkusenosti({ dotaz: 'x'.repeat(201) })).toThrow(ChybaVstupu);
  });
});

describe('nová vydání (etapa 3c)', () => {
  it('čtení vazeb všem, nastavení přispěvateli (komu dokument patří, hlídá SQL)', () => {
    expect(AKCE.vydani).toBe('cte');
    expect(AKCE.vydani_nastavit).toBe('prispiva');
  });
  it('předchozí vydání: id dokumentu (malými písmeny), null = zrušit, jinak chyba', () => {
    expect(predchoziVydani({ predchozi: '3F2504E0-4F89-41D3-9A0C-0305E82C3301' })).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(predchoziVydani({ predchozi: null })).toBeNull();
    // Chybějící pole nesmí vazbu potichu zrušit.
    expect(() => predchoziVydani({})).toThrow('Chybí předchozí vydání.');
    expect(() => predchoziVydani({ predchozi: 'x' })).toThrow(ChybaVstupu);
    expect(() => predchoziVydani({ predchozi: 7 })).toThrow(ChybaVstupu);
  });
});

describe('technologie pivovaru (etapa 7)', () => {
  const PIV = 'aaaaaaaa-1111-2222-3333-444444444444';
  const ZAR = 'bbbbbbbb-1111-2222-3333-444444444444';

  it('čtení všem, zápis přispěvateli, smazání celého pivovaru jen správci', () => {
    expect(AKCE.technologie).toBe('cte');
    expect(AKCE.pivovar_ulozit).toBe('prispiva');
    expect(AKCE.zarizeni_ulozit).toBe('prispiva');
    expect(AKCE.zarizeni_prevzit).toBe('prispiva');
    expect(AKCE.zarizeni_smazat).toBe('prispiva');
    expect(AKCE.postup_provozu_ulozit).toBe('prispiva');
    expect(AKCE.postup_provozu_smazat).toBe('prispiva');
    expect(AKCE.pivovar_smazat).toBe('spravuje');
  });

  it('chybějící záznam v SQL (P0002) je 404 s českou hláškou', () => {
    expect(prekladChybyDb({ code: 'P0002', message: 'Pivovar neexistuje.' })).toEqual({ status: 404, kod: 'nenalezeno', zprava: 'Pivovar neexistuje.' });
  });

  it('id záznamu a výběr pivovaru jen jako uuid (malými písmeny)', () => {
    expect(idZaznamu({ id: PIV.toUpperCase() }, 'pivovaru')).toBe(PIV);
    expect(() => idZaznamu({ id: 'x' }, 'pivovaru')).toThrow('Chybí id pivovaru.');
    expect(vyberPivovaru({})).toBeNull();
    expect(vyberPivovaru({ pivovar_id: '' })).toBeNull();
    expect(vyberPivovaru({ pivovar_id: PIV })).toBe(PIV);
    expect(() => vyberPivovaru({ pivovar_id: "1' OR 1=1" })).toThrow(ChybaVstupu);
  });

  it('pivovar: oříznutý název, popis, hlavní jen ano/ne', () => {
    expect(pivovarVstup({ nazev: '  Zajíc ', popis: 'Dvounádobová varna', hlavni: true, navic: 1 }))
      .toEqual({ nazev: 'Zajíc', popis: 'Dvounádobová varna', hlavni: true });
    expect(pivovarVstup({ id: PIV, nazev: 'Zajíc' })).toEqual({ id: PIV, nazev: 'Zajíc', popis: null, hlavni: false });
    expect(() => pivovarVstup({ nazev: '  ' })).toThrow('Chybí Název pivovaru.');
    expect(() => pivovarVstup({ nazev: 'Z', hlavni: 'ano' })).toThrow(ChybaVstupu);
    expect(() => pivovarVstup({ nazev: 'x'.repeat(121) })).toThrow(ChybaVstupu);
    expect(() => pivovarVstup(null)).toThrow('Chybí pivovar.');
  });

  it('parametry: číslo zůstane číslem, text textem, bez zdroje „odhad"; nic se nedomýšlí', () => {
    expect(parametryVstup([
      { nazev: ' Objem užitný ', hodnota: 80, jednotka: ' hl ', zdroj: 'sklep' },
      { nazev: 'Materiál', text: ' nerez 1.4301 ' },
    ])).toEqual([
      { nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'sklep' },
      { nazev: 'Materiál', text: 'nerez 1.4301', zdroj: 'odhad' },
    ]);
    expect(parametryVstup(undefined)).toEqual([]);
    expect(() => parametryVstup([{ nazev: 'Objem', hodnota: '80' }])).toThrow('Hodnota parametru „Objem" musí být číslo.');
    expect(() => parametryVstup([{ nazev: 'Objem', hodnota: Number.NaN }])).toThrow(ChybaVstupu);
    expect(() => parametryVstup([{ nazev: 'Objem' }])).toThrow('Parametr „Objem" nemá hodnotu.');
    expect(() => parametryVstup([{ nazev: 'Objem', hodnota: 1, zdroj: 'hadam' }])).toThrow('Neznámý zdroj parametru „Objem".');
    expect(() => parametryVstup([{ hodnota: 1 }])).toThrow(ChybaVstupu);
    expect(() => parametryVstup(Array.from({ length: 41 }, () => ({ nazev: 'a', hodnota: 1 })))).toThrow(ChybaVstupu);
    expect(() => parametryVstup('80 hl')).toThrow(ChybaVstupu);
  });

  it('zařízení: nové potřebuje pivovar, úprava pivovar neposílá; druh a počet se kontrolují', () => {
    expect(zarizeniVstup({ pivovar_id: PIV, druh: 'tank_kvasny', nazev: ' Spilka 1 ', parametry: [{ nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'sklep' }] }))
      .toEqual({ pivovar_id: PIV, druh: 'tank_kvasny', nazev: 'Spilka 1', pocet: 1, parametry: [{ nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'sklep' }], poznamka: null });
    expect(zarizeniVstup({ id: ZAR, pivovar_id: PIV, druh: 'cerpadlo', nazev: 'Čerpadlo', pocet: 2 }))
      .toEqual({ id: ZAR, druh: 'cerpadlo', nazev: 'Čerpadlo', pocet: 2, parametry: [], poznamka: null });
    expect(() => zarizeniVstup({ druh: 'varna', nazev: 'Varna' })).toThrow('Chybí pivovar.');
    expect(() => zarizeniVstup({ pivovar_id: PIV, druh: 'raketa', nazev: 'X' })).toThrow('Neznámý druh zařízení.');
    expect(() => zarizeniVstup({ pivovar_id: PIV, druh: 'varna', nazev: 'X', pocet: 1.5 })).toThrow(ChybaVstupu);
    expect(() => zarizeniVstup({ pivovar_id: PIV, druh: 'varna', nazev: 'X', pocet: 1000 })).toThrow(ChybaVstupu);
  });

  it('převzetí ze Sklepa: pivovar zvlášť, z řádků se id i pivovar zahodí', () => {
    expect(prevzetiVstup({ pivovar_id: PIV, seznam: [{ id: ZAR, pivovar_id: ZAR, druh: 'tank_lezacky', nazev: 'Tank 1' }] }))
      .toEqual({ pivovar: PIV, seznam: [{ druh: 'tank_lezacky', nazev: 'Tank 1', pocet: 1, parametry: [], poznamka: null }] });
    expect(() => prevzetiVstup({ pivovar_id: PIV, seznam: [] })).toThrow(ChybaVstupu);
    expect(() => prevzetiVstup({ seznam: [{ druh: 'varna', nazev: 'V' }] })).toThrow('Chybí pivovar.');
    expect(() => prevzetiVstup({ pivovar_id: PIV, seznam: Array.from({ length: 201 }, (_, i) => ({ druh: 'jine', nazev: `Z${i}` })) })).toThrow(ChybaVstupu);
  });

  it('provozní postup: oblast A–T nebo žádná, kroky povinné', () => {
    expect(postupProvozuVstup({ pivovar_id: PIV, nazev: ' CIP spilky ', oblast: 'L', kroky: '1. Předplach' }))
      .toEqual({ pivovar_id: PIV, nazev: 'CIP spilky', oblast: 'L', kroky: '1. Předplach', zdroj: null });
    expect(postupProvozuVstup({ id: ZAR, nazev: 'X', oblast: '', kroky: 'a', zdroj: 'návod' }))
      .toEqual({ id: ZAR, nazev: 'X', oblast: null, kroky: 'a', zdroj: 'návod' });
    expect(() => postupProvozuVstup({ pivovar_id: PIV, nazev: 'X', oblast: 'Z', kroky: 'a' })).toThrow('Oblast je písmeno A–T.');
    expect(() => postupProvozuVstup({ pivovar_id: PIV, nazev: 'X', kroky: '  ' })).toThrow(ChybaVstupu);
    expect(() => postupProvozuVstup({ nazev: 'X', kroky: 'a' })).toThrow('Chybí pivovar.');
  });
});

describe('receptury a várky (etapa 8)', () => {
  const PIV = 'aaaaaaaa-1111-2222-3333-444444444444';
  const REC = 'bbbbbbbb-1111-2222-3333-444444444444';
  const VAR = 'cccccccc-1111-2222-3333-444444444444';

  it('čtení všem, zápis a smazání přispěvateli (komu záznam patří, hlídá SQL)', () => {
    expect(AKCE.varky).toBe('cte');
    expect(AKCE.receptura_ulozit).toBe('prispiva');
    expect(AKCE.receptura_smazat).toBe('prispiva');
    expect(AKCE.varka_ulozit).toBe('prispiva');
    expect(AKCE.varka_smazat).toBe('prispiva');
  });

  it('dvojí číslo várky (pojistka v indexu) má vlastní hlášku, jinde zůstává ta o souboru', () => {
    expect(prekladChybyDb({ code: '23505', message: 'duplicate key value violates unique constraint "bible_varky_cislo_uniq"' }).zprava).toBe('Várka s tímhle číslem už v evidenci je.');
    expect(prekladChybyDb({ code: '23505', message: 'duplicate key value violates unique constraint "bible_dokumenty_sha256_key"' }).zprava).toBe('Tenhle soubor už v knihovně je.');
  });

  it('receptura: oříznuté texty, cíle v rozsahu, suroviny a kroky jen známých druhů', () => {
    expect(recepturaVstup({
      pivovar_id: PIV, nazev: ' Ležák ', styl: '  ', cil_stupnovitost: 11.2, cil_ibu: null,
      suroviny: [{ druh: 'slad', nazev: ' Plzeňský ', mnozstvi: 180, jednotka: 'kg', kdy: '' }],
      kroky: [{ faze: 'rmutovani', nazev: 'Nástřik', teplota_c: 52, minut: 15, poznamka: ' ' }],
    })).toEqual({
      pivovar_id: PIV, nazev: 'Ležák', styl: null, cil_objem_hl: null, cil_stupnovitost: 11.2, cil_alkohol: null, cil_ibu: null, cil_barva_ebc: null,
      suroviny: [{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: 180, jednotka: 'kg' }],
      kroky: [{ faze: 'rmutovani', nazev: 'Nástřik', teplota_c: 52, minut: 15 }],
      poznamka: null,
    });
    expect(recepturaVstup({ id: REC, nazev: 'X' })).toMatchObject({ id: REC, pivovar_id: null, suroviny: [], kroky: [] });
    expect(() => recepturaVstup({ nazev: ' ' })).toThrow(ChybaVstupu);
    expect(() => recepturaVstup({ nazev: 'X', cil_stupnovitost: '11,2' })).toThrow('Cílová stupňovitost musí být číslo.');
    expect(() => recepturaVstup({ nazev: 'X', cil_stupnovitost: 50 })).toThrow('Cílová stupňovitost je mimo rozsah 1 až 35.');
    expect(() => recepturaVstup({ nazev: 'X', suroviny: [{ druh: 'cukr', nazev: 'Y' }] })).toThrow(ChybaVstupu);
    expect(() => recepturaVstup({ nazev: 'X', suroviny: [{ druh: 'slad', nazev: 'Y', mnozstvi: 0 }] })).toThrow('Množství suroviny „Y" musí být kladné číslo.');
    expect(() => recepturaVstup({ nazev: 'X', kroky: [{ faze: 'rmutovani', nazev: 'Y', teplota_c: 150 }] })).toThrow(ChybaVstupu);
    expect(() => recepturaVstup({ nazev: 'X', kroky: [{ faze: 'vareni', nazev: 'Y' }] })).toThrow(ChybaVstupu);
  });

  it('hodnoty várky: jen klíče z katalogu, čísla v rozsahu, null = nezapsáno', () => {
    expect(hodnotyVarkyVstup({ mladina_p: 11.3, sypani_kg: 180, pivo_ibu: null })).toEqual({ mladina_p: 11.3, sypani_kg: 180 });
    expect(hodnotyVarkyVstup(undefined)).toEqual({});
    expect(() => hodnotyVarkyVstup({ vytezek: 70 })).toThrow('Neznámá hodnota várky „vytezek".');
    expect(() => hodnotyVarkyVstup({ mladina_p: '11,3' })).toThrow(ChybaVstupu);
    expect(() => hodnotyVarkyVstup({ mladina_p: 40 })).toThrow(/mimo rozsah 1 až 35/);
    expect(() => hodnotyVarkyVstup({ kvasnice_generace: 2.5 })).toThrow('Generace kvasnic musí být celé číslo.');
    expect(() => hodnotyVarkyVstup([1])).toThrow(ChybaVstupu);
  });

  it('datum varu: skutečný den ve tvaru RRRR-MM-DD, 1990–2100', () => {
    expect(datumVstup('2026-11-03', 'Datum varu')).toBe('2026-11-03');
    expect(() => datumVstup('2026-02-30', 'Datum varu')).toThrow('Datum varu není platné datum.');
    expect(() => datumVstup('3. 11. 2026', 'Datum varu')).toThrow(ChybaVstupu);
    expect(() => datumVstup('1980-01-01', 'Datum varu')).toThrow('Datum varu je mimo rozsah.');
  });

  it('várka: pivo a datum povinné, číslo oříznuté, hodnoty z katalogu', () => {
    expect(varkaVstup({ pivovar_id: PIV, receptura_id: REC, cislo: ' 12 ', pivo: ' Ležák ', datum_varu: '2026-11-03', hodnoty: { mladina_p: 11.3 }, poznamka: '' }))
      .toEqual({ pivovar_id: PIV, receptura_id: REC, cislo: '12', pivo: 'Ležák', datum_varu: '2026-11-03', hodnoty: { mladina_p: 11.3 }, poznamka: null });
    expect(varkaVstup({ id: VAR, pivo: 'Ležák', datum_varu: '2026-11-03' })).toEqual({
      id: VAR, pivovar_id: null, receptura_id: null, cislo: null, pivo: 'Ležák', datum_varu: '2026-11-03', hodnoty: {}, poznamka: null,
    });
    expect(() => varkaVstup({ datum_varu: '2026-11-03' })).toThrow(ChybaVstupu);
    expect(() => varkaVstup({ pivo: 'Ležák' })).toThrow('Datum varu chybí nebo není datum.');
    expect(() => varkaVstup({ pivo: 'Ležák', datum_varu: '2026-11-03', receptura_id: 'x' })).toThrow(ChybaVstupu);
  });
});

describe('rešerše z internetu a analýza problémů (etapy 9 a 10)', () => {
  const W = 'aaaaaaaa-1111-2222-3333-444444444444';
  const P = 'bbbbbbbb-1111-2222-3333-444444444444';
  const V = 'cccccccc-1111-2222-3333-444444444444';

  it('práva: čtení všem, zápis přispěvateli, ověření zdroje jen správci', () => {
    expect(AKCE.web_zdroje).toBe('cte');
    expect(AKCE.web_zdroj_ulozit).toBe('prispiva');
    expect(AKCE.web_zdroj_overit).toBe('spravuje');
    expect(AKCE.web_zdroj_smazat).toBe('prispiva');
    expect(AKCE.problemy).toBe('cte');
    for (const a of ['problem_ulozit', 'problem_smazat', 'zjisteni_ulozit', 'zjisteni_stav', 'zjisteni_smazat'] as const) expect(AKCE[a]).toBe('prispiva');
  });

  it('adresa: jen http(s), bez mezer, se skutečným hostitelem', () => {
    expect(urlVstup(' https://example.org/a?b=1 ')).toBe('https://example.org/a?b=1');
    expect(() => urlVstup('javascript:alert(1)')).toThrow(ChybaVstupu);
    expect(() => urlVstup('https://exa mple.org')).toThrow(ChybaVstupu);
    expect(() => urlVstup('https://localhost/x')).toThrow('Adresa zdroje není platná webová adresa.');
    expect(() => urlVstup(5)).toThrow('Chybí adresa zdroje.');
  });

  it('webový zdroj: povinné titulek a shrnutí, důvěra 1–5 (výchozí 5), oblasti A–T', () => {
    expect(webZdrojVstup({ url: 'https://example.org/a', titulek: ' A ', shrnuti: ' S ', oblasti: ['F', 'D', 'F'], duvera: 3, datum_publikace: '2025-04-01' }))
      .toEqual({ url: 'https://example.org/a', titulek: 'A', vydavatel: null, datum_publikace: '2025-04-01', shrnuti: 'S', oblasti: ['D', 'F'], duvera: 3 });
    expect(webZdrojVstup({ id: W, url: 'https://example.org/a', titulek: 'A', shrnuti: 'S' })).toMatchObject({ id: W, duvera: 5, oblasti: [] });
    expect(() => webZdrojVstup({ url: 'https://example.org/a', titulek: 'A', shrnuti: 'S', duvera: 6 })).toThrow('Důvěra je celé číslo 1 až 5.');
    expect(() => webZdrojVstup({ url: 'https://example.org/a', titulek: 'A', shrnuti: ' ' })).toThrow(ChybaVstupu);
    expect(() => webZdrojVstup({ url: 'https://example.org/a', titulek: 'A', shrnuti: 'S', datum_publikace: '1. 4. 2025' })).toThrow(ChybaVstupu);
  });

  it('ověření zdroje: známý stav a nepovinná poznámka', () => {
    expect(overeniVstup({ id: W, stav: 'overeno', poznamka: ' ok ' })).toEqual({ id: W, stav: 'overeno', poznamka: 'ok' });
    expect(() => overeniVstup({ id: W, stav: 'jiste' })).toThrow('Neznámý stav zdroje.');
  });

  it('problém: název povinný, várky jen id (bez opakování, nejvýš 12), stav ze seznamu', () => {
    expect(problemVstup({ nazev: ' Výtěžek ', varky: [V, V.toUpperCase()], oblasti: ['T'] }))
      .toEqual({ nazev: 'Výtěžek', popis: null, pivo: null, varky: [V], oblasti: ['T'], stav: 'otevreny', reseni: null });
    expect(() => problemVstup({ nazev: 'X', varky: ['x'] })).toThrow(ChybaVstupu);
    expect(() => problemVstup({ nazev: 'X', stav: 'hotovo' })).toThrow('Neznámý stav problému.');
    expect(() => problemVstup({ nazev: ' ' })).toThrow(ChybaVstupu);
  });

  it('zjištění: typ ze šesti, fakt a výpočet jen se zdrojem; stav zjištění ze seznamu', () => {
    expect(zjisteniVstup({ problem_id: P, typ: 'hypoteza', text: ' Hrubý šrot. ' })).toEqual({ problem_id: P, typ: 'hypoteza', text: 'Hrubý šrot.', zdroj: null });
    expect(zjisteniVstup({ problem_id: P, typ: 'fakt', text: 'X', zdroj: 'Kunze, s. 158' })).toMatchObject({ zdroj: 'Kunze, s. 158' });
    expect(() => zjisteniVstup({ problem_id: P, typ: 'fakt', text: 'X' })).toThrow('Fakt a výpočet potřebují zdroj (kniha a strana, várka, výpočet…).');
    expect(() => zjisteniVstup({ problem_id: P, typ: 'domnenka', text: 'X' })).toThrow(ChybaVstupu);
    expect(() => zjisteniVstup({ typ: 'chybi', text: 'X' })).toThrow('Chybí problém.');
    expect(stavZjisteniVstup({ id: P, stav: 'vyvraceno' })).toEqual({ id: P, stav: 'vyvraceno' });
    expect(() => stavZjisteniVstup({ id: P, stav: 'mozna' })).toThrow(ChybaVstupu);
  });
});
