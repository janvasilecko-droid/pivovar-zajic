// 🔗 Návaznost tachometru po přidání, úpravě a smazání jízdy.
// Pravidlo: změna jízdy posune o svůj rozdíl jen POZDĚJŠÍ jízdy téhož auta
// v témže měsíci; dřívější jízdy, jiná auta a jiné měsíce se nehýbou.
import { describe, expect, it } from 'vitest';
import {
  type JizdaRetezu,
  type ZmenaTachometru,
  poradiVRade,
  posunMesic,
  pouzijZmeny,
  predvyplnUzaverku,
  stavTachometruKDatu,
  zmenyPoPridani,
  zmenyPoSmazani,
  zmenyPoUprave,
} from './knihaJizdRetez';
import { porovnejJizdy } from './knihaJizdUzaverka';

const VELKE = 'Velké auto (Peugeot Boxer / 3K1 2244)';
const KACENA = 'Kačena (Citroën)';

let pocitadlo = 0;
function jizda(id: string, date: string, start: number, ujeto: number, extra: Partial<JizdaRetezu> = {}): JizdaRetezu {
  pocitadlo += 1;
  return {
    id,
    date,
    vehicle_name: VELKE,
    km_start: start,
    km_end: Math.round((start + ujeto) * 10) / 10,
    km_driven: ujeto,
    created_at: `2026-10-01T10:00:${String(pocitadlo).padStart(2, '0')}Z`,
    ...extra,
  };
}

/** Říjen: A 1000→1010, B 1010→1030, C 1030→1040, D 1040→1042,5 (tankování E na 1042,5 za D). */
function rijen(): JizdaRetezu[] {
  return [
    jizda('A', '2026-10-01', 1000, 10),
    jizda('B', '2026-10-05', 1010, 20),
    jizda('C', '2026-10-09', 1030, 10),
    jizda('D', '2026-10-15', 1040, 2.5),
  ];
}

const podleId = (z: ZmenaTachometru[]) => Object.fromEntries(z.map((x) => [x.id, [x.km_start, x.km_end]]));

describe('poradiVRade / porovnejJizdy', () => {
  it('řadí podle data, pak stavu tachometru, pak čas zápisu, pak id', () => {
    const r = [
      jizda('z', '2026-10-05', 1050, 10),
      jizda('a', '2026-10-05', 1040, 10),
      jizda('m', '2026-10-01', 1100, 10),
    ];
    expect(poradiVRade(r).map((x) => x.id)).toEqual(['m', 'a', 'z']);
  });

  it('při shodě začátku je dřív kratší záznam (tankování před jízdou, která odtud vyjíždí)', () => {
    const jede = jizda('jede', '2026-10-05', 1000, 12, { created_at: '2026-10-01T08:00:00Z' });
    const tankuje = jizda('tankuje', '2026-10-05', 1000, 0, { created_at: '2026-10-02T08:00:00Z' });
    expect(poradiVRade([jede, tankuje]).map((x) => x.id)).toEqual(['tankuje', 'jede']);
  });

  it('při úplné shodě rozhodne čas zápisu a nakonec id — pořadí je vždy stejné', () => {
    const a = jizda('b', '2026-10-05', 1000, 0, { created_at: '2026-10-01T08:00:00Z' });
    const b = jizda('a', '2026-10-05', 1000, 0, { created_at: '2026-10-01T08:00:00Z' });
    expect(porovnejJizdy(a, b)).toBeGreaterThan(0);
    expect(porovnejJizdy(b, a)).toBeLessThan(0);
    expect(porovnejJizdy(a, a)).toBe(0);
  });
});

