// 🍺 Stav sklepa jako provozní kontext pro AI sládka.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: „pokračuj v tom chatbotovi". Aby se AI sládek při problému
// neptal na to, co appka sama ví (jaké pivo je v tanku 7, od kdy tam je, kdy byl tank
// naposled sanitovaný, co se přečerpávalo, jaké byly ztráty), přiloží se k otázce
// stav sklepa jako krátký čistý text.
//
// Jsou to provozní údaje, ne literatura, a nic se nedomýšlí: pole, která Sklep
// nezná, se vynechají (nic se nedoplňuje odhadem) a data se jen čtou — žádná oprava
// ani dorovnání. Čisté funkce bez sítě (načtení: bibleProvozApi.ts).
import { businessDateISO, posunDen } from './businessDate';
import { fazeTanku, POPIS_FAZE } from './fazeTanku';

export type Cislo = number | string | null | undefined;

export type TankProKontext = {
  id: string;
  label: string;
  capacity_l?: Cislo;
  current_beer_name?: string | null;
  current_volume_l?: Cislo;
  status?: string | null;
  started_at?: string | null;
  note?: string | null;
  kegging_ended_at?: string | null;
};

export type SanitaceProKontext = {
  tank_id?: string | null;
  method?: string | null;
  method_label?: string | null;
  created_at?: string | null;
};

export type PrevodProKontext = {
  transfer_date: string;
  from_tank_id?: string | null;
  to_tank_id?: string | null;
  beer_name?: string | null;
  volume_l?: Cislo;
  loss_l?: Cislo;
};

export type CyklusProKontext = {
  tank_label?: string | null;
  beer_name?: string | null;
  initial_volume_l?: Cislo;
  kegged_volume_l?: Cislo;
  loss_l?: Cislo;
  started_at?: string | null;
  ended_at: string;
  duration_hours?: Cislo;
};

export type VstupProvozu = {
  tanky: readonly TankProKontext[];
  sanitace: readonly SanitaceProKontext[];
  prevody: readonly PrevodProKontext[];
  cykly: readonly CyklusProKontext[];
  /** Dnešní den (ISO, pražský) — z něj se počítají dny a okno přečerpání. */
  dnes: string;
  /** Čas načtení („10:45"), ať je vidět, jak je stav starý. */
  cas?: string;
};

/** Nejvíc znaků, které se k otázce přikládají (bible-chat zná strop 6 000). */
export const MAX_ZNAKU_PROVOZU = 3500;
/** Přečerpání jen za tolik posledních dní. */
export const OKNO_PRECERPANI_DNI = 14;
const MAX_PRECERPANI = 8;
const MAX_CYKLU = 5;
const MAX_POZNAMKA = 100;
const MAX_PIVO = 60;

const STAV_S_PIVEM: Readonly<Record<string, string>> = { filling: 'plní se', active: 'aktivní', emptying: 'stáčí se' };
const METODY: Readonly<Record<string, string>> = {
  kyselina_dusicna: 'kyselina dusičná', louh: 'louh', oplach_vodou: 'oplach vodou', persteril: 'Persteril', kombinovana: 'kombinovaná',
};

function cislo(v: Cislo): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const litry = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} l`;
const procento = (n: number): string => `${n.toFixed(1).replace('.', ',')} %`;

/** Text ze Sklepu bez znaků, kterými by šla utrhnout značka kolem kontextu, a se sjednocenými mezerami. */
export function cistyText(v: string | null | undefined, max: number): string {
  const t = (v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** ISO den z data (RRRR-MM-DD) nebo z časového razítka (pražský den); jinak null. */
function den(v: string | null | undefined): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? businessDateISO(new Date(t)) : null;
}

const denCz = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}.`;
};
const denCzRok = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
};

