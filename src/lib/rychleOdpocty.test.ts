// Rychlé odpočty v liště na ploše (28. 9. 2026): CO2 2 min, kotel 2 min,
// malý sud 8 min, velký sud 10 min (původně 15).
//
// 18. 11. 2026, majitel: „jak jsou nahoře odpočty sudů, ať je tam volba
// různých libovolných odpočtů" — nastavení lišty (schovat, přepsat délku,
// vlastní odpočty, jednorázový odpočet).
import { describe, it, expect } from 'vitest';
import {
  BEZ_NASTAVENI, MAX_DELKA_MS, MAX_POPIS, MAX_VLASTNICH, MIN_DELKA_MS, RYCHLE_ODPOCTY,
  kratkyCas, normalizujNastaveni, popisDelky, prepniRychlyOdpocet, rychlyBezi, rychlyOdpocet,
  rychlyZbyva, seznamRychlychOdpoctu, spustJednorazovy, stitekDelky, vsechnyRychle,
  type NastaveniRychlychOdpoctu,
} from './rychleOdpocty';
import {
  delkaDoPole, maUpravenaVychozi, nastavDelku, nastavViditelnost, parsujDelku, prejmenujVlastni, pridejVlastni,
  smazVlastni, vratVychozi,
} from './rychleOdpoctyUpravy';
import { zastavOdpocetVSeznamu, CO2_ID } from './co2Foukani';

const MIN = 60_000;

describe('rychlé odpočty', () => {
  it('mají délky podle zadání', () => {
    expect(RYCHLE_ODPOCTY.map((r) => [r.kratce, r.delkaMs / MIN])).toEqual([
      ['CO2', 2], ['Kotel', 2], ['Malý sud', 8], ['Velký sud', 10],
    ]);
  });

  it('klepnutí spustí, další zastaví a odpočet zmizí', () => {
    const ted = 1_000_000;
    const bezi = prepniRychlyOdpocet([], 'rychly-sud-velky', ted);
    expect(rychlyBezi(bezi, 'rychly-sud-velky')).toBe(true);
    expect(bezi[0].targetAt).toBe(ted + 10 * MIN);
    expect(prepniRychlyOdpocet(bezi, 'rychly-sud-velky', ted)).toEqual([]);
  });

  it('CO2 z lišty je tentýž odpočet jako dlaždice CO2', () => {
    const bezi = prepniRychlyOdpocet([], CO2_ID);
    expect(bezi[0].id).toBe(CO2_ID);
  });

  it('běží víc naráz a jeden neshodí druhý', () => {
    let l = prepniRychlyOdpocet([], 'rychly-kotel');
    l = prepniRychlyOdpocet(l, 'rychly-sud-maly');
    expect(l.map((t) => t.id).sort()).toEqual(['rychly-kotel', 'rychly-sud-maly']);
    l = prepniRychlyOdpocet(l, 'rychly-kotel');
    expect(l.map((t) => t.id)).toEqual(['rychly-sud-maly']);
  });

  it('klepnutí na pásek upozornění rychlý odpočet smaže (jako CO2)', () => {
    const l = prepniRychlyOdpocet([], 'rychly-sud-maly');
    expect(zastavOdpocetVSeznamu(l, 'rychly-sud-maly')).toEqual([]);
  });

  it('neběžící ukazuje celou délku', () => {
    expect(rychlyZbyva([], 'rychly-sud-maly')).toBe(8 * MIN);
  });
});

// ── Nastavení lišty ─────────────────────────────────────────────────────────

const SEK = 1000;
const HOD = 60 * MIN;

describe('lišta bez nastavení', () => {
  it('ukazuje výchozí odpočty, CO2 jen když je modul zapnutý', () => {
    expect(seznamRychlychOdpoctu(BEZ_NASTAVENI, { co2: false }).map((r) => r.kratce)).toEqual(['Kotel', 'Malý sud', 'Velký sud']);
    expect(seznamRychlychOdpoctu(BEZ_NASTAVENI, { co2: true }).map((r) => r.kratce)).toEqual(['CO2', 'Kotel', 'Malý sud', 'Velký sud']);
  });
});

