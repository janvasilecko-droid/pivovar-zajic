import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';

/**
 * Nahrávání hlasu → odeslání na edge funkci transcribe-audio (gpt-4o-transcribe) →
 * vrátí přepsaný text volajícímu přes onResult. Použitelné kdekoliv,
 * kde chceme rychle diktovat objednávku/položky namísto psaní.
 *
 * Volitelně lze předat `beerNames` a `placeNames` — použijí se jako
 * kontextová nápověda (prompt) pro přepis, aby model lépe rozpoznal
 * konkrétní názvy piv a odběratelů, které se v běžném textu nevyskytují.
 */
export function VoiceRecorder({
  onResult, compact, beerNames, placeNames, dark,
}: {
  onResult: (text: string) => void;
  compact?: boolean;
  beerNames?: string[];
  placeNames?: string[];
  /** Černé pozadí + bílý text v klidovém stavu, ať tlačítko sedí do řady
   *  ostatních jednobarevných tlačítek (viz Orders.tsx toolbar) místo
   *  výchozí amber varianty. Nahrávání zůstává červené (jasný alert stav). */
  dark?: boolean;
}) {

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = null;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          if (typeof recognition.abort === 'function') recognition.abort();
          else recognition.stop();
        } catch {}
      }

      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {}
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, []);

  async function start() {
    setErr(null);
    // Zkusíme nejdříve Web Speech API (vestavěný přepis v prohlížeči)
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      try {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'cs-CZ';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event: any) => {
          if (!mountedRef.current) return;
          const text = event.results[0][0].transcript;
          if (text.trim()) onResult(text.trim());
          else setErr('Nerozpoznal jsem žádný text.');
        };
        recognition.onerror = (event: any) => {
          if (!mountedRef.current) return;
          setRecording(false);
          if (event.error === 'not-allowed') {
            setErr('Mikrofon není povolen. Povol ho v prohlížeči (🔒 v adresním řádku) a zkus to znovu.');
          } else if (event.error === 'no-speech') {
            setErr('Nebyl detekován žádný hlas. Zkus mluvit blíž k mikrofonu.');
          } else if (event.error === 'aborted') {
            // Uživatel zrušil — žádná chyba
          } else {
            setErr('Chyba mikrofonu: ' + event.error + '. Zkus to znovu nebo použij jiný prohlížeč.');
          }
        };
        recognition.onend = () => {
          if (recognitionRef.current === recognition) recognitionRef.current = null;
          if (mountedRef.current) setRecording(false);
        };
        recognition.start();
        if (mountedRef.current) setRecording(true);
        return;
      } catch (e: any) {
        const recognition = recognitionRef.current;
        recognitionRef.current = null;
        try { recognition?.abort?.(); } catch {}
        // Web Speech API selhalo — zkusíme fallback na MediaRecorder + edge funkci
        console.warn('Web Speech API selhalo, zkouším fallback:', e?.message);
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null;
        if (streamRef.current === stream) streamRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        if (mountedRef.current) void handleStop(mimeType);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      if (mountedRef.current) setRecording(true);
    } catch (e: any) {
      if (mountedRef.current) setErr('Nelze spustit mikrofon: ' + (e?.message ?? String(e)));
    }
  }

  function stop() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { recognitionRef.current = null; }
    }
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== 'inactive') recorder?.stop();
    streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    if (mountedRef.current) setRecording(false);
  }

  function buildContextPrompt(): string {
    const parts: string[] = [];
    if (beerNames?.length) {
      parts.push('Názvy piv v nabídce: ' + beerNames.slice(0, 60).join(', ') + '.');
    }
    if (placeNames?.length) {
      parts.push('Známí odběratelé/hospody: ' + placeNames.slice(0, 80).join(', ') + '.');
    }
    return parts.join(' ');
  }

  async function handleStop(mimeType: string) {
    if (!mountedRef.current) return;
    setBusy(true);
    const abortController = new AbortController();
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = abortController;
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);
      if (!mountedRef.current) return;
      const contextPrompt = buildContextPrompt();

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: await authenticatedFunctionHeaders(),
        body: JSON.stringify({ audioBase64: base64, audioMimeType: mimeType, contextPrompt }),
        signal: abortController.signal,
      });

      const respText = await resp.text();
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try { msg += ': ' + (JSON.parse(respText)?.error ?? respText); } catch { msg += ': ' + respText; }
        throw new Error(msg);
      }
      let data: any;
      try { data = JSON.parse(respText); } catch { throw new Error('Neplatná odpověď: ' + respText.slice(0, 200)); }
      if (data?.error) throw new Error(data.error);
      const text: string = data?.text ?? '';
      if (!mountedRef.current) return;
      if (text.trim()) onResult(text.trim());
      else setErr('Nerozpoznal jsem žádný text. Zkus to znovu, mluv blíž k mikrofonu.');
    } catch (e: any) {
      if (mountedRef.current && e?.name !== 'AbortError') {
        setErr('Přepis selhal: ' + (e?.message ?? String(e)));
      }
    } finally {
      chunksRef.current = [];
      if (transcriptionAbortRef.current === abortController) transcriptionAbortRef.current = null;
      if (mountedRef.current) setBusy(false);
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Nelze zpracovat nahrávku'));
      reader.readAsDataURL(blob);
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={busy}
        title={recording ? 'Zastavit nahrávání' : 'Hlasové zadávání / Diktování'}
        className={`rounded flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs ${
          dark ? 'px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-[44px]' : 'px-3 py-1.5'
        } ${
          recording
            ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-500/30'
            : busy
              ? dark ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed' : 'bg-amber-100 text-amber-700 cursor-not-allowed border border-amber-300'
              : dark ? 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 active:scale-95' : 'bg-amber-50 text-amber-900 border border-amber-300/80 hover:bg-amber-100/90 active:scale-95'
        }`}
      >
        {busy ? (
          <>
            <Loader2 size={15} className="animate-spin text-amber-600" />
            <span>Přepisuji…</span>
          </>
        ) : recording ? (
          <>
            <Square size={15} className="fill-current text-white" />
            <span>Zastavit</span>
          </>
        ) : (
          <>
            <Mic size={15} className="text-amber-700" />
            <span>Hlasové zadání</span>
          </>
        )}
      </button>
      {err && <span className="text-xs text-rose-600 font-semibold">{err}</span>}
    </div>
  );
}
