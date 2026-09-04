import { useEffect, useRef, useState } from 'react';
import { Check, Eraser, PenLine } from 'lucide-react';
import { Modal } from './ui';
import {
  pridejBod, novyTah, jePodpisPrazdny, podpisJeMocVelky, prepocitejNaPlochu,
  type Tah,
} from '../lib/podpis';

/**
 * ✍️ Podpis převzetí prstem na displeji.
 *
 * Kreslí se do canvasu, ukládá jako PNG (data URL) a k němu rozměry
 * plátna — díky nim se podpis dá nakreslit ve správném poměru i na jiném
 * telefonu a na papíře.
 *
 * Prázdný podpis se neuloží: tečka jako doklad o převzetí je horší než
 * nemít nic.
 */
export function PodpisModal({ open, onClose, nazev, onUlozit }: {
  open: boolean;
  onClose: () => void;
  /** Komu se veze — ať je na plátně vidět, u čeho se podepisuje. */
  nazev: string;
  onUlozit: (podpis: { png: string; prevzal: string; sirka: number; vyska: number }) => Promise<void> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tahyRef = useRef<Tah[]>([]);
  const kresliRef = useRef(false);
  const [prevzal, setPrevzal] = useState('');
  const [maInkoust, setMaInkoust] = useState(false);
  const [uklada, setUklada] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    tahyRef.current = [];
    setMaInkoust(false);
    setChyba(null);
    setPrevzal('');
    // Plátno se nastavuje po otevření — dřív má nulovou velikost a
    // podpis by se kreslil do ničeho.
    const t = setTimeout(() => nastavPlatno(), 30);
    return () => clearTimeout(t);
  }, [open]);

  function nastavPlatno() {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    // Na telefonu s retina displejem by canvas v CSS pixelech byl rozmazaný.
    const pomer = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(rect.width * pomer);
    c.height = Math.round(rect.height * pomer);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(pomer, pomer);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    prekresli();
  }

  function prekresli() {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const tah of tahyRef.current) {
      if (tah.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(tah[0].x, tah[0].y);
      for (let i = 1; i < tah.length; i += 1) ctx.lineTo(tah[i].x, tah[i].y);
      // Jednotlivý bod by jinak nebyl vidět vůbec.
      if (tah.length === 1) ctx.lineTo(tah[0].x + 0.1, tah[0].y);
      ctx.stroke();
    }
  }

  function bodZUdalosti(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    kresliRef.current = true;
    tahyRef.current = novyTah(tahyRef.current);
    tahyRef.current = pridejBod(tahyRef.current, bodZUdalosti(e));
    prekresli();
  }

  function tahni(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!kresliRef.current) return;
    const pred = tahyRef.current;
    tahyRef.current = pridejBod(pred, bodZUdalosti(e));
    if (tahyRef.current !== pred) {
      prekresli();
      if (!maInkoust) setMaInkoust(true);
    }
  }

  function konec() {
    kresliRef.current = false;
    setMaInkoust(!jePodpisPrazdny(tahyRef.current));
  }

  function smaz() {
    tahyRef.current = [];
    setMaInkoust(false);
    setChyba(null);
    prekresli();
  }

  async function uloz() {
    const c = canvasRef.current;
    if (!c) return;
    if (jePodpisPrazdny(tahyRef.current)) {
      setChyba('Tohle ještě není podpis — podepiš se prstem přes celé pole.');
      return;
    }
    // Bílý podklad: PNG s průhledným pozadím je na papíře i v tmavém
    // režimu černý podpis na černém.
    const rect = c.getBoundingClientRect();
    const out = document.createElement('canvas');
    out.width = Math.round(rect.width);
    out.height = Math.round(rect.height);
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tah of prepocitejNaPlochu(tahyRef.current, { sirka: rect.width, vyska: rect.height }, { sirka: out.width, vyska: out.height })) {
      if (tah.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(tah[0].x, tah[0].y);
      for (let i = 1; i < tah.length; i += 1) ctx.lineTo(tah[i].x, tah[i].y);
      if (tah.length === 1) ctx.lineTo(tah[0].x + 0.1, tah[0].y);
      ctx.stroke();
    }
    const png = out.toDataURL('image/png');
    if (podpisJeMocVelky(png)) {
      setChyba('Podpis je nečekaně velký a neuložil se. Zkus to znovu, nebo to nahlas.');
      return;
    }
    setUklada(true);
    try {
      await onUlozit({ png, prevzal: prevzal.trim(), sirka: out.width, vyska: out.height });
      onClose();
    } finally {
      setUklada(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Podpis převzetí">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-neutral-700">
          {nazev} — nechte odběratele podepsat prstem. Podpis se uloží k objednávce.
        </p>

        <canvas
          ref={canvasRef}
          // touch-none: bez toho by tažení prstem rolovalo stránkou místo kreslení.
          className="w-full h-44 rounded-xl border-2 border-dashed border-neutral-400 bg-white touch-none"
          onPointerDown={start}
          onPointerMove={tahni}
          onPointerUp={konec}
          onPointerCancel={konec}
          onPointerLeave={konec}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={smaz}
            className="px-3 py-1.5 rounded font-black text-xs bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-100"
          >
            <span className="inline-flex items-center gap-1.5"><Eraser size={14} /> Smazat a podepsat znovu</span>
          </button>
          <input
            type="text"
            value={prevzal}
            onChange={(e) => setPrevzal(e.target.value)}
            placeholder="Kdo převzal (nepovinné)"
            className="input flex-1 min-w-[160px] text-sm"
          />
        </div>

        {chyba && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold">
            {chyba}
          </div>
        )}

        <button
          type="button"
          onClick={() => { void uloz(); }}
          disabled={uklada || !maInkoust}
          className="w-full py-3 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm transition disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-2">
            {maInkoust ? <Check size={18} /> : <PenLine size={18} />}
            {uklada ? 'Ukládám…' : maInkoust ? 'Uložit podpis' : 'Nejdřív se podepiš'}
          </span>
        </button>
      </div>
    </Modal>
  );
}
