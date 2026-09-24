// 📋 Pohyby skladu za období — každý pohyb pod sebou, den po dni.
// ---------------------------------------------------------------------------
// Z provozu 24. 9. 2026: „udělej možnost kouknout se na pohyb ve vybraném
// týdnu, ať těch dat není tolik… sledovat detailně každý pohyb a filtrovat".
//
// Rozpad piva (Inventura) řadí pohyby po DRUZÍCH — dobrý na „kolik šlo na
// závozy", špatný na „kde se to rozešlo". Tady jde všechno podle DNE a pod
// každým dnem je stav večer. Když fyzický stav nesedí, stačí najít první
// den, kdy stav v appce přestal odpovídat skutečnosti.
//
// Stav večer se NEsčítá z vyfiltrovaných řádků — bere se ze skladové knihy
// (stockAsOf) nad VŠEMI pohyby. Filtr druhu pohybu tak schová řádky, ale
// nezmění čísla: stav je vždycky ten samý jako ve Skladu.
import { MOVEMENT_LABELS, stockAsOf, stockAtStartOfDay, stockKey, type Movement, type MovementKind } from './stockLedger';

/** Skupiny druhů pohybu pro filtr — dvanáct druhů je na telefon moc. */
export const SKUPINY_POHYBU: { id: string; label: string; druhy: MovementKind[] }[] = [
  { id: 'stoceno', label: 'Stočeno', druhy: ['staceni', 'kegovani'] },
  { id: 'zavoz', label: 'Závozy', druhy: ['zavoz'] },
  { id: 'fasovani', label: 'Fasování a prodejna', druhy: ['fasovani', 'prodejna'] },
  { id: 'akce', label: 'Akce', druhy: ['akce'] },
  { id: 'odpis', label: 'Odpisy', druhy: ['odpis'] },
  { id: 'inventura', label: 'Inventura a dorovnání', druhy: ['inventura', 'dorovnani'] },
  { id: 'prefuk', label: 'Přefuk a sudy na lahve', druhy: ['prefuk_z', 'prefuk_do', 'sud_na_lahve'] },
];

export type FiltrPohybu = {
  od: string;
  doDne: string;
  /** Prázdné = všechna piva. */
  beerId?: string;
  /** Prázdné = všechny obaly. */
  packageId?: string;
  /** Id skupin ze SKUPINY_POHYBU. Prázdné = všechny druhy. */
  skupiny?: string[];
};

export type RadekPohybu = {
  datum: string;
  druh: MovementKind;
  popis: string;
  beer_id: string;
  package_id: string;
  /** + příjem, − výdej. U inventury nastavený stav. */
  mnozstvi: number;
  /** Komu (u závozu odběratel) nebo poznámka. */
  kdo: string;
  orderId: string | null;
};

export type StavKlice = { beer_id: string; package_id: string; mnozstvi: number };

export type DenPohybu = {
  datum: string;
  radky: RadekPohybu[];
  /** Stav na konci dne — stejné číslo jako Sklad k tomu dni. */
  vecer: StavKlice[];
};

export type PohybyObdobi = {
  /** Stav ráno prvního dne (než se ten den cokoli stočí nebo vydá). */
  rano: StavKlice[];
  dny: DenPohybu[];
  /** Po pivu a obalu: ráno, přibylo, ubylo, večer posledního dne. */
  souhrn: { beer_id: string; package_id: string; rano: number; prijem: number; vydej: number; inventura: boolean; konec: number }[];
};

// Pořadí v rámci dne: nejdřív inventura (výchozí bod), pak co přibylo,
// pak co ubylo — tak se to čte i v sešitě.
const PORADI: Record<MovementKind, number> = {
  inventura: 0, dorovnani: 1, kegovani: 2, staceni: 3, prefuk_do: 4,
  zavoz: 5, fasovani: 6, prodejna: 7, akce: 8, odpis: 9, prefuk_z: 10, sud_na_lahve: 11,
};

function dnyObdobi(od: string, doDne: string): string[] {
  const out: string[] = [];
  const d = new Date(od + 'T00:00:00Z');
  const konec = new Date(doDne + 'T00:00:00Z');
  // Pojistka proti nekonečné smyčce při špatném datu — víc než rok se
  // stejně neukazuje.
  for (let i = 0; d <= konec && i < 400; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function sestavPohybyObdobi(
  pohyby: Movement[],
  filtr: FiltrPohybu,
  jmenoOdberatele: (orderId: string) => string | undefined = () => undefined,
): PohybyObdobi {
  const { od, doDne, beerId, packageId } = filtr;
  const povoleneDruhy = filtr.skupiny && filtr.skupiny.length > 0
    ? new Set(SKUPINY_POHYBU.filter((s) => filtr.skupiny!.includes(s.id)).flatMap((s) => s.druhy))
    : null;
  const sedi = (b: string, p: string) => (!beerId || b === beerId) && (!packageId || p === packageId);

  // Které klíče (pivo × obal) ukazovat ve stavech: ty, co ráno něco měly,
  // nebo se s nimi v období hnulo. Jinak by se u „všech piv" vypsaly
  // desítky nul.
  const klice = new Set<string>();
  const ranoMapa = stockAtStartOfDay(pohyby, od);
  ranoMapa.forEach((l, k) => { if (l.qty !== 0 && sedi(l.beer_id, l.package_id)) klice.add(k); });
  const vObdobi = pohyby.filter((m) => m.date >= od && m.date <= doDne && sedi(m.beer_id, m.package_id));
  vObdobi.forEach((m) => klice.add(stockKey(m.beer_id, m.package_id)));

  const rozloz = (k: string) => { const [beer_id, package_id] = k.split('__'); return { beer_id, package_id }; };
  const serazeneKlice = [...klice].sort();
  const stavy = (mapa: Map<string, { qty: number }>): StavKlice[] =>
    serazeneKlice.map((k) => ({ ...rozloz(k), mnozstvi: mapa.get(k)?.qty ?? 0 }));

  const dny: DenPohybu[] = dnyObdobi(od, doDne).map((datum) => {
    const radky = vObdobi
      .filter((m) => m.date === datum && (!povoleneDruhy || povoleneDruhy.has(m.kind)))
      .map<RadekPohybu>((m) => ({
        datum,
        druh: m.kind,
        popis: MOVEMENT_LABELS[m.kind],
        beer_id: m.beer_id,
        package_id: m.package_id,
        mnozstvi: m.qty,
        kdo: (m.orderId && jmenoOdberatele(m.orderId)) || (m.note ?? '').trim(),
        orderId: m.orderId ?? null,
      }))
      .sort((a, b) => PORADI[a.druh] - PORADI[b.druh] || a.beer_id.localeCompare(b.beer_id) || a.package_id.localeCompare(b.package_id));
    return { datum, radky, vecer: stavy(stockAsOf(pohyby, datum)) };
  });

  const konecMapa = stockAsOf(pohyby, doDne);
  const souhrn = serazeneKlice.map((k) => {
    const { beer_id, package_id } = rozloz(k);
    let prijem = 0;
    let vydej = 0;
    let inventura = false;
    vObdobi.forEach((m) => {
      if (m.beer_id !== beer_id || m.package_id !== package_id) return;
      if (m.kind === 'inventura') { inventura = true; return; }
      if (m.qty > 0) prijem += m.qty; else vydej -= m.qty;
    });
    return { beer_id, package_id, rano: ranoMapa.get(k)?.qty ?? 0, prijem, vydej, inventura, konec: konecMapa.get(k)?.qty ?? 0 };
  });

  return { rano: stavy(ranoMapa), dny, souhrn };
}
