// ⏱️ Rychlé odpočty v liště nahoře na ploše — jedno klepnutí, pevný čas.
// ---------------------------------------------------------------------------
// Z provozu 28. 9. 2026: „nahoru, jak je lupa, dej kulatou ikonu CO2 — když
// na ni kliknu, spustí se časovač 2 minuty, stejně jako u dlaždice CO2; ať
// je ikona barevná; přidej ikonu stejné barvy s ikonou kotel, odpočet
// 2 minuty; dej tam sud malý a sud velký — sud malý odpočet 8 minut,
// velký 15 minut." Od 20. 10. 2026 velký sud 10 minut.
//
// Majitel 18. 11. 2026: „jak jsou nahoře odpočty sudů, ať je tam volba
// různých libovolných odpočtů." Délky (a co v liště je) si teď nastaví sám:
// výchozí odpočty jdou schovat a přepsat jim délku, přibývají vlastní
// (název + čas) a jde spustit i jednorázový odpočet na libovolný čas.
//
// Chovají se jako dlaždice CO2 (lib/co2Foukani.ts): klepnutí spustí, další
// klepnutí zastaví a odpočet zmizí. Ukládají se mezi běžné odpočty
// (lib/stopwatchTimers.ts), takže je hlídá stejný alarm i pásek upozornění
// na ploše. Každý má pevné id — stejný odpočet nemůže běžet dvakrát. Všechna
// id mají předponu `rychly-` (podle ní se odpočet po klepnutí na pásek maže,
// viz zastavOdpocetVSeznamu).
//
// TENHLE SOUBOR je jen to, co potřebuje lišta na ploše hned po startu
// (výpis, spuštění, čas). Úpravy nastavení (přidat, smazat, přepsat délku,
// přečíst čas z pole) jsou v rychleOdpoctyUpravy.ts a načítají se až s oknem
// „Rychlé odpočty" — start aplikace má strop na velikost (zkontroluj-velikost).
import { countdownRemainingMs, type CountdownTimer } from './stopwatchTimers';
import { CO2_DELKA_MS, CO2_ID, CO2_POPIS } from './co2Foukani';

export type RychlyOdpocet = { id: string; popis: string; kratce: string; delkaMs: number };

export const SEK = 1000;
export const MIN = 60 * SEK;
export const HOD = 60 * MIN;

export const RYCHLE_ODPOCTY: RychlyOdpocet[] = [
  { id: CO2_ID, popis: CO2_POPIS, kratce: 'CO2', delkaMs: CO2_DELKA_MS },
  { id: 'rychly-kotel', popis: 'Kotel', kratce: 'Kotel', delkaMs: 2 * MIN },
  { id: 'rychly-sud-maly', popis: 'Sud malý', kratce: 'Malý sud', delkaMs: 8 * MIN },
  { id: 'rychly-sud-velky', popis: 'Sud velký', kratce: 'Velký sud', delkaMs: 10 * MIN },
];

// ── Nastavení: co je v liště a jak dlouho se odpočítává ────────────────────

/** Nejkratší a nejdelší odpočet, který jde nastavit. */
export const MIN_DELKA_MS = 10 * SEK;
export const MAX_DELKA_MS = 24 * HOD;
/** Kolik vlastních odpočtů se vejde do nastavení (lišta se na telefonu zalamuje). */
export const MAX_VLASTNICH = 8;
export const MAX_POPIS = 24;

export const PREDPONA_VLASTNI = 'rychly-vlastni-';
const PREDPONA_JEDNORAZOVY = 'rychly-jednorazovy-';

export type VlastniRychlyOdpocet = { id: string; popis: string; delkaMs: number };

export type NastaveniRychlychOdpoctu = {
  /** Id odpočtů (výchozích i vlastních), které se v liště NEukazují. */
  skryte: string[];
  /** Přepsaná délka výchozích odpočtů (id → ms). Foukání CO2 má délku pevnou. */
  delky: Record<string, number>;
  /** Odpočty, které si majitel přidal sám — v liště za výchozími. */
  vlastni: VlastniRychlyOdpocet[];
};

export const BEZ_NASTAVENI: NastaveniRychlychOdpoctu = { skryte: [], delky: {}, vlastni: [] };

