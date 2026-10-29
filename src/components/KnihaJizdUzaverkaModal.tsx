// 🔒 Kniha jízd — průvodce uzávěrkou měsíce.
// ---------------------------------------------------------------------------
// Trasy z objednávek dávají odhad kilometrů, skutečný je stav palubní desky.
// Jednou za měsíc se zadá, co tachometr ukazuje, rozdíl proti součtu tras se
// rozpočítá mezi jízdy (rovnoměrně nebo úměrně délce) a měsíc se zamkne.
// Výpočet je v lib/knihaJizdUzaverka.ts, předvyplnění v lib/knihaJizdRetez.ts;
// databáze čísla ještě jednou přepočítá, než měsíc zamkne.
import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Field, Modal } from './ui';
import { mnozne } from '../lib/cisla';
import type { UzavrenyMesic, VstupUzavreni } from '../lib/knihaJizdDb';
import { jizdyAutaVMesici, type ZaznamJizdy } from '../lib/knihaJizdFormular';
import { predvyplnUzaverku } from '../lib/knihaJizdRetez';
import { type RezimDorovnani, jeTankovani, sestavUzaverku } from '../lib/knihaJizdUzaverka';

const KM_FORMAT = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const km = (x: number) => KM_FORMAT.format(x);
const znamenko = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '');
const rozdilKm = (x: number) => `${znamenko(x)}${km(Math.abs(x))}`;
const cislo = (t: string): number => (t.trim() === '' ? NaN : Number(t.trim().replace(',', '.')));

const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export function popisMesice(mesic: string): string {
  const [r, m] = mesic.split('-').map(Number);
  return `${MESICE[(m || 1) - 1] ?? mesic} ${r}`;
}

const REZIMY: { id: RezimDorovnani; nazev: string; popis: string }[] = [
  { id: 'rovnomerne', nazev: 'Rovnoměrně', popis: 'Každá jízda dostane stejný díl rozdílu (doporučeno).' },
  { id: 'umerne', nazev: 'Úměrně délce', popis: 'Delší jízda dostane větší díl než krátká.' },
];

export type UzaverkaModalProps = {
  vozidlo: string;
  /** RRRR-MM */
  mesic: string;
  /** Všechny jízdy (z okolních měsíců se bere návaznost tachometru). */
  jizdy: ZaznamJizdy[];
  uzavrene: UzavrenyMesic[];
  /** Dnešní datum — měsíc, který ještě neskončil, se uzavírá s varováním. */
  dnes: string;
  onClose: () => void;
  /** Uzavře měsíc. Vrátí text chyby, nebo `null`, když se povedlo (okno pak zavře rodič). */
  onUzavrit: (v: VstupUzavreni) => Promise<string | null>;
};

