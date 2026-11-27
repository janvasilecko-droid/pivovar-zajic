// 📉 Rozdíl oproti inventuře za měsíc — jen BOKEM, do výpočtu se nepočítá.
// ---------------------------------------------------------------------------
// Majitel 26. 11. 2026: „…napsat bokem na konci měsíce rozdíl oproti inventuře, ať je vidět ztráta, ale nepočítat je,
// počítá se jen co je reálně na skladě." A 27. 11.: „…úprava skladu číslo, rozdíl (pokud se bude dofasovávat
// zpětně, to číslo se může měnit, zmenšovat), ale stav skladu je daný úpravou skladu a od té doby se počítá
// s tímhle číslem."
//
// Napočítaný stav je pravda: Sklad i Rozbor od něj počítají dál. Rozdíl, který počítání odhalilo, se tu ale
// NEBERE z toho, co se uložilo při počítání (to by zůstalo zamrzlé), nýbrž ŽIVĚ ze skladové knihy — stejně jako
// u řádku „Úprava skladu" v Pohybech: napočítáno − co podle evidence mělo být těsně před počítáním. Když se pak
// zpětně dopíše fasování za dny před počítáním, evidence klesne a ztráta se zmenší. Je to přesně číslo, které
// ukazují Pohyby (`souhrn.srovnani`), jen sečtené za měsíc po položkách.
//
// K tomu patří dorovnání z Úpravy skladu (tlačítko „Dorovnat": rozbité, ztracené, nezapsaný výdej): evidence před
// počítáním už ho obsahuje, takže samo by rozdíl zmizel a ztráta by nebyla vidět. Proto se přičítá zvlášť.
// Dopsané stáčení („Zapsat do stáčení") ztráta není — chybějící výroba se zapsala a evidence tím vzrostla.
//
// Nic odsud nevstupuje do stavu skladu ani do čísel v Rozboru: jen čte pohyby.
import { sestavPohybyObdobi } from './pohybySkladu';
import { jePocitani, konecMesice, stockKey, type Movement } from './stockLedger';

export type ZtrataPolozky = {
  key: string;
  beer_id: string;
  package_id: string;
  beer_name: string;
  package_label: string;
  /** Součet za měsíc: záporné = ztráta, kladné = přebytek. */
  rozdil: number;
  /** Kolik počítání (Úprava skladu, inventura) se v měsíci té položky týkalo. */
  pocitani: number;
};

export type ZtrataMesice = {
  /** Jen položky s nenulovým součtem, největší ztráta první. */
  radky: ZtrataPolozky[];
  /** Součet ztrát (záporné číslo, nebo 0). */
  ztrata: number;
  /** Součet přebytků (kladné číslo, nebo 0). */
  prebytek: number;
  /** Kolik počítání (Úprava skladu, inventura) v měsíci proběhlo — i těch, kde všechno sedělo. */
  pocitani: number;
};

/** Dorovnání z tlačítka „Dorovnat" v Úpravě skladu (důvod „Dorovnání z inventury týdne …"). */
export function jeDorovnaniUpravy(note: string | null | undefined): boolean {
  return /^Dorovnání z inventury týdne/.test((note ?? '').trim());
}

export function ztrataOprotiInventure(
  pohyby: Movement[],
  mesic: string,
  piva: { id: string; name: string }[],
  obaly: { id: string; label: string }[],
): ZtrataMesice {
  const od = `${mesic}-01`;
  const doDne = konecMesice(mesic);
  const jmenoPiva = new Map(piva.map((b) => [b.id, b.name]));
  const jmenoObalu = new Map(obaly.map((o) => [o.id, o.label]));

  let pocitani = 0;
  const pocitaniPoKlici = new Map<string, number>();
  const dorovnani = new Map<string, number>();
  for (const m of pohyby) {
    if (m.date < od || m.date > doDne) continue;
    const k = stockKey(m.beer_id, m.package_id);
    if (m.kind === 'inventura' && jePocitani(m.note)) {
      pocitani += 1;
      pocitaniPoKlici.set(k, (pocitaniPoKlici.get(k) ?? 0) + 1);
    } else if (m.kind === 'dorovnani' && jeDorovnaniUpravy(m.note)) {
      dorovnani.set(k, (dorovnani.get(k) ?? 0) + m.qty);
    }
  }

  // Čistý účinek počítání za měsíc: konec − (ráno + přibylo − ubylo), tedy přesně součet (napočítáno − evidence).
  const rozdily = new Map<string, number>();
  for (const s of sestavPohybyObdobi(pohyby, { od, doDne }).souhrn) {
    if (s.srovnani !== 0) rozdily.set(stockKey(s.beer_id, s.package_id), s.srovnani);
  }
  dorovnani.forEach((v, k) => rozdily.set(k, (rozdily.get(k) ?? 0) + v));

  const radky: ZtrataPolozky[] = [];
  rozdily.forEach((rozdil, key) => {
    if (rozdil === 0) return;
    const [beer_id, package_id] = key.split('__');
    radky.push({
      key, beer_id, package_id,
      beer_name: jmenoPiva.get(beer_id) ?? 'Neznámé pivo',
      package_label: jmenoObalu.get(package_id) ?? '',
      rozdil,
      pocitani: pocitaniPoKlici.get(key) ?? 0,
    });
  });
  radky.sort((a, b) => a.rozdil - b.rozdil || a.beer_name.localeCompare(b.beer_name, 'cs') || a.package_label.localeCompare(b.package_label, 'cs', { numeric: true }));
  return {
    radky,
    ztrata: radky.filter((r) => r.rozdil < 0).reduce((s, r) => s + r.rozdil, 0),
    prebytek: radky.filter((r) => r.rozdil > 0).reduce((s, r) => s + r.rozdil, 0),
    pocitani,
  };
}
