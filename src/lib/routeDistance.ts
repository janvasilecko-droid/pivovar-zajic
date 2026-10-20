// Výpočet skutečné jízdní vzdálenosti trasy (pivovar → zastávky → pivovar)
// pomocí veřejného OSRM routovacího API (Open Source Routing Machine,
// router.project-osrm.org) — zdarma, bez API klíče, stejný duch jako
// Nominatim/OSM geokódování v placeLookup.ts.

// Souřadnice pivovaru (Kynšperský pivovar s.r.o., Sokolovská 482/40,
// Kynšperk nad Ohří) — zjištěno přes Nominatim, pevný bod pro každou trasu.
export const HOME_BASE_COORDS: { lat: number; lng: number } = { lat: 50.1240286, lng: 12.5313450 };

export type RouteDistanceResult = {
  km: number;
  missingCoords: string[]; // názvy zastávek bez uložených souřadnic
};

type Stop = { name: string; lat: number | null | undefined; lng: number | null | undefined };

/** Jedna okružní trasa pivovar → zastávky (v daném pořadí) → pivovar (v metrech), nebo 0 při chybě OSRM. */
async function computeLoopMeters(points: { lat: number; lng: number }[]): Promise<number> {
  const coords = [HOME_BASE_COORDS, ...points, HOME_BASE_COORDS].map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return 0;
    return data.routes[0].distance as number;
  } catch {
    return 0;
  }
}

/**
 * Spočítá jízdní vzdálenost dne pomocí OSRM — JEDNA okružní jízda
 * pivovar → všechny zastávky (v pořadí, v jakém přišly) → pivovar.
 *
 * Zadání 20. 10. 2026: „jízda vždy začíná Kynšperk, poté všechna místa
 * objednávky a končí zase Kynšperk." Tím se ruší pravidlo z 27. 9. 2026
 * (každá zastávka zvlášť tam a zpět do pivovaru): den má jednu jízdu a km
 * jsou délka téhle jedné trasy, aby text trasy v knize a km seděly.
 *
 * Zastávky bez souřadnic (`lat`/`lng` null) se vynechají a vrátí se
 * v `missingCoords`, ať uživatel ví, proč je odhad nižší, než by měl být.
 */
export async function computeRouteDistanceKm(stops: Stop[]): Promise<RouteDistanceResult> {
  const missingCoords = stops.filter((s) => s.lat == null || s.lng == null).map((s) => s.name);
  const validStops = stops.filter((s): s is { name: string; lat: number; lng: number } => s.lat != null && s.lng != null);

  if (validStops.length === 0) {
    return { km: 0, missingCoords };
  }

  const totalMeters = await computeLoopMeters(validStops);

  return { km: Math.round((totalMeters / 1000) * 10) / 10, missingCoords };
}

/**
 * Text trasy dne pro Knihu jízd — jedna jízda: zastávky v pořadí a nakonec
 * zase „Kynšperk nad Ohří" (viz `computeRouteDistanceKm`). `route_from`
 * (odkud jízda vyjíždí) je vždycky Kynšperk — ten se sem nepíše, doplňuje
 * ho volající (viz KnihaJizdScreen.tsx `HOME_BASE`).
 */
export function popisTrasyDne(placeNames: string[]): string {
  return placeNames.length > 0
    ? [...placeNames, 'Kynšperk nad Ohří'].join(' → ')
    : 'Kynšperk nad Ohří (Okruh)';
}
