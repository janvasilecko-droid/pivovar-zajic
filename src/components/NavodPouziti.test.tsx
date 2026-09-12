/**
 * 📖 Návod k použití — hlídač, aby nezastaral.
 *
 * Návod, který popisuje appku z loňska, je horší než žádný: člověk podle něj
 * hledá tlačítko, které tam není, a přestane mu věřit. Tenhle test proto
 * kontroluje, že každá obrazovka z menu je v návodu opravdu zmíněná — když
 * nějaká přibude, test spadne a připomene, že se má popsat.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavodPouziti, NAVOD_ODDILY } from './NavodPouziti';
import { NAV, EXTRA_NAV } from './Layout';

/** Celý text návodu jako jeden řetězec, bez diakritiky a malými písmeny. */
const bezDiakritiky = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CELY_TEXT = bezDiakritiky(
  NAVOD_ODDILY.flatMap((o) => [o.nazev, o.kCemu, ...o.body.flatMap((b) => [b.co, b.jak])]).join(' · ')
);

describe('návod k použití', () => {
  // Obrazovky, které se v menu jmenují jinak, než jak se o nich mluví
  // v návodu (a byly by tedy falešně hlášené jako chybějící).
  const JINAK_POJMENOVANE: Record<string, string> = {
    dashboard: 'sklad',
    history: 'statistika',
    concentration: 'kalkulacky',
    haccp: 'sanitacni denik',
    bottling_needs: 'potreby staceni',
    orders_zavoz: 'rozvoz',
    depozitar: 'odberatel',
    app_settings: 'nastaveni',
    zaloha: 'zalohu',
    signout: 'nastaveni',
    keg_timer: 'stoceni sudu',
    stopwatch: 'stopky',
    sanitace_lahve: 'lahvovou linku',
    sanitace_kegy: 'kegy',
    sanitace_vycepy: 'vycep',
    checklists: 'check-listy',
    sanitation_log: 'sanitacni denik',
    reminders: 'pripominky',
    feedback: 'zpetna vazba',
    exkurze: 'exkurze',
    radio: 'radio',
    kniha_jizd: 'kniha jizd',
    vycepy: 'vycepy',
    places: 'odberatele',
    beers: 'piva',
    packages: 'obaly',
    pricelist: 'cenik',
    users: 'uzivatele',
    sklo_promo: 'etikety',
    export_excel: 'excelu',
    writeoffs: 'odpis',
    akce: 'akce',
    calendar: 'kalendar',
    timer: 'casovac',
    vehicles: 'vozovy park',
    inventory: 'inventura',
    cellar: 'sklep',
    kegging: 'keg',
    bottling: 'lahv',
    orders: 'objednavky',
    fasovani: 'fasovani',
    prodejna: 'prodejna',
  };

  it('popisuje KAŽDOU obrazovku z menu', () => {
    const chybi: string[] = [];
    for (const polozka of [...NAV, ...EXTRA_NAV]) {
      const hledane = JINAK_POJMENOVANE[polozka.id] ?? bezDiakritiky(polozka.label);
      if (!CELY_TEXT.includes(bezDiakritiky(hledane))) {
        chybi.push(`${polozka.id} (${polozka.label})`);
      }
    }
    expect(chybi, 'tyhle obrazovky nejsou v návodu popsané').toEqual([]);
  });

  it('u každé funkce je napsané NEJEN co to je, ale i jak se to dělá', () => {
    // Návod, který jen vyjmenuje názvy obrazovek, nikomu nepomůže.
    const bezPostupu = NAVOD_ODDILY.flatMap((o) =>
      o.body.filter((b) => b.jak.trim().length < 30).map((b) => `${o.nazev} → ${b.co}`)
    );
    expect(bezPostupu).toEqual([]);
  });

  it('vykreslí rozcestník a oddíl se otevře až na klepnutí', () => {
    // Na telefonu se souvislý text přes patnáct obrazovek neroluje.
    render(<NavodPouziti />);
    expect(screen.getByText('Stáčení KEG')).toBeTruthy();
    expect(screen.queryByText('Odškrtávátko NEZAPISUJE stáčení')).toBeNull();

    fireEvent.click(screen.getByText('Stáčení KEG'));
    expect(screen.getByText('Odškrtávátko NEZAPISUJE stáčení')).toBeTruthy();
  });

  it('otevřený oddíl se dá zase zavřít', () => {
    render(<NavodPouziti />);
    const nadpis = screen.getByText('Objednávky');
    fireEvent.click(nadpis);
    expect(screen.getByText('Duplicita')).toBeTruthy();
    fireEvent.click(nadpis);
    expect(screen.queryByText('Duplicita')).toBeNull();
  });
});
