// 📍 Víc míst závozu u jednoho odběratele.
// ---------------------------------------------------------------------------
// Z provozu 5. 11. 2026: „u Radek je potřeba 2 GPS, občas se vozí do Hradce
// a občas do Prahy."
//
// Hlavní adresa a GPS zůstávají v places.address / lat / lng — čte je všechno
// ostatní. Další místa jsou v places.mista_zavozu (pole {id, nazev, adresa,
// lat, lng}) a objednávka si v orders.misto_zavozu pamatuje, kam jede: id
// dalšího místa, nebo HLAVNI_MISTO. Prázdné = nikdo nevybral → jede se na
// hlavní adresu, ale u odběratele s víc místy to Kniha jízd ukáže jako
// nevybrané (počítala by jinak třeba Prahu místo Hradce). Podle zvoleného
// místa naviguje Rozvoz a počítá Kniha jízd (km z GPS, +30 km za Prahu…).
//
// Sloupce přidává migrace 20261231450000_odberatel_vic_mist_zavozu.sql. Než ji
// někdo spustí, sloupce v datech chybí a všechno se chová jako dřív.
import { velkeMestoZastavky } from './knihaJizdPravidla';

export type MistoZavozu = {
  id: string;
  /** Jak se místu říká (Hradec, Praha…). */
  nazev: string;
  adresa: string | null;
  lat: number | null;
  lng: number | null;
};

export type OdberatelSMisty = {
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  mista_zavozu?: unknown;
};

/** orders.misto_zavozu pro výslovně zvolenou hlavní adresu. */
export const HLAVNI_MISTO = 'hlavni';

/** Kam objednávka jede: zvolené další místo, nebo hlavní adresa odběratele. */
export type CilZavozu = {
  /** id dalšího místa; null = hlavní adresa. */
  id: string | null;
  nazev: string;
  adresa: string | null;
  lat: number | null;
  lng: number | null;
  /** Někdo vybral, kam se veze (hlavní adresu nebo další místo, které pořád existuje). */
  zvoleno: boolean;
  /** Objednávka má zvolené místo, které už u odběratele není — jede se na hlavní adresu. */
  ztracene: boolean;
};

const cislo = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Další místa závozu odběratele (bez hlavní adresy). Neplatné položky se přeskočí. */
export function mistaOdberatele(p: OdberatelSMisty | null | undefined): MistoZavozu[] {
  const pole = p?.mista_zavozu;
  if (!Array.isArray(pole)) return [];
  const videna = new Set<string>([HLAVNI_MISTO]);
  const out: MistoZavozu[] = [];
  for (const x of pole) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const id = text(o.id);
    const nazev = text(o.nazev);
    if (!id || !nazev || videna.has(id)) continue;
    videna.add(id);
    const lat = cislo(o.lat, -90, 90);
    const lng = cislo(o.lng, -180, 180);
    out.push({ id, nazev, adresa: text(o.adresa), lat: lat !== null && lng !== null ? lat : null, lng: lat !== null && lng !== null ? lng : null });
  }
  return out;
}

/** Má odběratel víc míst závozu (hlavní + aspoň jedno další)? */
export const maViceMist = (p: OdberatelSMisty | null | undefined): boolean => mistaOdberatele(p).length > 0;

/**
 * Krátký název hlavní adresy do přepínače: velké město z adresy (Praha),
 * jinak obec z adresy „Ulice 12, Obec, 123 45", jinak „Hlavní adresa".
 */
export function nazevHlavnihoMista(p: OdberatelSMisty | null | undefined): string {
  const adresa = text(p?.address);
  if (!adresa) return 'Hlavní adresa';
  const mesto = velkeMestoZastavky(null, adresa);
  if (mesto) return mesto;
  const casti = adresa.split(',').map((s) => s.trim()).filter(Boolean);
  const obec = casti.slice(1).find((c) => !/^\d{3}\s?\d{2}$/.test(c) && !/^(česko|česká republika|czechia)$/i.test(c));
  return obec ?? (casti.length === 1 && !/\d/.test(casti[0]) ? casti[0] : 'Hlavní adresa');
}

/** Kam jede objednávka (zvolené místo, jinak hlavní adresa). */
export function mistoObjednavky(o: { misto_zavozu?: string | null } | null | undefined, p: OdberatelSMisty | null | undefined): CilZavozu {
  const zvolene = text(o?.misto_zavozu);
  if (zvolene && zvolene !== HLAVNI_MISTO) {
    const m = mistaOdberatele(p).find((x) => x.id === zvolene);
    if (m) return { ...m, zvoleno: true, ztracene: false };
  }
  const lat = cislo(p?.lat, -90, 90);
  const lng = cislo(p?.lng, -180, 180);
  return {
    id: null,
    nazev: nazevHlavnihoMista(p),
    adresa: text(p?.address),
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
    zvoleno: zvolene === HLAVNI_MISTO,
    ztracene: !!zvolene && zvolene !== HLAVNI_MISTO,
  };
}

