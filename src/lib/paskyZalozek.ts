/**
 * Vodorovný pásek záložek — kde je ještě něco za okrajem.
 *
 * Záložky se na telefon nevejdou: na 360 px se do řádku vejdou tři a
 * ostatní jsou za okrajem. Pásek se dal odrolovat i dřív, jenže to nebylo
 * nijak vidět — vypadal jako celý obsah, takže se na zbylé záložky
 * nepřišlo. Podle téhle funkce se na kraji ukáže „ustřižení" (jemný
 * přechod), takže je poznat, že tam něco je.
 */
export type OkrajePasku = { vlevo: boolean; vpravo: boolean };

/**
 * Rezerva v pixelech. Bez ní by přechod blikal na konci rolování, protože
 * prohlížeč vrací zlomkové hodnoty (scrollLeft 132.5 při maximu 132).
 */
const REZERVA = 2;

export function okrajePasku(scrollLeft: number, scrollWidth: number, clientWidth: number): OkrajePasku {
  // Nic nepřečnívá — žádný přechod. (Sem patří i pásek, který se ještě
  // nevykreslil a má samé nuly.)
  if (scrollWidth <= clientWidth + REZERVA) return { vlevo: false, vpravo: false };
  return {
    vlevo: scrollLeft > REZERVA,
    vpravo: scrollLeft + clientWidth < scrollWidth - REZERVA,
  };
}
