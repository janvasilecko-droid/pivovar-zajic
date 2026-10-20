// Přehled objednávek jako tabulka (17. 10. 2026: „vyzkoušej takhle přehled objednávek
// nějakým způsobem, abys zanechal všechny funkce"): řádek na objednávku, rozbalením
// se otevře původní karta se všemi funkcemi.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Beer, Package, Place } from '../../lib/supabase';
import { OrderTabulka } from './OrderTabulka';
import type { Order, OrderItem } from './spolecne';

const PIVA = [{ id: 'sv', name: '12° Světlá', sort_order: 1 }, { id: 'tm', name: '12° Tmavá', sort_order: 2 }] as unknown as Beer[];
const OBALY = [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }, { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 }] as unknown as Package[];
const MISTA = [{ id: 'p1', name: 'Hospoda U Lípy' }] as unknown as Place[];

const objednavka = (id: string, extra: Partial<Order> = {}): Order => ({
  id, order_date: '2026-10-12', place_id: null, place_name: 'Restaurace', source: 'rucne', status: 'nova', note: null, created_at: '2026-10-12T08:00:00Z',
  delivery_day: 'ut', delivery_date: '2026-10-20', is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null, ...extra,
});
const polozka = (id: string, orderId: string, beer: string, pkg: string, qty: number, extra: Partial<OrderItem> = {}): OrderItem => ({
  id, order_id: orderId, beer_id: beer, beer_name: beer === 'sv' ? '12° Světlá' : '12° Tmavá', package_id: pkg, package_label: pkg === 'k50' ? 'KEG 50l' : 'KEG 30l',
  quantity: qty, is_prepared: false, is_bottled: false, ...extra,
});

const O1 = objednavka('o1');
const O2 = objednavka('o2', { place_name: null, place_id: 'p1', status: 'nova', is_prepared: true, note: 'bez etikety', whatsapp_message_id: 'w1', delivery_day: 'ct', delivery_date: '2026-10-22' });
const ITEMS: Record<string, OrderItem[]> = {
  o1: [polozka('i1', 'o1', 'sv', 'k50', 2), polozka('i2', 'o1', 'tm', 'k30', 1, { is_prepared: true })],
  o2: [polozka('i3', 'o2', 'sv', 'k30', 4)],
};

