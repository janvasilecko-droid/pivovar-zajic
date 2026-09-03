/**
 * Diagnostika pro admina v Nastavení — tři věci, o kterých se dosud nedalo
 * zjistit vůbec nic:
 *
 * 1. CHYBY APLIKACE. ErrorBoundary chybu ukázal uživateli a tím to skončilo.
 *    Rozbitá obrazovka se poznala telefonátem. Teď se zapisuje s verzí
 *    a obrazovkou (viz lib/chybyHlaseni.ts).
 * 2. MIGRACE. Soubory v supabase/migrations/ neříkají nic o tom, co na
 *    produkci běží. Dvě čekající migrace tak dva dny nikdo neviděl.
 * 3. FRONTA ODEČTŮ Z TANKŮ. Nedokončený odečet objemu (viz lib/tankFronta.ts)
 *    se opakuje sám; tady je vidět, jestli něco čeká nebo to appka vzdala.
 *
 * Všechny tři bloky musí přežít stav, kdy příslušná migrace ještě neproběhla
 * — místo chyby řeknou, že tabulka ještě není. Migrace se pouští ručně,
 * takže tenhle stav je normální provoz, ne porucha.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Cylinder, Database, RefreshCw } from 'lucide-react';
// `fetchAllRows` se tu ZÁMĚRNĚ nepoužívá: oba dotazy mají malý pevný rozsah
// (posledních 50 chyb, seznam migrací) a přehled diagnostiky nemá stahovat
// desetitisíce řádků. Stránkování patří tam, kde se čtou VŠECHNY řádky.
import { supabase } from '../lib/supabase';
import { chybiTabulka } from '../lib/chybyHlaseni';
import {
  porovnejMigrace, pocetCekajicich, osirele, type MigraceRadek, type AplikovanaMigrace,
} from '../lib/migraceStav';
import {
  frontaTanku, odeberZFronty, TANK_FRONTA_EVENT, type OdecetVeFronte,
} from '../lib/tankFronta';
import { spustFrontuTanku } from '../lib/tankFrontaBeh';
import { oznam, potvrd } from '../lib/toast';

type ChybaRadek = {
  id: string;
  created_at: string;
  app_version: string | null;
  druh: string;
  obrazovka: string | null;
  zprava: string;
  user_email: string | null;
  vyrizeno_at: string | null;
};

function cas(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('cs-CZ'); } catch { return iso; }
}

/** 🐞 Poslední chyby aplikace. */
function ChybyBlok() {
  const [radky, setRadky] = useState<ChybaRadek[]>([]);
  const [stav, setStav] = useState<'nacitam' | 'ok' | 'bez-tabulky' | 'chyba'>('nacitam');
  const [chybaText, setChybaText] = useState<string | null>(null);

  async function nacti() {
    setStav('nacitam');
    const { data, error } = await supabase
      .from('app_errors')
      .select('id, created_at, app_version, druh, obrazovka, zprava, user_email, vyrizeno_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (chybiTabulka(error)) { setStav('bez-tabulky'); return; }
      setChybaText(error.message);
      setStav('chyba');
      return;
    }
    setRadky((data as ChybaRadek[]) ?? []);
    setStav('ok');
  }

  useEffect(() => { void nacti(); }, []);

  async function vyrid(id: string) {
    const { error } = await supabase.from('app_errors').update({ vyrizeno_at: new Date().toISOString() }).eq('id', id);
    if (error) { oznam(`Nepovedlo se: ${error.message}`); return; }
    setRadky((p) => p.map((r) => (r.id === id ? { ...r, vyrizeno_at: new Date().toISOString() } : r)));
  }

  const nevyrizene = radky.filter((r) => !r.vyrizeno_at);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Chyby aplikace</span>
        {stav === 'ok' && (
          <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-[11px] ${nevyrizene.length > 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900'}`}>
            {nevyrizene.length > 0 ? `${nevyrizene.length} nevyřízených` : 'nic nového'}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void nacti(); }}
          className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-700 font-black text-[11px] border border-neutral-300"
        >
          Načíst znovu
        </button>
      </div>

      {stav === 'nacitam' && <p className="text-xs text-neutral-600 mt-2">Načítám…</p>}
      {stav === 'bez-tabulky' && (
        <p className="text-xs text-neutral-600 mt-2">
          Tabulka <code>app_errors</code> v databázi ještě není — spusť migraci
          <code> 20261227000000_chyby_aplikace.sql</code>. Do té doby se chyby nesbírají
          (aplikace kvůli tomu nic nedělá jinak).
        </p>
      )}
      {stav === 'chyba' && <p className="text-xs text-rose-900 mt-2">Nepovedlo se načíst: {chybaText}</p>}
      {stav === 'ok' && radky.length === 0 && (
        <p className="text-xs text-neutral-600 mt-2">Žádná chyba zapsaná. To je dobrá zpráva.</p>
      )}
      {stav === 'ok' && radky.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-neutral-700">
                <th className="py-1 pr-2 font-black">Kdy</th>
                <th className="py-1 pr-2 font-black">Verze</th>
                <th className="py-1 pr-2 font-black">Obrazovka</th>
                <th className="py-1 pr-2 font-black">Chyba</th>
                <th className="py-1 pr-2 font-black">Kdo</th>
                <th className="py-1 font-black" />
              </tr>
            </thead>
            <tbody>
              {radky.map((r) => (
                <tr key={r.id} className={`border-t border-neutral-200 ${r.vyrizeno_at ? 'text-neutral-500' : 'text-neutral-900'}`}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{cas(r.created_at)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap font-black">v{r.app_version ?? '?'}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.obrazovka ?? '—'}</td>
                  <td className="py-1.5 pr-2 lze-vybrat">{r.zprava}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.user_email ?? '—'}</td>
                  <td className="py-1.5 whitespace-nowrap">
                    {r.vyrizeno_at
                      ? <span className="text-emerald-900 font-black">vyřízeno</span>
                      : (
                        <button
                          type="button"
                          onClick={() => { void vyrid(r.id); }}
                          className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300"
                        >
                          <Check className="ikona-text" /> vyřídit
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 🗄️ Které migrace jsou aplikované a které čekají. */
function MigraceBlok() {
  const [radky, setRadky] = useState<MigraceRadek[]>([]);
  const [navic, setNavic] = useState<string[]>([]);
  const [stav, setStav] = useState<'nacitam' | 'ok' | 'bez-tabulky' | 'bez-seznamu' | 'chyba'>('nacitam');
  const [chybaText, setChybaText] = useState<string | null>(null);

  async function nacti() {
    setStav('nacitam');
    let soubory: string[] = [];
    try {
      // migrace.json vzniká při buildu (viz vite.config.ts). Cache-busting
      // ze stejného důvodu jako u version.json — service worker by vracel
      // starý seznam.
      const resp = await fetch(`./migrace.json?t=${Date.now()}`, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(String(resp.status));
      soubory = (await resp.json())?.soubory ?? [];
    } catch {
      setStav('bez-seznamu');
      return;
    }
    const { data, error } = await supabase
      .from('migrace_aplikovane')
      .select('nazev, aplikovano_at, zdroj')
      .order('nazev', { ascending: true });
    if (error) {
      if (chybiTabulka(error)) { setStav('bez-tabulky'); return; }
      setChybaText(error.message);
      setStav('chyba');
      return;
    }
    const aplikovane = (data as AplikovanaMigrace[]) ?? [];
    setRadky(porovnejMigrace(soubory, aplikovane));
    setNavic(osirele(soubory, aplikovane));
    setStav('ok');
  }

  useEffect(() => { void nacti(); }, []);

  const ceka = pocetCekajicich(radky);
  const cekajici = radky.filter((r) => r.stav === 'ceka');

  return (
    <div className="mt-6 pt-5 border-t border-neutral-200">
      <div className="flex items-center gap-2">
        <Database className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Databázové migrace</span>
        {stav === 'ok' && (
          <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-[11px] ${ceka > 0 ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
            {ceka > 0 ? `${ceka} čeká na spuštění` : 'nic nečeká'}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void nacti(); }}
          className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-700 font-black text-[11px] border border-neutral-300"
        >
          Načíst znovu
        </button>
      </div>

      {stav === 'nacitam' && <p className="text-xs text-neutral-600 mt-2">Načítám…</p>}
      {stav === 'bez-seznamu' && (
        <p className="text-xs text-neutral-600 mt-2">
          Seznam migrací (<code>migrace.json</code>) není k dispozici — vznikne při dalším buildu.
        </p>
      )}
      {stav === 'bez-tabulky' && (
        <p className="text-xs text-neutral-600 mt-2">
          Tabulka <code>migrace_aplikovane</code> ještě není — spusť migraci
          <code> 20261227010000_evidence_migraci.sql</code>. Ta je zároveň začátek evidence:
          o migracích spuštěných dřív se nedá poctivě zjistit, kdy se pustily, takže se
          budou hlásit jako „starší než evidence", ne jako čekající.
        </p>
      )}
      {stav === 'chyba' && <p className="text-xs text-rose-900 mt-2">Nepovedlo se načíst: {chybaText}</p>}
      {stav === 'ok' && (
        <>
          {cekajici.length > 0 && (
            <div className="mt-2 p-3 rounded bg-amber-100 text-amber-950 border border-amber-300">
              <p className="text-xs font-black">Tyhle migrace ještě nikdo nespustil:</p>
              <ul className="mt-1 space-y-0.5">
                {cekajici.map((r) => (
                  <li key={r.nazev} className="text-xs font-bold lze-vybrat">{r.nazev}</li>
                ))}
              </ul>
              <p className="text-xs mt-2">
                Spustí se přes <code>node scripts/apply-migration.mjs &lt;nazev&gt;.sql</code> (token v <code>.env</code>).
              </p>
            </div>
          )}
          {navic.length > 0 && (
            <div className="mt-2 p-3 rounded bg-neutral-100 text-neutral-700 border border-neutral-300">
              <p className="text-xs font-black">V evidenci, ale ne v repozitáři (nejspíš přejmenovaný soubor):</p>
              <ul className="mt-1 space-y-0.5">
                {navic.map((n) => <li key={n} className="text-xs lze-vybrat">{n}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-neutral-600 mt-2">
            Celkem {radky.length} souborů: {radky.filter((r) => r.stav === 'aplikovano').length} aplikovaných,
            {' '}{ceka} čekajících, {radky.filter((r) => r.stav === 'starsi-nez-evidence').length} starších než evidence.
          </p>
        </>
      )}
    </div>
  );
}

/** 🛢️ Nedokončené odečty objemu z tanků. */
function TankFrontaBlok() {
  const [fronta, setFronta] = useState<OdecetVeFronte[]>(() => frontaTanku());
  const [bezi, setBezi] = useState(false);

  useEffect(() => {
    const obnov = () => setFronta(frontaTanku());
    window.addEventListener(TANK_FRONTA_EVENT, obnov);
    return () => window.removeEventListener(TANK_FRONTA_EVENT, obnov);
  }, []);

  async function zkusTed() {
    setBezi(true);
    const r = await spustFrontuTanku();
    setBezi(false);
    setFronta(frontaTanku());
    oznam(r.hotovo > 0
      ? `Dokončeno ${r.hotovo} odečtů, zbývá ${r.zbyva}.`
      : `Nepovedlo se (${r.selhalo} pokusů), zbývá ${r.zbyva}.`);
  }

  async function zahod(p: OdecetVeFronte) {
    const ok = await potvrd(
      `Zahodit odečet ${p.deltaL} l z ${p.label}?`
      + ' Použij to jen když jsi objem opravil ručně ve Sklepě — jinak zůstane tank'
      + ' nafouknutý o pivo, které už odteklo.',
      { titulek: 'Zahodit odečet', potvrdit: 'Zahodit', nebezpecne: true },
    );
    if (!ok) return;
    setFronta(odeberZFronty(p.klic));
  }

  return (
    <div className="mt-6 pt-5 border-t border-neutral-200">
      <div className="flex items-center gap-2">
        <Cylinder className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Nedokončené odečty z tanků</span>
        <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-[11px] ${fronta.length > 0 ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
          {fronta.length > 0 ? `${fronta.length} čeká` : 'nic nečeká'}
        </span>
      </div>

      {fronta.length === 0 && (
        <p className="text-xs text-neutral-600 mt-2">
          Všechno odečtené. Kdyby odečet objemu při stáčení selhal (třeba bez signálu ve sklepě),
          objeví se tady a appka ho zkusí znovu sama.
        </p>
      )}

      {fronta.length > 0 && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-neutral-700">
                  <th className="py-1 pr-2 font-black">Tank</th>
                  <th className="py-1 pr-2 font-black">Litry</th>
                  <th className="py-1 pr-2 font-black">Pokusů</th>
                  <th className="py-1 pr-2 font-black">Naposled</th>
                  <th className="py-1 pr-2 font-black">Důvod</th>
                  <th className="py-1 font-black" />
                </tr>
              </thead>
              <tbody>
                {fronta.map((p) => (
                  <tr key={p.klic} className={`border-t border-neutral-200 ${p.vzdano ? 'text-rose-900' : 'text-neutral-900'}`}>
                    <td className="py-1.5 pr-2 whitespace-nowrap font-black">{p.label}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{p.deltaL} l</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{p.pokusu}{p.vzdano ? ' (vzdáno)' : ''}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{cas(p.poslednePokus)}</td>
                    <td className="py-1.5 pr-2 lze-vybrat">{p.chyba ?? '—'}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => { void zahod(p); }}
                        className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 font-black border border-neutral-300"
                      >
                        zahodit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={bezi}
            onClick={() => { void zkusTed(); }}
            className="mt-3 w-full py-2.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 hover:text-amber-800 font-black text-xs border border-amber-300 transition flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="ikona-text" /> {bezi ? 'Zkouším…' : 'Zkusit odečty teď'}
          </button>
        </>
      )}
    </div>
  );
}

export default function AdminDiagnostika() {
  return (
    <div className="card p-6 border-2 border-neutral-300 bg-white rounded shadow-md">
      <h2 className="font-display font-bold text-lg flex items-center gap-2">
        <AlertTriangle size={20} className="text-rose-600" />
        <span>Diagnostika</span>
        <span className="ml-auto px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-[11px] uppercase tracking-wider">
          ADMIN
        </span>
      </h2>
      <p className="text-sm text-neutral-600 mt-2">
        Chyby aplikace, stav databázových migrací a nedokončené odečty z tanků — tři věci,
        které se dřív nedaly zjistit jinak než tím, že něco nefungovalo.
      </p>
      <ChybyBlok />
      <MigraceBlok />
      <TankFrontaBlok />
    </div>
  );
}
