// ⚙️ Výpočet potřeby stáčení KEG sudů — „co je potřeba stočit".
// ---------------------------------------------------------------------------
// Tenký wrapper nad sdílenou logikou v packageNeeds.ts (stejný výpočet se
// používá i pro lahve — viz BottlingScreen.tsx „Lahve k dotočení tento
// týden"), jen s filtrem na obaly druhu "keg". Podrobný popis sloupců
// (invQty/bottledQty/outgoingQty/stockQty/orderedQty/neededQty) viz
// packageNeeds.ts.
import { computePackageNeeds, PackageNeedsRow, PackageNeedsInput } from './packageNeeds';

export type KegNeedsRow = PackageNeedsRow;

export type KegNeedsInput = {
  beers: { id: string; name: string }[];
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  orders: any[];
  orderItems: any[];
  inventoryRows: any[];
  keggingRows: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  prefukRows: any[];
  /** Automatický odpočet závozu (stejný zdroj jako Sklad/Inventura — viz zavoz_deductions). */
  zavozDeductionRows?: any[];
  weekKey: string;
  todayStr: string;
};

export function computeKegNeeds(input: KegNeedsInput): KegNeedsRow[] {
  const fullInput: PackageNeedsInput = { ...input, bottlingRows: [] };
  return computePackageNeeds(fullInput, (kind) => kind === 'keg');
}
