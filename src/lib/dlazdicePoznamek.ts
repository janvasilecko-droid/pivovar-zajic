// 📝 Co se ukáže na dlaždici Poznámky.
// ---------------------------------------------------------------------------
// Z provozu 19. 9. 2026: „když jsem zadal poznámku, nepropsala se na tu
// dlaždici blokovou."
//
// Příčina: poznámky jsou v aplikaci DVOJE a dlaždice znala jen jedny.
//   • OSOBNÍ (lib/homeNotes.ts) — moje, synchronizované přes profil,
//   • VZKAZY CELÉ SMĚNĚ (lib/sdilenePoznamky.ts) — „došly korunky", vidí je
//     všichni; schválně se NEukládají mezi osobní, aby je pisatel neviděl
//     dvakrát.
// Kdo v okně zapnul „Poslat všem", zapsal vzkaz do té druhé přihrádky —
// a dlaždice, která o ní nevěděla, zůstala prázdná. Vypadalo to, že se
// poznámka neuložila.
//
// Vzkazy pro směnu stojí NAHOŘE: „došly korunky" se týká všech a nemá být
// schované pod mým vlastním seznamem. Stejné pořadí má i okno poznámek.

export type OsobniPoznamka = {
  id: string;
  text: string;
  completed: boolean;
  important?: boolean;
};

export type VzkazSmene = {
  id: string;
  text: string;
  hotovo: boolean;
  dulezite: boolean;
};

/** Jeden řádek na dlaždici — z obou přihrádek stejně vypadající. */
export type PolozkaDlazdice = {
  id: string;
  text: string;
  hotovo: boolean;
  dulezite: boolean;
  /** true = vzkaz celé směně; odškrtnutí u něj platí pro všechny. */
  sdilena: boolean;
};

/**
 * Sloučí obě přihrádky do jednoho seznamu pro dlaždici.
 *
 * Pořadí: nejdřív nehotové (vzkazy směně před osobními, uvnitř důležité
 * napřed), pak hotové. Čerstvě odškrtnuté zůstávají — přeškrtnuté, ať je
 * vidět, že se odškrtnutí povedlo, a dá se vzít zpět.
 */
export function polozkyDlazdice(
  osobni: OsobniPoznamka[],
  sdilene: VzkazSmene[],
): PolozkaDlazdice[] {
  const zeSdilenych = sdilene.map((v): PolozkaDlazdice => ({
    id: v.id, text: v.text, hotovo: v.hotovo, dulezite: v.dulezite, sdilena: true,
  }));
  const zOsobnich = osobni.map((n): PolozkaDlazdice => ({
    id: n.id, text: n.text, hotovo: n.completed, dulezite: !!n.important, sdilena: false,
  }));

  const dulezitePrvni = (a: PolozkaDlazdice, b: PolozkaDlazdice) =>
    (b.dulezite ? 1 : 0) - (a.dulezite ? 1 : 0);

  return [
    ...zeSdilenych.filter((p) => !p.hotovo).sort(dulezitePrvni),
    ...zOsobnich.filter((p) => !p.hotovo).sort(dulezitePrvni),
    ...zeSdilenych.filter((p) => p.hotovo),
    ...zOsobnich.filter((p) => p.hotovo),
  ];
}

/** Kolik vzkazů čeká — číslo na odznaku dlaždice. */
export function pocetCekajicich(polozky: PolozkaDlazdice[]): number {
  return polozky.filter((p) => !p.hotovo).length;
}
