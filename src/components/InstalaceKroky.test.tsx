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

  it('tlačítko instalace je jen když ji prohlížeč nabízí a zavolá instalaci', () => {
    const naInstalaci = vi.fn();
    render(<InstalaceKroky pripravenaInstalace naInstalaci={naInstalaci} />);
    fireEvent.click(screen.getByText('Nainstalovat aplikaci na plochu'));
    expect(naInstalaci).toHaveBeenCalledTimes(1);
  });
});
