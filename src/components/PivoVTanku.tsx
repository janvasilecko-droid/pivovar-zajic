// 🍺 Pivo v tanku — nejvýraznější údaj na kartě tanku ve Sklepu.
//
// Zadání 23. 11. 2026: „v přehledu sklep jak je tank 8, tank 7 atd… udělej ať je
// výrazněji vidět, co tam je za pivo, moc to splývá s tím textem."
// Do té doby stálo jméno piva obyčejným písmem (`text-sm font-semibold`) mezi
// popisky „Počáteční objem" a „Zbývá" — stejně velké a skoro stejně barevné jako
// všechno kolem. Teď je to plaketa přes šířku karty v barvě piva (jako dlaždice
// piv jinde v appce) s velkým názvem; zbytek řádků pod ní je jen doplněk.
import type { CSSProperties } from 'react';
import { beerBg, beerInk, beerText } from '../lib/supabase';

type PivoSBarvou = { beer_color?: string | null } | null | undefined;

export function PivoVTanku({ jmeno, pivo, className = '' }: {
  /** Jméno piva zapsané na tanku (`current_beer_name`); prázdné = tank je prázdný. */
  jmeno: string | null | undefined;
  /** Pivo z katalogu — dává barvu plakety. Bez něj (nebo bez barvy) je plaketa neutrální. */
  pivo?: PivoSBarvou;
  className?: string;
}) {
  const nazev = (jmeno ?? '').trim();
  if (!nazev) {
    return (
      <div
        data-testid="pivo-v-tanku-prazdno"
        className={`rounded-lg border-2 border-dashed border-primary-200 px-3 py-2 text-sm font-bold text-primary-400 ${className}`}
      >
        — prázdno —
      </div>
    );
  }
  // Pivo bez uložené barvy: barva z palety (v tmavém režimu se obrací s ní), ne
  // barva piva — ta se s režimem nemění a „výchozí" šedá by v tmavém režimu
  // dostala tmavý text na tmavém podkladu.
  if (!pivo?.beer_color) {
    return (
      <div
        data-testid="pivo-v-tanku"
        className={`rounded-lg border-2 border-primary-200 bg-primary-50 px-3 py-2 text-primary-900 ${className}`}
      >
        <div className="font-display font-black text-xl leading-tight break-words">{nazev}</div>
      </div>
    );
  }
  return (
    <div
      data-testid="pivo-v-tanku"
      className={`plocha-z-dat rounded-lg border-2 border-black/10 px-3 py-2 shadow-2xs ${beerText(pivo)} ${className}`}
      style={{ backgroundColor: beerBg(pivo), ['--ink-plochy' as string]: beerInk(pivo) } as CSSProperties}
    >
      <div className="font-display font-black text-xl leading-tight break-words">{nazev}</div>
    </div>
  );
}
