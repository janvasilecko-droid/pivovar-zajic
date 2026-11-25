import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstalaceKroky } from './InstalaceKroky';

describe('InstalaceKroky', () => {
  it('ukáže postup pro Android, iPhone i počítač a řekne, že to není z Google Play', () => {
    render(<InstalaceKroky pripravenaInstalace={false} naInstalaci={() => {}} />);
    expect(screen.getByText('Android (Chrome)')).toBeTruthy();
    expect(screen.getByText('iPhone (jen Safari)')).toBeTruthy();
    expect(screen.getByText('Počítač (Chrome / Edge)')).toBeTruthy();
    expect(screen.getByText(/Google Play/)).toBeTruthy();
    expect(screen.queryByText('Nainstalovat aplikaci na plochu')).toBeNull();
  });

  it('pro starší telefon odkazuje na Diagnostiku telefonu a řekne, co aktualizovat', () => {
    render(<InstalaceKroky pripravenaInstalace={false} naInstalaci={() => {}} />);
    expect(screen.getByText('Starší telefon — nejde to nebo to vypadá divně')).toBeTruthy();
    const odkaz = screen.getByText('Diagnostika telefonu').closest('a')!;
    expect(odkaz.getAttribute('href')).toBe('/diagnostika.html');
    expect(screen.getByText(/Android System WebView/)).toBeTruthy();
    expect(screen.getByText(/APK potřebuje Android 7/)).toBeTruthy();
  });

  it('při problému s ikonou odkazuje na stránku Instalace aplikace (pozná telefon, na Androidu 7+ nabídne APK)', () => {
    render(<InstalaceKroky pripravenaInstalace={false} naInstalaci={() => {}} />);
    expect(screen.getByText('Ikona se nespustí nebo to nejde?')).toBeTruthy();
    expect(screen.getByText('Instalaci aplikace').closest('a')!.getAttribute('href')).toBe('/instalace.html');
    expect(screen.getByText(/Na Androidu 7 a novějším je to stažení aplikace/)).toBeTruthy();
    // Karta s problémem je první — člověk, kterému ikona nejde, ji nemá hledat pod postupy, které nezabraly.
    const karty = [...document.querySelectorAll('.font-black.text-neutral-900')].map((e) => e.textContent);
    expect(karty[0]).toBe('Ikona se nespustí nebo to nejde?');
  });

  it('tlačítko instalace je jen když ji prohlížeč nabízí a zavolá instalaci', () => {
    const naInstalaci = vi.fn();
    render(<InstalaceKroky pripravenaInstalace naInstalaci={naInstalaci} />);
    fireEvent.click(screen.getByText('Nainstalovat aplikaci na plochu'));
    expect(naInstalaci).toHaveBeenCalledTimes(1);
  });
});