function vykresli(extra: Partial<React.ComponentProps<typeof OrderTabulka>> = {}) {
  const props = {
    objednavky: [O1, O2], items: ITEMS, beers: PIVA, packages: OBALY, places: MISTA,
    selectedIds: new Set<string>(), onToggleSelect: vi.fn(),
    stockRemainingForOrder: () => new Map<string, number>(),
    renderKarta: (o: Order) => <div data-testid="karta">KARTA {o.id}<button>Smazat objednávku</button></div>,
    ...extra,
  };
  render(<OrderTabulka {...props} />);
  return props;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('OrderTabulka', () => {
  it('řádek na objednávku: odběratel, položky, kusy; jméno z katalogu, když na objednávce chybí', () => {
    vykresli();
    const radky = screen.getAllByTestId('radek-objednavky');
    expect(radky).toHaveLength(2);
    expect(radky[0].textContent).toContain('Restaurace');
    expect(radky[0].textContent).toContain('12° Světlá');
    expect(radky[0].textContent).toContain('×2');
    expect(within(radky[0]).getByText('3')).toBeTruthy();
    expect(radky[1].textContent).toContain('Hospoda U Lípy');
    expect(radky[1].textContent).toContain('×4');
  });

  it('řádek ukazuje termín, den závozu, stav, připraveno a poznámku (WhatsApp ne)', () => {
    vykresli();
    const druhy = screen.getAllByTestId('radek-objednavky')[1];
    expect(druhy.textContent).toContain('Čt');
    expect(druhy.textContent).toContain('22. 10. 2026');
    expect(druhy.textContent).toContain('Připr.');
    expect(within(druhy).queryByLabelText('WhatsApp')).toBeNull();
    expect(within(druhy).getByLabelText('Poznámka')).toBeTruthy();
    expect(within(screen.getAllByTestId('radek-objednavky')[0]).queryByLabelText('WhatsApp')).toBeNull();
  });

  it('připravená položka je přeškrtnutá', () => {
    vykresli();
    expect(screen.getByText('12° Tmavá').closest('li')!.className).toContain('line-through');
    expect(screen.getAllByText('12° Světlá')[0].closest('li')!.className).not.toContain('line-through');
  });

  it('klepnutí na řádek rozbalí původní kartu, další klepnutí ji sbalí', () => {
    const p = vykresli();
    expect(screen.queryByTestId('karta')).toBeNull();
    const radku = screen.getAllByTestId('radek-objednavky').length;
    fireEvent.click(screen.getAllByTestId('radek-objednavky')[0]);
    // Rozbalená objednávka je jen karta — řádek se souhrnem nad ní zmizí (obsah by byl dvakrát).
    expect(screen.getAllByTestId('radek-objednavky')).toHaveLength(radku - 1);
    expect(screen.getByTestId('rozbalena-objednavka').textContent).toContain('KARTA o1');
    // Karta se drží na místě a nepřeteče šířku displeje (ikony úpravy, WhatsApp… by byly za okrajem).
    expect(screen.getByTestId('rozbalena-karta-obal').className).toMatch(/sticky/);
    expect(screen.getByTestId('rozbalena-karta-obal').className).toContain('100vw');
    expect(within(screen.getByTestId('rozbalena-objednavka')).getByRole('button', { name: 'Smazat objednávku' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sbalit objednávku: Restaurace' }));
    expect(screen.queryByTestId('karta')).toBeNull();
    expect(p.onToggleSelect).not.toHaveBeenCalled();
  });

  it('tlačítko Rozbalit má aria-expanded; objednávka s otevřeným detailem je rozbalená rovnou', () => {
    vykresli({ otevrenaId: 'o2' });
    expect(screen.getByRole('button', { name: 'Sbalit objednávku: Hospoda U Lípy' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rozbalit objednávku: Restaurace' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByTestId('karta')).toHaveLength(1);
  });

  it('zaškrtnutí vybere objednávku a řádek se přitom nerozbalí', () => {
    const p = vykresli();
    fireEvent.click(screen.getByLabelText('Vybrat objednávku: Restaurace'));
    expect(p.onToggleSelect).toHaveBeenCalledWith('o1');
    expect(screen.queryByTestId('karta')).toBeNull();
  });

  it('vybraná objednávka je zaškrtnutá', () => {
    vykresli({ selectedIds: new Set(['o2']) });
    expect((screen.getByLabelText('Vybrat objednávku: Hospoda U Lípy') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Vybrat objednávku: Restaurace') as HTMLInputElement).checked).toBe(false);
  });

  it('ke konci týdne chybí: výstraha s textem; odbavená objednávka ji nemá', () => {
    const zbytek = (o: Order) => new Map(o.id === 'o1' ? [['sv__k50', -3]] : []);
    vykresli({ stockRemainingForOrder: zbytek });
    const prvni = screen.getAllByTestId('radek-objednavky')[0];
    const vystraha = within(prvni).getByTestId('schodek-objednavky');
    expect(vystraha.getAttribute('title')).toContain('12° Světlá KEG 50 L 3 ks');
    cleanup();
    vykresli({ objednavky: [objednavka('o1', { is_delivered: true })], stockRemainingForOrder: zbytek });
    expect(screen.queryByTestId('schodek-objednavky')).toBeNull();
  });

  it('filtr piva schová ostatní položky a řekne to', () => {
    vykresli({ itemMatchesFilter: (i) => i.beer_id === 'sv' });
    const prvni = screen.getAllByTestId('radek-objednavky')[0];
    expect(prvni.textContent).not.toContain('12° Tmavá');
    expect(prvni.textContent).toContain('Filtr schoval 1 položku');
    // Sloupec Ks ukazuje kusy podle filtru a pod nimi, kolik je v celé objednávce (20. 10. 2026).
    expect(prvni.textContent).toContain('z 3');
  });

  it('prázdný seznam i objednávka bez položek', () => {
    vykresli({ objednavky: [objednavka('o9')], items: {} });
    expect(screen.getByText('bez položek')).toBeTruthy();
  });

  it('odběratel s vlastními sudy (Duck and Dog): „jeho sudy“ místo „skladem“', () => {
    const dad = objednavka('o3', { place_name: 'Duck and Dog' });
    vykresli({ objednavky: [dad], items: { o3: [polozka('i9', 'o3', 'sv', 'k50', 5)] } });
    const radek = screen.getAllByTestId('radek-objednavky')[0];
    expect(within(radek).getByTestId('jeho-sudy').textContent).toContain('jeho sudy');
    expect(radek.textContent).not.toContain('skladem');
  });
});
