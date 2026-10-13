// Z provozu 7. 10. 2026: fotka 1,5l lahví se uložila jako dvě objednávky —
// „Restaurace" jen u prvního řádku, zbytek bez odběratele.
import { describe, it, expect } from 'vitest';
import { objednavkyZFotky, odberatelRadku } from './fotkaObjednavky';

describe('odberatelRadku', () => {
  it('odběratel jen u jednoho řádku platí pro celou fotku', () => {
    const r = odberatelRadku(['Restaurace', null, '', undefined, null], '');
    expect(r).toEqual(['Restaurace', 'Restaurace', 'Restaurace', 'Restaurace', 'Restaurace']);
    expect(objednavkyZFotky(r)).toEqual([{ odberatel: 'Restaurace', polozek: 5 }]);
  });

  it('stejné jméno jinak napsané je pořád jeden odběratel', () => {
    expect(odberatelRadku(['Restaurace', ' restaurace ', null], null)).toEqual(['Restaurace', 'Restaurace', 'Restaurace']);
  });

  it('hlavní odběratel nahoře doplní řádky bez odběratele, vlastní nechá', () => {
    expect(odberatelRadku([null, 'Sluhy', ''], 'Chmeloun')).toEqual(['Chmeloun', 'Sluhy', 'Chmeloun']);
  });

  it('dva různí odběratelé na fotce = dvě objednávky jako dosud', () => {
    const r = odberatelRadku(['Chmeloun', 'Sluhy', null], '');
    expect(r).toEqual(['Chmeloun', 'Sluhy', '']);
    expect(objednavkyZFotky(r)).toEqual([
      { odberatel: 'Chmeloun', polozek: 1 },
      { odberatel: 'Sluhy', polozek: 1 },
      { odberatel: '', polozek: 1 },
    ]);
  });

  it('bez odběratele všude = jedna objednávka bez odběratele', () => {
    const r = odberatelRadku([null, null], '  ');
    expect(r).toEqual(['', '']);
    expect(objednavkyZFotky(r)).toEqual([{ odberatel: '', polozek: 2 }]);
  });

  it('lístek bez odběratele: napíšu „Restaurace" na první řádek → jedna objednávka (13. 10. 2026)', () => {
    const r = odberatelRadku(['Restaurace', null, null, '', null], '');
    expect(r).toEqual(['Restaurace', 'Restaurace', 'Restaurace', 'Restaurace', 'Restaurace']);
    expect(objednavkyZFotky(r)).toEqual([{ odberatel: 'Restaurace', polozek: 5 }]);
  });

  it('hlavní odběratel nahoře a stejné jméno jinak psané u řádků = pořád jedna objednávka', () => {
    const r = odberatelRadku(['restaurace ', 'RESTAURACE', null], 'Restaurace');
    expect(new Set(r).size).toBe(1);
    expect(objednavkyZFotky(r)).toHaveLength(1);
  });

  it('dva skutečně různí odběratelé zůstanou dvě objednávky', () => {
    expect(objednavkyZFotky(odberatelRadku(['Restaurace', 'Obchod', null], ''))).toHaveLength(3);
    expect(objednavkyZFotky(odberatelRadku(['Restaurace', 'Obchod'], '')).map((o) => o.odberatel)).toEqual(['Restaurace', 'Obchod']);
  });
});
