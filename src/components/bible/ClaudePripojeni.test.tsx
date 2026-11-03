import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const povolitClaude = vi.fn();
const nactiPripojeni = vi.fn();
const odpojitClaude = vi.fn();
vi.mock('../../lib/bibleClaudeApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleClaudeApi')>()),
  povolitClaude: (z: unknown) => povolitClaude(z),
  nactiPripojeni: () => nactiPripojeni(),
  odpojitClaude: (p: unknown) => odpojitClaude(p),
}));

import ClaudePripojeni from './ClaudePripojeni';
import { ClaudeKonektorPanel } from './ClaudeKonektorPanel';

const HLEDANI = `?response_type=code&client_id=klient_claude_0000001&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}`
  + '&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=abc';

const assign = vi.fn();
beforeEach(() => {
  povolitClaude.mockReset(); nactiPripojeni.mockReset(); odpojitClaude.mockReset(); assign.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: HLEDANI, assign } });
});

describe('schválení připojení aplikace Claude', () => {
  it('Povolit přesměruje zpátky do Claude s kódem', async () => {
    povolitClaude.mockResolvedValue({ ok: true, presmerovat: 'https://claude.ai/api/mcp/auth_callback?code=k&state=abc' });
    render(<ClaudePripojeni />);
    fireEvent.click(screen.getByRole('button', { name: 'Povolit' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=k&state=abc'));
  });

  it('Zamítnout vrátí access_denied; chyba se ukáže', async () => {
    povolitClaude.mockResolvedValue({ ok: false, zprava: 'Nemáš přístup do Pivovarské bible.' });
    render(<ClaudePripojeni />);
    fireEvent.click(screen.getByRole('button', { name: 'Povolit' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Nemáš přístup/));
    fireEvent.click(screen.getByRole('button', { name: 'Zamítnout' }));
    expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied&state=abc');
  });

  it('žádost odjinud než z Claude: nic k povolení', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: '?client_id=x&redirect_uri=https://zly.example', assign } });
    render(<ClaudePripojeni />);
    expect(screen.getByText('Neplatná žádost o připojení')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Povolit' })).toBeNull();
  });
});

describe('Správa znalostí → Aplikace Claude', () => {
  it('ukáže adresu konektoru, připojení a odpojí', async () => {
    nactiPripojeni.mockResolvedValueOnce({ ok: true, migrace: true, pripojeni: [{ pripojeni: 'p1', klient: 'Claude', od: null, naposled: null }] })
      .mockResolvedValueOnce({ ok: true, migrace: true, pripojeni: [] });
    odpojitClaude.mockResolvedValue({ ok: true });
    render(<ClaudeKonektorPanel />);
    expect(screen.getByText('https://cegrelgvkygcatupqwrx.supabase.co/functions/v1/bible-mcp')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Odpojit' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Odpojit' }));
    await waitFor(() => expect(screen.getByText(/Zatím není připojená/)).toBeTruthy());
    expect(odpojitClaude).toHaveBeenCalledWith('p1');
  });
});