describe('stavTachometruKDatu', () => {
  it('konec poslední jízdy z toho dne nebo dřív', () => {
    const r = rijen();
    expect(stavTachometruKDatu(r, VELKE, '2026-10-05')).toBe(1030); // B je ten den
    expect(stavTachometruKDatu(r, VELKE, '2026-10-07')).toBe(1030);
    expect(stavTachometruKDatu(r, VELKE, '2026-10-30')).toBe(1042.5);
  });

  it('před první jízdou měsíce je to začátek měsíce', () => {
    expect(stavTachometruKDatu(rijen(), VELKE, '2026-10-01')).toBe(1010); // A je ten den → konec A
    const bezPrvniho = rijen().slice(1);
    expect(stavTachometruKDatu(bezPrvniho, VELKE, '2026-10-02')).toBe(1010);
  });

  it('auto bez jízd = null (začátek musí zadat člověk)', () => {
    expect(stavTachometruKDatu(rijen(), KACENA, '2026-10-05')).toBeNull();
    expect(stavTachometruKDatu([], VELKE, '2026-10-05')).toBeNull();
  });

  it('měsíc bez jízd naváže na poslední jízdu před ním, jinak na první po něm', () => {
    const r = rijen();
    expect(stavTachometruKDatu(r, VELKE, '2026-11-03')).toBe(1042.5);
    expect(stavTachometruKDatu(r, VELKE, '2026-09-20')).toBe(1000);
  });

  it('řada se drží uvnitř měsíce — jiný měsíc s jízdami ji neovlivní', () => {
    const r = [...rijen(), jizda('N1', '2026-11-04', 1100, 10)];
    expect(stavTachometruKDatu(r, VELKE, '2026-11-02')).toBe(1100); // před první listopadovou = její začátek
    expect(stavTachometruKDatu(r, VELKE, '2026-11-20')).toBe(1110);
    expect(stavTachometruKDatu(r, VELKE, '2026-10-20')).toBe(1042.5);
  });
});

describe('zmenyPoPridani', () => {
  it('jízda na konec řady nic neposouvá', () => {
    const nova = jizda('N', '2026-10-20', 1042.5, 8);
    expect(zmenyPoPridani(rijen(), nova)).toEqual([]);
  });

  it('jízda doprostřed posune všechny pozdější o svůj rozsah', () => {
    const nova = jizda('N', '2026-10-07', 1030, 7); // mezi B a C
    expect(podleId(zmenyPoPridani(rijen(), nova))).toEqual({ C: [1037, 1047], D: [1047, 1049.5] });
  });

  it('záznam bez ujetých km (tankování) nic neposouvá', () => {
    const tankovani = jizda('T', '2026-10-07', 1030, 0, { fuel_liters: 40 });
    expect(zmenyPoPridani(rijen(), tankovani)).toEqual([]);
  });

  it('jízda na začátek měsíce posune celý měsíc, začátek zůstane', () => {
    const nova = jizda('N', '2026-10-01', 1000, 5, { created_at: '2026-10-01T00:00:00Z' }); // ten den po A? A má start 1000, N také → kratší první
    const z = podleId(zmenyPoPridani(rijen(), nova));
    // N (1000→1005) je před A (1000→1010) → A, B, C, D se posunou o 5
    expect(z).toEqual({ A: [1005, 1015], B: [1015, 1035], C: [1035, 1045], D: [1045, 1047.5] });
  });

  it('jiné auto ani jiný měsíc se nehýbou', () => {
    const jine = [
      ...rijen(),
      jizda('K1', '2026-10-10', 500, 20, { vehicle_name: KACENA }),
      jizda('L1', '2026-11-03', 1043, 10),
    ];
    const nova = jizda('N', '2026-10-07', 1030, 7);
    expect(Object.keys(podleId(zmenyPoPridani(jine, nova))).sort()).toEqual(['C', 'D']);
  });

  it('uzavřená jízda je pevná', () => {
    const r = rijen().map((j) => (j.id === 'D' ? { ...j, uzavreno_at: '2026-11-02T08:00:00Z' } : j));
    const nova = jizda('N', '2026-10-07', 1030, 7);
    expect(Object.keys(podleId(zmenyPoPridani(r, nova)))).toEqual(['C']);
  });

  it('desetiny se nerozjedou (0,1 + 0,2 jsou přesně 0,3)', () => {
    const r = [jizda('A', '2026-10-01', 100.1, 0.2), jizda('B', '2026-10-02', 100.3, 0.1)];
    const nova = jizda('N', '2026-10-01', 100.1, 0.1, { created_at: '2026-10-01T00:00:00Z' });
    // N 100,1→100,2 je před A (100,1→100,3, delší) → A a B se posunou o 0,1
    expect(podleId(zmenyPoPridani(r, nova))).toEqual({ A: [100.2, 100.4], B: [100.4, 100.5] });
  });
});

