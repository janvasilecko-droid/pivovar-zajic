// 🔁 Kdy se čtení zprávy z WhatsAppu zkusí znovu — a kolik času na něj je.
// ---------------------------------------------------------------------------
// 17. 11. 2026, majitel: „nechce se mi naparsovat fotka objednávky". Gemini byl
// přetížený, čtení fotky trvalo přes dvě minuty a server ho ukončil (HTTP 546,
// viz cas-cteni.ts). Zpráva skončila ve stavu „chyba" s textem „Parse API
// error: 546" a sama se už nikdy nezkusila — znovu se četlo jen po 502/503/504.
//
// Pravidla (jedno místo pro server i appku):
//  • Dočasná chyba čtení (AI přetížená, server čtení ukončil, síť) → zpráva
//    ČEKÁ (stav pending + poznámka s časem pokusu) a zkusí se znovu, nejdřív
//    za ODSTUP_POKUSU_MS. Hlídá to pg_cron (každé 3 min), takže appka nemusí
//    být otevřená. První hodinu; pak „chyba" a čte se ručně („Znovu parsovat").
//    12. 10. 2026 majitel: „ať to zkouší víckrát, po nějaké době".
//  • Odstup hlídá server podle času v poznámce. Otevřená appka totiž na každou
//    změnu čekající zprávy sama zavolá čtení — bez odstupu by se přetížená AI
//    zkoušela pořád dokola (každý pokus je pět dotazů na Gemini).
//  • Čerstvá FOTKA čeká prvních pár minut jen na nejlepší čtení (Gemini
//    s fotkou). Slabší čtení (menší modely, čtení z přepisu) plete řádky —
//    17. 11. 2026 z lístku udělalo „Brobál – Kuba" a „x201 p" — proto přijde
//    na řadu, až když Gemini nepřečte ani napotřetí. „Radši ať je to pomalé,
//    ale správné." Ručně („Znovu parsovat") se čte hned vším.
//  • Jeden běh funkce má jistých 75 s (cas-cteni.ts) — čtení dostane jen
//    tolik, kolik z běhu zbývá, a na co čas nezbyl, vrátí se do fronty.
//  • Zpráva, kterou si běh vzal ke čtení, dostane značku s časem převzetí.
//    Když běh skončí dřív, než ji dočte (pád, limit serveru), zůstala by
//    navždy „ve zpracování" — a taková zpráva není v seznamu ke kontrole
//    vůbec vidět. Podle značky se po pěti minutách vrátí do fronty.

import { STROP_CTENI_MS } from "./cas-cteni.ts";

/** Poznámka u zprávy, která čeká na další pokus čtení (za ní je čas pokusu). */
export const POZNAMKA_CEKA = "AI je teď přetížená — zkusí se znovu automaticky za pár minut.";

/** Nejkratší odstup mezi dvěma pokusy o tutéž zprávu (cron chodí po 3 min). */
export const ODSTUP_POKUSU_MS = 100_000;
/** Jak dlouho od příchodu zprávy se čtení samo opakuje. */
export const OPAKOVAT_PO_DOBU_MS = 60 * 60_000;
/** Jak dlouho od příchodu čeká fotka jen na nejlepší čtení. */
export const CEKANI_NA_NEJLEPSI_CTENI_MS = 6 * 60_000;
/** Značka u zprávy, kterou si běh vzal ke čtení (za ní je čas převzetí). */
export const ZNACKA_CTE_SE = "Čte se (od ";
/** Po téhle době ve zpracování je jisté, že běh skončil (server ho ukončí nejpozději ve 150 s). */
export const UVIZLA_PO_MS = 5 * 60_000;

/** Celý běh whatsapp-auto-parse — pod jistými 75 s s rezervou. */
export const STROP_BEHU_MS = 66_000;
/** Start čtecí funkce, síť a zápis výsledku kolem jednoho čtení. */
export const REZIE_CTENI_MS = 7_000;
/** Méně času nemá smysl čtení dávat (fotku čte Gemini 30–55 s). */
export const MIN_CAS_TEXT_MS = 12_000;
export const MIN_CAS_FOTKA_MS = 45_000;

/** Upozornění u fotky, kterou nepřečetl Gemini, ale slabší čtení. */
export const UPOZORNENI_ZALOZNI_CTENI =
  "Fotku četla záložní AI (Gemini byl přetížený) — zkontroluj každý řádek proti fotce, nebo dej později „Znovu parsovat“.";

/** Značka pro zprávu převzatou ke čtení v čase `ted`. */
export function znackaCteSe(ted: number): string {
  return `${ZNACKA_CTE_SE}${new Date(ted).toISOString()})`;
}

/** Je to značka „čte se"? (Není to chyba — appka ji neukazuje.) */
export function jeZnackaCteSe(errorMessage: string | null | undefined): boolean {
  return String(errorMessage ?? "").startsWith(ZNACKA_CTE_SE);
}

/**
 * Zůstala zpráva viset ve zpracování? Jen podle značky s časem převzetí —
 * zpráva bez značky (uvízlá z doby před 17. 11. 2026) se nechává být,
 * stará objednávka nemá po měsících vyskočit jako nová.
 */