/** Hodnota orders.misto_zavozu pro volbu v přepínači (null = hlavní adresa). */
export const hodnotaVolby = (id: string | null): string => id ?? HLAVNI_MISTO;

/**
 * Zastávka objednávky pro Knihu jízd: název s místem (když nejde o hlavní
 * adresu), GPS a adresa zvoleného místa. `bezVolby` = odběratel má víc míst,
 * ale u objednávky nikdo nevybral kam — počítá se s hlavní adresou.
 */
export function zastavkaObjednavky(
  o: { place_id?: string | null; place_name?: string | null; misto_zavozu?: string | null },
  p: OdberatelSMisty | null | undefined,
): { klic: string; name: string; lat: number | null; lng: number | null; address: string | null; bezVolby: boolean } {
  const nazev = o.place_name || 'Místní odběratel';
  const cil = mistoObjednavky(o, p);
  return {
    klic: `${o.place_id || nazev}|${cil.id ?? ''}`,
    name: cil.id ? `${nazev} (${cil.nazev})` : nazev,
    lat: cil.lat,
    lng: cil.lng,
    address: cil.adresa,
    bezVolby: maViceMist(p) && !cil.zvoleno,
  };
}

/** Cíl pro navigační aplikaci: adresa, jinak GPS, jinak název odběratele. */
export function cilNavigace(cil: CilZavozu, nazevOdberatele: string): string {
  if (cil.adresa) return cil.adresa;
  if (cil.lat !== null && cil.lng !== null) return `${cil.lat},${cil.lng}`;
  return nazevOdberatele;
}

/** GPS pro člověka: „50.209200, 15.832766". */
export const gpsText = (lat: number, lng: number): string => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

/** Leží bod v Česku (hrubý obdélník)? Slouží jen k opravě prohozeného pořadí. */
const vCesku = (lat: number, lng: number) => lat >= 48.4 && lat <= 51.2 && lng >= 11.9 && lng <= 19.0;

function dvojice(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Pořadí „délka, šířka" (mapy.cz x/y, GeoJSON) — v Česku se pozná bezpečně.
  if (!vCesku(lat, lng) && vCesku(lng, lat)) [lat, lng] = [lng, lat];
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 };
}

function zeStupnu(st: string, min?: string, sek?: string): number {
  return Number(st.replace(',', '.')) + (min ? Number(min.replace(',', '.')) / 60 : 0) + (sek ? Number(sek.replace(',', '.')) / 3600 : 0);
}

// Písmeno u souřadnice určuje jen POŘADÍ (šířka/délka), ne znaménko: „S" je
// anglicky jih, ale česky sever, a body v Česku mají obě čísla kladná.
const JE_DELKA = /^[EWVZ]$/i;
const prvniJeDelka = (a?: string, b?: string) => JE_DELKA.test(a ?? '') && !JE_DELKA.test(b ?? '');

function gpsZOdkazu(s: string): { lat: number; lng: number } | null {
  // mapy.cz / mapy.com: x = délka, y = šířka (pořadí parametrů libovolné)
  const x = s.match(/[?&]x=(-?\d+(?:\.\d+)?)/);
  const y = s.match(/[?&]y=(-?\d+(?:\.\d+)?)/);
  if (x && y) return dvojice(Number(y[1]), Number(x[1]));
  // Google: špendlík !3d…!4d…, pohled @šířka,délka, nebo ?q= / ?ll= (i Waze)
  const g = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
    ?? s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    ?? s.match(/[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i);
  return g ? dvojice(Number(g[1]), Number(g[2])) : null;
}

/**
 * GPS z textu, který člověk vloží: „50.2092, 15.8328", „50.2092003N, 15.8327664E"
 * (mapy.cz), „50°12'33.1"N 15°49'58.0"E" (Google), odkaz z Google Map
 * (…/@50.2092,15.8328,17z nebo ?q=50.2092,15.8328) nebo z mapy.cz (…x=15.83&y=50.21…).
 * Zkrácený odkaz (maps.app.goo.gl) souřadnice neobsahuje — ten nepozná.
 */
export function gpsZTextu(vstup: string | null | undefined): { lat: number; lng: number } | null {
  const s = (vstup ?? '').trim();
  if (!s) return null;
  const zOdkazu = gpsZOdkazu(s);
  if (zOdkazu) return zOdkazu;
  // Stupně, minuty, vteřiny: 50°12'33.1"N 15°49'58.0"E
  const dms = /(\d{1,3}(?:[.,]\d+)?)\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|''|”)\s*)?([NSEWJVZ])?/gi;
  const kusy = [...s.matchAll(dms)];
  if (kusy.length >= 2) {
    const a = zeStupnu(kusy[0][1], kusy[0][2], kusy[0][3]);
    const b = zeStupnu(kusy[1][1], kusy[1][2], kusy[1][3]);
    return prvniJeDelka(kusy[0][4], kusy[1][4]) ? dvojice(b, a) : dvojice(a, b);
  }
  // Desetinná čísla: „50.2092, 15.8328", „50.2092N, 15.8328E", „50,2092 15,8328"
  const des = s.match(/^\s*(-?\d{1,3}[.,]\d+)\s*°?\s*([NSEWJVZ])?\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*°?\s*([NSEWJVZ])?\s*$/i);
  if (des) {
    const a = Number(des[1].replace(',', '.'));
    const b = Number(des[3].replace(',', '.'));
    return prvniJeDelka(des[2], des[4]) ? dvojice(b, a) : dvojice(a, b);
  }
  return null;
}

