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

/**
 * Spočítá jízdní vzdálenost okružní trasy pivovar → zastávky (v daném pořadí)
 * → pivovar pomocí OSRM. Zastávky bez souřadnic (`lat`/`lng` null) se z trasy
 * vynechají a vrátí se v `missingCoords`, ať uživatel ví, proč je odhad nižší,
 * než by měl být.
 */
export async function computeRouteDistanceKm(
  stops: { name: string; lat: number | null | undefined; lng: number | null | undefined }[]
): Promise<RouteDistanceResult> {
  const missingCoords = stops.filter((s) => s.lat == null || s.lng == null).map((s) => s.name);
  const validStops = stops.filter((s): s is { name: string; lat: number; lng: number } => s.lat != null && s.lng != null);

  if (validStops.length === 0) {
    return { km: 0, missingCoords };
  }

  const coords = [HOME_BASE_COORDS, ...validStops, HOME_BASE_COORDS]
    .map((p) => `${p.lng},${p.lat}`)
    .join(';');

  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { km: 0, missingCoords };
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return { km: 0, missingCoords };
    const meters = data.routes[0].distance as number;
    return { km: Math.round((meters / 1000) * 10) / 10, missingCoords };
  } catch {
    return { km: 0, missingCoords };
  }
}
