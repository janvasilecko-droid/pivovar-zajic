// 🧺 Obchod → Přidat zboží: stejně jako ve Fasování.
// ---------------------------------------------------------------------------
// Z provozu 10. 10. 2026: „to zboží na sklad udělej stejně jako fasování —
// název piva rozkliknu, objeví se velikosti a ty přidávám, a barevně označený
// jako všude jinde". Piva jsou tedy dlaždice v barvě piva (BeerTileGrid) a po
// klepnutí se otevře panel s velikostmi (BeerTilePanel), ve kterém se velikosti
// přidávají. Ostatní zboží (půllitry, kosmetika, limo…) zůstává ve skupinách.
//
// Kód a cena zboží jsou z účtenky „Sumář prodeje" z pokladny (lib/obchodKatalog),
// tam, kde tahle velikost na účtence byla. Jinak se kód z pokladny doplní ručně
// — kód je klíč zboží a nehádá se.
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, GlassWater, Plus, ShoppingBasket, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from '../ui';
import { BeerTileGrid, BeerTilePanel } from '../BeerTileGrid';
import { formatPackageLabel } from '../../lib/supabase';
import { chyba as toastChyba, uspech } from '../../lib/toast';
import { pridejZboziZDlazdic, type DataObchodu } from '../../lib/obchodData';
import {
  SKUPINY, cenaZPolicka, chybaKoduRucne, dlazdiceSkupiny, jeVolitelna, obalyProdejny, velikostiPiva, zapisZVoleb,
  type Dlazdice, type SkupinaZbozi, type Velikost, type Volba,
} from '../../lib/obchodKatalog';

type SkupinaBezPiv = Exclude<SkupinaZbozi, 'piva'>;

const IKONY: Record<SkupinaBezPiv, LucideIcon> = {
  pullitry: GlassWater,
  kosmetika: Sparkles,
  ostatni: ShoppingBasket,
};
/** Barva okraje podle skupiny — ať se na první pohled liší (jako dlaždice na ploše). */
const OKRAJ: Record<SkupinaBezPiv, string> = {
  pullitry: '!border-sky-400',
  kosmetika: '!border-rose-300',
  ostatni: '!border-neutral-400',
};

const kc = (n: number) => `${n} Kč`;

function popisDlazdice(d: Dlazdice): { titulek: string; podtitulek: string; poznamka?: string } {
  const { polozka, stav } = d;
  const kod = `kód ${polozka.kod} · ${kc(polozka.cena)}`;
  switch (stav) {
    case 'v_obchode': return { titulek: polozka.nazev, podtitulek: kod, poznamka: '✓ už v obchodě' };
    case 'vypnute': return { titulek: polozka.nazev, podtitulek: kod, poznamka: 'vypnuté — zvolením se zase zapne' };
    case 'obsazeno': return { titulek: polozka.nazev, podtitulek: kod, poznamka: `Už je v obchodě jako: ${d.obsazenoKym}` };
    default: return { titulek: polozka.nazev, podtitulek: kod };
  }
}

/** Rozepsaný kód a cena u velikosti, která na účtence z pokladny nebyla. */
type Koncept = { kod: string; cena: string };

const klicVolbyVelikosti = (klic: string) => `v:${klic}`;
const klicVolbyDlazdice = (kod: string) => `k:${kod}`;

