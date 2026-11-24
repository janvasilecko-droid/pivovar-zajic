// Zdroj z internetu v odpovědi AI sládka → záznam v bibli (jen vymyšlené věty, žádný text skutečných zdrojů).
import { describe, expect, it } from 'vitest';
import type { ZdrojOdpovedi } from './bibleChatApi';
import { SHRNUTI_NENALEZENO, shrnutiZOdpovedi, webZdrojeOdpovedi, webZdrojZOdpovedi } from './bibleWebZOdpovedi';

const web = (n: number, url: string | null, nazev = `Článek ${n}`): ZdrojOdpovedi => ({
  n, dokumentId: null, pdfIndex: null, nazev, tistena: null, kapitola: null, zdroj: 'web', url, citat: 'Úryvek stránky, který se neukládá.',
});
const kniha: ZdrojOdpovedi = {
  n: 1, dokumentId: '11111111-2222-3333-4444-555555555555', pdfIndex: 12, nazev: 'Kniha', tistena: '10', kapitola: null, zdroj: 'original', url: null, citat: 'Text knihy.',
};

describe('které zdroje z odpovědi jde uložit', () => {
  it('jen webové s platnou http(s) adresou; kniha ne', () => {
    const z = webZdrojeOdpovedi([
      kniha, web(2, 'https://example.org/a'), web(3, 'http://example.org/b'), web(4, 'ftp://example.org/c'),
      web(5, 'javascript:alert(1)'), web(6, 'https://exa mple.org/mezera'), web(7, null), web(8, ''),
    ]);
    expect(z.map((x) => x.n)).toEqual([2, 3]);
  });

  it('kniha se neukládá ani kdyby nesla adresu (jen zdroj označený jako web)', () => {
    expect(webZdrojeOdpovedi([{ ...kniha, url: 'https://example.org/kniha' }])).toHaveLength(0);
  });

  it('stejná adresa jednou (bez ohledu na velikost písmen a okolní mezery); příliš dlouhá adresa ne', () => {
    const z = webZdrojeOdpovedi([web(1, 'https://Example.org/Clanek'), web(2, ' https://example.org/clanek '), web(3, 'https://example.org/jiny')]);
    expect(z.map((x) => x.n)).toEqual([1, 3]);
    expect(webZdrojeOdpovedi([web(1, `https://example.org/${'a'.repeat(1990)}`)])).toHaveLength(0);
    expect(webZdrojeOdpovedi([web(1, `https://example.org/${'a'.repeat(1900)}`)])).toHaveLength(1);
  });
});