describe('zmenyPoSmazani', () => {
  it('pozdější jízdy se vrátí o rozsah smazané', () => {
    expect(podleId(zmenyPoSmazani(rijen(), 'B'))).toEqual({ C: [1010, 1020], D: [1020, 1022.5] });
  });

  it('smazání poslední jízdy nic neposouvá', () => {
    expect(zmenyPoSmazani(rijen(), 'D')).toEqual([]);
  });

  it('smazání první jízdy měsíce zachová začátek měsíce — další převezme její začátek', () => {
    const z = podleId(zmenyPoSmazani(rijen(), 'A'));
    expect(z).toEqual({ B: [1000, 1020], C: [1020, 1030], D: [1030, 1032.5] });
  });

  it('neznámé id a uzavřená jízda = beze změny', () => {
    expect(zmenyPoSmazani(rijen(), 'nic')).toEqual([]);
    const r = rijen().map((j) => (j.id === 'B' ? { ...j, uzavreno_at: '2026-11-02T08:00:00Z' } : j));
    expect(zmenyPoSmazani(r, 'B')).toEqual([]);
  });

  it('tankování se maže bez posunu', () => {
    const r = [...rijen(), jizda('T', '2026-10-16', 1042.5, 0, { fuel_liters: 38 })];
    expect(zmenyPoSmazani(r, 'T')).toEqual([]);
  });

  it('smazání nepřepíše zvláštnost mezi pozdějšími jízdami — skok v řadě se jen posune', () => {
    // C si někdo opsal z palubní desky: 1100 místo 1030 (skok +70). Po smazání B se celý konec řady posune o 20.
    const r = [
      jizda('A', '2026-10-01', 1000, 10),
      jizda('B', '2026-10-05', 1010, 20),
      jizda('C', '2026-10-09', 1100, 10),
      jizda('D', '2026-10-15', 1110, 2.5),
    ];
    expect(podleId(zmenyPoSmazani(r, 'B'))).toEqual({ C: [1080, 1090], D: [1090, 1092.5] });
  });
});