describe('schování a délka výchozích odpočtů', () => {
  it('schovaný odpočet z lišty zmizí, ale pořád se dá najít (může běžet)', () => {
    const n = nastavViditelnost(BEZ_NASTAVENI, 'rychly-kotel', false);
    expect(seznamRychlychOdpoctu(n).map((r) => r.id)).not.toContain('rychly-kotel');
    expect(rychlyOdpocet('rychly-kotel', n)?.popis).toBe('Kotel');
    expect(vsechnyRychle(n).find((r) => r.id === 'rychly-kotel')?.viditelny).toBe(false);
  });

  it('znovu ukázaný odpočet se vrátí do lišty a seznam skrytých se nezanáší', () => {
    const n = nastavViditelnost(nastavViditelnost(BEZ_NASTAVENI, 'rychly-kotel', false), 'rychly-kotel', true);
    expect(n.skryte).toEqual([]);
    expect(seznamRychlychOdpoctu(n).map((r) => r.id)).toContain('rychly-kotel');
  });

  it('přepsaná délka platí při spuštění i při zobrazení zbývajícího času', () => {
    const { nastaveni: n, chyba } = nastavDelku(BEZ_NASTAVENI, 'rychly-sud-velky', 12 * MIN);
    expect(chyba).toBeNull();
    expect(rychlyZbyva([], 'rychly-sud-velky', n)).toBe(12 * MIN);
    const ted = 5_000_000;
    const bezi = prepniRychlyOdpocet([], 'rychly-sud-velky', ted, n);
    expect(bezi[0].targetAt).toBe(ted + 12 * MIN);
    expect(bezi[0].durationMs).toBe(12 * MIN);
    expect(bezi[0].initialDurationMs).toBe(12 * MIN);
    // Bez nastavení zůstává původních deset minut.
    expect(prepniRychlyOdpocet([], 'rychly-sud-velky', ted)[0].targetAt).toBe(ted + 10 * MIN);
  });

  it('délka rovná původní se jako přepsání neukládá', () => {
    const upraveno = nastavDelku(BEZ_NASTAVENI, 'rychly-kotel', 3 * MIN).nastaveni;
    expect(upraveno.delky).toEqual({ 'rychly-kotel': 3 * MIN });
    const zpet = nastavDelku(upraveno, 'rychly-kotel', 2 * MIN).nastaveni;
    expect(zpet.delky).toEqual({});
    expect(maUpravenaVychozi(zpet)).toBe(false);
  });

  it('délka foukání CO2 je pevná (je to totéž co dlaždice CO2)', () => {
    const v = nastavDelku(BEZ_NASTAVENI, CO2_ID, 5 * MIN);
    expect(v.chyba).toMatch(/pevná/);
    expect(v.nastaveni).toBe(BEZ_NASTAVENI);
  });

  it('nesmyslná délka se odmítne', () => {
    expect(nastavDelku(BEZ_NASTAVENI, 'rychly-kotel', MIN_DELKA_MS - 1).chyba).toMatch(/10 sekund do 24 hodin/);
    expect(nastavDelku(BEZ_NASTAVENI, 'rychly-kotel', MAX_DELKA_MS + 1).chyba).toMatch(/10 sekund do 24 hodin/);
    expect(nastavDelku(BEZ_NASTAVENI, 'rychly-kotel', Number.NaN).chyba).not.toBeNull();
  });

  it('vrátit výchozí: všechny zpět v liště s původní délkou, vlastní zůstanou', () => {
    let n: NastaveniRychlychOdpoctu = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN, 1).nastaveni;
    const vlastniId = n.vlastni[0].id;
    n = nastavViditelnost(n, 'rychly-kotel', false);
    n = nastavViditelnost(n, vlastniId, false);
    n = nastavDelku(n, 'rychly-sud-maly', 9 * MIN).nastaveni;
    expect(maUpravenaVychozi(n)).toBe(true);
    const zpet = vratVychozi(n);
    expect(zpet.delky).toEqual({});
    expect(zpet.skryte).toEqual([vlastniId]);
    expect(zpet.vlastni).toHaveLength(1);
    expect(maUpravenaVychozi(zpet)).toBe(false);
  });
});