export default function KnihaJizdUzaverkaModal({ vozidlo, mesic, jizdy, uzavrene, dnes, onClose, onUzavrit }: UzaverkaModalProps) {
  const jizdyMesice = useMemo(() => jizdyAutaVMesici(jizdy, vozidlo, mesic), [jizdy, vozidlo, mesic]);
  const pred = useMemo(() => predvyplnUzaverku(jizdy, uzavrene, vozidlo, mesic), [jizdy, uzavrene, vozidlo, mesic]);

  const [zacatekText, setZacatekText] = useState('');
  const [zacatekRucne, setZacatekRucne] = useState(false);
  const [konecText, setKonecText] = useState('');
  const [rezim, setRezim] = useState<RezimDorovnani>('rovnomerne');
  const [uklada, setUklada] = useState(false);
  const [chybaText, setChybaText] = useState<string | null>(null);

  const zacatekPole = zacatekRucne || pred.zacatek == null ? zacatekText : String(pred.zacatek);
  const zacatek = cislo(zacatekPole);
  const konec = cislo(konecText);

  const vysledek = useMemo(() => {
    if (!Number.isFinite(zacatek) || !Number.isFinite(konec)) return null;
    return sestavUzaverku({
      jizdy: jizdyMesice,
      tachometrZacatek: zacatek,
      tachometrKonec: konec,
      rezim,
      tachometrMinulyMesic: pred.minulyMesic,
      tachometrNaslednyMesic: pred.nasledny,
    });
  }, [jizdyMesice, zacatek, konec, rezim, pred.minulyMesic, pred.nasledny]);

  const pocetJizd = jizdyMesice.filter((j) => !jeTankovani(j)).length;
  const pocetTankovani = jizdyMesice.length - pocetJizd;
  const podleId = useMemo(() => new Map(jizdyMesice.map((j) => [j.id, j])), [jizdyMesice]);
  const mesicNeskoncil = dnes.slice(0, 7) <= mesic;

  const zdrojPopis =
    pred.zdrojZacatku === 'uzavreny-mesic'
      ? 'Navazuje na uzavřený minulý měsíc.'
      : pred.zdrojZacatku === 'jizda-pred-mesicem'
        ? 'Konec poslední jízdy před tímto měsícem — zkontroluj to podle palubní desky.'
        : pred.zdrojZacatku === 'prvni-jizda'
          ? 'Začátek první jízdy měsíce — zkontroluj to podle palubní desky.'
          : 'Zadej stav palubní desky na začátku měsíce.';

  async function uzavrit(e: FormEvent) {
    e.preventDefault();
    if (uklada) return;
    if (!vysledek) {
      setChybaText('Vyplň stav tachometru na začátku i na konci měsíce.');
      return;
    }
    if (!vysledek.ok) {
      // Důvod je vidět pod formulářem hned, jak jsou čísla vyplněná.
      setChybaText(null);
      return;
    }
    setChybaText(null);
    setUklada(true);
    const chyba = await onUzavrit({
      vozidlo,
      mesic,
      tachometrZacatek: zacatek,
      tachometrKonec: konec,
      rezim,
      radky: vysledek.radky,
    });
    if (chyba) {
      setUklada(false);
      setChybaText(chyba);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Uzávěrka — ${popisMesice(mesic)}`} wide>
      <form onSubmit={uzavrit} className="space-y-4" noValidate>
        <div className="text-sm text-neutral-700">
          <div className="font-black text-neutral-900">{vozidlo}</div>
          <div>
            {mnozne(pocetJizd, ['jízda', 'jízdy', 'jízd'])}
            {pocetTankovani > 0 ? `, ${mnozne(pocetTankovani, ['tankování', 'tankování', 'tankování'])}` : ''}
            {' · '}podle tras {km(jizdyMesice.reduce((s, j) => s + (jeTankovani(j) ? 0 : Number(j.km_trasa ?? j.km_driven) || 0), 0))} km
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tachometr na začátku měsíce (km)" hint={zdrojPopis}>
            <input
              type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min={0}
              className="input font-mono font-bold" value={zacatekPole}
              onChange={(e) => { setZacatekText(e.target.value); setZacatekRucne(true); }}
            />
          </Field>
          <Field
            label="Tachometr na konci měsíce (km)"
            hint={pred.podleTras != null ? `Podle tras by měl ukazovat kolem ${km(pred.podleTras)} km.` : 'Stav palubní desky.'}
          >
            <input
              type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min={0}
              className="input font-mono font-bold" value={konecText} onChange={(e) => setKonecText(e.target.value)}
              placeholder={pred.podleTras != null ? String(Math.round(pred.podleTras)) : undefined}
              autoFocus
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">Jak rozpočítat rozdíl mezi jízdy</legend>
          {REZIMY.map((r) => (
            <label
              key={r.id}
              className={`flex items-start gap-3 rounded border px-3 py-2.5 cursor-pointer tap ${rezim === r.id ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 bg-white'}`}
            >
              <input type="radio" name="rezim-dorovnani" className="mt-1 accent-amber-500" checked={rezim === r.id} onChange={() => setRezim(r.id)} />
              <span>
                <span className="block text-sm font-black text-neutral-900">{r.nazev}</span>
                <span className="block text-xs text-neutral-600">{r.popis}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {vysledek?.ok && (
          <div className="space-y-3">
            <div className="pruh-cisel">
              <div>
                <div className="nazev">Podle tras</div>
                <div className="cislo">{km(vysledek.soucetTrasy)}</div>
              </div>
              <div>
                <div className="nazev">Tachometr</div>
                <div className="cislo">{km(konec - zacatek)}</div>
              </div>
              <div>
                <div className="nazev">Rozdíl</div>
                <div className={`cislo ${vysledek.rozdil === 0 ? '' : 'text-amber-700'}`}>{vysledek.rozdil === 0 ? '0' : rozdilKm(vysledek.rozdil)}</div>
              </div>
            </div>

            <p className="text-xs text-neutral-700">
              {vysledek.rozdil === 0
                ? 'Tachometr sedí s trasami, nic se nedorovnává.'
                : `Rozdíl ${rozdilKm(vysledek.rozdil)} km se rozpočítá ${rezim === 'rovnomerne' ? 'rovnoměrně' : 'úměrně délce'} mezi ${mnozne(vysledek.pocetJizd, ['jízdu', 'jízdy', 'jízd'])}.`}
            </p>

            {vysledek.upozorneni.map((u) => (
              <div key={u} className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded px-3 py-2 font-semibold">
                <AlertTriangle className="ikona-text" /> {u}
              </div>
            ))}

            {/* Úzké buňky a datum bez roku (měsíc je v nadpisu): na telefonu se musí vejít i poslední
                sloupec „Ujeto“ — právě ten je výsledek, a vodorovné posouvání uvnitř okna je nenápadné. */}
            <div className="max-h-56 overflow-y-auto scrollbar-thin border border-neutral-200 rounded">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" className="!px-2">Datum</th>
                    <th scope="col" className="!px-2 text-right">Trasa</th>
                    <th scope="col" className="!px-2 text-right">Dorovnání</th>
                    <th scope="col" className="!px-2 text-right">Ujeto</th>
                  </tr>
                </thead>
                <tbody>
                  {vysledek.radky.map((r) => {
                    const j = podleId.get(r.id);
                    if (!j || jeTankovani(j)) return null;
                    return (
                      <tr key={r.id}>
                        <td className="!px-2 text-xs font-bold whitespace-nowrap">{new Date(j.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</td>
                        <td className="!px-2 text-right font-mono text-xs">{km(r.km_trasa)}</td>
                        <td className="!px-2 text-right font-mono text-xs">{r.km_dorovnani === 0 ? '—' : rozdilKm(r.km_dorovnani)}</td>
                        <td className="!px-2 text-right font-mono text-xs font-black">{km(r.km_driven)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {vysledek && !vysledek.ok && (
          <div role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2 font-bold">
            <AlertTriangle className="ikona-text" /> {vysledek.chyba}
          </div>
        )}

        {mesicNeskoncil && (
          <div className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded px-3 py-2 font-semibold">
            <AlertTriangle className="ikona-text" /> Měsíc ještě neskončil. Po uzavření do něj nepůjde zapsat další jízda, dokud ho vedení neotevře.
          </div>
        )}

        <p className="text-xs text-neutral-600">
          <Lock className="ikona-text" /> Uzavřené jízdy nejde upravit ani smazat. Měsíc může znovu otevřít jen admin, šéf, sládek nebo manažer.
        </p>

        {chybaText && (
          <div role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2 font-bold">
            <AlertTriangle className="ikona-text" /> {chybaText}
          </div>
        )}

        <div className="lista-akci pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button type="submit" className="btn-emerald" disabled={uklada}>
            {uklada ? 'Uzavírám…' : 'Uzavřít měsíc'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
