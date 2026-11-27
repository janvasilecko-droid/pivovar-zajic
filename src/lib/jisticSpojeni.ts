// 🔌 Jistič spojení — když server neodpovídá, nečekat na něj u každého dalšího dotazu znovu.
// ---------------------------------------------------------------------------
// Slabý signál ve sklepě: telefon hlásí „online", ale dotaz na server nedostane odpověď ani chybu. Každý
// dotaz si odčeká svůj limit (10–25 vteřin, fetchWithTimeout v supabase.ts) a teprve potom appka sáhne do
// paměti telefonu. Obrazovka, která se ptá postupně (číselníky → pohyby → dopočty), tak čeká dvakrát třikrát
// za sebou — data, která má telefon po ruce hned, se ukážou za minutu, nebo vůbec (zkouška 27. 11. 2026:
// Plocha za 34 s, Sklad a Objednávky ani za 70 s).
//
// Jistič si pamatuje, že server před chvílí neodpověděl. Podle toho radí čtení, jak dlouho na síť čekat:
//  • o výpadku nevíme → jako vždy (celý limit);
//  • výpadek je čerstvý (posledních pár vteřin) → nečekat: co telefon umí z paměti, dá hned;
//  • výpadek je starší (appka byla chvíli zavřená nebo schovaná) → zkusit síť, ale jen krátce; bez odpovědi
//    zase paměť.
// Dokud výpadek trvá, ptá se jistič serveru sám lehkým dotazem („sonda"): každých pár vteřin, když je appka
// vidět, a hned při každém čtení z paměti. Jakmile server na cokoli odpoví, jistič sepne zpět a appka dostane
// zprávu „spojení je zpátky" (obrazovky se přenačtou, fronta zápisů odejde) — bez čekání, až na obrazovku
// někdo sáhne.
//
// Dotazy, na které už nikdo nečeká (odpovědělo se z paměti), se ruší: zaseknutý dotaz drží spojení a prohlížeč
// jich má na jeden server jen pár — sonda i zápisy by za nimi stály ve frontě.
//
// Co jistič NEDĚLÁ:
//  • nehádá — čtení, na které telefon z paměti odpovědět neumí, čeká na síť jako dřív;
//  • nesahá na zápisy — ty zkoušejí síť vždycky a při neúspěchu jdou do fronty jako dřív;
//  • nereaguje na RYCHLÁ selhání (telefon ví, že je offline; server odmítl spojení) — tam se nečeká, není co
//    zkracovat, a po návratu signálu jde první dotaz rovnou na server.
//
// Modul síť nezná (jen stav a časy; dotaz sondy mu nastaví supabase.ts), ať se dá celý vyzkoušet bez ní.
import { nacti, smaz, uloz } from './uloziste';

/** Událost okna: server zase odpovídá (po výpadku, o kterém telefon sám nevěděl). */
export const UDALOST_SPOJENI_ZPET = 'pivovar:spojeni-zpet';
/** Nejkratší odstup dvou zpráv „spojení je zpátky" — na kolísavém signálu se obrazovky nesmí přenačítat dokola. */
export const ODSTUP_ZPRAV_O_NAVRATU_MS = 15_000;
/** Selhání, které přišlo dřív než za tuhle dobu, je „rychlé" — nečekalo se, jistič si ho nevšímá. */
export const POMALE_SELHANI_MS = 2_000;
/** Jak dlouho po posledním dokladu, že server neodpovídá, se čte rovnou z paměti (bez čekání na síť). */
export const CERSTVY_VYPADEK_MS = 20_000;
/** Starší výpadek: na síť se čeká jen takhle dlouho (telefon po chvíli klidu potřebuje spojení probudit). */
export const KRATKE_CEKANI_MS = 4_000;
/**
 * Nejkratší odstup dvou sond. Sonda umí viset na mrtvém spojení až do svého limitu — další se proto pouští
 * dřív, ať se návrat serveru pozná do pár vteřin.
 */
export const ODSTUP_SOND_MS = 4_000;
/** Jak často se jistič při výpadku ptá serveru sám (appka je vidět, nikdo na nic nesahá). */
export const TIK_SOND_MS = 5_000;
/**
 * Doklad výpadku přežije i nové spuštění appky (Android ji na pozadí často zavře) — ale jen takhle dlouho.
 * Bez toho by každé spuštění ve sklepě čekalo znovu celý limit, než si appka všimne, že server neodpovídá.
 */
export const PLATNOST_ULOZENEHO_VYPADKU_MS = 10 * 60_000;
export const KLIC_VYPADKU = 'pivovar_jistic_spojeni_v1';
/** Jak často nejvýš se doklad přepisuje do úložiště (při výpadku chodí doklady po desítkách). */
const ODSTUP_UKLADANI_MS = 5_000;