export function jeUvizla(errorMessage: string | null | undefined, ted: number): boolean {
  if (!jeZnackaCteSe(errorMessage)) return false;
  const cas = Date.parse(String(errorMessage).slice(ZNACKA_CTE_SE.length).replace(/\)\s*$/, ""));
  return Number.isFinite(cas) && ted - cas >= UVIZLA_PO_MS;
}

/** Poznámka pro zprávu, která čeká na další pokus; `ted` = čas tohohle pokusu. */
export function poznamkaCeka(ted: number): string {
  return `${POZNAMKA_CEKA} (pokus ${new Date(ted).toISOString()})`;
}

/** Čeká zpráva na další pokus čtení? (Podle poznámky — i té starší, bez času.) */
export function cekaNaDalsiPokus(errorMessage: string | null | undefined): boolean {
  return String(errorMessage ?? "").startsWith(POZNAMKA_CEKA);
}

/** Čas posledního pokusu z poznámky; null, když v ní není (starší poznámka) nebo to není poznámka o čekání. */
export function casPoslednihoPokusu(errorMessage: string | null | undefined): number | null {
  if (!cekaNaDalsiPokus(errorMessage)) return null;
  const m = String(errorMessage).match(/\(pokus (\d{4}-\d{2}-\d{2}T[\d:.]+Z)\)/);
  const cas = m ? Date.parse(m[1]) : Number.NaN;
  return Number.isFinite(cas) ? cas : null;
}

/**
 * Smí se čekající zpráva teď vzít ke čtení? Zpráva bez poznámky vždy; zpráva
 * čekající na další pokus až po odstupu (poznámka bez času = hned, je stará).
 */
export function jeNaRade(errorMessage: string | null | undefined, ted: number): boolean {
  if (!cekaNaDalsiPokus(errorMessage)) return true;
  const posledni = casPoslednihoPokusu(errorMessage);
  return posledni === null || ted - posledni >= ODSTUP_POKUSU_MS;
}

/**
 * Pořadí zpráv v jednom běhu: napřed texty (jsou za pár vteřin), pak fotky —
 * obojí od nejstarší. Fotka umí sníst celý běh; kdyby šla první, texty za ní
 * by čekaly na další běh při každém jejím opakování.
 */
export function poradiZpracovani<T extends { media_url?: string | null; created_at: string }>(zpravy: T[]): T[] {
  // Podle času, ne podle textu: databáze vrací čas s různě dlouhými zlomky
  // vteřiny („…41.316205+00:00" i „…50.2+00:00"), ty se jako text řadí špatně.
  const cas = (z: T) => { const t = Date.parse(z.created_at); return Number.isFinite(t) ? t : 0; };
  const podleCasu = (a: T, b: T) => cas(a) - cas(b);
  return [
    ...zpravy.filter((z) => !z.media_url).sort(podleCasu),
    ...zpravy.filter((z) => !!z.media_url).sort(podleCasu),
  ];
}

/**
 * Kolik ms smí dostat čtení další zprávy, když běh trvá `ubehloMs`; null =
 * už se nevejde (zpráva se vrátí do fronty a přečte ji další běh).
 */
export function casProCteni(o: { ubehloMs: number; fotka: boolean }): number | null {
  const cas = Math.min(STROP_CTENI_MS, STROP_BEHU_MS - o.ubehloMs - REZIE_CTENI_MS);
  return cas >= (o.fotka ? MIN_CAS_FOTKA_MS : MIN_CAS_TEXT_MS) ? cas : null;
}

/** Čerstvá fotka čeká jen na nejlepší čtení; starší se čte vším, co je. */
export function rezimCteniFotky(stariMs: number): "nejlepsi" | "vse" {
  return stariMs < CEKANI_NA_NEJLEPSI_CTENI_MS ? "nejlepsi" : "vse";
}

/** Kolikáté kolo čtení to zhruba je (cron chodí po 3 min) — střídá náhradní modely. */
export function koloCteni(stariMs: number): number {
  return Math.max(0, Math.floor(stariMs / 180_000));
}

/**
 * Je to chyba, která za pár minut nejspíš přejde? `status` = HTTP kód čtecí
 * funkce, null = volání vůbec neodpovědělo (síť, čas vypršel).
 *  5xx — AI neodpověděla (502), server čtení ukončil (546), výpadek;
 *  429 — moc požadavků najednou; 408 — čas vypršel.
 */
export function jeDocasnaChyba(status: number | null): boolean {
  return status === null || status >= 500 || status === 429 || status === 408;
}

/** Co se zprávou po neúspěšném čtení: čekat na další pokus, nebo chyba. */
export function poChybeCteni(o: {
  status: number | null;
  /** Text chyby pro případ, že se už nečeká. */
  chyba: string;
  stariMs: number;
  ted: number;
}): { status: "pending" | "error"; error_message: string } {
  if (!jeDocasnaChyba(o.status)) return { status: "error", error_message: o.chyba || "Čtení se nepovedlo." };
  if (o.stariMs < OPAKOVAT_PO_DOBU_MS) return { status: "pending", error_message: poznamkaCeka(o.ted) };
  return {
    status: "error",
    error_message: `AI je přetížená a zprávu se nepodařilo přečíst ani po opakování${o.status ? ` (kód ${o.status})` : ""}. Zkus později „Znovu parsovat“.`,
  };
}
