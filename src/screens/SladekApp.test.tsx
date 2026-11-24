// 🍺 Samostatná aplikace AI sládek (R39): kořen na adrese /sladek/. Chat, hledání i čtečka jsou stejné
// komponenty jako v Pivovarské bibli (mají vlastní testy) — tady se hlídá jen to, co přidává tahle obrazovka:
// přihlášení, přístup, záhlaví a čtení stránky z citace se zachovaným rozepsaným chatem.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

type Stav = {
  session: unknown; user: { email: string } | null; profile: { role: string; permissions?: unknown } | null; loading: boolean;
};
let stav: Stav;
const signOut = vi.fn();
vi.mock('../lib/auth', () => ({ useAuth: () => ({ ...stav, signOut }) }));
vi.mock('./AuthScreen', () => ({ default: () => <div>Přihlašovací obrazovka</div> }));
vi.mock('../components/bible/BibleAiSladek', () => ({
  BibleAiSladek: ({ otevri, role, doKnihovny }: { otevri: (id: string, list: number) => void; role: string | null; doKnihovny?: () => void }) => {
    const [text, setText] = useState('');
    return (
      <div data-testid="chat" data-role={String(role)} data-knihovna={String(Boolean(doKnihovny))}>
        <input aria-label="Rozepsaná otázka" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" onClick={() => otevri('11111111-2222-3333-4444-555555555555', 12)}>Citace [1]</button>
      </div>
    );
  },
}));
vi.mock('../components/bible/BibleKniha', () => ({
  default: ({ id, pocatecniList, doKnihovny }: { id: string; pocatecniList?: number | null; doKnihovny?: () => void }) => (
    <div data-testid="ctecka" data-knihovna={String(Boolean(doKnihovny))}>Čtečka {id} list {pocatecniList}</div>
  ),
}));

import SladekApp from './SladekApp';

const prihlaseny = (profile: Stav['profile']): Stav => ({ session: { access_token: 't' }, user: { email: 'honza@pivovar.cz' }, profile, loading: false });

beforeEach(() => {
  signOut.mockReset();
  stav = prihlaseny({ role: 'admin' });
});
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

describe('AI sládek jako samostatná aplikace: přihlášení a přístup', () => {
  it('při načítání ukáže jen značku a kolečko — ani chat, ani přihlášení', () => {
    stav = { session: null, user: null, profile: null, loading: true };
    render(<SladekApp />);
    expect(screen.getByText('AI sládek')).toBeTruthy();
    expect(screen.queryByTestId('chat')).toBeNull();
    expect(screen.queryByText('Přihlašovací obrazovka')).toBeNull();
  });

  it('bez přihlášení ukáže přihlašovací obrazovku a žádný chat', () => {
    stav = { session: null, user: null, profile: null, loading: false };
    render(<SladekApp />);
    expect(screen.getByText('Přihlašovací obrazovka')).toBeTruthy();
    expect(screen.queryByTestId('chat')).toBeNull();
  });

  it('bez povolení Pivovarské bible řekne, kde přístup získat, a chat vůbec nenačte', () => {
    stav = prihlaseny({ role: 'user', permissions: { dashboard: { view: true, edit: true } } });
    render(<SladekApp />);
    const upozorneni = screen.getByRole('alert').textContent ?? '';
    expect(upozorneni).toMatch(/K AI sládkovi nemáš přístup/);
    expect(upozorneni).toMatch(/Uživatelé → Práva → „Pivovarská bible“/);
    expect(screen.queryByTestId('chat')).toBeNull();
    // záhlaví s odhlášením zůstává — i bez přístupu se dá odhlásit a přihlásit jiným účtem
    expect(screen.getByRole('button', { name: /Odhlásit/ })).toBeTruthy();
  });

  it('role v bibli se bere z práv: správce spravuje, čtenář čte, přispěvatel přispívá', () => {
    for (const [profil, role] of [
      [{ role: 'admin' }, 'spravuje'],
      [{ role: 'user', permissions: { bible: { view: true, edit: false } } }, 'cte'],
      [{ role: 'user', permissions: { bible: { view: true, edit: true } } }, 'prispiva'],
    ] as const) {
      stav = prihlaseny(profil);
      const v = render(<SladekApp />);
      expect(screen.getByTestId('chat').getAttribute('data-role'), JSON.stringify(profil)).toBe(role);
      v.unmount();
    }
  });
});

describe('AI sládek jako samostatná aplikace: obrazovka', () => {
  it('záhlaví má nadpis AI sládek, odkaz do hlavní aplikace a odhlášení s e-mailem; správa knihovny se nenabízí', () => {
    render(<SladekApp />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('AI sládek');
    expect(screen.getByRole('link', { name: 'Otevřít aplikaci Pivovar Zajíc' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: 'Odhlásit (honza@pivovar.cz)' })).toBeTruthy();
    // „Přidat další knihu“ vede do Knihovny, která je jen v hlavní aplikaci
    expect(screen.getByTestId('chat').getAttribute('data-knihovna')).toBe('false');
  });

  it('odhlášení zavolá odhlášení účtu aplikace', () => {
    render(<SladekApp />);
    fireEvent.click(screen.getByRole('button', { name: /Odhlásit/ }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('AI sládek jako samostatná aplikace: čtení stránky z citace', () => {
  const otevriCitaci = () => fireEvent.click(screen.getByRole('button', { name: 'Citace [1]' }));

  it('klepnutí na citaci otevře stránku knihy; chat zůstane načtený (jen skrytý) i s rozepsanou otázkou', async () => {
    render(<SladekApp />);
    fireEvent.change(screen.getByLabelText('Rozepsaná otázka'), { target: { value: 'Jak dlouho kvasit ležák?' } });
    otevriCitaci();
    const ctecka = await screen.findByTestId('ctecka');
    expect(ctecka.textContent).toBe('Čtečka 11111111-2222-3333-4444-555555555555 list 12');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Čtení knihy');
    expect(screen.getByTestId('chat').parentElement?.hidden).toBe(true);
    // Tlačítko do knihovny ve čtečce není — návrat je šipkou Zpět v záhlaví.
    expect(ctecka.getAttribute('data-knihovna')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Zpět na chat' }));
    await waitFor(() => expect(screen.queryByTestId('ctecka')).toBeNull());
    // Šipka v záhlaví vrací v historii o krok — nezůstane po ní krok navíc, který by tlačítko Zpět v telefonu „spolklo“.
    await waitFor(() => expect(window.history.state?.sladekKniha).toBeFalsy());
    expect(screen.getByTestId('chat').parentElement?.hidden).toBe(false);
    expect((screen.getByLabelText('Rozepsaná otázka') as HTMLInputElement).value).toBe('Jak dlouho kvasit ležák?');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('AI sládek');
  });

  it('čtení stránky přidá krok do historie, takže tlačítko Zpět v telefonu zavře čtečku a nevyskočí z aplikace', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<SladekApp />);
    expect(pushState).not.toHaveBeenCalled();
    otevriCitaci();
    await screen.findByTestId('ctecka');
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ sladekKniha: true });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.queryByTestId('ctecka')).toBeNull();
    expect(screen.getByTestId('chat').parentElement?.hidden).toBe(false);
  });

  it('další citace otevře jinou stránku a čtečka se načte znovu', async () => {
    render(<SladekApp />);
    otevriCitaci();
    await screen.findByTestId('ctecka');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    otevriCitaci();
    expect((await screen.findByTestId('ctecka')).textContent).toContain('list 12');
  });
});
