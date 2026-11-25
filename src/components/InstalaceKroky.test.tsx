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

  it('tlačítko instalace je jen když ji prohlížeč nabízí a zavolá instalaci', () => {
    const naInstalaci = vi.fn();
    render(<InstalaceKroky pripravenaInstalace naInstalaci={naInstalaci} />);
    fireEvent.click(screen.getByText('Nainstalovat aplikaci na plochu'));
    expect(naInstalaci).toHaveBeenCalledTimes(1);
  });
});
