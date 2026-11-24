// „Proč je tam prázdných 12? Mají být tolik, kolik jsem jich zadal" (13. 10. 2026):
// velké číslo je to, co člověk naklikal — ne zbytek po objednávkách.
// 1. 11. 2026: „ty se měly odečíst podle objednávek, měly by tam být jen 2× 10
// prázdné" — co od zadání odjelo, číslo zmenší (a záložka řekne odkud).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const ulozit = vi.fn(async (..._a: unknown[]) => null);
let zasoba: Record<string, number> = {};
let stavPoctu = { nacteno: true, chybaNacteni: false };
let hlidani: { souhrn: unknown[]; nacteno: boolean; chybaNacteni?: boolean } = { souhrn: [], nacteno: true };
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({
    zasoba, zadanoKdy: { s10: { cas: '2026-10-27T08:43:11Z', den: '2026-10-27' } },
    zapocitatPlne: new Set(), umiZapocitatPlne: true, ...stavPoctu, chybiMigrace: false,
    ulozit, nastavZapocitatPlne: vi.fn(async () => null),
  }),
  useHlidaniMalychSudu: () => ({ ...hlidani, jmenaPiv: new Map() }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null, user: null }) }));

import { MaleSudyPanel } from './MaleSudyPanel';

const S20 = { id: 's20', kind: 'keg', volume_l: 20, label: '20l' } as any;
const S10 = { id: 's10', kind: 'keg', volume_l: 10, label: '10l' } as any;

beforeEach(() => {
  ulozit.mockClear();
  stavPoctu = { nacteno: true, chybaNacteni: false };
  zasoba = { s20: 7 };
  hlidani = {
    souhrn: [{ package_id: 's20', mame: 7, objednano: 5, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 7, odvezeno: 0, odvezenoZ: [] }],
    nacteno: true,
  };
});

