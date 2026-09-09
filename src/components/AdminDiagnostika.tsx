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
import { AlertTriangle, Check, Database, ExternalLink, RefreshCw } from 'lucide-react';
// `fetchAllRows` se tu ZÁMĚRNĚ nepoužívá: oba dotazy mají malý pevný rozsah
// (posledních 50 chyb, seznam migrací) a přehled diagnostiky nemá stahovat
// desetitisíce řádků. Stránkování patří tam, kde se čtou VŠECHNY řádky.
import { supabase } from '../lib/supabase';
import { chybiTabulka } from '../lib/chybyHlaseni';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import {
  porovnejMigrace, pocetCekajicich, osirele, poradiSpusteni, type MigraceRadek, type AplikovanaMigrace,
} from '../lib/migraceStav';
import {
  frontaTanku, odeberZFronty, TANK_FRONTA_EVENT, type OdecetVeFronte,
} from '../lib/tankFronta';
import { spustFrontuTanku } from '../lib/tankFrontaBeh';
import { oznam, potvrd } from '../lib/toast';
import { litry } from '../lib/cisla';
import { IkonaSud } from './ikony';
import { rozdelChyby, shrnutiChyb, jeZeStarsiVerze } from '../lib/chybyPrehled';
import { nactiPosledniBehNasazeni, vyhodnotBeh, type BehNasazeni } from '../lib/nasazeniStav';
import { APP_VERSION } from '../lib/version';

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
/** 🚦 Poslední automatické nasazení — appka to sama nikde neřekne, GitHub issue z toho vidí jen ten, kdo tam chodí. */
function NasazeniBlok() {
  const [beh, setBeh] = useState<BehNasazeni | null>(null);
  const [nacteno, setNacteno] = useState(false);

  useEffect(() => {
    let zruseno = false;
    void nactiPosledniBehNasazeni().then((b) => { if (!zruseno) { setBeh(b); setNacteno(true); } });
    return () => { zruseno = true; };
  }, []);

  const vysledek = vyhodnotBeh(beh);
  // Dokud se nenačte nebo GitHub není dostupný, appka mlčí — bonusový
  // údaj nesmí strašit poplašnou hláškou jen kvůli výpadku sítě.
  if (!nacteno || vysledek === 'neznamo' || vysledek === 'v-poradku' || !beh) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="ikona-text text-rose-600" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Automatické nasazení</span>
      </div>
      {vysledek === 'bezi' ? (
        <p className="text-xs text-neutral-600 mt-2">
          <RefreshCw size={12} className="inline animate-spin -mt-0.5 mr-1" /> Právě probíhá nasazení poslední změny — appka se za pár minut sama aktualizuje.
        </p>
      ) : (
        <div className="mt-2 rounded-xl border border-rose-300 bg-rose-50 p-2.5">
          <p className="text-xs font-bold text-rose-950">
            Poslední pokus o nasazení ({cas(beh.created_at)}) se nepovedl. Appka na produkci
            je pořád ta z předchozího úspěšného nasazení — nic se nerozbilo, jen se nedostala
            ven poslední změna.
          </p>
          <a
            href={beh.html_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-rose-800 underline"
          >
            Zobrazit podrobnosti na GitHubu <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  );
}

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

  /**
   * Odklepne naráz všechny chyby ze starších verzí.
   *
   * Bez toho se musel každý řádek odklepnout zvlášť — a chyby po nasazené
   * opravě zůstávaly v seznamu svítit dál, takže chybník tvrdil „něco je
   * rozbité", i když nebylo.
   */
  async function vyridStarsi() {
    const idcka = deleni.starsi.map((r) => r.id);
    if (idcka.length === 0) return;
    if (!(await potvrd(`Odklepnout ${idcka.length} chyb ze starších verzí? Zůstanou v seznamu, jen přestanou svítit jako nevyřízené.`))) return;
    const ted = new Date().toISOString();
    const { error } = await supabase.from('app_errors').update({ vyrizeno_at: ted }).in('id', idcka);
    if (error) { oznam(`Nepovedlo se: ${error.message}`); return; }
    setRadky((p) => p.map((r) => (idcka.includes(r.id) ? { ...r, vyrizeno_at: ted } : r)));
  }

  // Chyba z jiné verze, než jaká běží, není důkaz, že je opravená — ale je to
  // jediné, co se dá poznat automaticky, a je to velký rozdíl proti hromadě,
  // ve které se „děje se to teď" nedá odlišit od historie (lib/chybyPrehled.ts).
  const deleni = rozdelChyby(radky, APP_VERSION);
  const nevyrizene = radky.filter((r) => !r.vyrizeno_at);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Chyby aplikace</span>
        {stav === 'ok' && (
          <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-udaj ${
            deleni.aktualni.length > 0 ? 'bg-rose-100 text-rose-900'
            : deleni.starsi.length > 0 ? 'bg-amber-100 text-amber-950'
            : 'bg-emerald-100 text-emerald-900'
          }`}>
            {shrnutiChyb(deleni)}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void nacti(); }}
          className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-700 font-black text-udaj border border-neutral-300 tap"
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
        // Dřív to byla tabulka o šesti sloupcích. Na telefonu z ní byly vidět
        // dva a tlačítko „vyřídit" bylo úplně mimo displej — takže se chyba
        // nedala odklepnout, jen odrolovat. Seznam se vejde vždycky.
        <div className="mt-2 space-y-2">
          {deleni.starsi.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5">
              <p className="text-xs font-bold text-amber-950">
                {deleni.starsi.length === 1 ? 'Jedna chyba je' : `${deleni.starsi.length} chyb je`} z verzí, které už neběží
                (teď běží {APP_VERSION}). Nejspíš je oprava venku — než je odklepnete, stojí za to se podívat, co v nich stojí.
              </p>
              <button
                type="button"
                onClick={() => { void vyridStarsi(); }}
                className="btn-secondary !rounded mt-2 text-xs min-h-[44px]"
              >
                <Check className="ikona-text" /> Odklepnout všechny ze starších verzí
              </button>
            </div>
          )}

          {radky.map((r) => {
            const stara = !r.vyrizeno_at && jeZeStarsiVerze(r.app_version, APP_VERSION);
            return (
              <div
                key={r.id}
                className={`rounded-xl border p-2.5 ${
                  r.vyrizeno_at ? 'border-neutral-200 bg-neutral-50 text-neutral-500'
                  : stara ? 'border-amber-200 bg-white text-neutral-800'
                  : 'border-rose-300 bg-rose-50 text-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap text-udaj font-black">
                  <span>{cas(r.created_at)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-300">v{r.app_version ?? '?'}</span>
                  <span>{r.obrazovka ?? '—'}</span>
                  {r.vyrizeno_at
                    ? <span className="ml-auto text-emerald-900">vyřízeno</span>
                    : stara && <span className="ml-auto text-amber-800">ze starší verze</span>}
                </div>
                <p className="mt-1 text-xs font-semibold break-words lze-vybrat">{r.zprava}</p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="text-udaj text-neutral-500">{r.user_email ?? '—'}</span>
                  {!r.vyrizeno_at && (
                    <button
                      type="button"
                      onClick={() => { void vyrid(r.id); }}
                      className="ml-auto px-3 py-1.5 rounded bg-emerald-100 text-emerald-900 font-black text-xs border border-emerald-300 min-h-[44px] tap"
                    >
                      <Check className="ikona-text" /> vyřídit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
  // Název právě pouštěné migrace (a tím i příznak „něco běží").
  const [bezi, setBezi] = useState<string | null>(null);
  // Co dopadlo jak — vypisuje se pod tlačítkem, ať je po spuštění vidět
  // výsledek i tehdy, když se seznam mezitím překreslí.
  const [vysledky, setVysledky] = useState<{ nazev: string; ok: boolean; popis: string }[]>([]);

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

  /**
   * Pustí čekající migrace po řadě, od nejstarší. Pořadí je podstatné:
   * pozdější migrace běžně staví na tom, co založila dřívější. Při první
   * chybě se zbytek nepouští — jinak by se na první chybu nabalily další,
   * které jen padají na chybějící tabulku, a nedalo by se poznat, co je
   * vlastně špatně.
   */
  async function spustVse() {
    if (bezi) return;
    const seznam = poradiSpusteni(radky);
    if (seznam.length === 0) return;
    const potvrzeno = await potvrd(
      seznam.length === 1
        ? `Spustit migraci ${seznam[0].nazev} na produkční databázi?`
        : `Spustit ${seznam.length} čekajících migrací na produkční databázi (po řadě od nejstarší)?`,
    );
    if (!potvrzeno) return;

    const nove: { nazev: string; ok: boolean; popis: string }[] = [];
    for (const m of seznam) {
      setBezi(m.nazev);
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pust-migraci`,
          { method: 'POST', headers: await authenticatedFunctionHeaders(), body: JSON.stringify({ nazev: m.nazev }) },
        );
        const telo = await resp.json().catch(() => ({}));
        if (!resp.ok || telo?.error) {
          nove.push({ nazev: m.nazev, ok: false, popis: telo?.error ?? `HTTP ${resp.status}` });
          break;
        }
        nove.push({ nazev: m.nazev, ok: true, popis: telo?.jizBylo ? 'už byla aplikovaná' : 'hotovo' });
      } catch (e: any) {
        nove.push({ nazev: m.nazev, ok: false, popis: e?.message ?? String(e) });
        break;
      }
    }
    setBezi(null);
    setVysledky(nove);
    const spadlo = nove.find((v) => !v.ok);
    oznam(spadlo ? `Migrace ${spadlo.nazev} neprošla: ${spadlo.popis}` : `Hotovo — ${nove.length} migrací aplikováno.`);
    await nacti();
  }

  return (
    <div className="mt-6 pt-5 border-t border-neutral-200">
      <div className="flex items-center gap-2">
        <Database className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Databázové migrace</span>
        {stav === 'ok' && (
          <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-udaj ${ceka > 0 ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
            {ceka > 0 ? `${ceka} čeká na spuštění` : 'nic nečeká'}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void nacti(); }}
          className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-700 font-black text-udaj border border-neutral-300 tap"
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
              <button
                type="button"
                onClick={() => { void spustVse(); }}
                disabled={!!bezi}
                className="mt-2 px-3 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs transition min-h-[44px] flex items-center gap-2"
              >
                {bezi ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                {bezi ? `Pouštím ${bezi}…` : cekajici.length === 1 ? 'Spustit tuhle migraci' : `Spustit všech ${cekajici.length} po řadě`}
              </button>
              <p className="text-xs mt-2">
                Z počítače je to <code>node scripts/apply-migration.mjs &lt;nazev&gt;.sql</code> (token v <code>.env</code>) —
                tlačítko dělá totéž a jde i z telefonu.
              </p>
            </div>
          )}
          {vysledky.length > 0 && (
            <div className="mt-2 space-y-1">
              {vysledky.map((v) => (
                <p
                  key={v.nazev}
                  className={`text-xs font-bold flex items-start gap-1.5 ${v.ok ? 'text-emerald-800' : 'text-rose-900'}`}
                >
                  {v.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                  <span className="lze-vybrat">{v.nazev} — {v.popis}</span>
                </p>
              ))}
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
      `Zahodit odečet ${litry(p.deltaL)} z ${p.label}?`
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
        <IkonaSud className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Nedokončené odečty z tanků</span>
        <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-udaj ${fronta.length > 0 ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
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
            <table className="table-drzi-prvni-sloupec w-full text-left text-xs">
              <thead>
                <tr className="text-neutral-700">
                  <th scope="col" className="py-1 pr-2 font-black">Tank</th>
                  <th scope="col" className="py-1 pr-2 font-black">Litry</th>
                  <th scope="col" className="py-1 pr-2 font-black">Pokusů</th>
                  <th scope="col" className="py-1 pr-2 font-black">Naposled</th>
                  <th scope="col" className="py-1 pr-2 font-black">Důvod</th>
                  <th scope="col" className="py-1 font-black" />
                </tr>
              </thead>
              <tbody>
                {fronta.map((p) => (
                  <tr key={p.klic} className={`border-t border-neutral-200 ${p.vzdano ? 'text-rose-900' : 'text-neutral-900'}`}>
                    <td className="py-1.5 pr-2 whitespace-nowrap font-black">{p.label}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums">{litry(p.deltaL)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{p.pokusu}{p.vzdano ? ' (vzdáno)' : ''}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{cas(p.poslednePokus)}</td>
                    <td className="py-1.5 pr-2 lze-vybrat">{p.chyba ?? '—'}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => { void zahod(p); }}
                        className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 font-black border border-neutral-300 tap"
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
        <AlertTriangle size={18} className="text-rose-600" />
        <span>Diagnostika</span>
        <span className="ml-auto px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-udaj uppercase tracking-wider">
          ADMIN
        </span>
      </h2>
      <p className="text-sm text-neutral-600 mt-2">
        Chyby aplikace, stav databázových migrací a nedokončené odečty z tanků — tři věci,
        které se dřív nedaly zjistit jinak než tím, že něco nefungovalo.
      </p>
      <NasazeniBlok />
      <ChybyBlok />
      <MigraceBlok />
      <TankFrontaBlok />
    </div>
  );
}
