import { useState, useEffect } from 'react';
import { Radio, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Sparkles, Music2, X } from 'lucide-react';
import {
  RADIO_STATIONS,
  getRadioState,
  playRadio,
  pauseRadio,
  toggleRadio,
  setRadioStation,
  setRadioVolume,
  nextStation,
  prevStation,
  RADIO_STATE_EVENT,
  type RadioState,
} from '../lib/breweryRadio';
import { Modal } from './ui';

interface BreweryRadioModalProps {
  open: boolean;
  onClose: () => void;
}

export function BreweryRadioModal({ open, onClose }: BreweryRadioModalProps) {
  const [state, setState] = useState<RadioState>(() => getRadioState());

  useEffect(() => {
    const handleUpdate = () => setState(getRadioState());
    window.addEventListener(RADIO_STATE_EVENT, handleUpdate);
    return () => window.removeEventListener(RADIO_STATE_EVENT, handleUpdate);
  }, []);

  if (!open) return null;

  const currentStation = RADIO_STATIONS.find((s) => s.id === state.stationId) || RADIO_STATIONS[0];

  return (
    <Modal open={open} onClose={onClose} title="📻 Pivovarské Rádio & Hudba na pozadí">
      <div className="space-y-4">
        {/* Main active station player card */}
        <div
          className="p-5 rounded-2xl text-white relative overflow-hidden shadow-md transition-all"
          style={{
            background: `linear-gradient(135deg, ${currentStation.color || '#e03131'} 0%, #1e1b4b 100%)`,
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{currentStation.icon}</span>
              <div>
                <h3 className="text-xl font-black tracking-tight">{currentStation.name}</h3>
                <p className="text-xs font-semibold text-white/80">{currentStation.genre}</p>
              </div>
            </div>
            {state.playing && (
              <div className="flex items-end gap-1 h-5 px-2 py-1 rounded bg-black/30">
                <span className="w-1 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s] h-full" />
                <span className="w-1 bg-amber-300 rounded-full animate-bounce [animation-delay:-0.15s] h-3/4" />
                <span className="w-1 bg-amber-400 rounded-full animate-bounce h-full" />
              </div>
            )}
          </div>

          {/* Chybová hláška patří na plný podklad: rose-900 s průhledností
              vyšla na bílém panelu světle růžová a světlý text v ní zmizel —
              tedy zpráva o chybě byla nečitelná právě tehdy, kdy je potřeba. */}
          {state.error && (
            <p className="text-xs text-rose-900 bg-rose-50 border border-rose-300 dark:text-rose-200 dark:bg-rose-950 dark:border-rose-800 p-2 rounded-lg mb-3">
              {state.error}
            </p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 my-2">
            <button
              type="button"
              onClick={prevStation}
              title="Předchozí stanice"
              // Plná tmavá, ne bílá s průhledností: karta má barvu stanice
              // (inline přechod) a na světlejší stanici se bílá ikona na
              // 15% bílé neztrácela jen trochu — nebyla vidět vůbec.
              className="p-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 active:scale-95 transition text-white"
            >
              <SkipBack size={20} />
            </button>

            <button
              type="button"
              onClick={toggleRadio}
              title={state.playing ? 'Pozastavit rádio' : 'Spustit rádio'}
              className="p-4 rounded-full bg-white text-neutral-950 hover:bg-amber-300 active:scale-95 transition shadow-lg flex items-center justify-center font-black"
            >
              {state.loading ? (
                <span className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
              ) : state.playing ? (
                <Pause size={24} className="fill-current" />
              ) : (
                <Play size={24} className="fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={nextStation}
              title="Další stanice"
              className="p-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 active:scale-95 transition text-white"
            >
              <SkipForward size={20} />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 pt-3 mt-2 border-t border-white/15">
            <button
              type="button"
              onClick={() => setRadioVolume(state.volume > 0 ? 0 : 0.8)}
              className="text-white/80 hover:text-white"
            >
              {state.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.volume}
              onChange={(e) => setRadioVolume(Number(e.target.value))}
              className="flex-1 accent-amber-400 h-1.5 bg-white/25 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-bold w-8 text-right text-white/80">
              {Math.round(state.volume * 100)} %
            </span>
          </div>
        </div>

        {/* Informational tip */}
        <div className="bg-amber-50 border border-amber-200 text-amber-950 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2">
          <Sparkles size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Rádio hraje na pozadí:</strong> Můžete libovolně překlikávat mezi Sklepem, Skladem i Objednávkami a rádio nepřestane hrát.
          </span>
        </div>

        {/* Stations List */}
        <div>
          <h4 className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">
            Vyberte stanici
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
            {RADIO_STATIONS.map((station) => {
              const isSelected = station.id === state.stationId;
              const isPlayingThis = isSelected && state.playing;

              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => setRadioStation(station.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
                      : 'bg-white border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0">{station.icon}</span>
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm text-neutral-900 truncate">
                        {station.name}
                      </div>
                      <div className="text-[11px] font-semibold text-neutral-500 truncate">
                        {station.genre}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 pl-2">
                    {isPlayingThis ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-neutral-950 uppercase tracking-wider animate-pulse">
                        Hraje
                      </span>
                    ) : isSelected ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 text-neutral-700">
                        Zvoleno
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold bg-neutral-200 hover:bg-neutral-300 rounded text-neutral-900"
          >
            Zavřít
          </button>
        </div>
      </div>
    </Modal>
  );
}
