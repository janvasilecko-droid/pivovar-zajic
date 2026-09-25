// Určení odběratele ze zprávy — viz hlavička place-match.ts, proč je tohle
// vytažené z whatsapp-auto-parse/index.ts do samostatného souboru.
import { describe, it, expect } from 'vitest';
import { normPlaceName, isPlaceGrounded, matchPlaceSafely, matchOwnOrderPlace, matchAgainstCatalog, resolvePlace, odberatelZHistorie, stripSenderName, wantsOwnOrder } from './place-match';

const PLACES = [
  { id: 'p-udubu', name: 'U Dubu' },
  { id: 'p-seeberg', name: 'Seeberg' },
  { id: 'p-ruzek', name: 'Restaurace Na Růžku' },
  { id: 'p-malesice', name: 'Malešice' },
  // Zákazník, který se křestním jménem shoduje se zaměstnancem/sládkem
  // (viz `wantsOwnOrder`/`matchOwnOrderPlace` níž, z provozu 16. 9. 2026).
  { id: 'p-petr', name: 'petr' },
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

  // Z provozu 16. 9. 2026: "Lucka jede zitra do skoly do Pisku a bude brat
  // pivo, tak pro me prosim dnes 1x30l 11sv, Gabi pripis mi to..." — sám
  // odesílatel je odběratel, jeho jméno se v textu vůbec nevyskytuje (proto
  // ho matchCandidates/freeformCandidates ukotvené v textu nikdy nechytí),
  // a navíc se křestním jménem shoduje se zaměstnancem ("Petr Bednář").
  it('"pro mě" najde odběratele podle odesílatele, i když jeho jméno v textu vůbec není', () => {
    const text = 'Lucka jede zitra do skoly, tak pro me prosim dnes 1x30l 11sv, diky';
    const resolved = resolvePlace([], [], text, PLACES, NO_ALIASES, 'Petr Bednář');
    expect(resolved).toEqual({ id: 'p-petr', name: 'petr' });
  });

  it('výslovně jmenovaný odběratel v textu má přednost i před "pro mě"', () => {
    const text = 'pro mě prosim poslat na Seeberg 4x30';
    const resolved = resolvePlace(['Seeberg', text], ['Seeberg'], text, PLACES, NO_ALIASES, 'Petr Bednář');
    expect(resolved).toEqual({ id: 'p-seeberg', name: 'Seeberg' });
  });

  it('"pro mě" bez shody v katalogu nabídne aspoň jméno odesílatele jako nezávazné', () => {
    const text = 'pro mě prosim zítra 2x30 12sv';
    const resolved = resolvePlace([], [], text, PLACES, NO_ALIASES, 'Nový Zákazník');
    expect(resolved).toEqual({ id: null, name: 'Nový Zákazník' });
  });
});

describe('wantsOwnOrder', () => {
  it('pozná "pro mě"/"mi"/"mně"/"pro mne"/"pro sebe"', () => {
    expect(wantsOwnOrder('tak pro me prosim dnes 1x30l')).toBe(true);
    expect(wantsOwnOrder('pripis mi to na ucet')).toBe(true);
    expect(wantsOwnOrder('posli mně 2x30')).toBe(true);
    expect(wantsOwnOrder('objednávka pro mne na zítra')).toBe(true);
    expect(wantsOwnOrder('vezmu si to pro sebe')).toBe(true);
  });

  it('nehlásí se u objednávky pro někoho jiného', () => {
    expect(wantsOwnOrder('objednávka pro Tomáše od Marušky')).toBe(false);
    expect(wantsOwnOrder('4x30 12sv na Seeberg')).toBe(false);
  });
});

describe('matchAgainstCatalog', () => {
  // Z provozu 16. 9. 2026: fotka/modál objednávky znovu-hledá ID k jménu,
  // které je UŽ VYBRANÉ — žádné ukotvení v textu, žádný blacklist podle
  // "vypadá to jako zaměstnanec". Skutečný zákazník v katalogu (i "petr")
  // musí projít, ať se jmenuje jakkoliv.
  it('najde zákazníka v katalogu, i když se jmenuje stejně jako zaměstnanec', () => {
    expect(matchAgainstCatalog('petr', PLACES, NO_ALIASES)).toEqual({ id: 'p-petr', name: 'petr' });
    expect(matchAgainstCatalog('Petr Bednář', PLACES, NO_ALIASES)).toEqual({ id: 'p-petr', name: 'petr' });
  });

  it('bez shody v katalogu vrátí null (žádné ukotvení v textu se nekontroluje)', () => {
    expect(matchAgainstCatalog('Někdo Neznámý', PLACES, NO_ALIASES)).toEqual({ id: null, name: null });
  });
});