describe('shrnutí = věta z odpovědi, ne text stránky', () => {
  const TEXT = [
    '## Krátká odpověď',
    'Kvasnice pracují pomaleji při nízké teplotě[1]. Pomalé kvašení samo o sobě vadou není[2] a hlídá se hustotou.',
    '## Doporučení',
    '- **Změř hustotu** dvakrát denně[2].',
    'Jiná věta bez citace.',
  ].join('\n');

  it('vezme věty nesoucí citaci [n], bez čísel citací a bez Markdownu', () => {
    expect(shrnutiZOdpovedi(TEXT, 1)).toBe('Kvasnice pracují pomaleji při nízké teplotě.');
    expect(shrnutiZOdpovedi(TEXT, 2)).toBe('Pomalé kvašení samo o sobě vadou není a hlídá se hustotou. Změř hustotu dvakrát denně.');
  });

  it('nejvýš dvě věty; věty beze značky [n] se nepřidávají', () => {
    const t = 'První[3]. Druhá[3]. Třetí[3]. Čtvrtá bez citace.';
    expect(shrnutiZOdpovedi(t, 3)).toBe('První. Druhá.');
  });

  it('citace za tečkou patří k větě před ní', () => {
    expect(shrnutiZOdpovedi('Tohle je tvrzení o pH. [4] Další věta bez citace.', 4)).toBe('Tohle je tvrzení o pH.');
  });

  it('desetinná tečka větu nedělí; číslo [1] se nepletě s [12]', () => {
    expect(shrnutiZOdpovedi('Hodnota pH 5.4 je v pořádku[1] podle zdroje.', 1)).toBe('Hodnota pH 5.4 je v pořádku podle zdroje.');
    expect(shrnutiZOdpovedi('Jen dvanáctka[12].', 1)).toBe('');
  });

  it('dlouhé shrnutí se zkrátí na slově a končí třemi tečkami v jednom znaku', () => {
    const dlouha = `${'slovo '.repeat(200)}konec[5].`;
    const s = shrnutiZOdpovedi(dlouha, 5);
    expect(s.length).toBeLessThanOrEqual(600);
    expect(s.endsWith('…')).toBe(true);
    expect(s).not.toMatch(/ …$/);
    expect(s).not.toContain('konec');
  });

  it('bez věty s touto citací vrací prázdný řetězec', () => {
    expect(shrnutiZOdpovedi('Nic tu není.', 7)).toBe('');
    expect(shrnutiZOdpovedi('', 1)).toBe('');
  });

  it('mezera před značkou citace nezanechá mezeru před tečkou ani čárkou', () => {
    expect(shrnutiZOdpovedi('Tvrzení o pH [3]. Další věta.', 3)).toBe('Tvrzení o pH.');
    expect(shrnutiZOdpovedi('Při 18 °C [3], tedy chladněji.', 3)).toBe('Při 18 °C, tedy chladněji.');
  });

  it('řádek tabulky: svislé čáry zmizí', () => {
    expect(shrnutiZOdpovedi('| Teplota | 18 °C[2] |', 2)).toBe('Teplota 18 °C');
  });
});

describe('vstup pro uložení do bible', () => {
  it('vždy neověřený zdroj (důvěra 5), bez vydavatele, data a oblastí; shrnutí z odpovědi', () => {
    const v = webZdrojZOdpovedi(web(2, 'https://example.org/a', '  Článek o kvašení  '), 'Tvrzení z článku[2].');
    expect(v).toEqual({
      url: 'https://example.org/a', titulek: 'Článek o kvašení', vydavatel: '', datumPublikace: '', shrnuti: 'Tvrzení z článku.', oblasti: [], duvera: 5,
    });
  });

  it('úryvek stránky (citat) se neukládá ani nikam neprosákne', () => {
    const v = webZdrojZOdpovedi(web(2, 'https://example.org/a'), 'Tvrzení[2].');
    expect(JSON.stringify(v)).not.toContain('Úryvek stránky');
  });

  it('bez věty s citací: neutrální poznámka (shrnutí nesmí být prázdné); bez názvu titulek ze jména serveru', () => {
    const v = webZdrojZOdpovedi(web(2, 'https://www.example.org/a', '   '), 'Text bez značky.');
    expect(v?.shrnuti).toBe(SHRNUTI_NENALEZENO);
    expect(v?.titulek).toBe('www.example.org');
  });

  it('titulek se ořízne na 300 znaků (limit databáze)', () => {
    expect(webZdrojZOdpovedi(web(2, 'https://example.org/a', 'x'.repeat(500)), 'T[2].')?.titulek).toHaveLength(300);
  });

  it('kniha ani neplatná adresa uložit nejdou', () => {
    expect(webZdrojZOdpovedi(kniha, 'Text[1].')).toBeNull();
    expect(webZdrojZOdpovedi({ ...kniha, url: 'https://example.org/kniha' }, 'Text[1].')).toBeNull();
    expect(webZdrojZOdpovedi(web(2, 'javascript:alert(1)'), 'T[2].')).toBeNull();
    expect(webZdrojZOdpovedi(web(2, null), 'T[2].')).toBeNull();
    expect(webZdrojZOdpovedi(web(2, `https://example.org/${'a'.repeat(2000)}`), 'T[2].')).toBeNull();
  });
});
