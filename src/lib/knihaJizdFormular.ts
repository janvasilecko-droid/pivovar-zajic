// 📝 Kniha jízd — z formuláře (nová jízda, tankování, úprava, smazání) na dávku změn.
// ---------------------------------------------------------------------------
// Čistá logika bez obrazovky a bez databáze: ověří vstup, určí stav tachometru
// (navazuje na poslední jízdu auta), spočítá, které pozdější jízdy se posunou
// (knihaJizdRetez.ts), a složí dávku pro `kniha_jizd_uloz_davku` (knihaJizdDb.ts).
import { mnozne } from './cisla';
import { POZNAMKA_VYGENEROVANO } from './knihaJizd';
import type { DavkaJizd } from './knihaJizdDb';
import {
  type JizdaRetezu,
  type ZmenaTachometru,
  poradiVRade,
  stavTachometruKDatu,
  zmenyPoPridani,
  zmenyPoSmazani,
  zmenyPoUprave,
} from './knihaJizdRetez';

/** Kniha jízd vždy začíná a končí v pivovaru. */
export const HOME_BASE = 'Kynšperk nad Ohří (Pivovar)';

/** Začátek poznámky u vygenerované jízdy, kterou někdo ručně upravil (generátor ji pak nepřepíše). */
export const POZNAMKA_UPRAVENO = 'Upraveno ručně (vygenerováno z objednávek)';

/** Místo tankování, když člověk žádné nenapíše. */
export const TANKOVANI_VYCHOZI_MISTO = 'Čerpací stanice';

/** Jízda v Knize jízd tak, jak ji zná obrazovka. */
export type ZaznamJizdy = JizdaRetezu & {
  vehicle_id?: string;
  driver: string;
  route_from: string;
  route_to: string;
  purpose: string;
  km_dorovnani?: number | null;
  fuel_liters?: number;
  note?: string;
};

/** Tankování = záznam bez ujetých km s načerpanými litry. */
export const jeTankovaniZaznam = (j: Pick<ZaznamJizdy, 'km_driven' | 'fuel_liters'>): boolean =>
  (Number(j.km_driven) || 0) === 0 && (Number(j.fuel_liters) || 0) > 0;

/** Trasa vždy končí v pivovaru — doplní se, pokud ji někdo nenapíše. */
export function dokonciTrasuDomu(kam: string): string {
  const r = kam.trim() || 'Okruh po odběratelích';
  return /kynšperk/i.test(r) ? r : `${r} → Kynšperk nad Ohří`;
}

const des = (km: number) => Math.round((Number(km) || 0) * 10);
const zDes = (d: number) => d / 10;
const mesicZaznamu = (j: Pick<ZaznamJizdy, 'date'>) => j.date.slice(0, 7);
const KM_FORMAT = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const km = (x: number) => KM_FORMAT.format(x);

/** Z `jizdy` jako `Set` klíčů „auto|měsíc“ uzavřených měsíců (z tabulky uzavření). */
export const klicMesice = (vozidlo: string, mesic: string) => `${vozidlo}|${mesic}`;

export type VstupFormulare = {
  rezim: 'jizda' | 'tankovani';
  /** Pro novou jízdu id, které se jí dá (kvůli pořadí i dávce se zná předem). */
  id: string;
  datum: string;
  vozidlo: string;
  ridic: string;
  /** Jízda: kam / trasa. Tankování: místo (nepovinné). */
  kam: string;
  ucel: string;
  /** Ujeté km (jízda); u tankování se nebere. */
  ujeto: number;
  /** Načerpané litry (u tankování povinné). */
  litry?: number | null;
  /** Hodnota políčka „stav tachometru na začátku“. */
  zacatek: number | null;
  /** Člověk políčko ručně přepsal — pak má přednost před navázáním na poslední jízdu. */
  zacatekRucne: boolean;
  poznamka: string;
  /** Čas zápisu nové jízdy (ISO) — rozhoduje o pořadí dvou záznamů se stejným stavem. */
  vytvoreno: string;
};

