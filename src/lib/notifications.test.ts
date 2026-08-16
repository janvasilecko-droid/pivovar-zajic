import { afterEach, describe, expect, it, vi } from 'vitest';
import { playOrderChime } from './notifications';

describe('playOrderChime', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'AudioContext');
  });

  it('closes the AudioContext after playback', async () => {
    vi.useFakeTimers();
    const close = vi.fn().mockResolvedValue(undefined);

    class FakeAudioContext {
      currentTime = 0;
      state: AudioContextState = 'running';
      destination = {};
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }
      close() {
        this.state = 'closed';
        return close();
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });

    playOrderChime();
    await vi.advanceTimersByTimeAsync(1500);

    expect(close).toHaveBeenCalledOnce();
  });
});
