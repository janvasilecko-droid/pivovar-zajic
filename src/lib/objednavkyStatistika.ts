/**
 * Počty pro filtrovaný pohled na objednávky.
 *
 * Vytaženo z `Orders.tsx` (3 400 řádků, žádný test). Je to počítání, které
 * uživatel ČTE jako číslo — „18 ks ve 4 objednávkách" — a podle kterého se
 * rozhoduje, kolik čeho nachystat. Dokud sedělo uvnitř obrazovky mezi stavy
 * Reactu, nedalo se otestovat vůbec.
 *
 * Nejdůležitější je poslední pole: `jsouSkryteObjednavky`. Když je filtr
 * nebo hledání zapnuté, vidí člověk jen část — a bez tohohle příznaku by
 * měl za to, že „30l se dneska nikde nechystá", zatímco se tři chystají
 * v objednávce, kterou filtr schoval.
 */

/** Objednávka, jak ji tenhle výpočet potřebuje. */
export type ObjednavkaProPocty = { id: string; status?: string | null };

export type PoctyPolozek = {
  /** Kusy vyhovujících položek v tom, co je právě vidět. */
  kusyVeVyberu: number;
  /** Kolik objednávek ve výběru obsahuje aspoň jednu vyhovující položku. */
  objednavekVeVyberu: number;
  /** Kolik vyhovujících položek celkem je ve výběru (řádků, ne kusů). */
  polozekVeVyberu: number;
  /** Kusy ve VŠECH objednávkách (mimo storno), tedy i mimo právě viditelné. */
  kusyCelkem: number;
  /** Kolik objednávek celkem (mimo storno) obsahuje vyhovující položku. */
  objednavekCelkem: number;
  /** Filtr/hledání něco schovává — je to potřeba říct nahlas. */
  jsouSkryteObjednavky: boolean;
};

/**
 * Sečte vyhovující položky ve dvou rozsazích: v tom, co je vidět, a ve všech
 * objednávkách.
 *
 * `vyhovuje` dodává obrazovka — závisí na jejích filtrech (pivo, obal,
 * hledaný text) a nemá cenu ho sem tahat. `mnozstvi` je oddělené, protože
 * `quantity` z databáze umí přijít jako text i jako null.
 *
 * Storno objednávky se z „celkem" vyřazují: jsou to zrušené objednávky a
 * počítat je do „kolik toho je" by znamenalo chystat pivo, které nikdo
 * nechce. Ze viditelného výběru je vyřazuje už obrazovka.
 */
export function poctyPolozek<O extends ObjednavkaProPocty, P>(opts: {
  videne: O[];
  vsechny: O[];
  polozky: Record<string, P[] | undefined>;
  vyhovuje: (polozka: P) => boolean;
  mnozstvi?: (polozka: P) => number;
}): PoctyPolozek {
  const { videne, vsechny, polozky, vyhovuje } = opts;
  const mnozstvi = opts.mnozstvi ?? ((p: any) => Number(p?.quantity) || 0);

  let kusyVeVyberu = 0;
  let objednavekVeVyberu = 0;
  let polozekVeVyberu = 0;
  for (const o of videne) {
    const vyhovujici = (polozky[o.id] ?? []).filter(vyhovuje);
    if (vyhovujici.length === 0) continue;
    objednavekVeVyberu += 1;
    polozekVeVyberu += vyhovujici.length;
    for (const p of vyhovujici) kusyVeVyberu += mnozstvi(p);
  }

  let kusyCelkem = 0;
  let objednavekCelkem = 0;
  for (const o of vsechny) {
    if (o.status === 'storno') continue;
    const vyhovujici = (polozky[o.id] ?? []).filter(vyhovuje);
    if (vyhovujici.length === 0) continue;
    objednavekCelkem += 1;
    for (const p of vyhovujici) kusyCelkem += mnozstvi(p);
  }

  return {
    kusyVeVyberu,
    objednavekVeVyberu,
    polozekVeVyberu,
    kusyCelkem,
    objednavekCelkem,
    jsouSkryteObjednavky: kusyCelkem > kusyVeVyberu,
  };
}
