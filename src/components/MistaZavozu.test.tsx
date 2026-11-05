// 📍 Víc míst závozu — 5. 11. 2026: „u Radek je potřeba 2 GPS, občas se vozí
// do Hradce a občas do Prahy."
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

const lookupPlaceOnline = vi.fn();
vi.mock('../lib/placeLookup', () => ({ lookupPlaceOnline: (q: string) => lookupPlaceOnline(q) }));

import { VolbaMistaZavozu, MistaZavozuEditor, GpsNahled } from './MistaZavozu';
import { HLAVNI_MISTO, type MistoRadek } from '../lib/mistaZavozu';

const RADEK = {
  name: 'Radek',
  address: 'Korunní 10, Praha 2, 120 00',
  lat: 50.0755, lng: 14.4378,
  mista_zavozu: [{ id: 'hk', nazev: 'Hradec', adresa: 'Gočárova 1, Hradec Králové', lat: 50.2092, lng: 15.8328 }],
};

describe('VolbaMistaZavozu', () => {
  it('u odběratele s jedním místem se nic neukáže', () => {
    const { container } = render(<VolbaMistaZavozu odberatel={{ name: 'Lužec', address: 'Lužec' }} mistoId={null} onVyber={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('nevybráno: žádná volba aktivní a upozornění; klepnutí uloží hodnotu', () => {
    const onVyber = vi.fn();
    render(<VolbaMistaZavozu odberatel={RADEK} mistoId={null} onVyber={onVyber} />);
    const skupina = screen.getByRole('group', { name: 'Kam se veze' });
    expect(within(skupina).getByRole('button', { name: 'Praha' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(skupina).getByRole('button', { name: 'Hradec' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('nevybráno — jede se na Praha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hradec' }));
    expect(onVyber).toHaveBeenCalledWith('hk');
    fireEvent.click(screen.getByRole('button', { name: 'Praha' }));
    expect(onVyber).toHaveBeenLastCalledWith(HLAVNI_MISTO);
  });

  it('zvolené místo je aktivní; znovu klepnout na něj nic neukládá', () => {
    const onVyber = vi.fn();
    render(<VolbaMistaZavozu odberatel={RADEK} mistoId="hk" onVyber={onVyber} />);
    expect(screen.getByRole('button', { name: 'Hradec' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(/nevybráno/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hradec' }));
    expect(onVyber).not.toHaveBeenCalled();
  });

  it('výslovně hlavní adresa je aktivní', () => {
    render(<VolbaMistaZavozu odberatel={RADEK} mistoId={HLAVNI_MISTO} onVyber={() => {}} />);
    expect(screen.getByRole('button', { name: 'Praha' }).getAttribute('aria-pressed')).toBe('true');
  });
});

function Editor({ start = [] as MistoRadek[] }) {
  const [radky, setRadky] = useState<MistoRadek[]>(start);
  return (
    <>
      <MistaZavozuEditor radky={radky} onZmena={setRadky} />
      <output data-testid="stav">{JSON.stringify(radky.map(({ nazev, adresa, gps }) => ({ nazev, adresa, gps })))}</output>
    </>
  );
}
const stav = () => JSON.parse(screen.getByTestId('stav').textContent ?? '[]');

describe('MistaZavozuEditor', () => {
  it('přidat místo, vyplnit název a vložit GPS z mapy.cz; náhled ukáže, co se uloží', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: /Přidat další místo závozu/ }));
    fireEvent.change(screen.getByLabelText('Název místa'), { target: { value: 'Hradec' } });
    fireEvent.change(screen.getByLabelText('GPS'), { target: { value: '50.2092003N, 15.8327664E' } });
    expect(stav()).toEqual([{ nazev: 'Hradec', adresa: '', gps: '50.2092003N, 15.8327664E' }]);
    expect(screen.getByText('GPS 50.209200, 15.832766')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ukázat na mapě' }).getAttribute('href')).toContain('x=15.8327664&y=50.2092003');
  });

  it('nepoznané GPS se hned ukáže', () => {
    render(<GpsNahled text="někde u Hradce" />);
    expect(screen.getByText(/GPS jsem nepoznal/)).toBeTruthy();
  });

  it('Najít GPS podle adresy vyplní adresu i GPS; víc výsledků nabídne k výběru', async () => {
    lookupPlaceOnline.mockResolvedValueOnce([{ address: 'Gočárova třída 1, Hradec Králové, 500 02', lat: 50.2092, lng: 15.8328, displayName: 'x' }]);
    render(<Editor start={[{ id: 'a', nazev: 'Hradec', adresa: 'Gočárova 1 Hradec', gps: '' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Najít GPS/ }));
    expect(await screen.findByText(/Vybráno: Gočárova třída 1/)).toBeTruthy();
    expect(lookupPlaceOnline).toHaveBeenCalledWith('Gočárova 1 Hradec');
    expect(stav()).toEqual([{ nazev: 'Hradec', adresa: 'Gočárova třída 1, Hradec Králové, 500 02', gps: '50.209200, 15.832800' }]);

    lookupPlaceOnline.mockResolvedValueOnce([
      { address: 'Hradec Králové', lat: 50.21, lng: 15.83, displayName: 'a' },
      { address: 'Hradec nad Moravicí', lat: 49.87, lng: 17.87, displayName: 'b' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Najít GPS/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Hradec nad Moravicí/ }));
    expect(stav()[0]).toMatchObject({ adresa: 'Hradec nad Moravicí', gps: '49.870000, 17.870000' });
  });

  it('místo jde odebrat', () => {
    render(<Editor start={[{ id: 'a', nazev: 'Hradec', adresa: '', gps: '' }, { id: 'b', nazev: 'Kolín', adresa: '', gps: '' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Odebrat místo Hradec' }));
    expect(stav()).toEqual([{ nazev: 'Kolín', adresa: '', gps: '' }]);
  });
});
