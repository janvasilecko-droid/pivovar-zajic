import { describe, it, expect } from 'vitest';
import { jeMesicVSeznamuUzavren } from './closedMonths';

describe('jeMesicVSeznamuUzavren', () => {
  it('měsíc v seznamu zavřených je uzavřený', () => {
    expect(jeMesicVSeznamuUzavren([{ month: '2026-08' }, { month: '2026-07' }], '2026-08')).toBe(true);
  });

  it('měsíc mimo seznam je otevřený', () => {
    expect(jeMesicVSeznamuUzavren([{ month: '2026-08' }], '2026-09')).toBe(false);
  });

  it('prázdný seznam — žádný měsíc není uzavřený', () => {
    expect(jeMesicVSeznamuUzavren([], '2026-08')).toBe(false);
  });
});
