export type PrintableValue = string | number | null | undefined;

export type DeliveryPrintItem = {
  beerName: PrintableValue;
  quantity: PrintableValue;
  packageLabel: PrintableValue;
};

export type DeliveryPrintOrder = {
  placeName: PrintableValue;
  deliveryLabel?: PrintableValue;
  address?: PrintableValue;
  phone?: PrintableValue;
  note?: PrintableValue;
  items: DeliveryPrintItem[];
};

export type DeliveryPrintOptions = {
  title: string;
  heading: string;
  summary?: string;
  emptyMessage: string;
  orders: DeliveryPrintOrder[];
};

export type PrintTableColumn = {
  label: string;
  align?: 'left' | 'right' | 'center';
};

export type PrintTableOptions = {
  title: string;
  heading: string;
  summary?: string;
  columns: PrintTableColumn[];
  rows: PrintableValue[][];
  emptyMessage: string;
};

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 20px; background: #fff; color: #000; }
  h1 { font-size: 21px; margin: 0 0 16px; }
  .print-summary { margin: -8px 0 20px; color: #444; font-size: 13px; }
  .print-card { page-break-inside: avoid; border: 2px solid #333; border-radius: 10px; padding: 14px; margin-bottom: 14px; background: #faf8f5; }
  .print-card-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
  .print-place { font-weight: 900; font-size: 18px; color: #111; }
  .print-badge { font-weight: bold; font-size: 13px; background: #f59e0b; padding: 4px 8px; border-radius: 6px; color: #000; }
  .print-detail { font-size: 12px; color: #555; margin-top: 4px; }
  .print-items { margin: 10px 0 0 18px; padding: 0; font-size: 14px; }
  .print-note { font-size: 12px; margin-top: 8px; color: #555; font-style: italic; }
  .print-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
  .print-table th { background: #f3f4f6; padding: 8px; border: 1px solid #ccc; text-align: left; }
  .print-table td { padding: 6px; border: 1px solid #ccc; }
  .print-empty { text-align: center; padding: 20px; color: #555; }

  /* Hlavička dokladu — bez ní to byl výpis z webu, ne list, který řidič
     odevzdá a zákazník podepíše. */
  .print-hlavicka { display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  .print-pivovar { font-weight: 900; font-size: 15px; letter-spacing: 0.02em; }
  .print-pivovar-radek { font-size: 11px; color: #444; margin-top: 2px; }
  .print-vytisteno { font-size: 11px; color: #444; text-align: right; }

  /* Podpis převzetí u každého odběratele. Papír bez podpisu nic nedokládá. */
  .print-podpis { display: flex; gap: 24px; margin-top: 14px; padding-top: 6px; }
  .print-podpis > div { flex: 1; border-top: 1px solid #666; padding-top: 3px;
    font-size: 10px; color: #555; }

  /* Číslo stránky a patička se opakují na každé stránce. */
  @page { size: A4; margin: 14mm; }
`;

/** Kdo doklad vydal. Mění se jednou za život firmy, proto natvrdo. */
const PIVOVAR = {
  nazev: 'Kynšperský pivovar s.r.o.',
  radek: 'Výroba piva Zajíc · Kynšperk nad Ohří',
};

function valueText(value: PrintableValue, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function appendTextElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  parent: Node,
  tagName: K,
  text: PrintableValue,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = valueText(text, '');
  parent.appendChild(element);
  return element;
}

function prepareDocument(document: Document, title: string): HTMLElement {
  document.documentElement.lang = 'cs';

  const meta = document.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  const style = document.createElement('style');
  style.textContent = BASE_STYLES;
  document.head.replaceChildren(meta, style);
  document.title = title;
  document.body.replaceChildren();
  return document.body;
}

/**
 * Opens and renders a print document exclusively through DOM/textContent.
 * User-controlled values are never interpreted as HTML.
 */
export function openSafePrintWindow(
  title: string,
  render: (document: Document, body: HTMLElement) => void,
): boolean {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  // The print window never needs access back to the application window.
  try { printWindow.opener = null; } catch {}

  const body = prepareDocument(printWindow.document, title);
  render(printWindow.document, body);

  printWindow.setTimeout(() => {
    if (printWindow.closed) return;
    try { printWindow.focus(); } catch {}
    printWindow.print();
  }, 0);
  return true;
}

/**
 * Hlavička dokladu: kdo ho vydal a kdy se tiskl. Datum tisku je tam
 * schválně — na papíře bez data se za týden nedá poznat, ke kterému
 * závozu patřil.
 */
function vlozHlavicku(document: Document, body: HTMLElement): void {
  const hlavicka = document.createElement('div');
  hlavicka.className = 'print-hlavicka';
  const vlevo = document.createElement('div');
  appendTextElement(document, vlevo, 'div', PIVOVAR.nazev, 'print-pivovar');
  appendTextElement(document, vlevo, 'div', PIVOVAR.radek, 'print-pivovar-radek');
  hlavicka.appendChild(vlevo);
  appendTextElement(
    document, hlavicka, 'div',
    `Vytištěno ${new Date().toLocaleString('cs-CZ')}`,
    'print-vytisteno',
  );
  body.appendChild(hlavicka);
}

/** Dva podpisové řádky — kdo vydal a kdo převzal. */
function vlozPodpis(document: Document, card: HTMLElement): void {
  const podpis = document.createElement('div');
  podpis.className = 'print-podpis';
  appendTextElement(document, podpis, 'div', 'Vydal (pivovar)');
  appendTextElement(document, podpis, 'div', 'Převzal (odběratel)');
  card.appendChild(podpis);
}

export function printDeliveryList(options: DeliveryPrintOptions): boolean {
  return openSafePrintWindow(options.title, (document, body) => {
    vlozHlavicku(document, body);
    appendTextElement(document, body, 'h1', options.heading);
    if (options.summary) appendTextElement(document, body, 'p', options.summary, 'print-summary');

    if (!options.orders.length) {
      appendTextElement(document, body, 'p', options.emptyMessage, 'print-empty');
      return;
    }

    for (const order of options.orders) {
      const card = document.createElement('section');
      card.className = 'print-card';

      const header = document.createElement('div');
      header.className = 'print-card-header';
      appendTextElement(document, header, 'span', valueText(order.placeName, 'Neznámý odběratel'), 'print-place');
      if (order.deliveryLabel) {
        appendTextElement(document, header, 'span', order.deliveryLabel, 'print-badge');
      }
      card.appendChild(header);

      if (order.address) appendTextElement(document, card, 'div', order.address, 'print-detail');
      if (order.phone) appendTextElement(document, card, 'div', `Tel: ${valueText(order.phone)}`, 'print-detail');

      const list = document.createElement('ul');
      list.className = 'print-items';
      for (const item of order.items) {
        const row = document.createElement('li');
        row.appendChild(document.createTextNode(`${valueText(item.beerName)} — `));
        const quantity = document.createElement('strong');
        quantity.textContent = `${valueText(item.quantity, '0')} ks`;
        row.appendChild(quantity);
        row.appendChild(document.createTextNode(` (${valueText(item.packageLabel)})`));
        list.appendChild(row);
      }
      card.appendChild(list);

      if (order.note) appendTextElement(document, card, 'div', `Poznámka: ${valueText(order.note)}`, 'print-note');
      vlozPodpis(document, card);
      body.appendChild(card);
    }
  });
}

export function printTable(options: PrintTableOptions): boolean {
  return openSafePrintWindow(options.title, (document, body) => {
    vlozHlavicku(document, body);
    appendTextElement(document, body, 'h1', options.heading);
    if (options.summary) appendTextElement(document, body, 'p', options.summary, 'print-summary');

    const table = document.createElement('table');
    table.className = 'print-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const column of options.columns) {
      const cell = appendTextElement(document, headerRow, 'th', column.label);
      cell.style.textAlign = column.align ?? 'left';
    }
    head.appendChild(headerRow);
    table.appendChild(head);

    const tableBody = document.createElement('tbody');
    if (!options.rows.length) {
      const row = document.createElement('tr');
      const cell = appendTextElement(document, row, 'td', options.emptyMessage, 'print-empty');
      cell.colSpan = options.columns.length;
      tableBody.appendChild(row);
    } else {
      for (const values of options.rows) {
        const row = document.createElement('tr');
        options.columns.forEach((column, index) => {
          const cell = appendTextElement(document, row, 'td', valueText(values[index]));
          cell.style.textAlign = column.align ?? 'left';
        });
        tableBody.appendChild(row);
      }
    }
    table.appendChild(tableBody);
    body.appendChild(table);
  });
}
