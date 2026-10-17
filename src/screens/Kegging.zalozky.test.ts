import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 17. 10. 2026: majitel na telefonu „řezání tam nikde nevidím" — šest záložek bylo
// v jednom posuvném řádku a Řezání zůstalo za okrajem obrazovky.
describe('záložky Stáčení KEG', () => {
  it('se zalamují na víc řádků, neposouvají se do strany', () => {
    const zdroj = readFileSync('src/screens/Kegging.tsx', 'utf8');
    const radek = zdroj.split('\n').find((r) => r.includes('p-1 rounded w-full sm:w-auto sm:flex-1'));
    expect(radek).toBeDefined();
    expect(radek).toMatch(/flex-wrap/);
    expect(radek).not.toMatch(/overflow-x-auto|flex-nowrap/);
  });
});
