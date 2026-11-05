// Okno Nakládka na ploše — 5. 11. 2026: „dnes se má zvézt Lužec a Seeberg,
// proč je tam nevidím a vidím tam závoz na příští týden? oprav to."
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { nakladkyPoDnech } from '../lib/nalozitNaZavoz';

vi.mock('../lib/supabase', () => ({ beerBg: () => '#e5e5e5' }));

import NakladkaOkno from './NakladkaOkno';

const obj = (delivery_date: string, place_name: string, polozky: [string, string, number][], extra: Record<string, unknown> = {}) => ({
  delivery_date, status: 'nova', place_name, is_delivered: false,
  order_items: polozky.map(([beer_name, package_label, quantity]) => ({ beer_name, package_label, quantity })),
  ...extra,
});

// Stav databáze ve čtvrtek 5. 11. 2026 ráno (jen počty, jména podle obrazovky Objednávky).
const OBJEDNAVKY = [
  obj('2026-11-05', 'Lužec', [['12° Světlá', '50l', 2], ['12° Světlá', '30l', 2], ['12° Tmavá', '30l', 4]]),
  obj('2026-11-05', 'Seeberg', [['12° Světlá', '30l', 2], ['Jantar', '30l', 1]]),
  obj('2026-11-12', 'Neznámý odběratel', [['11° Světlá', '30l', 30], ['Citron', '30l', 15]]),
];

describe('NakladkaOkno — výchozí den', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T08:30:00+01:00'));
    try { localStorage.removeItem('pivovar_nakladka_sbaleno'); } catch { /* bez úložiště */ }
  });
  afterEach(() => { vi.useRealTimers(); });

  it('ve čtvrtek ráno ukáže dnešní závoz (Lužec, Seeberg), ne příští čtvrtek', () => {
    const onOtevrit = vi.fn();
    render(<NakladkaOkno nakladky={nakladkyPoDnech(OBJEDNAVKY, '2026-11-05')} barvaPiva={() => null} onOtevrit={onOtevrit} />);
    expect(screen.getByText('Nakládka Dnes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Dnes \d/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Čt 12\. 11\. \d/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/Lužec, Seeberg/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít rozvoz' }));
    expect(onOtevrit).toHaveBeenCalledWith('2026-11-05');
  });

  it('příští čtvrtek jde rozkliknout a Rozvoz se otevře na jeho datu', () => {
    const onOtevrit = vi.fn();
    render(<NakladkaOkno nakladky={nakladkyPoDnech(OBJEDNAVKY, '2026-11-05')} barvaPiva={() => null} onOtevrit={onOtevrit} />);
    fireEvent.click(screen.getByRole('button', { name: /^Čt 12\. 11\. \d/ }));
    expect(screen.getByText('Nakládka Čt 12. 11.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít rozvoz' }));
    expect(onOtevrit).toHaveBeenCalledWith('2026-11-12');
  });

  it('když dnešní závoz odjel, ukáže nejbližší další', () => {
    const odjelo = OBJEDNAVKY.map((o) => (o.delivery_date === '2026-11-05' ? { ...o, is_delivered: true } : o));
    render(<NakladkaOkno nakladky={nakladkyPoDnech(odjelo, '2026-11-05')} barvaPiva={() => null} onOtevrit={() => {}} />);
    expect(screen.getByText('Nakládka Čt 12. 11.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Dnes \d/ })).toBeNull();
  });
});
