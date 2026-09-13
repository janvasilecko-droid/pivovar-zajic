// 🧾 Typy řádků databáze — vygenerované ze skutečného schématu.
//
// Appka si typy tabulek dosud psala ručně (lib/supabase.ts) nebo vůbec
// (`any`). Ručně psaný typ se od databáze rozejde a nikdo si toho nevšimne:
// přesně tak se roky neukládal Beer.short_name, protože komentář tvrdil, že
// sloupec v databázi možná není.
//
// database.types.ts NEUPRAVOVAT RUČNĚ — přegeneruje se příkazem
// `npm run typy-db` (potřebuje SUPABASE_ACCESS_TOKEN v .env). Odráží stav
// PRODUKČNÍ databáze, takže tabulky z ještě nespuštěných migrací v něm
// nejsou; klient Supabase proto zatím typovaný není (nové obrazovky by
// neprošly kontrolou typů, dokud migrace neběží). Používají se jen typy
// řádků tam, kde byl `any`.
import type { Database } from './database.types';

export type NazevTabulky = keyof Database['public']['Tables'];

/** Řádek tabulky tak, jak ho vrací `select('*')`. */
export type Radek<T extends NazevTabulky> = Database['public']['Tables'][T]['Row'];
