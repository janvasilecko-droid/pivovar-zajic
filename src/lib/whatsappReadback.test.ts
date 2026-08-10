import { describe, it, expect } from 'vitest';
import {
  normalizeForReadback,
  normalizeForReadbackParts,
  findRawLineMatch,
  findRawLineFuzzyMatch,
  analyzeReadback,
  buildHighlightedSegments,
  extractOrderParts,
  diffWords,
  computeReadbackUnmatchedCount,
  findRepeatedReadbackErrors,
  findSimilarMessages,
} from './whatsappReadback';
import type { WhatsAppIncoming } from './whatsappApi';

function makeMessage(messageText: string, rawLines: (string | null | undefined)[]): WhatsAppIncoming {
  return {
    id: 'm1',
    created_at: '2026-08-09T10:00:00Z',
    sender_name: 'Bednář',
    message_text: messageText,
    message_type: 'text',
    status: 'parsed',
    parsed_items: rawLines.map((raw_line) => ({ raw_line })),
  };
}

describe('normalizeForReadback', () => {
  it('odstraní diakritiku, sjednotí mezery a převede na malá písmena', () => {
    expect(normalizeForReadback('U Dubu  4x30 12sv')).toBe('u dubu 4x30 12sv');
    expect(normalizeForReadback('  PIVO 11°  ')).toBe('pivo 11°');
  });
});

describe('findRawLineMatch', () => {
  const text = 'Dobrý den,\nSeeberg 4x30 12sv a 2x30 12sv\nvše 11sv';

  it('najde přesnou shodu a vrátí pozici v originálním textu', () => {
    const m = findRawLineMatch('4x30 12sv', text);
    expect(m).not.toBeNull();
    expect(text.slice(m!.start, m!.end)).toBe('4x30 12sv');
  });

  it('vrátí null, když se text v originálu nenachází (AI přečetla špatně)', () => {
    expect(findRawLineMatch('5x50 12sv', text)).toBeNull();
    expect(findRawLineMatch('4x30 13sv', text)).toBeNull();
  });

  it('ignoruje diakritiku a velikost písmen', () => {
    const m = findRawLineMatch('seeberg 4x30', text);
    expect(m).not.toBeNull();
  });

  it('vrátí null pro příliš krátký/špatný řetězec', () => {
    expect(findRawLineMatch('a', text)).toBeNull();
    expect(findRawLineMatch('', text)).toBeNull();
  });
});

describe('analyzeReadback', () => {
  it('označí položky, jejichž raw_line sedí s originálem', () => {
    const msg = makeMessage('Seeberg 4x30 12sv a 2x30 12sv', ['4x30 12sv', '2x30 12sv']);
    const rb = analyzeReadback(msg);
    expect(rb.matchedCount).toBe(2);
    expect(rb.unmatchedCount).toBe(0);
    expect(rb.items[0].status).toBe('matched');
  });

  it('označí položku s popleteným objemem jako částečnou shodu (fuzzy) se ⚠ na objemu', () => {
    const msg = makeMessage('Seeberg 4x30 12sv', ['4x50 12sv']);
    const rb = analyzeReadback(msg);
    expect(rb.partialCount).toBe(1);
    expect(rb.items[0].status).toBe('fuzzy');
    expect(rb.items[0].match).not.toBeNull();
    expect(rb.items[0].parts.find((p) => p.part.kind === 'volume')!.found).toBe(false);
  });

  it('vynechá položky bez raw_line (empty)', () => {
    const msg = makeMessage('Seeberg 4x30 12sv', ['4x30 12sv', null, '']);
    const rb = analyzeReadback(msg);
    expect(rb.matchedCount).toBe(1);
    expect(rb.unmatchedCount).toBe(0);
    expect(rb.items[1].status).toBe('empty');
    expect(rb.items[2].status).toBe('empty');
  });
});

