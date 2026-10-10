// 🧾 Zadání uzávěrky z pokladny: fotka → přečtené řádky ke kontrole → zápis.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: „ať to appka dokáže přečíst z fotky, ať to odečítá tyhle
// data ze skladu, volba zadat uzávěrku denní, týdenní, měsíční."
//
// Nahoře je ukotvená fotka, pod ní řádky ke kontrole (stejně jako u objednávek
// a výdeje ze skladu). Řádky se kontrolují proti sobě: množství × cena = částka
// a součet částek = „Celkem" z účtenky. Uzávěrka se nezapíše, dokud nesedí —
// špatně přečtené číslo by tiše rozhodilo sklad.
//
// Zboží se pozná podle KÓDU z pokladny. Poprvé se kód přiřadí k pivu a obalu
// (návrh z názvu se musí potvrdit), příště už se nehádá.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { Modal } from '../ui';
import { PhotoReviewPane } from '../PhotoReviewPane';
import { authenticatedFunctionHeaders } from '../../lib/functionAuth';
import { typObrazku, zmensenyDataUrl } from '../../lib/obrazek';
import { businessDateISO } from '../../lib/businessDate';
import { chyba as toastChyba, uspech } from '../../lib/toast';
import { NAZVY_TYPU, type TypUzaverky } from '../../lib/obchodSklad';
import {
  datumZVytisteno, navrhZbozi, obdobiUzaverky, pripravZapis, type PrirazeniRadku,
} from '../../lib/obchodUzaverka';
import { zapisUzaverku, type DataObchodu } from '../../lib/obchodData';
import {
  cislo as cisloZTextu, normalizujUzaverku, souctRadku, zkontrolujUzaverku,
  type PrectenaUzaverka, type ProblemUzaverky,
} from '../../../supabase/functions/_shared/uzaverka';

type Volba = { beerId: string; pkgId: string; ostatni: boolean; potvrzeno: boolean };

type Radek = {
  id: number;
  kod: string;
  nazev: string;
  ks: string;
  cena: string;
  celkem: string;
  /** Zboží už v obchodě je — přiřazení se nemění tady. */
  zname: boolean;
  volba: Volba;
  smazano: boolean;
};

const TYPY: TypUzaverky[] = ['denni', 'tydenni', 'mesicni'];

const text = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(n));
const kc = (n: number) => `${Math.round(n * 100) / 100} Kč`.replace('.', ',');

function prirazeniZVolby(r: Radek): PrirazeniRadku {
  if (r.zname) return { druh: 'zname' };
  if (r.volba.ostatni) return { druh: 'ostatni' };
  if (r.volba.beerId && r.volba.pkgId && r.volba.potvrzeno) return { druh: 'pivo', beerId: r.volba.beerId, pkgId: r.volba.pkgId };
  return { druh: 'nevyreseno' };
}

