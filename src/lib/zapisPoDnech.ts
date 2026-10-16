// 📅 Řádky, které si nesou vlastní den — čtení tabulky z fotky na víc dnů najednou.
// ---------------------------------------------------------------------------
// Majitel 16. 10. 2026: „udělej to pro všechno." Lahve už vkládají všechny dny
// z fotky najednou (každý řádek na svůj den, viz lib/zapisStaceniLahvi.ts).
// Stáčení KEG a Fasování / Prodejna / Odpis vkládaly jeden den: formulář má
// jedno datum a „ostatní dny vlož až po uložení tohoto".
//
// Dlaždicový formulář KEG a výdeje ale nejde zkřížit s řádky z víc dnů — dva
// dny téhož piva a obalu by splynuly v jednu dlaždici a „+/−" by měnilo
// špatný řádek. Proto zůstává formulář jak byl (jedno datum) a řádky z víc dnů
// se drží v samostatném seznamu „Řádky z fotky po dnech", který se ukládá
// společně s formulářem jedním tlačítkem. Tenhle soubor je čistá logika toho
// seznamu: rozdělení řádků, seskupení po dnech a otázky před zápisem.

/** Řádek, který může mít vlastní den (`datum`, RRRR-MM-DD). */
export type RadekSDnem = { datum?: string | null };

/**
 * Den v kalendáři, jinak `null`. Tvar RRRR-MM-DD nestačí: „2026-02-31" by prošlo
 * regulárním výrazem a databáze by zápis odmítla až při ukládání.
 */
export function platnyDen(d: unknown): string | null {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const cas = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(cas.getTime()) || cas.toISOString().slice(0, 10) !== d ? null : d;
}

/** Den, na který se řádek zapíše: vlastní z fotky, jinak výchozí (datum formuláře). */
export function denRadku(datum: string | null | undefined, vychozi: string): string {
  return platnyDen(datum) ?? vychozi;
}

/** Různé dny mezi řádky, které den mají — vzestupně. */
export function dnyRadku(radky: RadekSDnem[]): string[] {
  const dny = radky.map((r) => platnyDen(r.datum)).filter((d): d is string => d !== null);
  return [...new Set(dny)].sort();
}

/**
 * Kam s řádky přečtenými z fotky.
 *
 * Z jednoho dne (nebo bez dne) jdou do formuláře jako dosud — datum formuláře
 * se nastaví na ten den. Z víc dnů se řádky s dnem odloží do seznamu po dnech
 * (`poDnech`); řádky bez dne (ručně přidané v okně) zůstanou formuláři.
 */
export function rozdelPodleDnu<R extends RadekSDnem>(radky: R[]): { formular: R[]; poDnech: R[] } {
  if (dnyRadku(radky).length < 2) return { formular: radky, poDnech: [] };
  return {
    formular: radky.filter((r) => platnyDen(r.datum) === null),
    poDnech: radky.filter((r) => platnyDen(r.datum) !== null),
  };
}

export type SkupinaDne<R> = { den: string; radky: { radek: R; index: number }[] };

/**
 * Řádky po dnech, nejstarší den první, v rámci dne v původním pořadí.
 * `index` je pozice řádku v zadaném poli — podle něj ho seznam mění a maže.
 * Řádek bez platného dne do seznamu nepatří a vynechá se.
 */
export function seskupPoDnech<R extends RadekSDnem>(radky: R[]): SkupinaDne<R>[] {
  const podleDne = new Map<string, SkupinaDne<R>>();
  radky.forEach((radek, index) => {
    const den = platnyDen(radek.datum);
    if (!den) return;
    const skupina = podleDne.get(den) ?? { den, radky: [] };
    skupina.radky.push({ radek, index });
    podleDne.set(den, skupina);
  });
  return [...podleDne.values()].sort((a, b) => a.den.localeCompare(b.den));
}

