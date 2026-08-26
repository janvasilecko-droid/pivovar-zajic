import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  toast, oznam, chyba, uspech, toastZpet, potvrd, uzavriPotvrzeni,
  zavriToast, odebirejOznameni, stavOznameni,
} from './toast';
import { normalizujCislo } from '../components/PocetInput';

// Host se v testu jen „přihlásí k odběru" — tím se modul chová jako
// v aplikaci (bez odběratele schválně padá na window.confirm, viz níže).
let odhlas: (() => void) | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  odhlas = odebirejOznameni(() => {});
  stavOznameni().toasty.slice().forEach((t) => zavriToast(t.id));
});
afterEach(() => {
  odhlas?.();
  odhlas = null;
  vi.useRealTimers();
});

describe('oznámení', () => {
  it('zobrazí zprávu se správným tónem', () => {
    uspech('Uloženo.');
    chyba(new Error('Spadlo spojení'));
    const t = stavOznameni().toasty;
    expect(t.map((x) => [x.text, x.ton])).toEqual([
      ['Uloženo.', 'uspech'],
      ['Spadlo spojení', 'chyba'],
    ]);
  });

  it('chyba() rozumí Erroru, PostgrestError i holému textu', () => {
    chyba('Rovnou text');
    chyba({ message: 'Chyba z databáze' });
    chyba(new Error('Chyba z výjimky'));
    expect(stavOznameni().toasty.map((x) => x.text)).toEqual([
      'Rovnou text', 'Chyba z databáze', 'Chyba z výjimky',
    ]);
  });

  it('drží nejvýš tři najednou — víc by zakrylo obsah', () => {
    for (let i = 1; i <= 5; i++) oznam(`Zpráva ${i}`);
    expect(stavOznameni().toasty.map((x) => x.text)).toEqual(['Zpráva 3', 'Zpráva 4', 'Zpráva 5']);
  });

  it('samo zmizí, ale s tlačítkem „Vrátit zpět" má času víc', () => {
    oznam('Bez akce');
    toastZpet('S akcí', () => {});
    const [bezAkce, sAkci] = stavOznameni().toasty;
    expect(sAkci.trvani).toBeGreaterThan(bezAkce.trvani);

    vi.advanceTimersByTime(bezAkce.trvani + 10);
    expect(stavOznameni().toasty.map((x) => x.text)).toEqual(['S akcí']);

    vi.advanceTimersByTime(sAkci.trvani);
    expect(stavOznameni().toasty).toEqual([]);
  });

  it('trvani 0 znamená, že zpráva zůstane, dokud ji někdo nezavře', () => {
    const id = toast('Zůstává', { trvani: 0 });
    vi.advanceTimersByTime(60_000);
    expect(stavOznameni().toasty).toHaveLength(1);
    zavriToast(id);
    expect(stavOznameni().toasty).toEqual([]);
  });
});

describe('potvrzení', () => {
  it('vrátí true po potvrzení a false po zrušení', async () => {
    const ano = potvrd('Smazat?');
    expect(stavOznameni().potvrzeni?.text).toBe('Smazat?');
    uzavriPotvrzeni(true);
    await expect(ano).resolves.toBe(true);

    const ne = potvrd('Smazat?');
    uzavriPotvrzeni(false);
    await expect(ne).resolves.toBe(false);
    expect(stavOznameni().potvrzeni).toBeNull();
  });

  it('druhý dotaz uzavře ten rozdělaný jako „zrušeno" — nikdo nesmí čekat navždy', async () => {
    const prvni = potvrd('První?');
    const druhy = potvrd('Druhý?');
    await expect(prvni).resolves.toBe(false);
    expect(stavOznameni().potvrzeni?.text).toBe('Druhý?');
    uzavriPotvrzeni(true);
    await expect(druhy).resolves.toBe(true);
  });

  it('bez namountovaného hostitele spadne na prohlížečový dialog', async () => {
    // Jinak by Promise nikdy nedoběhla a mazání by tiše NIC neudělalo.
    odhlas?.();
    odhlas = null;
    const puvodni = window.confirm;
    window.confirm = vi.fn(() => true) as any;
    await expect(potvrd('Smazat?')).resolves.toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Smazat?');
    window.confirm = puvodni;
  });
});

describe('normalizace zadaného čísla', () => {
  it('bere českou čárku jako desetinnou tečku', () => {
    // type="number" by „1,5" zahodilo a v hodnotě by zůstalo prázdno.
    expect(normalizujCislo('1,5', true)).toBe('1.5');
    expect(normalizujCislo('12,75', true)).toBe('12.75');
  });

  it('u kusů zahodí desetinnou část i písmena', () => {
    expect(normalizujCislo('12 ks', false)).toBe('12');
    expect(normalizujCislo('1,5', false)).toBe('15');
  });

  it('nechá jen jednu tečku a mínus jen na začátku', () => {
    expect(normalizujCislo('1.2.3', true)).toBe('1.23');
    expect(normalizujCislo('-5', true)).toBe('-5');
    expect(normalizujCislo('5-3', true)).toBe('53');
  });

  it('zvládne prázdný a nesmyslný vstup', () => {
    expect(normalizujCislo('', false)).toBe('');
    expect(normalizujCislo('abc', false)).toBe('');
  });
});
