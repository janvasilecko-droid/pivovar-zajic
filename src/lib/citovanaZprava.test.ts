// ↩️ Ke které zprávě patří odpověď z WhatsAppu — sdílené pravidlo serveru a aplikace.
//
// Majitel 18. 11. 2026: „zkontroluj, jak to, že mi to chtělo přiřadit odpověď
// z WhatsAppu ke starší objednávce a ne k té z aktuálního týdne." Odběratelé
// posílají objednávku pořád stejným zněním, takže citaci sedí zprávy z víc
// týdnů. Dřív vyhrála ta, ze které už objednávka vznikla — a odpověď na novou,
// ještě neschválenou zprávu se tak napojila na objednávku z minulého týdne.
import { describe, it, expect } from 'vitest';
import {
  mistoZCitace, normCitace, NEJVIC_STARY_RODIC_MS, vyberRodice, zpravySplnujiciCitaci,
  type ZpravaProVazbu,
} from '../../supabase/functions/_shared/citovana-zprava';

const TEXT = 'Luzec 2 *50 světlé pivo\n1x basa 0,33';
const CITACE = 'Luzec 2 *50 světlé pivo';

const zprava = (id: string, created_at: string, extra: Partial<ZpravaProVazbu> = {}): ZpravaProVazbu => ({
  id, created_at, message_text: TEXT, status: 'parsed', imported_order_id: null, ...extra,
});

// Minulý týden: zpráva schválená, objednávka založená.
const MINULY_TYDEN = zprava('m-26-10', '2026-10-26T08:10:00+00:00', {
  status: 'imported', imported_order_id: 'ord-26-10', parsed_place_id: 'pl-luzec', parsed_place_name: 'Lužec',
});
// Tento týden: tatáž věta, zatím neschválená.
const TENTO_TYDEN = zprava('m-03-11', '2026-11-03T13:45:00+00:00', { parsed_place_id: 'pl-luzec', parsed_place_name: 'Lužec' });

const odpoved = { id: 'r-1', created_at: '2026-11-03T13:47:00+00:00', quoted_text: CITACE };

