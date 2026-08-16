import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { VoiceRecorder } from './VoiceRecorder';

vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-session',
  }),
}));

class FakeSpeechRecognition {
  static last: FakeSpeechRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.last = this;
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  FakeSpeechRecognition.last = null;
  vi.restoreAllMocks();
});

describe('VoiceRecorder cleanup', () => {
  it('stops the active speech recognition from the Stop button', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    const view = render(<VoiceRecorder onResult={vi.fn()} />);

    fireEvent.click(view.getByRole('button', { name: /hlasové zadání/i }));
    expect(FakeSpeechRecognition.last?.start).toHaveBeenCalledOnce();

    fireEvent.click(view.getByRole('button', { name: /zastavit/i }));
    expect(FakeSpeechRecognition.last?.stop).toHaveBeenCalledOnce();
  });

  it('aborts recognition and detaches callbacks on unmount', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    const view = render(<VoiceRecorder onResult={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: /hlasové zadání/i }));
    const recognition = FakeSpeechRecognition.last!;

    view.unmount();

    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
  });
});
