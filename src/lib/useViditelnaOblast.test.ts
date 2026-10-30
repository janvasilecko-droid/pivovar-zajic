import { describe, expect, it } from 'vitest';
import { MIN_KLAVESNICE, viditelnaOblast } from './useViditelnaOblast';

describe('viditelnaOblast (okno nad klávesnicí, 30. 10. 2026)', () => {
  it('s klávesnicí vrátí viditelnou výšku a posun shora', () => {
    expect(viditelnaOblast(844, { height: 470.4, offsetTop: 12 })).toEqual({ vyska: 470, odshora: 12 });
  });
  it('bez klávesnice (jen schovaná lišta prohlížeče) nic nemění', () => {
    expect(viditelnaOblast(844, { height: 844 - MIN_KLAVESNICE + 1, offsetTop: 0 })).toBeNull();
    expect(viditelnaOblast(844, { height: 844, offsetTop: 0 })).toBeNull();
  });
  it('bez visualViewport (starší WebView) nic nemění', () => {
    expect(viditelnaOblast(844, null)).toBeNull();
  });
});
