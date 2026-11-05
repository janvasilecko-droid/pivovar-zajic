// Okno „Rezervace výčepu k objednávce“ (TapReservationModal).
//
// 5. 11. 2026, test výčepů. Okno do té doby:
//  • ukládalo rezervaci JEN do localStorage — při příštím načtení z databáze
//    zmizela, takže si obsluha „zarezervovala“ výčep, který nikde neexistoval;
//  • když v prohlížeči nebyly výčepy, nabídlo čtyři VYMYŠLENÉ (Výčep #1 — Lindr
//    Pygmy 25…) s id „t1“…„t4“, která databáze (uuid) vůbec nepřijme;
//  • kontrolovalo obsazenost jen na první a poslední den (rezervace uprostřed
//    rozsahu prošla);
//  • u objednávky, která rezervaci už měla, nabídlo její vlastní výčep jako
//    „Rezervováno“ a přesunulo ji jinam.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { TapReservation } from '../screens/VycepyScreen';

const db = vi.hoisted(() => ({
  vycepy: [] as any[],
  rezervace: [] as any[],
  ulozene: [] as any[],
  chyba: null as string | null,
  nactiVycepyChyba: false,
  zdrzeniZapisu: null as null | Promise<void>,
}));

vi.mock('../lib/vycepyData', () => ({
  nactiVycepy: vi.fn(async () => {
    if (db.nactiVycepyChyba) throw new Error('offline');
    return db.vycepy.map((v) => ({ ...v }));
  }),
  nactiRezervace: vi.fn(async () => db.rezervace.map((r) => ({ ...r }))),
  ulozRezervaci: vi.fn(async (r: TapReservation) => {
    if (db.zdrzeniZapisu) await db.zdrzeniZapisu;
    if (db.chyba) return db.chyba;
    db.ulozene.push(r);
    db.rezervace = [...db.rezervace.filter((x) => x.id !== r.id), r];
    return null;
  }),
}));

import { TapReservationModal } from './TapReservationModal';

const vycep = (id: string, nazev: string, typ = 'jednokohout') => ({ id, name: nazev, tap_type: typ, status: 'clean' });
const rez = (id: string, tap: string, od: string, doDne: string, patch: Partial<TapReservation> = {}): TapReservation => ({
  id, tap_id: tap, tap_name: `Výčep ${tap}`, date_from: od, date_to: doDne, customer_name: 'Jiný odběratel', ...patch,
});

function otevri(props: Partial<React.ComponentProps<typeof TapReservationModal>> = {}) {
  const onConfirm = vi.fn();
  const onSkip = vi.fn();
  const vysledek = render(
    <TapReservationModal
      orderDate="2026-11-12"
      customerName="Hospoda Test"
      orderId="objednavka-1"
      onConfirm={onConfirm}
      onSkip={onSkip}
      {...props}
    />,
  );
  return { ...vysledek, onConfirm, onSkip };
}

const potvrdit = () => screen.getByRole('button', { name: /Zarezervovat výčep/ });
const datumy = (kontejner: HTMLElement) => Array.from(kontejner.querySelectorAll('input[type="date"]')) as HTMLInputElement[];

beforeEach(() => {
  db.vycepy = [vycep('a', 'Výčep A'), vycep('b', 'Výčep B', 'dvojkohout')];
  db.rezervace = [];
  db.ulozene = [];
  db.chyba = null;
  db.nactiVycepyChyba = false;
  db.zdrzeniZapisu = null;
  localStorage.clear();
});

