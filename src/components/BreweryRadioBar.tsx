import { useState, useEffect } from 'react';
import { Radio, Play, Pause, Volume2, X } from 'lucide-react';
import {
  RADIO_STATIONS,
  getRadioState,
  toggleRadio,
  pauseRadio,
  RADIO_STATE_EVENT,
  type RadioState,
} from '../lib/breweryRadio';

interface BreweryRadioBarProps {
  onOpenModal: () => void;
}

export function BreweryRadioBar({ onOpenModal }: BreweryRadioBarProps) {
  const [state, setState] = useState<RadioState>(() => getRadioState());

  useEffect(() => {
    const handleUpdate = () => setState(getRadioState());
    window.addEventListener(RADIO_STATE_EVENT, handleUpdate);
    return () => window.removeEventListener(RADIO_STATE_EVENT, handleUpdate);
  }, []);

  if (!state.playing && !state.loading) return null;

  const currentStation = RADIO_STATIONS.find((s) => s.id === state.stationId) || RADIO_STATIONS[0];

  return (
    <div
      className="fixed bottom-16 sm:bottom-4 right-4 z-lista flex items-center gap-2.5 px-3.5 py-2 rounded-full shadow-lg border border-white/20 backdrop-blur-md text-white transition-all animate-slide-up"
      style={{
        background: `linear-gradient(135deg, ${currentStation.color || '#e03131'}ee, #1e1b4bee)`,
      }}
    >
      <button
        type="button"
        onClick={onOpenModal}
        className="flex items-center gap-2 text-left cursor-pointer hover:opacity-90 transition min-w-0"
      >
        <span className="text-lg">{currentStation.icon}</span>
        <div className="min-w-0 pr-1">
          <div className="text-xs font-black tracking-tight leading-tight truncate max-w-[130px] sm:max-w-[180px]">
            {currentStation.name}
          </div>
          <div className="text-udaj font-semibold text-white/80 leading-none truncate">
            {state.loading ? 'Načítám…' : currentStation.genre}
          </div>
        </div>
      </button>

      {state.playing && (
        <div className="flex items-end gap-0.5 h-3 px-1">
          <span className="w-0.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s] h-full" />
          <span className="w-0.5 bg-amber-300 rounded-full animate-bounce [animation-delay:-0.15s] h-2/3" />
          <span className="w-0.5 bg-amber-400 rounded-full animate-bounce h-full" />
        </div>
      )}

      <div className="flex items-center gap-1 pl-1 border-l border-white/20">
        <button
          type="button"
          onClick={toggleRadio}
          title={state.playing ? 'Pozastavit' : 'Spustit'}
          className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 transition tap"
        >
          {state.playing ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={pauseRadio}
          title="Zavřít lištu" aria-label="Zavřít lištu"
          className="p-1.5 rounded-full hover:bg-white/20 active:scale-95 transition text-white/70 hover:text-white tap"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
