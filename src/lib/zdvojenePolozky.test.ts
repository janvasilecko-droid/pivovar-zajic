import { describe, it, expect } from 'vitest';
import { najdiZdvojene, slucZdvojene, popisZdvojeni } from './zdvojenePolozky';

const r = (beerId: string, pkgId: string, qty: string | number, id: string | null = null, removed = false) =>
  ({ id, beerId, pkgId, qty, removed });

describe('zdvojené položky objednávky', () => {
  it('objednávka bez duplicit nehlásí nic', () => {
    expect(najdiZdvojene([r('10', 'k20', 2), r('11', 'k15', 1)])).toEqual([]);
  });

  it('najde dvě stejná piva ve stejném obalu a sečte je', () => {
    // Přesně případ Manea: 2× 10° 20l zapsané dvakrát.
    const z = najdiZdvojene([r('10', 'k20', 2), r('11', 'k15', 1), r('10', 'k20', 2)]);
    expect(z).toHaveLength(1);
    expect(z[0].indexy).toEqual([0, 2]);
    expect(z[0].celkem).toBe(4);
  });

  it('stejné pivo v jiném obalu duplicita není', () => {
    expect(najdiZdvojene([r('10', 'k20', 2), r('10', 'k50', 1)])).toEqual([]);
  });

  it('nevyplněné a odstraněné řádky se neberou', () => {
    expect(najdiZdvojene([r('', '', ''), r('', '', ''), r('10', 'k20', 1)])).toEqual([]);
    expect(najdiZdvojene([r('10', 'k20', 1), r('10', 'k20', 1, 'x', true)])).toEqual([]);
  });

  it('slučování sečte množství do prvního řádku', () => {
    const out = slucZdvojene([r('10', 'k20', 2), r('11', 'k15', 1), r('10', 'k20', 2)]);
    expect(out[0].qty).toBe('4');
    expect(out[1].qty).toBe(1);
  });

  it('uložený zdvojený řádek se označí ke smazání, rozepsaný zmizí', () => {
    const ulozeny = slucZdvojene([r('10', 'k20', 2, 'a'), r('10', 'k20', 2, 'b')]);
    expect(ulozeny).toHaveLength(2);
    expect(ulozeny[1].removed).toBe(true);

    const rozepsany = slucZdvojene([r('10', 'k20', 2, 'a'), r('10', 'k20', 2, null)]);
    expect(rozepsany).toHaveLength(1);
    expect(rozepsany[0].qty).toBe('4');
  });

  it('tři stejné řádky se sloučí do jednoho', () => {
    const out = slucZdvojene([r('10', 'k20', 1, 'a'), r('10', 'k20', 2, 'b'), r('10', 'k20', 3, 'c')]);
    expect(out[0].qty).toBe('6');
    expect(out.filter((x) => x.removed)).toHaveLength(2);
  });

  it('bez duplicit vrací slučování původní pole beze změny', () => {
    const vstup = [r('10', 'k20', 2), r('11', 'k15', 1)];
    expect(slucZdvojene(vstup)).toBe(vstup);
  });

  it('nečíselné množství se počítá jako nula, ne jako NaN', () => {
    const z = najdiZdvojene([r('10', 'k20', ''), r('10', 'k20', 3)]);
    expect(z[0].celkem).toBe(3);
  });

  it('stejné pivo pro dva různé odběratele duplicita není', () => {
    // V zadávacím formuláři se do jedné mřížky píše i pro víc hospod naráz.
    const radky = [
      { ...r('10', 'k20', 2), skupina: 'Louka' },
      { ...r('10', 'k20', 3), skupina: 'Maneo' },
    ];
    expect(najdiZdvojene(radky)).toEqual([]);

    radky.push({ ...r('10', 'k20', 1), skupina: 'Louka' });
    const z = najdiZdvojene(radky);
    expect(z).toHaveLength(1);
    expect(z[0].indexy).toEqual([0, 2]);
    expect(z[0].celkem).toBe(3);
  });

  it('věta pro uživatele říká kolikrát a kolik dohromady', () => {
    const z = najdiZdvojene([r('10', 'k20', 2), r('10', 'k20', 2)])[0];
    expect(popisZdvojeni(z, '10° Desítka', 'KEG 20l')).toBe('10° Desítka KEG 20l je v objednávce 2× (dohromady 4 ks)');
  });
});
