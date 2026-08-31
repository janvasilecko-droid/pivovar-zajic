// 🔀 „Sklad" → „Nesedí evidence": klik na „Doplnit stočení" u položky, co
// vychází do mínusu, otevře Stáčení (KEG nebo lahve, podle druhu obalu)
// rovnou s tím pivem rozbaleným — stejný modulový vzorec jako
// requestOrdersItemFilter v ordersFilter.ts.
let pendingKegBeerId: string | null = null;
let pendingBottlingBeerId: string | null = null;

export function requestKegFix(beerId: string): void {
  pendingKegBeerId = beerId;
}

export function consumeKegFixRequest(): string | null {
  const id = pendingKegBeerId;
  pendingKegBeerId = null;
  return id;
}

export function requestBottlingFix(beerId: string): void {
  pendingBottlingBeerId = beerId;
}

export function consumeBottlingFixRequest(): string | null {
  const id = pendingBottlingBeerId;
  pendingBottlingBeerId = null;
  return id;
}
