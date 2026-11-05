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
import { uloz } from './uloziste';

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

// ── Čas oplachu a louhování ────────────────────────────────────────────────
// Sloupce `posledni_oplach` a `posledni_sanitace_louhem` jsou timestamptz.
// Obrazovka Výčepy je ale dřív plnila ČESKÝM TEXTEM („5. 11. 2026 11:06“ — tak
// vypadá toLocaleDateString('cs-CZ')) a Postgres takový text odmítne
// („invalid input syntax for type timestamp with time zone“). Výčep ani oplach
// se tak nikdy neuložil — v ostré databázi byly proto 0 výčepů (5. 11. 2026).
// Do databáze proto odchází jen to, co z textu jde přečíst jako čas.

/** Čeština: „5. 11. 2026 11:06“, „5.11.2026“ — mezery za tečkami jsou nepovinné. */
const CESKY_CAS = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
const JEN_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Místní čas zařízení → ISO; `null`, když takové datum neexistuje (31. 2.). */
function mistniNaIso(r: number, m: number, d: number, h = 0, min = 0): string | null {
  const datum = new Date(r, m - 1, d, h, min);
  const sedi = datum.getFullYear() === r && datum.getMonth() === m - 1 && datum.getDate() === d
    && datum.getHours() === h && datum.getMinutes() === min;
  return sedi ? datum.toISOString() : null;
}

/**
 * Převede čas v kterémkoli tvaru, který appka kdy zapsala, na ISO, které
 * databáze přijme. Český zápis a zápis bez pásma jsou MÍSTNÍ čas zařízení —
 * tak ho vyrobil `toLocaleTimeString`. Co se přečíst nedá, je `null`
 * (nikdy výjimka a nikdy uhodnuté datum).
 */
export function naIsoCas(text?: string | null): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;

  const cesky = CESKY_CAS.exec(t);
  if (cesky) {
    const [, d, m, r, h, min] = cesky;
    return mistniNaIso(Number(r), Number(m), Number(d), h ? Number(h) : 0, min ? Number(min) : 0);
  }

  const jenDatum = JEN_DATUM.exec(t);
  if (jenDatum) return mistniNaIso(Number(jenDatum[1]), Number(jenDatum[2]), Number(jenDatum[3]));

  // ISO („2026-11-05T10:06:00+00:00“ z databáze) a starší „2026-07-26 18:00“.
  // Bez pásma čte JS tvar s časem jako místní čas — stejně jako český zápis.
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(t)) return null;
  const datum = new Date(t.replace(' ', 'T'));
  return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
}

/** Čas oplachu / louhování tak, jak se ukáže na kartě výčepu: „5. 11. 2026 11:06“. */
export function ukazCas(text?: string | null): string {
  const iso = naIsoCas(text);
  if (!iso) return text ?? '';
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Do databáze jen platný čas; nečitelný se zahodí (a ohlásí), ať neshodí uložení celého výčepu. */
function casProDatabazi(text: string | undefined, co: string): string | null {
  if (!text || !text.trim()) return null;
  const iso = naIsoCas(text);
  if (!iso) console.warn(`Výčep: ${co} „${text}“ nejde přečíst jako čas — neukládá se.`);
  return iso;
}

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
    posledni_oplach: casProDatabazi(v.last_water_rinse, 'čas oplachu'),
    posledni_sanitace_louhem: casProDatabazi(v.last_louh_sanitation, 'čas louhování'),
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
  try { uloz(klic, JSON.stringify(data)); } catch { /* plná paměť, nevadí */ }
}

// ── Čtení ──────────────────────────────────────────────────────────────────

/**
 * Načte výčepy. Když databáze není dostupná, vrátí poslední známou kopii —
 * v pivovaru vypadává signál a prázdný seznam by byl horší než starší.
 */
export async function nactiVycepy(): Promise<TapEquipment[]> {
  await zajistiMigraci();
  const { data, error } = await supabase.from('vycepy').select('*').order('poradi').order('nazev');
  if (error || !data) return nactiKopii<TapEquipment>(KLIC_VYCEPY);
  const vycepy = (data as VycepRadek[]).map(naVycep);
  ulozKopii(KLIC_VYCEPY, vycepy);
  return vycepy;
}

export async function nactiRezervace(): Promise<TapReservation[]> {
  await zajistiMigraci();
  const { data, error } = await supabase
    .from('vycepy_rezervace').select('*').order('datum_od', { ascending: false });
  if (error || !data) return nactiKopii<TapReservation>(KLIC_REZERVACE);
  const rezervace = (data as RezervaceRadek[]).map(naRezervaci);
  ulozKopii(KLIC_REZERVACE, rezervace);
  return rezervace;
}

