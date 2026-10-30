// Uložení nahoře (30. 10. 2026: „to uložit… musí být všude nahoře").
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PruhUlozeni } from './PruhUlozeni';

describe('PruhUlozeni', () => {
  it('ukáže tlačítko, souhrn i chybu a drží se nahoře (sticky)', () => {
    render(<PruhUlozeni souhrn="Zatím zapsáno 20 ks · 10 L" chyba="Zápis se nepovedl"><button type="submit">Uložit fasování</button></PruhUlozeni>);
    const pruh = screen.getByTestId('pruh-ulozeni');
    expect(pruh.className).toContain('sticky');
    expect(pruh.className).toContain('top-0');
    expect(screen.getByRole('button', { name: 'Uložit fasování' })).toBeTruthy();
    expect(screen.getByText('Zatím zapsáno 20 ks · 10 L')).toBeTruthy();
    expect(screen.getByText('Zápis se nepovedl')).toBeTruthy();
  });
  it('bez souhrnu a chyby jen tlačítko', () => {
    render(<PruhUlozeni souhrn={null}><button type="submit">Uložit stáčení</button></PruhUlozeni>);
    expect(screen.getByTestId('pruh-ulozeni').textContent).toBe('Uložit stáčení');
  });
});
