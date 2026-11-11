import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WebZdroj } from '../../../bible/supabase/functions/_shared/web-popisy.ts';
import type { Problem } from '../../../bible/supabase/functions/_shared/problemy-popisy.ts';
import type { PrehledVarek } from '../../../bible/supabase/functions/_shared/varky-popisy.ts';

// Vymyšlené zdroje, problémy a várky — žádná skutečná data.
const W1 = 'aaaaaaaa-1111-2222-3333-000000000001';
const W2 = 'aaaaaaaa-1111-2222-3333-000000000002';
const P1 = 'bbbbbbbb-1111-2222-3333-000000000001';
const V1 = 'cccccccc-1111-2222-3333-000000000001';
const V2 = 'cccccccc-1111-2222-3333-000000000002';
const nactiWebZdroje = vi.fn();
const overWebZdroj = vi.fn();
const ulozWebZdroj = vi.fn();
vi.mock('../../lib/bibleWebApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleWebApi')>()),
  nactiWebZdroje: () => nactiWebZdroje(),
  overWebZdroj: (...a: unknown[]) => overWebZdroj(...a),
  ulozWebZdroj: (...a: unknown[]) => ulozWebZdroj(...a),
  smazWebZdroj: vi.fn(),
}));
const nactiProblemy = vi.fn();
const ulozProblem = vi.fn();
const zapisZjisteni = vi.fn();
const nastavStavZjisteni = vi.fn();
vi.mock('../../lib/bibleProblemyApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleProblemyApi')>()),
  nactiProblemy: () => nactiProblemy(),
  ulozProblem: (...a: unknown[]) => ulozProblem(...a),
  zapisZjisteni: (...a: unknown[]) => zapisZjisteni(...a),
  nastavStavZjisteni: (...a: unknown[]) => nastavStavZjisteni(...a),
  smazProblem: vi.fn(),
  smazZjisteni: vi.fn(),
}));
const nactiVarky = vi.fn();
vi.mock('../../lib/bibleVarkyApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleVarkyApi')>()),
  nactiVarky: () => nactiVarky(),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: { id: 'ja' } }) }));
const oznam = vi.fn();
const potvrd = vi.fn(async (..._a: unknown[]) => true);
vi.mock('../../lib/toast', () => ({ oznam: (t: string) => oznam(t), potvrd: (...a: unknown[]) => potvrd(...a) }));

import { BibleWebZdroje } from './BibleWebZdroje';
import { BibleProblemy } from './BibleProblemy';
import { BibleTrendVarek, osaY } from './BibleTrendVarek';

const zdroj = (navic: Partial<WebZdroj>): WebZdroj => ({
  id: W1, url: 'https://example.org/chmel', titulek: 'Chmelení za studena', vydavatel: 'Časopis', datum_publikace: '2025-04-01', zjisteno: '2026-11-11',
  shrnuti: 'Shrnutí vlastními slovy.', oblasti: ['F'], duvera: 3, stav: 'neovereno', overil_jmeno: null, overeno_at: null, poznamka_overeni: null,
  zapsal: 'ja', zapsal_jmeno: 'Honza', pres_claude: true, ...navic,
});
const meta = { pivovar_id: null, zapsal: 'ja', zapsal_jmeno: 'Honza', upraveno_at: null };
const prehled = (): PrehledVarek => ({
  receptury: [{ id: 'r1', nazev: 'Ležák 11', styl: null, cil_objem_hl: null, cil_stupnovitost: 11.2, cil_alkohol: null, cil_ibu: null, cil_barva_ebc: null, suroviny: [], kroky: [], poznamka: null, ...meta }],
  varky: [
    { id: V2, receptura_id: 'r1', cislo: '114', pivo: 'Ležák 11', datum_varu: '2026-11-10', hodnoty: { mladina_objem_hl: 10.1, mladina_p: 11.0, sypani_kg: 180 }, poznamka: null, ...meta },
    { id: V1, receptura_id: 'r1', cislo: '112', pivo: 'Ležák 11', datum_varu: '2026-11-03', hodnoty: { mladina_objem_hl: 10.4, mladina_p: 11.3, sypani_kg: 180 }, poznamka: null, ...meta },
  ],
});
const problem = (navic: Partial<Problem> = {}): Problem => ({
  id: P1, nazev: 'Nižší výtěžek', popis: 'Poslední várky o 3 % méně.', pivo: 'Ležák 11', varky: [V1, V2], oblasti: ['T'], stav: 'otevreny', reseni: null,
  zapsal: 'ja', zapsal_jmeno: 'Honza', pres_claude: false, created_at: null, upraveno_at: null,
  zjisteni: [
    { id: 'z1', typ: 'hypoteza', text: 'Hrubší šrot po výměně válců.', zdroj: null, stav: 'navrzeno', zapsal: 'jiny', zapsal_jmeno: 'Honza', pres_claude: true, created_at: null },
    { id: 'z2', typ: 'chybi', text: 'Granulometrie šrotu není zapsaná.', zdroj: null, stav: 'navrzeno', zapsal: 'ja', zapsal_jmeno: 'Honza', pres_claude: false, created_at: null },
  ],
  ...navic,
});