describe('matchOwnOrderPlace', () => {
  it('nepotřebuje ukotvení v textu — hledá přímo v katalogu podle jména odesílatele', () => {
    expect(matchOwnOrderPlace('Petr Bednář', PLACES, NO_ALIASES)).toEqual({ id: 'p-petr', name: 'petr' });
  });

  it('bez shody v katalogu vrátí null (o nezávazný název se stará resolvePlace)', () => {
    expect(matchOwnOrderPlace('Nikdo Neznámý', PLACES, NO_ALIASES)).toEqual({ id: null, name: null });
  });

  it('prázdné jméno odesílatele nespadne', () => {
    expect(matchOwnOrderPlace(null, PLACES, NO_ALIASES)).toEqual({ id: null, name: null });
    expect(matchOwnOrderPlace(undefined, PLACES, NO_ALIASES)).toEqual({ id: null, name: null });
  });
});

// ── Odběratel z historie objednávek odesílatele ───────────────────────────
// Zadání z 19. 9. 2026: „pořádně číst odběratele ve zprávách i pokud není již
// uložený, aby ho aplikace dokázala vždy najít." Jméno z historie v textu
// zprávy z podstaty věci není, takže by ho `matchPlaceSafely` zahodilo —
// ukotvením je tady seznam odběratelů, pro které odesílatel už objednával.
describe('odberatelZHistorie', () => {
  it('jméno z historie najde v katalogu, i když v textu zprávy vůbec není', () => {
    expect(odberatelZHistorie(['Seeberg'], ['Seeberg', 'U Dubu'], PLACES, NO_ALIASES))
      .toEqual({ id: 'p-seeberg', name: 'Seeberg' });
  });

  it('co v historii odesílatele není, se zahodí — radši neznámý než špatný zákazník', () => {
    expect(odberatelZHistorie(['Malešice'], ['Seeberg'], PLACES, NO_ALIASES))
      .toEqual({ id: null, name: null });
  });

  it('bez historie nevrací nic', () => {
    expect(odberatelZHistorie(['Seeberg'], [], PLACES, NO_ALIASES)).toEqual({ id: null, name: null });
  });

  it('stačí obsažení: „Růžku" proti „Restaurace Na Růžku" z historie', () => {
    expect(odberatelZHistorie(['Růžku'], ['Restaurace Na Růžku'], PLACES, NO_ALIASES))
      .toEqual({ id: 'p-ruzek', name: 'Restaurace Na Růžku' });
  });

  it('odběratel z historie, který už v katalogu není, se nabídne aspoň jako nezávazný název', () => {
    expect(odberatelZHistorie(['Vildštejn'], ['Vildštejn'], PLACES, NO_ALIASES))
      .toEqual({ id: null, name: 'Vildštejn' });
  });

  it('bere první kandidát, který v historii sedí', () => {
    expect(odberatelZHistorie([null, 'Malešice', 'Seeberg'], ['Seeberg'], PLACES, NO_ALIASES))
      .toEqual({ id: 'p-seeberg', name: 'Seeberg' });
  });
});

// ── Ukotvení o citovanou zprávu ───────────────────────────────────────────
// U ODPOVĚDI je odběratel napsaný v citované zprávě, ne v odpovědi samé
// (z provozu 17. 9. 2026). whatsapp-auto-parse proto do `resolvePlace`
// posílá text zprávy + citaci.
describe('resolvePlace s textem včetně citace', () => {
  it('odběratele z citované zprávy považuje za ukotveného', () => {
    const odpoved = '60x0,5l. Grep a 40x0,5l. Citrón';
    const sCitaci = `${odpoved}\nSeeberg: 4x30 svetla`;
    expect(resolvePlace(['Seeberg'], [], odpoved, PLACES, NO_ALIASES))
      .toEqual({ id: null, name: null });
    expect(resolvePlace(['Seeberg'], [], sCitaci, PLACES, NO_ALIASES))
      .toEqual({ id: 'p-seeberg', name: 'Seeberg' });
  });
});