describe('zmenyPoUprave', () => {
  it('změna ujetých km posune pozdější jízdy o rozdíl', () => {
    const r = rijen();
    const po = { ...r[1], km_driven: 25 }; // B: 20 → 25
    const v = zmenyPoUprave(r, po);
    expect(v.jizda).toMatchObject({ id: 'B', km_start: 1010, km_end: 1035, km_driven: 25 });
    expect(podleId(v.zmeny)).toEqual({ C: [1035, 1045], D: [1045, 1047.5] });
  });

  it('zkrácení jízdy posune pozdější zpět', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[1], km_driven: 12.5 });
    expect(v.jizda.km_end).toBe(1022.5);
    expect(podleId(v.zmeny)).toEqual({ C: [1022.5, 1032.5], D: [1032.5, 1035] });
  });

  it('úprava textu bez změny km nemění nic', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[1] });
    expect(v.zmeny).toEqual([]);
    expect(v.jizda).toMatchObject({ km_start: 1010, km_end: 1030 });
  });

  it('úprava poslední jízdy neposouvá nic', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[3], km_driven: 9 });
    expect(v.zmeny).toEqual([]);
    expect(v.jizda.km_end).toBe(1049);
  });

  it('přesun na jiný den uvnitř měsíce: jízda se zařadí na nové místo a řada srovná', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[1], date: '2026-10-12' }); // B mezi C (9.) a D (15.)
    expect(v.jizda).toMatchObject({ km_start: 1020, km_end: 1040 }); // začíná tam, kde skončila C po vyndání B
    expect(podleId(v.zmeny)).toEqual({ C: [1010, 1020] }); // D skončí na původních číslech → v seznamu není
  });

  it('přesun na dřívější den', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[2], date: '2026-10-03' }); // C mezi A a B
    expect(v.jizda).toMatchObject({ km_start: 1010, km_end: 1020 });
    expect(podleId(v.zmeny)).toEqual({ B: [1020, 1040] }); // D zůstane (1040) — je to jako dřív
  });

  it('změna auta: ze staré řady jízda zmizí (pozdější se vrátí), v nové se zařadí a posune pozdější', () => {
    const r = [
      ...rijen(),
      jizda('K1', '2026-10-02', 500, 10, { vehicle_name: KACENA }),
      jizda('K2', '2026-10-20', 510, 20, { vehicle_name: KACENA }),
    ];
    const b = r.find((j) => j.id === 'B')!;
    const v = zmenyPoUprave(r, { ...b, vehicle_name: KACENA });
    expect(v.jizda).toMatchObject({ vehicle_name: KACENA, km_start: 510, km_end: 530 }); // tachometr Kačeny ke dni 5. 10.
    expect(podleId(v.zmeny)).toEqual({
      C: [1010, 1020], D: [1020, 1022.5], // Velké auto: o 20 zpět
      K2: [530, 550], // Kačena: o 20 dopředu
    });
  });

  it('změna auta na auto bez jízd: jízda si nechá zadaný začátek', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[1], vehicle_name: KACENA, km_start: 84000 });
    expect(v.jizda).toMatchObject({ vehicle_name: KACENA, km_start: 84000, km_end: 84020 });
    expect(podleId(v.zmeny)).toEqual({ C: [1010, 1020], D: [1020, 1022.5] });
  });

  it('přesun do jiného měsíce vyndá jízdu ze starého a zařadí do nového', () => {
    const r = [...rijen(), jizda('L1', '2026-11-03', 1100, 10), jizda('L2', '2026-11-20', 1110, 10)];
    const v = zmenyPoUprave(r, { ...r[1], date: '2026-11-10' }); // B → listopad mezi L1 a L2
    expect(v.jizda).toMatchObject({ km_start: 1110, km_end: 1130 });
    expect(podleId(v.zmeny)).toEqual({
      C: [1010, 1020], D: [1020, 1022.5],
      L2: [1130, 1140],
    });
  });

  it('nová jízda (id v seznamu není) se chová jako přidání', () => {
    const nova = jizda('N', '2026-10-07', 1030, 7);
    const v = zmenyPoUprave(rijen(), nova);
    expect(v.jizda).toMatchObject({ id: 'N', km_start: 1030, km_end: 1037 });
    expect(podleId(v.zmeny)).toEqual({ C: [1037, 1047], D: [1047, 1049.5] });
  });

  it('uzavřená jízda se nemění vůbec', () => {
    const r = rijen().map((j) => (j.id === 'B' ? { ...j, uzavreno_at: '2026-11-02T08:00:00Z' } : j));
    const v = zmenyPoUprave(r, { ...r[1], km_driven: 99 });
    expect(v.zmeny).toEqual([]);
    expect(v.jizda).toBe(r[1]);
  });

  it('místo v řadě určuje stará podoba: tankování předělané na jízdu přeskočí souseda se stejným začátkem', () => {
    // Ten den: tankování T (3648 → 3648) a krátká jízda K (3648 → 3648,3). Z T se stane jízda 12,4 km.
    // Podle nové podoby by T dojelo až ZA K a nic by se neposunulo; T ale jelo PŘED K, takže K se posune.
    const r = [
      jizda('T', '2026-09-28', 3648, 0, { fuel_liters: 40, created_at: '2026-10-01T10:00:22Z' }),
      jizda('K', '2026-09-28', 3648, 0.3, { created_at: '2026-10-01T10:00:08Z' }),
    ];
    const v = zmenyPoUprave(r, { ...r[0], km_driven: 12.4 });
    expect(v.jizda).toMatchObject({ km_start: 3648, km_end: 3660.4 });
    expect(podleId(v.zmeny)).toEqual({ K: [3660.4, 3660.7] });
  });

  it('změna začátku jízdy, která zůstala na místě, vezme pozdější jízdy s sebou (řada zůstane souvislá)', () => {
    const r = rijen();
    const v = zmenyPoUprave(r, { ...r[1], km_start: 1015 }); // B: 1015 → 1035
    expect(v.jizda).toMatchObject({ km_start: 1015, km_end: 1035 });
    expect(podleId(v.zmeny)).toEqual({ C: [1035, 1045], D: [1045, 1047.5] });
  });
});

describe('pouzijZmeny', () => {
  it('přepíše jen jízdy, které se mění, ostatní vrátí stejné objekty', () => {
    const r = rijen();
    const po = pouzijZmeny(r, [{ id: 'C', km_start: 1, km_end: 2 }]);
    expect(po[2]).toMatchObject({ id: 'C', km_start: 1, km_end: 2, km_driven: 10 });
    expect(po[0]).toBe(r[0]);
    expect(pouzijZmeny(r, [])).toBe(r);
  });
});