beforeEach(() => {
  for (const f of [nactiWebZdroje, overWebZdroj, ulozWebZdroj, nactiProblemy, ulozProblem, zapisZjisteni, nastavStavZjisteni, nactiVarky, oznam]) f.mockReset();
  potvrd.mockReset().mockResolvedValue(true);
  nactiWebZdroje.mockResolvedValue({ stav: 'ok', zdroje: [zdroj({}), zdroj({ id: W2, url: 'https://example.com/x', titulek: 'Zamítnutý článek', stav: 'zamitnuto', pres_claude: false })], migrace: true });
  overWebZdroj.mockResolvedValue({ stav: 'ok', data: undefined });
  ulozWebZdroj.mockResolvedValue({ stav: 'ok', data: { novy: false, stav: 'overeno' } });
  nactiProblemy.mockResolvedValue({ stav: 'ok', problemy: [problem()], migrace: true });
  nactiVarky.mockResolvedValue({ stav: 'ok', prehled: prehled(), migrace: true });
  ulozProblem.mockResolvedValue({ stav: 'ok', data: P1 });
  zapisZjisteni.mockResolvedValue({ stav: 'ok', data: 'z3' });
  nastavStavZjisteni.mockResolvedValue({ stav: 'ok', data: undefined });
});

describe('rešerše z internetu', () => {
  it('ukáže zdroje s odkazem, stavem, důvěrou a kdo je zapsal; zamítnuté jen ve filtru', async () => {
    render(<BibleWebZdroje role="cte" />);
    const seznam = await screen.findByRole('list', { name: 'Webové zdroje' });
    const odkaz = within(seznam).getByRole('link', { name: /Chmelení za studena/ });
    expect(odkaz.getAttribute('href')).toBe('https://example.org/chmel');
    expect(odkaz.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(within(seznam).getByText('neověřeno')).toBeTruthy();
    expect(within(seznam).getByText(/Důvěra 3 · Odborný časopis/)).toBeTruthy();
    expect(within(seznam).getByText(/zapsal Claude \(konektor\) za Honza/)).toBeTruthy();
    expect(screen.queryByText('Zamítnutý článek')).toBeNull();
    fireEvent.change(screen.getByLabelText('Stav'), { target: { value: 'zamitnuto' } });
    expect(screen.getByText('Zamítnutý článek')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ověřit/ })).toBeNull();
  });

  it('správce zdroj ověří; přidání stejné adresy řekne, že už v rešerši je', async () => {
    render(<BibleWebZdroje role="spravuje" />);
    await screen.findByRole('list', { name: 'Webové zdroje' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Ověřit/ })); });
    expect(overWebZdroj).toHaveBeenCalledWith(W1, 'overeno', '');
    expect(oznam).toHaveBeenCalledWith('Zdroj ověřen.');
    fireEvent.click(screen.getByRole('button', { name: /Přidat zdroj/ }));
    const form = screen.getByRole('form', { name: 'Webový zdroj' });
    fireEvent.change(within(form).getByLabelText('Adresa (https://…)'), { target: { value: 'https://example.org/chmel' } });
    fireEvent.change(within(form).getByLabelText('Titulek'), { target: { value: 'Znovu' } });
    fireEvent.change(within(form).getByLabelText(/Shrnutí vlastními slovy/), { target: { value: 'Text' } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Uložit zdroj' })); });
    expect(oznam).toHaveBeenCalledWith('Tahle adresa už v rešerši je — nic se nezměnilo.');
  });
});

