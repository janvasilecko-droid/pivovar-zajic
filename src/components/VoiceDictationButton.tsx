import { useState, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
  label?: string;
}

export function VoiceDictationButton({ onTranscript, className = '', label = '🎙️ Diktovat hlasem' }: VoiceDictationButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      setSupported(true);
    }
  }, []);

  function startListening() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'cs-CZ';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          onTranscript(transcript);
        }
        setListening(false);
      };

      recognition.onerror = (err: any) => {
        console.warn('Speech recognition error', err);
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.start();
    } catch (e) {
      setListening(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={startListening}
      className={`px-3 py-1.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 shadow-2xs ${
        listening
          ? 'bg-rose-600 text-white animate-pulse'
          : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300'
      } ${className}`}
      title="Klikni a diktuj česky hlasem (např. 'Pivo 11 stupňů 5 sudů')."
    >
      {listening ? <MicOff size={14} /> : <Mic size={14} />}
      <span>{listening ? 'Poslouchám…' : label}</span>
    </button>
  );
}