describe('Malé sudy: velké číslo = kolik jsem zadal', () => {
  it('7 prázdných při 5 objednaných ukáže 7 a pod tím „K dispozici 2"', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 20l') as HTMLInputElement).value).toBe('7');
    expect(screen.getByText(/v otevřených objednávkách 5/)).toBeTruthy();
    expect(screen.getByText('K dispozici')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // 7 prázdných − 5 v objednávkách
    expect(screen.queryByText(/Prázdných celkem/)).toBeNull();
    expect(screen.queryByText(/od té doby odjelo/)).toBeNull();
  });

  it('počet jde napsat přímo: 12 → 7 se uloží po opuštění pole', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    const pole = screen.getByLabelText('Počet prázdných 20l');
    fireEvent.change(pole, { target: { value: '9' } });
    fireEvent.blur(pole);
    expect(ulozit).toHaveBeenCalledWith('s20', 9, undefined, undefined);
  });

  it('dokud se nenačtou objednávky, číslo neposkočí — „…" a tlačítka čekají', () => {
    hlidani = { souhrn: [], nacteno: false };
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect(screen.queryByLabelText('Počet prázdných 20l')).toBeNull();
    expect(screen.getByText('…')).toBeTruthy();
    expect((screen.getByLabelText('Přidat 20l') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('K dispozici')).toBeNull();
  });

  // Revize 1. 11. 2026: „+" při nenačtených počtech by uložilo 1 a přepsalo uložené.
  it('dokud se nenačtou uložené počty, „+" nejde', () => {
    stavPoctu = { nacteno: false, chybaNacteni: false };
    zasoba = {};
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect((screen.getByLabelText('Přidat 20l') as HTMLButtonElement).disabled).toBe(true);
  });

  it('počty se nenačetly (síť): hláška místo „klepni na +"', () => {
    stavPoctu = { nacteno: true, chybaNacteni: true };
    zasoba = {};
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect(screen.getByRole('alert').textContent).toMatch(/nepodařilo načíst/);
    expect(screen.queryByLabelText('Přidat 20l')).toBeNull();
  });

  it('objednávky se nenačetly: naklikané číslo s upozorněním, +/− nejdou, přepsat číslem jde', () => {
    hlidani = { souhrn: [], nacteno: true, chybaNacteni: true };
    render(<MaleSudyPanel packages={[S20]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 20l') as HTMLInputElement).value).toBe('7');
    expect(screen.getByRole('note').textContent).toMatch(/Objednávky se nenačetly/);
    expect((screen.getByLabelText('Přidat 20l') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Ubrat 20l') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('K dispozici')).toBeNull();
    const pole = screen.getByLabelText('Počet prázdných 20l');
    fireEvent.change(pole, { target: { value: '3' } });
    fireEvent.blur(pole);
    expect(ulozit).toHaveBeenCalledWith('s20', 3, undefined, undefined);
  });
});

describe('Malé sudy: odjeté objednávky počet zmenší (1. 11. 2026)', () => {
  beforeEach(() => {
    zasoba = { s10: 8 };
    hlidani = {
      souhrn: [{
        package_id: 's10', mame: 2, objednano: 0, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 8, odvezeno: 6,
        odvezenoZ: [{ order_id: 'm', nazev: 'Maneo', den: '2026-10-29', kusu: 6 }],
      }],
      nacteno: true,
    };
  });

  it('naklikáno 8, Maneo odvezlo 6 → velké číslo 2 a pod ním odkud', () => {
    render(<MaleSudyPanel packages={[S10]} canEdit />);
    expect((screen.getByLabelText('Počet prázdných 10l') as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('Naklikáno 8 (út 27. 10.), od té doby odjelo 6: Maneo 6× (čt 29. 10.).')).toBeTruthy();
  });

  // Revize 1. 11. 2026: +/− s novým časem zadání by sudy stočené od zadání
  // vzalo jako „plné k zadání" a u „započítat plné" nafouklo K dispozici.
  // Čas zadání i čísla z TOHOTO vykreslení: kdyby čas přišel z novějšího
  // načtení, uložilo by se číslo k cizímu zadání (revize 1. 11. 2026). Když už
  // čas neplatí (přelom týdne), uloží hook zobrazené číslo ± 1 (pocetNoveZadani).
  it('+ a − opraví naklikané číslo o kus a čas zadání nechají (velké číslo 2 → 3 / 1)', () => {
    render(<MaleSudyPanel packages={[S10]} canEdit />);
    fireEvent.click(screen.getByLabelText('Přidat 10l'));
    expect(ulozit).toHaveBeenLastCalledWith('s10', 9, undefined, { zachovatCas: '2026-10-27T08:43:11Z', pocetNoveZadani: 3 });
    fireEvent.click(screen.getByLabelText('Ubrat 10l'));
    expect(ulozit).toHaveBeenLastCalledWith('s10', 7, undefined, { zachovatCas: '2026-10-27T08:43:11Z', pocetNoveZadani: 1 });
  });

  it('napsané číslo je nový stav TEĎ (nové zadání)', () => {
    render(<MaleSudyPanel packages={[S10]} canEdit />);
    const pole = screen.getByLabelText('Počet prázdných 10l');
    fireEvent.change(pole, { target: { value: '5' } });
    fireEvent.blur(pole);
    expect(ulozit).toHaveBeenLastCalledWith('s10', 5, undefined, undefined);
  });

  it('odjelo víc, než se naklikalo (ukazuje 0): + přidá tak, aby bylo 1; − nejde', () => {
    zasoba = { s10: 3 };
    hlidani = {
      souhrn: [{
        package_id: 's10', mame: 0, objednano: 0, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 3, odvezeno: 5,
        odvezenoZ: [{ order_id: 'm', nazev: 'Maneo', den: '2026-10-29', kusu: 5 }],
      }],
      nacteno: true,
    };
    render(<MaleSudyPanel packages={[S10]} canEdit />);
    expect((screen.getByLabelText('Ubrat 10l') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Přidat 10l'));
    expect(ulozit).toHaveBeenLastCalledWith('s10', 6, undefined, { zachovatCas: '2026-10-27T08:43:11Z', pocetNoveZadani: 1 });
  });

  it('obal bez času zadání (doplněný nulou): „+" je nové zadání — bez času, uloží se 1', () => {
    zasoba = { s10: 8, s20: 0 };
    hlidani = { ...hlidani, souhrn: [...hlidani.souhrn, { package_id: 's20', mame: 0, objednano: 0, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 0, odvezeno: 0, odvezenoZ: [] }] };
    render(<MaleSudyPanel packages={[S20, S10]} canEdit />);
    fireEvent.click(screen.getByLabelText('Přidat 20l'));
    expect(ulozit).toHaveBeenLastCalledWith('s20', 1, undefined, { zachovatCas: null, pocetNoveZadani: 1 });
  });
});

// Revize 1. 11. 2026: obal doplněný nulou nemá v databázi řádek — „započítat
// plné" by se neuložilo a do minuty se vrátilo.
describe('Malé sudy: „započítat plné" jen u obalu se zadaným počtem', () => {
  it('Ano/Ne u obalu s časem zadání, u obalu bez něj věta, že nejdřív počet', () => {
    zasoba = { s10: 8, s20: 0 };
    hlidani = {
      souhrn: [
        { package_id: 's20', mame: 0, objednano: 2, nad: 2, zapocitanoPlnych: 0, plneSkladem: { b12: 2 }, zadano: 0, odvezeno: 0, odvezenoZ: [] },
        { package_id: 's10', mame: 8, objednano: 3, nad: 0, zapocitanoPlnych: 0, plneSkladem: { b10: 1 }, zadano: 8, odvezeno: 0, odvezenoZ: [] },
      ],
      nacteno: true,
    };
    render(<MaleSudyPanel packages={[S20, S10]} canEdit />);
    expect(screen.getAllByRole('button', { name: 'Ano, započítat' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Ne' })).toHaveLength(1);
    expect(screen.getAllByText('Plné se dají započítat, až zadáš počet tohoto obalu.')).toHaveLength(1);
    expect(screen.getAllByText(/Započítat je do objednávek\?/)).toHaveLength(1);
    // Tlačítka patří obalu 10 l (má čas zadání), věta obalu 20 l.
    const karta10 = screen.getByLabelText('Přidat 10l').closest('.card') as HTMLElement;
    const karta20 = screen.getByLabelText('Přidat 20l').closest('.card') as HTMLElement;
    expect(karta10.textContent).toMatch(/Ano, započítat/);
    expect(karta20.textContent).toMatch(/až zadáš počet tohoto obalu/);
    expect(karta20.textContent).not.toMatch(/Ano, započítat/);
  });
});

// 24. 11. 2026: „u položky malé sudy udělej tlačítko odeslat Radkovi, přes bránu telefonu se mu
// pošle sms s počtem malých sudů … sms se odešle od toho, kdo dá odeslat sms, ve tvaru: čau, malé
// sudy, datum a počet, například 20l: 2x, 15l: 0, 10l: 1." SMS brána v appce není — tlačítko otevře
// v telefonu aplikaci zpráv s číslem a hotovým textem (odkaz sms:), odešle ji člověk. Čísla v testech
// jsou vymyšlená (777 123 456, 773 000 111), skutečná čísla do repozitáře nepatří.
describe('Malé sudy: „Odeslat Radkovi" — SMS s počtem malých sudů', () => {
  const RADEK = { jmeno: 'Radek', telefon: '777 123 456' };
  const sms = (text: string, cislo = '+420777123456') => `sms:${cislo}?&body=${encodeURIComponent(text)}`;
  const odkaz = () => screen.getByRole('link', { name: /Odeslat Radkovi/ }) as HTMLAnchorElement;
  const S15 = { ...S20, id: 's15', volume_l: 15, label: '15l' };

  beforeEach(() => { localStorage.clear(); });

  it('odkaz otevře SMS s číslem z karty Radka a textem „Čau, malé sudy <datum>: 20l: 7x" (velké číslo na kartě)', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect(odkaz().getAttribute('href')).toBe(sms('Čau, malé sudy 24. 11.: 20l: 7x'));
    expect(screen.getByTestId('sms-text').textContent).toBe('SMS: „Čau, malé sudy 24. 11.: 20l: 7x“');
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('Číslo z karty odběratele Radek (777 123 456)');
  });

  it('všechny malé obaly od největšího; obal bez zadaného počtu se píše jako 0 (jako ve hlídání objednávek)', () => {
    zasoba = { s20: 7, s10: 3 };
    render(<MaleSudyPanel packages={[S10, S15, S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect(screen.getByTestId('sms-text').textContent).toBe('SMS: „Čau, malé sudy 24. 11.: 20l: 7x, 15l: 0x, 10l: 3x“');
  });

  it('číslo v SMS je velké číslo na kartě: po odjeté objednávce se zmenší i v SMS, otevřené objednávky ho nemění', () => {
    zasoba = { s20: 9 };
    hlidani = {
      souhrn: [{ package_id: 's20', mame: 6, objednano: 4, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 9, odvezeno: 3, odvezenoZ: [] }],
      nacteno: true,
    };
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect((screen.getByLabelText('Počet prázdných 20l') as HTMLInputElement).value).toBe('6');
    expect(screen.getByTestId('sms-text').textContent).toBe('SMS: „Čau, malé sudy 24. 11.: 20l: 6x“');
  });

  it('sud, který je celý rozdaný, jde do SMS jako 0x, ne jako záporné číslo', () => {
    zasoba = { s20: 0 };
    hlidani = {
      souhrn: [{ package_id: 's20', mame: 0, objednano: 5, nad: 5, zapocitanoPlnych: 0, plneSkladem: {}, zadano: 0, odvezeno: 0, odvezenoZ: [] }],
      nacteno: true,
    };
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect(screen.getByTestId('sms-text').textContent).toBe('SMS: „Čau, malé sudy 24. 11.: 20l: 0x“');
  });

  it('Radek bez telefonu (nebo bez karty): SMS se otevře bez příjemce a text říká, kam telefon doplnit', () => {
    const text = 'Čau, malé sudy 24. 11.: 20l: 7x';
    const { unmount } = render(<MaleSudyPanel packages={[S20]} canEdit prijemce={{ jmeno: 'Radek', telefon: null }} dnes="2026-11-24" />);
    expect(odkaz().getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(text)}`);
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('U odběratele Radek není telefon');
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('Odběratelé, piva, obaly');
    unmount();
    render(<MaleSudyPanel packages={[S20]} canEdit dnes="2026-11-24" />);
    expect(odkaz().getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(text)}`);
  });

  it('pole „Číslo, kam jde SMS": ručně zadané číslo (zkouška na vlastní číslo) má před kartou přednost', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    const pole = screen.getByLabelText('Číslo, kam jde SMS') as HTMLInputElement;
    expect(pole.value).toBe('');
    expect(pole.placeholder).toContain('777 123 456');
    fireEvent.change(pole, { target: { value: '773 000 111' } });
    expect(odkaz().getAttribute('href')).toBe(sms('Čau, malé sudy 24. 11.: 20l: 7x', '+420773000111'));
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('Ručně zadané číslo (jen v tomhle telefonu)');
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('773 000 111');
  });

  it('ručně zadané číslo si telefon pamatuje; po smazání se vrátí číslo z karty', () => {
    const { unmount } = render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    fireEvent.change(screen.getByLabelText('Číslo, kam jde SMS'), { target: { value: '773 000 111' } });
    expect(JSON.parse(localStorage.getItem('male_sudy_sms_cislo_v1')!)).toBe('773 000 111');
    unmount();
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect((screen.getByLabelText('Číslo, kam jde SMS') as HTMLInputElement).value).toBe('773 000 111');
    expect(odkaz().getAttribute('href')).toBe(sms('Čau, malé sudy 24. 11.: 20l: 7x', '+420773000111'));
    fireEvent.change(screen.getByLabelText('Číslo, kam jde SMS'), { target: { value: '' } });
    expect(odkaz().getAttribute('href')).toBe(sms('Čau, malé sudy 24. 11.: 20l: 7x'));
    expect(JSON.parse(localStorage.getItem('male_sudy_sms_cislo_v1')!)).toBe('');
  });

  it('ručně zadané číslo bez karty Radka: SMS jde na ně a hláška už nehlásí chybějící telefon', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={{ jmeno: 'Radek', telefon: null }} dnes="2026-11-24" />);
    fireEvent.change(screen.getByLabelText('Číslo, kam jde SMS'), { target: { value: '773000111' } });
    expect(odkaz().getAttribute('href')).toBe(sms('Čau, malé sudy 24. 11.: 20l: 7x', '+420773000111'));
    expect(screen.getByTestId('sms-prijemce').textContent).not.toContain('není telefon');
  });

  it('v poli jen mezery se nepočítají jako zadané číslo: platí číslo z karty', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    fireEvent.change(screen.getByLabelText('Číslo, kam jde SMS'), { target: { value: '   ' } });
    expect(odkaz().getAttribute('href')).toBe(sms('Čau, malé sudy 24. 11.: 20l: 7x'));
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('Číslo z karty odběratele Radek');
  });

  it('nesmyslné číslo v poli: SMS se otevře bez příjemce a hláška to říká', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    fireEvent.change(screen.getByLabelText('Číslo, kam jde SMS'), { target: { value: '12345' } });
    expect(odkaz().getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent('Čau, malé sudy 24. 11.: 20l: 7x')}`);
    expect(screen.getByTestId('sms-prijemce').textContent).toContain('Číslo nevypadá správně');
  });

  it('dokud se nenačtou objednávky, tlačítko je zamčené a žádný text se nepřipraví (číslo by neodpovídalo)', () => {
    hlidani = { souhrn: [], nacteno: false };
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect(screen.queryByRole('link', { name: /Odeslat Radkovi/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Odeslat Radkovi/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('sms-text')).toBeNull();
    expect(screen.queryByLabelText('Číslo, kam jde SMS')).toBeNull();
  });

  it('objednávky se vůbec nenačetly: číslo je jen naklikané, proto se neposílá', () => {
    hlidani = { souhrn: [], nacteno: true, chybaNacteni: true };
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect(screen.queryByRole('link', { name: /Odeslat Radkovi/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Odeslat Radkovi/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('nic nezadané: není co posílat — tlačítko zamčené', () => {
    zasoba = {};
    hlidani = { souhrn: [], nacteno: true };
    render(<MaleSudyPanel packages={[S20]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect((screen.getByRole('button', { name: /Odeslat Radkovi/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: /Odeslat Radkovi/ })).toBeNull();
  });

  it('posílat jde i bez práva upravovat počty (SMS nic nemění)', () => {
    render(<MaleSudyPanel packages={[S20]} canEdit={false} prijemce={RADEK} dnes="2026-11-24" />);
    expect(odkaz()).toBeTruthy();
  });

  it('bez malých obalů se tlačítko nenabízí', () => {
    render(<MaleSudyPanel packages={[]} canEdit prijemce={RADEK} dnes="2026-11-24" />);
    expect(screen.queryByTestId('odeslat-radkovi')).toBeNull();
  });
});
