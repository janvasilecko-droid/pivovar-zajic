import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PrehledVarek } from '../../../bible/supabase/functions/_shared/varky-popisy.ts';

// Vymyšlené várky a receptura — žádná skutečná data.
const REC = 'aaaaaaaa-1111-2222-3333-444444444444';
const V1 = 'bbbbbbbb-1111-2222-3333-000000000001';
const V2 = 'bbbbbbbb-1111-2222-3333-000000000002';
const PIV = 'cccccccc-1111-2222-3333-444444444444';
const nactiVarky = vi.fn();
const ulozVarku = vi.fn();
const smazVarku = vi.fn();
const ulozRecepturu = vi.fn();
const smazRecepturu = vi.fn();
vi.mock('../../lib/bibleVarkyApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleVarkyApi')>()),
  nactiVarky: () => nactiVarky(),
  ulozVarku: (...a: unknown[]) => ulozVarku(...a),
  smazVarku: (...a: unknown[]) => smazVarku(...a),
  ulozRecepturu: (...a: unknown[]) => ulozRecepturu(...a),
  smazRecepturu: (...a: unknown[]) => smazRecepturu(...a),
}));
const nactiTechnologii = vi.fn();
vi.mock('../../lib/bibleTechnologieApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleTechnologieApi')>()),
  nactiTechnologii: () => nactiTechnologii(),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: { id: 'ja' } }) }));
vi.mock('../../lib/businessDate', () => ({ businessDateISO: () => '2026-11-11' }));
const oznam = vi.fn();
const potvrd = vi.fn(async (..._a: unknown[]) => true);
vi.mock('../../lib/toast', () => ({ oznam: (t: string) => oznam(t), potvrd: (...a: unknown[]) => potvrd(...a) }));

import { BibleVarky } from './BibleVarky';

const meta = { pivovar_id: null, zapsal: 'ja', zapsal_jmeno: 'Honza', upraveno_at: null };
const prehled = (): PrehledVarek => ({
  receptury: [{
    id: REC, nazev: 'Světlý ležák 11', styl: 'český ležák', cil_objem_hl: 10, cil_stupnovitost: 11.2, cil_alkohol: null, cil_ibu: null, cil_barva_ebc: null,
    suroviny: [{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: 180, jednotka: 'kg' }], kroky: [{ faze: 'rmutovani', nazev: 'Nástřik', teplota_c: 52, minut: 15 }], poznamka: null, ...meta,
  }],
  varky: [
    { id: V2, receptura_id: REC, cislo: '2', pivo: 'Světlý ležák 11', datum_varu: '2026-11-10', hodnoty: { mladina_objem_hl: 10.1, mladina_p: 11.0, sypani_kg: 180 }, poznamka: null, ...meta, zapsal: 'jiny' },
    { id: V1, receptura_id: REC, cislo: '1', pivo: 'Světlý ležák 11', datum_varu: '2026-11-03', hodnoty: { mladina_objem_hl: 10.4, mladina_p: 11.3, sypani_kg: 180 }, poznamka: 'Pomalé scezování.', ...meta },
  ],
});

beforeEach(() => {
  for (const f of [nactiVarky, ulozVarku, smazVarku, ulozRecepturu, smazRecepturu, nactiTechnologii, oznam]) f.mockReset();
  potvrd.mockReset().mockResolvedValue(true);
  nactiVarky.mockResolvedValue({ stav: 'ok', prehled: prehled(), migrace: true });
  nactiTechnologii.mockResolvedValue({ stav: 'ok', technologie: { pivovary: [{ id: PIV, nazev: 'Pivovar', popis: null, hlavni: true, zalozilJmeno: null, upraveno: null }], pivovarId: PIV, zarizeni: [], postupy: [], migrace: true } });
  ulozVarku.mockResolvedValue({ stav: 'ok', data: 'nova' });
  ulozRecepturu.mockResolvedValue({ stav: 'ok', data: REC });
});

