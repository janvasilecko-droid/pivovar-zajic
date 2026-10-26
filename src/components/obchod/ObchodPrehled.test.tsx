// Obchod → Sklad (13. a 14. 10. 2026): piva jako ve Skladu (karta, Sudy/Lahve) se sloupci
// Sklad + Nafasováno + Prodáno (za celý měsíc, přepínač měsíce), pálenka se skladem
// a příjmem, ostatní zboží jen s prodejem za měsíc.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ObchodPrehled } from './ObchodPrehled';
import { stavySkladu } from '../../lib/obchodSklad';
import type { DataObchodu } from '../../lib/obchodData';

vi.mock('../../lib/businessDate', async (p) => ({ ...(await p<typeof import('../../lib/businessDate')>()), businessDateISO: () => '2026-10-13' }));

const piva = [
  { id: 'b12s', name: '12° Světlá', degree: '12°', beer_color: '#FDE68A', sort_order: 1, is_active: true },
  { id: 'b12t', name: '12° Tmavá', degree: '12°', beer_color: '#7F1D1D', sort_order: 2, is_active: true },
];
const obaly = [
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 2 },
  { id: 'p15', label: 'PET 1.5l', kind: 'bottle', volume_l: 1.5, sort_order: 10 },
  { id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1, sort_order: 11 },
];
const zbozi = [
  { kod: '1', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12s', package_id: 'p1', aktivni: true },
  { kod: '2', nazev: 'Pivo PET 1,5l 12° světlá', beer_id: 'b12s', package_id: 'p15', aktivni: true },
  { kod: '3', nazev: 'Pivo sud 30l 12° tmavá', beer_id: 'b12t', package_id: 'k30', aktivni: true },
  { kod: '4', nazev: 'Saponát 1l', beer_id: null, package_id: null, aktivni: true },
  { kod: '5', nazev: 'Slivovice pálenka 0,5l', beer_id: null, package_id: null, aktivni: true },
];
const vstup = {
  zbozi, fasovani: [], prijmy: [],
  uzaverky: [{ id: 'u1', datum_od: '2026-10-05', datum_do: '2026-10-05' }],
  radky: [
    { uzaverka_id: 'u1', kod: '1', mnozstvi: 3 }, { uzaverka_id: 'u1', kod: '4', mnozstvi: 7 }, { uzaverka_id: 'u1', kod: '5', mnozstvi: 2 },
  ],
  inventury: [
    { kod: '1', datum: '2026-10-01', napocitano: 10 }, { kod: '2', datum: '2026-10-01', napocitano: 4 },
    { kod: '3', datum: '2026-10-01', napocitano: 2 }, { kod: '5', datum: '2026-10-01', napocitano: 6 },
  ],
};
const data = {
  zbozi, prijmy: [], uzaverky: vstup.uzaverky, radky: vstup.radky, inventury: vstup.inventury, odpisy: [], zavreno: [],
  chybiOdpisAZavreno: false, fasovani: [], piva, obaly, vstup, vstupSklad: vstup, nacitam: false, chyba: null, chybiTabulky: false, znovu: () => {},
} as unknown as DataObchodu;

describe('Obchod → Sklad', () => {
  it('piva mají kartu s tabulkami Sudy a Lahve, stav a prodej od začátku měsíce', () => {
    render(<ObchodPrehled data={data} zapsal="Honza" jdiNa={() => {}} />);
    const svetla = screen.getByRole('heading', { name: /12° Světlá/ }).closest('.plocha-z-dat') as HTMLElement;
    const radek = within(svetla).getByText('PET 1l').closest('tr') as HTMLElement;
    expect(within(radek).getByText('7')).toBeTruthy(); // 10 − 3 prodané po inventuře
    expect(radek.textContent).toMatch(/7.*3$/); // Sklad 7, (Nafasováno 0), Prodáno 3
    expect(within(svetla).getByText('PET 1.5l')).toBeTruthy();
    const tmava = screen.getByRole('heading', { name: /12° Tmavá/ }).closest('.plocha-z-dat') as HTMLElement;
    expect(within(tmava).getByText('Sudy')).toBeTruthy();
    expect(within(tmava).getByText('KEG 30l')).toBeTruthy();
  });

  it('pálenka má stav i prodej, ostatní zboží jen prodej', () => {
    render(<ObchodPrehled data={data} zapsal="Honza" jdiNa={() => {}} />);
    const palenka = screen.getByRole('region', { name: 'Pálenka' });
    expect(within(palenka).getByText('Sklad')).toBeTruthy();
    expect(within(palenka).getByText('Příjem')).toBeTruthy();
    const ostatni = screen.getByRole('region', { name: 'Ostatní zboží' });
    expect(within(ostatni).queryByText('Sklad')).toBeNull();
    expect(within(ostatni).getByText('Saponát 1l')).toBeTruthy();
    expect(ostatni.textContent).toContain('7 ks');
  });

  it('klepnutí na stav otevře rozpis, u ostatního zboží bez minima a příjmu', () => {
    render(<ObchodPrehled data={data} zapsal="Honza" jdiNa={() => {}} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Ostatní zboží' })).getByText('Saponát 1l'));
    expect(screen.queryByText(/Minimum \(ks\)/)).toBeNull();
    expect(screen.getByText(/Prodáno za celý měsíc/)).toBeTruthy();
    expect(stavySkladu(vstup as any, '2026-10-13').length).toBe(5);
  });
});

describe('Obchod → Sklad: naskladněno po týdnech a fasování bez kódu', () => {
  const dataF = {
    ...data,
    fasovani: [
      { beer_id: 'b12s', package_id: 'p1', quantity: 12, entry_date: '2026-10-13' },
      { beer_id: 'b12t', package_id: 'p15', quantity: 5, entry_date: '2026-10-07' },
    ],
  } as unknown as DataObchodu;
  const dataFv = { ...dataF, vstup: { ...(dataF as any).vstup, fasovani: (dataF as any).fasovani }, vstupSklad: { ...(dataF as any).vstup, fasovani: (dataF as any).fasovani } } as unknown as DataObchodu;

  it('týdenní tabulka: aktuální týden je rozbalený, ukazuje pivo a obal s kusy', () => {
    render(<ObchodPrehled data={dataFv} zapsal="Honza" jdiNa={() => {}} />);
    const sekce = screen.getByRole('region', { name: 'Naskladněno po týdnech' });
    expect(within(sekce).getByText('Týden 42')).toBeTruthy();
    expect(within(sekce).getAllByText('+12').length).toBeGreaterThan(0);
    expect(within(sekce).getByText('PET 1l')).toBeTruthy();
    // Minulý týden je sbalený, po klepnutí se ukáže 12° Tmavá 5 ks.
    fireEvent.click(within(sekce).getByText('Týden 41'));
    expect(within(sekce).getByText('12° Tmavá')).toBeTruthy();
  });
});

// 14. 10. 2026: „Obchod udělej jako sklad, sloupce budou sklad, nafasováno, prodáno,
// údaje budou za celý měsíc."
describe('Obchod → Sklad: sloupce Sklad, Nafasováno, Prodáno za celý měsíc', () => {
  const fasovani = [
    { beer_id: 'b12s', package_id: 'p1', quantity: 12, entry_date: '2026-10-13' },
    { beer_id: 'b12s', package_id: 'p1', quantity: 5, entry_date: '2026-09-20' },
  ];
  const dataM = {
    ...data, fasovani,
    vstup: { ...(data as any).vstup, fasovani },
    vstupSklad: { ...(data as any).vstup, fasovani },
  } as unknown as DataObchodu;
  const bunky = (radek: HTMLElement) => Array.from(radek.querySelectorAll('td')).map((td) => td.textContent?.trim());
  const radekPet1 = () => {
    const svetla = screen.getByRole('heading', { name: /12° Světlá/ }).closest('.plocha-z-dat') as HTMLElement;
    return within(svetla).getByText('PET 1l').closest('tr') as HTMLElement;
  };

  it('tabulka na kartě piva má sloupce Obal, Sklad, Nafasováno, Prodáno', () => {
    render(<ObchodPrehled data={dataM} zapsal="Honza" jdiNa={() => {}} />);
    const svetla = screen.getByRole('heading', { name: /12° Světlá/ }).closest('.plocha-z-dat') as HTMLElement;
    const hlavicka = Array.from(svetla.querySelectorAll('th')).map((th) => th.textContent);
    expect(hlavicka).toEqual(['Obal', 'Sklad', 'Nafasováno do dneška', 'Prodáno do dneška']);
    expect(within(svetla).queryByText('Naskladněno')).toBeNull();
  });

  it('běžící měsíc: sklad = inventura + fasování − prodej, nafasováno a prodáno za říjen', () => {
    render(<ObchodPrehled data={dataM} zapsal="Honza" jdiNa={() => {}} />);
    // 10 napočítáno + 12 nafasováno 13. 10. − 3 prodané; do října se zářijových 5 nepočítá.
    expect(bunky(radekPet1())).toEqual(['PET 1l', '19', '+12', '3']);
    expect(screen.getByText('říjen 2026')).toBeTruthy();
  });

  it('šipka zpět ukáže září: jeho nafasováno, prodáno bez říjnových a sklad ke konci září', () => {
    render(<ObchodPrehled data={dataM} zapsal="Honza" jdiNa={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect(screen.getByText('září 2026')).toBeTruthy();
    // Inventura je až 1. 10., ke konci září není od čeho počítat → „—“.
    expect(bunky(radekPet1())).toEqual(['PET 1l', '—bez inventury', '+5', '0']);
  });

  it('do budoucna se nejde a „zpět na tento měsíc“ vrátí říjen', () => {
    render(<ObchodPrehled data={dataM} zapsal="Honza" jdiNa={() => {}} />);
    expect((screen.getByRole('button', { name: 'Další měsíc' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect((screen.getByRole('button', { name: 'Další měsíc' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText('zpět na tento měsíc'));
    expect(screen.getByText('říjen 2026')).toBeTruthy();
    expect(bunky(radekPet1())).toEqual(['PET 1l', '19', '+12', '3']);
  });

  it('Další měsíc po šipce zpět se vrátí na říjen', () => {
    render(<ObchodPrehled data={dataM} zapsal="Honza" jdiNa={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Další měsíc' }));
    expect(screen.getByText('říjen 2026')).toBeTruthy();
  });

  it('pálenka: Sklad, Příjem za měsíc a Prodáno', () => {
    const prijmy = [{ id: 'p1', kod: '5', datum: '2026-10-08', mnozstvi: 4 }];
    const d = {
      ...dataM, prijmy,
      vstup: { ...(dataM as any).vstup, prijmy },
      vstupSklad: { ...(dataM as any).vstupSklad, prijmy },
    } as unknown as DataObchodu;
    render(<ObchodPrehled data={d} zapsal="Honza" jdiNa={() => {}} />);
    const palenka = screen.getByRole('region', { name: 'Pálenka' });
    expect(palenka.textContent).toContain('+4');   // příjem za říjen
    expect(palenka.textContent).toMatch(/Sklad.*8/); // 6 napočítáno + 4 příjem − 2 prodané
  });

  it('týdenní tabulka sleduje vybraný měsíc: v září nejsou říjnové týdny', () => {
    render(<ObchodPrehled data={dataM} zapsal="Honza" jdiNa={() => {}} />);
    const sekce = () => screen.getByRole('region', { name: 'Naskladněno po týdnech' });
    expect(within(sekce()).getByText('Týden 42')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect(within(sekce()).queryByText('Týden 42')).toBeNull();
    expect(within(sekce()).getByText('Týden 40')).toBeTruthy();   // 28. 9. – 4. 10., do konce září
  });
});