/** Od kdy server neodpovídá; null = o výpadku nevíme. */
let vypadekOd: number | null = null;
/** Poslední doklad, že server neodpovídá (vypršený dotaz, ticho po krátkém čekání). */
let posledniDoklad = 0;
/** Kdy server naposledy odpověděl — selhání dotazu, který vyrazil dřív, už nic neznamená. */
let posledniOdpoved = 0;
let posledniZprava = 0;
let casovacZpravy: ReturnType<typeof setTimeout> | null = null;
let posledniSonda = 0;
const casovaceSond = new Set<ReturnType<typeof setTimeout>>();
/** Lehký dotaz, kterým se jistič ptá serveru sám (nastavuje supabase.ts — tenhle modul síť nezná). */
let vlastniSonda: (() => Promise<unknown>) | null = null;
let smycka: ReturnType<typeof setInterval> | null = null;
const cekajici = new Set<() => void>();

let ulozenyDoklad = 0;

const telefonViZeJeOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function ulozDoklad(ted: number): void {
  if (ted - ulozenyDoklad < ODSTUP_UKLADANI_MS) return;
  ulozenyDoklad = ted;
  uloz(KLIC_VYPADKU, String(ted));      // bez úložiště si to appka pamatuje jen do zavření
}

function smazUlozenyDoklad(): void {
  ulozenyDoklad = 0;
  smaz(KLIC_VYPADKU);
}

/**
 * Po spuštění appky: naváže na výpadek, který platil těsně před zavřením. Starý doklad (nebo z „budoucnosti" —
 * přeřízené hodiny) se zahodí.
 */
export function nactiUlozenyVypadek(ted: number = Date.now()): void {
  const text = nacti(KLIC_VYPADKU);
  if (text === null) return;
  const v = Number(text);
  if (!Number.isFinite(v) || v <= 0 || v > ted || ted - v > PLATNOST_ULOZENEHO_VYPADKU_MS) { smazUlozenyDoklad(); return; }
  vypadekOd = v;
  posledniDoklad = v;
  ulozenyDoklad = v;
}

function probudCekajici(): void {
  const probudit = Array.from(cekajici);
  cekajici.clear();
  probudit.forEach((fn) => { try { fn(); } catch { /* čekající dotaz nesmí shodit ohlášení */ } });
}

const jeSchovana = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function spustSmycku(): void {
  if (smycka || !vlastniSonda || typeof window === 'undefined') return;
  smycka = setInterval(() => {
    if (vypadekOd === null) { zastavSmycku(); return; }
    // Schovaná appka ani telefon bez sítě se neptá — zeptá se první čtení po návratu.
    if (jeSchovana() || telefonViZeJeOffline()) return;
    pustSondu();
  }, TIK_SOND_MS);
}

function zastavSmycku(): void {
  if (smycka) { clearInterval(smycka); smycka = null; }
}

/**
 * Čím se má jistič ptát serveru sám, dokud výpadek trvá: lehký dotaz, který výsledek ohlásí
 * (ohlasOdpovedServeru / ohlasSelhaniSite). Nastavuje supabase.ts hned po startu.
 */
export function nastavSonduSpojeni(dotaz: (() => Promise<unknown>) | null): void {
  vlastniSonda = dotaz;
  if (!dotaz) zastavSmycku();
  else if (vypadekOd !== null) spustSmycku();
}

function dokladVypadku(ted: number): void {
  posledniDoklad = ted;
  ulozDoklad(ted);
  if (vypadekOd === null) {
    vypadekOd = ted;
    if (casovacZpravy) { clearTimeout(casovacZpravy); casovacZpravy = null; }
    spustSmycku();
  }
  // Dotazy, které právě čekají na síť, se dozvědí, že nemá cenu čekat dál.
  probudCekajici();
}

/**
 * Jak dlouho má čtení čekat na síť, než vezme odpověď z paměti telefonu:
 * `null` = jako vždy (o výpadku nevíme), `0` = nečekat vůbec, jinak počet milisekund.
 */
export function cekaniNaSit(ted: number = Date.now()): number | null {
  if (vypadekOd === null) return null;
  return ted - posledniDoklad <= CERSTVY_VYPADEK_MS ? 0 : KRATKE_CEKANI_MS;
}

/** Je výpadek čerstvý — tedy nemá cenu se o server teď ani pokoušet? (Přihlášení: lib/relaceOffline.ts.) */
export function vypadekCerstvy(ted: number = Date.now()): boolean {
  return cekaniNaSit(ted) === 0;
}

/**
 * Dotaz na server selhal sítí nebo vypršel. `zahajeno` = kdy dotaz vyrazil:
 *  • selhal hned (telefon je offline, server odmítl spojení) → nečekalo se, jistič si nevšímá;
 *  • vyrazil ještě před poslední odpovědí serveru → visel na starém spojení, o dnešku nic neříká.
 */
