// 📥 Import stáčení lahví z excelu, do kterého zapisuje kolega mimo appku
// („zatím se tam píše" — appka tohle jinak vůbec netrackuje, takže žádné
// riziko zdvojení). Nahraješ soubor, appka ukáže náhled — co jde zapsat
// rovnou, co už bylo naimportované dřív (přeskočí se) a co potřebuje tvou
// kontrolu, a proč. Teprve po potvrzení se něco zapíše do `bottling`.
//
// Číselná logika je v lib/importStaceniExcel.ts (čisté funkce, otestované
// i na reálném souboru). Tahle komponenta jen čte soubor, dotahuje piva
// z naučených zkratek (`parser_aliases` — stejná tabulka, kterou appka učí
// z WhatsApp objednávek) a zapisuje.
import { useMemo, useState } from 'react';
import { Modal, Spinner } from './ui';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase, fetchAllRows, type Beer, type Package } from '../lib/supabase';
import { saveAlias, fetchAliasesForAdmin } from '../lib/orderParser';
import {
  naparsujRadkyStaceniLahvi, pripravImportStaceniLahvi, popisProblemu, najdiJizNaimportovaneOtisky,
  normalizujNazev, type ExcelRadekStaceni, type RadekKZapisu,
} from '../lib/importStaceniExcel';

type Props = { open: boolean; onClose: () => void; beers: Beer[]; packages: Package[]; onImported: () => void };

const MAX_MB = 15;
/** Po kolika řádcích se zapisuje najednou — ať jeden veliký insert nespadne na limitu. */
const DAVKA = 400;

