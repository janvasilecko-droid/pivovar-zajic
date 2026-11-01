// 🛢️ Malé sudy — texty pro záložku (odkud je číslo prázdných). Zvlášť od
// lib/maleSudy.ts, ať se načtou až se záložkou, ne se startem appky.
import { ZKRATKY_DNU } from './tydenDnu';
import type { SouhrnMalychSudu } from './maleSudy';

/** „čt 29. 10." z YYYY-MM-DD (přes UTC, ať se den neposune). */
export function kratkyDen(iso: string | null | undefined): string {
  const d = new Date(`${(iso ?? '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return `${ZKRATKY_DNU[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/**
 * Odkud je číslo prázdných, když od zadání něco odjelo: „Naklikáno 8 (út
 * 27. 10.), od té doby odjelo 6: Maneo 6× (čt 29. 10.)". Bez odjetých null —
 * velké číslo je pak přesně to naklikané.
 */
export function popisOdvezenych(s: SouhrnMalychSudu, denZadani?: string | null): string | null {
  if (!s.odvezeno || s.odvezeno <= 0) return null;
  const MAX = 4;
  const objednavky = (s.odvezenoZ ?? []).map((r) => {
    const den = kratkyDen(r.den);
    return `${r.nazev?.trim() || 'objednávka'} ${r.kusu}×${den ? ` (${den})` : ''}`;
  });
  const dalsich = objednavky.length - MAX;
  const seznam = objednavky.slice(0, MAX).join(', ') + (dalsich > 0 ? ` a další ${dalsich}` : '');
  const kdy = kratkyDen(denZadani);
  return `Naklikáno ${s.zadano ?? s.mame + s.odvezeno}${kdy ? ` (${kdy})` : ''}, od té doby odjelo ${s.odvezeno}${seznam ? `: ${seznam}` : ''}.`;
}