describe('buildHighlightedSegments', () => {
  it('spojí překrývající se shody do jednoho zvýraznění s více odznaky', () => {
    const text = 'Seeberg 4x30 12sv';
    const segments = buildHighlightedSegments(text, [
      { start: 8, end: 15, badge: 1 }, // '4x30 12'
      { start: 8, end: 17, badge: 2 }, // '4x30 12sv'
    ]);
    const highlighted = segments.filter((s) => s.highlighted);
    expect(highlighted.length).toBe(1);
    expect(highlighted[0].badges).toEqual([1, 2]);
    expect(highlighted[0].text).toBe('4x30 12sv');
  });

  it('poskládané segmenty dají původní text beze změny', () => {
    const text = 'Seeberg 4x30 12sv a 2x30 12sv';
    const segments = buildHighlightedSegments(text, [
      { start: 8, end: 15, badge: 1 },
      { start: 20, end: 27, badge: 2 },
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });
});

describe('findRawLineFuzzyMatch', () => {
  it('najde shodu i při prohozeném pořadí slov („keg 50l" = „50l KEG")', () => {
    const f = findRawLineFuzzyMatch('keg 50l', 'Ahoj, na čtvrtek 50l KEG prosím');
    expect(f).not.toBeNull();
    expect(f!.score).toBeGreaterThanOrEqual(0.8);
  });

  it('najde shodu při překlepu („8°" vs „18°" NE; „12sv" vs „12°" ANO)', () => {
    const f = findRawLineFuzzyMatch('2x50l 12sv', '2x50l 12°');
    expect(f).not.toBeNull();
    expect(f!.score).toBeGreaterThanOrEqual(0.7);
  });

  it('vrátí null pro text, který v originálu není', () => {
    const f = findRawLineFuzzyMatch('4x50l 13°', '2x30l 12° a 1x20l 11°');
    expect(f).toBeNull();
  });
});

describe('extractOrderParts', () => {
  it('rozloží „4x30 12sv" na množství 4, objem 30 a stupeň 12', () => {
    const parts = extractOrderParts('4x30 12sv');
    expect(parts.map((p) => `${p.kind}:${p.value}`)).toEqual(
      expect.arrayContaining(['qty:4', 'volume:30', 'degree:12'])
    );
  });

  it('rozloží „2x50l" na množství 2 a objem 50 (deduplikace objemu)', () => {
    const parts = extractOrderParts('2x50l');
    const volumes = parts.filter((p) => p.kind === 'volume');
    expect(volumes).toHaveLength(1);
    expect(volumes[0].value).toBe('50');
  });

  it('zachová desetinný objem „1,5l"', () => {
    const parts = extractOrderParts('1,5l PET');
    expect(parts.some((p) => p.kind === 'volume' && p.value === '1,5')).toBe(true);
  });
});

describe('analyzeReadback — fuzzy a části', () => {
  it('označí prohozené pořadí slov jako částečnou shodu (fuzzy), ne jako špatné čtení', () => {
    const msg = makeMessage('Na čtvrtek prosím keg 50l 12°', ['50l keg 12°']);
    const rb = analyzeReadback(msg);
    expect(rb.unmatchedCount).toBe(0);
    expect(rb.partialCount).toBe(1);
    expect(rb.items[0].status).toBe('fuzzy');
  });

  it('kontrola po částech najde, že AI popletla objem (50l místo 30l)', () => {
    const msg = makeMessage('2x30l 12°', ['2x50l 12°']);
    const rb = analyzeReadback(msg);
    const item = rb.items[0];
    // Fuzzy shoda (2× a 12° sedí), ale kontrola částí ukáže ⚠ na objemu.
    expect(item.status).toBe('fuzzy');
    const volume = item.parts.find((p) => p.part.kind === 'volume');
    expect(volume).toBeDefined();
    expect(volume!.found).toBe(false);
    const degree = item.parts.find((p) => p.part.kind === 'degree');
    expect(degree!.found).toBe(true);
  });

  it('správně přečtená zpráva má skóre 100 a status matched', () => {
    const msg = makeMessage('Seeberg 4x30 12sv', ['4x30 12sv']);
    const rb = analyzeReadback(msg);
    expect(rb.items[0].status).toBe('matched');
    expect(rb.items[0].score).toBe(100);
    expect(rb.score).toBe(100);
  });

  it('skóre zprávy je průměr skóre položek a popisek odpovídá důvěře', () => {
    const msg = makeMessage('4x30 12sv a 2x50l 13°', ['4x30 12sv', '2x50l 13°']);
    const rb = analyzeReadback(msg);
    expect(rb.score).toBe(100);
    expect(rb.scoreLabel).toBe('Vysoká důvěra');
  });
});

describe('computeReadbackUnmatchedCount', () => {
  it('spočítá položky, jejichž raw_line není přesně v originálu', () => {
    expect(
      computeReadbackUnmatchedCount(
        [{ raw_line: '4x30 12sv' }, { raw_line: '2x50l 13°' }, { raw_line: '' }],
        '4x30 12sv a 2x50l 13°'
      )
    ).toBe(0);
    expect(
      computeReadbackUnmatchedCount([{ raw_line: '4x50l 13°' }], '4x30 12sv')
    ).toBe(1);
  });
});

describe('diffWords', () => {
  it('najde slova, která AI přidala a která přehlédla', () => {
    const segs = diffWords('2x50l 12°', '2x50l 13° prosím');
    expect(segs.some((s) => s.op === 'added' && s.text.includes('prosím'))).toBe(true);
    expect(segs.some((s) => s.op === 'added' && s.text.includes('13'))).toBe(true);
    expect(segs.some((s) => s.op === 'removed' && s.text.includes('12'))).toBe(true);
  });

  it('identické texty nemají žádné změny', () => {
    const segs = diffWords('2x50l 12°', '2x50l 12°');
    expect(segs.every((s) => s.op === 'same')).toBe(true);
  });
});

describe('findRepeatedReadbackErrors a findSimilarMessages', () => {
  it('najde raw_line, který se u stejného odesílatele nepovedlo přečíst 2×', () => {
    const m1 = makeMessage('2x50l 12°', ['2x50l 13°']);
    const m2 = makeMessage('2x50l 12°', ['2x50l 13°']);
    const errors = findRepeatedReadbackErrors([m1, m2]);
    expect(errors).toHaveLength(1);
    expect(errors[0].count).toBe(2);
    expect(errors[0].rawLine).toBe('2x50l 13°');
  });

  it('najde dvě zprávy se stejným obsahem jako možnou duplicitu', () => {
    const a = makeMessage('Na čtvrtek 2x50l 12° a 1x30l 11°', ['2x50l 12°']);
    const b = makeMessage('Na čtvrtek 2x50l 12° a 1x30l 11°', ['2x50l 12°']);
    const pairs = findSimilarMessages([a, b]);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].score).toBeGreaterThanOrEqual(0.85);
  });
});
