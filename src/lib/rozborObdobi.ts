// 🔎 Rozbor za týden NEBO měsíc, a za jednoho odběratele.
// ---------------------------------------------------------------------------
// Z provozu 15. 10. 2026: „ten rozbor udělej i měsíční s tím, že si tam můžu
// vyfiltrovat i odběratele." Týdenní Rozbor (lib/rozbor.ts) bere objednané
// kusy z plánu stáčení — ten se počítá jen pro jeden týden a pro všechny
// odběratele dohromady. Tady jsou objednané kusy spočítané přímo z objednávek,
// takže jdou za libovolné období i za jednoho odběratele; samotné skládání
// řádků (stočeno, sklad, řazení) je pořád `radkyRozboru`.
//
// U jednoho odběratele se neukazuje stočeno, sklad ani „stočit": pivo se stáčí
// do zásoby, ne pro odběratele, takže „stočeno pro Restauraci" neexistuje.
//
// Objednávka patří do období podle data dovozu, a když chybí, podle data
// zadání — stejně jako v plánu stáčení (lib/keggingPlan.ts). Stornované se
// nepočítají.
import { jeSud } from './inventoryFix';
import { denObjednavky, normJmeno } from './duplicityObjednavek';
import { radkyRozboru, type PolozkaPlanuRozboru, type RadekRozboru, type StoceniRozboru } from './rozbor';
import type { Movement } from './stockLedger';

export type ObjednavkaRozboru = {
  id: string;
  status?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  place_name?: string | null;
};

export type PolozkaObjednavkyRozboru = {
  order_id: string;
  beer_id?: string | null;
  package_id?: string | null;
  quantity?: number | string | null;
};

/** Klíč objednávek bez jména odběratele. */
export const BEZ_ODBERATELE = '__bez_odberatele__';

/** Název pro objednávky bez jména odběratele. */
export const NAZEV_BEZ_ODBERATELE = 'Bez odběratele';

/**
 * Klíč odběratele pro filtr: jméno bez diakritiky, velkých písmen a nadbytečných
 * mezer — „Restaurace" a „restaurace " jsou jeden odběratel.
 */
export const klicOdberatele = (jmeno?: string | null): string => normJmeno(jmeno) || BEZ_ODBERATELE;

const cislo = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Nestornované objednávky, které patří do období (včetně obou krajních dnů). */
export function objednavkyObdobi<T extends ObjednavkaRozboru>(objednavky: T[], od: string, doDne: string): T[] {
  return objednavky.filter((o) => {
    if (o.status === 'storno') return false;
    const den = String(denObjednavky(o) ?? '').slice(0, 10);
    return den !== '' && den >= od && den <= doDne;
  });
}

export type OdberatelRozboru = { klic: string; jmeno: string; objednavek: number };

/**
 * Odběratelé, kteří mají v období objednávku — nabídka filtru. Jméno se bere
 * z toho zápisu, který se v období použil nejčastěji (shoda → abecedně první).
 * Seřazeno abecedně, „Bez odběratele" na konci.
 */
export function odberateleObdobi(objednavky: ObjednavkaRozboru[], od: string, doDne: string): OdberatelRozboru[] {
  const skupiny = new Map<string, Map<string, number>>();
  for (const o of objednavkyObdobi(objednavky, od, doDne)) {
    const klic = klicOdberatele(o.place_name);
    const zapis = (o.place_name ?? '').trim();
    const zapisy = skupiny.get(klic) ?? new Map<string, number>();
    zapisy.set(zapis, (zapisy.get(zapis) ?? 0) + 1);
    skupiny.set(klic, zapisy);
  }
  const out: OdberatelRozboru[] = [];
  for (const [klic, zapisy] of skupiny) {
    const nejcastejsi = [...zapisy].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs'))[0][0];
    out.push({
      klic,
      jmeno: klic === BEZ_ODBERATELE ? NAZEV_BEZ_ODBERATELE : nejcastejsi,
      objednavek: [...zapisy.values()].reduce((s, n) => s + n, 0),
    });
  }
  return out.sort((a, b) =>
    Number(a.klic === BEZ_ODBERATELE) - Number(b.klic === BEZ_ODBERATELE)
    || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/**
 * Řádky Rozboru za období z objednávek. `odberatel` = klíč z `klicOdberatele`
 * (null = všichni). Stočeno z KEG/lahví se přidá jen bez odběratele, sklad jen
 * když volající zásobu předá (má smysl jen u období, ve kterém je dnešek).
 */
export function radkyRozboruObdobi(p: {
  objednavky: ObjednavkaRozboru[];
  polozky: PolozkaObjednavkyRozboru[];
  kegging: StoceniRozboru[];
  bottling: StoceniRozboru[];
  fasovani?: StoceniRozboru[];
  prodejna?: StoceniRozboru[];
  od: string;
  doDne: string;
  odberatel: string | null;
  piva: { id: string; name: string }[];
  obaly: { id: string; label: string; kind?: string | null }[];
  zasoba?: Map<string, number>;
  pohyby?: Movement[];
}): { radky: RadekRozboru[]; objednavek: number } {
  const platne = objednavkyObdobi(p.objednavky, p.od, p.doDne)
    .filter((o) => p.odberatel === null || klicOdberatele(o.place_name) === p.odberatel);
  const ids = new Set(platne.map((o) => o.id));

  const objednano = new Map<string, number>();
  for (const it of p.polozky) {
    if (!ids.has(it.order_id) || !it.beer_id || !it.package_id) continue;
    const kusu = cislo(it.quantity);
    if (kusu <= 0) continue;
    const klic = `${it.beer_id}__${it.package_id}`;
    objednano.set(klic, (objednano.get(klic) ?? 0) + kusu);
  }

  const obalPodleId = new Map(p.obaly.map((o) => [o.id, o]));
  const jmenoPiva = new Map(p.piva.map((b) => [b.id, b.name]));
  const plan = (sudy: boolean): PolozkaPlanuRozboru[] => [...objednano].flatMap(([klic, ordered]) => {
    const [beerId, pkgId] = klic.split('__');
    const obal = obalPodleId.get(pkgId);
    if (jeSud(obal?.kind, obal?.label) !== sudy) return [];
    return [{
      key: klic, beer_id: beerId, beer_name: jmenoPiva.get(beerId) ?? '',
      package_id: pkgId, package_label: obal?.label ?? '', ordered, missing: 0,
    }];
  });

  const vsichni = p.odberatel === null;
  return {
    radky: radkyRozboru({
      planSudy: plan(true),
      planLahve: plan(false),
      kegging: vsichni ? p.kegging : [],
      bottling: vsichni ? p.bottling : [],
      fasovani: vsichni ? p.fasovani : [],
      prodejna: vsichni ? p.prodejna : [],
      od: p.od,
      doDne: p.doDne,
      zasoba: vsichni ? p.zasoba : undefined,
      pohyby: vsichni ? p.pohyby : undefined,
      piva: p.piva,
      obaly: p.obaly,
    }),
    objednavek: platne.length,
  };
}

/** „1 objednávka", „3 objednávky", „5 objednávek". */
export function pocetObjednavek(n: number): string {
  return `${n} ${n === 1 ? 'objednávka' : n >= 2 && n <= 4 ? 'objednávky' : 'objednávek'}`;
}
