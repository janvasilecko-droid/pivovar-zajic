// 🧼 V jaké fázi je tank bez piva — uzavřený, po oplachu, po louhu, vysanitovaný.
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „na hoře, když je uzavřený tank na domovské stránce,
// ať se ukáže, že je tank uzavřený, prázdný, po oplachu, vysanitovaný."
//
// Tank po zavření prochází postupem, který Sklep zná (Cellar.tsx):
//   Zavřít tank  → status `sanitizing`  — „uzavřený", MUSÍ SE OPLÁCHNOUT,
//   Oplach       → status `rinsing`     — „po oplachu", další krok louh,
//   Louh         → status `cleaning`    — „po louhu", další krok kyselina,
//   Kyselina     → status `empty`       — prázdný a vysanitovaný.
// Poslední krok se od tanku, který je prázdný odjakživa, ve stavu nepozná
// (oba jsou `empty`), proto se „vysanitovaný" čte ze Sanitačního deníku:
// poslední zápis tanku je sanitace (kyselina, Persteril, kombinovaná) a je
// novější než konec stáčení. Ostatní prázdné tanky zůstávají prostě „prázdné".

export type FazeTanku = 'uzavreny' | 'po_oplachu' | 'po_louhu' | 'vysanitovany';

export const POPIS_FAZE: Record<FazeTanku, { text: string; napoveda: string }> = {
  uzavreny: { text: 'uzavřený', napoveda: 'Tank je uzavřený — teď se musí oplachovat' },
  po_oplachu: { text: 'po oplachu', napoveda: 'Po oplachu — další krok louh' },
  po_louhu: { text: 'po louhu', napoveda: 'Po louhu — další krok kyselina dusičná' },
  vysanitovany: { text: 'vysanitovaný', napoveda: 'Vysanitovaný a prázdný — připravený na další várku' },
};

/** Sanitace, po které je tank hotový (poslední krok postupu). */
const DOKONCUJICI_SANITACE = new Set(['kyselina_dusicna', 'persteril', 'kombinovana']);

export type ZapisSanitace = { tank_id?: string | null; method?: string | null; created_at?: string | null };

/** Nejnovější zápis sanitace u každého tanku (podle `created_at`). */
export function posledniSanitacePodleTanku(zapisy: ReadonlyArray<ZapisSanitace>): Map<string, { method: string; created_at: string }> {
  const out = new Map<string, { method: string; created_at: string }>();
  for (const z of zapisy) {
    if (!z.tank_id || !z.method || !z.created_at) continue;
    const dosud = out.get(z.tank_id);
    if (!dosud || Date.parse(z.created_at) > Date.parse(dosud.created_at)) {
      out.set(z.tank_id, { method: z.method, created_at: z.created_at });
    }
  }
  return out;
}

/**
 * Fáze tanku bez piva, nebo null (tank s pivem, nebo prostě prázdný).
 * `posledniSanitace` je nejnovější zápis sanitace TOHOHLE tanku.
 */
export function fazeTanku(
  tank: { status?: string | null; kegging_ended_at?: string | null },
  posledniSanitace?: { method: string; created_at: string } | null,
): FazeTanku | null {
  switch (tank.status) {
    case 'sanitizing': return 'uzavreny';
    case 'rinsing': return 'po_oplachu';
    case 'cleaning': return 'po_louhu';
    case 'empty': {
      if (!posledniSanitace || !DOKONCUJICI_SANITACE.has(posledniSanitace.method)) return null;
      const konec = tank.kegging_ended_at ? Date.parse(tank.kegging_ended_at) : Number.NaN;
      const kdy = Date.parse(posledniSanitace.created_at);
      // Sanitace starší než poslední stáčení patří dřívější várce.
      if (Number.isFinite(konec) && Number.isFinite(kdy) && kdy < konec) return null;
      return 'vysanitovany';
    }
    default: return null;
  }
}
