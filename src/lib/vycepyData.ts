// 🍺 Výčepy a jejich rezervace — čtení a zápis proti databázi.
// ---------------------------------------------------------------------------
// Do 31. 8. 2026 žilo obojí VÝHRADNĚ v localStorage. Rezervace zadaná na
// mobilu nebyla vidět na tabletu, vyčištění dat prohlížeče ji smazalo a na
// novém zařízení se začínalo s prázdnem — přitom Orders.tsx do toho seznamu
// sahá při objednávce a rezervuje výčep automaticky.
//
// Teď je originál v databázi (tabulky `vycepy` a `vycepy_rezervace`) a
// localStorage slouží jen jako OFFLINE KOPIE: appka běží v pivovaru, kde
// signál občas vypadne, a prázdný seznam výčepů by tam byl horší než trochu
// starý. Kopie se přepisuje po každém úspěšném načtení.
import { supabase } from './supabase';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';

export const KLIC_VYCEPY = 'vycepy_equipment_v1';
export const KLIC_REZERVACE = 'vycepy_reservations_v1';

// ── Převody mezi tvarem v databázi a tvarem, se kterým pracuje appka ───────
// Sloupce jsou česky (jako zbytek novějších tabulek), typy v appce anglicky
// (jak vznikly). Překlad je schválně na jednom místě, ať se to nerozejde.

type VycepRadek = {
  id: string; nazev: string; typ: string; stav: string;
  posledni_oplach: string | null; posledni_sanitace_louhem: string | null;
  kohouty_rozebrane: boolean; poznamka: string | null;
  aktivni: boolean; poradi: number;
};

type RezervaceRadek = {
  id: string; vycep_id: string; vycep_nazev: string | null;
  datum_od: string; datum_do: string; odberatel: string;
  telefon: string | null; kauce_czk: number | null;
  vraceno: boolean; vraceno_at: string | null;
  poznamka: string | null; order_id: string | null;
};

function naVycep(r: VycepRadek): TapEquipment {
  return {
    id: r.id,
    name: r.nazev,
    tap_type: r.typ,
    status: r.stav as TapEquipment['status'],
    last_water_rinse: r.posledni_oplach ?? undefined,
    last_louh_sanitation: r.posledni_sanitace_louhem ?? undefined,
    taps_disassembled: r.kohouty_rozebrane,
    note: r.poznamka ?? undefined,
  };
}

function zVycepu(v: TapEquipment, poradi = 0) {
  return {
    id: v.id,
    nazev: v.name,
    typ: v.tap_type,
    stav: v.status,
    posledni_oplach: v.last_water_rinse ?? null,
    posledni_sanitace_louhem: v.last_louh_sanitation ?? null,
    kohouty_rozebrane: !!v.taps_disassembled,
    poznamka: v.note ?? null,
    poradi,
    updated_at: new Date().toISOString(),
  };
}

function naRezervaci(r: RezervaceRadek): TapReservation {
  return {
    id: r.id,
    tap_id: r.vycep_id,
    tap_name: r.vycep_nazev ?? '',
    date_from: r.datum_od,
    date_to: r.datum_do,
    customer_name: r.odberatel,
    phone: r.telefon ?? undefined,
    deposit_czk: r.kauce_czk ?? undefined,
    is_returned: r.vraceno,
    returned_at: r.vraceno_at ?? undefined,
    note: r.poznamka ?? undefined,
    order_id: r.order_id ?? undefined,
  };
}

function zRezervace(r: TapReservation) {
  return {
    id: r.id,
    vycep_id: r.tap_id,
    vycep_nazev: r.tap_name || null,
    datum_od: r.date_from,
    // Jednodenní rezervace nemusí mít vyplněné „do“ — pak platí jen ten den.
    datum_do: r.date_to || r.date_from,
    odberatel: r.customer_name || '',
    telefon: r.phone ?? null,
    kauce_czk: r.deposit_czk ?? null,
    vraceno: !!r.is_returned,
    vraceno_at: r.returned_at ?? null,
    poznamka: r.note ?? null,
    order_id: r.order_id ?? null,
    updated_at: new Date().toISOString(),
  };
}

// ── Offline kopie ──────────────────────────────────────────────────────────