describe('posunMesic', () => {
  it('přes hranici roku', () => {
    expect(posunMesic('2026-12', 1)).toBe('2027-01');
    expect(posunMesic('2026-01', -1)).toBe('2025-12');
    expect(posunMesic('2026-10', 0)).toBe('2026-10');
  });
});

describe('predvyplnUzaverku', () => {
  const uz = [{ vehicle_name: VELKE, month: '2026-09', km_start: 900, km_end: 1000 }];

  it('začátek z uzavřeného minulého měsíce má přednost', () => {
    const p = predvyplnUzaverku(rijen(), uz, VELKE, '2026-10');
    expect(p).toMatchObject({ zacatek: 1000, zdrojZacatku: 'uzavreny-mesic', minulyMesic: 1000, nasledny: null });
    expect(p.podleTras).toBe(1042.5); // 1000 + 10 + 20 + 10 + 2,5
  });

  it('bez uzavřeného měsíce z poslední jízdy před měsícem', () => {
    const r = [jizda('P', '2026-09-28', 980, 12), ...rijen()];
    const p = predvyplnUzaverku(r, [], VELKE, '2026-10');
    expect(p).toMatchObject({ zacatek: 992, zdrojZacatku: 'jizda-pred-mesicem', minulyMesic: null });
  });

  it('bez čehokoli jiného ze začátku první jízdy měsíce', () => {
    const p = predvyplnUzaverku(rijen(), [], VELKE, '2026-10');
    expect(p).toMatchObject({ zacatek: 1000, zdrojZacatku: 'prvni-jizda' });
  });

  it('uzavřený další měsíc se ohlásí (konec tohoto musí na něj navázat)', () => {
    const p = predvyplnUzaverku(rijen(), [{ vehicle_name: VELKE, month: '2026-11', km_start: 1050, km_end: 1100 }], VELKE, '2026-10');
    expect(p.nasledny).toBe(1050);
  });

  it('jiné auto se nepletou; auto bez jízd nemá co navrhnout', () => {
    const p = predvyplnUzaverku(rijen(), uz, KACENA, '2026-10');
    expect(p).toEqual({ zacatek: null, zdrojZacatku: null, minulyMesic: null, nasledny: null, podleTras: null });
  });

  it('součet tras bere původní km z trasy, ne dorovnané', () => {
    const r = [jizda('A', '2026-10-01', 1000, 12, { km_trasa: 10 }), jizda('B', '2026-10-05', 1012, 8, { km_trasa: null })];
    expect(predvyplnUzaverku(r, [], VELKE, '2026-10').podleTras).toBe(1018); // 1000 + 10 + 8
  });
});

// ---------------------------------------------------------------------------
// Vlastnost: ať se s jízdami dělá cokoli, řada uvnitř měsíce pořád navazuje.
// ---------------------------------------------------------------------------