export function UzaverkaImport({ data, zapsal, vychoziTyp, onClose, onUlozeno }: {
  data: DataObchodu;
  zapsal: string | null;
  vychoziTyp: TypUzaverky | null;
  onClose: () => void;
  onUlozeno: () => void;
}) {
  const dnes = businessDateISO();
  const [typ, setTyp] = useState<TypUzaverky | null>(vychoziTyp);
  const [fotka, setFotka] = useState<{ dataUrl: string; name: string } | null>(null);
  const [cte, setCte] = useState(false);
  const [chybaCteni, setChybaCteni] = useState<string | null>(null);
  const [radky, setRadky] = useState<Radek[] | null>(null);
  const [cisloUz, setCisloUz] = useState('');
  const [stredisko, setStredisko] = useState('');
  const [vytisteno, setVytisteno] = useState<string | null>(null);
  const [celkem, setCelkem] = useState('');
  const [od, setOd] = useState(dnes);
  const [doDne, setDoDne] = useState(dnes);
  const [obdobiRucne, setObdobiRucne] = useState(false);
  const [poznamka, setPoznamka] = useState('');
  const [potvrzeno, setPotvrzeno] = useState(false);
  const [uklada, setUklada] = useState(false);
  const [chyby, setChyby] = useState<string[]>([]);
  const dalsiId = useRef(1);
  const souborRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);

  function nastavObdobi(t: TypUzaverky | null, datum: string) {
    if (!t) return;
    const o = obdobiUzaverky(t, datum);
    setOd(o.od);
    setDoDne(o.do);
  }

  function vyberTyp(t: TypUzaverky) {
    setTyp(t);
    // Období se přepočítá podle typu, dokud ho někdo neupravil ručně.
    if (!obdobiRucne) nastavObdobi(t, datumZVytisteno(vytisteno) ?? dnes);
  }

  function radkyZUctenky(u: PrectenaUzaverka): Radek[] {
    const znama = new Map(data.zbozi.map((z) => [z.kod, z]));
    return u.radky.map((r) => {
      const id = dalsiId.current++;
      const zname = znama.has(r.kod);
      const n = navrhZbozi(r.nazev, data.piva, data.obaly);
      return {
        id, kod: r.kod, nazev: r.nazev, ks: text(r.mnozstvi), cena: text(r.cena), celkem: text(r.celkem), zname, smazano: false,
        volba: zname
          ? { beerId: '', pkgId: '', ostatni: false, potvrzeno: true }
          // Pivo se navrhne (a musí se potvrdit), ostatní zboží se rovnou bere jako ostatní.
          : { beerId: n.beer?.id ?? '', pkgId: n.pkg?.id ?? '', ostatni: !n.jePivo, potvrzeno: false },
      };
    });
  }

  async function nactiFotky(soubory: File[]) {
    if (!soubory.length) return;
    setChybaCteni(null);
    let dataUrl: string;
    try {
      dataUrl = await zmensenyDataUrl(soubory[0]);
    } catch (e) {
      setChybaCteni('Fotku se nepodařilo načíst: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setFotka({ dataUrl, name: soubory[0].name });
    await precti(dataUrl);
  }

  async function precti(dataUrl: string) {
    setCte(true);
    setChybaCteni(null);
    setRadky(null);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-uzaverka-image`, {
        method: 'POST',
        headers: await authenticatedFunctionHeaders(),
        body: JSON.stringify({ imageBase64: dataUrl.split(',')[1] ?? '', imageMimeType: typObrazku(dataUrl) }),
      });
      const odpoved = await resp.text();
      if (!resp.ok) {
        let m = `HTTP ${resp.status}`;
        try { m += ': ' + (JSON.parse(odpoved)?.error ?? odpoved); } catch { m += ': ' + odpoved; }
        throw new Error(m);
      }
      let json: unknown;
      try { json = JSON.parse(odpoved); } catch { throw new Error('Neplatná odpověď: ' + odpoved.slice(0, 200)); }
      if ((json as { error?: string })?.error) throw new Error((json as { error: string }).error);
      const u = normalizujUzaverku(json);
      if (u.radky.length === 0) throw new Error('Na fotce se nepodařilo přečíst žádné řádky.');
      setRadky(radkyZUctenky(u));
      setCisloUz(u.cislo ?? '');
      setStredisko(u.stredisko ?? '');
      setVytisteno(u.vytisteno);
      setCelkem(text(u.celkem));
      setPotvrzeno(false);
      if (!obdobiRucne) nastavObdobi(typ, datumZVytisteno(u.vytisteno) ?? dnes);
    } catch (e) {
      setChybaCteni('Čtení z fotky selhalo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCte(false);
    }
  }

  function zacniRucne() {
    setChybaCteni(null);
    setRadky([]);
    pridejRadek();
  }

  function pridejRadek() {
    setRadky((rs) => [...(rs ?? []), {
      id: dalsiId.current++, kod: '', nazev: '', ks: '', cena: '', celkem: '', zname: false, smazano: false,
      volba: { beerId: '', pkgId: '', ostatni: false, potvrzeno: false },
    }]);
  }

  const uprav = (id: number, patch: Partial<Radek>) =>
    setRadky((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const upravVolbu = (id: number, patch: Partial<Volba>) =>
    setRadky((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, volba: { ...r.volba, ...patch } } : r)));

  /** Změna kódu: zboží, které v obchodě už je, se pozná hned. */
  function zmenKod(id: number, kod: string) {
    const z = data.zbozi.find((x) => x.kod === kod.trim());
    uprav(id, { kod: kod.trim(), zname: !!z });
  }

  const platne = (radky ?? []).filter((r) => !r.smazano);

  const uctenka: PrectenaUzaverka = useMemo(() => ({
    cislo: cisloUz.trim() || null,
    stredisko: stredisko.trim() || null,
    vytisteno,
    celkem: cisloZTextu(celkem),
    radky: platne.map((r) => ({
      kod: r.kod.trim(),
      nazev: r.nazev.trim(),
      mnozstvi: r.ks.trim() === '' ? Number.NaN : (cisloZTextu(r.ks) ?? Number.NaN),
      cena: r.cena.trim() === '' ? null : cisloZTextu(r.cena),
      celkem: r.celkem.trim() === '' ? null : cisloZTextu(r.celkem),
    })),
  }), [cisloUz, stredisko, vytisteno, celkem, platne]);

  const kontrola = useMemo(() => zkontrolujUzaverku(uctenka), [uctenka]);
  const problemyRadku = (i: number): ProblemUzaverky[] => kontrola.problemy.filter((p) => p.radek === i);
  const problemyCelku = kontrola.problemy.filter((p) => p.radek === null);
  const nepotvrzeno = platne.filter((r) => !r.zname && !r.volba.ostatni && !r.volba.potvrzeno && r.volba.beerId && r.volba.pkgId);

  function potvrdVse() {
    setRadky((rs) => (rs ?? []).map((r) => (!r.zname && !r.volba.ostatni && r.volba.beerId && r.volba.pkgId ? { ...r, volba: { ...r.volba, potvrzeno: true } } : r)));
  }

  async function uloz() {
    setChyby([]);
    const zapis = pripravZapis({
      typ, od, do: doDne,
      cislo: uctenka.cislo, stredisko: uctenka.stredisko, vytisteno, celkem: uctenka.celkem,
      radky: uctenka.radky.map((r, i) => ({ ...r, prirazeni: prirazeniZVolby(platne[i]) })),
      znameZbozi: data.zbozi,
      existujiciUzaverky: data.uzaverky,
    });
    if (zapis.chyby.length > 0) { setChyby(zapis.chyby); return; }
    if (!typ) return;
    setUklada(true);
    try {
      const e = await zapisUzaverku({
        typ, od, do: doDne, cislo: uctenka.cislo, stredisko: uctenka.stredisko, vytisteno,
        trzba: uctenka.celkem, poznamka: poznamka.trim() || null, zapsal,
        radky: uctenka.radky.map((r) => ({ kod: r.kod, nazev: r.nazev, mnozstvi: r.mnozstvi, cena: r.cena, celkem: r.celkem })),
        noveZbozi: zapis.noveZbozi,
      });
      if (e) { setChyby([e]); return; }
      uspech(`Uzávěrka uložena — ${uctenka.radky.length} položek odečteno ze skladu obchodu.`);
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  const soucet = souctRadku(uctenka.radky);
  const lzeUlozit = !!typ && platne.length > 0 && kontrola.problemy.length === 0 && nepotvrzeno.length === 0 && potvrzeno && !uklada;

  return (
    <Modal open onClose={onClose} title="Zadat uzávěrku z pokladny" wide maxWidth="max-w-5xl">
      <div className="space-y-4">
        <div>
          <div className="text-xs font-black text-neutral-700 mb-1">Jaká uzávěrka to je</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPY.map((t) => (
              <button
                key={t}
                type="button"
                className={`btn-zalozka px-4 ${typ === t ? 'btn-zalozka-aktivni' : ''}`}
                aria-pressed={typ === t}
                onClick={() => vyberTyp(t)}
              >
                {NAZVY_TYPU[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input ref={souborRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void nactiFotky(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <input ref={kameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void nactiFotky(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <button type="button" className="btn-primary !rounded flex items-center gap-2" disabled={cte} onClick={() => kameraRef.current?.click()}>
            <Camera size={16} /> Vyfotit uzávěrku
          </button>
          <button type="button" className="btn-ghost !rounded flex items-center gap-2" disabled={cte} onClick={() => souborRef.current?.click()}>
            <Upload size={16} /> Fotka z galerie
          </button>
          {radky === null && (
            <button type="button" className="btn-ghost !rounded text-xs" disabled={cte} onClick={zacniRucne}>Zadat ručně bez fotky</button>
          )}
        </div>

        {cte && <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 text-sm font-bold text-primary-900">Čtu fotku…</div>}
        {chybaCteni && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded text-xs font-bold text-rose-800 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{chybaCteni}</span>
          </div>
        )}

        {fotka && (
          <div className="sticky top-0 z-20 -mx-6 bg-white border-b-2 border-primary-200 shadow-md">
            <div className="h-[38vh] sm:h-[42vh]">
              <PhotoReviewPane photos={[fotka]} activeIndex={0} onChangeIndex={() => {}} />
            </div>
          </div>
        )}
        {fotka && radky === null && !cte && (
          <button type="button" className="btn-ghost !rounded text-xs flex items-center gap-1" onClick={() => void precti(fotka.dataUrl)}>
            <RotateCcw size={14} /> Zkusit přečíst znovu
          </button>
        )}

        {radky !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="label" htmlFor="uz-cislo">Číslo uzávěrky</label>
                <input id="uz-cislo" className="input font-bold" value={cisloUz} onChange={(e) => setCisloUz(e.target.value)} placeholder="2/2873" />
              </div>
              <div>
                <label className="label" htmlFor="uz-stredisko">Středisko</label>
                <input id="uz-stredisko" className="input font-bold" value={stredisko} onChange={(e) => setStredisko(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="uz-od">Období od</label>
                <input id="uz-od" type="date" className="input font-bold" value={od} onChange={(e) => { setOd(e.target.value); setObdobiRucne(true); }} />
              </div>
              <div>
                <label className="label" htmlFor="uz-do">Období do</label>
                <input id="uz-do" type="date" className="input font-bold" value={doDne} onChange={(e) => { setDoDne(e.target.value); setObdobiRucne(true); }} />
              </div>
            </div>
            <div className="text-xs font-semibold text-neutral-600">
              Odečet ze skladu platí ke dni <strong>{doDne}</strong> (konec období).
              {vytisteno ? <> Vytištěno {vytisteno.replace('T', ' ')}.</> : null}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary-600" /> Přečtené řádky ke kontrole ({platne.length})
              </h3>
              <div className="flex gap-1.5">
                {nepotvrzeno.length > 0 && (
                  <button type="button" className="btn-emerald !rounded !py-1.5 text-xs" onClick={potvrdVse}>
                    <Check size={14} className="inline mr-1" /> Potvrdit navržené zboží ({nepotvrzeno.length})
                  </button>
                )}
                <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={pridejRadek}>
                  <Plus size={14} className="inline mr-1" /> Řádek
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {radky.map((r) => {
                if (r.smazano) {
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 p-2 rounded border border-neutral-200 bg-neutral-100 text-xs text-neutral-600">
                      <span className="line-through truncate">{r.kod} {r.nazev}</span>
                      <button type="button" className="font-bold text-primary-700 flex items-center gap-1" onClick={() => uprav(r.id, { smazano: false })}><RotateCcw size={12} /> Obnovit</button>
                    </li>
                  );
                }
                const i = platne.indexOf(r);
                const problemy = problemyRadku(i);
                const navrzeno = !r.zname && !r.volba.ostatni && !r.volba.potvrzeno && r.volba.beerId && r.volba.pkgId;
                const zbozi = r.zname ? data.zbozi.find((z) => z.kod === r.kod) : undefined;
                const popisZnameho = zbozi?.beer_id
                  ? `${data.piva.find((p) => p.id === zbozi.beer_id)?.name ?? 'pivo'} · ${data.obaly.find((o) => o.id === zbozi.package_id)?.label ?? 'obal'}`
                  : 'ostatní zboží';
                return (
                  <li
                    key={r.id}
                    className={`p-2.5 rounded-xl border-2 space-y-2 ${problemy.length ? 'border-rose-400 bg-rose-50' : navrzeno ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 grid grid-cols-[6rem_1fr] gap-2">
                        <input aria-label="Kód zboží" className="input !py-1.5 text-sm font-black" value={r.kod} onChange={(e) => zmenKod(r.id, e.target.value)} placeholder="kód" inputMode="numeric" />
                        <input aria-label="Název zboží" className="input !py-1.5 text-sm font-bold" value={r.nazev} onChange={(e) => uprav(r.id, { nazev: e.target.value })} placeholder="název" />
                      </div>
                      <button type="button" className="btn-danger btn-ikona" aria-label={`Odstranit řádek ${r.kod}`} onClick={() => uprav(r.id, { smazano: true })}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([['ks', 'Ks', r.ks], ['cena', 'Cena', r.cena], ['celkem', 'Částka', r.celkem]] as const).map(([pole, popis, hodnota]) => (
                        <label key={pole} className="text-[11px] font-black uppercase text-neutral-500">
                          {popis}
                          <input
                            className="input !py-1.5 text-sm font-black text-center mt-0.5"
                            inputMode="decimal"
                            value={hodnota}
                            onChange={(e) => uprav(r.id, { [pole]: e.target.value } as Partial<Radek>)}
                          />
                        </label>
                      ))}
                    </div>

                    {problemy.map((p) => (
                      <div key={p.text} role="alert" className="text-xs font-bold text-rose-800 flex items-start gap-1.5 flex-wrap">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>{p.text}</span>
                        {p.navrzeneMnozstvi != null && (
                          <button type="button" className="underline" onClick={() => uprav(r.id, { ks: String(p.navrzeneMnozstvi) })}>
                            Podle částky je to {p.navrzeneMnozstvi} ks — opravit
                          </button>
                        )}
                      </div>
                    ))}

                    {r.zname ? (
                      <div className="text-xs font-semibold text-neutral-600">Zboží v obchodě: <strong>{popisZnameho}</strong></div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-black uppercase text-amber-900">
                          {navrzeno ? 'Nové zboží — navrženo z názvu, potvrď' : 'Nové zboží — co to je?'}
                        </div>
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                          <select
                            aria-label="Pivo"
                            className="input !py-1.5 text-xs font-bold"
                            disabled={r.volba.ostatni}
                            value={r.volba.beerId}
                            onChange={(e) => upravVolbu(r.id, { beerId: e.target.value, potvrzeno: !!e.target.value && !!r.volba.pkgId })}
                          >
                            <option value="">— pivo —</option>
                            {data.piva.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                          <select
                            aria-label="Obal"
                            className="input !py-1.5 text-xs font-bold"
                            disabled={r.volba.ostatni}
                            value={r.volba.pkgId}
                            onChange={(e) => upravVolbu(r.id, { pkgId: e.target.value, potvrzeno: !!e.target.value && !!r.volba.beerId })}
                          >
                            <option value="">— obal —</option>
                            {data.obaly.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <label className="flex items-center gap-1 text-xs font-bold text-neutral-700 whitespace-nowrap">
                            <input type="checkbox" checked={r.volba.ostatni} onChange={(e) => upravVolbu(r.id, { ostatni: e.target.checked, potvrzeno: true })} />
                            ostatní
                          </label>
                        </div>
                        {navrzeno && (
                          <button type="button" className="btn-emerald !rounded !py-1 text-xs" onClick={() => upravVolbu(r.id, { potvrzeno: true })}>
                            <Check size={13} className="inline mr-1" /> Potvrdit
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="rounded-xl border-2 border-neutral-300 bg-neutral-50 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="text-xs font-bold text-neutral-700">Součet řádků<div className="text-base font-black text-neutral-950">{kc(soucet)}</div></div>
                <label className="text-xs font-bold text-neutral-700">
                  Celkem z účtenky
                  <input aria-label="Celkem z účtenky" className="input font-black text-base mt-0.5" inputMode="decimal" value={celkem} onChange={(e) => setCelkem(e.target.value)} />
                </label>
              </div>
              {problemyCelku.map((p) => (
                <div key={p.text} role="alert" className="text-xs font-bold text-rose-800 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {p.text}
                </div>
              ))}
              {kontrola.problemy.length === 0 && platne.length > 0 && (
                <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><Check size={14} /> Čísla na účtence sedí: množství × cena = částka i součet = Celkem.</div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="uz-pozn">Poznámka</label>
              <input id="uz-pozn" className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} placeholder="nepovinná" />
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-neutral-800 cursor-pointer select-none">
              <input type="checkbox" className="w-5 h-5" checked={potvrzeno} onChange={(e) => setPotvrzeno(e.target.checked)} />
              Zkontroloval jsem řádky podle fotky a souhlasí
            </label>

            {chyby.length > 0 && (
              <ul role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border-2 border-rose-300 rounded-lg px-4 py-2 space-y-0.5 list-disc">
                {chyby.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-neutral-100">
              <button type="button" className="btn-ghost !rounded min-h-[48px]" onClick={onClose}>Zrušit</button>
              <button type="button" className="btn-primary !rounded min-h-[48px] flex-1 sm:flex-none" disabled={!lzeUlozit} onClick={uloz}>
                {uklada ? 'Ukládám…' : 'Uložit uzávěrku a odečíst ze skladu'}
              </button>
            </div>
            {!lzeUlozit && !uklada && (
              <div className="text-[11px] font-semibold text-neutral-600">
                {!typ ? 'Vyber typ uzávěrky. ' : ''}
                {kontrola.problemy.length > 0 ? `Oprav ${kontrola.problemy.length} problémů výše. ` : ''}
                {nepotvrzeno.length > 0 ? 'Potvrď navržené zboží. ' : ''}
                {!potvrzeno ? 'Zaškrtni kontrolu podle fotky.' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
