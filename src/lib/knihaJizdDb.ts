// 🚐 Kniha jízd — sahání na databázi (uzavřené měsíce a dávkové ukládání jízd).
// Čisté výpočty jsou v knihaJizdRetez.ts a knihaJizdUzaverka.ts; tady jsou jen
// volání funkcí z migrace 20261231390000_kniha_jizd_uzaverka_a_druhe_auto.sql.
//
// Appka musí fungovat PŘED i PO té migraci: bez ní tabulka logbook_closures
// ani funkce v databázi nejsou a nové možnosti (úprava jízdy, uzávěrka měsíce)
// se prostě nenabídnou — viz `dostupne`.
import { supabase } from './supabase';
import type { RadekUzaverky, RezimDorovnani } from './knihaJizdUzaverka';

/** Řádek z tabulky logbook_closures. */
export type UzavrenyMesic = {
  id: string;
  vehicle_name: string;
  month: string; // RRRR-MM
  km_start: number;
  km_end: number;
  km_trasa: number;
  km_dorovnani: number;
  rezim: RezimDorovnani;
  pocet_jizd: number;
  closed_at: string;
  closed_by: string | null;
};

export type StavUzavrenychMesicu = {
  /** Migrace je v databázi (tabulka existuje). Bez ní se nabízí jen starý způsob zápisu. */
  dostupne: boolean;
  mesice: UzavrenyMesic[];
  /** Načtení se nepovedlo z jiného důvodu než „chybí migrace“ (třeba spadlo spojení). */
  chyba?: string;
};

/** Kdo smí uzavřený měsíc znovu otevřít — stejný okruh jako `is_admin_tier_role()` v databázi. */
export const ROLE_OTEVIRAJI_MESIC = ['admin', 'sef', 'sladek', 'boss', 'manager'];

export function smiOtevritMesic(role: string | null | undefined): boolean {
  return ROLE_OTEVIRAJI_MESIC.includes((role ?? '').toLowerCase().trim());
}

type ChybaDb = { message?: string; code?: string; details?: string } | null | undefined;

/** Hlásí chyba, že v databázi chybí tabulka nebo funkce z migrace? */
export function chybiMigrace(e: ChybaDb): boolean {
  if (!e) return false;
  const text = `${e.message ?? ''} ${e.details ?? ''}`;
  return (
    e.code === 'PGRST202' || // funkce v schema cache není
    e.code === 'PGRST205' || // tabulka v schema cache není
    e.code === '42883' || // undefined_function
    e.code === '42P01' || // undefined_table
    /could not find the (function|table)/i.test(text) ||
    (/does not exist/i.test(text) && /(logbook_closures|kniha_jizd_)/.test(text))
  );
}

const CHYBI_MIGRACE_TEXT =
  'Databáze ještě nemá novou verzi Knihy jízd. Spusť migraci: Systém → Databázové migrace.';

function srozumitelnaChyba(e: ChybaDb): string {
  if (chybiMigrace(e)) return CHYBI_MIGRACE_TEXT;
  return e?.message || 'Neznámá chyba databáze.';
}

/**
 * Načte uzavřené měsíce. Bez migrace vrátí `dostupne: false` (a žádnou chybu).
 * Jiná chyba (spadlé spojení) migraci nevyvrací, proto se bere jako „dostupné“ —
 * nové možnosti by se kvůli výpadku neměly na chvíli schovat; zámek hlídá databáze.
 */
export async function nactiUzavreneMesice(): Promise<StavUzavrenychMesicu> {
  const { data, error } = await supabase.from('logbook_closures').select('*').order('month', { ascending: false });
  if (error) {
    return chybiMigrace(error)
      ? { dostupne: false, mesice: [] }
      : { dostupne: true, mesice: [], chyba: error.message };
  }
  const mesice = ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    vehicle_name: r.vehicle_name,
    month: r.month,
    km_start: Number(r.km_start) || 0,
    km_end: Number(r.km_end) || 0,
    km_trasa: Number(r.km_trasa) || 0,
    km_dorovnani: Number(r.km_dorovnani) || 0,
    rezim: r.rezim === 'umerne' ? ('umerne' as const) : ('rovnomerne' as const),
    pocet_jizd: Number(r.pocet_jizd) || 0,
    closed_at: r.closed_at,
    closed_by: r.closed_by ?? null,
  }));
  return { dostupne: true, mesice };
}

// ---------------------------------------------------------------------------
// Dávka změn jízd (jedna transakce)
// ---------------------------------------------------------------------------

/** Sloupce, které dávka smí měnit nebo vkládat (viz kniha_jizd_uloz_davku). */
export type SloupceJizdy = {
  entry_date: string;
  vehicle_id: string | null;
  vehicle_name: string;
  driver: string;
  route_from: string;
  route_to: string;
  purpose: string;
  km_start: number;
  km_end: number;
  km_driven: number;
  km_trasa: number | null;
  km_dorovnani: number;
  fuel_liters: number | null;
  note: string | null;
};

export type DavkaJizd = {
  /** id jízd ke smazání */
  smazat?: string[];
  /** změny: `id` + jen sloupce, které se mění */
  upravit?: ({ id: string } & Partial<SloupceJizdy>)[];
  /** nové jízdy (id si klient vymyslí sám, ať ho zná hned) */
  vlozit?: ({ id: string } & Partial<SloupceJizdy>)[];
};