function nahoda(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function zkontrolujRady(jizdy: JizdaRetezu[], kontext: string) {
  const klice = new Set(jizdy.map((j) => `${j.vehicle_name}|${j.date.slice(0, 7)}`));
  for (const k of klice) {
    const [auto, mesic] = k.split('|');
    const r = poradiVRade(jizdy.filter((j) => j.vehicle_name === auto && j.date.slice(0, 7) === mesic));
    r.forEach((j, i) => {
      const dobre = Math.round(j.km_start * 10) + Math.round(j.km_driven * 10) === Math.round(j.km_end * 10);
      if (!dobre) throw new Error(`${kontext}: ${j.id} má konec ≠ začátek + ujeto (${j.km_start} + ${j.km_driven} ≠ ${j.km_end})`);
      if (i > 0 && Math.round(r[i - 1].km_end * 10) !== Math.round(j.km_start * 10)) {
        throw new Error(`${kontext}: ${auto} ${mesic}: ${r[i - 1].id} končí na ${r[i - 1].km_end}, ${j.id} začíná na ${j.km_start}`);
      }
    });
  }
}

describe('vlastnost: řada uvnitř měsíce navazuje po libovolné posloupnosti změn', () => {
  const AUTA = [VELKE, KACENA];
  const MESICE = ['2026-09', '2026-10', '2026-11'];
  const UJETO = [0, 0.3, 1.5, 12.4, 30, 85.7];

  it('1000 náhodných posloupností po 40 krocích (přidání, smazání, úprava, přesun, změna auta)', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const rnd = nahoda(seed);
      const vyber = <T,>(pole: T[]) => pole[Math.floor(rnd() * pole.length)];
      let cas = 0;
      const nextId = () => `j${seed}-${(cas += 1)}`;
      const nextCas = () => `2026-10-01T10:${String(Math.floor(cas / 60)).padStart(2, '0')}:${String(cas % 60).padStart(2, '0')}Z`;
      const nahodneDatum = () => `${vyber(MESICE)}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;

      // výchozí stav: každé auto a měsíc má souvislou řadu s vlastním začátkem
      let jizdy: JizdaRetezu[] = [];
      for (const auto of AUTA) {
        for (const mesic of MESICE) {
          let stav = 1000 + Math.floor(rnd() * 5000);
          const pocet = Math.floor(rnd() * 5);
          const dny = Array.from({ length: pocet }, () => 1 + Math.floor(rnd() * 28)).sort((a, b) => a - b);
          for (const den of dny) {
            const ujeto = vyber(UJETO);
            const j = { ...jizda(nextId(), `${mesic}-${String(den).padStart(2, '0')}`, stav, ujeto, { vehicle_name: auto }), created_at: nextCas() };
            jizdy.push(j);
            stav = j.km_end;
          }
        }
      }
      zkontrolujRady(jizdy, `seed ${seed} start`);

      for (let krok = 0; krok < 40; krok += 1) {
        const op = vyber(['pridat', 'pridat', 'smazat', 'upravit', 'upravit', 'presunout', 'zmenitAuto']);
        const popis = `seed ${seed} krok ${krok} (${op})`;
        if (op === 'pridat' || jizdy.length === 0) {
          const auto = vyber(AUTA);
          const date = nahodneDatum();
          const ujeto = vyber(UJETO);
          const start = stavTachometruKDatu(jizdy, auto, date) ?? 5000;
          const nova = { ...jizda(nextId(), date, start, ujeto, { vehicle_name: auto }), created_at: nextCas() };
          const zmeny = zmenyPoPridani(jizdy, nova);
          jizdy = [...pouzijZmeny(jizdy, zmeny), nova];
        } else if (op === 'smazat') {
          const x = vyber(jizdy);
          const zmeny = zmenyPoSmazani(jizdy, x.id);
          jizdy = pouzijZmeny(jizdy.filter((j) => j.id !== x.id), zmeny);
        } else {
          const x = vyber(jizdy);
          const po: JizdaRetezu = { ...x };
          if (op === 'upravit') po.km_driven = vyber(UJETO);
          if (op === 'presunout') po.date = nahodneDatum();
          if (op === 'zmenitAuto') po.vehicle_name = x.vehicle_name === VELKE ? KACENA : VELKE;
          const v = zmenyPoUprave(jizdy, po);
          jizdy = pouzijZmeny(jizdy.map((j) => (j.id === x.id ? v.jizda : j)), v.zmeny);
        }
        zkontrolujRady(jizdy, popis);
      }
    }
  }, 60000);

  it('změna jízdy nikdy nesáhne na jiné auto ani jiný měsíc, než kterých se týká', () => {
    const rnd = nahoda(4242);
    const vyber = <T,>(pole: T[]) => pole[Math.floor(rnd() * pole.length)];
    for (let i = 0; i < 300; i += 1) {
      const jizdy = [
        ...rijen(),
        jizda('K1', '2026-10-02', 500, 10, { vehicle_name: KACENA }),
        jizda('L1', '2026-11-03', 1100, 10),
        jizda('S1', '2026-09-03', 900, 10),
      ];
      const x = vyber(jizdy);
      const po = { ...x, km_driven: vyber([0, 1, 7.7, 50]) };
      const dotcenaAuta = new Set([x.vehicle_name]);
      const dotcenaMesice = new Set([x.date.slice(0, 7)]);
      const v = zmenyPoUprave(jizdy, po);
      for (const z of v.zmeny) {
        const j = jizdy.find((q) => q.id === z.id)!;
        expect(dotcenaAuta.has(j.vehicle_name)).toBe(true);
        expect(dotcenaMesice.has(j.date.slice(0, 7))).toBe(true);
        expect(porovnejJizdy(j, x)).toBeGreaterThan(0); // jen pozdější než upravovaná
      }
    }
  });
});