describe('receptury a várky', () => {
  it('seznam várek od nejnovější se souhrnem; čtenář nic nezapisuje', async () => {
    render(<BibleVarky role="cte" />);
    const seznam = await screen.findByRole('list', { name: 'Várky' });
    expect(within(seznam).getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'č. 2 · Světlý ležák 11 · 10. 11. 2026', 'č. 1 · Světlý ležák 11 · 3. 11. 2026',
    ]);
    expect(within(seznam).getAllByText(/Varní výtěžek: 6\d,\d %/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Zapsat várku/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upravit/ })).toBeNull();
  });

  it('bez migrace řekne, kterou migraci pustit', async () => {
    nactiVarky.mockResolvedValue({ stav: 'ok', prehled: { receptury: [], varky: [] }, migrace: false });
    render(<BibleVarky role="spravuje" />);
    expect(await screen.findByText(/20261111010000_bible_varky/)).toBeTruthy();
  });

  it('porovnání dvou várek: od nejstarší, cíl a odchylka, výtěžek z výpočetního modulu', async () => {
    render(<BibleVarky role="cte" />);
    await screen.findByRole('list', { name: 'Várky' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Porovnat várku č. 1/ }));
    expect(screen.queryByRole('button', { name: /Porovnat vybrané/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Porovnat várku č. 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Porovnat vybrané (2)' }));
    const tab = screen.getByRole('region', { name: 'Porovnání várek' });
    const hlavicka = within(tab).getAllByRole('columnheader').map((h) => h.textContent);
    expect(hlavicka).toEqual(['Hodnota', 'č. 13. 11. 2026', 'č. 210. 11. 2026']);
    const extrakt = within(tab).getByRole('row', { name: /Extrakt mladiny/ });
    expect(within(extrakt).getByText('cíl 11,2 · +0,1')).toBeTruthy();
    expect(within(extrakt).getByText('cíl 11,2 · −0,2')).toBeTruthy();
    expect(within(tab).getByRole('row', { name: /Varní výtěžek/ })).toBeTruthy();
    expect(within(tab).getByText(/Objem sladiny před chmelovarem/)).toBeTruthy();
  });

  it('zápis várky: receptura předvyplní pivo a ukáže cíl; čísla s čárkou; pivovar se přiřadí', async () => {
    render(<BibleVarky role="prispiva" />);
    await screen.findByRole('list', { name: 'Várky' });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat várku/ }));
    const form = screen.getByRole('form', { name: 'Várka' });
    fireEvent.change(within(form).getByLabelText('Receptura (volitelné)'), { target: { value: REC } });
    expect((within(form).getByLabelText('Pivo') as HTMLInputElement).value).toBe('Světlý ležák 11');
    expect(within(form).getByText(/cíl 11,2/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Číslo várky (volitelné)'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText(/^Extrakt mladiny \(původní extrakt\)/), { target: { value: '11,4' } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Uložit várku' })); });
    expect(ulozVarku).toHaveBeenCalledTimes(1);
    const [id, v] = ulozVarku.mock.calls[0];
    expect(id).toBeNull();
    expect(v).toMatchObject({ recepturaId: REC, pivovarId: PIV, cislo: '3', pivo: 'Světlý ležák 11', datumVaru: '2026-11-11', hodnoty: { mladina_p: '11,4' } });
    expect(oznam).toHaveBeenCalledWith('Várka zapsaná.');
  });

  it('nečíselná hodnota se neuloží a hláška řekne kterou', async () => {
    render(<BibleVarky role="prispiva" />);
    await screen.findByRole('list', { name: 'Várky' });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat várku/ }));
    const form = screen.getByRole('form', { name: 'Várka' });
    fireEvent.change(within(form).getByLabelText('Pivo'), { target: { value: 'Ležák' } });
    fireEvent.change(within(form).getByLabelText(/^pH rmutu/), { target: { value: 'kyselé' } });
    expect(within(form).getByRole('alert').textContent).toBe('pH rmutu: „kyselé" není číslo.');
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Uložit várku' })); });
    expect(ulozVarku).not.toHaveBeenCalled();
  });

  it('smazat smí autor svou várku; cizí ne (správce ano)', async () => {
    smazVarku.mockResolvedValue({ stav: 'ok', data: undefined });
    const { unmount } = render(<BibleVarky role="prispiva" />);
    const seznam = await screen.findByRole('list', { name: 'Várky' });
    const [cizi, moje] = within(seznam).getAllByRole('listitem');
    expect(within(cizi).queryByRole('button', { name: /Smazat/ })).toBeNull();
    await act(async () => { fireEvent.click(within(moje).getByRole('button', { name: /Smazat/ })); });
    expect(smazVarku).toHaveBeenCalledWith(V1);
    unmount();
    render(<BibleVarky role="spravuje" />);
    const seznam2 = await screen.findByRole('list', { name: 'Várky' });
    expect(within(within(seznam2).getAllByRole('listitem')[0]).getByRole('button', { name: /Smazat/ })).toBeTruthy();
  });

  it('záložka Receptury: cíle, suroviny a kroky; nová receptura se uloží', async () => {
    render(<BibleVarky role="prispiva" />);
    await screen.findByRole('list', { name: 'Várky' });
    fireEvent.click(screen.getByRole('button', { name: 'Receptury (1)' }));
    const karta = screen.getByRole('list', { name: 'Receptury' });
    expect(within(karta).getByText('Cíle: 10 hl · 11,2 °P')).toBeTruthy();
    expect(within(karta).getByText(/Plzeňský/)).toBeTruthy();
    expect(within(karta).getByText('Várek s touto recepturou: 2 · zapsal Honza')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nová receptura/ }));
    const form = screen.getByRole('form', { name: 'Receptura' });
    fireEvent.change(within(form).getByLabelText('Název receptury'), { target: { value: 'Tmavé 12' } });
    fireEvent.change(within(form).getByLabelText('Název suroviny 1'), { target: { value: 'Mnichovský' } });
    fireEvent.change(within(form).getByLabelText('Množství suroviny 1'), { target: { value: '150' } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Uložit recepturu' })); });
    expect(ulozRecepturu).toHaveBeenCalledTimes(1);
    expect(ulozRecepturu.mock.calls[0][0]).toBeNull();
    expect(ulozRecepturu.mock.calls[0][1]).toMatchObject({ nazev: 'Tmavé 12', pivovarId: PIV });
    await waitFor(() => expect(oznam).toHaveBeenCalledWith('Receptura zapsaná.'));
  });
});
