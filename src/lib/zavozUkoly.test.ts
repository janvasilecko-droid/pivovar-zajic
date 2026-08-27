import { describe, it, expect } from 'vitest';
import { ukolyZPoznamky, souhrnUkolu } from './zavozUkoly';

const klice = (poznamka: string) => ukolyZPoznamky(poznamka).map((u) => u.klic);

describe('ukolyZPoznamky — prázdné sudy', () => {
  it('pozná požadavek na vyzvednutí sudů tak, jak chodí ve zprávě', () => {
    // Přesně tahle věta přišla 27. 8. 2026 z WhatsAppu.
    expect(klice('ještě vyzvednout sudy v ASI')).toContain('sudy');
    expect(klice('jeste vyzvednout sudy')).toContain('sudy');
    expect(klice('sebrat 3 prázdné kegy')).toContain('sudy');
    expect(klice('odvezt prazdne sudy')).toContain('sudy');
    expect(klice('vzít sudy zpátky')).toContain('sudy');
    expect(klice('prázdné sudy k vyzvednutí')).toContain('sudy');
    expect(klice('naložit sudy')).toContain('sudy');
  });

  it('funguje s diakritikou i bez ní', () => {
    expect(klice('vyzvednout prázdné sudy')).toEqual(klice('vyzvednout prazdne sudy'));
  });

  it('nevymýšlí sudy tam, kde nejsou', () => {
    expect(klice('2x50 12sv, 3x30 11sv')).toEqual([]);
    expect(klice('zavoz v patek')).toEqual([]);
    expect(klice('bez etiket')).toEqual([]);
    // Vrácení lahví je jiný úkol — nesmí se z něj stát sud.
    expect(klice('vrácení lahví')).not.toContain('sudy');
  });

  it('stejný úkol vrátí jen jednou, i když ho poznámka zmíní víckrát', () => {
    const u = ukolyZPoznamky('vyzvednout sudy, prázdné sudy, sudy zpět');
    expect(u.filter((x) => x.klic === 'sudy')).toHaveLength(1);
  });
});

describe('ukolyZPoznamky — ostatní úkoly', () => {
  it('pozná drobnosti k naložení', () => {
    expect(klice('ještě sklo')).toContain('sklo');
    expect(klice('přidat podtácky')).toContain('podtacky');
    expect(klice('pujcit vycep')).toContain('vycep');
    expect(klice('dvojkohout')).toContain('vycep');
    expect(klice('spoták')).toContain('spotak');
    expect(klice('faktura')).toContain('faktura');
    expect(klice('vratné lahve')).toContain('lahve');
  });

  it('samotné „sklo" v poznámce je požadavek', () => {
    // Do poznámky se „sklo" nedostane samo — buď ho tam napsal parser,
    // protože ve zprávě byl požadavek, nebo ho tam napsal člověk ručně.
    // Vágnost se řeší o krok dřív, při čtení zprávy (detectOrderNotes).
    expect(klice('sklo')).toEqual(['sklo']);
  });

  it('poradí si s víc úkoly v jedné poznámce a drží pořadí', () => {
    expect(klice('ještě podtácky a vyzvednout sudy')).toEqual(['sudy', 'podtacky']);
  });

  it('prázdná poznámka nedá nic', () => {
    expect(ukolyZPoznamky(null)).toEqual([]);
    expect(ukolyZPoznamky(undefined)).toEqual([]);
    expect(ukolyZPoznamky('   ')).toEqual([]);
  });
});

describe('souhrnUkolu', () => {
  it('sečte úkoly za den a řekne u koho', () => {
    const s = souhrnUkolu([
      { poznamka: 'ještě vyzvednout sudy', odberatel: 'Bar U Sadu' },
      { poznamka: 'podtácky', odberatel: 'Hospoda Na Rohu' },
      { poznamka: 'vyzvednout prázdné sudy a sklo', odberatel: 'Restaurace Zelený strom' },
      { poznamka: null, odberatel: 'Prodejna' },
    ]);

    expect(s.map((x) => x.klic)).toEqual(['sudy', 'sklo', 'podtacky']);
    expect(s[0].odberatele).toEqual(['Bar U Sadu', 'Restaurace Zelený strom']);
    expect(s[1].odberatele).toEqual(['Restaurace Zelený strom']);
  });

  it('téhož odběratele nezapíše dvakrát', () => {
    const s = souhrnUkolu([
      { poznamka: 'vyzvednout sudy', odberatel: 'Bar U Sadu' },
      { poznamka: 'prázdné sudy', odberatel: 'Bar U Sadu' },
    ]);
    expect(s[0].odberatele).toEqual(['Bar U Sadu']);
  });

  it('bez úkolů vrátí prázdný souhrn', () => {
    expect(souhrnUkolu([{ poznamka: '2x50 12sv', odberatel: 'X' }])).toEqual([]);
  });
});

describe('souhrnUkolu — odškrtnuté úkoly', () => {
  it('odškrtnutý úkol ze souhrnu vypadne', () => {
    const s = souhrnUkolu([
      { poznamka: 'vyzvednout sudy a podtácky', odberatel: 'Bar U Sadu', vynechat: ['sudy'] },
    ]);
    expect(s.map((x) => x.klic)).toEqual(['podtacky']);
  });

  it('odškrtnutí u jednoho odběratele nezruší tentýž úkol u druhého', () => {
    const s = souhrnUkolu([
      { poznamka: 'vyzvednout sudy', odberatel: 'Bar U Sadu', vynechat: ['sudy'] },
      { poznamka: 'vyzvednout sudy', odberatel: 'Hospoda Na Rohu' },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].odberatele).toEqual(['Hospoda Na Rohu']);
  });

  it('když je hotové všechno, souhrn je prázdný', () => {
    const s = souhrnUkolu([
      { poznamka: 'vyzvednout sudy', odberatel: 'Bar U Sadu', vynechat: ['sudy'] },
    ]);
    expect(s).toEqual([]);
  });
});
