// Pivovarské rádio a hudba na pozadí — umožňuje vařičům a sklepmistrům
// poslouchat hudbu/rádio přímo v aplikaci při práci (sklep, stáčení, sklad,
// rozvoz). Zvuk běží kontinuálně na pozadí při procházení všech stránek.
// Využívá MediaSession API pro ovládání ze zamčené obrazovky i Bluetooth sluchátek.

export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  streamUrl: string;
  icon: string;
  color: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'beat',
    name: 'Rádio Beat',
    genre: 'Classic Rock',
    streamUrl: 'https://stream.rcs.revma.com/beat128.mp3',
    icon: '🎸',
    color: '#e03131',
  },
  {
    id: 'rock',
    name: 'Rock Rádio',
    genre: 'Rock & Metal',
    streamUrl: 'https://stream.rcs.revma.com/rockradio128.mp3',
    icon: '⚡',
    color: '#fd7e14',
  },
  {
    id: 'blanik',
    name: 'Rádio Blaník',
    genre: 'České hity & Pohoda',
    streamUrl: 'https://stream.rcs.revma.com/blanik128.mp3',
    icon: '☀️',
    color: '#f59f00',
  },
  {
    id: 'impuls',
    name: 'Rádio Impuls',
    genre: 'Domácí hity & Zprávy',
    streamUrl: 'https://stream.rcs.revma.com/impuls128.mp3',
    icon: '📻',
    color: '#339af0',
  },
  {
    id: 'evropa2',
    name: 'Evropa 2',
    genre: 'Dnešní hity & Pop',
    streamUrl: 'https://stream.rcs.revma.com/e2128.mp3',
    icon: '🎧',
    color: '#7048e8',
  },
  {
    id: 'fajn',
    name: 'Fajn Rádio',
    genre: 'Modern Pop & Dance',
    streamUrl: 'https://stream.rcs.revma.com/fajn128.mp3',
    icon: '🔥',
    color: '#e066b0',
  },
  {
    id: 'jazz',
    name: 'ČRo Jazz',
    genre: 'Jazz & Blues',
    streamUrl: 'https://stream.rcs.revma.com/crojazz128.mp3',
    icon: '🎷',
    color: '#12b886',
  },
  {
    id: 'chill',
    name: 'Chillout Lounge',
    genre: 'Pohodová ambientní hudba',
    streamUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
    icon: '☕',
    color: '#2f9e64',
  },
];

export interface RadioState {
  playing: boolean;
  loading: boolean;
  stationId: string;
  volume: number; // 0.0 - 1.0
  muted: boolean;
  error: string | null;
}

const STORAGE_KEY = 'brewery_radio_v1';
export const RADIO_STATE_EVENT = 'brewery_radio_state_changed';

let audioElement: HTMLAudioElement | null = null;

function loadSavedState(): { stationId: string; volume: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        stationId: parsed.stationId || RADIO_STATIONS[0].id,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.8,
      };
    }
  } catch {}
  return { stationId: RADIO_STATIONS[0].id, volume: 0.8 };
}

function saveState(state: { stationId: string; volume: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const initialConfig = loadSavedState();

const currentRadioState: RadioState = {
  playing: false,
  loading: false,
  stationId: initialConfig.stationId,
  volume: initialConfig.volume,
  muted: false,
  error: null,
};

export function getRadioState(): RadioState {
  return { ...currentRadioState };
}

function notifyState() {
  window.dispatchEvent(new CustomEvent(RADIO_STATE_EVENT, { detail: { ...currentRadioState } }));
}

function setupMediaSession(station: RadioStation) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.genre,
      album: 'Pivovar Zajíc — Rádio',
      artwork: [
        { src: '/favicon.ico', sizes: '96x96', type: 'image/x-icon' },
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      ],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      void playRadio();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      pauseRadio();
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      pauseRadio();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextStation();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prevStation();
    });
  } catch {}
}

export function getAudioElement(): HTMLAudioElement {
  if (!audioElement && typeof window !== 'undefined') {
    audioElement = new Audio();
    audioElement.preload = 'none';
    audioElement.volume = currentRadioState.volume;

    audioElement.addEventListener('playing', () => {
      currentRadioState.playing = true;
      currentRadioState.loading = false;
      currentRadioState.error = null;
      notifyState();
    });

    audioElement.addEventListener('pause', () => {
      currentRadioState.playing = false;
      currentRadioState.loading = false;
      notifyState();
    });

    audioElement.addEventListener('waiting', () => {
      currentRadioState.loading = true;
      notifyState();
    });

    audioElement.addEventListener('error', () => {
      currentRadioState.playing = false;
      currentRadioState.loading = false;
      currentRadioState.error = 'Chyba při načítání streamu stanice.';
      notifyState();
    });
  }
  return audioElement!;
}

export async function playRadio(stationId?: string): Promise<void> {
  const targetId = stationId || currentRadioState.stationId;
  const station = RADIO_STATIONS.find((s) => s.id === targetId) || RADIO_STATIONS[0];

  const audio = getAudioElement();
  currentRadioState.stationId = station.id;
  currentRadioState.loading = true;
  currentRadioState.error = null;
  saveState({ stationId: station.id, volume: currentRadioState.volume });
  notifyState();

  try {
    if (audio.src !== station.streamUrl) {
      audio.src = station.streamUrl;
      audio.load();
    }
    audio.volume = currentRadioState.volume;
    await audio.play();
    setupMediaSession(station);
  } catch (err: any) {
    currentRadioState.playing = false;
    currentRadioState.loading = false;
    currentRadioState.error = 'Přehrávání vyžaduje interakci uživatele nebo stabilní připojení.';
    notifyState();
  }
}

export function pauseRadio(): void {
  if (audioElement) {
    audioElement.pause();
  }
  currentRadioState.playing = false;
  currentRadioState.loading = false;
  notifyState();
}

export function toggleRadio(): void {
  if (currentRadioState.playing) {
    pauseRadio();
  } else {
    void playRadio();
  }
}

export function setRadioStation(stationId: string): void {
  const isPlaying = currentRadioState.playing;
  currentRadioState.stationId = stationId;
  saveState({ stationId, volume: currentRadioState.volume });
  if (isPlaying) {
    void playRadio(stationId);
  } else {
    notifyState();
  }
}

export function nextStation(): void {
  const idx = RADIO_STATIONS.findIndex((s) => s.id === currentRadioState.stationId);
  const nextIdx = (idx + 1) % RADIO_STATIONS.length;
  setRadioStation(RADIO_STATIONS[nextIdx].id);
}

export function prevStation(): void {
  const idx = RADIO_STATIONS.findIndex((s) => s.id === currentRadioState.stationId);
  const prevIdx = (idx - 1 + RADIO_STATIONS.length) % RADIO_STATIONS.length;
  setRadioStation(RADIO_STATIONS[prevIdx].id);
}

export function setRadioVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  currentRadioState.volume = clamped;
  if (audioElement) {
    audioElement.volume = clamped;
  }
  saveState({ stationId: currentRadioState.stationId, volume: clamped });
  notifyState();
}
