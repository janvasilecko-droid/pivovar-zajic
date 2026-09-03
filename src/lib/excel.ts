import { nactiXlsx, xlsx } from './xlsxLazy';
import { EntryRow, Beer } from './supabase';

function download(ws: any, name: string) {
  const wb = xlsx().utils.book_new();
  xlsx().utils.book_append_sheet(wb, ws, 'Data');
  xlsx().writeFile(wb, name);
}

const cols = (rows: any[], headers: string[], keys: string[]) => {
  const data = rows.map((r) => {
    const o: any = {};
    headers.forEach((h, i) => { o[h] = r[keys[i]] ?? ''; });
    return o;
  });
  return xlsx().utils.json_to_sheet(data);
};

export const exportKeggingToExcel = async (
  rows: EntryRow[],
  cellarTanks: { id: string; label: string }[],
  beers: Beer[]
) => {
  await nactiXlsx();
  // Sort rows chronologically by date
  const sortedRows = [...rows].sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''));

  const headers = ['Datum', 'Pivo', 'Obal', 'Množství', 'Č. tanku', 'HL', 'Poznámka'];
  const keys = ['entry_date', 'beer_name', 'package_label', 'quantity', 'cellar_tank_label', 'hl', 'note'];

  const data = sortedRows.map((r) => {
    const o: any = {};
    headers.forEach((h, i) => { o[h] = (r as any)[keys[i]] ?? ''; });
    return o;
  });

  const ws = xlsx().utils.json_to_sheet(data);

  // Set up autofilter for columns A-G
  ws['!autofilter'] = { ref: `A1:G${sortedRows.length + 1}` };

  // Set custom column widths
  ws['!cols'] = [
    { wch: 12 }, // Datum
    { wch: 18 }, // Pivo
    { wch: 12 }, // Obal
    { wch: 10 }, // Množství
    { wch: 10 }, // Č. tanku
    { wch: 8 },  // HL
    { wch: 25 }, // Poznámka
  ];

  // Map beer name to color hex (without #)
  const beerColors: Record<string, string> = {};
  beers.forEach((b) => {
    if (b.beer_color) {
      beerColors[b.name] = b.beer_color.startsWith('#') ? b.beer_color.slice(1) : b.beer_color;
    }
  });

  // Apply cell styles
  for (const cellRef in ws) {
    if (cellRef.startsWith('!')) continue;
    const cell = ws[cellRef];
    const rowNum = parseInt(cellRef.replace(/^[A-Z]+/, ''), 10);

    if (rowNum === 1) {
      // Header style
      cell.s = {
        font: { bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'E2E8F0' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          bottom: { style: 'thin', color: { rgb: '94A3B8' } },
          top: { style: 'thin', color: { rgb: '94A3B8' } }
        }
      };
    } else {
      // Data row style
      const beerVal = ws[`B${rowNum}`]?.v;
      const colorHex = beerVal ? beerColors[beerVal] : null;

      // Base style
      cell.s = {
        alignment: {
          horizontal: cellRef.startsWith('D') || cellRef.startsWith('F') ? 'right' : 'left',
          vertical: 'center'
        },
        border: {
          bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }
        }
      };

      // Add background color for matching beer
      if (colorHex) {
        cell.s.fill = { fgColor: { rgb: colorHex } };
      }
    }
  }

  download(ws, 'staceni-keg.xlsx');
};

export const exportHistoryDetailToExcel = async (rows: any[], headers: string[], keys: string[], filename: string) => {
  await nactiXlsx();
  download(cols(rows, headers, keys), filename);
};

export const exportExciseTaxReportToExcel = async (rows: { beer_name: string; degree: string; liters: number; hl: number; keg_count: number; bottle_count: number }[], periodLabel: string) => {
  await nactiXlsx();
  const ws = cols(
    rows,
    ['Druh Piva', 'Stupňovitost (EPM)', 'Stočeno (l)', 'Stočeno (hl)', 'Počet sudů', 'Počet lahví'],
    ['beer_name', 'degree', 'liters', 'hl', 'keg_count', 'bottle_count']
  );
  download(ws, `vykaz-spotrebni-dan-${periodLabel.replace(/\s+/g, '-')}.xlsx`);
};

export const exportZavozToExcel = async (rows: { order_date: string; place_name: string | null; delivery_day: string | null; beer_name: string | null; package_label: string | null; quantity: number; is_delivered: boolean }[], weekLabel: string) => {
  await nactiXlsx();
  const ws = cols(
    rows,
    ['Datum', 'Odběratel', 'Den', 'Pivo', 'Obal', 'Množství', 'Zavezeno'],
    ['order_date', 'place_name', 'delivery_day', 'beer_name', 'package_label', 'quantity', 'is_delivered']
  );
  download(ws, `zavoz-${weekLabel.replace(/\s+/g, '-')}.xlsx`);
};