const jeVychoziId = (id: string) => RYCHLE_ODPOCTY.some((r) => r.id === id);
export const delkaJeVRozsahu = (ms: unknown): ms is number =>
  typeof ms === 'number' && Number.isFinite(ms) && ms >= MIN_DELKA_MS && ms <= MAX_DELKA_MS;

/** Z čehokoli (úložiště, cloud) udělá platné nastavení — nesmyslné části zahodí. */
export function normalizujNastaveni(raw: unknown): NastaveniRychlychOdpoctu {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const skryte = Array.isArray(o.skryte)
    ? [...new Set(o.skryte.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80))]
    : [];

  const delky: Record<string, number> = {};
  if (o.delky && typeof o.delky === 'object' && !Array.isArray(o.delky)) {
    for (const [id, ms] of Object.entries(o.delky as Record<string, unknown>)) {
      // Délka se přepisuje jen výchozím odpočtům (a ne CO2 — to je totéž co dlaždice).
      if (jeVychoziId(id) && id !== CO2_ID && delkaJeVRozsahu(ms)) delky[id] = Math.round(ms / SEK) * SEK;
    }
  }

  const vlastni: VlastniRychlyOdpocet[] = [];
  if (Array.isArray(o.vlastni)) {
    for (const v of o.vlastni) {
      if (vlastni.length >= MAX_VLASTNICH) break;
      const x = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      const id = typeof x.id === 'string' ? x.id : '';
      const popis = typeof x.popis === 'string' ? x.popis.replace(/\s+/g, ' ').trim().slice(0, MAX_POPIS) : '';
      if (!id.startsWith(PREDPONA_VLASTNI) || id.length > 60 || !popis || !delkaJeVRozsahu(x.delkaMs)) continue;
      if (vlastni.some((w) => w.id === id)) continue;
      vlastni.push({ id, popis, delkaMs: Math.round((x.delkaMs as number) / SEK) * SEK });
    }
  }
  return { skryte, delky, vlastni };
}

export type RadekRychlychOdpoctu = RychlyOdpocet & {
  vychozi: boolean;
  /** Je v liště? */
  viditelny: boolean;
  /** Původní délka výchozího odpočtu (u vlastních null) — pro „vrátit původní". */
  vychoziDelkaMs: number | null;
  /** Délku nejde měnit (foukání CO2). */
  delkaFixni: boolean;
};

/**
 * Všechny rychlé odpočty i s nastavením — pro okno úprav, a z toho se skládá
 * i lišta. Foukání CO2 je jen tehdy, když je modul zapnutý (`co2`).
 */
export function vsechnyRychle(
  nastaveni: NastaveniRychlychOdpoctu = BEZ_NASTAVENI,
  { co2 = false }: { co2?: boolean } = {},
): RadekRychlychOdpoctu[] {
  const skryte = new Set(nastaveni.skryte);
  const vychozi: RadekRychlychOdpoctu[] = RYCHLE_ODPOCTY
    .filter((r) => co2 || r.id !== CO2_ID)
    .map((r) => ({
      ...r,
      delkaMs: nastaveni.delky[r.id] ?? r.delkaMs,
      vychozi: true,
      viditelny: !skryte.has(r.id),
      vychoziDelkaMs: r.delkaMs,
      delkaFixni: r.id === CO2_ID,
    }));
  const vlastni: RadekRychlychOdpoctu[] = nastaveni.vlastni.map((v) => ({
    id: v.id,
    popis: v.popis,
    kratce: v.popis,
    delkaMs: v.delkaMs,
    vychozi: false,
    viditelny: !skryte.has(v.id),
    vychoziDelkaMs: null,
    delkaFixni: false,
  }));
  return [...vychozi, ...vlastni];
}

/** Rychlé odpočty, které se ukazují v liště (po schování a přepsání délek). */
export function seznamRychlychOdpoctu(
  nastaveni: NastaveniRychlychOdpoctu = BEZ_NASTAVENI,
  moznosti: { co2?: boolean } = {},
): RychlyOdpocet[] {
  return vsechnyRychle(nastaveni, moznosti).filter((r) => r.viditelny);
}

