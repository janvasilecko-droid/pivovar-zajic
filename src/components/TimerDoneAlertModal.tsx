import { useEffect, useState } from 'react';
import { AlarmClock, Bell, BellRing, Volume2, X, Check, Flame } from 'lucide-react';
import { playAlarmSound } from '../lib/notifications';
import { zavibruj } from '../lib/haptika';

interface TimerDoneAlertData {
  title: string;
  body: string;
}

export function TimerDoneAlertModal() {
  const [alertData, setAlertData] = useState<TimerDoneAlertData | null>(null);

  useEffect(() => {
    const onAlert = (e: Event) => {
      const custom = e as CustomEvent<TimerDoneAlertData>;
      if (custom.detail) {
        setAlertData(custom.detail);
      }
    };
    window.addEventListener('timer-done-alert', onAlert);
    return () => window.removeEventListener('timer-done-alert', onAlert);
  }, []);

  // Opakovaný alarm a vibrace každých 2,5 s dokud uživatel okno nezavře
  useEffect(() => {
    if (!alertData) return;
    playAlarmSound();
    try {
      navigator.vibrate?.([500, 150, 500, 150, 700]);
    } catch {}

    const interval = setInterval(() => {
      playAlarmSound();
      try {
        navigator.vibrate?.([500, 150, 500, 150, 700]);
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [alertData]);

  if (!alertData) return null;

  function dismiss() {
    try { zavibruj('klik'); } catch {}
    setAlertData(null);
  }

  function replay() {
    playAlarmSound();
    try {
      navigator.vibrate?.([500, 150, 500, 150, 700]);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-nadmodal flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-neutral-900 border-2 border-amber-500 rounded-2xl p-5 sm:p-6 text-white shadow-2xl shadow-amber-500/30 flex flex-col items-center text-center relative animate-bounce-short">
        {/* Zavírací křížek */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition tap"
          title="Zavřít"
        >
          <X size={18} />
        </button>

        {/* Animovaná ikona kotle / alarmu.
            podklad: bg-neutral-900 — panel modálu výš. */}
        <div className="w-20 h-20 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 mb-4 animate-pulse relative">
          <BellRing size={40} className="animate-bounce" />
          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center animate-ping" />
        </div>

        {/* Titulky */}
        <div className="text-xs font-black uppercase tracking-widest text-amber-400 mb-1">
          {alertData.title || 'Časovač vypršel!'}
        </div>
        <h3 className="text-2xl font-black font-display text-white mb-2 leading-tight">
          {alertData.body || 'Odpočet doběhl do konce'}
        </h3>
        <p className="text-xs text-neutral-400 mb-6">
          Zkontrolujte kotel, chmelení nebo probíhající proces ve varně.
        </p>

        {/* Tlačítka */}
        <div className="w-full flex flex-col gap-2.5">
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/25 transition flex items-center justify-center gap-2"
          >
            <Check size={18} className="stroke-[3]" /> Rozumím, vypnout alarm
          </button>
          <button
            type="button"
            onClick={replay}
            className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 font-bold text-xs transition flex items-center justify-center gap-2"
          >
            <Volume2 size={16} /> Přehrát zvuk a vibraci znovu
          </button>
        </div>
      </div>
    </div>
  );
}
