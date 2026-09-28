// Z provozu 28. 9. 2026: „ten rozvoz udělej tak jako co stočit — když nic
// není, je prázdný k rozkliknutí, když ne, tak se zobrazí, co je k závozu".
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoNalozitOkno } from './CoNalozitOkno';

const nalozit = {
  datum: '2026-09-29', objednavek: 2, mista: ['Hospoda A', 'Hospoda B'], kusuCelkem: 9,
  polozky: [{ pivo: '12° Světlá', obal: 'KEG 50l', kusu: 7 }, { pivo: '10° Desítka', obal: 'KEG 30l', kusu: 2 }],
};

describe('CoNalozitOkno', () => {
  it('když je co naložit, je otevřené a ukáže piva', () => {
    render(<CoNalozitOkno nalozit={nalozit} barvyPiv={new Map([['12° světlá', '#f4c430']])} onOtevrit={() => {}} />);
    expect(screen.getByText('12° Světlá')).toBeTruthy();
    expect(screen.getByText('× 7')).toBeTruthy();
    expect(screen.getByText(/Hospoda A, Hospoda B/)).toBeTruthy();
  });

  it('když nic nejede, je sbalené a dá se rozkliknout', () => {
    const onOtevrit = vi.fn();
    render(<CoNalozitOkno nalozit={null} barvyPiv={new Map()} onOtevrit={onOtevrit} />);
    expect(screen.getByText('Rozvoz — nic k závozu')).toBeTruthy();
    expect(screen.queryByText('Otevřít Rozvoz')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /nic k závozu/ }));
    expect(screen.getByText(/zatím nic k závozu/)).toBeTruthy();
    fireEvent.click(screen.getByText('Otevřít Rozvoz'));
    expect(onOtevrit).toHaveBeenCalled();
  });
});