export function PridatZboziDlazdice({ data, zapsal, onClose, onUlozeno, onRucne }: {
  data: DataObchodu;
  zapsal: string | null;
  onClose: () => void;
  onUlozeno: () => void;
  /** Otevře ruční zadání zboží, které v nabídce není. */
  onRucne: () => void;
}) {
  const dlazdice = useMemo(() => dlazdiceSkupiny(data.zbozi, data.piva, data.obaly), [data.zbozi, data.piva, data.obaly]);
  const piva = useMemo(() => data.piva.filter((b) => b.is_active !== false), [data.piva]);
  const obalyKZobrazeni = useMemo(() => obalyProdejny(data.obaly), [data.obaly]);
  const velikosti = useMemo(
    () => new Map(piva.map((b) => [b.id, velikostiPiva(b, obalyKZobrazeni, data.zbozi, dlazdice.piva)])),
    [piva, obalyKZobrazeni, data.zbozi, dlazdice.piva],
  );

  const [skupina, setSkupina] = useState<SkupinaBezPiv | null>(null);
  const [otevrenePivoId, setOtevrenePivoId] = useState<string | null>(null);
  const [vybrano, setVybrano] = useState<Set<string>>(new Set());
  const [koncept, setKoncept] = useState<Record<string, Koncept>>({});
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);

  const dlazdiceBezPiv = useMemo(
    () => SKUPINY.filter((s): s is typeof s & { id: SkupinaBezPiv } => s.id !== 'piva').flatMap((s) => dlazdice[s.id]),
    [dlazdice],
  );

  function prepni(klic: string) {
    setVybrano((v) => {
      const n = new Set(v);
      if (n.has(klic)) n.delete(klic); else n.add(klic);
      return n;
    });
  }
  const zmenKoncept = (klic: string, zmena: Partial<Koncept>) =>
    setKoncept((k) => ({ ...k, [klic]: { ...(k[klic] ?? { kod: '', cena: '' }), ...zmena } }));

  // Co je zvolené: hotové volby a chyby u ručně zadaného zboží (kód, cena).
  const { volby, chyby } = useMemo(() => {
    const hotove: Volba[] = [];
    const ruzne: { klic: string; pivoId: string; v: Velikost }[] = [];
    for (const pivo of piva) {
      for (const v of velikosti.get(pivo.id) ?? []) {
        if (!vybrano.has(klicVolbyVelikosti(v.klic))) continue;
        if (v.stav === 'vypnute' && v.kod) hotove.push({ druh: 'zapnout', kod: v.kod });
        else if (v.stav === 'nove' && v.dlazdice) hotove.push({ druh: 'dlazdice', d: v.dlazdice });
        else if (v.stav === 'nove') ruzne.push({ klic: v.klic, pivoId: pivo.id, v });
      }
    }
    for (const d of dlazdiceBezPiv) {
      if (vybrano.has(klicVolbyDlazdice(d.polozka.kod)) && jeVolitelna(d)) hotove.push({ druh: 'dlazdice', d });
    }

    const kodyHotovych = hotove.map((h) => (h.druh === 'dlazdice' ? h.d.polozka.kod : h.druh === 'zapnout' ? h.kod : h.polozka.kod));
    const chybyRucne = new Map<string, string>();
    const vsechnyKody = [...kodyHotovych, ...ruzne.map((r) => (koncept[r.klic]?.kod ?? '').trim())];
    for (const r of ruzne) {
      const k = koncept[r.klic] ?? { kod: '', cena: '' };
      const kod = k.kod.trim();
      // Kód stejného řádku se ze „zbylých" vyřadí jednou — jinak by se označil jako duplicita sám sebe.
      const zbyle = [...vsechnyKody];
      zbyle.splice(zbyle.indexOf(kod), 1);
      const kodChyba = chybaKoduRucne(kod, data.zbozi, zbyle);
      const cena = cenaZPolicka(k.cena);
      if (kodChyba) chybyRucne.set(r.klic, kodChyba);
      else if (cena === 'chyba') chybyRucne.set(r.klic, 'Cena má být číslo (třeba 48).');
      else hotove.push({ druh: 'rucne', polozka: { kod, nazev: r.v.nazev, beer_id: r.pivoId, package_id: r.v.obal.id, cena } });
    }
    return { volby: hotove, chyby: chybyRucne };
  }, [piva, velikosti, vybrano, koncept, dlazdiceBezPiv, data.zbozi]);

  const pocetZvolenych = volby.length + chyby.size;

  function vyberVseNove(s: SkupinaBezPiv) {
    setVybrano((v) => {
      const n = new Set(v);
      for (const d of dlazdice[s]) if (jeVolitelna(d)) n.add(klicVolbyDlazdice(d.polozka.kod));
      return n;
    });
  }
  function zrusVyber(s: SkupinaBezPiv) {
    setVybrano((v) => {
      const n = new Set(v);
      for (const d of dlazdice[s]) n.delete(klicVolbyDlazdice(d.polozka.kod));
      return n;
    });
  }

  async function pridej() {
    if (volby.length === 0 || chyby.size > 0) return;
    setUklada(true);
    setChyba(null);
    try {
      const zapis = zapisZVoleb(volby);
      const e = await pridejZboziZDlazdic(zapis, zapsal);
      if (e) { setChyba(e); return; }
      uspech(`Přidáno do obchodu: ${zapis.nove.length + zapis.zapnout.length} zboží.`);
      onUlozeno();
      onClose();
    } catch (e) {
      toastChyba(e);
    } finally {
      setUklada(false);
    }
  }

  const aktualni = skupina ? SKUPINY.find((s) => s.id === skupina)! : null;
  const otevrenePivo = otevrenePivoId ? piva.find((b) => b.id === otevrenePivoId) ?? null : null;
  const nespojitelne = dlazdice.piva.filter((d) => d.stav === 'chybi_katalog');

  return (
    <>
      <Modal open onClose={onClose} title="Přidat zboží do obchodu">
        <div className="space-y-3">
          {!aktualni && (
            <>
              <div className="text-sm font-semibold text-neutral-700">
                Klepni na pivo a vyber velikosti, které se v obchodě prodávají — stejně jako ve Fasování.
              </div>
              {piva.length === 0 ? (
                <div className="text-sm font-bold text-neutral-600 bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                  V katalogu nejsou žádná aktivní piva. Přidej je v Číselnících.
                </div>
              ) : (
                <BeerTileGrid
                  beers={piva}
                  onSelect={(b) => setOtevrenePivoId(b.id)}
                  summaryFor={(b) => {
                    const zvolene = (velikosti.get(b.id) ?? []).filter((v) => vybrano.has(klicVolbyVelikosti(v.klic)));
                    return { filled: zvolene.length > 0, label: zvolene.map((v) => formatPackageLabel(v.obal.label)).join(', ') };
                  }}
                />
              )}
              {nespojitelne.length > 0 && (
                <p className="text-[11px] font-semibold text-neutral-600">
                  Z účtenky nejde spárovat s katalogem (chybí pivo nebo obal): {nespojitelne.map((d) => d.polozka.nazev).join('; ')}. Přidej je přes „Jiné zboží“.
                </p>
              )}

              <div className="text-[11px] font-black uppercase tracking-wider text-neutral-500 pt-1">Ostatní zboží</div>
              <div className="grid grid-cols-3 gap-2">
                {SKUPINY.filter((s): s is typeof s & { id: SkupinaBezPiv } => s.id !== 'piva').map((s) => {
                  const Ikona = IKONY[s.id];
                  const nove = dlazdice[s.id].filter(jeVolitelna).length;
                  const zvoleno = dlazdice[s.id].filter((d) => vybrano.has(klicVolbyDlazdice(d.polozka.kod)) && jeVolitelna(d)).length;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn-ghost !rounded-xl !border-2 ${OKRAJ[s.id]} !min-h-[92px] flex flex-col items-center justify-center gap-1 text-center`}
                      onClick={() => setSkupina(s.id)}
                    >
                      <Ikona size={24} />
                      <span className="text-sm font-black text-neutral-950">{s.nazev}</span>
                      <span className="text-xs font-black text-neutral-800">
                        {zvoleno > 0 ? `✓ zvoleno ${zvoleno}` : nove > 0 ? `${nove} k přidání` : 'vše už je v obchodě'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {aktualni && skupina && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" onClick={() => setSkupina(null)}>
                  <ArrowLeft size={14} /> Zpět na piva
                </button>
                <h3 className="text-base font-black text-neutral-950">{aktualni.nazev}</h3>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={() => vyberVseNove(skupina)}>Vybrat všechno nové</button>
                  <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={() => zrusVyber(skupina)}>Zrušit výběr</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dlazdice[skupina].map((d) => {
                  const p = popisDlazdice(d);
                  const volitelna = jeVolitelna(d);
                  const zvolena = vybrano.has(klicVolbyDlazdice(d.polozka.kod)) && volitelna;
                  return (
                    <button
                      key={d.polozka.kod}
                      type="button"
                      disabled={!volitelna}
                      aria-pressed={volitelna ? zvolena : undefined}
                      className={`btn-ghost !rounded-xl !border-2 ${zvolena ? '!border-primary-600 !bg-primary-50' : OKRAJ[skupina]} !min-h-[88px] !items-start flex flex-col justify-between gap-1 text-left relative ${volitelna ? '' : 'opacity-60'}`}
                      onClick={() => prepni(klicVolbyDlazdice(d.polozka.kod))}
                    >
                      {zvolena && <Check size={18} className="absolute top-2 right-2 text-primary-700" />}
                      <span className="text-sm font-black text-neutral-950 leading-tight pr-5">{p.titulek}</span>
                      <span className="text-[11px] font-semibold text-neutral-700">{p.podtitulek}</span>
                      {p.poznamka && <span className="text-[11px] font-bold text-neutral-800">{p.poznamka}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {chyba && <div role="alert" className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 rounded px-3 py-2">{chyba}</div>}
          {chyby.size > 0 && (
            <div role="alert" className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 rounded px-3 py-2">
              Doplň, co chybí u zvoleného zboží — otevři pivo a oprav označené velikosti.
            </div>
          )}

          <div className="sticky -bottom-6 -mx-6 -mb-6 px-6 pt-3 pb-6 bg-white border-t border-neutral-100 space-y-2">
            <button type="button" className="btn-primary !rounded min-h-[48px] w-full" disabled={volby.length === 0 || chyby.size > 0 || uklada} onClick={() => void pridej()}>
              {uklada ? 'Ukládám…' : pocetZvolenych === 0 ? 'Přidat vybrané' : `Přidat vybrané (${pocetZvolenych})`}
            </button>
            <div className="flex justify-between gap-2">
              <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" onClick={onRucne}>
                <Plus size={13} /> Jiné zboží — zadat ručně
              </button>
              <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold" onClick={onClose}>Zrušit</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Panel s velikostmi je vedle okna, ne v něm: okno se při otevření
          animuje (transform) a `fixed` uvnitř takového prvku nedrží obrazovku. */}
      {otevrenePivo && (
        <BeerTilePanel beer={otevrenePivo} onClose={() => setOtevrenePivoId(null)}>
          <p className="text-[11px] font-semibold text-neutral-600">Zvol velikosti, které se v obchodě prodávají. Přidají se po „Přidat vybrané“.</p>
          {(velikosti.get(otevrenePivo.id) ?? []).map((v) => {
            const popis = formatPackageLabel(v.obal.label);
            const zvolena = vybrano.has(klicVolbyVelikosti(v.klic));
            const k = koncept[v.klic] ?? { kod: '', cena: '' };
            const rucne = v.stav === 'nove' && !v.zUctenky;
            const chybaRadku = chyby.get(v.klic);
            return (
              <div
                key={v.klic}
                data-velikost={v.klic}
                className={`rounded border py-1.5 px-2 space-y-1.5 ${zvolena ? 'border-emerald-500 bg-emerald-50' : 'border-neutral-200'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-neutral-800 block truncate">{popis}</span>
                    {v.stav === 'v_obchode' && (
                      <span className="text-[11px] font-bold text-emerald-800 block">✓ už v obchodě · kód {v.kod}</span>
                    )}
                    {v.stav === 'vypnute' && (
                      <span className="text-[11px] font-bold text-neutral-700 block">vypnuté (kód {v.kod}) — zvolením se zase zapne</span>
                    )}
                    {v.stav === 'nove' && v.zUctenky && (
                      <span className="text-[11px] font-semibold text-neutral-600 block">kód {v.kod}{v.cena != null ? ` · ${kc(v.cena)}` : ''}</span>
                    )}
                  </div>
                  {v.stav !== 'v_obchode' && (
                    <button
                      type="button"
                      aria-pressed={zvolena}
                      disabled={rucne && !zvolena && k.kod.trim() === ''}
                      onClick={() => prepni(klicVolbyVelikosti(v.klic))}
                      className={`${zvolena ? 'btn-primary' : 'btn-ghost'} !rounded min-h-[44px] min-w-[96px] font-black shrink-0`}
                    >
                      {zvolena ? <><Check size={16} className="inline mr-1" />Přidá se</> : v.stav === 'vypnute' ? 'Zapnout' : 'Přidat'}
                    </button>
                  )}
                </div>
                {rucne && (
                  <div className="grid grid-cols-[1fr_6rem] gap-2">
                    <input
                      className="input !min-h-[44px] font-bold"
                      inputMode="numeric"
                      placeholder="Kód z pokladny"
                      aria-label={`Kód z pokladny — ${popis}`}
                      value={k.kod}
                      onChange={(e) => zmenKoncept(v.klic, { kod: e.target.value })}
                    />
                    <input
                      className="input !min-h-[44px] text-center font-bold"
                      inputMode="decimal"
                      placeholder="Cena Kč"
                      aria-label={`Cena v pokladně — ${popis}`}
                      value={k.cena}
                      onChange={(e) => zmenKoncept(v.klic, { cena: e.target.value })}
                    />
                  </div>
                )}
                {rucne && !zvolena && (
                  <p className="text-[11px] font-semibold text-neutral-600">Tahle velikost na účtence z pokladny nebyla — doplň její kód z pokladny.</p>
                )}
                {zvolena && chybaRadku && <p role="alert" className="text-[11px] font-black text-rose-700">{chybaRadku}</p>}
              </div>
            );
          })}
        </BeerTilePanel>
      )}
    </>
  );
}
