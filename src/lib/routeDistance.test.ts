// 🔴 Zadání 27. 9. 2026: „vylepši knihu jízd, jede to z kynšperka po
// závoz do kynšperka znova." Auto se mezi jednotlivými dodávkami vrací do
// pivovaru doložit zboží — den se dvěma a víc zastávkami tak není jedna
// okružní trasa, ale tolik cest tam a zpět, kolik je zastávek. Dřív appka
// počítala jednu okružní trasu přes všechny zastávky, což km systematicky
// podhodnocovalo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeRouteDistanceKm, popisTrasyDne, HOME_BASE_COORDS } from './routeDistance';

function osrmOdpoved(metry: number) {
  return { ok: true, json: () => Promise.resolve({ code: 'Ok', routes: [{ distance: metry }] }) };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('computeRouteDistanceKm', () => {
  it('u jedné zastávky je to prostá cesta tam a zpět', async () => {
    const fetchMock = vi.fn().mockResolvedValue(osrmOdpoved(10_000)); // 10 km
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([{ name: 'Sokolov', lat: 50.18, lng: 12.64 }]);
    expect(r.km).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('u dvou zastávek se km SČÍTAJÍ (dvě cesty tam a zpět), ne jedna okružní trasa', async () => {
    // Dřív by tohle byla JEDNA trasa pivovar→A→B→pivovar s jedním OSRM
    // dotazem. Teď je to dvakrát „pivovar→zastávka→pivovar" — jeden dotaz
    // na zastávku, výsledky se sečtou.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(osrmOdpoved(8_000))  // pivovar → A → pivovar
      .mockResolvedValueOnce(osrmOdpoved(14_000)); // pivovar → B → pivovar
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([
      { name: 'A', lat: 50.1, lng: 12.5 },
      { name: 'B', lat: 50.2, lng: 12.6 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.km).toBe(22); // 8 + 14, NE nějaké menší číslo jedné okružní trasy

    // Každý dotaz je skutečně tvaru pivovar→bod→pivovar (tři souřadnice).
    const prvniUrl = String(fetchMock.mock.calls[0][0]);
    expect(prvniUrl).toContain(`${HOME_BASE_COORDS.lng},${HOME_BASE_COORDS.lat}`);
    expect((prvniUrl.match(/;/g) ?? []).length).toBe(2); // 3 body = 2 středníky
  });

  it('zastávka bez souřadnic se vynechá a nahlásí v missingCoords', async () => {
    const fetchMock = vi.fn().mockResolvedValue(osrmOdpoved(5_000));
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([
      { name: 'Se souřadnicemi', lat: 50.1, lng: 12.5 },
      { name: 'Bez souřadnic', lat: null, lng: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.km).toBe(5);
    expect(r.missingCoords).toEqual(['Bez souřadnic']);
  });

  it('selhání OSRM u jedné zastávky nezahodí výsledek ostatních', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(osrmOdpoved(6_000));
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([
      { name: 'Selže', lat: 50.1, lng: 12.5 },
      { name: 'Vyjde', lat: 50.2, lng: 12.6 },
    ]);
    expect(r.km).toBe(6);
  });

  it('žádná zastávka se souřadnicemi → 0 km, OSRM se nevolá', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([{ name: 'X', lat: null, lng: null }]);
    expect(r.km).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('popisTrasyDne', () => {
  it('každá zastávka má vlastní návrat do Kynšperku, ne jen ta poslední', () => {
    expect(popisTrasyDne(['A', 'B', 'C'])).toBe(
      'A → Kynšperk nad Ohří → B → Kynšperk nad Ohří → C → Kynšperk nad Ohří'
    );
  });

  it('jedna zastávka', () => {
    expect(popisTrasyDne(['Sokolov'])).toBe('Sokolov → Kynšperk nad Ohří');
  });

  it('žádná zastávka — okruh beze jména', () => {
    expect(popisTrasyDne([])).toBe('Kynšperk nad Ohří (Okruh)');
  });
});
