// 🛢️ Řádky přehledu tanků na ploše (components/PrehledTankuPlocha.tsx).
// Vytažené z HomeScreen.tsx, ať jde otestovat, co se o tanku ukáže —
// zvlášť od 18. 11. 2026 i jeho fáze po zavření (lib/fazeTanku.ts).
import { fazeTanku, posledniSanitacePodleTanku, type FazeTanku, type ZapisSanitace } from './fazeTanku';
import { kapacitaTanku } from './tankPlnost';

export type RadekTankuNaPlose = {
  id: string; label: string; pivo: string; barva: string | null;
  litry: number; vystav: number; staci: boolean; prazdny: boolean; faze: FazeTanku | null;
};

type TankZDb = {
  id?: string | null; label?: string | null; current_beer_id?: string | null; current_volume_l?: number | null;
  initial_volume_l?: number | null; status?: string | null; kegging_active?: boolean | null; kegging_ended_at?: string | null;
};
type PivoZDb = { id: string; name?: string | null; beer_color?: string | null };

/** Barvy piv podle id i jména (malými písmeny) — řádky objednávek nesou jméno piva. */
export function barvyPiv(piva: PivoZDb[]): Map<string, string | null> {
  const barvy = new Map<string, string | null>();
  for (const b of piva) {
    barvy.set(b.id, b.beer_color ?? null);
    if (b.name) barvy.set(String(b.name).trim().toLowerCase(), b.beer_color ?? null);
  }
  return barvy;
}

/**
 * Jen ležácké tanky (Spilka na ploše nepatří — 28. 9. 2026: „1–8 stačí"),
 * seřazené podle čísla. Tank v sanitaci (uzavřený, po oplachu, po louhu)
 * a vysanitovaný prázdný tank nesou svou fázi.
 */
export function sestavTankyNaPlochu(vstup: { tanky: TankZDb[]; piva: PivoZDb[]; zapisySanitace: ZapisSanitace[] }): RadekTankuNaPlose[] {
  const jmenoPiva = new Map(vstup.piva.map((b) => [b.id, b.name ?? '']));
  const barvy = barvyPiv(vstup.piva);
  const posledniSanitace = posledniSanitacePodleTanku(vstup.zapisySanitace);
  return vstup.tanky
    .filter((t) => !String(t.label ?? '').toLowerCase().includes('spilka'))
    .map((t) => {
      const litry = Math.round(Number(t.current_volume_l || 0));
      const beerId = t.current_beer_id ?? '';
      return {
        id: String(t.id ?? ''),
        label: String(t.label ?? '?'),
        pivo: jmenoPiva.get(beerId) ?? '',
        barva: barvy.get(beerId) ?? null,
        litry,
        // Pruh = kolik zbývá z VÝSTAVU (počáteční objem = 100 %), ne z celého
        // tanku (30. 10. 2026, viz Cellar.tsx). Bez zapsaného výstavu z nominálu nádoby.
        vystav: Number(t.initial_volume_l) > 0 ? Number(t.initial_volume_l) : kapacitaTanku(String(t.label ?? '')),
        // Tank, ze kterého se právě stáčí — označí se.
        staci: !!t.kegging_active,
        faze: fazeTanku(t, posledniSanitace.get(String(t.id))),
        prazdny: t.status === 'empty' || litry <= 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'cs', { numeric: true }));
}