function nactiKopii<T>(klic: string): T[] {
  try {
    const raw = localStorage.getItem(klic);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function ulozKopii(klic: string, data: unknown): void {
  try { localStorage.setItem(klic, JSON.stringify(data)); } catch { /* plná paměť, nevadí */ }
}

// ── Čtení ──────────────────────────────────────────────────────────────────

/**
 * Načte výčepy. Když databáze není dostupná, vrátí poslední známou kopii —
 * v pivovaru vypadává signál a prázdný seznam by byl horší než starší.
 */
export async function nactiVycepy(): Promise<TapEquipment[]> {
  const { data, error } = await supabase.from('vycepy').select('*').order('poradi').order('nazev');
  if (error || !data) return nactiKopii<TapEquipment>(KLIC_VYCEPY);
  const vycepy = (data as VycepRadek[]).map(naVycep);
  ulozKopii(KLIC_VYCEPY, vycepy);
  return vycepy;
}

export async function nactiRezervace(): Promise<TapReservation[]> {
  const { data, error } = await supabase
    .from('vycepy_rezervace').select('*').order('datum_od', { ascending: false });
  if (error || !data) return nactiKopii<TapReservation>(KLIC_REZERVACE);
  const rezervace = (data as RezervaceRadek[]).map(naRezervaci);
  ulozKopii(KLIC_REZERVACE, rezervace);
  return rezervace;
}

// ── Zápis ──────────────────────────────────────────────────────────────────

export async function ulozVycep(v: TapEquipment, poradi = 0): Promise<string | null> {
  const { error } = await supabase.from('vycepy').upsert(zVycepu(v, poradi), { onConflict: 'id' });
  return error?.message ?? null;
}

export async function smazVycep(id: string): Promise<string | null> {
  const { error } = await supabase.from('vycepy').delete().eq('id', id);
  return error?.message ?? null;
}

export async function ulozRezervaci(r: TapReservation): Promise<string | null> {
  const { error } = await supabase.from('vycepy_rezervace').upsert(zRezervace(r), { onConflict: 'id' });
  return error?.message ?? null;
}

export async function smazRezervaci(id: string): Promise<string | null> {
  const { error } = await supabase.from('vycepy_rezervace').delete().eq('id', id);
  return error?.message ?? null;
}

/**
 * Jednorázový převod toho, co uživatelům zůstalo v prohlížeči, do databáze.
 *
 * Spouští se při prvním načtení: když je databáze prázdná a v prohlížeči něco
 * je, nahraje se to tam. Bez toho by lidem po nasazení „zmizely“ výčepy, které
 * si roky vedli — jen proto, že se přesunuly do cloudu.
 *
 * Vrací počet přenesených záznamů (0 = nebylo co přenášet).
 */
export async function prenesZProhlizece(): Promise<{ vycepu: number; rezervaci: number }> {
  const mistniVycepy = nactiKopii<TapEquipment>(KLIC_VYCEPY);
  const mistniRezervace = nactiKopii<TapReservation>(KLIC_REZERVACE);
  if (mistniVycepy.length === 0 && mistniRezervace.length === 0) return { vycepu: 0, rezervaci: 0 };

  const { count } = await supabase.from('vycepy').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return { vycepu: 0, rezervaci: 0 }; // v cloudu už něco je, nepřepisovat

  // Staré localStorage id ('t1', 't2'…) nejsou uuid, databáze je nepřijme.
  // Vyrobí se nová a rezervace se na ně přemapují.
  const noveId = new Map<string, string>();
  const vycepyKUlozeni = mistniVycepy.map((v, i) => {
    const id = crypto.randomUUID();
    noveId.set(v.id, id);
    return zVycepu({ ...v, id }, i);
  });
  if (vycepyKUlozeni.length > 0) {
    const { error } = await supabase.from('vycepy').insert(vycepyKUlozeni);
    if (error) return { vycepu: 0, rezervaci: 0 };
  }

  const rezervaceKUlozeni = mistniRezervace
    .filter((r) => noveId.has(r.tap_id))
    .map((r) => zRezervace({
      ...r,
      id: crypto.randomUUID(),
      tap_id: noveId.get(r.tap_id)!,
      // Objednávky ze starých dat nemusí existovat — vazbu radši zahodíme,
      // než aby celý převod spadl na cizím klíči.
      order_id: undefined,
    }));
  if (rezervaceKUlozeni.length > 0) {
    await supabase.from('vycepy_rezervace').insert(rezervaceKUlozeni);
  }

  return { vycepu: vycepyKUlozeni.length, rezervaci: rezervaceKUlozeni.length };
}
