// 🩺 Analýza problémů (etapa 10) — typy zjištění, stavy, načtení přehledu
// a text pro Clauda. Bez závislostí mimo sdílený modul várek: appka,
// bible-api i konektor bible-mcp.
//
// Architektura § 6: každé tvrzení nese jeden typ (doložený fakt, výsledek
// výpočtu, provozní zkušenost, technologické doporučení, hypotéza, neznámá
// hodnota). Analýza „s jasným označením, co je fakt, co hypotéza a co chybí".
import { porovnaniText, porovnejVarky, type RecepturaData, type VarkaData } from './varky-popisy.ts';

export const TYPY_ZJISTENI = [
  { id: 'fakt', nazev: 'Doložený fakt', popis: 's citací (kniha a strana, várka, měření)', zdrojPovinny: true },
  { id: 'vypocet', nazev: 'Výsledek výpočtu', popis: 'z výpočetního modulu', zdrojPovinny: true },
  { id: 'zkusenost', nazev: 'Provozní zkušenost', popis: 'ze zkušeností sládků', zdrojPovinny: false },
  { id: 'doporuceni', nazev: 'Technologické doporučení', popis: 'vlastní úvaha, ne pravidlo z literatury', zdrojPovinny: false },
  { id: 'hypoteza', nazev: 'Hypotéza', popis: 'nepotvrzený předpoklad', zdrojPovinny: false },
  { id: 'chybi', nazev: 'Neznámá hodnota', popis: 'údaj chybí — nedomýšlet', zdrojPovinny: false },
] as const;
export type TypZjisteni = (typeof TYPY_ZJISTENI)[number]['id'];

export const STAVY_PROBLEMU = [
  { id: 'otevreny', nazev: 'Otevřený' },
  { id: 'vyreseny', nazev: 'Vyřešený' },
  { id: 'odlozeny', nazev: 'Odložený' },
] as const;
export type StavProblemu = (typeof STAVY_PROBLEMU)[number]['id'];

export const STAVY_ZJISTENI = [
  { id: 'navrzeno', nazev: 'navrženo' },
  { id: 'potvrzeno', nazev: 'potvrzeno' },
  { id: 'vyvraceno', nazev: 'vyvráceno' },
] as const;
export type StavZjisteni = (typeof STAVY_ZJISTENI)[number]['id'];

export const nazevTypu = (t: string): string => TYPY_ZJISTENI.find((x) => x.id === t)?.nazev ?? t;
export const nazevStavuProblemu = (s: string): string => STAVY_PROBLEMU.find((x) => x.id === s)?.nazev ?? s;
export const nazevStavuZjisteni = (s: string): string => STAVY_ZJISTENI.find((x) => x.id === s)?.nazev ?? s;

export type Zjisteni = {
  id: string;
  typ: TypZjisteni;
  text: string;
  zdroj: string | null;
  stav: StavZjisteni;
  zapsal: string | null;
  zapsal_jmeno: string | null;
  pres_claude: boolean;
  created_at: string | null;
};

export type Problem = {
  id: string;
  nazev: string;
  popis: string | null;
  pivo: string | null;
  varky: string[];
  oblasti: string[];
  stav: StavProblemu;
  reseni: string | null;
  zapsal: string | null;
  zapsal_jmeno: string | null;
  pres_claude: boolean;
  created_at: string | null;
  upraveno_at: string | null;
  zjisteni: Zjisteni[];
};

const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const JE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jeTyp = (v: unknown): v is TypZjisteni => TYPY_ZJISTENI.some((t) => t.id === v);
const jeStavProblemu = (v: unknown): v is StavProblemu => STAVY_PROBLEMU.some((s) => s.id === v);
const jeStavZjisteni = (v: unknown): v is StavZjisteni => STAVY_ZJISTENI.some((s) => s.id === v);

/** Přehled z bible_problemy_prehled → očištěné problémy (vadné řádky vynechá). */
export function prehledProblemu(data: unknown): Problem[] {
  const out: Problem[] = [];
  for (const x of Array.isArray(data) ? data : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    if (!id) continue;
    const zjisteni: Zjisteni[] = [];
    for (const y of Array.isArray(o.zjisteni) ? o.zjisteni : []) {
      const z = (y ?? {}) as Record<string, unknown>;
      const zid = txt(z.id);
      if (!zid || !jeTyp(z.typ)) continue;
      zjisteni.push({
        id: zid, typ: z.typ, text: txt(z.text) ?? '', zdroj: txt(z.zdroj),
        stav: jeStavZjisteni(z.stav) ? z.stav : 'navrzeno',
        zapsal: txt(z.zapsal), zapsal_jmeno: txt(z.zapsal_jmeno), pres_claude: z.pres_claude === true, created_at: txt(z.created_at),
      });
    }
    out.push({
      id, nazev: txt(o.nazev) ?? 'Problém', popis: txt(o.popis), pivo: txt(o.pivo),
      varky: Array.isArray(o.varky) ? o.varky.filter((v): v is string => typeof v === 'string' && JE_UUID.test(v)) : [],
      oblasti: Array.isArray(o.oblasti) ? o.oblasti.filter((k): k is string => typeof k === 'string' && /^[A-T]$/.test(k)) : [],
      stav: jeStavProblemu(o.stav) ? o.stav : 'otevreny',
      reseni: txt(o.reseni), zapsal: txt(o.zapsal), zapsal_jmeno: txt(o.zapsal_jmeno), pres_claude: o.pres_claude === true,
      created_at: txt(o.created_at), upraveno_at: txt(o.upraveno_at), zjisteni,
    });
  }
  return out;
}

