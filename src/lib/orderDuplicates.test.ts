// Načtení kandidátů na zdvojenou objednávku (lib/orderDuplicates.ts).
// Porovnávání samo je v duplicityObjednavek.test.ts; tady se hlídá dotaz
// do databáze — který týden, kdo se vybírá a že selhání kontroly uložení
// nikdy nezablokuje (vrací null, ne výjimku).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Volani = { metoda: string; args: unknown[] };
type Dotaz = { tabulka: string; select: string; volani: Volani[] };

const h = vi.hoisted(() => ({
  objednavky: [] as Record<string, unknown>[],
  polozky: [] as Record<string, unknown>[],
  chybaObjednavek: null as { message: string } | null,
  chybaPolozek: null as { message: string } | null,
  vyhodit: false,
  dotazy: [] as { tabulka: string; select: string; volani: { metoda: string; args: unknown[] }[] }[],
}));

vi.mock('./businessDate', () => ({ businessDateISO: () => '2026-10-15' }));
vi.mock('./supabase', () => {
  const retez = (tabulka: string, select: string) => {
    const dotaz: Dotaz = { tabulka, select, volani: [] };
    h.dotazy.push(dotaz);
    const q: any = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'then') {
          return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
            if (h.vyhodit) return Promise.reject(new Error('síť')).then(ok, ko);
            const orders = tabulka === 'orders';
            return Promise.resolve({
              data: orders ? h.objednavky : h.polozky,
              error: orders ? h.chybaObjednavek : h.chybaPolozek,
            }).then(ok, ko);
          };
        }
        return (...args: unknown[]) => { dotaz.volani.push({ metoda: prop, args }); return q; };
      },
    });
    return q;
  };
  return {
    supabase: { from: (t: string) => ({ select: (s: string) => retez(t, s) }) },
    fetchAllRows: (t: string, s = '*') => retez(t, s),
  };
});

import { najdiDuplicitniObjednavky } from './orderDuplicates';

const radek = (beerId = 'svetla', pkgId = 'sud50', qty = 1) => ({ beerId, pkgId, qty });
const restaurace = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', order_date: '2026-10-11', delivery_date: '2026-10-11', place_id: 'p-rest', place_name: 'Restaurace',
  status: 'nova', source: 'rucne', created_at: '2026-10-11T10:10:00Z', ...extra,
});
const polozka = (order_id: string, beer_id = 'svetla', package_id = 'sud50', quantity = 1) => ({ order_id, beer_id, package_id, quantity });

const dotazObjednavek = () => h.dotazy.find((d) => d.tabulka === 'orders')!;
const dotazPolozek = () => h.dotazy.find((d) => d.tabulka === 'order_items');
const volani = (d: Dotaz | undefined, metoda: string) => d?.volani.filter((v) => v.metoda === metoda) ?? [];

beforeEach(() => {
  h.objednavky = [];
  h.polozky = [];
  h.chybaObjednavek = null;
  h.chybaPolozek = null;
  h.vyhodit = false;
  h.dotazy = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('najdiDuplicitniObjednavky — dotaz do databáze', () => {
  it('hledá v celém týdnu dovozu (pondělí až neděle) a podle data zadání, když dovoz chybí', async () => {
    await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] });
    const [vyraz] = volani(dotazObjednavek(), 'or')[0].args as [string];
    // 11. 10. 2026 je neděle → týden 5. 10. až 11. 10.
    expect(vyraz).toBe(
      'and(delivery_date.gte.2026-10-05,delivery_date.lte.2026-10-11),'
      + 'and(delivery_date.is.null,order_date.gte.2026-10-05,order_date.lte.2026-10-11)',
    );
  });

  it('bez data dovozu vychází z data zadání, bez obou z dnešního obchodního dne', async () => {
    await najdiDuplicitniObjednavky({ placeName: 'Restaurace', orderDate: '2026-10-20', radky: [radek()] });
    expect(volani(dotazObjednavek(), 'or')[0].args[0]).toContain('delivery_date.gte.2026-10-19,delivery_date.lte.2026-10-25');

    h.dotazy = [];
    await najdiDuplicitniObjednavky({ placeName: 'Restaurace', radky: [radek()] });
    // dnes je ve čtvrtek 15. 10. → týden 12. 10. až 18. 10.
    expect(volani(dotazObjednavek(), 'or')[0].args[0]).toContain('delivery_date.gte.2026-10-12,delivery_date.lte.2026-10-18');
  });

  it('stornované objednávky z dotazu vypadnou a výsledek se ořízne na 500 řádků', async () => {
    await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] });
    expect(volani(dotazObjednavek(), 'not')[0].args).toEqual(['status', 'eq', 'storno']);
    expect(volani(dotazObjednavek(), 'limit')[0].args).toEqual([500]);
  });

  it('čte jen sloupce, které existují i před pozdními migracemi (bez delivery_day)', async () => {
    await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] });
    expect(dotazObjednavek().select).toBe('id, order_date, delivery_date, place_id, place_name, status, source, created_at');
  });

  it('řádky bez piva, obalu nebo množství dotaz vůbec nespustí', async () => {
    const nic = [
      await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [] }),
      await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [{ beerId: null, pkgId: 'sud50', qty: 1 }] }),
      await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [{ beerId: 'svetla', pkgId: null, qty: 1 }] }),
      await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek('svetla', 'sud50', 0)] }),
    ];
    expect(nic).toEqual([[], [], [], []]);
    expect(h.dotazy).toEqual([]);
  });
});

