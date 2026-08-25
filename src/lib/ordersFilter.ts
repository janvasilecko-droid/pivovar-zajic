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

// 🔀 Stejný důvod jako výše — "Objednávky k parsování" (dlaždice na Domů) i
// tlačítko WhatsApp v horní hlavičce (Layout.tsx) dřív přepnuly stránku na
// Objednávky a HNED (ve stejném tiku) dispatchly CustomEvent
// 'pivovar:open-auto-import'. Orders se ale montuje až PO přepnutí stránky,
// takže se jeho posluchač nestihl zaregistrovat dřív, než event proletěl —
// appka tak skončila na obyčejném seznamu objednávek místo v okně WhatsApp
// zpráv k parsování. Modulová proměnná to řeší stejně jako filtr piva/obalu.
let pendingAutoImport = false;

export function requestOrdersAutoImport(): void {
  pendingAutoImport = true;
}

export function consumeOrdersAutoImportRequest(): boolean {
  const req = pendingAutoImport;
  pendingAutoImport = false;
  return req;
}
