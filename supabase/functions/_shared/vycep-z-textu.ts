// 🍺 Výčep (pípa, kohout) ve zprávě nebo poznámce objednávky — JEDNO místo pravidel.
// ---------------------------------------------------------------------------
// Dřív to byly tři opsané seznamy, které se rozešly:
//  - `isTapMentioned` / `detectTapType` v lib/tapReservations.ts (rozhodují o
//    rezervaci výčepu),
//  - `NOTE_PATTERNS` v lib/orderParser.ts (poznámka při čtení v appce),
//  - `noteKeywords` v edge funkci whatsapp-auto-parse (poznámka při čtení
//    na serveru).
// Test na skutečných zprávách (5. 11. 2026) ukázal, co z toho plyne:
//  - „pipa dvoukohout" (tak to lidé píšou nejčastěji) se jako typ nepoznal —
//    znalo se jen „dvojkohout". Rezervace pak vzala první volný výčep jakéhokoli
//    typu,
//  - „šestikohout" a „šestipípa" se jako typ nepoznal nikdy: pravidlo hledalo
//    „sest…", ne „sesti…",
//  - „plus pipa jednokohout pro …" skončilo v poznámce jako holé „pipa" —
//    první nalezené slovo vyhrálo a typ se ztratil,
//  - „pípu" a „výčep" S DIAKRITIKOU se v poznámce nepoznaly vůbec, takže se
//    okno rezervace neotevřelo a požadavek na výčep zmizel.
//
// Soubor je záměrně bez závislostí: běží v Deno (edge funkce), v prohlížeči
// i ve vitestu.

/** Typy výčepů, které evidence zná (viz TapEquipment v screens/VycepyScreen.tsx). */
export type TypVycepu = 'jednokohout' | 'dvojkohout' | 'trojkohout' | 'sestikohout';

/** Bez diakritiky, malými; `map[i]` je pozice znaku `t[i]` v původním textu. */
function normalizuj(text: string): { t: string; map: number[] } {
  let t = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = text[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const c of n) {
      t += c;
      map.push(i);
    }
  }
  return { t, map };
}

// Předmět: kohout (kohouty, kohoutu, kohoutek…), pípa (pípu, pípy, pípou…), výčep (výčepní…).
const PREDMET = '(?:kohout\\w*|pip(?:a|u|y|e|ou|om|am|ama|ach)|vycep\\w*)';
// Předpona druhu, napsaná dohromady i zvlášť: dvojkohout, dvoukohout, dvou kohout, dvou-kohout.
const PREDPONA = '(?:jedno|dvoj|dvou|troj|tri|ctyr|sesti)';
// Počet před kohouty: „2 kohouty", „dva kohouty", „3kohout". Jen u kohoutů — „2 pípy" jsou
// dvě samostatné pípy, ne dvojkohout.
const CISLOVKA = '(?:1|2|3|4|6|jeden|jedna|dva|dve|tri|ctyri|sest)';
// Doplňky k výčepu (chlazení, narážeč) — zmínka, ne druh.
const DOPLNEK = '(?:chlazeni|chladak|narazec\\w*|narazeni)';

const ZMINKA = new RegExp(
  `(?:^|[^a-z0-9])(`
  + `(?:${PREDPONA}\\s*-?\\s*)?${PREDMET}`
  + `|${CISLOVKA}\\s*-?\\s*kohout\\w*`
  + `|${DOPLNEK}`
  + `)(?![a-z0-9])`,
  'g',
);
const JE_DOPLNEK = new RegExp(`^${DOPLNEK}$`);

type Nalez = { text: string; start: number; konec: number; typ: TypVycepu | 'jiny' | null; doplnek: boolean };

/** Druh podle začátku nalezeného slova: „dvou-kohout" → dvojkohout, holá „pipa" → null. */
function typZeSlova(s: string): TypVycepu | 'jiny' | null {
  if (/^(?:jedno|jeden|jedna|1)/.test(s)) return 'jednokohout';
  if (/^(?:dvoj|dvou|dva|dve|2)/.test(s)) return 'dvojkohout';
  if (/^(?:troj|tri|3)/.test(s)) return 'trojkohout';
  if (/^(?:sesti|sest|6)/.test(s)) return 'sestikohout';
  // Čtyřkohout evidence nezná — nesmí se z něj stát jiný druh.
  if (/^(?:ctyr|ctyri|4)/.test(s)) return 'jiny';
  return null;
}

function najdi(text: string): Nalez[] {
  const { t, map } = normalizuj(text);
  const out: Nalez[] = [];
  for (const m of t.matchAll(ZMINKA)) {
    const slovo = m[1];
    const start = (m.index ?? 0) + (m[0].length - slovo.length);
    const konec = start + slovo.length;
    out.push({
      text: slovo,
      start: map[start],
      konec: map[konec - 1] + 1,
      typ: typZeSlova(slovo),
      doplnek: JE_DOPLNEK.test(slovo),
    });
  }
  return out;
}

/** Je ve zprávě řeč o výčepu (pípa, kohout, výčep, chlazení, narážeč)? */
export function jeZminenVycep(text?: string | null): boolean {
  if (!text) return false;
  return najdi(text).length > 0;
}

/**
 * Jaký druh výčepu se chce: „pipa dvoukohout" → dvojkohout, „šestikohout" →
 * sestikohout. `null`, když druh není řečen („+ výčep"), když se řekly dva
 * různé („jednokohout nebo dvojkohout") nebo je to druh, který evidence nezná
 * (čtyřkohout) — nehádá se, vybere obsluha.
 */
export function typVycepu(text?: string | null): TypVycepu | null {
  if (!text) return null;
  const druhy = new Set<TypVycepu | 'jiny'>();
  for (const n of najdi(text)) if (n.typ) druhy.add(n.typ);
  if (druhy.size !== 1) return null;
  const [jediny] = [...druhy];
  return jediny === 'jiny' ? null : jediny;
}

/**
 * Krátký popis zmínky o výčepu do poznámky objednávky: „pipa jednokohout",
 * „pípu dvojkohout", „výčep", „narazec". Píše se tak, jak to stálo ve zprávě
 * (i s diakritikou), a druh se k holé „pipa" přidá, i když stál jinde ve větě —
 * právě tohle se dřív ztrácelo („plus pipa jednokohout pro …" → „pipa").
 *
 * `null`, když ve zprávě o výčepu řeč není.
 */
export function popisZminkyVycepu(text?: string | null): string | null {
  if (!text) return null;
  const nalezy = najdi(text);
  if (nalezy.length === 0) return null;
  // Výčep samotný má přednost před doplňkem („plus narážeč, pipa dvoukohout").
  const hlavni = nalezy.find((n) => !n.doplnek) ?? nalezy[0];
  const slovo = text.slice(hlavni.start, hlavni.konec).trim();
  if (hlavni.doplnek || hlavni.typ) return slovo;
  const druh = typVycepu(text);
  return druh ? `${slovo} ${druh}` : slovo;
}