export type VysledekDavky =
  | { ok: true; smazano: number; upraveno: number; vlozeno: number }
  | { ok: false; chyba: string; chybiMigrace: boolean };

/**
 * Uloží dávku v jedné transakci: buď projde celá, nebo nic. Po úspěchu volající
 * načte jízdy znovu (nebo si změny promítne sám).
 */
export async function ulozDavku(davka: DavkaJizd): Promise<VysledekDavky> {
  const smazat = davka.smazat ?? [];
  const upravit = davka.upravit ?? [];
  const vlozit = davka.vlozit ?? [];
  if (smazat.length + upravit.length + vlozit.length === 0) return { ok: true, smazano: 0, upraveno: 0, vlozeno: 0 };

  const { data, error } = await supabase.rpc('kniha_jizd_uloz_davku', {
    p_smazat: smazat,
    p_upravit: upravit,
    p_vlozit: vlozit,
  });
  if (error) return { ok: false, chyba: srozumitelnaChyba(error), chybiMigrace: chybiMigrace(error) };
  const v = (data ?? {}) as { smazano?: number; upraveno?: number; vlozeno?: number };
  return { ok: true, smazano: v.smazano ?? 0, upraveno: v.upraveno ?? 0, vlozeno: v.vlozeno ?? 0 };
}

/**
 * Zápis dávky PŘED spuštěním migrace, kdy v databázi ještě není funkce
 * `kniha_jizd_uloz_davku` ani sloupce `km_trasa` / `km_dorovnani`: vložit nové
 * jízdy a smazat staré obyčejnými dotazy, tak jako dřív. Úpravy (posun tachometru
 * pozdějších jízd, oprava záznamu) tu nejdou — potřebují atomický zápis z migrace
 * a vrátí se s odkazem na její spuštění.
 *
 * Nejdřív se vkládá, až potom maže: kdyby se vložení nepovedlo, staré jízdy
 * zůstanou na místě (dřív se mazalo první a při chybě vložení záznamy zmizely).
 */
export async function ulozDavkuStarymZpusobem(davka: DavkaJizd): Promise<VysledekDavky> {
  const smazat = davka.smazat ?? [];
  const vlozit = davka.vlozit ?? [];
  if ((davka.upravit ?? []).length > 0) {
    return { ok: false, chyba: CHYBI_MIGRACE_TEXT, chybiMigrace: true };
  }
  if (smazat.length + vlozit.length === 0) return { ok: true, smazano: 0, upraveno: 0, vlozeno: 0 };

  if (vlozit.length > 0) {
    // Starý sloupcový tvar tabulky: nové sloupce by dotaz shodily.
    const radky = vlozit.map((r) => {
      const { km_trasa: _trasa, km_dorovnani: _dorovnani, ...stary } = r;
      return stary;
    });
    const { error } = await supabase.from('logbook_entries').insert(radky);
    if (error) return { ok: false, chyba: error.message, chybiMigrace: false };
  }

  let smazano = 0;
  if (smazat.length > 0) {
    const { data, error } = await supabase.from('logbook_entries').delete().in('id', smazat).select('id');
    if (error) return { ok: false, chyba: error.message, chybiMigrace: false };
    smazano = (data as unknown[] | null)?.length ?? 0;
    // Databáze řádky, na které uživatel nemá právo, tiše přeskočí — bez kontroly počtu by
    // obrazovka tvrdila, že je smazáno, a po obnovení by se vrátily.
    if (smazano < smazat.length) {
      return {
        ok: false,
        chyba: `Smazalo se jen ${smazano} z ${smazat.length} záznamů — zkontroluj, jestli máš oprávnění upravovat Knihu jízd.`,
        chybiMigrace: false,
      };
    }
  }
  return { ok: true, smazano, upraveno: 0, vlozeno: vlozit.length };
}

// ---------------------------------------------------------------------------
// Uzavření a otevření měsíce
// ---------------------------------------------------------------------------

export type VstupUzavreni = {
  vozidlo: string;
  mesic: string; // RRRR-MM
  tachometrZacatek: number;
  tachometrKonec: number;
  rezim: RezimDorovnani;
  radky: RadekUzaverky[];
};

export type VysledekOperace = { ok: true; pocet: number } | { ok: false; chyba: string };

export async function uzavritMesic(v: VstupUzavreni): Promise<VysledekOperace> {
  const { data, error } = await supabase.rpc('kniha_jizd_uzavrit_mesic', {
    p_vozidlo: v.vozidlo,
    p_mesic: v.mesic,
    p_tachometr_zacatek: v.tachometrZacatek,
    p_tachometr_konec: v.tachometrKonec,
    p_rezim: v.rezim,
    p_radky: v.radky,
  });
  if (error) return { ok: false, chyba: srozumitelnaChyba(error) };
  return { ok: true, pocet: Number(data) || 0 };
}

export async function otevritMesic(vozidlo: string, mesic: string): Promise<VysledekOperace> {
  const { data, error } = await supabase.rpc('kniha_jizd_otevrit_mesic', { p_vozidlo: vozidlo, p_mesic: mesic });
  if (error) return { ok: false, chyba: srozumitelnaChyba(error) };
  return { ok: true, pocet: Number(data) || 0 };
}
