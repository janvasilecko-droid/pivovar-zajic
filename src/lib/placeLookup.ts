// Pomocník pro automatické dohledání adresy a telefonu odběratele / hospody

export type PlaceLookupResult = {
  address: string;
  phone?: string;
  lat?: number;
  lng?: number;
  displayName: string;
};

/**
 * Vyhledá adresu a informace o podniku pomocí bezplatného geokodéru Nominatim (OSM) a Mapy.cz API
 */
export async function lookupPlaceOnline(query: string): Promise<PlaceLookupResult[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const results: PlaceLookupResult[] = [];

  try {
    // 1. Nominatim OpenStreetMap (Czech Republic priority)
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=cz&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'cs,en',
        'User-Agent': 'PivovarZajicekApp/1.0',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          const addr = item.address || {};
          const road = addr.road || addr.pedestrian || addr.street || '';
          const houseNumber = addr.house_number || '';
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          const postcode = addr.postcode || '';

          const fullStreet = [road, houseNumber].filter(Boolean).join(' ');
          const formattedAddress = [fullStreet, city, postcode].filter(Boolean).join(', ') || item.display_name;

          results.push({
            address: formattedAddress,
            phone: item.extratags?.phone || item.extratags?.['contact:phone'] || undefined,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            displayName: item.display_name,
          });
        });
      }
    }
  } catch (err) {
    console.warn('Chyba při online vyhledávání adresy:', err);
  }

  return results;
}
