import * as XLSX from 'xlsx';
import { EntryRow } from './supabase';

function download(ws: XLSX.WorkSheet, name: string) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, name);
}

const cols = (rows: any[], headers: string[], keys: string[]) => {
  const data = rows.map((r) => {
    const o: any = {};
    headers.forEach((h, i) => { o[h] = r[keys[i]] ?? ''; });
    return o;
  });
  return XLSX.utils.json_to_sheet(data);
};

export const exportBottlingToExcel = (rows: EntryRow[]) =>
  download(cols(rows, ['Datum', 'Pivo', 'Obal', 'Množství', 'Poznámka'], ['entry_date', 'beer_name', 'package_label', 'quantity', 'note']), 'staceni-lahve.xlsx');

export const exportKeggingToExcel = (rows: EntryRow[], cellarTanks: { id: string; label: string }[]) =>
  download(cols(rows, ['Datum', 'Pivo', 'Obal', 'Množství', 'Č. tanku', 'HL', 'Poznámka'], ['entry_date', 'beer_name', 'package_label', 'quantity', 'cellar_tank_label', 'hl', 'note']), 'staceni-keg.xlsx');

export const exportWriteoffsToExcel = (rows: EntryRow[]) =>
  download(cols(rows, ['Datum', 'Kdo', 'Pivo', 'Obal', 'Množství', 'Důvod'], ['entry_date', 'who', 'beer_name', 'package_label', 'quantity', 'reason']), 'odpis.xlsx');

export const exportInventoryToExcel = (rows: EntryRow[]) =>
  download(cols(rows, ['Datum', 'Pivo', 'Obal', 'Množství', 'Poznámka'], ['entry_date', 'beer_name', 'package_label', 'quantity', 'note']), 'inventura.xlsx');

export const exportFasovaniToExcel = (rows: EntryRow[]) =>
  download(cols(rows, ['Datum', 'Pivo', 'Obal', 'Množství', 'Poznámka'], ['entry_date', 'beer_name', 'package_label', 'quantity', 'note']), 'fasovani.xlsx');

export const exportProdejnaToExcel = (rows: EntryRow[]) =>
  download(cols(rows, ['Datum', 'Pivo', 'Obal', 'Množství', 'Poznámka'], ['entry_date', 'beer_name', 'package_label', 'quantity', 'note']), 'prodejna.xlsx');

export const exportHistoryDetailToExcel = (rows: any[], headers: string[], keys: string[], filename: string) =>
  download(cols(rows, headers, keys), filename);

export const exportExciseTaxReportToExcel = (rows: { beer_name: string; degree: string; liters: number; hl: number; keg_count: number; bottle_count: number }[], periodLabel: string) => {
  const ws = cols(
    rows,
    ['Druh Piva', 'Stupňovitost (EPM)', 'Stočeno (l)', 'Stočeno (hl)', 'Počet sudů', 'Počet lahví'],
    ['beer_name', 'degree', 'liters', 'hl', 'keg_count', 'bottle_count']
  );
  download(ws, `vykaz-spotrebni-dan-${periodLabel.replace(/\s+/g, '-')}.xlsx`);
};

export const exportMonthlySalesReportToExcel = (rows: { date: string; place: string; beer: string; package_label: string; qty: number; price_total: number }[], monthLabel: string) => {
  const ws = cols(
    rows,
    ['Datum Objednávky', 'Odběratel', 'Pivo', 'Obal', 'Množství (ks)', 'Celkem Kč'],
    ['date', 'place', 'beer', 'package_label', 'qty', 'price_total']
  );
  download(ws, `vykaz-prodej-${monthLabel.replace(/\s+/g, '-')}.xlsx`);
};

export const exportZavozToExcel = (rows: { order_date: string; place_name: string | null; delivery_day: string | null; beer_name: string | null; package_label: string | null; quantity: number; is_delivered: boolean }[], weekLabel: string) => {
  const ws = cols(
    rows,
    ['Datum', 'Odběratel', 'Den', 'Pivo', 'Obal', 'Množství', 'Zavezeno'],
    ['order_date', 'place_name', 'delivery_day', 'beer_name', 'package_label', 'quantity', 'is_delivered']
  );
  download(ws, `zavoz-${weekLabel.replace(/\s+/g, '-')}.xlsx`);
};


