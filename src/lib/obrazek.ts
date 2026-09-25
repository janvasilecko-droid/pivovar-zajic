/**
 * Typ obrázku přečtený z hlavičky data URL (`data:image/png;base64,…`).
 *
 * Proč to nestačí uhodnout: obrazovky pro čtení fotek posílaly do AI funkce
 * natvrdo "image/jpeg". Anthropic ale kontroluje, že ohlášený typ sedí
 * s obsahem, a snímek obrazovky z WhatsAppu je PNG — čtení tedy spadlo hned
 * u prvního poskytovatele a přes zálohy propadlo až k chybě. Čtení objednávek
 * posílalo typ ze souboru správně a fungovalo; stáčení lahví, KEG a prodejna
 * na to zapomněly.
 *
 * Hlavička data URL je spolehlivější než `File.type`: platí i pro fotku
 * upravenou v editoru (ta už žádný soubor nemá) a pro obrázek vložený
 * ze schránky.
 */
export function typObrazku(dataUrl: string): string {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
}

/** Nejdelší strana zmenšené fotky — stejná hodnota jako u FotkyZaznamu.tsx. */
const MAX_STRANA_FOTKY = 1600;
const KVALITA_FOTKY = 0.82;

function souborNaDataUrl(soubor: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(soubor);
  });
}

/**
 * Fotka z telefonu jako zmenšený data URL (JPEG, nejdelší strana max
 * `MAX_STRANA_FOTKY`) — pro obrazovky, které čtení z fotky (AI/OCR) i
 * náhled dělají přímo z data URL v paměti, ne přes upload (viz
 * FotkyZaznamu.tsx, `zmensiFotku`, která řeší totéž pro nahrávání do
 * úložiště).
 *
 * Bez zmenšení má snímek z mobilu klidně 4–8 MB — jako data URL v poli
 * `photos` (a v paměti prohlížeče/WebView vedle náhledu i JSON těla na
 * OCR) to appku na telefonu spolehlivě sekne (nahlášeno z provozu u
 * stáčení lahví: „když dám vyfotit, appka spadne"). `FotkyZaznamu.tsx` má
 * proti přesně tomuhle poznámku od dřívějška — tahle funkce dělá totéž,
 * jen vrací data URL místo Blobu k nahrání.
 *
 * `createImageBitmap` neumí PDF (appka fotky přijímá i jako PDF ze
 * souborového výběru, ne jen z fotoaparátu) a v testovacím prostředí
 * (jsdom) vůbec neexistuje — v obou případech se použije originál
 * nezmenšený, ať se fotka/soubor neztratí.
 */
export async function zmensenyDataUrl(soubor: File): Promise<string> {
  try {
    const bitmapa = await createImageBitmap(soubor);
    const meritko = Math.min(1, MAX_STRANA_FOTKY / Math.max(bitmapa.width, bitmapa.height));
    const sirka = Math.max(1, Math.round(bitmapa.width * meritko));
    const vyska = Math.max(1, Math.round(bitmapa.height * meritko));
    const platno = document.createElement('canvas');
    platno.width = sirka;
    platno.height = vyska;
    const ctx = platno.getContext('2d');
    if (!ctx) { bitmapa.close?.(); return souborNaDataUrl(soubor); }
    ctx.drawImage(bitmapa, 0, 0, sirka, vyska);
    bitmapa.close?.();
    return platno.toDataURL('image/jpeg', KVALITA_FOTKY);
  } catch {
    return souborNaDataUrl(soubor);
  }
}
