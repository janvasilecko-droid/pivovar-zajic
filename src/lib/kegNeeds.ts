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
  /** Stočení lahví — používá se JEN kvůli poli kegs_used (KEGy spotřebované
      jako zdroj stáčení lahví), ne kvůli výstupu lahví samotnému (ten pro
      potřebu KEGů nic neznamená). Bez těchto řádků appka považuje kegs_used
      za pořád dostupné KEGy, i když už byly reálně vystočeny do lahví. */
  bottlingRows?: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  prefukRows: any[];
  /** Automatický odpočet závozu (stejný zdroj jako Sklad/Inventura — viz zavoz_deductions). */
  zavozDeductionRows?: any[];
  /** Dorovnání inventury — manko/přebytek (± ks), stejný zdroj jako Sklad/Dashboard (inventory_adjustments). */
  adjustmentRows?: any[];
  weekKey: string;
  todayStr: string;
};

export function computeKegNeeds(input: KegNeedsInput): KegNeedsRow[] {
  const fullInput: PackageNeedsInput = { ...input, bottlingRows: input.bottlingRows ?? [] };
  return computePackageNeeds(fullInput, (kind) => kind === 'keg');
}
