// Výpočet skutečné jízdní vzdálenosti trasy (pivovar → zastávka → pivovar)
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

/** Jedna cesta pivovar → bod → pivovar (v metrech), nebo 0 při chybě OSRM. */
async function computeOneWayAndBackMeters(point: { lat: number; lng: number }): Promise<number> {
  const coords = [HOME_BASE_COORDS, point, HOME_BASE_COORDS].map((p) => `${p.lng},${p.lat}`).join(';');
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
 * Spočítá jízdní vzdálenost dne pomocí OSRM — SOUČET jednotlivých cest
 * pivovar → zastávka → pivovar, jedné pro každou zastávku.
 *
 * NENÍ to jedna okružní trasa pivovar → zastávky → pivovar. Zadání
 * 27. 9. 2026: „vylepši knihu jízd, jede to z kynšperka po závoz do
 * kynšperka znova" — auto se mezi jednotlivými dodávkami vrací do
 * pivovaru doložit zboží, takže den se sudou zastávkou nemá jednu delší
 * cestu, ale tolik kratších cest tam a zpět, kolik je zastávek. Dřív se tu
 * počítala jedna trasa přes všechny zastávky v pořadí, v jakém dorazily
 * z databáze (viz git historie) — u dvou a víc zastávek to km systematicky
 * podhodnocovalo, protože reálně se každá zastávka násobí vlastní cestou
 * tam a zpět, ne sdílí trasu se sousední zastávkou.
 *
 * Zastávky bez souřadnic (`lat`/`lng` null) se vynechají a vrátí se
 * v `missingCoords`, ať uživatel ví, proč je odhad nižší, než by měl být.
 * OSRM se volá postupně (ne najednou), ať se nezahltí veřejný server.
 */
export async function computeRouteDistanceKm(stops: Stop[]): Promise<RouteDistanceResult> {
  const missingCoords = stops.filter((s) => s.lat == null || s.lng == null).map((s) => s.name);
  const validStops = stops.filter((s): s is { name: string; lat: number; lng: number } => s.lat != null && s.lng != null);

  if (validStops.length === 0) {
    return { km: 0, missingCoords };
  }

  let totalMeters = 0;
  for (const stop of validStops) {
    totalMeters += await computeOneWayAndBackMeters(stop);
  }

  return { km: Math.round((totalMeters / 1000) * 10) / 10, missingCoords };
}

/**
 * Text trasy dne pro Knihu jízd — stejná realita jako `computeRouteDistanceKm`
 * výš: auto se mezi zastávkami vrací do pivovaru, takže se KAŽDÁ zastávka
 * píše se svým vlastním návratem „→ Kynšperk nad Ohří", ne jen ta poslední.
 * `route_from` (odkud jízda vyjíždí) je vždycky Kynšperk — ten se sem
 * nepíše, doplňuje ho volající (viz KnihaJizdScreen.tsx `HOME_BASE`).
 */
export function popisTrasyDne(placeNames: string[]): string {
  return placeNames.length > 0
    ? placeNames.map((n) => `${n} → Kynšperk nad Ohří`).join(' → ')
    : 'Kynšperk nad Ohří (Okruh)';
}