export function ohlasSelhaniSite(zahajeno: number, ted: number = Date.now()): void {
  if (telefonViZeJeOffline()) return;
  if (ted - zahajeno < POMALE_SELHANI_MS) return;
  if (zahajeno < posledniOdpoved) return;
  dokladVypadku(ted);
}

/**
 * Při známém výpadku se na síť čekalo krátce (`KRATKE_CEKANI_MS`) a nepřišlo nic — výpadek trvá.
 * Bez známého výpadku nic neznamená (pomalejší odpověď není výpadek).
 */
export function ohlasTicho(ted: number = Date.now()): void {
  if (vypadekOd === null || telefonViZeJeOffline()) return;
  dokladVypadku(ted);
}

/** Server odpověděl — jakkoli, i chybou: jde jen o to, že je na dosah. */
export function ohlasOdpovedServeru(ted: number = Date.now()): void {
  posledniOdpoved = ted;
  if (vypadekOd === null) return;
  vypadekOd = null;
  zastavSmycku();
  smazUlozenyDoklad();
  naplanujZpravuONavratu(ted);
}

function naplanujZpravuONavratu(ted: number): void {
  if (casovacZpravy || typeof window === 'undefined') return;
  const za = Math.max(0, posledniZprava + ODSTUP_ZPRAV_O_NAVRATU_MS - ted);
  // Kdyby spojení mezitím zase spadlo, časovač se ruší (dokladVypadku) — není co hlásit.
  casovacZpravy = setTimeout(() => {
    casovacZpravy = null;
    posledniZprava = Date.now();
    try { window.dispatchEvent(new Event(UDALOST_SPOJENI_ZPET)); } catch { /* starý prohlížeč bez konstruktoru Event */ }
  }, za);
}

/**
 * Pro dotaz, který právě čeká na síť: `slib` se splní, jakmile přijde NOVÝ doklad, že server neodpovídá (jiný
 * dotaz vypršel). Kdo se sítě dočká dřív, zavolá `zrus`, ať tu po něm nic nezůstane.
 */
export function cekejNaDokladVypadku(): { slib: Promise<void>; zrus: () => void } {
  let probud: () => void = () => {};
  const slib = new Promise<void>((hotovo) => { probud = hotovo; });
  cekajici.add(probud);
  return { slib, zrus: () => { cekajici.delete(probud); } };
}

/**
 * Pustí sondu — lehký dotaz na server (`nastavSonduSpojeni`), jehož jediný smysl je zjistit, jestli server
 * odpovídá. Sondy se pouštějí s odstupem (`ODSTUP_SOND_MS`); výsledek hlásí sám dotaz (ohlasOdpovedServeru /
 * ohlasSelhaniSite). Sonda, na kterou do `KRATKE_CEKANI_MS` nepřišlo nic, je sama dokladem, že výpadek trvá —
 * dokud se tedy někdo ptá, čte se z paměti bez čekání. Vrací, jestli se sonda pustila.
 */
export function pustSondu(ted: number = Date.now()): boolean {
  if (!vlastniSonda) return false;
  if (posledniSonda && ted - posledniSonda < ODSTUP_SOND_MS) return false;
  posledniSonda = ted;
  const casovac = setTimeout(() => {
    casovaceSond.delete(casovac);
    if (vypadekOd !== null && posledniOdpoved < ted && !telefonViZeJeOffline()) dokladVypadku(Date.now());
  }, KRATKE_CEKANI_MS);
  casovaceSond.add(casovac);
  try {
    vlastniSonda().catch(() => undefined);
  } catch { /* dotaz se ani nepustil — doklad dá časovač, nebo další sonda */ }
  return true;
}

/** Telefon ohlásil návrat signálu (`online`): začít s čistým štítem, první dotazy jdou rovnou na server. */
export function zapomenVypadek(): void {
  vypadekOd = null;
  posledniDoklad = 0;
  zastavSmycku();
  smazUlozenyDoklad();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', zapomenVypadek);
  nactiUlozenyVypadek();
}

/** Jen pro testy. `ponechSondu` nechá nastavený vlastní dotaz (zkoušky celé cesty přes supabase.ts). */
export function vynulujJisticProTesty(ponechSondu = false): void {
  const sonda = ponechSondu ? vlastniSonda : null;
  vypadekOd = null;
  posledniDoklad = 0;
  posledniOdpoved = 0;
  posledniZprava = 0;
  posledniSonda = 0;
  vlastniSonda = sonda;
  zastavSmycku();
  casovaceSond.forEach((c) => clearTimeout(c));
  casovaceSond.clear();
  cekajici.clear();
  smazUlozenyDoklad();
  if (casovacZpravy) { clearTimeout(casovacZpravy); casovacZpravy = null; }
}
