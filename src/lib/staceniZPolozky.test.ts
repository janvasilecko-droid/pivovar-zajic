// Co se má zapsat do kegging, když se u položky objednávky zaškrtne
// "Stočeno" — viz hlavička staceniZPolozky.ts, proč to vzniklo.
import { describe, it, expect } from 'vitest';
import { naplanujZaznamZeStoceni, POZNAMKA_AUTOMATICKY, jeZeZaskrtnuti } from './staceniZPolozky';

const PACKAGES = [
  { id: 'keg30', kind: 'keg' as const, volume_l: 30 },
  { id: 'pet15', kind: 'bottle' as const, volume_l: 1.5 },
];

const polozka = (over: Partial<{ id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number }> = {}) => ({
  id: 'item-1',
  beer_id: 'pivo-11',
  beer_name: '11° Světlá',
  package_id: 'keg30',
  package_label: 'KEG 30l',
  quantity: 6,
  ...over,
});

describe('naplanujZaznamZeStoceni', () => {
  it('sud s aktivním tankem stejného piva: vyplní tank a odečet objemu', () => {
    const tanky = [
      { id: 'tank-a', current_beer_id: 'pivo-11', kegging_active: true, status: 'active', current_volume_l: 500 },
    ];
    const z = naplanujZaznamZeStoceni(polozka(), PACKAGES, tanky, '2026-09-12');
    expect(z).toEqual({
      entry_date: '2026-09-12',
      beer_id: 'pivo-11',
      beer_name: '11° Světlá',
      package_id: 'keg30',
      package_label: 'KEG 30l',
      quantity: 6,
      order_item_id: 'item-1',
      cellar_tank_id: 'tank-a',
      source_volume_l: 180, // 6 × 30 l
      note: POZNAMKA_AUTOMATICKY,
    });
  });

  it('bez aktivního tanku se uloží bez tanku a bez odečtu — jako v ručním zápisu', () => {
    const z = naplanujZaznamZeStoceni(polozka(), PACKAGES, [], '2026-09-12');
    expect(z?.cellar_tank_id).toBeNull();
    expect(z?.source_volume_l).toBeNull();
    // Zbytek se zapíše i tak — chybějící tank neznamená "nezapisovat vůbec".
    expect(z?.quantity).toBe(6);
  });

  it('lahev (PET) se NEZAKLÁDÁ — appka nepozná spotřebu sudů', () => {
    const z = naplanujZaznamZeStoceni(polozka({ package_id: 'pet15', package_label: 'PET 1,5l' }), PACKAGES, [], '2026-09-12');
    expect(z).toBeNull();
  });

  it('nulové nebo záporné množství se nezakládá', () => {
    expect(naplanujZaznamZeStoceni(polozka({ quantity: 0 }), PACKAGES, [], '2026-09-12')).toBeNull();
    expect(naplanujZaznamZeStoceni(polozka({ quantity: -1 }), PACKAGES, [], '2026-09-12')).toBeNull();
  });

  it('obal, který v katalogu není, se nezakládá — radši nic než hádat', () => {
    expect(naplanujZaznamZeStoceni(polozka({ package_id: 'neexistuje' }), PACKAGES, [], '2026-09-12')).toBeNull();
  });

  it('víc aktivních tanků se stejným pivem: vybere se největší — stejné pravidlo jako v ručním zápisu', () => {
    const tanky = [
      { id: 'maly', current_beer_id: 'pivo-11', kegging_active: true, status: 'active', current_volume_l: 100 },
      { id: 'velky', current_beer_id: 'pivo-11', kegging_active: true, status: 'active', current_volume_l: 900 },
    ];
    const z = naplanujZaznamZeStoceni(polozka(), PACKAGES, tanky, '2026-09-12');
    expect(z?.cellar_tank_id).toBe('velky');
  });

  it('tank s jiným pivem se nepočítá, i když je aktivní', () => {
    const tanky = [
      { id: 'tank-jine-pivo', current_beer_id: 'pivo-jine', kegging_active: true, status: 'active', current_volume_l: 500 },
    ];
    const z = naplanujZaznamZeStoceni(polozka(), PACKAGES, tanky, '2026-09-12');
    expect(z?.cellar_tank_id).toBeNull();
  });

  it('tank bez zahájeného stáčení (kegging_active false) se nepočítá', () => {
    const tanky = [
      { id: 'tank-a', current_beer_id: 'pivo-11', kegging_active: false, status: 'active', current_volume_l: 500 },
    ];
    const z = naplanujZaznamZeStoceni(polozka(), PACKAGES, tanky, '2026-09-12');
    expect(z?.cellar_tank_id).toBeNull();
  });
});

describe('jeZeZaskrtnuti — poznat záznam, který appka založila sama', () => {
  // Z provozu 12. 9. 2026: „10× 12sv 50 l jsem nezadával, co to je?"
  // Byl to záznam z kapky „Stočeno" u objednávky — správně a na vyžádání,
  // jenže v seznamu vypadal jako ručně napsaný, takže se ve stáčení objevilo
  // pivo, o kterém stáčeč nevěděl.
  it('pozná svůj vlastní zápis', () => {
    expect(jeZeZaskrtnuti(POZNAMKA_AUTOMATICKY)).toBe(true);
  });

  it('ručně napsaná poznámka to není', () => {
    expect(jeZeZaskrtnuti('Dostáčeno ze zbytku tanku')).toBe(false);
    expect(jeZeZaskrtnuti('')).toBe(false);
    expect(jeZeZaskrtnuti(null)).toBe(false);
    expect(jeZeZaskrtnuti(undefined)).toBe(false);
  });

  it('značka přežije, když někdo k poznámce něco připíše', () => {
    // Poznámka jde upravit ručně; kdyby se porovnávala na přesnou shodu,
    // dopsaná věta by značku zrušila a řádek by se zase tvářil jako ručně
    // napsaný.
    expect(jeZeZaskrtnuti(`${POZNAMKA_AUTOMATICKY} — dodělal Franta`)).toBe(true);
    expect(jeZeZaskrtnuti(`  ${POZNAMKA_AUTOMATICKY}`)).toBe(true);
  });

  it('záznam z plánovače tu značku opravdu nese', () => {
    // Kdyby se text poznámky v plánovači změnil a tady ne, značka by zmizela
    // a nikdo by si toho nevšiml.
    const zaznam = naplanujZaznamZeStoceni(
      { id: 'i1', beer_id: 'b', beer_name: 'Jantar', package_id: 'keg50', package_label: 'KEG 50l', quantity: 10 },
      [{ id: 'keg50', kind: 'keg', volume_l: 50 }],
      [],
      '2026-09-11',
    );
    expect(zaznam).toBeTruthy();
    expect(jeZeZaskrtnuti(zaznam!.note)).toBe(true);
  });
});