describe('analýza problémů', () => {
  it('problém ukáže zjištění po typech, porovnání dotčených várek a hypotézu jde potvrdit', async () => {
    render(<BibleProblemy role="prispiva" />);
    const seznam = await screen.findByRole('list', { name: 'Problémy' });
    fireEvent.click(within(seznam).getByRole('button', { name: /Nižší výtěžek/ }));
    expect(screen.getByText('Poslední várky o 3 % méně.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Porovnání várek' })).toBeTruthy();
    const hypotezy = screen.getByRole('list', { name: 'Hypotéza' });
    expect(within(hypotezy).getByText(/Claude \(konektor\) za Honza/)).toBeTruthy();
    // Cizí zjištění přispěvatel nesmaže, svoje ano.
    expect(within(hypotezy).queryByRole('button', { name: /Smazat/ })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Neznámá hodnota' })).getByRole('button', { name: /Smazat/ })).toBeTruthy();
    await act(async () => { fireEvent.click(within(hypotezy).getByRole('button', { name: /Potvrdit/ })); });
    expect(nastavStavZjisteni).toHaveBeenCalledWith('z1', 'potvrzeno');
    expect(oznam).toHaveBeenCalledWith('Hypotéza potvrzena.');
  });

  it('zjištění typu fakt bez zdroje nepustí; s ním se zapíše', async () => {
    render(<BibleProblemy role="prispiva" />);
    const seznam = await screen.findByRole('list', { name: 'Problémy' });
    fireEvent.click(within(seznam).getByRole('button', { name: /Nižší výtěžek/ }));
    fireEvent.click(screen.getByRole('button', { name: /Zapsat zjištění/ }));
    const form = screen.getByRole('form', { name: 'Zjištění' });
    fireEvent.change(within(form).getByLabelText('Typ zjištění'), { target: { value: 'fakt' } });
    fireEvent.change(within(form).getByLabelText('Zjištění'), { target: { value: 'Výtěžek klesá s hrubostí šrotu.' } });
    expect(within(form).getByRole('alert').textContent).toMatch(/potřebuje zdroj/);
    expect((within(form).getByRole('button', { name: 'Zapsat zjištění' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Zdroj'), { target: { value: 'Kunze, s. 158' } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Zapsat zjištění' })); });
    expect(zapisZjisteni).toHaveBeenCalledWith(P1, { typ: 'fakt', text: 'Výtěžek klesá s hrubostí šrotu.', zdroj: 'Kunze, s. 158' });
  });

  it('nový problém s dotčenými várkami a oblastí T', async () => {
    nactiProblemy.mockResolvedValue({ stav: 'ok', problemy: [], migrace: true });
    render(<BibleProblemy role="prispiva" />);
    fireEvent.click(await screen.findByRole('button', { name: /Nový problém/ }));
    const form = screen.getByRole('form', { name: 'Problém' });
    fireEvent.change(within(form).getByLabelText('Název problému'), { target: { value: 'Pěnivost' } });
    fireEvent.click(within(form).getByRole('checkbox', { name: /č. 112/ }));
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Uložit problém' })); });
    expect(ulozProblem).toHaveBeenCalledWith(null, expect.objectContaining({ nazev: 'Pěnivost', varky: [V1], oblasti: ['T'], stav: 'otevreny' }));
    await waitFor(() => expect(oznam).toHaveBeenCalledWith('Problém založen.'));
  });
});

describe('trend várek', () => {
  it('osa: hezká čísla 1·2·5 a rozsah včetně okrajů', () => {
    expect(osaY(61.9, 65.5)).toEqual({ od: 61, do: 66, kroky: [61, 62, 63, 64, 65, 66] });
    expect(osaY(11, 11.3).kroky).toEqual([11, 11.1, 11.2, 11.3]);
    expect(osaY(5, 5).kroky.length).toBeGreaterThan(1);
  });

  it('výtěžek přes várky od nejstarší; cíl receptury; poslední hodnota u čáry; tabulka', () => {
    const p = prehled();
    render(<BibleTrendVarek varky={p.varky} receptury={p.receptury} />);
    const graf = screen.getByRole('img');
    expect(graf.getAttribute('aria-label')).toMatch(/^Varní výtěžek \(výpočet\): 2 várek, od 6\d,\d % do 6\d,\d %, poslední 6\d,\d %\.$/);
    fireEvent.change(screen.getByLabelText('Hodnota'), { target: { value: 'mladina_p' } });
    fireEvent.change(screen.getByLabelText('Receptura'), { target: { value: 'r1' } });
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Extrakt mladiny (původní extrakt): 2 várek, od 11 °P do 11,3 °P, poslední 11 °P, cíl receptury 11,2 °P.');
    const tabulka = screen.getByRole('table');
    expect(within(tabulka).getAllByRole('rowheader').map((r) => r.textContent)).toEqual(['č. 112 · 3. 11. 2026', 'č. 114 · 10. 11. 2026']);
    expect(within(tabulka).getByText('+0,1')).toBeTruthy();
    // Klávesnice: šipka doleva ukáže bublinu s hodnotou.
    fireEvent.focus(screen.getByRole('img'));
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toMatch(/11,3 °P.*č. 112/);
  });

  it('hodnota, kterou nikdo nezapsal, se řekne místo prázdného grafu', () => {
    const p = prehled();
    render(<BibleTrendVarek varky={p.varky} receptury={p.receptury} />);
    fireEvent.change(screen.getByLabelText('Hodnota'), { target: { value: 'pivo_ph' } });
    expect(screen.getByText('pH piva není zapsaná (ani spočítaná) u žádné z 2 várek.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
