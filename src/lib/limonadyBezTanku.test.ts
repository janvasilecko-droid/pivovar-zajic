// Limonády tank nemají (16. 10. 2026): počet na záložce „Stáčení bez tanku" ve
// Sklepě (screens/Cellar.tsx) se řídí stejným pravidlem jako seznam na ní
// (lib/tankUZapisu.ts cekaNaTank). Cellar se kvůli jednomu číslu nerenderuje —
// hlídá se, že si pravidlo nepíše po svém.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const zdroj = (cesta: string) => readFileSync(new URL(cesta, import.meta.url), 'utf8');

describe('počet stáčení bez tanku ve Sklepě', () => {
  const cellar = zdroj('../screens/Cellar.tsx');
  const pocet = cellar.slice(cellar.indexOf('const pocetBezTanku'), cellar.indexOf('const displayedTanks'));

  it('bere pravidlo z cekaNaTank, ne z vlastního filtru', () => {
    expect(pocet).toContain('cekaNaTank(');
    expect(pocet).not.toMatch(/!r\.cellar_tank_id/);
  });

  it('jména piv z katalogu dává cekaNaTank k dispozici (zápis bez jména piva)', () => {
    expect(pocet).toMatch(/beers\.find\(\(b\) => b\.id === id\)\?\.name/);
    expect(pocet).toMatch(/\[kegging, beers\]/);
  });
});

describe('seznam stáčení bez tanku', () => {
  it('řídí se stejnou funkcí jako číslo ve Sklepě', () => {
    const seznam = zdroj('../components/StaceniBezTanku.tsx');
    expect(seznam).toContain('cekaNaTank(r, od,');
    expect(seznam).not.toMatch(/!r\.cellar_tank_id && r\.beer_id/);
  });
});