export type PlanZapisu =
  | {
      ok: true;
      zaznam: ZaznamJizdy;
      /** Změny stavu tachometru OSTATNÍCH jízd. */
      zmeny: ZmenaTachometru[];
      /** O kolik km se posunou pozdější jízdy a kolik jich je (kvůli upozornění ve formuláři). */
      posunKm: number;
      pocetPosunutych: number;
      /** Odkud jízda vyjíždí — z návaznosti, nebo ručně. */
      zdrojZacatku: 'navazuje' | 'rucne' | 'puvodni';
      /** Úprava přesunula jízdu na jiné auto nebo den (srovnávají se dvě řady, ne jedna). */
      presunuto: boolean;
    }
  | { ok: false; chyba: string };

export type UzavreneMesice = ReadonlySet<string>;

function zkontroluj(v: VstupFormulare): string | null {
  if (!v.datum || !/^\d{4}-\d{2}-\d{2}$/.test(v.datum)) return 'Vyplň datum.';
  if (!v.vozidlo.trim()) return 'Vyber vozidlo.';
  if (!v.ridic.trim()) return 'Vyplň řidiče.';
  if (v.rezim === 'jizda') {
    if (!v.kam.trim()) return 'Vyplň, kam se jelo.';
    if (!v.ucel.trim()) return 'Vyplň účel jízdy.';
    if (!Number.isFinite(v.ujeto) || v.ujeto <= 0) return 'Ujeté km musí být víc než nula.';
  } else if (!Number.isFinite(v.litry ?? NaN) || (v.litry ?? 0) <= 0) {
    return 'Vyplň, kolik litrů se natankovalo.';
  }
  if (v.litry != null && (!Number.isFinite(v.litry) || v.litry < 0)) return 'Litry nemůžou být záporné.';
  return null;
}

function zaznamZVstupu(v: VstupFormulare, zacatekDes: number, zpet?: ZaznamJizdy): ZaznamJizdy {
  const tankovani = v.rezim === 'tankovani';
  const ujetoDes = tankovani ? 0 : des(v.ujeto);
  // Co člověk nezměnil, zůstane přesně jak bylo (i s mezerami, i s trasou, ke které appka sama
  // nepřidala návrat do pivovaru) — úprava se nesmí dotknout toho, na co nesáhl.
  const kamBeze = v.kam.trim();
  const routeTo = tankovani
    ? (kamBeze || TANKOVANI_VYCHOZI_MISTO)
    : zpet && kamBeze === zpet.route_to.trim() ? zpet.route_to : dokonciTrasuDomu(v.kam);
  const ucel = v.ucel.trim();
  const poznamka = v.poznamka.trim();
  return {
    ...(zpet ?? {}),
    id: v.id,
    date: v.datum,
    vehicle_name: v.vozidlo.trim(),
    driver: v.ridic.trim(),
    route_from: tankovani ? 'Tankování' : (zpet?.route_from ?? HOME_BASE),
    route_to: routeTo,
    purpose: tankovani ? 'Tankování' : zpet && ucel === zpet.purpose.trim() ? zpet.purpose : ucel,
    km_start: zDes(zacatekDes),
    km_end: zDes(zacatekDes + ujetoDes),
    km_driven: zDes(ujetoDes),
    km_trasa: zDes(ujetoDes),
    km_dorovnani: 0,
    fuel_liters: v.litry != null && v.litry > 0 ? v.litry : undefined,
    note: zpet && poznamka === (zpet.note ?? '').trim() ? zpet.note : poznamka || undefined,
    created_at: zpet?.created_at ?? v.vytvoreno,
  };
}

function popisMesice(mesic: string): string {
  const [r, m] = mesic.split('-');
  return `${Number(m)}. ${r}`;
}

