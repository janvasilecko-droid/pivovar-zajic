// 🏪 Obchod — načtení dat a zápisy do databáze.
// ---------------------------------------------------------------------------
// Počítání (stav skladu, statistiky, kontroly) je v lib/obchodSklad.ts,
// obchodStatistika.ts a obchodUzaverka.ts. Tady je jen komunikace s databází.
//
// Tabulky vznikají migrací 20261231270000_obchod.sql, která se pouští ručně
// v appce (Audit → Databázové migrace). Dokud neběžela, načtení hlásí
// `chybiTabulky` a obrazovka řekne, co udělat — místo prázdných čísel.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAllRows, supabase, useRealtime } from './supabase';
import { prvniChyba, usePosledniNacteni } from './nacitani';
import type {
  DuvodOdpisu, FasovaniRadek, InventuraRadek, OdpisRadek, PrijemRadek, ProdanyRadek, TypUzaverky, UzaverkaHlavicka, VstupSkladu, Zbozi,
} from './obchodSklad';
import type { NoveZbozi } from './obchodUzaverka';

export type Uzaverka = UzaverkaHlavicka & {
  typ: TypUzaverky;
  vytisteno: string | null;
  poznamka: string | null;
  zapsal: string | null;
  created_at: string;
};

export type ZboziDB = Zbozi & { aktivni: boolean };
export type PrijemDB = PrijemRadek & { id: string; poznamka: string | null; zapsal: string | null; created_at: string };
export type InventuraDB = InventuraRadek & { id: string; poznamka: string | null; zapsal: string | null };
export type OdpisDB = OdpisRadek & { id: string; duvod: DuvodOdpisu; poznamka: string | null; zapsal: string | null; created_at: string };
export type ZavrenoDB = { datum: string; poznamka: string | null; zapsal: string | null };
export type PivoKatalog = { id: string; name: string; degree: string | null; short_name?: string | null; is_active?: boolean; sort_order?: number };
export type ObalKatalog = { id: string; label: string; kind: string; volume_l: number; sort_order?: number };

export type DataObchodu = {
  zbozi: ZboziDB[];
  prijmy: PrijemDB[];
  uzaverky: Uzaverka[];
  radky: ProdanyRadek[];
  inventury: InventuraDB[];
  /** Odpis zboží v obchodě (druhá migrace; do jejího spuštění prázdné). */
  odpisy: OdpisDB[];
  /** Dny, kdy se neprodávalo (druhá migrace; do jejího spuštění prázdné). */
  zavreno: ZavrenoDB[];
  /** Druhá migrace (odpis, zavřeno) ještě neběžela — tyhle dvě funkce nejdou použít. */
  chybiOdpisAZavreno: boolean;
  fasovani: FasovaniRadek[];
  piva: PivoKatalog[];
  obaly: ObalKatalog[];
  /** Vstup pro lib/obchodSklad.ts. */
  vstup: VstupSkladu;
  nacitam: boolean;
  /** Text chyby načtení, nebo null. */
  chyba: string | null;
  /** Migrace obchodu ještě neběžela — tabulky v databázi nejsou. */
  chybiTabulky: boolean;
  znovu: () => void;
};

const TABULKY_OBCHODU = [
  'obchod_zbozi', 'obchod_prijem', 'obchod_uzaverky', 'obchod_uzaverky_radky', 'obchod_inventura', 'fasovani_private',
  'obchod_odpis', 'obchod_zavreno',
];

/** Chyba „tabulka neexistuje" (PostgREST PGRST205 / PostgreSQL 42P01) — migrace ještě neběžela. */
export function jeChybejiciTabulka(zprava: string | null | undefined): boolean {
  return /could not find the table|schema cache|relation .* does not exist|PGRST205|42P01/i.test(zprava ?? '');
}

