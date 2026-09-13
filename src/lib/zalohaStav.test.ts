import { describe, it, expect } from 'vitest';
import { vyhodnotZalohu, type BehZalohy } from './zalohaStav';

const TED = new Date('2026-09-14T08:00:00Z');
const beh = (created_at: string, conclusion: string | null, status = 'completed'): BehZalohy =>
  ({ status, conclusion, created_at, html_url: `https://gh/${created_at}` });

describe('stav noční zálohy', () => {
  it('dnešní úspěšná záloha je v pořádku', () => {
    expect(vyhodnotZalohu([beh('2026-09-14T02:31:00Z', 'success')], TED).stav).toBe('ok');
  });

  it('poslední běh selhal → hlásí se hned, i když včerejší prošel', () => {
    const s = vyhodnotZalohu([beh('2026-09-14T02:31:00Z', 'failure'), beh('2026-09-13T02:31:00Z', 'success')], TED);
    expect(s).toMatchObject({ stav: 'selhala', url: 'https://gh/2026-09-14T02:31:00Z' });
  });

  it('běžící záloha se nepočítá — rozhoduje poslední dokončená', () => {
    expect(vyhodnotZalohu([beh('2026-09-14T07:59:00Z', null, 'in_progress'), beh('2026-09-14T02:31:00Z', 'success')], TED).stav).toBe('ok');
  });

  it('úspěch starší než dva dny = záloha neběží (třeba vypnutý plánovač)', () => {
    expect(vyhodnotZalohu([beh('2026-09-11T02:31:00Z', 'success')], TED).stav).toBe('stara');
  });

  it('bez jediného běhu je to „stará", ne v pořádku', () => {
    expect(vyhodnotZalohu([], TED).stav).toBe('stara');
  });

  it('když GitHub neodpoví, appka mlčí', () => {
    expect(vyhodnotZalohu(null, TED).stav).toBe('neznamo');
  });
});