/** Nové prázdné místo do formuláře odběratele. */
export function noveMisto(nazev = ''): MistoZavozu {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return { id, nazev, adresa: null, lat: null, lng: null };
}

/**
 * Místa z formuláře k uložení: ořezané texty, bez úplně prázdných řádků.
 * Řádek s adresou nebo GPS, ale bez názvu, dostane název podle adresy —
 * jinak by se v přepínači u objednávky nedal poznat.
 */
export function mistaKUlozeni(radky: readonly MistoZavozu[]): MistoZavozu[] {
  const videna = new Set<string>([HLAVNI_MISTO]);
  const out: MistoZavozu[] = [];
  for (const r of radky) {
    const adresa = text(r.adresa);
    const gps = r.lat !== null && r.lng !== null && Number.isFinite(r.lat) && Number.isFinite(r.lng);
    const nazev = text(r.nazev) ?? (adresa ? nazevHlavnihoMista({ address: adresa }) : null);
    if (!nazev && !adresa && !gps) continue;
    let id = text(r.id) ?? noveMisto().id;
    while (videna.has(id)) id = noveMisto().id;
    videna.add(id);
    out.push({ id, nazev: nazev ?? `Místo ${out.length + 2}`, adresa, lat: gps ? r.lat : null, lng: gps ? r.lng : null });
  }
  return out;
}

// ── Formulář odběratele ────────────────────────────────────────────────────
// GPS se ve formuláři drží jako vložený TEXT a převádí se až při uložení —
// při psaní se pole nepřeformátovává a nepoznané GPS uložení zastaví.

/** Řádek dalšího místa ve formuláři. lat0/lng0 = původní hodnoty (nezměněné GPS se uloží přesně). */
export type MistoRadek = { id: string; nazev: string; adresa: string; gps: string; lat0?: number | null; lng0?: number | null };

export const radekZMista = (m: MistoZavozu): MistoRadek => ({
  id: m.id, nazev: m.nazev, adresa: m.adresa ?? '',
  gps: m.lat !== null && m.lng !== null ? gpsText(m.lat, m.lng) : '', lat0: m.lat, lng0: m.lng,
});

/**
 * GPS z pole formuláře: prázdné = bez GPS, nepoznané = chyba. Text, který se
 * od původní hodnoty nezměnil, vrátí původní čísla beze ztráty přesnosti.
 */
export function gpsZFormulare(textPole: string, puvodni?: { lat?: number | null; lng?: number | null }):
  { lat: number | null; lng: number | null } | 'nepoznane' {
  const t = textPole.trim();
  if (!t) return { lat: null, lng: null };
  const la = puvodni?.lat;
  const ln = puvodni?.lng;
  if (la != null && ln != null && Number.isFinite(la) && Number.isFinite(ln) && t === gpsText(la, ln)) return { lat: la, lng: ln };
  return gpsZTextu(t) ?? 'nepoznane';
}

/** Řádky formuláře → místa k uložení + seznam chyb (nepoznané GPS). */
export function mistaZRadku(radky: readonly MistoRadek[]): { mista: MistoZavozu[]; chyby: string[] } {
  const chyby: string[] = [];
  const mista = mistaKUlozeni(radky.map((r, i) => {
    const g = gpsZFormulare(r.gps, { lat: r.lat0, lng: r.lng0 });
    if (g === 'nepoznane') chyby.push(`${r.nazev.trim() || r.adresa.trim() || `místo ${i + 1}`}: GPS jsem nepoznal`);
    return { id: r.id, nazev: r.nazev, adresa: r.adresa, lat: g === 'nepoznane' ? null : g.lat, lng: g === 'nepoznane' ? null : g.lng };
  }));
  return { mista, chyby };
}

/** Odkaz na bod v mapy.cz (kontrola, že GPS sedí). */
export const odkazNaMapu = (lat: number, lng: number): string =>
  `https://mapy.cz/zakladni?x=${lng}&y=${lat}&z=17&source=coor&id=${lng}%2C${lat}`;

/** Chyba „sloupec v databázi není" — migrace ještě neproběhla. */
export function chybiSloupecMist(chyba: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!chyba) return false;
  return chyba.code === 'PGRST204' || chyba.code === '42703' || /mista_zavozu|misto_zavozu/.test(chyba.message ?? '');
}

export const HLASKA_MIGRACE_MIST =
  'Další místa závozu ještě nejdou uložit — nejdřív spusť migraci 20261231450000_odberatel_vic_mist_zavozu v Systém → Databázové migrace.';
