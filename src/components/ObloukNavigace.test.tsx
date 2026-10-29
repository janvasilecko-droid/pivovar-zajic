import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileText, Store } from 'lucide-react';
import { ObloukNavigace, poziceNaOblouku } from './ObloukNavigace';

const polozky = [
  { id: 'fasovani', label: 'Fasování', Icon: Store, barva: '#c4161c', aktivni: false },
  { id: 'orders_detail', label: 'Přehled obj.', Icon: FileText, barva: '#3f7d20', aktivni: true, odznak: 3 },
];

describe('navigace obloukem', () => {
  it('rozmístí položky na čtvrtkruh; nad čtyři položky do druhého oblouku', () => {
    expect(poziceNaOblouku(2).map((p) => p.uhel)).toEqual([180, 90]);
    const sedm = poziceNaOblouku(7);
    expect(sedm.filter((p) => p.r === 112)).toHaveLength(4);
    expect(sedm.filter((p) => p.r === 196).map((p) => p.uhel)).toEqual([180, 135, 90]);
  });

  it('Domů je vidět vždycky, položky až po Menu; výběr menu zase sbalí', () => {
    const vyber = vi.fn();
    const domu = vi.fn();
    render(<ObloukNavigace polozky={polozky} domuAktivni={false} barvaDomu="#6d4fd8" onVyber={vyber} onDomu={domu} />);
    expect(screen.getByRole('button', { name: /Domů/ })).toBeTruthy();
    // Sbalené položky nejsou pro čtečku ani klávesnici.
    expect(screen.queryByRole('button', { name: /Fasování/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    fireEvent.click(screen.getByRole('button', { name: /Fasování/ }));
    expect(vyber).toHaveBeenCalledWith('fasovani');
    expect(screen.getByRole('button', { name: /Menu/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Domů/ }));
    expect(domu).toHaveBeenCalled();
  });

  it('aktivní položka je označená a nese odznak', () => {
    render(<ObloukNavigace polozky={polozky} domuAktivni={false} barvaDomu="#6d4fd8" onVyber={() => {}} onDomu={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    const prehled = screen.getByRole('button', { name: /Přehled obj\./ });
    expect(prehled.getAttribute('aria-current')).toBe('page');
    expect(prehled.textContent).toContain('3');
  });
});