describe('najdiDuplicitniObjednavky — výběr kandidátů a položek', () => {
  it('položky se čtou jen pro objednávky téhož odběratele', async () => {
    h.objednavky = [
      restaurace(),
      restaurace({ id: 'o2', place_id: 'p-jiny', place_name: 'Hospoda U Lípy' }),
    ];
    await najdiDuplicitniObjednavky({ placeId: 'p-rest', placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] });
    expect(volani(dotazPolozek(), 'in')[0].args).toEqual(['order_id', ['o1']]);
    expect(dotazPolozek()?.select).toBe('order_id, beer_id, package_id, quantity');
  });

  it('odběratele pozná i podle názvu bez diakritiky a velkých písmen, když chybí id', async () => {
    h.objednavky = [restaurace({ place_id: null, place_name: 'RESTAURACE  ' })];
    h.polozky = [polozka('o1')];
    const shody = await najdiDuplicitniObjednavky({ placeName: 'restaurace', deliveryDate: '2026-10-11', radky: [radek()] });
    expect(shody).toHaveLength(1);
    expect(shody![0].objednavka.id).toBe('o1');
  });

  it('žádný odběratel se jmenovitě nesejde → prázdný výsledek bez čtení položek', async () => {
    h.objednavky = [restaurace({ place_id: 'p-jiny', place_name: 'Hospoda U Lípy' })];
    const shody = await najdiDuplicitniObjednavky({ placeId: 'p-rest', placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] });
    expect(shody).toEqual([]);
    expect(dotazPolozek()).toBeUndefined();
  });

  it('skutečný případ: Restaurace na 11. 10. zadaná znovu zpětně s řádkem navíc', async () => {
    h.objednavky = [restaurace()];
    h.polozky = [polozka('o1', 'svetla', 'sud50', 1), polozka('o1', 'desitka', 'sud30', 1)];
    const shody = await najdiDuplicitniObjednavky({
      placeId: 'p-rest', placeName: 'Restaurace', orderDate: '2026-10-13', deliveryDate: '2026-10-11',
      radky: [radek('svetla', 'sud50', 1), radek('desitka', 'sud30', 1), radek('tmava', 'sud50', 1)],
    });
    expect(shody).toHaveLength(1);
    expect(shody![0]).toMatchObject({ stejnyDen: true, uplna: false });
    expect(shody![0].stejne.map((r) => r.beerId)).toEqual(['svetla', 'desitka']);
    // hledá se v týdnu DOVOZU (5.–11. 10.), ne v týdnu, kdy se objednávka zadávala zpětně (13. 10.)
    expect(volani(dotazObjednavek(), 'or')[0].args[0]).toContain('delivery_date.gte.2026-10-05,delivery_date.lte.2026-10-11');
  });

  it('položky se u objednávky přiřadí podle order_id (ne podle pořadí)', async () => {
    h.objednavky = [restaurace({ id: 'o1' }), restaurace({ id: 'o2', delivery_date: '2026-10-08', order_date: '2026-10-08' })];
    h.polozky = [polozka('o2', 'tmava', 'sud50', 4), polozka('o1', 'svetla', 'sud50', 1)];
    const shody = await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek('svetla', 'sud50', 1)] });
    expect(shody!.map((s) => s.objednavka.id)).toEqual(['o1']);
    expect(shody![0].objednavka.polozky).toEqual([polozka('o1')]);
  });

  it('nová objednávka bez data zadání dostane za datum zadání den, podle kterého se hledalo', async () => {
    h.objednavky = [restaurace({ delivery_date: null, order_date: '2026-10-15' })];
    h.polozky = [polozka('o1')];
    const shody = await najdiDuplicitniObjednavky({ placeName: 'Restaurace', radky: [radek()] });
    expect(shody).toHaveLength(1);
    expect(shody![0].stejnyDen).toBe(true);
  });

  it('vynechatId vyřadí objednávku, kterou právě upravuji', async () => {
    h.objednavky = [restaurace()];
    h.polozky = [polozka('o1')];
    const shody = await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()], vynechatId: 'o1' });
    expect(shody).toEqual([]);
  });

  it('prázdná odpověď (data: null) není chyba', async () => {
    h.objednavky = null as unknown as [];
    expect(await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] })).toEqual([]);
  });
});

describe('najdiDuplicitniObjednavky — selhání kontroly uložení neblokuje', () => {
  it('chyba dotazu na objednávky → null', async () => {
    h.chybaObjednavek = { message: 'fetch failed' };
    expect(await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] })).toBeNull();
  });

  it('chyba čtení položek → null (kandidát bez položek by tvářil „nic podobného nemáš")', async () => {
    h.objednavky = [restaurace()];
    h.chybaPolozek = { message: 'timeout' };
    expect(await najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] })).toBeNull();
  });

  it('výjimka (síť spadla) → null, ne vyhozená chyba', async () => {
    h.vyhodit = true;
    await expect(najdiDuplicitniObjednavky({ placeName: 'Restaurace', deliveryDate: '2026-10-11', radky: [radek()] })).resolves.toBeNull();
  });
});
