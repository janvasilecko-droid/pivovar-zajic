import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NahledBanner } from './NahledBanner';

describe('NahledBanner', () => {
  it('říká, že běží náhled, a nabízí jeho ukončení', () => {
    render(<NahledBanner />);
    expect(screen.getByRole('note').textContent).toContain('Náhled: nový běžný uživatel');
    expect(screen.getByText('Ukončit náhled')).toBeTruthy();
  });
});