/** Plán zápisu NOVÉ jízdy nebo tankování. */
export function planNoveJizdy(v: VstupFormulare, jizdy: ZaznamJizdy[], uzavrene: UzavreneMesice): PlanZapisu {
  const chyba = zkontroluj(v);
  if (chyba) return { ok: false, chyba };
  const mesic = v.datum.slice(0, 7);
  if (uzavrene.has(klicMesice(v.vozidlo.trim(), mesic))) {
    return { ok: false, chyba: `Měsíc ${popisMesice(mesic)} auta ${v.vozidlo.trim()} je uzavřený — jízdu do něj nejde přidat. Nejdřív ho otevři.` };
  }

  const navazuje = stavTachometruKDatu(jizdy, v.vozidlo.trim(), v.datum);
  let zacatek: number;
  let zdroj: 'navazuje' | 'rucne';
  if (v.zacatekRucne && v.zacatek != null && Number.isFinite(v.zacatek)) {
    zacatek = v.zacatek;
    zdroj = 'rucne';
  } else if (navazuje != null) {
    zacatek = navazuje;
    zdroj = 'navazuje';
  } else if (v.zacatek != null && Number.isFinite(v.zacatek)) {
    zacatek = v.zacatek;
    zdroj = 'rucne';
  } else {
    return { ok: false, chyba: 'Tohle auto zatím nemá žádnou jízdu — zadej stav tachometru na začátku.' };
  }
  if (zacatek < 0) return { ok: false, chyba: 'Stav tachometru nemůže být záporný.' };

  const zaznam = zaznamZVstupu(v, des(zacatek));
  const zmeny = zmenyPoPridani(jizdy, zaznam);
  return {
    ok: true,
    zaznam,
    zmeny,
    posunKm: zDes(des(zaznam.km_end) - des(zaznam.km_start)),
    pocetPosunutych: zmeny.length,
    zdrojZacatku: zdroj,
    presunuto: false,
  };
}

/** Plán ÚPRAVY existující jízdy nebo tankování (`puvodni` je podoba před úpravou). */
export function planUpravy(v: VstupFormulare, puvodni: ZaznamJizdy, jizdy: ZaznamJizdy[], uzavrene: UzavreneMesice): PlanZapisu {
  if (puvodni.uzavreno_at) return { ok: false, chyba: 'Jízda je v uzavřeném měsíci — nejdřív měsíc otevři.' };
  const chyba = zkontroluj(v);
  if (chyba) return { ok: false, chyba };
  const mesic = v.datum.slice(0, 7);
  const premisteno = puvodni.vehicle_name !== v.vozidlo.trim() || puvodni.date !== v.datum;
  if (premisteno && uzavrene.has(klicMesice(v.vozidlo.trim(), mesic))) {
    return { ok: false, chyba: `Měsíc ${popisMesice(mesic)} auta ${v.vozidlo.trim()} je uzavřený — jízdu do něj nejde přesunout.` };
  }

  // Začátek: zůstává-li jízda na místě, má svůj; jinak ho dopočítá zmenyPoUprave podle nového místa
  // (nezná-li ho, vezme zadaný).
  const zacatek = v.zacatek != null && Number.isFinite(v.zacatek) ? v.zacatek : puvodni.km_start;
  if (zacatek < 0) return { ok: false, chyba: 'Stav tachometru nemůže být záporný.' };
  const upravena = zaznamZVstupu(v, des(zacatek), puvodni);

  // Pokud se ujeté km nezměnily, zůstanou původní (včetně případného dorovnání po uzávěrce).
  const kmZmenena = des(upravena.km_driven) !== des(puvodni.km_driven);
  if (!kmZmenena) {
    upravena.km_trasa = puvodni.km_trasa ?? undefined;
    upravena.km_dorovnani = puvodni.km_dorovnani ?? 0;
  }
  // Vygenerovaná jízda, na kterou člověk sáhl, se už při dalším generování nepřepíše.
  const poznamka = upravena.note ?? '';
  if (poznamka.startsWith(POZNAMKA_VYGENEROVANO)) {
    upravena.note = `${POZNAMKA_UPRAVENO}${poznamka.slice(POZNAMKA_VYGENEROVANO.length)}`;
  }

  const vysledek = zmenyPoUprave(jizdy, upravena);
  const zaznam: ZaznamJizdy = { ...upravena, km_start: vysledek.jizda.km_start, km_end: vysledek.jizda.km_end };
  return {
    ok: true,
    zaznam,
    zmeny: vysledek.zmeny,
    posunKm: zDes(des(zaznam.km_end) - des(puvodni.km_end)),
    pocetPosunutych: vysledek.zmeny.length,
    zdrojZacatku: 'puvodni',
    presunuto: premisteno,
  };
}

// ---------------------------------------------------------------------------
// Dávky pro databázi
// ---------------------------------------------------------------------------

type Sloupce = NonNullable<DavkaJizd['vlozit']>[number];

