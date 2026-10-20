// 🔴 Zadání 20. 10. 2026: „jízda vždy začíná Kynšperk, poté všechna místa
// objednávky a končí zase Kynšperk." Den je JEDNA okružní jízda — km jsou
// délka té jedné trasy a text trasy v knize jede stejnou cestou. (Tím se
// zrušilo pravidlo z 27. 9. 2026, kde se každá zastávka počítala zvlášť
// tam a zpět do pivovaru.)
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

  it('u víc zastávek je to JEDEN dotaz na okružní trasu pivovar → zastávky → pivovar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(osrmOdpoved(30_000)); // celá okružní trasa
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([
      { name: 'A', lat: 50.1, lng: 12.5 },
      { name: 'B', lat: 50.2, lng: 12.6 },
      { name: 'C', lat: 50.3, lng: 12.7 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.km).toBe(30); // délka jedné trasy, ne součet cest tam a zpět

    // Dotaz: pivovar, A, B, C, pivovar — v tomhle pořadí (5 bodů = 4 středníky).
    const url = String(fetchMock.mock.calls[0][0]);
    const home = `${HOME_BASE_COORDS.lng},${HOME_BASE_COORDS.lat}`;
    const body = url.split('/driving/')[1].split('?')[0].split(';');
    expect(body).toEqual([home, '12.5,50.1', '12.6,50.2', '12.7,50.3', home]);
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

  it('selhání OSRM vrátí 0 km (v náhledu knihy jízd jde km doplnit ručně)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const r = await computeRouteDistanceKm([
      { name: 'A', lat: 50.1, lng: 12.5 },
      { name: 'B', lat: 50.2, lng: 12.6 },
    ]);
    expect(r.km).toBe(0);
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
  it('jedna jízda: všechna místa v řadě a na konci Kynšperk', () => {
    expect(popisTrasyDne(['A', 'B', 'C'])).toBe('A → B → C → Kynšperk nad Ohří');
  });

  it('jedna zastávka', () => {
    expect(popisTrasyDne(['Sokolov'])).toBe('Sokolov → Kynšperk nad Ohří');
  });

  it('žádná zastávka — okruh beze jména', () => {
    expect(popisTrasyDne([])).toBe('Kynšperk nad Ohří (Okruh)');
  });
});
