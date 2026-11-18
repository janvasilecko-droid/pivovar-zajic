// ⏱️ Úpravy nastavení rychlých odpočtů (okno „Rychlé odpočty").
// ---------------------------------------------------------------------------
// Čisté funkce, které vracejí NOVÉ nastavení — nic nemění na místě. Odděleno
// od lib/rychleOdpocty.ts, protože ten potřebuje lišta na ploše hned po startu,
// kdežto tohle jen okno úprav, které se načítá až po klepnutí
// (start aplikace má strop na velikost — scripts/zkontroluj-velikost.mjs).
import { CO2_ID } from './co2Foukani';
import {
  HOD, MAX_POPIS, MAX_VLASTNICH, MIN, PREDPONA_VLASTNI, RYCHLE_ODPOCTY, SEK,
  delkaJeVRozsahu, nahodnyKus,
  type NastaveniRychlychOdpoctu, type VlastniRychlyOdpocet,
} from './rychleOdpocty';

export type VysledekUpravy = { nastaveni: NastaveniRychlychOdpoctu; chyba: string | null };

const MSG_DELKA = 'Čas musí být od 10 sekund do 24 hodin.';

/** Přidá vlastní odpočet do lišty. */
export function pridejVlastni(
  nastaveni: NastaveniRychlychOdpoctu,
  popis: string,
  delkaMs: number,
  ted: number = Date.now(),
): VysledekUpravy {
  const nazev = popis.replace(/\s+/g, ' ').trim();
  if (!nazev) return { nastaveni, chyba: 'Napiš název odpočtu.' };
  if (nazev.length > MAX_POPIS) return { nastaveni, chyba: `Název je moc dlouhý (nejvíc ${MAX_POPIS} znaků).` };
  if (!delkaJeVRozsahu(delkaMs)) return { nastaveni, chyba: MSG_DELKA };
  if (nastaveni.vlastni.length >= MAX_VLASTNICH) {
    return { nastaveni, chyba: `Vlastních odpočtů může být nejvíc ${MAX_VLASTNICH} — jeden napřed smaž.` };
  }
  const novy: VlastniRychlyOdpocet = {
    id: `${PREDPONA_VLASTNI}${ted.toString(36)}-${nahodnyKus()}`,
    popis: nazev,
    delkaMs: Math.round(delkaMs / SEK) * SEK,
  };
  return { nastaveni: { ...nastaveni, vlastni: [...nastaveni.vlastni, novy] }, chyba: null };
}

/** Smaže vlastní odpočet (výchozí se mazat nedají, jen schovat). */
export function smazVlastni(nastaveni: NastaveniRychlychOdpoctu, id: string): NastaveniRychlychOdpoctu {
  if (!nastaveni.vlastni.some((v) => v.id === id)) return nastaveni;
  return {
    ...nastaveni,
    vlastni: nastaveni.vlastni.filter((v) => v.id !== id),
    skryte: nastaveni.skryte.filter((s) => s !== id),
  };
}

/** Ukáže / schová odpočet v liště. */
export function nastavViditelnost(nastaveni: NastaveniRychlychOdpoctu, id: string, viditelny: boolean): NastaveniRychlychOdpoctu {
  const bez = nastaveni.skryte.filter((s) => s !== id);
  return { ...nastaveni, skryte: viditelny ? bez : [...bez, id] };
}

/** Přepíše délku odpočtu (výchozího, nebo vlastního). Foukání CO2 má délku pevnou. */
export function nastavDelku(nastaveni: NastaveniRychlychOdpoctu, id: string, delkaMs: number): VysledekUpravy {
  if (!delkaJeVRozsahu(delkaMs)) return { nastaveni, chyba: MSG_DELKA };
  const ms = Math.round(delkaMs / SEK) * SEK;
  const vlastni = nastaveni.vlastni.find((v) => v.id === id);
  if (vlastni) {
    return {
      nastaveni: { ...nastaveni, vlastni: nastaveni.vlastni.map((v) => (v.id === id ? { ...v, delkaMs: ms } : v)) },
      chyba: null,
    };
  }
  const vychozi = RYCHLE_ODPOCTY.find((r) => r.id === id);
  if (!vychozi) return { nastaveni, chyba: null };
  if (id === CO2_ID) return { nastaveni, chyba: 'Délka foukání CO2 je pevná (stejná jako dlaždice CO2).' };
  const delky = { ...nastaveni.delky };
  // Původní délka se neukládá jako „přepsání" — kdyby se výchozí délka jednou změnila, zůstal by tu starý údaj.
  if (ms === vychozi.delkaMs) delete delky[id];
  else delky[id] = ms;
  return { nastaveni: { ...nastaveni, delky }, chyba: null };
}

/** Přejmenuje vlastní odpočet. */
export function prejmenujVlastni(nastaveni: NastaveniRychlychOdpoctu, id: string, popis: string): VysledekUpravy {
  const nazev = popis.replace(/\s+/g, ' ').trim();
  if (!nazev) return { nastaveni, chyba: 'Napiš název odpočtu.' };
  if (nazev.length > MAX_POPIS) return { nastaveni, chyba: `Název je moc dlouhý (nejvíc ${MAX_POPIS} znaků).` };
  if (!nastaveni.vlastni.some((v) => v.id === id)) return { nastaveni, chyba: null };
  return {
    nastaveni: { ...nastaveni, vlastni: nastaveni.vlastni.map((v) => (v.id === id ? { ...v, popis: nazev } : v)) },
    chyba: null,
  };
}

/** Vrátí výchozí odpočty do původního stavu (všechny v liště, původní délky). Vlastní zůstanou. */
export function vratVychozi(nastaveni: NastaveniRychlychOdpoctu): NastaveniRychlychOdpoctu {
  const vlastniIds = new Set(nastaveni.vlastni.map((v) => v.id));
  return {
    skryte: nastaveni.skryte.filter((s) => vlastniIds.has(s)),
    delky: {},
    vlastni: nastaveni.vlastni,
  };
}

/** Je výchozí část nastavení (schování, délky) jiná než původní? */
export function maUpravenaVychozi(nastaveni: NastaveniRychlychOdpoctu): boolean {
  const vlastniIds = new Set(nastaveni.vlastni.map((v) => v.id));
  return Object.keys(nastaveni.delky).length > 0 || nastaveni.skryte.some((s) => !vlastniIds.has(s));
}

/**
 * Přečte čas, jak ho člověk napíše: „8" = 8 minut, „7,5" = 7 min 30 s,
 * „30 s", „2 h", „1,5h". `null` = nedá se přečíst.
 */
export function parsujDelku(text: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(h|hod|hodin[ay]?|m|min|minut[ay]?|s|sek|sekund[ay]?)?\s*$/i.exec(text);
  if (!m) return null;
  const cislo = Number(m[1].replace(',', '.'));
  const jednotka = (m[2] ?? 'min').toLowerCase();
  const nasobek = jednotka.startsWith('h') ? HOD : jednotka.startsWith('s') ? SEK : MIN;
  const ms = Math.round((cislo * nasobek) / SEK) * SEK;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Délka do pole „minuty" — „8", „7,5", „0,5". Sekundy, které nejsou celá desetina minuty, se zaokrouhlí. */
export function delkaDoPole(ms: number): string {
  const minuty = ms / MIN;
  return String(Math.round(minuty * 100) / 100).replace('.', ',');
}