/** Úplný řádek pro vložení. */
export function radekProVlozeni(z: ZaznamJizdy): Sloupce {
  return {
    id: z.id,
    entry_date: z.date,
    vehicle_id: z.vehicle_id ?? null,
    vehicle_name: z.vehicle_name,
    driver: z.driver,
    route_from: z.route_from,
    route_to: z.route_to,
    purpose: z.purpose,
    km_start: z.km_start,
    km_end: z.km_end,
    km_driven: z.km_driven,
    km_trasa: z.km_trasa ?? null,
    km_dorovnani: Number(z.km_dorovnani) || 0,
    fuel_liters: z.fuel_liters ?? null,
    note: z.note ?? null,
  };
}

const posunuteJizdy = (zmeny: ZmenaTachometru[]): NonNullable<DavkaJizd['upravit']> =>
  zmeny.map((z) => ({ id: z.id, km_start: z.km_start, km_end: z.km_end }));

/** Dávka pro přidání jízdy: vložit novou, posunout pozdější. */
export function davkaPridani(plan: Extract<PlanZapisu, { ok: true }>): DavkaJizd {
  return { vlozit: [radekProVlozeni(plan.zaznam)], upravit: posunuteJizdy(plan.zmeny) };
}

/** Dávka pro úpravu: z upravené jízdy jen sloupce, které se opravdu změnily, a posun pozdějších. */
export function davkaUpravy(puvodni: ZaznamJizdy, plan: Extract<PlanZapisu, { ok: true }>): DavkaJizd {
  const nova = radekProVlozeni(plan.zaznam);
  const stara = radekProVlozeni(puvodni);
  const patch: Record<string, unknown> = {};
  for (const [klic, hodnota] of Object.entries(nova)) {
    if (klic === 'id') continue;
    const puvodniHodnota = (stara as Record<string, unknown>)[klic];
    const stejne = typeof hodnota === 'number' && typeof puvodniHodnota === 'number'
      ? des(hodnota) === des(puvodniHodnota)
      : hodnota === puvodniHodnota;
    if (!stejne) patch[klic] = hodnota;
  }
  const upravit: NonNullable<DavkaJizd['upravit']> = [];
  if (Object.keys(patch).length > 0) upravit.push({ id: puvodni.id, ...patch });
  upravit.push(...posunuteJizdy(plan.zmeny));
  return { upravit };
}

/** Dávka pro smazání: smazat jízdu, vrátit pozdější o její rozsah. */
export function davkaSmazani(jizdy: ZaznamJizdy[], id: string): DavkaJizd | null {
  const j = jizdy.find((x) => x.id === id);
  if (!j || j.uzavreno_at) return null;
  return { smazat: [id], upravit: posunuteJizdy(zmenyPoSmazani(jizdy, id)) };
}

/** Pozdější jízdy stejného auta a měsíce — pro upozornění „smazáním se posune N jízd“. */
export function kolikPosunuteSmazanim(jizdy: ZaznamJizdy[], id: string): { pocet: number; km: number } {
  const j = jizdy.find((x) => x.id === id);
  if (!j) return { pocet: 0, km: 0 };
  const zmeny = zmenyPoSmazani(jizdy, id);
  return { pocet: zmeny.length, km: zDes(des(j.km_end) - des(j.km_start)) };
}

/** Popis, co se po uložení stane s tachometrem, do formuláře (prázdný, když se nic neposouvá). */
export function popisPosunu(plan: Extract<PlanZapisu, { ok: true }>): string {
  if (plan.pocetPosunutych === 0) return '';
  const jizd = mnozne(plan.pocetPosunutych, ['další jízdy', 'dalších jízd', 'dalších jízd']);
  if (plan.presunuto) return `Jízda se přesouvá — tachometr ${jizd} (v původním i novém měsíci) se srovná.`;
  if (plan.posunKm === 0) return '';
  const znamenko = plan.posunKm > 0 ? '+' : '−';
  return `Tachometr ${jizd} tohoto auta v měsíci se posune o ${znamenko}${km(Math.abs(plan.posunKm))} km.`;
}

/** Jízdy auta v daném měsíci (pro uzávěrku), seřazené. */
export function jizdyAutaVMesici<T extends JizdaRetezu>(jizdy: T[], vozidlo: string, mesic: string): T[] {
  return poradiVRade(jizdy.filter((j) => j.vehicle_name === vozidlo && mesicZaznamu(j) === mesic));
}