describe('TapReservationModal — které výčepy nabídne', () => {
  it('výčepy bere z databáze, ne ze starší kopie v prohlížeči', async () => {
    localStorage.setItem('vycepy_equipment_v1', JSON.stringify([vycep('x', 'Starý výčep z prohlížeče')]));
    otevri();
    expect(await screen.findByText('Výčep A')).toBeTruthy();
    expect(screen.getByText('Výčep B')).toBeTruthy();
    expect(screen.queryByText('Starý výčep z prohlížeče')).toBeNull();
  });

  it('bez založených výčepů řekne, že žádné nejsou — žádné vymyšlené', async () => {
    db.vycepy = [];
    otevri();
    expect(await screen.findByText(/Nemáte vytvořené žádné výčepy/)).toBeTruthy();
    expect(screen.queryByText(/Lindr Pygmy/)).toBeNull();
    expect(screen.queryByText(/Trojkohout Master/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Zarezervovat výčep/ })).toBeNull();
  });

  it('když se výčepy nepodaří načíst, okno to řekne (a netvrdí, že žádné nejsou)', async () => {
    db.nactiVycepyChyba = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    otevri();
    expect(await screen.findByText(/nepodařilo načíst/i)).toBeTruthy();
    expect(screen.queryByText(/Nemáte vytvořené žádné výčepy/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Zarezervovat výčep/ })).toBeNull();
  });

  it('předvybere výčep požadovaného typu', async () => {
    const { onConfirm } = otevri({ tapTypeHint: 'dvojkohout' });
    await screen.findByText('Výčep B');
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene[0].tap_id).toBe('b');
  });

  it('obsazený výčep nejde vybrat a předvybere se volný', async () => {
    db.rezervace = [rez('r0', 'a', '2026-11-12', '2026-11-12')];
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    expect(screen.getByText(/Rezervováno/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Výčep A/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene[0].tap_id).toBe('b');
  });
});

describe('TapReservationModal — potvrzení uloží do databáze', () => {
  it('rezervace se uloží přes datovou vrstvu a vrátí se volajícímu', async () => {
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene).toHaveLength(1);
    expect(db.ulozene[0]).toMatchObject({
      tap_id: 'a', tap_name: 'Výčep A', date_from: '2026-11-12', date_to: '2026-11-12',
      customer_name: 'Hospoda Test', order_id: 'objednavka-1',
    });
    expect(onConfirm.mock.calls[0][0].id).toBe(db.ulozene[0].id);
  });

  it('bez ID objednávky (rezervace před uložením objednávky) se uloží bez vazby', async () => {
    const { onConfirm } = otevri({ orderId: undefined });
    await screen.findByText('Výčep A');
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene[0].order_id).toBeUndefined();
  });

  it('odběratel a poznámka z okna se uloží', async () => {
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    fireEvent.change(screen.getByPlaceholderText('Jméno odběratele'), { target: { value: 'Zahrada U Lípy' } });
    fireEvent.change(screen.getByPlaceholderText('Volitelné'), { target: { value: 'vyzvednou v pátek' } });
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene[0]).toMatchObject({ customer_name: 'Zahrada U Lípy', note: 'vyzvednou v pátek' });
  });

  it('chyba databáze: ukáže se, okno zůstane otevřené a nic se nepotvrdí', async () => {
    db.chyba = 'permission denied for table vycepy_rezervace';
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    fireEvent.click(potvrdit());
    expect(await screen.findByText(/Rezervaci se nepodařilo uložit.*permission denied/)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect((potvrdit() as HTMLButtonElement).disabled).toBe(false);
  });

  it('dvojklik neuloží rezervaci dvakrát (tlačítko je po dobu ukládání zablokované)', async () => {
    let dokonci!: () => void;
    db.zdrzeniZapisu = new Promise<void>((r) => { dokonci = r; });
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    const tlacitko = potvrdit();
    fireEvent.click(tlacitko);
    fireEvent.click(tlacitko);
    await act(async () => { dokonci(); });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene).toHaveLength(1);
  });

  it('Přeskočit nic neuloží', async () => {
    const { onSkip, onConfirm } = otevri();
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: /Přeskočit/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(db.ulozene).toHaveLength(0);
  });
});