describe('vyberRodice — odpověď patří k NEJNOVĚJŠÍ zprávě se stejným zněním', () => {
  it('Lužec 3. 11.: nová zpráva čeká na schválení → rodič je ona, bez objednávky (ne objednávka z 26. 10.)', () => {
    const rodic = vyberRodice(odpoved, [MINULY_TYDEN, TENTO_TYDEN]);
    expect(rodic.zprava?.id).toBe('m-03-11');
    expect(rodic.objednavkaId).toBeNull();
    expect(rodic.ceka).toBe(true);
  });

  it('pořadí zpráv ve vstupu nehraje roli', () => {
    expect(vyberRodice(odpoved, [TENTO_TYDEN, MINULY_TYDEN]).zprava?.id).toBe('m-03-11');
    expect(vyberRodice(odpoved, [MINULY_TYDEN, TENTO_TYDEN]).zprava?.id).toBe('m-03-11');
  });

  it('nová zpráva už má objednávku → odpověď patří k ní', () => {
    const schvalena = { ...TENTO_TYDEN, status: 'imported', imported_order_id: 'ord-03-11' };
    const rodic = vyberRodice(odpoved, [MINULY_TYDEN, schvalena]);
    expect(rodic).toMatchObject({ objednavkaId: 'ord-03-11', ceka: false });
    expect(rodic.zprava?.id).toBe('m-03-11');
  });

  it('jediná shoda je starší zpráva s objednávkou → patří k ní', () => {
    const rodic = vyberRodice(odpoved, [MINULY_TYDEN]);
    expect(rodic).toMatchObject({ objednavkaId: 'ord-26-10', ceka: false });
  });

  it('novější zpráva je ignorovaná → nikdy objednávkou nebude, rozhoduje starší s objednávkou', () => {
    const rodic = vyberRodice(odpoved, [MINULY_TYDEN, { ...TENTO_TYDEN, status: 'ignored' }]);
    expect(rodic).toMatchObject({ objednavkaId: 'ord-26-10', ceka: false });
  });

  it('novější zpráva je „imported", ale objednávka je smazaná → přeskočí se', () => {
    const rodic = vyberRodice(odpoved, [MINULY_TYDEN, { ...TENTO_TYDEN, status: 'imported', imported_order_id: null }]);
    expect(rodic.objednavkaId).toBe('ord-26-10');
  });

  it('novější zpráva s chybou čtení se ještě může stát objednávkou → čeká', () => {
    expect(vyberRodice(odpoved, [MINULY_TYDEN, { ...TENTO_TYDEN, status: 'error' }]).ceka).toBe(true);
    expect(vyberRodice(odpoved, [MINULY_TYDEN, { ...TENTO_TYDEN, status: 'pending' }]).ceka).toBe(true);
    expect(vyberRodice(odpoved, [MINULY_TYDEN, { ...TENTO_TYDEN, status: 'processing' }]).ceka).toBe(true);
  });

  it('zpráva bez uvedeného stavu se bere jako čekající', () => {
    const bezStavu = { id: 'x', created_at: TENTO_TYDEN.created_at, message_text: TEXT };
    expect(vyberRodice(odpoved, [MINULY_TYDEN, bezStavu]).ceka).toBe(true);
  });

  it('pátek večer → pondělí ráno: víkendová mezera nezpůsobí, že se čekající zpráva přeskočí', () => {
    const patek = zprava('m-pa', '2026-11-13T17:00:00+00:00');
    const pondeli = { id: 'r-po', created_at: '2026-11-16T05:30:00+00:00', quoted_text: CITACE };
    const rodic = vyberRodice(pondeli, [MINULY_TYDEN, patek]);
    expect(rodic.zprava?.id).toBe('m-pa');
    expect(rodic.ceka).toBe(true);
  });

  it('čekající zpráva stará přes pět dní je spíš zapomenutá → rozhoduje starší s objednávkou', () => {
    const stara = zprava('m-stara', '2026-10-27T08:00:00+00:00');
    const pozdeji = { id: 'r-pozdeji', created_at: new Date(Date.parse(stara.created_at) + NEJVIC_STARY_RODIC_MS + 60_000).toISOString(), quoted_text: CITACE };
    const rodic = vyberRodice(pozdeji, [MINULY_TYDEN, stara]);
    expect(rodic).toMatchObject({ objednavkaId: 'ord-26-10', ceka: false });
  });

  it('nikdo nemá objednávku ani nečeká → vrátí nejnovější shodu (kvůli odběrateli), bez objednávky', () => {
    const ignorovana = { ...TENTO_TYDEN, status: 'ignored' };
    const rodic = vyberRodice(odpoved, [ignorovana]);
    expect(rodic.zprava?.id).toBe('m-03-11');
    expect(rodic).toMatchObject({ objednavkaId: null, ceka: false });
  });

  it('žádná shoda → nic', () => {
    expect(vyberRodice({ ...odpoved, quoted_text: 'Úplně jiná zpráva' }, [MINULY_TYDEN, TENTO_TYDEN]))
      .toEqual({ zprava: null, objednavkaId: null, ceka: false });
  });

  it('zpráva, která přišla ve stejný okamžik nebo po odpovědi, citovaná být nemůže', () => {
    const pozdeji = zprava('m-pozdeji', '2026-11-03T13:50:00+00:00');
    const stejne = zprava('m-stejne', odpoved.created_at);
    expect(vyberRodice(odpoved, [MINULY_TYDEN, pozdeji, stejne]).zprava?.id).toBe('m-26-10');
  });

  it('časy v jiném zápisu (Supabase „+00:00" s mikrosekundami × „Z") se porovnávají jako časy, ne jako text', () => {
    const mikro = zprava('m-mikro', '2026-11-03T13:45:00.123456+00:00');
    const rodic = vyberRodice({ id: 'r-z', created_at: '2026-11-03T13:47:00Z', quoted_text: CITACE }, [MINULY_TYDEN, mikro]);
    expect(rodic.zprava?.id).toBe('m-mikro');
  });

  it('krátká citace se ignoruje', () => {
    expect(vyberRodice({ ...odpoved, quoted_text: 'Ok' }, [MINULY_TYDEN]).zprava).toBeNull();
  });

  it('citace delší než zpráva (zpráva je jen začátek citace) taky sedí', () => {
    const kratka = zprava('m-kratka', '2026-11-03T13:45:00+00:00', { message_text: 'Maneo' });
    const rodic = vyberRodice({ ...odpoved, quoted_text: 'Maneo 2x50 12sv' }, [kratka]);
    expect(rodic.zprava?.id).toBe('m-kratka');
  });
});

