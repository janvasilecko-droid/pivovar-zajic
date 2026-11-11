// 🌐 Rešerše z internetu (etapa 9) — důvěra, stavy, načtení přehledu a text
// pro Clauda. Bez závislostí: sdílí ho appka, bible-api i konektor bible-mcp.
//
// Architektura § 10: web je v odpovědích „vždy zvlášť a s datem a nikdy
// nepřepíše literaturu". Nový zdroj je vždy neověřený; ověří ho správce.

export const DUVERA_WEBU = [
  { uroven: 1, nazev: 'Odborná instituce nebo recenzovaný článek' },
  { uroven: 2, nazev: 'Norma nebo dokumentace výrobce' },
  { uroven: 3, nazev: 'Odborný časopis nebo článek' },
  { uroven: 4, nazev: 'Blog, diskuse, zkušenost jednoho autora' },
  { uroven: 5, nazev: 'Neověřený zdroj' },
] as const;

export const STAVY_WEBU = [
  { id: 'neovereno', nazev: 'neověřeno' },
  { id: 'overeno', nazev: 'ověřeno' },
  { id: 'zamitnuto', nazev: 'zamítnuto' },
] as const;
export type StavWebu = (typeof STAVY_WEBU)[number]['id'];

export const nazevDuvery = (u: number): string => DUVERA_WEBU.find((d) => d.uroven === u)?.nazev ?? `Důvěra ${u}`;
export const nazevStavuWebu = (s: string): string => STAVY_WEBU.find((x) => x.id === s)?.nazev ?? s;

export type WebZdroj = {
  id: string;
  url: string;
  titulek: string;
  vydavatel: string | null;
  datum_publikace: string | null;
  zjisteno: string;
  shrnuti: string;
  oblasti: string[];
  duvera: number;
  stav: StavWebu;
  overil_jmeno: string | null;
  overeno_at: string | null;
  poznamka_overeni: string | null;
  zapsal: string | null;
  zapsal_jmeno: string | null;
  pres_claude: boolean;
};

const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const jeStav = (v: unknown): v is StavWebu => STAVY_WEBU.some((s) => s.id === v);

/** Přehled z bible_web_zdroje_prehled → očištěné zdroje (vadné řádky vynechá). */
export function prehledWebu(data: unknown): WebZdroj[] {
  const out: WebZdroj[] = [];
  for (const x of Array.isArray(data) ? data : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    const url = txt(o.url);
    if (!id || !url || !/^https?:\/\//i.test(url)) continue;
    out.push({
      id, url,
      titulek: txt(o.titulek) ?? url,
      vydavatel: txt(o.vydavatel),
      datum_publikace: txt(o.datum_publikace),
      zjisteno: txt(o.zjisteno) ?? '',
      shrnuti: txt(o.shrnuti) ?? '',
      oblasti: Array.isArray(o.oblasti) ? o.oblasti.filter((k): k is string => typeof k === 'string' && /^[A-T]$/.test(k)) : [],
      duvera: typeof o.duvera === 'number' && o.duvera >= 1 && o.duvera <= 5 ? o.duvera : 5,
      stav: jeStav(o.stav) ? o.stav : 'neovereno',
      overil_jmeno: txt(o.overil_jmeno),
      overeno_at: txt(o.overeno_at),
      poznamka_overeni: txt(o.poznamka_overeni),
      zapsal: txt(o.zapsal),
      zapsal_jmeno: txt(o.zapsal_jmeno),
      pres_claude: o.pres_claude === true,
    });
  }
  return out;
}

const bezDiakritiky = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export type FiltrWebu = { dotaz?: string; oblast?: string; stavy?: readonly StavWebu[] };

/** Zdroje podle filtru: všechna slova dotazu (bez diakritiky) v titulku, shrnutí, vydavateli nebo adrese. */
export function filtrujWeb(zdroje: readonly WebZdroj[], f: FiltrWebu): WebZdroj[] {
  const slova = f.dotaz ? bezDiakritiky(f.dotaz).split(/\s+/).filter(Boolean) : [];
  return zdroje.filter((z) => {
    if (f.stavy && !f.stavy.includes(z.stav)) return false;
    if (f.oblast && !z.oblasti.includes(f.oblast)) return false;
    if (slova.length === 0) return true;
    const text = bezDiakritiky(`${z.titulek} ${z.shrnuti} ${z.vydavatel ?? ''} ${z.url}`);
    return slova.every((s) => text.includes(s));
  });
}

const datum = (iso: string | null): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : 'neuvedeno';
};

/** Webové zdroje jako text pro Clauda (nástroj web_zdroje) — výslovně odděleně od literatury. */
export function webZdrojeText(zdroje: readonly WebZdroj[], celkem: number): string {
  if (celkem === 0) return 'Rešerše z internetu je zatím prázdná. Nalezené zdroje ulož nástrojem uloz_web_zdroj (vždy jako neověřené).';
  if (zdroje.length === 0) return 'Ve webových zdrojích k tomu nic není (zamítnuté zdroje se neukazují, dokud o ně výslovně nepožádáš).';
  const radky = [
    `# Webové zdroje (${zdroje.length})`,
    'Tohle je INTERNET, ne literatura z knihovny. V odpovědi ho uveď zvlášť, s datem a stavem; neověřený zdroj tak označ. '
      + 'Web nikdy nepřepisuje to, co říkají knihy — rozpor řekni.',
  ];
  for (const z of zdroje) {
    radky.push(
      '',
      `## ${z.titulek}`,
      `- Adresa: ${z.url}`,
      `- Stav: ${nazevStavuWebu(z.stav)}${z.stav !== 'neovereno' && z.overil_jmeno ? ` (${z.overil_jmeno}${z.poznamka_overeni ? `: ${z.poznamka_overeni}` : ''})` : ''}`,
      `- Důvěra: ${z.duvera} — ${nazevDuvery(z.duvera)}`,
      `- Publikováno: ${datum(z.datum_publikace)}; zjištěno: ${datum(z.zjisteno)}${z.vydavatel ? `; vydavatel: ${z.vydavatel}` : ''}`,
      `- Shrnutí: ${z.shrnuti}`,
    );
  }
  return radky.join('\n');
}