describe('vlastní odpočty', () => {
  it('přibývají za výchozími a běží jako ostatní', () => {
    const { nastaveni: n, chyba } = pridejVlastni(BEZ_NASTAVENI, '  Chmel   15 ', 15 * MIN, 1_000);
    expect(chyba).toBeNull();
    const seznam = seznamRychlychOdpoctu(n);
    expect(seznam.map((r) => r.popis)).toEqual(['Kotel', 'Sud malý', 'Sud velký', 'Chmel 15']);
    const vlastni = seznam[3];
    expect(vlastni.id.startsWith('rychly-vlastni-')).toBe(true);
    expect(vlastni.delkaMs).toBe(15 * MIN);

    const ted = 10_000;
    const bezi = prepniRychlyOdpocet([], vlastni.id, ted, n);
    expect(rychlyBezi(bezi, vlastni.id)).toBe(true);
    expect(bezi[0]).toMatchObject({ label: 'Chmel 15', durationMs: 15 * MIN, targetAt: ted + 15 * MIN });
    // Další klepnutí zastaví a odpočet zmizí — jako u ostatních.
    expect(prepniRychlyOdpocet(bezi, vlastni.id, ted, n)).toEqual([]);
  });

  it('po klepnutí na pásek upozornění se vlastní odpočet smaže (předpona rychly-)', () => {
    const n = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN).nastaveni;
    const id = n.vlastni[0].id;
    const bezi = prepniRychlyOdpocet([], id, 1, n);
    expect(zastavOdpocetVSeznamu(bezi, id)).toEqual([]);
  });

  it('prázdný název, moc dlouhý název, špatný čas a plný seznam se odmítnou', () => {
    expect(pridejVlastni(BEZ_NASTAVENI, '   ', 5 * MIN).chyba).toMatch(/název/i);
    expect(pridejVlastni(BEZ_NASTAVENI, 'x'.repeat(MAX_POPIS + 1), 5 * MIN).chyba).toMatch(/dlouhý/);
    expect(pridejVlastni(BEZ_NASTAVENI, 'Chmel', 1_000).chyba).toMatch(/10 sekund/);
    let n: NastaveniRychlychOdpoctu = BEZ_NASTAVENI;
    for (let i = 0; i < MAX_VLASTNICH; i++) n = pridejVlastni(n, `O${i}`, 5 * MIN, i + 1).nastaveni;
    expect(n.vlastni).toHaveLength(MAX_VLASTNICH);
    expect(pridejVlastni(n, 'Navíc', 5 * MIN).chyba).toMatch(/nejvíc/);
  });

  it('každý vlastní odpočet má jiné id, i když se přidají ve stejnou milisekundu', () => {
    let n: NastaveniRychlychOdpoctu = BEZ_NASTAVENI;
    for (let i = 0; i < 6; i++) n = pridejVlastni(n, `O${i}`, 5 * MIN, 42).nastaveni;
    expect(new Set(n.vlastni.map((v) => v.id)).size).toBe(6);
  });

  it('smazání odstraní odpočet i jeho záznam o schování; výchozí se smazat nedají', () => {
    let n = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN).nastaveni;
    const id = n.vlastni[0].id;
    n = nastavViditelnost(n, id, false);
    const po = smazVlastni(n, id);
    expect(po.vlastni).toEqual([]);
    expect(po.skryte).toEqual([]);
    expect(smazVlastni(n, 'rychly-kotel')).toBe(n);
  });

  it('jde přejmenovat a přepsat jeho délku', () => {
    let n = pridejVlastni(BEZ_NASTAVENI, 'Chmel', 15 * MIN).nastaveni;
    const id = n.vlastni[0].id;
    n = prejmenujVlastni(n, id, ' Chmelení ').nastaveni;
    n = nastavDelku(n, id, 20 * MIN).nastaveni;
    expect(n.vlastni[0]).toMatchObject({ popis: 'Chmelení', delkaMs: 20 * MIN });
    expect(prejmenujVlastni(n, id, '  ').chyba).toMatch(/název/i);
  });
});

describe('normalizujNastaveni — co přijde z úložiště nebo z cloudu', () => {
  it('cokoli nesmyslného je výchozí lišta', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}]) {
      expect(normalizujNastaveni(raw)).toEqual({ skryte: [], delky: {}, vlastni: [] });
    }
  });

  it('zahodí neplatné části a nechá platné', () => {
    const n = normalizujNastaveni({
      skryte: ['rychly-kotel', 'rychly-kotel', 7, '', null],
      delky: { 'rychly-kotel': 180_000, 'rychly-sud-maly': 1, [CO2_ID]: 600_000, 'neznamy': 120_000 },
      vlastni: [
        { id: 'rychly-vlastni-a', popis: '  Chmel  ', delkaMs: 900_000 },
        { id: 'rychly-vlastni-a', popis: 'Duplicita', delkaMs: 900_000 },
        { id: 'jine-id', popis: 'Cizí předpona', delkaMs: 900_000 },
        { id: 'rychly-vlastni-b', popis: '', delkaMs: 900_000 },
        { id: 'rychly-vlastni-c', popis: 'Moc krátké', delkaMs: 500 },
        'nesmysl',
      ],
    });
    expect(n.skryte).toEqual(['rychly-kotel']);
    expect(n.delky).toEqual({ 'rychly-kotel': 180_000 });
    expect(n.vlastni).toEqual([{ id: 'rychly-vlastni-a', popis: 'Chmel', delkaMs: 900_000 }]);
  });

  it('počet vlastních odpočtů se ořízne na maximum a dlouhý název na MAX_POPIS', () => {
    const vlastni = Array.from({ length: MAX_VLASTNICH + 5 }, (_, i) => ({ id: `rychly-vlastni-${i}`, popis: 'N'.repeat(40), delkaMs: 60_000 }));
    const n = normalizujNastaveni({ vlastni });
    expect(n.vlastni).toHaveLength(MAX_VLASTNICH);
    expect(n.vlastni[0].popis).toHaveLength(MAX_POPIS);
  });

  it('platné nastavení projde beze změny (i po průchodu JSON)', () => {
    const n = pridejVlastni(nastavDelku(BEZ_NASTAVENI, 'rychly-kotel', 150_000).nastaveni, 'Chmel', 15 * MIN, 7).nastaveni;
    expect(normalizujNastaveni(JSON.parse(JSON.stringify(n)))).toEqual(n);
  });
});

