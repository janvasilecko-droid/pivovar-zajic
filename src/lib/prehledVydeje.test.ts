import { describe, it, expect } from 'vitest';
import {
  sestavPrehled, prehledDoTsv, soucty, formatDatum, cisloProTabulku,
  type ObalPrehled, type VydejRadek,
} from './prehledVydeje';

const OBALY: ObalPrehled[] = [
  { id: 'k50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 },
  { id: 'k30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
  { id: 'l05', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
  { id: 'p15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5 },
  { id: 'l033', label: 'Lahev 0,33 l', kind: 'bottle', volume_l: 0.33 },
  { id: 'divny', label: 'Sud 25 l', kind: 'keg', volume_l: 25 },
];

const radky: VydejRadek[] = [
  { entry_date: '2026-08-03', beer_id: 'b11', beer_name: '11° Světlá', package_id: 'k30', quantity: 2, who: 'Novák' },
  { entry_date: '2026-08-03', beer_id: 'b11', beer_name: '11° Světlá', package_id: 'l05', quantity: 20, who: 'Novák' },
  { entry_date: '2026-08-03', beer_id: 'b12', beer_name: '12° Polotmavá', package_id: 'k50', quantity: 1, who: 'Novák' },
  { entry_date: '2026-08-05', beer_id: 'b11', beer_name: '11° Světlá', package_id: 'p15', quantity: 4, who: 'Prodejna' },
];

describe('sestavení přehledu', () => {
  it('sloučí zápisy téhož piva témuž odběrateli v jeden den do jednoho řádku', () => {
    const v = sestavPrehled(radky, OBALY, { od: '2026-08-01', do: '2026-08-31' });
    expect(v).toHaveLength(3); // Novák/11°, Novák/12°, Prodejna/11°
    const novak11 = v.find((r) => r.odberatel === 'Novák' && r.pivo === '11° Světlá')!;
    expect(novak11.kusy[30]).toBe(2);
    expect(novak11.kusy[0.5]).toBe(20);
  });

  it('hektolitry počítá zvlášť za sudy a za lahve', () => {
    const v = sestavPrehled(radky, OBALY, { od: '2026-08-01', do: '2026-08-31' });
    const novak11 = v.find((r) => r.odberatel === 'Novák' && r.pivo === '11° Světlá')!;
    expect(novak11.sudyL).toBe(60);   // 2 × 30 l
    expect(novak11.lahveL).toBe(10);  // 20 × 0,5 l
  });

  it('řadí podle data, pak odběratele a piva', () => {
    const v = sestavPrehled(radky, OBALY, { od: '2026-08-01', do: '2026-08-31' });
    expect(v.map((r) => `${r.datum} ${r.pivo}`)).toEqual([
      '2026-08-03 11° Světlá',
      '2026-08-03 12° Polotmavá',
      '2026-08-05 11° Světlá',
    ]);
  });

  it('respektuje rozsah dat včetně krajů', () => {
    expect(sestavPrehled(radky, OBALY, { od: '2026-08-03', do: '2026-08-03' })).toHaveLength(2);
    expect(sestavPrehled(radky, OBALY, { od: '2026-08-04', do: '2026-08-31' })).toHaveLength(1);
  });

  it('obal mimo sloupce se nevejde do mřížky, ale z hektolitrů nevypadne', () => {
    // 25l sud nemá vlastní sloupec — kdyby se zahodil, součet by neseděl s tím,
    // co se doopravdy vydalo.
    const v = sestavPrehled(
      [{ entry_date: '2026-08-03', beer_id: 'b', beer_name: 'X', package_id: 'divny', quantity: 3, who: 'A' }],
      OBALY, { od: '2026-08-01', do: '2026-08-31' },
    );
    expect(v[0].kusyJine).toBe(3);
    expect(v[0].sudyL).toBe(75);
  });

  it('bez jména odběratele spadne na poznámku, jinak pomlčka', () => {
    const v = sestavPrehled(
      [
        { entry_date: '2026-08-03', beer_id: 'b', beer_name: 'X', package_id: 'k30', quantity: 1, who: '', note: 'Výčep u vrat' },
        { entry_date: '2026-08-04', beer_id: 'b', beer_name: 'X', package_id: 'k30', quantity: 1 },
      ],
      OBALY, { od: '2026-08-01', do: '2026-08-31' },
    );
    expect(v[0].odberatel).toBe('Výčep u vrat');
    expect(v[1].odberatel).toBe('—');
  });
});

describe('formát pro tabulku', () => {
  it('datum je v českém tvaru bez nul', () => {
    expect(formatDatum('2026-08-03')).toBe('3.8.2026');
  });

  it('desetinná čárka, ne tečka — jinak to český Excel bere jako text', () => {
    expect(cisloProTabulku(1.5)).toBe('1,5');
    expect(cisloProTabulku(0.7)).toBe('0,7');
  });

  it('nula se nepíše, ať tabulka není zaplevelená', () => {
    expect(cisloProTabulku(0)).toBe('');
  });
});

describe('TSV k vykopírování', () => {
  const prehled = sestavPrehled(radky, OBALY, { od: '2026-08-01', do: '2026-08-31' });

  // Výchozí podoba je to, co se vkládá do existujícího listu: jen datové
  // řádky, sloupce Datum → 0,33l. Bez hlavičky (v listu už je) a bez
  // hektolitrů (ty si list počítá sám).
  describe('výchozí — k vložení do listu', () => {
    const tsv = prehledDoTsv(prehled);
    const radkyTsv = tsv.split('\n');

    it('žádná hlavička ani součet — první řádek je rovnou datum', () => {
      expect(radkyTsv[0].startsWith('3.8.2026')).toBe(true);
      expect(tsv).not.toContain('Fasování prodejna');
      expect(tsv).not.toContain('Celkem');
    });

    it('má dvanáct sloupců: datum, odběratel, pivo a devět objemů', () => {
      for (const r of radkyTsv) expect(r.split('\t')).toHaveLength(3 + 9);
    });

    it('kusy sedí ve správných sloupcích', () => {
      // Novák / 11° Světlá: 2 sudy 30 l (4. sloupec objemů) a 20 lahví 0,5 l.
      const novak = radkyTsv.find((r) => r.includes('11° Světlá') && r.includes('Novák'))!;
      const bunky = novak.split('\t');
      expect(bunky.slice(0, 3)).toEqual(['3.8.2026', 'Novák', '11° Světlá']);
      expect(bunky[3 + 1]).toBe('2');   // 30 l
      expect(bunky[3 + 7]).toBe('20');  // 0,5 l
      expect(bunky[3 + 0]).toBe('');    // 50 l prázdné
    });

    it('sloupce odděluje tabulátor — TSV se do listu vloží samo', () => {
      // Se středníkem nebo čárkou by záleželo na místním nastavení tabulky.
      expect(radkyTsv[0]).toContain('\t');
      expect(radkyTsv[0]).not.toContain(';');
    });
  });

  describe('volitelně — samostatná tabulka s hlavičkou', () => {
    const tsv = prehledDoTsv(prehled, { hlavicka: true, soucet: true, hektolitry: true });
    const radkyTsv = tsv.split('\n');

    it('hlavička má skupiny Sudy a Lahve i sloupce s hektolitry', () => {
      expect(radkyTsv[0]).toContain('Fasování prodejna');
      expect(radkyTsv[0]).toContain('Sudy');
      expect(radkyTsv[0]).toContain('Lahve');
      expect(radkyTsv[0]).toContain('celkem hl');
      expect(radkyTsv[1].split('\t').slice(0, 3)).toEqual(['Datum', 'Odběratel', 'Druh piva']);
    });

    it('popisky objemů jsou přesně jako v listu', () => {
      expect(radkyTsv[1].split('\t').slice(3, 12)).toEqual(
        ['50 l', '30 l', '20 l', '15 l', '10 l', '1,5l', '1,0l', '0,5l', '0,33l'],
      );
    });

    it('každý řádek má stejný počet sloupců jako hlavička', () => {
      const sloupcu = radkyTsv[1].split('\t').length;
      for (const r of radkyTsv.slice(2)) expect(r.split('\t')).toHaveLength(sloupcu);
    });

    it('poslední řádek je součet v hektolitrech', () => {
      const posledni = radkyTsv[radkyTsv.length - 1].split('\t');
      expect(posledni[0]).toBe('Celkem');
      // Sudy: 2×30 + 1×50 = 110 l = 1,1 hl; lahve: 20×0,5 + 4×1,5 = 16 l = 0,16 hl
      expect(posledni.slice(-3)).toEqual(['1,1', '0,16', '1,26']);
    });

    it('hektolitry na tři desetinná místa — v listu jsou hodnoty jako 0,033', () => {
      const drobne = sestavPrehled(
        [{ entry_date: '2026-08-03', beer_id: 'b', beer_name: 'Desítka', package_id: 'l033', quantity: 10, who: 'A' }],
        OBALY, { od: '2026-08-01', do: '2026-08-31' },
      );
      const r = prehledDoTsv(drobne, { hektolitry: true }).split('\t');
      expect(r[r.length - 1]).toBe('0,033'); // 10 × 0,33 l = 3,3 l
    });
  });
});

describe('součty', () => {
  it('sečtou kusy i litry přes všechny řádky', () => {
    const s = soucty(sestavPrehled(radky, OBALY, { od: '2026-08-01', do: '2026-08-31' }));
    expect(s.kusy[30]).toBe(2);
    expect(s.kusy[50]).toBe(1);
    expect(s.kusy[0.5]).toBe(20);
    expect(s.kusy[1.5]).toBe(4);
    expect(s.sudyL).toBe(110);
    expect(s.lahveL).toBe(16);
  });
});
