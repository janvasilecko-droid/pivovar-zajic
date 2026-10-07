// Z provozu 7. 10. 2026: „ať můžu změnit datum závozu a datum objednávky,
// když se načtou fotky, ne zpětně" — víkendová objednávka zapsaná v pondělí.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DenZavozuTlacitka } from './DenZavozuTlacitka';

describe('DenZavozuTlacitka', () => {
  it('bez onDatum pole s datem není (WhatsApp)', () => {
    render(<DenZavozuTlacitka den={null} datum={null} onDen={() => {}} />);
    expect(screen.queryByLabelText('nebo datum')).toBeNull();
  });

  it('datum jde zadat i do minulosti a řekne se, že se hned odečte', () => {
    const onDatum = vi.fn();
    const { rerender } = render(
      <DenZavozuTlacitka den={null} datum={null} onDen={() => {}} onDatum={onDatum} dnes="2026-10-07" />,
    );
    fireEvent.change(screen.getByLabelText('nebo datum'), { target: { value: '2026-10-04' } });
    expect(onDatum).toHaveBeenCalledWith('2026-10-04');

    rerender(<DenZavozuTlacitka den="ne" datum="2026-10-04" onDen={() => {}} onDatum={onDatum} dnes="2026-10-07" />);
    expect((screen.getByLabelText('nebo datum') as HTMLInputElement).value).toBe('2026-10-04');
    expect(screen.getByText(/Závoz už proběhl/)).toBeTruthy();
  });

  it('závoz dnes nebo později hlášku o odečtu neukáže', () => {
    render(<DenZavozuTlacitka den="st" datum="2026-10-07" onDen={() => {}} onDatum={() => {}} dnes="2026-10-07" />);
    expect(screen.queryByText(/Závoz už proběhl/)).toBeNull();
  });
});
