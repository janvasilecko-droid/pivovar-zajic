// Atrapa databáze výčepů pro testy — stejně PŘÍSNÁ jako Postgres tam, kde se
// na tom modul výčepů už spálil:
//  • id musí být uuid („t1“ ze starých ukázkových výčepů databáze nepřijme),
//  • čas oplachu / louhování musí být platný timestamptz (český text
//    „5. 11. 2026 11:06“ databáze odmítla a výčepy se nikdy neuložily),
//  • rezervace musí mít existující výčep (cizí klíč) a rozumný rozsah dnů,
//  • jedna objednávka = nejvýš jedna rezervace (unikátní index na order_id).
//
// Používá se tak, že se jí podstrčí `supabase` v testu:
//   vi.mock('../lib/supabase', async () => {
//     const { supabaseAtrapa } = await import('../test/atrapaVycepyDb');
//     return { supabase: supabaseAtrapa, useRealtime: () => {} };
//   });
// Skutečná datová vrstva (lib/vycepyData.ts) se přitom nemokuje.

export const db = {
  vycepy: [] as any[],
  rezervace: [] as any[],
  /** Když je vyplněná, každý zápis selže s touto hláškou (např. chybějící právo). */
  chyba: null as string | null,
};

export function vycistiDb(): void {
  db.vycepy = [];
  db.rezervace = [];
  db.chyba = null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_CAS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function zkontrolujVycep(r: any): string | null {
  if (!UUID.test(r.id)) return `invalid input syntax for type uuid: "${r.id}"`;
  for (const k of ['posledni_oplach', 'posledni_sanitace_louhem']) {
    if (r[k] != null && !ISO_CAS.test(r[k])) return `invalid input syntax for type timestamp with time zone: "${r[k]}"`;
  }
  return null;
}

function zkontrolujRezervaci(r: any): string | null {
  if (!UUID.test(r.id)) return `invalid input syntax for type uuid: "${r.id}"`;
  if (!UUID.test(r.vycep_id) || !db.vycepy.some((v) => v.id === r.vycep_id)) {
    return 'insert or update on table "vycepy_rezervace" violates foreign key constraint';
  }
  if (r.order_id != null && !UUID.test(r.order_id)) return `invalid input syntax for type uuid: "${r.order_id}"`;
  if (r.datum_do < r.datum_od) return 'new row violates check constraint "vycepy_rezervace_rozsah"';
  if (r.order_id != null && db.rezervace.some((x) => x.order_id === r.order_id && x.id !== r.id)) {
    return 'duplicate key value violates unique constraint "vycepy_rezervace_order_unique_idx"';
  }
  return null;
}

function tabulka(nazev: 'vycepy' | 'vycepy_rezervace') {
  const radky = () => (nazev === 'vycepy' ? db.vycepy : db.rezervace);
  const nastav = (nove: any[]) => { if (nazev === 'vycepy') db.vycepy = nove; else db.rezervace = nove; };
  const zkontroluj = nazev === 'vycepy' ? zkontrolujVycep : zkontrolujRezervaci;
  return {
    select: (_sloupce?: string, opts?: { head?: boolean }) => {
      if (opts?.head) return Promise.resolve({ count: radky().length, error: null });
      const vysledek = async () => ({ data: radky().map((r) => ({ ...r })), error: null });
      return { order: () => Object.assign(vysledek(), { order: vysledek }) };
    },
    upsert: async (radek: any) => {
      if (db.chyba) return { error: { message: db.chyba } };
      const chyba = zkontroluj(radek);
      if (chyba) return { error: { message: chyba } };
      nastav([...radky().filter((r) => r.id !== radek.id), radek]);
      return { error: null };
    },
    insert: async (nove: any[]) => { nastav([...radky(), ...nove]); return { error: null }; },
    delete: () => ({
      eq: async (_sloupec: string, id: string) => {
        if (db.chyba) return { error: { message: db.chyba } };
        nastav(radky().filter((r) => r.id !== id));
        return { error: null };
      },
    }),
  };
}

export const supabaseAtrapa = {
  from: (nazev: string) => tabulka(nazev as 'vycepy' | 'vycepy_rezervace'),
};

// ── Řádky v tvaru, v jakém je drží databáze ────────────────────────────────

export const ID_A = '11111111-1111-4111-8111-111111111111';
export const ID_B = '22222222-2222-4222-8222-222222222222';

export const radekVycepu = (id: string, nazev: string, patch: Record<string, unknown> = {}) => ({
  id, nazev, typ: 'jednokohout', stav: 'clean', posledni_oplach: null, posledni_sanitace_louhem: null,
  kohouty_rozebrane: false, poznamka: null, aktivni: true, poradi: 0, ...patch,
});

export const radekRezervace = (id: string, vycep: string, od: string, doDne: string, patch: Record<string, unknown> = {}) => ({
  id, vycep_id: vycep, vycep_nazev: 'Výčep', datum_od: od, datum_do: doDne, odberatel: 'Hospoda Test',
  telefon: null, kauce_czk: null, vraceno: false, vraceno_at: null, poznamka: null, order_id: null, ...patch,
});
