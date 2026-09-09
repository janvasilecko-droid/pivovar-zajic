// 💰 Kolik je objednávka podle ceníku hodná.
//
// Appka měla hotový ceník (piva × obal → cena, `price_list`), ale nikde ho
// nepoužívala — objednávky znaly jen kusy, cena zůstávala izolovaná
// referenční tabulka. Tohle je první, malý krok k penězům v appce: ukázat
// hodnotu KONKRÉTNÍ objednávky. Fakturace a měsíční vyúčtování (DIČ, číslo
// dokladu, DPH…) je samostatná, mnohem větší úloha, kterou nejde uhodnout
// bez toho, jak pivovar doopravdy fakturuje — proto tady zůstává jen tohle.

export type CenaPolozky = {
  beer_id: string | null;
  package_id: string | null;
  price_per_unit: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
};

export type PolozkaKOhodnoceni = {
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
};

/**
 * Najde cenu platnou pro dané pivo, obal a DATUM objednávky.
 *
 * Ceny se mění v čase (`valid_from`/`valid_to`) — použít prostě „nějakou"
 * cenu bez ohledu na datum by u starší objednávky ukázalo dnešní cenu,
 * ne tu, za kterou se doopravdy prodalo. Když je platných záznamů pro
 * stejné pivo+obal víc (chyba v datech), vezme se nejnovější `valid_from`.
 */
export function cenaKeDni(
  cenik: CenaPolozky[],
  beerId: string,
  packageId: string,
  datum: string,
): CenaPolozky | null {
  const platne = cenik.filter((c) =>
    c.beer_id === beerId &&
    c.package_id === packageId &&
    (!c.valid_from || c.valid_from <= datum) &&
    (!c.valid_to || c.valid_to >= datum)
  );
  if (platne.length === 0) return null;
  return platne.reduce((nejnovejsi, c) => (
    (c.valid_from ?? '') > (nejnovejsi.valid_from ?? '') ? c : nejnovejsi
  ));
}

export type HodnotaObjednavky = {
  /** Součet za položky, pro které se cena našla. */
  celkem: number;
  /** Měna — appka dnes nepočítá s víc měnami najednou, bere se z první nalezené ceny. */
  mena: string | null;
  /** Kolik položek (kusů řádků, ne ks zboží) nemá v ceníku platnou cenu. */
  chybiCenaUPolozek: number;
};

export function hodnotaObjednavky(
  polozky: PolozkaKOhodnoceni[],
  cenik: CenaPolozky[],
  datumObjednavky: string,
): HodnotaObjednavky {
  let celkem = 0;
  let mena: string | null = null;
  let chybi = 0;
  for (const p of polozky) {
    if (!p.beer_id || !p.package_id) { chybi++; continue; }
    const cena = cenaKeDni(cenik, p.beer_id, p.package_id, datumObjednavky);
    if (!cena) { chybi++; continue; }
    celkem += cena.price_per_unit * Number(p.quantity || 0);
    if (!mena) mena = cena.currency;
  }
  return { celkem, mena, chybiCenaUPolozek: chybi };
}
