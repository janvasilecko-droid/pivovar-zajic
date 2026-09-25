// 📷 Z toho, co přečte AI z fotky, na konkrétní pivo a obal z katalogu.
// ---------------------------------------------------------------------------
// Edge funkce `parse-order-image` vrátí položky tak, jak je vidí model:
// `beer_name`, `degree`, `package_label`, `quantity` a `raw_line` (původní
// řádek z fotky). Tenhle soubor z nich udělá řádky s ID z katalogu.
//
// PROČ TO EXISTUJE: fasování (ProdejnaFromImage) do 22. 9. 2026 párování
// nedělalo vůbec — výsledek AI se slil do textu („5x 12° Světlá 0,5 l") a ten
// se znovu rozebíral jednodušším textovým parserem pro zkratky. Dvojí překlad
// = dvojí ztráta: z provozu „dával jsem číst z fotky fasování obchod a četlo
// to špatně". Stáčení KEG mělo vlastní kopii párování přímo v komponentě.
// Tady je to jednou, s testy, pro obojí.
//
// Zásada: nic se nedohaduje na sílu. Když se pivo nebo obal nenajde, vrátí se
// prázdné ID a obsluha ho doplní v kontrole nad fotkou — lepší prázdné pole
// než tiše špatné pivo (to samé pravidlo jako u čtení WhatsAppu).

export type PolozkaZFotky = {
  beer_name?: string | null;
  degree?: string | null;
  package_label?: string | null;
  quantity?: number | string | null;
  raw_line?: string | null;
};

export type KatalogPivo = { id: string; name: string; degree?: string | null };
export type KatalogObal = { id: string; label: string; kind?: string | null; volume_l?: number | string | null };

export type RadekZFotky = { beerId: string; pkgId: string; qty: string };

/** Malá písmena, bez diakritiky, oříznuté — pro porovnávání názvů. */
function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Číslo z textu včetně desetinné čárky („0,5" i „0.5"). */
function cislo(s: string): number {
  return Number(s.replace(',', '.'));
}

/**
 * Pivo z katalogu podle toho, co přečetla AI.
 *
 * Pořadí je schválně takhle: přesné jméno → jméno jako podřetězec (zachytí
 * i sezonní pivo bez stupně, „Summer Ale") → a teprve nakonec holý stupeň.
 * Kdyby stupeň rozhodoval dřív, pivo se stejným stupněm jako jiné by přebilo
 * to správné (dvě dvanáctky, světlá a tmavá).
 */
export function pivoZFotky(polozka: PolozkaZFotky, piva: KatalogPivo[]): KatalogPivo | undefined {
  const jmeno = norm(polozka.beer_name);
  const stupen = norm(polozka.degree);

  if (jmeno) {
    const presne = piva.find((b) => norm(b.name) === jmeno);
    if (presne) return presne;
  }
  if (jmeno) {
    // Delší názvy vyhrávají — „12° Světlá" před „Světlá", když sedí obojí.
    const castecne = piva
      .filter((b) => norm(b.name).includes(jmeno) || jmeno.includes(norm(b.name)))
      .sort((a, z) => norm(z.name).length - norm(a.name).length);
    if (castecne.length) {
      // Když AI dala i stupeň, dáme přednost pivu, které ho má stejné —
      // „světlá" samo o sobě sedí na desítku i dvanáctku.
      if (stupen) {
        const seStupnem = castecne.find((b) => norm(b.degree) === stupen);
        if (seStupnem) return seStupnem;
      }
      return castecne[0];
    }
  }
  if (stupen) {
    const podleStupne = piva.find((b) => b.degree && norm(b.degree) === stupen);
    if (podleStupne) return podleStupne;
  }
  return undefined;
}

/**
 * Obal z katalogu. Nejspolehlivější je OBJEM — popisky se píší po svém
 * („Lahev 0,5l", „0.5 l", „půllitr"), ale číslo sedí.
 *
 * Objem se hledá v pořadí spolehlivosti: číslo s litry („0,5l", „50 l"),
 * číslo za křížkem („6x0,5") a teprve pak holé číslo. Hledá se v popisku
 * obalu od AI i v původním řádku z fotky, a bere se jen takový objem, který
 * v katalogu (po případném zúžení `jenObaly`) doopravdy existuje — jinak by
 * „24" z „24x0,5" udělalo obal o 24 litrech.
 */
export function obalZFotky(
  polozka: PolozkaZFotky,
  obaly: KatalogObal[],
): KatalogObal | undefined {
  if (obaly.length === 0) return undefined;
  const popisek = norm(polozka.package_label);
  const radek = norm(polozka.raw_line);

  if (popisek) {
    const presne = obaly.find((p) => norm(p.label) === popisek);
    if (presne) return presne;
  }

  const objemy = obaly
    .map((p) => Number(p.volume_l))
    .filter((v) => !Number.isNaN(v) && v > 0);
  const sedi = (n: number) => objemy.some((v) => Math.abs(v - n) < 0.01);
  const najdi = (text: string, re: RegExp): number | undefined =>
    [...text.matchAll(re)].map((m) => cislo(m[1])).find((n) => sedi(n));

  for (const text of [popisek, radek]) {
    if (!text) continue;
    const objem =
      najdi(text, /(\d+(?:[.,]\d+)?)\s*l\b/g) ??
      najdi(text, /[x×]\s*(\d+(?:[.,]\d+)?)/g) ??
      najdi(text, /(\d+(?:[.,]\d+)?)/g);
    if (objem != null) {
      const shoda = obaly.find((p) => Math.abs(Number(p.volume_l) - objem) < 0.01);
      if (shoda) return shoda;
    }
  }

  if (popisek) {
    const castecne = obaly.find((p) => norm(p.label).includes(popisek) || popisek.includes(norm(p.label)));
    if (castecne) return castecne;
  }
  return undefined;
}

/** Počet jako text do políčka — záporné a nesmyslné hodnoty se zahodí. */
function pocet(q: PolozkaZFotky['quantity']): string {
  if (q == null || q === '') return '';
  const n = Number(String(q).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n);
}

/**
 * Celá dávka položek z fotky → řádky k zápisu.
 *
 * `jenObaly` zúží katalog obalů na to, co se na dané obrazovce vůbec zapisuje
 * (stáčení KEG jen sudy, stáčení lahví jen lahve/PET) — bez toho by se „30"
 * ze stáčení sudů trefilo do PET 0,3 l.
 */
export function radkyZFotky(
  polozky: PolozkaZFotky[],
  piva: KatalogPivo[],
  obaly: KatalogObal[],
  jenObaly?: (o: KatalogObal) => boolean,
): RadekZFotky[] {
  const vyber = jenObaly ? obaly.filter(jenObaly) : obaly;
  return (polozky ?? []).map((p) => ({
    beerId: pivoZFotky(p, piva)?.id ?? '',
    pkgId: obalZFotky(p, vyber)?.id ?? '',
    qty: pocet(p.quantity),
  }));
}
