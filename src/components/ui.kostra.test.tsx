/**
 * Kostra místo zhasnuté obrazovky (components/ui.tsx).
 *
 * Jedenáct obrazovek dělalo `if (loading) return <Spinner />`, což obsah
 * ODMOUNTUJE — a prohlížeč u prázdné stránky srazí odrolování na nulu, takže
 * se stránka po načtení poskočí úplně nahoru. Kostra drží zhruba tvar toho,
 * co se načítá, takže oko ví, kam se dívat, a nic neposkakuje.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kostra } from './ui';

describe('Kostra', () => {
  it('vykreslí zadaný počet naznačených řádků', () => {
    const { container } = render(<Kostra radku={4} hlavicka={false} />);
    // Řádky seznamu jsou jediné potomky, když je hlavička vypnutá.
    expect(container.querySelectorAll('.rounded-lg').length).toBe(4);
  });

  it('řekne odečítači obrazovky, že se načítá', () => {
    // Bez tohohle je kostra pro nevidomého jen ticho: nic nečte, nic se
    // neděje, a přitom se čeká na data.
    render(<Kostra />);
    const prvek = screen.getByLabelText('Načítám');
    expect(prvek.getAttribute('aria-busy')).toBe('true');
  });

  it('hlavička jde vypnout — uvnitř karty s tabulkou se nehodí', () => {
    const { container: s } = render(<Kostra radku={2} hlavicka />);
    const { container: bez } = render(<Kostra radku={2} hlavicka={false} />);
    expect(s.querySelectorAll('.rounded-lg').length)
      .toBeGreaterThan(bez.querySelectorAll('.rounded-lg').length);
  });
});
