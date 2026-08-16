import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('version check lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'caches');
  });

  it('creates only one initial timeout and one interval', async () => {
    const { startVersionCheck, stopVersionCheck } = await import('./versionCheck');

    startVersionCheck();
    startVersionCheck();

    expect(vi.getTimerCount()).toBe(2);
    stopVersionCheck();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears only application-owned cache entries', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['pivovar-1.0', 'pivovar-meta', 'another-app-cache']),
        delete: deleteCache,
      },
    });
    const { clearAppCaches } = await import('./versionCheck');

    await clearAppCaches();

    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith('pivovar-1.0');
    expect(deleteCache).toHaveBeenCalledWith('pivovar-meta');
    expect(deleteCache).not.toHaveBeenCalledWith('another-app-cache');
  });
});