export function useObchod(): DataObchodu {
  const [zbozi, setZbozi] = useState<ZboziDB[]>([]);
  const [prijmy, setPrijmy] = useState<PrijemDB[]>([]);
  const [uzaverky, setUzaverky] = useState<Uzaverka[]>([]);
  const [radky, setRadky] = useState<ProdanyRadek[]>([]);
  const [inventury, setInventury] = useState<InventuraDB[]>([]);
  const [odpisy, setOdpisy] = useState<OdpisDB[]>([]);
  const [zavreno, setZavreno] = useState<ZavrenoDB[]>([]);
  const [chybiOdpisAZavreno, setChybiOdpisAZavreno] = useState(false);
  const [fasovani, setFasovani] = useState<FasovaniRadek[]>([]);
  const [piva, setPiva] = useState<PivoKatalog[]>([]);
  const [obaly, setObaly] = useState<ObalKatalog[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const zacniNacteni = usePosledniNacteni();

  const nacti = useCallback(async () => {
    const smiZapsat = zacniNacteni();
    const [z, p, u, r, i, f, b, o, od, zv] = await Promise.all([
      fetchAllRows<ZboziDB>('obchod_zbozi', 'kod,nazev,beer_id,package_id,cena,min_ks,aktivni').order('kod'),
      fetchAllRows<PrijemDB>('obchod_prijem', 'id,datum,kod,mnozstvi,poznamka,zapsal,created_at').order('datum'),
      fetchAllRows<Uzaverka>('obchod_uzaverky', 'id,cislo,stredisko,typ,datum_od,datum_do,vytisteno,trzba,poznamka,zapsal,created_at').order('datum_do', { ascending: false }),
      fetchAllRows<ProdanyRadek>('obchod_uzaverky_radky', 'id,uzaverka_id,kod,nazev,mnozstvi,cena,celkem'),
      fetchAllRows<InventuraDB>('obchod_inventura', 'id,datum,kod,napocitano,ocekavano,poznamka,zapsal').order('datum'),
      fetchAllRows<FasovaniRadek>('fasovani_private', 'beer_id,package_id,quantity,entry_date'),
      fetchAllRows<PivoKatalog>('beers', 'id,name,degree,short_name,is_active,sort_order').order('sort_order'),
      fetchAllRows<ObalKatalog>('packages', 'id,label,kind,volume_l,sort_order').order('sort_order'),
      // Druhá migrace — kdo ji ještě nepustil, o odpis a „zavřeno" přijde, ale zbytek Obchodu funguje.
      fetchAllRows<OdpisDB>('obchod_odpis', 'id,datum,kod,mnozstvi,duvod,poznamka,zapsal,created_at').order('datum'),
      fetchAllRows<ZavrenoDB>('obchod_zavreno', 'datum,poznamka,zapsal').order('datum'),
    ]);
    if (!smiZapsat()) return;
    const volitelne = [od, zv];
    const chybi = volitelne.some((v) => jeChybejiciTabulka(v.error?.message));
    const err = prvniChyba(z, p, u, r, i, f, b, o, ...volitelne.filter((v) => !jeChybejiciTabulka(v.error?.message)));
    setChyba(err);
    if (!err) {
      setOdpisy(od.data ?? []);
      setZavreno(zv.data ?? []);
      setChybiOdpisAZavreno(chybi);
      setZbozi(z.data ?? []);
      setPrijmy(p.data ?? []);
      setUzaverky(u.data ?? []);
      setRadky(r.data ?? []);
      setInventury(i.data ?? []);
      setFasovani(f.data ?? []);
      setPiva(b.data ?? []);
      setObaly(o.data ?? []);
    }
    setNacitam(false);
  }, [zacniNacteni]);

  useEffect(() => { void nacti(); }, [nacti]);
  useRealtime(TABULKY_OBCHODU, () => { void nacti(); });

  const vstup = useMemo<VstupSkladu>(
    () => ({ zbozi, fasovani, prijmy, odpisy, uzaverky, radky, inventury }),
    [zbozi, fasovani, prijmy, odpisy, uzaverky, radky, inventury],
  );

  return {
    zbozi, prijmy, uzaverky, radky, inventury, odpisy, zavreno, chybiOdpisAZavreno, fasovani, piva, obaly, vstup, nacitam,
    chyba,
    chybiTabulky: jeChybejiciTabulka(chyba),
    znovu: () => { void nacti(); },
  };
}

// ── Zápisy ───────────────────────────────────────────────────────────────
// Každá vrací text chyby, nebo null, když se zapsalo.

export type ZapisUzaverky = {
  typ: TypUzaverky;
  od: string;
  do: string;
  cislo: string | null;
  stredisko: string | null;
  vytisteno: string | null;
  trzba: number | null;
  poznamka?: string | null;
  zapsal: string | null;
  radky: { kod: string; nazev: string; mnozstvi: number; cena: number | null; celkem: number | null }[];
  noveZbozi: NoveZbozi[];
};

/**
 * Zapíše uzávěrku: nové zboží → hlavička → řádky. Selže-li zápis řádků,
 * hlavička se smaže (řádky padají s ní), takže uzávěrka nezůstane napůl —
 * sklad by jinak ukazoval prodej bez kusů a uzávěrku už nešlo znovu zapsat
 * (stejné číslo).
 */
export async function zapisUzaverku(z: ZapisUzaverky): Promise<string | null> {
  if (z.noveZbozi.length > 0) {
    const { error } = await supabase.from('obchod_zbozi').insert(
      z.noveZbozi.map((n) => ({ kod: n.kod, nazev: n.nazev, beer_id: n.beer_id, package_id: n.package_id, cena: n.cena, updated_by: z.zapsal })),
    );
    if (error) return `Zboží se nepodařilo založit (${error.message})`;
  }
  const { data, error } = await supabase
    .from('obchod_uzaverky')
    .insert({
      cislo: z.cislo, stredisko: z.stredisko, typ: z.typ, datum_od: z.od, datum_do: z.do,
      vytisteno: z.vytisteno && z.vytisteno.length > 10 ? z.vytisteno : null,
      trzba: z.trzba, poznamka: z.poznamka ?? null, zapsal: z.zapsal,
    })
    .select('id')
    .single();
  if (error || !data) return `Uzávěrku se nepodařilo uložit (${error?.message ?? 'bez odpovědi'})`;

  const { error: chybaRadku } = await supabase.from('obchod_uzaverky_radky').insert(
    z.radky.map((r) => ({ uzaverka_id: data.id, kod: r.kod, nazev: r.nazev, mnozstvi: r.mnozstvi, cena: r.cena, celkem: r.celkem })),
  );
  if (chybaRadku) {
    await supabase.from('obchod_uzaverky').delete().eq('id', data.id);
    return `Řádky uzávěrky se nepodařilo uložit, nic se nezapsalo (${chybaRadku.message})`;
  }
  return null;
}

export async function smazUzaverku(id: string): Promise<string | null> {
  const { error } = await supabase.from('obchod_uzaverky').delete().eq('id', id);
  return error ? error.message : null;
}

export async function zapisPrijem(p: { datum: string; kod: string; mnozstvi: number; poznamka?: string | null; zapsal: string | null }): Promise<string | null> {
  const { error } = await supabase.from('obchod_prijem').insert({ datum: p.datum, kod: p.kod, mnozstvi: p.mnozstvi, poznamka: p.poznamka ?? null, zapsal: p.zapsal });
  return error ? error.message : null;
}

export async function smazPrijem(id: string): Promise<string | null> {
  const { error } = await supabase.from('obchod_prijem').delete().eq('id', id);
  return error ? error.message : null;
}

export async function zapisOdpis(o: { datum: string; kod: string; mnozstvi: number; duvod: DuvodOdpisu; poznamka?: string | null; zapsal: string | null }): Promise<string | null> {
  const { error } = await supabase.from('obchod_odpis').insert({
    datum: o.datum, kod: o.kod, mnozstvi: o.mnozstvi, duvod: o.duvod, poznamka: o.poznamka ?? null, zapsal: o.zapsal,
  });
  return error ? error.message : null;
}

export async function smazOdpis(id: string): Promise<string | null> {
  const { error } = await supabase.from('obchod_odpis').delete().eq('id', id);
  return error ? error.message : null;
}

/** Označí dny jako „zavřeno / nic se neprodávalo" (opakovaný zápis téhož dne nevadí). */
export async function zapisZavreno(dny: string[], zapsal: string | null, poznamka?: string | null): Promise<string | null> {
  if (dny.length === 0) return null;
  const { error } = await supabase.from('obchod_zavreno').upsert(
    dny.map((datum) => ({ datum, poznamka: poznamka ?? null, zapsal })),
    { onConflict: 'datum' },
  );
  return error ? error.message : null;
}

export async function smazZavreno(datum: string): Promise<string | null> {
  const { error } = await supabase.from('obchod_zavreno').delete().eq('datum', datum);
  return error ? error.message : null;
}

/** Inventura: jeden řádek na zboží a den; opakovaný zápis téhož dne přepíše předchozí. */
export async function zapisInventuru(
  datum: string,
  radky: { kod: string; napocitano: number; ocekavano: number | null }[],
  zapsal: string | null,
): Promise<string | null> {
  if (radky.length === 0) return null;
  const { error } = await supabase.from('obchod_inventura').upsert(
    radky.map((r) => ({ datum, kod: r.kod, napocitano: r.napocitano, ocekavano: r.ocekavano, zapsal })),
    { onConflict: 'datum,kod' },
  );
  return error ? error.message : null;
}

export async function zalozZbozi(z: { kod: string; nazev: string; beer_id: string | null; package_id: string | null; cena?: number | null; min_ks?: number | null; zapsal: string | null }): Promise<string | null> {
  const { error } = await supabase.from('obchod_zbozi').insert({
    kod: z.kod, nazev: z.nazev, beer_id: z.beer_id, package_id: z.package_id, cena: z.cena ?? null, min_ks: z.min_ks ?? null, updated_by: z.zapsal,
  });
  if (!error) return null;
  return /duplicate|unique/i.test(error.message)
    ? 'Zboží s tímhle kódem nebo s tímhle pivem a obalem už v obchodě je.'
    : error.message;
}

export async function upravZbozi(
  kod: string,
  zmena: Partial<{ nazev: string; min_ks: number | null; cena: number | null; aktivni: boolean }>,
  zapsal: string | null,
): Promise<string | null> {
  const { error } = await supabase.from('obchod_zbozi').update({ ...zmena, updated_at: new Date().toISOString(), updated_by: zapsal }).eq('kod', kod);
  return error ? error.message : null;
}
