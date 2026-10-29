import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileText, Store } from 'lucide-react';
import { ObloukNavigace, jeVidet, maxOtoceni, uhelPolozky } from './ObloukNavigace';

const polozky = [
  { id: 'fasovani', label: 'Fasování', Icon: Store, barva: '#c4161c', aktivni: false },
  { id: 'orders_detail', label: 'Přehled obj.', Icon: FileText, barva: '#3f7d20', aktivni: true, odznak: 3 },
];

// jsdom nemá PointerEvent — bez něj by tah neměl souřadnice.
if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {} as typeof MouseEvent;
}

describe('navigace obloukem', () => {
  it('jedna řada: položky po 30°, točit se dá jen tak daleko, aby šlo dojet na poslední', () => {
    expect([0, 1, 2, 3].map((i) => uhelPolozky(i, 0))).toEqual([180, 150, 120, 90]);
    expect(jeVidet(uhelPolozky(4, 0))).toBe(false);
    expect(maxOtoceni(4)).toBe(0);
    expect(maxOtoceni(7)).toBe(90);
    expect(jeVidet(uhelPolozky(6, maxOtoceni(7)))).toBe(true);
    expect(jeVidet(uhelPolozky(0, maxOtoceni(7)))).toBe(false);
  });

  it('tahem prstu se oblouk otočí a schovaná položka se ukáže', () => {
    const sest = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, label: `Pol ${id}`, Icon: Store, barva: '#333', aktivni: false }));
    const vyber = vi.fn();
    render(<ObloukNavigace polozky={sest} domuAktivni={false} barvaDomu="#6d4fd8" onVyber={vyber} onDomu={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    expect(screen.queryByRole('button', { name: 'Pol e' })).toBeNull();
    // táhne se za položky (pruh pod nimi klepnutí propouští)
    const kruh = screen.getByRole('button', { name: 'Pol a' });
    const W = window.innerWidth, H = window.innerHeight, S = 46;
    // prst vlevo od Domů (180°) → nad Domů (90°): otočení o 90°, strop je 60°
    fireEvent.pointerDown(kruh, { clientX: W - S - 150, clientY: H - S });
    fireEvent.pointerMove(kruh, { clientX: W - S, clientY: H - S - 150 });
    fireEvent.pointerUp(kruh);
    expect(screen.getByRole('button', { name: 'Pol e' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pol f' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pol a' })).toBeNull();
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

  it('trvalý pruh: položky jsou vidět hned, bez tlačítka Menu', () => {
    render(<ObloukNavigace polozky={polozky} domuAktivni={false} barvaDomu="#6d4fd8" onVyber={() => {}} onDomu={() => {}} trvaly />);
    expect(screen.queryByRole('button', { name: /Menu/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Fasování/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Domů/ })).toBeTruthy();
  });
});