/** Kdo zjištění zapsal: „Claude (konektor) za Honzu" / „Honza". */
export const kdoZapsal = (z: { zapsal_jmeno: string | null; pres_claude: boolean }): string =>
  z.pres_claude ? `Claude (konektor)${z.zapsal_jmeno ? ` za ${z.zapsal_jmeno}` : ''}` : z.zapsal_jmeno ?? 'neznámý autor';

/** Seznam problémů pro Clauda (nástroj problemy bez problem_id). */
export function seznamProblemuText(problemy: readonly Problem[], vcetneUzavrenych: boolean): string {
  const vybrane = vcetneUzavrenych ? problemy : problemy.filter((p) => p.stav === 'otevreny');
  if (problemy.length === 0) return 'Analýza problémů je zatím prázdná. Nový problém založ nástrojem zaloz_problem.';
  if (vybrane.length === 0) return `Otevřený problém žádný není (celkem ${problemy.length}; uzavřené ukáže vse=true).`;
  const radky = [`# Problémy (${vybrane.length})`];
  for (const p of vybrane) {
    const pocty = TYPY_ZJISTENI.map((t) => [t.nazev, p.zjisteni.filter((z) => z.typ === t.id).length] as const).filter(([, n]) => n > 0);
    radky.push(`- ${p.nazev} — ${nazevStavuProblemu(p.stav)}${p.pivo ? `, ${p.pivo}` : ''}, várek ${p.varky.length}, zjištění ${p.zjisteni.length}`
      + `${pocty.length ? ` (${pocty.map(([n, k]) => `${n.toLowerCase()} ${k}`).join(', ')})` : ''} — problem_id=${p.id}`);
  }
  return radky.join('\n');
}

/**
 * Detail problému pro Clauda: příznaky, zjištění podle typu (se stavem
 * a zdrojem), řešení a porovnání dotčených várek (stejný kód jako appka).
 */
export function problemText(p: Problem, varky: readonly VarkaData[], receptury: readonly RecepturaData[]): string {
  const radky = [
    `# Problém: ${p.nazev}`,
    `Stav: ${nazevStavuProblemu(p.stav)}${p.pivo ? ` · pivo: ${p.pivo}` : ''}${p.oblasti.length ? ` · oblasti: ${p.oblasti.join(', ')}` : ''} · problem_id=${p.id}`,
    'Každé tvrzení drž v jednom typu (fakt se zdrojem, výpočet, zkušenost, doporučení, hypotéza, chybí). Hypotézu nevydávej za fakt; nové zjištění zapiš nástrojem zapis_zjisteni.',
  ];
  if (p.popis) radky.push('', '## Příznaky', p.popis);
  radky.push('', '## Zjištění');
  if (p.zjisteni.length === 0) radky.push('Zatím žádné.');
  for (const t of TYPY_ZJISTENI) {
    const toho = p.zjisteni.filter((z) => z.typ === t.id);
    if (toho.length === 0) continue;
    radky.push(`### ${t.nazev}`);
    for (const z of toho) {
      radky.push(`- ${z.text}${z.zdroj ? ` [zdroj: ${z.zdroj}]` : ''}${z.typ === 'hypoteza' || z.stav !== 'navrzeno' ? ` (${nazevStavuZjisteni(z.stav)})` : ''} — ${kdoZapsal(z)}`);
    }
  }
  if (p.reseni) radky.push('', '## Řešení', p.reseni);
  const dotcene = varky.filter((v) => p.varky.includes(v.id));
  const chybiVarky = p.varky.filter((id) => !varky.some((v) => v.id === id));
  radky.push('', '## Dotčené várky');
  if (dotcene.length === 0) {
    radky.push(p.varky.length > 0 ? 'Dotčené várky už v evidenci nejsou.' : 'K problému nejsou přiřazené žádné várky (přiřadit jdou v appce).');
  } else {
    radky.push(porovnaniText(porovnejVarky(dotcene, receptury), receptury));
  }
  if (chybiVarky.length > 0 && dotcene.length > 0) radky.push('', `Pozn.: ${chybiVarky.length} přiřazená várka už v evidenci není.`);
  return radky.join('\n');
}