describe('jednorázový odpočet', () => {
  it('běží vedle ostatních a každý má své id', () => {
    const ted = 1_700_000_000_000;
    let l = spustJednorazovy([], 'Vaření', 25 * MIN, ted);
    l = spustJednorazovy(l, 'Vaření', 25 * MIN, ted);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ label: 'Vaření', durationMs: 25 * MIN, targetAt: ted + 25 * MIN, notifiedAt: null });
    expect(l[0].id).not.toBe(l[1].id);
    expect(l.every((t) => t.id.startsWith('rychly-'))).toBe(true);
  });

  it('bez názvu se pojmenuje podle délky', () => {
    expect(spustJednorazovy([], '  ', 90 * SEK, 1)[0].label).toBe('Odpočet 1 min 30 s');
  });

  it('nesmyslný čas nic nespustí', () => {
    expect(spustJednorazovy([], 'x', 1_000, 1)).toEqual([]);
    expect(spustJednorazovy([], 'x', MAX_DELKA_MS + 1, 1)).toEqual([]);
  });

  it('po klepnutí na pásek upozornění zmizí', () => {
    const l = spustJednorazovy([], 'Vaření', 25 * MIN, 1);
    expect(zastavOdpocetVSeznamu(l, l[0].id)).toEqual([]);
  });
});

describe('zápis a čtení času', () => {
  it('parsujDelku: minuty, desetinná čárka i tečka, jednotky', () => {
    expect(parsujDelku('8')).toBe(8 * MIN);
    expect(parsujDelku(' 7,5 ')).toBe(7 * MIN + 30 * SEK);
    expect(parsujDelku('7.5')).toBe(7 * MIN + 30 * SEK);
    expect(parsujDelku('30 s')).toBe(30 * SEK);
    expect(parsujDelku('30s')).toBe(30 * SEK);
    expect(parsujDelku('45 sek')).toBe(45 * SEK);
    expect(parsujDelku('2 h')).toBe(2 * HOD);
    expect(parsujDelku('1,5h')).toBe(90 * MIN);
    expect(parsujDelku('90 min')).toBe(90 * MIN);
    expect(parsujDelku('2 hodiny')).toBe(2 * HOD);
  });

  it('parsujDelku: co se nedá přečíst nebo je nulové, je null', () => {
    for (const x of ['', '  ', 'abc', '8 dní', '-5', '0', '0 s', '1:30', '8 min 30']) {
      expect(parsujDelku(x), x).toBeNull();
    }
  });

  it('popisDelky: slovy', () => {
    expect(popisDelky(45 * SEK)).toBe('45 s');
    expect(popisDelky(8 * MIN)).toBe('8 min');
    expect(popisDelky(90 * SEK)).toBe('1 min 30 s');
    expect(popisDelky(90 * MIN)).toBe('1 h 30 min');
    expect(popisDelky(2 * HOD)).toBe('2 h');
  });

  it('delkaDoPole: minuty s čárkou', () => {
    expect(delkaDoPole(8 * MIN)).toBe('8');
    expect(delkaDoPole(7 * MIN + 30 * SEK)).toBe('7,5');
    expect(delkaDoPole(30 * SEK)).toBe('0,5');
    expect(parsujDelku(delkaDoPole(7 * MIN + 30 * SEK))).toBe(7 * MIN + 30 * SEK);
  });

  it('kratkyCas a stitekDelky se vejdou do kulatého tlačítka', () => {
    expect(kratkyCas(9 * MIN + 59 * SEK)).toBe('9:59');
    expect(kratkyCas(59 * MIN + 59 * SEK)).toBe('59:59');
    expect(kratkyCas(80 * MIN)).toBe('1h20');
    expect(kratkyCas(23 * HOD + 59 * MIN)).toBe('23h59');
    expect(kratkyCas(-5)).toBe('0:00');
    expect(stitekDelky(15 * MIN)).toBe('15′');
    expect(stitekDelky(45 * SEK)).toBe('45s');
    expect(stitekDelky(90 * SEK)).toBe('1:30');
    expect(stitekDelky(2 * HOD)).toBe('2h00');
    for (const ms of [10 * SEK, 59 * SEK, 5 * MIN, 99 * MIN, 24 * HOD]) {
      expect(stitekDelky(ms).length).toBeLessThanOrEqual(5);
      expect(kratkyCas(ms).length).toBeLessThanOrEqual(5);
    }
  });
});