export default function ImportStaceniLahviExcel({ open, onClose, beers, packages, onImported }: Props) {
  const [nacita, setNacita] = useState(false);
  const [chybaSouboru, setChybaSouboru] = useState<string | null>(null);
  const [nazevSouboru, setNazevSouboru] = useState<string | null>(null);
  const [radky, setRadky] = useState<ExcelRadekStaceni[] | null>(null);
  const [aliasy, setAliasy] = useState<Record<string, string>>({});
  const [vyberProNezname, setVyberProNezname] = useState<Record<string, string>>({});
  const [ukladaAlias, setUkladaAlias] = useState<string | null>(null);
  const [jizNaimportovaneNoty, setJizNaimportovaneNoty] = useState<string[]>([]);
  const [zapisuji, setZapisuji] = useState(false);
  const [chybaZapisu, setChybaZapisu] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<number | null>(null);

  const otisky = useMemo(() => najdiJizNaimportovaneOtisky(jizNaimportovaneNoty), [jizNaimportovaneNoty]);
  const mapovaniPiv = useMemo(() => ({ ...aliasy, ...vyberProNezname }), [aliasy, vyberProNezname]);
  const vysledek = useMemo(
    () => (radky ? pripravImportStaceniLahvi(radky, beers, mapovaniPiv, packages, otisky) : null),
    [radky, beers, mapovaniPiv, packages, otisky],
  );

  function zavrit() {
    setRadky(null); setChybaSouboru(null); setNazevSouboru(null); setVyberProNezname({});
    setChybaZapisu(null); setHotovo(null);
    onClose();
  }

  async function vyberSoubor(e: React.ChangeEvent<HTMLInputElement>) {
    const soubor = e.target.files?.[0];
    e.target.value = '';
    if (!soubor) return;
    if (soubor.size > MAX_MB * 1024 * 1024) {
      setChybaSouboru(`Soubor je moc velký (${(soubor.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_MB} MB).`);
      return;
    }
    setNacita(true); setChybaSouboru(null); setHotovo(null); setVyberProNezname({});
    setNazevSouboru(soubor.name);
    try {
      const [buf, XLSX, aliasRows, notyRes] = await Promise.all([
        soubor.arrayBuffer(),
        import('xlsx-js-style'),
        fetchAliasesForAdmin(),
        // `bottling` časem přeroste tisícovku řádků — fetchAllRows stránkuje,
        // holé `.select().ilike()` by nad tisícovkou tiše ořízlo výsledek
        // (viz lib/strankovaniDotazu.test.ts).
        fetchAllRows<{ note: string | null }>('bottling', 'note').filter('note', 'ilike', '%#xls-lahve:%'),
      ]);
      if (notyRes.error) throw new Error(notyRes.error.message);
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
      const parsed = naparsujRadkyStaceniLahvi(aoa);
      if (parsed.length === 0) {
        throw new Error('V souboru appka nenašla žádné řádky se stáčením (čeká List1, data od řádku 19 — stejný tvar jako „Zápis stáčení lahve").');
      }
      setRadky(parsed);
      setAliasy(Object.fromEntries(aliasRows.filter((a) => a.beer_id).map((a) => [a.alias_text, a.beer_id as string])));
      const notyRadky = (notyRes.data ?? []) as { note: string | null }[];
      setJizNaimportovaneNoty(notyRadky.map((n) => n.note ?? ''));
    } catch (err: any) {
      setChybaSouboru(err?.message ?? 'Soubor se nepodařilo přečíst.');
      setRadky(null);
    } finally {
      setNacita(false);
    }
  }

  async function vyberBeerProNezname(nazevRaw: string, beerId: string) {
    setVyberProNezname((prev) => ({ ...prev, [normalizujNazev(nazevRaw)]: beerId }));
    setUkladaAlias(nazevRaw);
    try { await saveAlias(nazevRaw, beerId, null); } finally { setUkladaAlias(null); }
  }

  async function zapsat() {
    if (!vysledek || vysledek.pripravene.length === 0) return;
    setZapisuji(true); setChybaZapisu(null);
    const zaznamy: RadekKZapisu[] = vysledek.pripravene.flatMap((p) => p.zaznamy);
    try {
      for (let i = 0; i < zaznamy.length; i += DAVKA) {
        const { error } = await supabase.from('bottling').insert(zaznamy.slice(i, i + DAVKA));
        if (error) throw new Error(error.message);
      }
      setHotovo(vysledek.pripravene.length);
      onImported();
    } catch (err: any) {
      setChybaZapisu(err?.message ?? 'Zápis se nepodařil.');
    } finally {
      setZapisuji(false);
    }
  }

  return (
    <Modal open={open} onClose={zavrit} title="Import stáčení lahví z Excelu" wide>
      <div className="space-y-4">
        <p className="text-sm font-semibold text-neutral-600">
          Nahraj soubor, do kterého zapisuje kolega (List1, tvar jako „Zápis stáčení lahve"). Appka ukáže náhled a zapíše
          teprve po potvrzení — nic se nestane automaticky. Když soubor nahraješ znovu později s novými řádky, appka
          naimportuje jen ty nové.
        </p>

        {!radky && (
          <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 p-8 cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 transition">
            <Upload className="w-8 h-8 text-neutral-400" />
            <span className="font-bold text-sm text-neutral-700">Vyber soubor .xlsx</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={vyberSoubor} />
          </label>
        )}
        {nacita && <div className="flex items-center gap-2 text-sm font-semibold text-neutral-500"><Spinner /> Čtu soubor…</div>}
        {chybaSouboru && (
          <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{chybaSouboru}</p>
        )}

        {vysledek && (
          <>
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-700">
              <FileSpreadsheet className="w-4 h-4 text-neutral-400" /> {nazevSouboru}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <div className="text-udaj font-black uppercase tracking-wider text-emerald-800">Připraveno</div>
                <div className="font-display font-extrabold text-xl text-emerald-900 tabular-nums">{vysledek.pripravene.length}</div>
              </div>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3">
                <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Už bylo naimportováno</div>
                <div className="font-display font-extrabold text-xl text-neutral-700 tabular-nums">{vysledek.jizNaimportovane}</div>
              </div>
              <div className={`rounded-xl border p-3 ${vysledek.problemy.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-neutral-50 border-neutral-200'}`}>
                <div className="text-udaj font-black uppercase tracking-wider text-amber-800">Ke kontrole</div>
                <div className="font-display font-extrabold text-xl text-amber-900 tabular-nums">{vysledek.problemy.length}</div>
              </div>
            </div>

            {vysledek.neznamaPiva.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <h4 className="font-black text-sm text-amber-900 mb-2">Nerozpoznaná piva — přiřaď a appka si je zapamatuje</h4>
                <div className="space-y-2">
                  {vysledek.neznamaPiva.map((nazev) => (
                    <div key={nazev} className="flex items-center gap-2">
                      <span className="text-sm font-bold text-neutral-800 flex-1 truncate">„{nazev}"</span>
                      <select
                        className="input !py-1.5 !text-xs !w-auto"
                        defaultValue=""
                        onChange={(e) => e.target.value && vyberBeerProNezname(nazev, e.target.value)}
                      >
                        <option value="" disabled>— vyber pivo —</option>
                        {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      {ukladaAlias === nazev && <Spinner className="w-3.5 h-3.5" />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {vysledek.problemy.length > 0 && (
              <section className="rounded-xl border border-neutral-200 p-3 max-h-56 overflow-y-auto">
                <h4 className="font-black text-sm text-neutral-700 mb-2">Řádky ke kontrole (nezapíšou se)</h4>
                <ul className="space-y-1 text-udaj font-semibold text-neutral-600">
                  {vysledek.problemy.map((p) => (
                    <li key={p.cisloRadku}>
                      řádek {p.cisloRadku}: {p.problemy.map(popisProblemu).join('; ')}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {vysledek.pripravene.length > 0 && (
              <section className="rounded-xl border border-neutral-200 p-3 max-h-56 overflow-y-auto">
                <h4 className="font-black text-sm text-neutral-700 mb-2">K zápisu ({vysledek.pripravene.length})</h4>
                <ul className="space-y-1 text-udaj font-semibold text-neutral-600">
                  {vysledek.pripravene.map((p) => (
                    <li key={p.otisk}>{p.popis}{p.bezSudu ? ' · bez zdrojového sudu' : ''}</li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-udaj font-semibold text-neutral-400">
              Pozn.: appka pozná už zapsaný řádek podle čísel (datum, pivo, sudy, lahve) — pozdější oprava jen poznámky
              v excelu se nebere jako nový řádek. Když ale kolega později opraví samotné MNOŽSTVÍ u už naimportovaného
              řádku, appka to uvidí jako další nový řádek navíc — starý (špatný) by šlo potřeba smazat ručně v appce.
            </p>

            {chybaZapisu && <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{chybaZapisu}</p>}

            {hotovo !== null ? (
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4" /> Zapsáno {hotovo} {hotovo === 1 ? 'řádek' : hotovo < 5 ? 'řádky' : 'řádků'} do Stáčení lahví.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={zapsat}
                  disabled={zapisuji || vysledek.pripravene.length === 0}
                  className="btn-primary !rounded-xl !py-2.5 !px-4 text-sm font-black disabled:opacity-40 flex items-center gap-2"
                >
                  {zapisuji && <Spinner className="w-4 h-4" />}
                  Zapsat {vysledek.pripravene.length ? `${vysledek.pripravene.length} ${vysledek.pripravene.length === 1 ? 'řádek' : vysledek.pripravene.length < 5 ? 'řádky' : 'řádků'}` : ''}
                </button>
                {vysledek.problemy.length > 0 && (
                  <span className="text-udaj font-semibold text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {vysledek.problemy.length} ke kontrole se přeskočí
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
