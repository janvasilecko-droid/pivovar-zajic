import { useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

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
  onResult, compact, beerNames, placeNames,
}: {
  onResult: (text: string) => void;
  compact?: boolean;
  beerNames?: string[];
  placeNames?: string[];
}) {

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => handleStop(mimeType);
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) {
      setErr('Nelze spustit mikrofon: ' + (e?.message ?? String(e)));
    }
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
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
    setBusy(true);
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);
      const contextPrompt = buildContextPrompt();

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ audioBase64: base64, audioMimeType: mimeType, contextPrompt }),
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
      if (text.trim()) onResult(text.trim());
      else setErr('Nerozpoznal jsem žádný text. Zkus to znovu, mluv blíž k mikrofonu.');
    } catch (e: any) {
      setErr('Přepis selhal: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
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
        className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs ${
          recording
            ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-500/30'
            : busy
              ? 'bg-amber-100 text-amber-700 cursor-not-allowed border border-amber-300'
              : 'bg-amber-50 text-amber-900 border border-amber-300/80 hover:bg-amber-100/90 active:scale-95'
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