// ── Co poslat do databáze ──────────────────────────────────────────────────

/**
 * Porovná starý a nový seznam a řekne, co se má uložit a co smazat.
 *
 * Obrazovka pracuje s celým seznamem naráz (přidání i smazání vrací nové
 * pole), ale posílat při každé drobnosti všechny řádky by z jednoho
 * přejmenování udělalo desítky zbytečných zápisů. Porovnává se hodnotou:
 * co se nezměnilo, se nepřepisuje.
 */
export function rozdilProUlozeni<T extends { id: string }>(
  stare: T[], nove: T[],
): { kUlozeni: T[]; kSmazani: string[] } {
  const noveId = new Set(nove.map((x) => x.id));
  const podleId = new Map(stare.map((x) => [x.id, x]));
  return {
    kSmazani: stare.filter((s) => !noveId.has(s.id)).map((s) => s.id),
    kUlozeni: nove.filter((n) => {
      const puvodni = podleId.get(n.id);
      return !puvodni || JSON.stringify(puvodni) !== JSON.stringify(n);
    }),
  };
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

/**
 * Uloží rezervaci a hned ji dá i do offline kopie. Seznam objednávek ukazuje
 * štítek s výčepem (getTapNameForOrder) a čte ho synchronně z kopie — bez
 * tohohle by štítek chyběl, dokud někdo neotevře Výčepy nebo nerestartuje appku.
 * Při chybě databáze se kopie nemění (co v databázi není, nemá být ani tam).
 */
export async function ulozRezervaci(r: TapReservation): Promise<string | null> {
  const { error } = await supabase.from('vycepy_rezervace').upsert(zRezervace(r), { onConflict: 'id' });
  if (error) return error.message;
  const kopie = nactiKopii<TapReservation>(KLIC_REZERVACE);
  ulozKopii(KLIC_REZERVACE, kopie.some((x) => x.id === r.id)
    ? kopie.map((x) => (x.id === r.id ? r : x))
    : [r, ...kopie]);
  return null;
}

export async function smazRezervaci(id: string): Promise<string | null> {
  const { error } = await supabase.from('vycepy_rezervace').delete().eq('id', id);
  if (error) return error.message;
  ulozKopii(KLIC_REZERVACE, nactiKopii<TapReservation>(KLIC_REZERVACE).filter((x) => x.id !== id));
  return null;
}

/**
 * Jednorázový převod toho, co uživatelům zůstalo v prohlížeči, do databáze.
 *
 * Spouští se při prvním načtení: když je databáze prázdná a v prohlížeči něco
 * je, nahraje se to tam. Bez toho by lidem po nasazení „zmizely“ výčepy, které
 * si roky vedli — jen proto, že se přesunuly do cloudu.
 *
 * ⚠️ 27. 9. 2026: přesně tohle se stalo. `nactiVycepy`/`nactiRezervace` po
 * úspěšném (byť prázdném) čtení z databáze přepíšou offline kopii v
 * prohlížeči — a tahle migrace se dřív volala jen z VycepyScreen.tsx. Jenže
 * `autoReserveTapIfNeeded` (Orders.tsx) a HomeScreen (výčepy po termínu)
 * sahají na `nactiVycepy`/`nactiRezervace` NAPŘÍMO, bez migrace napřed —
 * a HomeScreen se načte při každém spuštění appky dřív, než kdo stihne
 * otevřít Výčepy. Stará data v prohlížeči tak zmizela ještě předtím, než
 * měla šanci se migrace vůbec spustit. Proto teď migraci spouští
 * `nactiVycepy`/`nactiRezervace` samy, ať se to nepovede zapomenout na
 * žádném vstupním bodě — a `zajistiMigraci` hlídá, ať se pokus o migraci
 * (a tedy čtení+případný insert) neudělá vícekrát v jedné session.
 *
 * Vrací počet přenesených záznamů (0 = nebylo co přenášet).
 */
let migraceSlib: Promise<{ vycepu: number; rezervaci: number }> | null = null;

function zajistiMigraci(): Promise<{ vycepu: number; rezervaci: number }> {
  if (!migraceSlib) migraceSlib = provedMigraci();
  return migraceSlib;
}

/** Pro testy: zapomenout, že migrace už proběhla. */
export function vycistiMigraciProTesty(): void {
  migraceSlib = null;
}

async function provedMigraci(): Promise<{ vycepu: number; rezervaci: number }> {
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