export function rychlyOdpocet(id: string, nastaveni: NastaveniRychlychOdpoctu = BEZ_NASTAVENI): RychlyOdpocet | undefined {
  // Schovaný odpočet může pořád běžet — musí se dát najít (štítek na pásku).
  return vsechnyRychle(nastaveni, { co2: true }).find((r) => r.id === id);
}

export function jeRychlyOdpocet(id: string): boolean {
  return !!rychlyOdpocet(id);
}

export function rychlyBezi(list: CountdownTimer[], id: string): boolean {
  return list.find((t) => t.id === id)?.targetAt != null;
}

/** Zbývající čas; když neběží, celá délka. */
export function rychlyZbyva(list: CountdownTimer[], id: string, nastaveni: NastaveniRychlychOdpoctu = BEZ_NASTAVENI): number {
  const t = list.find((x) => x.id === id);
  return t ? countdownRemainingMs(t) : (rychlyOdpocet(id, nastaveni)?.delkaMs ?? 0);
}

/** Klepnutí na ikonu: běží → zastav a smaž, neběží → spusť od začátku. */
export function prepniRychlyOdpocet(
  list: CountdownTimer[],
  id: string,
  ted: number = Date.now(),
  nastaveni: NastaveniRychlychOdpoctu = BEZ_NASTAVENI,
): CountdownTimer[] {
  const def = rychlyOdpocet(id, nastaveni);
  if (!def) return list;
  const bez = list.filter((t) => t.id !== id);
  if (rychlyBezi(list, id)) return bez;
  return [...bez, {
    id: def.id,
    label: def.popis,
    durationMs: def.delkaMs,
    initialDurationMs: def.delkaMs,
    targetAt: ted + def.delkaMs,
    notifiedAt: null,
  }];
}

// ── Jednorázový odpočet na libovolný čas ────────────────────────────────────

/** Čtyři náhodné znaky do id — dva odpočty vzniklé ve stejné milisekundě nesmí mít totéž id. */
export function nahodnyKus(): string {
  return Math.random().toString(36).slice(2, 6);
}

/**
 * Spustí odpočet, který se nikam neukládá — jen běží (a hlídá ho stejný alarm
 * i pásek upozornění). Na rozdíl od ikon v liště jich může běžet víc naráz.
 */
export function spustJednorazovy(
  list: CountdownTimer[],
  popis: string,
  delkaMs: number,
  ted: number = Date.now(),
): CountdownTimer[] {
  if (!delkaJeVRozsahu(delkaMs)) return list;
  const ms = Math.round(delkaMs / SEK) * SEK;
  const nazev = popis.replace(/\s+/g, ' ').trim().slice(0, MAX_POPIS);
  return [...list, {
    id: `${PREDPONA_JEDNORAZOVY}${ted.toString(36)}-${nahodnyKus()}`,
    label: nazev || `Odpočet ${popisDelky(ms)}`,
    durationMs: ms,
    initialDurationMs: ms,
    targetAt: ted + ms,
    notifiedAt: null,
  }];
}

// ── Zápis času ─────────────────────────────────────────────────────────────

/** Délka slovy: „45 s", „8 min", „1 min 30 s", „1 h 30 min". */
export function popisDelky(ms: number): string {
  const celkem = Math.round(ms / SEK);
  const h = Math.floor(celkem / 3600);
  const min = Math.floor((celkem % 3600) / 60);
  const s = celkem % 60;
  const dily = [h ? `${h} h` : '', min ? `${min} min` : '', s ? `${s} s` : ''].filter(Boolean);
  return dily.join(' ') || '0 s';
}

/** Čas do kulatého tlačítka — musí se vejít do 38 px: „9:59", „1h20". */
export function kratkyCas(ms: number): string {
  const celkem = Math.max(0, Math.floor(ms / SEK));
  const h = Math.floor(celkem / 3600);
  const m = Math.floor((celkem % 3600) / 60);
  const s = celkem % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Štítek na neběžícím tlačítku vlastního odpočtu: „15′", „45s", „1h30". */
export function stitekDelky(ms: number): string {
  const celkem = Math.round(ms / SEK);
  if (celkem < 60) return `${celkem}s`;
  if (celkem >= 3600) return kratkyCas(ms);
  return celkem % 60 === 0 ? `${celkem / 60}′` : kratkyCas(ms);
}
