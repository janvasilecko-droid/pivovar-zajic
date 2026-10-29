import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { jePolohaDoku, KLIC_POLOHY_DOKU, nactiPolohuDoku, ulozPolohuDoku, usePolohuDoku } from './polohaDoku';

describe('poloha lišty', () => {
  beforeEach(() => localStorage.clear());

  it('výchozí je dole, neznámá hodnota se ignoruje', () => {
    expect(nactiPolohuDoku()).toBe('dole');
    localStorage.setItem(KLIC_POLOHY_DOKU, 'nahore');
    expect(nactiPolohuDoku()).toBe('dole');
    expect(jePolohaDoku('vpravo')).toBe(true);
    expect(jePolohaDoku('x')).toBe(false);
  });

  it('uložená volba se přečte a hook se překreslí hned po změně', () => {
    const { result } = renderHook(() => usePolohuDoku());
    expect(result.current).toBe('dole');
    act(() => ulozPolohuDoku('vlevo'));
    expect(result.current).toBe('vlevo');
    expect(nactiPolohuDoku()).toBe('vlevo');
  });
});
