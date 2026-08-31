// 🔀 „Sklad" → „Nesedí evidence": klik na „Doplnit stočení" u položky, co
// vychází do mínusu, otevře KEG (Stáčení) rovnou s tím pivem rozbaleným —
// stejný modulový vzorec jako requestOrdersItemFilter v ordersFilter.ts.
let pendingBeerId: string | null = null;

export function requestKegFix(beerId: string): void {
  pendingBeerId = beerId;
}

export function consumeKegFixRequest(): string | null {
  const id = pendingBeerId;
  pendingBeerId = null;
  return id;
}
