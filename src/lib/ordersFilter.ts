// 🔀 Předání „otevři objednávky filtrované na pivo + obal" mezi obrazovkami.
// ---------------------------------------------------------------------------
// Obrazovka Kegging (záložka „Potřeba stočit KEGy") zavolá requestOrdersItemFilter
// a přepne stránku na Objednávky. Komponenta Orders požadavek spotřebuje při
// mountu (consumeOrdersItemFilter) a použije ho jako filtr piva + obalu.
//
// Modulová proměnná místo CustomEvent: Orders se při přepnutí stránky montuje
// až po dispatche, takže by event nestihl zachytit.

export type OrdersItemFilterRequest = { beerId: string; packageId: string };

let pending: OrdersItemFilterRequest | null = null;

export function requestOrdersItemFilter(req: OrdersItemFilterRequest): void {
  pending = req;
}

export function consumeOrdersItemFilter(): OrdersItemFilterRequest | null {
  const req = pending;
  pending = null;
  return req;
}
