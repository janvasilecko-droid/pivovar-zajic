// 📝 Pole popisu dokumentu knihovny (název, autor, rok, vydání, jazyk, druh,
// tematické oblasti A–T, zdroj, licence) — sdílí je nahrání i úprava.
import { BIBLE_OBLASTI, nazevOblasti } from '../../lib/bibleOblasti';
import { DRUH_POPIS, JAZYK_POPIS, type DruhDokumentu, type JazykDokumentu } from '../../lib/bibleKnihovna';
import type { Popis } from '../../lib/bibleKnihovnaApi';

/** Popisek pole na tmavé ploše bible (.label má tmavé písmo pro světlý podklad). */
export const POPISEK = 'block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5';

export function PoleOblasti({ vybrane, zmen }: { vybrane: string[]; zmen: (kody: string[]) => void }) {
  const prepni = (kod: string) => zmen(vybrane.includes(kod) ? vybrane.filter((k) => k !== kod) : [...vybrane, kod].sort());
  return (
    <details className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100">
      <summary className="cursor-pointer select-none px-3 py-3 min-h-[44px] text-sm font-bold">
        Tematické oblasti A–T{vybrane.length > 0 ? `: ${vybrane.map((k) => `${k} ${nazevOblasti(k)}`).join(', ')}` : ' (nevybráno)'}
      </summary>
      <div className="flex flex-wrap gap-2 p-3 pt-0">
        {BIBLE_OBLASTI.map((o) => (
          <button
            key={o.kod}
            type="button"
            aria-pressed={vybrane.includes(o.kod)}
            onClick={() => prepni(o.kod)}
            className={vybrane.includes(o.kod) ? 'btn-zalozka btn-zalozka-aktivni' : 'btn-zalozka'}
          >
            <span className="font-black">{o.kod}</span> {o.nazev}
          </button>
        ))}
      </div>
    </details>
  );
}

export function PoleDruhJazyk({ druh, jazyk, zmenDruh, zmenJazyk }: {
  druh: DruhDokumentu;
  jazyk: JazykDokumentu | null;
  zmenDruh: (d: DruhDokumentu) => void;
  zmenJazyk: (j: JazykDokumentu | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className={POPISEK}>Druh</span>
        <select className="input" value={druh} onChange={(e) => zmenDruh(e.target.value as DruhDokumentu)}>
          {(Object.keys(DRUH_POPIS) as DruhDokumentu[]).map((d) => <option key={d} value={d}>{DRUH_POPIS[d]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={POPISEK}>Jazyk</span>
        <select className="input" value={jazyk ?? ''} onChange={(e) => zmenJazyk((e.target.value || null) as JazykDokumentu | null)}>
          <option value="">Zjistí se při zpracování</option>
          {(Object.keys(JAZYK_POPIS) as JazykDokumentu[]).map((j) => <option key={j} value={j}>{JAZYK_POPIS[j]}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Celý popis dokumentu — pro úpravu jednoho dokumentu v seznamu. */
export function PolePopisu({ popis, zmen }: { popis: Popis; zmen: (p: Popis) => void }) {
  const nastav = <K extends keyof Popis>(k: K, v: Popis[K]) => zmen({ ...popis, [k]: v });
  return (
    <div className="space-y-3">
      <label className="block">
        <span className={POPISEK}>Název</span>
        <input className="input" value={popis.nazev} onChange={(e) => nastav('nazev', e.target.value)} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={POPISEK}>Autor</span>
          <input className="input" value={popis.autor ?? ''} onChange={(e) => nastav('autor', e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={POPISEK}>Rok vydání</span>
            <input
              className="input"
              inputMode="numeric"
              value={popis.rok ?? ''}
              onChange={(e) => {
                const cislo = Number(e.target.value.replace(/\D/g, ''));
                nastav('rok', e.target.value.trim() && Number.isFinite(cislo) ? cislo : null);
              }}
            />
          </label>
          <label className="block">
            <span className={POPISEK}>Vydání</span>
            <input className="input" value={popis.vydani ?? ''} placeholder="např. 6. vydání" onChange={(e) => nastav('vydani', e.target.value)} />
          </label>
        </div>
      </div>
      <PoleDruhJazyk
        druh={popis.druh ?? 'kniha'}
        jazyk={popis.jazyk ?? null}
        zmenDruh={(d) => nastav('druh', d)}
        zmenJazyk={(j) => nastav('jazyk', j)}
      />
      <PoleOblasti vybrane={popis.oblasti ?? []} zmen={(k) => nastav('oblasti', k)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={POPISEK}>ISBN</span>
          <input className="input" value={popis.isbn ?? ''} onChange={(e) => nastav('isbn', e.target.value)} />
        </label>
        <label className="block">
          <span className={POPISEK}>Zdroj</span>
          <input className="input" value={popis.zdroj ?? ''} placeholder="koupená kniha, sken, web výrobce…" onChange={(e) => nastav('zdroj', e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className={POPISEK}>Práva k použití (licence)</span>
        <input className="input" value={popis.licence ?? ''} placeholder="např. vlastní výtisk, jen pro interní použití" onChange={(e) => nastav('licence', e.target.value)} />
      </label>
    </div>
  );
}
