import { describe, it, expect, vi } from 'vitest';
import { getVehicleExpiryStatus } from './vozidla';
import * as businessDate from './businessDate';

// 🚧 16. 9. 2026: „dnes" se počítalo jako lokální půlnoc, cílové datum jako
// UTC půlnoc — v ČR (UTC+1/+2) to systematicky posouvalo výsledek o den.
// Dokument platný přesně do dneška hlásil „vyprší za 1 den" a dokument
// prošlý včera hlásil „vyprší za 0 dní" místo EXPIROVALO.
describe('getVehicleExpiryStatus — dnešek a cíl se počítají stejně (žádný UTC/lokální posun)', () => {
  it('dokument platný přesně do dneška hlásí 0 dní, ne 1', () => {
    vi.spyOn(businessDate, 'businessDateISO').mockReturnValue('2026-09-16');
    const vysledek = getVehicleExpiryStatus('2026-09-16');
    expect(vysledek.daysLeft).toBe(0);
    vi.restoreAllMocks();
  });

  it('dokument prošlý včera je EXPIROVALO (−1 den), ne „vyprší za 0 dní"', () => {
    vi.spyOn(businessDate, 'businessDateISO').mockReturnValue('2026-09-16');
    const vysledek = getVehicleExpiryStatus('2026-09-15');
    expect(vysledek.status).toBe('expired');
    expect(vysledek.daysLeft).toBe(-1);
    vi.restoreAllMocks();
  });

  it('dokument platný zítra hlásí 1 den', () => {
    vi.spyOn(businessDate, 'businessDateISO').mockReturnValue('2026-09-16');
    const vysledek = getVehicleExpiryStatus('2026-09-17');
    expect(vysledek.daysLeft).toBe(1);
    expect(vysledek.status).toBe('warning');
    vi.restoreAllMocks();
  });
});
