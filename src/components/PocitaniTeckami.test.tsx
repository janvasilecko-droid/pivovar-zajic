import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PocitaniTeckami } from './PocitaniTeckami';

/**
 * jsdom obrázky nenačítá ani nekreslí, takže automatické hledání víček tu
 * neproběhne (to hlídá lib/pocitaniVicek.test.ts na pixelech). Tady se hlídá
 * druhá půlka: že se dá počítat ťukáním i tehdy, když hledání nic nenajde.
 */
class ObrazekKteryNejdeNacist {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) { setTimeout(() => this.onerror?.(), 0); }
}

function tukni(x: number, y: number) {
  fireEvent.click(screen.getByTestId('fotka-s-teckami'), { clientX: x, clientY: y });
}

describe('PocitaniTeckami', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', ObrazekKteryNejdeNacist);
    // Fotka 400 × 300 px v levém horním rohu okna.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function otevri(onPotvrdit = vi.fn()) {
    render(<PocitaniTeckami src="data:image/jpeg;base64,AAAA" onPotvrdit={onPotvrdit} onZrusit={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Označte lahve ťuknutím/)).toBeTruthy());
    return onPotvrdit;
  }

  it('bez nalezených víček nejde použít nulový počet', async () => {
    await otevri();
    expect(screen.getByTestId('pocet-tecek').textContent).toBe('0');
    expect((screen.getByRole('button', { name: /Použít počet/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ťuknutí přidá lahev, ťuknutí na tečku ji odebere a krok zpět ji vrátí', async () => {
    await otevri();
    tukni(100, 100);
    tukni(200, 150);
    expect(screen.getAllByTestId('tecka')).toHaveLength(2);

    tukni(203, 148); // na druhou tečku
    expect(screen.getAllByTestId('tecka')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Krok zpět' }));
    expect(screen.getByTestId('pocet-tecek').textContent).toBe('2');
  });

  it('potvrzení předá počet teček', async () => {
    const onPotvrdit = await otevri();
    tukni(50, 50);
    tukni(150, 50);
    tukni(250, 50);
    fireEvent.click(screen.getByRole('button', { name: 'Použít počet (3)' }));
    expect(onPotvrdit).toHaveBeenCalledWith(3);
  });

  it('tečka leží na místě ťuknutí v procentech fotky, takže drží i při zvětšení lupou', async () => {
    await otevri();
    tukni(100, 150);
    const tecka = screen.getByTestId('tecka');
    expect(tecka.style.left).toBe('25%');
    expect(tecka.style.top).toBe('50%');
  });
});