describe('normCitace', () => {
  it('malá písmena, bez diakritiky a nadbytečných mezer', () => {
    expect(normCitace('  Lužec   SVĚTLÉ\npivo ')).toBe('luzec svetle pivo');
  });

  it('neviditelné znaky, které WhatsApp vkládá kolem odrážek, nevadí', () => {
    const sNeviditelnymi = 'Malesice\n•⁠  ⁠SV 12 = 2x50l KEG';
    const bez = 'Malesice\n•  SV 12 = 2x50l KEG';
    expect(normCitace(sNeviditelnymi)).toBe(normCitace(bez));
  });

  it('prázdné vstupy', () => {
    expect(normCitace(null)).toBe('');
    expect(normCitace(undefined)).toBe('');
  });
});

describe('zpravySplnujiciCitaci', () => {
  it('vrací shody od nejnovější', () => {
    const ids = zpravySplnujiciCitaci(odpoved, [MINULY_TYDEN, TENTO_TYDEN]).map((m) => m.id);
    expect(ids).toEqual(['m-03-11', 'm-26-10']);
  });
});

describe('mistoZCitace — odběratel pro odpověď bez odběratele', () => {
  it('bere se od rodiče odpovědi (nejnovější zprávy), ne od starší objednávky', () => {
    const jinyOdberatel = { ...TENTO_TYDEN, parsed_place_id: 'pl-seeberg', parsed_place_name: 'Seeberg' };
    expect(mistoZCitace(odpoved, [MINULY_TYDEN, jinyOdberatel])).toMatchObject({ placeId: 'pl-seeberg', placeName: 'Seeberg' });
  });

  it('rodič odběratele nemá (ještě se nepřečetl) → pomůže starší zpráva stejného znění', () => {
    const neprectena = { ...TENTO_TYDEN, parsed_place_id: null, parsed_place_name: null, status: 'pending' };
    const nalez = mistoZCitace(odpoved, [MINULY_TYDEN, neprectena]);
    expect(nalez).toMatchObject({ placeId: 'pl-luzec', placeName: 'Lužec' });
    expect(nalez?.zprava.id).toBe('m-26-10');
  });

  it('starší zprávy se na odběrateli neshodnou → nehádá se', () => {
    const neprectena = { ...TENTO_TYDEN, parsed_place_id: null, parsed_place_name: null, status: 'pending' };
    const jina = zprava('m-jina', '2026-10-20T08:00:00+00:00', { parsed_place_id: 'pl-seeberg', parsed_place_name: 'Seeberg' });
    expect(mistoZCitace(odpoved, [jina, MINULY_TYDEN, neprectena])).toBeNull();
  });

  it('shodu poznáme i podle jména, když chybí id', () => {
    const a = zprava('m-a', '2026-10-20T08:00:00+00:00', { parsed_place_name: 'Lužec' });
    const b = zprava('m-b', '2026-10-27T08:00:00+00:00', { parsed_place_name: 'LUZEC' });
    const neprectena = { ...TENTO_TYDEN, parsed_place_id: null, parsed_place_name: null, status: 'pending' };
    expect(mistoZCitace(odpoved, [a, b, neprectena])?.zprava.id).toBe('m-b');
  });

  it('nikde žádný odběratel → null', () => {
    expect(mistoZCitace(odpoved, [{ ...TENTO_TYDEN, parsed_place_id: null, parsed_place_name: null }])).toBeNull();
  });

  it('žádná citovaná zpráva → null', () => {
    expect(mistoZCitace({ ...odpoved, quoted_text: 'Něco jiného' }, [MINULY_TYDEN, TENTO_TYDEN])).toBeNull();
  });
});
