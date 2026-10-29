// Modal: úsporná varianta pro seznamy (29. 10. 2026, majitel: u okna Odběratel je „zbytečně
// kolem nadpisu nahoře prázdného místa“ — na telefonu `.card` obalí celé okno rámečkem
// a hlavička je vysoká). Běžná okna zůstávají beze změny.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from './ui';

const vykresli = (kompaktni?: boolean) => {
  render(
    <Modal open onClose={() => {}} title="Okno" kompaktni={kompaktni}>
      <p>obsah</p>
    </Modal>,
  );
  const hlavicka = screen.getByRole('heading', { name: 'Okno' }).parentElement as HTMLElement;
  return {
    karta: hlavicka.parentElement as HTMLElement,
    hlavicka,
    telo: screen.getByText('obsah').parentElement as HTMLElement,
  };
};

describe('Modal', () => {
  it('běžné okno: hlavička s odsazením 24 × 16 px a tělo s odsazením 24 px', () => {
    const { karta, hlavicka, telo } = vykresli();
    expect(karta.className).not.toContain('modal-kompaktni');
    expect(hlavicka.className).toContain('px-6');
    expect(hlavicka.className).toContain('py-4');
    expect(telo.className).toContain('p-6');
  });

  it('kompaktní okno: nižší hlavička, bez rámečku kolem okna a bez odsazení těla (obsah si ho řeší sám)', () => {
    const { karta, hlavicka, telo } = vykresli(true);
    expect(karta.className).toContain('modal-kompaktni');
    expect(hlavicka.className).toContain('py-2');
    expect(hlavicka.className).not.toContain('py-4');
    expect(telo.className).not.toContain('p-6');
  });

  it('nadpis a tlačítko Zavřít zůstávají i v kompaktním okně', () => {
    vykresli(true);
    expect(screen.getByRole('heading', { name: 'Okno' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zavřít' })).toBeTruthy();
  });
});