/** Měsíce (RRRR-MM) zapisovaných dnů, vzestupně a bez opakování. */
export function mesiceDnu(dny: string[]): string[] {
  return [...new Set(dny.map((d) => d.slice(0, 7)))].sort();
}

/**
 * Otázka před zápisem do už napočítaného měsíce (fyzická / schválená
 * inventura). Řádky z fotky mohou padat do víc měsíců — ptá se jednou,
 * s výčtem všech.
 */
export function otazkaUzamcenychMesicu(mesice: string[]): string {
  const jeden = mesice.length === 1;
  return `${jeden ? `Měsíc ${mesice[0]} už má` : `Měsíce ${mesice.join(', ')} už mají`} napočítanou inventuru. Zápis do ${jeden ? 'něj' : 'nich'} teď `
    + `změní ${jeden ? 'číslo, které je už uzavřené' : 'čísla, která jsou už uzavřená'} a dorovnané.\n\nOpravdu zapsat do už napočítaného měsíce?`;
}

/** Co z řádků fotky už v databázi je: den, pivo, obal a kolik kusů. */
export type JizZapsano = { den: string; beerId: string; pkgId: string; ks: number };

type UlozenyRadek = { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: number | string | null };

/**
 * Řádky z fotky, které už jsou zapsané: stejný den, pivo a obal. Po druhém
 * načtení téže fotky by se zapsaly podruhé a sklad by se odečetl (nebo přičetl)
 * dvakrát. Neblokuje — dvě várky téhož piva v jeden den jsou běžné —, jen se
 * na to nahlas upozorní. Hlídají se jen řádky s vlastním dnem (z fotky).
 */
export function jizZapsane(
  radky: (RadekSDnem & { beerId: string; pkgId: string })[],
  ulozene: UlozenyRadek[],
): JizZapsano[] {
  const vysledek = new Map<string, JizZapsano>();
  for (const r of radky) {
    const den = platnyDen(r.datum);
    if (!den) continue;
    const klic = `${den}|${r.beerId}|${r.pkgId}`;
    if (vysledek.has(klic)) continue;
    const ks = ulozene
      .filter((x) => String(x.entry_date ?? '').slice(0, 10) === den && x.beer_id === r.beerId && x.package_id === r.pkgId)
      .reduce((soucet, x) => soucet + (Number.isFinite(Number(x.quantity)) ? Number(x.quantity) : 0), 0);
    if (ks > 0) vysledek.set(klic, { den, beerId: r.beerId, pkgId: r.pkgId, ks });
  }
  return [...vysledek.values()];
}

/**
 * Otázka „nezapisuješ stejnou fotku podruhé?". `kde` je ve tvaru, který se
 * vejde za „už": „ve stáčení KEG", „v prodejně", „v odpisu".
 */
export function otazkaJizZapsano(
  co: JizZapsano[],
  kde: string,
  popisek: (beerId: string, pkgId: string) => string,
): string {
  const radku = co.slice(0, 8).map((x) => `• ${Number(x.den.slice(8, 10))}. ${Number(x.den.slice(5, 7))}. · ${popisek(x.beerId, x.pkgId)} — už zapsáno ${x.ks} ks`);
  const vypis = radku.join('\n') + (co.length > 8 ? `\n• … a dalších ${co.length - 8}` : '');
  return `Tohle už ${kde} je:\n\n${vypis}\n\nŘádky z fotky se přidají k tomu, co už je zapsané. Nezapisuješ stejnou fotku podruhé?`;
}

/** „3 řádky z 2 dnů" — pro hlavičku seznamu a tlačítka. */
export function souhrnDnu(pocetRadku: number, pocetDnu: number): string {
  const radku = `${pocetRadku} ${pocetRadku === 1 ? 'řádek' : pocetRadku >= 2 && pocetRadku <= 4 ? 'řádky' : 'řádků'}`;
  if (pocetDnu < 2) return radku;
  return `${radku} z ${pocetDnu} dnů`;
}
