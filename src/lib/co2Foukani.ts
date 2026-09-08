/**
 * 💨 Foukání CO2 — dlaždice na ploše, která hlídá dvě minuty.
 *
 * Sud se profukuje oxidem uhličitým a nechat to běžet dýl než je potřeba
 * znamená vyfoukané CO2 a načatý sud pod tlakem. Dvě minuty se přitom
 * odměřují od oka, protože při tom má člověk obě ruce plné.
 *
 * Dlaždice je proto přepínač: klepnutí spustí odpočet (dlaždice zčervená
 * a odpočítává), druhé klepnutí ho zastaví („už se přestalo foukat").
 * Po dvou minutách se ozve stejný alarm jako u Časovače — odpočet se totiž
 * ukládá mezi běžné odpočty (lib/stopwatchTimers.ts), takže o něj rovnou
 * zavadí i hlídač upozornění (KegTimerNotificationManager) a pásek
 * upozornění na ploše. Vlastní budík by byl druhá kopie téhož.
 */
import { countdownRemainingMs, type CountdownTimer } from './stopwatchTimers';

/** Pevné id — na ploše smí běžet jen jedno foukání, ne pět vedle sebe. */
export const CO2_ID = 'co2-foukani';
export const CO2_POPIS = 'Foukání CO2';
export const CO2_DELKA_MS = 2 * 60 * 1000;

export function najdiCo2(list: CountdownTimer[]): CountdownTimer | null {
  return list.find((t) => t.id === CO2_ID) ?? null;
}

/** Běží foukání? (Doběhnutý odpočet se pořád počítá za běžící — čeká na odklepnutí.) */
export function co2Bezi(list: CountdownTimer[]): boolean {
  return najdiCo2(list)?.targetAt != null;
}

/** Zbývající čas v ms; když nic neběží, plné dvě minuty. */
export function co2Zbyva(list: CountdownTimer[]): number {
  const t = najdiCo2(list);
  return t ? countdownRemainingMs(t) : CO2_DELKA_MS;
}

/** Spustí (nebo restartuje) dvouminutový odpočet foukání. */
export function spustCo2(list: CountdownTimer[], ted: number = Date.now()): CountdownTimer[] {
  const novy: CountdownTimer = {
    id: CO2_ID,
    label: CO2_POPIS,
    durationMs: CO2_DELKA_MS,
    initialDurationMs: CO2_DELKA_MS,
    targetAt: ted + CO2_DELKA_MS,
    notifiedAt: null,
  };
  const bez = list.filter((t) => t.id !== CO2_ID);
  return [...bez, novy];
}

/**
 * Zastaví foukání — odpočet se z plochy rovnou odstraní.
 *
 * Schválně se nenechává „pozastavený": dlaždice má znamenat „teď se fouká,
 * nebo ne", a pozastavený odpočet visící na ploše by tvrdil něco mezi tím.
 */
export function zastavCo2(list: CountdownTimer[]): CountdownTimer[] {
  return list.filter((t) => t.id !== CO2_ID);
}

/** Klepnutí na dlaždici: běží → zastav, neběží → spusť. */
export function prepniCo2(list: CountdownTimer[], ted: number = Date.now()): CountdownTimer[] {
  return co2Bezi(list) ? zastavCo2(list) : spustCo2(list, ted);
}

/**
 * Zastaví JEDEN odpočet ze seznamu — podle toho, co to je.
 *
 * Foukání CO2 z plochy zmizí úplně (dlaždice znamená „teď se fouká, nebo
 * ne"; pozastavené foukání by tvrdilo něco mezi tím). Běžný odpočet se
 * jen zastaví a vrátí na původní čas, ať se dá spustit znovu — smazat
 * někomu odpočet, který si pojmenoval, by bylo o dost horší než ho zastavit.
 */
export function zastavOdpocetVSeznamu(list: CountdownTimer[], id: string): CountdownTimer[] {
  if (id === CO2_ID) return zastavCo2(list);
  return list.map((t) => (t.id === id ? { ...t, targetAt: null, durationMs: t.initialDurationMs || t.durationMs, notifiedAt: null } : t));
}
