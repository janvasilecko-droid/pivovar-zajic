import { describe, expect, it } from 'vitest';
import { renderFatalError } from './safeDom';

describe('renderFatalError', () => {
  it('does not interpret error text as HTML', () => {
    const root = document.createElement('div');
    const payload = '<img src=x onerror="window.__xss=1"><script>alert(1)</script>';

    expect(renderFatalError(root, 'Chyba', payload)).toBe(true);
    expect(root.textContent).toContain(payload);
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
  });

  it('does not replace an already mounted application unless explicitly requested', () => {
    const root = document.createElement('div');
    root.appendChild(document.createElement('main'));

    expect(renderFatalError(root, 'Chyba', 'test')).toBe(false);
    expect(root.querySelector('main')).not.toBeNull();
    expect(renderFatalError(root, 'Chyba', 'test', true)).toBe(true);
    expect(root.querySelector('main')).toBeNull();
  });
});
