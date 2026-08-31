// 🔢 Očista čísla zadaného rukou.
// ---------------------------------------------------------------------------
// Na telefonu se do číselného pole dostane kdeco: desetinná ČÁRKA (česká
// klávesnice ji nabízí místo tečky), mezery z kopírování, dopsaná jednotka
// („12 ks"), omylem dvě tečky. Bez očisty by se takový text uložil jako NaN
// nebo utnutý na první nečíselný znak.
//
// Žilo v components/PocetInput.tsx, což byla komponenta, kterou nakonec nikdo
// nevykresloval — funkce ale používaná (a otestovaná) je, tak se přestěhovala
// sem, mezi ostatní logiku.

/** „1,5" → „1.5"; pryč s mezerami a vším, co není číslo. */
export function normalizujCislo(text: string, desetinne: boolean): string {
  let s = String(text).replace(/\s/g, '').replace(',', '.');
  s = desetinne ? s.replace(/[^0-9.-]/g, '') : s.replace(/[^0-9-]/g, '');
  // Jen jedna tečka a mínus jen na začátku.
  const zaporne = s.startsWith('-');
  s = s.replace(/-/g, '');
  const casti = s.split('.');
  s = casti.length > 1 ? `${casti[0]}.${casti.slice(1).join('')}` : s;
  return (zaporne ? '-' : '') + s;
}
