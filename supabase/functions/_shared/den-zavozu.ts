// 📅 Den závozu ze zprávy: „na PŘÍŠTÍ týden na středu“ = středa příštího týdne.
// ---------------------------------------------------------------------------
// Z provozu 14. 10. 2026 (středa): „Jakub Hladík z Dobřichovic, Podpultovky na
// příští týden na středu prosím 1x30l 12sv“ skončil na dnešní středě (14. 10.).
// Majitel: „bylo to na příští středu, to znamená příští středa, ne tenhle týden,
// mělo to nasadit na středu 21. 10.“
//
// Server (whatsapp-auto-parse) uměl z názvu dne jen kód dne a datum nechával
// otevřené; kontrolní okno si pak vzalo nejbližší takový den od dneška — a když
// je dnes středa, je to dnešek. Slovo „příští“ se ignorovalo. Pravidla jsou tady
// na jednom místě, ať server, kontrolní okno i klientský parser říkají totéž.
//
// Soubor je záměrně bez závislostí: běží v Deno (edge funkce) i v prohlížeči
// a ve vitestu.

/** Kódy dnů podle `Date.getUTCDay()` (0 = neděle). */
export const KODY_DNU = ['ne', 'po', 'ut', 'st', 'ct', 'pa', 'so'] as const;

// Bez diakritiky, malými, jen písmena a číslice, slova oddělená mezerou.
function slova(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

// Věty a výčty, které nepatří k sobě: „na středu. Fakturu pošlu příští týden.“
// Nový řádek, tečka, čárka, středník, dvojtečka, vykřičník, otazník, závorka.
const HRANICE_VETY = /[\n.,;:!?()]+/;

const JE_DEN = /^(?:pondel(?:i|ku|ka|kem)|utery|uter(?:ku|ka|kem)|stred(?:a|y|e|u|ou)|ctvrtek|ctvrt(?:ku|ka|kem)|patek|pat(?:ku|ka|kem)|sobot(?:a|y|e|u|ou)|nedel(?:e|i|ou))$/;
const PRISTI = new Set(['pristi', 'pristim', 'pristiho']);
const PRIVLASTEK_TYDNE = new Set([...PRISTI, 'dalsi', 'dalsim', 'nasledujici', 'nadchazejici']);
const TYDEN = new Set(['tyden', 'tydnu', 'tydne']);

/** Slov mezi „příští týden“ a názvem dne, aby k sobě ještě patřily („na příští týden na středu“ = 1). */
const NEJVIC_SLOV_MEZI = 3;

/**
 * Říká text, že se myslí PŘÍŠTÍ týden?
 *   „na příští týden na středu“, „ve čtvrtek příští týden“, „za týden v úterý“,
 *   „na příští středu“, „příštího pátku“
 * a — když text žádný den nejmenuje — i holé „na příští týden 3x30“.
 *
 * Záměrně úzké, ať neposouvá objednávku, která jen zmiňuje příští týden jinde:
 * „3x30l na středu. Fakturu pošlu příští týden.“ není příští středa. „Příští
 * týden“ a název dne musí být ve stejné větě a nejvýš pár slov od sebe.
 */
export function textRikaPristiTyden(text: string | null | undefined): boolean {
  if (!text) return false;
  const vety = text.split(HRANICE_VETY).map(slova).filter((v) => v.length > 0);
  const textMaDen = vety.some((v) => v.some((s) => JE_DEN.test(s)));
  let fraze = false;

  for (const v of vety) {
    // „příští středu“ — přívlastek přímo před názvem dne.
    for (let i = 0; i < v.length - 1; i++) {
      if (PRISTI.has(v[i]) && JE_DEN.test(v[i + 1])) return true;
    }
    // „příští týden“ / „další týden“ / „za týden“.
    for (let i = 0; i < v.length - 1; i++) {
      const jeFraze = (PRIVLASTEK_TYDNE.has(v[i]) || v[i] === 'za') && TYDEN.has(v[i + 1]);
      if (!jeFraze) continue;
      fraze = true;
      for (let j = 0; j < v.length; j++) {
        if (!JE_DEN.test(v[j])) continue;
        const mezi = j > i + 1 ? j - (i + 1) - 1 : i - j - 1;
        if (mezi <= NEJVIC_SLOV_MEZI) return true;
      }
    }
  }
  // Bez jediného dne v textu se „příští týden“ týká celé objednávky.
  return fraze && !textMaDen;
}

const DEN_MS = 86_400_000;
const utc = (iso: string) => new Date(iso + 'T00:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const posun = (d: Date, dny: number) => new Date(d.getTime() + dny * DEN_MS);
const pondeli = (d: Date) => posun(d, -((d.getUTCDay() + 6) % 7));

/**
 * Datum dne závozu `den` (po…ne) od dne `dnes` (YYYY-MM-DD).
 *
 * Bez `pristiTyden` nejbližší takový den od dneška, dnešek včetně (napsáno ve
 * středu „na středu“ = dnes). S `pristiTyden` den příštího týdne: když ten
 * nejbližší padne ještě do tohoto týdne (po–ne), přidá se sedm dní; když už je
 * v příštím („v pátek na příští týden úterý“), je správně a nepřidává se nic.
 */
export function datumDne(den: string, dnes: string, pristiTyden = false): string | null {
  const cil = (KODY_DNU as readonly string[]).indexOf(den);
  if (cil < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dnes)) return null;
  const dnesD = utc(dnes);
  if (Number.isNaN(dnesD.getTime())) return null;
  const nejblizsi = posun(dnesD, (cil - dnesD.getUTCDay() + 7) % 7);
  if (!pristiTyden) return iso(nejblizsi);
  const jeVTomtoTydnu = iso(pondeli(nejblizsi)) === iso(pondeli(dnesD));
  return iso(jeVTomtoTydnu ? posun(nejblizsi, 7) : nejblizsi);
}

/** Datum (YYYY-MM-DD) podle Prahy pro daný okamžik; bez okamžiku nebo s neplatným dnešek. */
export function datumPraha(kdy?: string | Date | null): string {
  let d = kdy ? new Date(kdy) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  const casti = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const hodnota = (typ: string) => casti.find((c) => c.type === typ)?.value ?? '';
  return `${hodnota('year')}-${hodnota('month')}-${hodnota('day')}`;
}