describe('TapReservationModal — kontrola termínu', () => {
  it('rezervace UPROSTŘED rozsahu blokuje výčep (4.–7. vs 5.–6.) — dřív prošla', async () => {
    db.rezervace = [rez('r0', 'a', '2026-11-05', '2026-11-06')];
    const { container, onConfirm } = otevri({ orderDate: '2026-11-04' });
    await screen.findByText('Výčep A');
    // Výčep A je 4. volný a je předvybraný; po prodloužení do 7. se překryje.
    fireEvent.change(datumy(container)[1], { target: { value: '2026-11-07' } });
    expect((screen.getByRole('button', { name: /Výčep A/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(potvrdit());
    expect(await screen.findByText('Tento výčep je v tomto termínu již zarezervovaný!')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(db.ulozene).toHaveLength(0);
  });

  it('mezitím ho zamluvil někdo na jiném zařízení — před zápisem se ověří čerstvý stav', async () => {
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    db.rezervace = [rez('cizi', 'a', '2026-11-12', '2026-11-12')];
    fireEvent.click(potvrdit());
    expect(await screen.findByText('Tento výčep je v tomto termínu již zarezervovaný!')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(db.ulozene).toHaveLength(0);
  });

  it('konec před začátkem se nepřijme', async () => {
    const { container, onConfirm } = otevri();
    await screen.findByText('Výčep A');
    fireEvent.change(datumy(container)[1], { target: { value: '2026-11-10' } });
    fireEvent.click(potvrdit());
    expect(await screen.findByText('Konec rezervace nesmí být před začátkem.')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(db.ulozene).toHaveLength(0);
  });

  it('prázdný odběratel se nepřijme', async () => {
    const { onConfirm } = otevri({ customerName: '' });
    await screen.findByText('Výčep A');
    fireEvent.click(potvrdit());
    expect(await screen.findByText('Zadejte odběratele.')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(db.ulozene).toHaveLength(0);
  });
});

describe('TapReservationModal — objednávka, která už rezervaci má', () => {
  const vlastni = () => rez('r1', 'b', '2026-11-12', '2026-11-14', {
    order_id: 'objednavka-1', customer_name: 'Hospoda Test', phone: '777 123 456', deposit_czk: 2000,
    note: 'kauce vybrána', is_returned: false,
  });

  it('předvybere její výčep a termín — vlastní rezervace není „obsazeno“', async () => {
    db.rezervace = [vlastni()];
    const { container } = otevri({ tapTypeHint: 'jednokohout' });
    await screen.findByText('Výčep B');
    expect(screen.queryByText(/Rezervováno/)).toBeNull();
    const [od, doDne] = datumy(container);
    expect(od.value).toBe('2026-11-12');
    expect(doDne.value).toBe('2026-11-14');
  });

  it('potvrzení rezervaci PŘEPÍŠE (stejné id), nezaloží druhou — unikátní index na order_id by ji odmítl', async () => {
    db.rezervace = [vlastni()];
    const { onConfirm } = otevri();
    await screen.findByText('Výčep B');
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene).toHaveLength(1);
    expect(db.ulozene[0].id).toBe('r1');
    expect(db.rezervace).toHaveLength(1);
  });

  it('telefon, kauce a poznámka rezervace se při potvrzení neztratí', async () => {
    db.rezervace = [vlastni()];
    const { onConfirm } = otevri();
    await screen.findByText('Výčep B');
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene[0]).toMatchObject({
      phone: '777 123 456', deposit_czk: 2000, note: 'kauce vybrána', tap_id: 'b',
      date_from: '2026-11-12', date_to: '2026-11-14',
    });
  });

  it('přesunutí na jiný výčep změní výčep, ne rezervaci', async () => {
    db.rezervace = [vlastni()];
    const { onConfirm } = otevri();
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: /Výčep A/ }));
    fireEvent.click(potvrdit());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(db.ulozene[0]).toMatchObject({ id: 'r1', tap_id: 'a', tap_name: 'Výčep A', phone: '777 123 456' });
  });
});
