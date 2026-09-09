import { describe, it, expect } from 'vitest';
import { vyhodnotBeh, type BehNasazeni } from './nasazeniStav';

const beh = (status: string, conclusion: string | null): BehNasazeni => ({
  status, conclusion, html_url: 'https://github.com/x/y/actions/runs/1', created_at: '2026-09-09T10:00:00Z',
});

describe('vyhodnotBeh', () => {
  it('žádný běh (ještě se nenačetlo, nebo GitHub nedostupný) je "neznámo"', () => {
    expect(vyhodnotBeh(null)).toBe('neznamo');
  });

  it('běžící workflow je "bezi", ne "selhalo" — nemá se strašit předčasně', () => {
    expect(vyhodnotBeh(beh('in_progress', null))).toBe('bezi');
    expect(vyhodnotBeh(beh('queued', null))).toBe('bezi');
  });

  it('dokončený úspěšný běh je v pořádku', () => {
    expect(vyhodnotBeh(beh('completed', 'success'))).toBe('v-poradku');
  });

  it('dokončený neúspěšný běh (failure) je "selhalo"', () => {
    expect(vyhodnotBeh(beh('completed', 'failure'))).toBe('selhalo');
  });

  it('zrušený nebo časem vypršelý běh se bere jako selhání — appka se nenasadila', () => {
    expect(vyhodnotBeh(beh('completed', 'cancelled'))).toBe('selhalo');
    expect(vyhodnotBeh(beh('completed', 'timed_out'))).toBe('selhalo');
  });
});