function dnuMezi(odISO: string, doISO: string): number {
  const [y1, m1, d1] = odISO.split('-').map(Number);
  const [y2, m2, d2] = doISO.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const pocetDni = (n: number): string => `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;

type PosledniSanitace = { kdy: string | null; metoda: string; method: string; created_at: string };

/** Nejnovější zápis sanitace u každého tanku. */
function nejnovejsiSanitace(zapisy: readonly SanitaceProKontext[]): Map<string, PosledniSanitace> {
  const out = new Map<string, PosledniSanitace>();
  for (const z of zapisy) {
    if (!z.tank_id || !z.method || !z.created_at) continue;
    const t = Date.parse(z.created_at);
    if (!Number.isFinite(t)) continue;
    const dosud = out.get(z.tank_id);
    if (dosud && Date.parse(dosud.created_at) >= t) continue;
    out.set(z.tank_id, { kdy: den(z.created_at), metoda: cistyText(z.method_label, 40) || METODY[z.method] || z.method, method: z.method, created_at: z.created_at });
  }
  return out;
}

const poradiTanku = (a: TankProKontext, b: TankProKontext) => a.label.localeCompare(b.label, 'cs', { numeric: true });

function radekTankuSPivem(t: TankProKontext, dnes: string, san: PosledniSanitace | undefined): string {
  const objem = cislo(t.current_volume_l);
  const kapacita = cislo(t.capacity_l);
  const od = den(t.started_at);
  const dnu = od && od <= dnes ? dnuMezi(od, dnes) : null;
  const poznamka = cistyText(t.note, MAX_POZNAMKA);
  const casti = [
    cistyText(t.current_beer_name, MAX_PIVO) || 'pivo neuvedeno',
    objem !== null ? `${litry(objem)}${kapacita ? ` z ${litry(kapacita)}` : ''}` : kapacita ? `kapacita ${litry(kapacita)}` : null,
    STAV_S_PIVEM[t.status ?? ''],
    od ? `od ${denCz(od)}${dnu !== null ? ` (${pocetDni(dnu)})` : ''}` : null,
    san?.kdy ? `poslední sanitace tanku ${denCz(san.kdy)} (${san.metoda})` : null,
    poznamka ? `poznámka: ${poznamka}` : null,
  ].filter(Boolean);
  return `- ${cistyText(t.label, 40)}: ${casti.join(', ')}`;
}

function popisTankuBezPiva(t: TankProKontext, san: PosledniSanitace | undefined): string {
  const faze = fazeTanku(t, san ? { method: san.method, created_at: san.created_at } : null);
  if (faze) return `${cistyText(t.label, 40)} (${POPIS_FAZE[faze].text}${faze === 'vysanitovany' && san?.kdy ? ` ${denCz(san.kdy)}` : ''})`;
  return `${cistyText(t.label, 40)} (prázdný${san?.kdy ? `, poslední sanitace ${denCz(san.kdy)} — ${san.metoda}` : ''})`;
}

function radekPrecerpani(p: PrevodProKontext, nazvy: ReadonlyMap<string, string>): string | null {
  const kdy = den(p.transfer_date);
  if (!kdy) return null;
  const jmeno = (id: string | null | undefined) => (id ? nazvy.get(id) ?? 'jiný tank' : 'mimo tank');
  const objem = cislo(p.volume_l);
  const ztrata = cislo(p.loss_l);
  const casti = [
    `${jmeno(p.from_tank_id)} → ${jmeno(p.to_tank_id)}`,
    cistyText(p.beer_name, MAX_PIVO) || null,
    objem !== null ? litry(objem) : null,
    ztrata !== null && ztrata > 0 ? `ztráta ${litry(ztrata)}` : null,
  ].filter(Boolean);
  return `- ${denCz(kdy)}: ${casti.join(', ')}`;
}

function radekCyklu(c: CyklusProKontext): string | null {
  const konec = den(c.ended_at);
  if (!konec) return null;
  const pocatek = cislo(c.initial_volume_l);
  const stoceno = cislo(c.kegged_volume_l);
  const ztrata = cislo(c.loss_l);
  const hodin = cislo(c.duration_hours);
  const od = den(c.started_at);
  const dnu = hodin !== null && hodin > 0 ? Math.max(1, Math.round(hodin / 24)) : od ? dnuMezi(od, konec) : null;
  const casti = [
    cistyText(c.beer_name, MAX_PIVO) || null,
    pocatek !== null && stoceno !== null ? `${litry(pocatek)} → stočeno ${litry(stoceno)}` : pocatek !== null ? `na začátku ${litry(pocatek)}` : stoceno !== null ? `stočeno ${litry(stoceno)}` : null,
    ztrata !== null ? `ztráta ${litry(ztrata)}${pocatek ? ` (${procento((ztrata / pocatek) * 100)})` : ''}` : null,
    dnu !== null ? pocetDni(dnu) : null,
    `uzavřeno ${denCz(konec)}`,
  ].filter(Boolean);
  return `- ${cistyText(c.tank_label, 40) || 'tank'}: ${casti.join(', ')}`;
}

/**
 * Stav sklepa jako text pro AI sládka; prázdný řetězec, když Sklep nemá žádné tanky.
 * Nejdřív tanky s pivem, pak tanky bez piva, přečerpání za 14 dní a poslední uzavřené cykly (ztráty);
 * přes strop se zahodí nejdřív cykly, pak přečerpání, nakonec se text zkrátí.
 */
export function textProvozu(v: VstupProvozu): string {
  const tanky = [...v.tanky].sort(poradiTanku);
  if (tanky.length === 0) return '';
  const nazvy = new Map(tanky.map((t) => [t.id, cistyText(t.label, 40)]));
  const sanitace = nejnovejsiSanitace(v.sanitace);

  const sPivem = tanky.filter((t) => STAV_S_PIVEM[t.status ?? '']);
  const bezPiva = tanky.filter((t) => !STAV_S_PIVEM[t.status ?? '']);
  const hlavicka = `Stav sklepa k ${denCzRok(v.dnes)}${v.cas ? ` ${v.cas}` : ''} (údaje provozu z appky Pivovar Zajíc, ne literatura; co tu není, nedomýšlej):`;
  const tankyText = [
    sPivem.length > 0 ? ['Tanky s pivem:', ...sPivem.map((t) => radekTankuSPivem(t, v.dnes, sanitace.get(t.id)))].join('\n') : 'Žádný tank teď nemá pivo.',
    bezPiva.length > 0 ? `Tanky bez piva: ${bezPiva.map((t) => popisTankuBezPiva(t, sanitace.get(t.id))).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const odDne = posunDen(v.dnes, -OKNO_PRECERPANI_DNI);
  const precerpani = [...v.prevody]
    .filter((p) => { const d = den(p.transfer_date); return d !== null && d >= odDne && d <= v.dnes; })
    .sort((a, b) => (den(b.transfer_date) ?? '').localeCompare(den(a.transfer_date) ?? ''))
    .slice(0, MAX_PRECERPANI)
    .map((p) => radekPrecerpani(p, nazvy))
    .filter((r): r is string => r !== null);
  const precerpaniText = precerpani.length > 0 ? [`Přečerpání za posledních ${OKNO_PRECERPANI_DNI} dní:`, ...precerpani].join('\n') : '';

  const cykly = [...v.cykly]
    .sort((a, b) => (den(b.ended_at) ?? '').localeCompare(den(a.ended_at) ?? ''))
    .slice(0, MAX_CYKLU)
    .map(radekCyklu)
    .filter((r): r is string => r !== null);
  const cykluText = cykly.length > 0 ? ['Poslední uzavřené cykly tanků (stočení a ztráty):', ...cykly].join('\n') : '';

  const slozit = (...casti: string[]) => [hlavicka, ...casti].filter(Boolean).join('\n');
  for (const text of [slozit(tankyText, precerpaniText, cykluText), slozit(tankyText, precerpaniText), slozit(tankyText)]) {
    if (text.length <= MAX_ZNAKU_PROVOZU) return text;
  }
  const nejmensi = slozit(tankyText);
  return `${nejmensi.slice(0, MAX_ZNAKU_PROVOZU - 14).trimEnd()}… (zkráceno)`;
}
