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

/** Jak moc se fotka smí zmenšit (výchozí hodnoty viz výše). */
export type VolbyZmenseni = {
  /** Nejdelší strana v pixelech. */
  maxStrana?: number;
  /** Kvalita JPEG 0–1. */
  kvalita?: number;
  /**
   * Strop na délku výsledného data URL. Když ho fotka přesáhne, zmenšuje se
   * dál (o pětinu), dokud se nevejde — velký snímek by jinak nešel odeslat
   * (edge funkce berou tělo do 15 MB, Google Vision do 10 MB, Anthropic obrázek do 5 MB).
   */
  maxZnaku?: number;
};

/** Rozměry po zmenšení tak, aby delší strana nepřekročila `maxStrana`; menší obrázek se nezvětšuje. */
export function rozmeryPoZmenseni(sirka: number, vyska: number, maxStrana: number): { sirka: number; vyska: number } {
  const meritko = Math.min(1, maxStrana / Math.max(sirka, vyska));
  return { sirka: Math.max(1, Math.round(sirka * meritko)), vyska: Math.max(1, Math.round(vyska * meritko)) };
}

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
export async function zmensenyDataUrl(soubor: File, volby: VolbyZmenseni = {}): Promise<string> {
  const kvalita = volby.kvalita ?? KVALITA_FOTKY;
  try {
    const bitmapa = await createImageBitmap(soubor);
    try {
      let maxStrana = volby.maxStrana ?? MAX_STRANA_FOTKY;
      for (let pokus = 0; ; pokus++) {
        const { sirka, vyska } = rozmeryPoZmenseni(bitmapa.width, bitmapa.height, maxStrana);
        const platno = document.createElement('canvas');
        platno.width = sirka;
        platno.height = vyska;
        const ctx = platno.getContext('2d');
        if (!ctx) return souborNaDataUrl(soubor);
        ctx.drawImage(bitmapa, 0, 0, sirka, vyska);
        const url = platno.toDataURL('image/jpeg', kvalita);
        // Vešlo se, nebo už není kam zmenšovat (třetí zmenšení) — vrátí se, co je.
        if (!volby.maxZnaku || url.length <= volby.maxZnaku || pokus >= 3) return url;
        maxStrana = Math.round(Math.max(sirka, vyska) * 0.8);
      }
    } finally {
      bitmapa.close?.();
    }
  } catch {
    return souborNaDataUrl(soubor);
  }
}

/** Obdélník na obrázku, v částech jeho šířky a výšky (0–1). */
export type OknoObrazku = { x0: number; y0: number; x1: number; y1: number };

/**
 * Z jaké části obrázku se výřez bere (px) a na jakou velikost se zvětší.
 * Výřez užší než `cilovaSirka` se zvětší (nejvýš 4×) — malé písmo ve výřezu
 * z kratšího snímku AI i OCR čtou přesněji, když má víc pixelů (z provozu
 * 15. 10. 2026: u neupraveného snímku zaměnila sloupec 20 l za 15 l, po
 * zvětšení přečetla všech 22 řádků správně). Delší strana výsledku nepřekročí
 * `maxStrana`.
 */
export function rozmeryVyrezu(
  sirka: number,
  vyska: number,
  okno: OknoObrazku,
  cilovaSirka = 1800,
  maxStrana = 3200,
): { sx: number; sy: number; sw: number; sh: number; dw: number; dh: number } {
  const x0 = Math.min(Math.max(okno.x0, 0), 1);
  const y0 = Math.min(Math.max(okno.y0, 0), 1);
  const sx = Math.min(sirka - 1, Math.round(x0 * sirka));
  const sy = Math.min(vyska - 1, Math.round(y0 * vyska));
  const sw = Math.max(1, Math.min(sirka - sx, Math.round((Math.min(Math.max(okno.x1, 0), 1) - x0) * sirka)));
  const sh = Math.max(1, Math.min(vyska - sy, Math.round((Math.min(Math.max(okno.y1, 0), 1) - y0) * vyska)));
  let meritko = Math.min(4, Math.max(1, cilovaSirka / sw));
  meritko = Math.min(meritko, maxStrana / Math.max(sw, sh));
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * meritko)), dh: Math.max(1, Math.round(sh * meritko)) };
}

/**
 * Výřez obrázku (data URL) zvětšený pro čtení. Bez plátna (testovací
 * prostředí) nebo při chybě vrací `null` — volající pak čte celý obrázek.
 */
export async function oriznutyDataUrl(
  dataUrl: string,
  okno: OknoObrazku,
  volby: { cilovaSirka?: number; maxStrana?: number; kvalita?: number } = {},
): Promise<string | null> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const r = rozmeryVyrezu(img.naturalWidth, img.naturalHeight, okno, volby.cilovaSirka, volby.maxStrana);
    const platno = document.createElement('canvas');
    platno.width = r.dw;
    platno.height = r.dh;
    const ctx = platno.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.dw, r.dh);
    return platno.toDataURL('image/jpeg', volby.kvalita ?? 0.9);
  } catch {
    return null;
  }
}
