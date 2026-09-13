// Určení odběratele ze zprávy — viz hlavička place-match.ts, proč je tohle
// vytažené z whatsapp-auto-parse/index.ts do samostatného souboru.
import { describe, it, expect } from 'vitest';
import { normPlaceName, isPlaceGrounded, matchPlaceSafely, resolvePlace, stripSenderName } from './place-match';

const PLACES = [
  { id: 'p-udubu', name: 'U Dubu' },
  { id: 'p-seeberg', name: 'Seeberg' },
  { id: 'p-ruzek', name: 'Restaurace Na Růžku' },
  { id: 'p-malesice', name: 'Malešice' },
];
const NO_ALIASES: { wrong_name: string; correct_name: string }[] = [];

describe('normPlaceName', () => {
  it('sjednotí velikost písmen, diakritiku a mezery', () => {
    expect(normPlaceName('  Seeberg  ')).toBe('seeberg');
    expect(normPlaceName('Malešice')).toBe('malesice');
    expect(normPlaceName(null)).toBe('');
    expect(normPlaceName(undefined)).toBe('');
  });
});

describe('isPlaceGrounded', () => {
  it('kandidát musí být opravdu v textu, ne jen vymyšlený', () => {
    expect(isPlaceGrounded('Tomáš', 'objednávka pro Tomáše od Marušky')).toBe(true);
    expect(isPlaceGrounded('Petr', 'objednávka pro Tomáše od Marušky')).toBe(false);
  });

  it('stačí shoda podstatného slova víceslovného kandidáta', () => {
    expect(isPlaceGrounded('Restaurace Na Růžku', 'poslat 4x30 na Růžku prosím')).toBe(true);
  });

  it('krátký kandidát (pod 3 znaky) se nikdy nepovažuje za ukotvený', () => {
    expect(isPlaceGrounded('Aj', 'Aj potřebuju 4x30')).toBe(false);
  });
});

describe('matchPlaceSafely', () => {
  it('přesná shoda s katalogem', () => {
    expect(matchPlaceSafely('Seeberg', 'objednávka Seeberg 4x30', PLACES, NO_ALIASES)).toEqual({
      id: 'p-seeberg', name: 'Seeberg',
    });
  });

  it('shoda podstatných slov: "Růžku" najde "Restaurace Na Růžku"', () => {
    expect(matchPlaceSafely('Růžku', 'poslat na Růžku 4x30', PLACES, NO_ALIASES)).toEqual({
      id: 'p-ruzek', name: 'Restaurace Na Růžku',
    });
  });

  it('naučený alias (zkomolený název → správný)', () => {
    const aliases = [{ wrong_name: 'Maneo', correct_name: 'Malešice' }];
    expect(matchPlaceSafely('Maneo', 'objednávka Maneo 4x30', PLACES, aliases)).toEqual({
      id: 'p-malesice', name: 'Malešice',
    });
  });

  it('kandidát mimo katalog a mimo text vrátí null, ne hádání', () => {
    expect(matchPlaceSafely('Tomáš', 'objednávka pro Tomáše od Marušky', PLACES, NO_ALIASES)).toEqual({
      id: null, name: null,
    });
  });

  it('kandidát, který v textu vůbec není, se ani nezkouší párovat s katalogem', () => {
    // I kdyby náhodou znělo podobně jako "Seeberg", bez ukotvení v textu je
    // to jen hádání ze seznamu známých odběratelů — přesně to má
    // isPlaceGrounded zarazit.
    expect(matchPlaceSafely('Seeberg', 'úplně jiná objednávka bez jména', PLACES, NO_ALIASES)).toEqual({
      id: null, name: null,
    });
  });
});

describe('stripSenderName', () => {
  it('odstraní jméno posla, ale nechá zbytek textu', () => {
    expect(stripSenderName('Ahoj, tady Miláček, pro U Dubu 4x30', 'Miláček')).toBe('Ahoj, tady , pro U Dubu 4x30');
  });

  it('bez jména odesílatele vrátí text beze změny', () => {
    expect(stripSenderName('pro U Dubu 4x30', null)).toBe('pro U Dubu 4x30');
  });
});

describe('resolvePlace', () => {
  // Z provozu 9. 9. 2026: „objednávka pro Tomáše od Marušky" (Maruška
  // posílá, Tomáš objednává) skončila jako Neznámý odběratel, přestože
  // AI přečetla "Tomáš" správně — jen v katalogu odběratelů ještě není.
  it('nový odběratel, který v katalogu není, se použije jako nezávazný název — NE jako Neznámý odběratel', () => {
    const text = 'objednávka pro Tomáše od Marušky 4x KEG 30l';
    const resolved = resolvePlace(
      ['Tomáš', text],       // matchCandidates: pole AI + celý text
      ['Tomáš'],             // freeformCandidates: jen strukturované pole AI
      text,
      PLACES,
      NO_ALIASES,
    );
    expect(resolved).toEqual({ id: null, name: 'Tomáš' });
  });

  it('když katalog něco najde, freeform se vůbec nezkouší', () => {
    const text = 'objednávka pro Seeberg 4x30';
    const resolved = resolvePlace(['Seeberg', text], ['Seeberg'], text, PLACES, NO_ALIASES);
    expect(resolved).toEqual({ id: 'p-seeberg', name: 'Seeberg' });
  });

  it('celý text zprávy se jako nezávazný název NIKDY nepoužije', () => {
    // Kdyby se `cleanTextForPlace` omylem dostal do freeformCandidates,
    // "Odběratel" by se vyplnil celým odstavcem místo jména.
    const text = 'ahoj potřebuju zítra 4x30 12sv a 2x50 desitku, diky';
    const resolved = resolvePlace([text], [], text, PLACES, NO_ALIASES);
    expect(resolved).toEqual({ id: null, name: null });
  });

  it('nezávazný kandidát musí být ukotvený v textu, jinak se ignoruje', () => {
    // Obrana proti tomu, kdyby AI i do vlastního pole place_name vrátila
    // něco, co se ve zprávě vůbec nevyskytuje.
    const text = 'objednávka 4x30 12sv';
    const resolved = resolvePlace([], ['Vymyšlený Podnik'], text, PLACES, NO_ALIASES);
    expect(resolved).toEqual({ id: null, name: null });
  });

  it('příliš dlouhý kandidát se jako název nepoužije (obrana proti AI, která vrátí celou větu)', () => {
    const dlouhy = 'A'.repeat(61) + ' Tomáš';
    const text = `objednávka pro ${dlouhy}`;
    const resolved = resolvePlace([], [dlouhy], text, PLACES, NO_ALIASES);
    expect(resolved).toEqual({ id: null, name: null });
  });

  it('nezávazný název se ořízne o okolní mezery', () => {
    const text = 'objednávka pro Tomáše';
    const resolved = resolvePlace([], ['  Tomáš  '], text, PLACES, NO_ALIASES);
    expect(resolved).toEqual({ id: null, name: 'Tomáš' });
  });

  it('prázdné/chybějící kandidáty se přeskočí beze spadu', () => {
    expect(resolvePlace([null, undefined, ''], [null, undefined, ''], 'text', PLACES, NO_ALIASES)).toEqual({
      id: null, name: null,
    });
  });
});
