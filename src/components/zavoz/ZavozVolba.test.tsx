import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZavozVolba } from './ZavozVolba';

describe('ZavozVolba – dny jako tlačítka', () => {
  it('ukáže Po–Pá, aktuální den je zvýrazněný a klik přesune na jiný den', () => {
    const onDen = vi.fn();
    render(<ZavozVolba cislo={1} den="st" dostupne={false} onCislo={() => {}} onDen={onDen} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Po', 'Út', 'St', 'Čt', 'Pá']);
    expect(screen.getByText('St').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('Čt'));
    expect(onDen).toHaveBeenCalledWith('ct');
    fireEvent.click(screen.getByText('St'));
    expect(onDen).toHaveBeenCalledTimes(1);
  });
});
