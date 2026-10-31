// 🗄️📚 Migrace DATABÁZE BIBLE — samostatný projekt Supabase (rozhodnutí R12).
// ---------------------------------------------------------------------------
// Stejně jako hlavní blok migrací: seznam souborů z buildu
// (/migrace-bible.json, vzniká z bible/supabase/migrations — viz
// vite.config.ts), evidence z projektu bible a tlačítko, které čekající
// migrace pustí po řadě od nejstarší. Pouští je edge funkce bible-migrace
// v projektu bible; smí jen admin (ověří ji v hlavní appce).
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Database, RefreshCw } from 'lucide-react';
import { volejBibli } from '../lib/bibleKlient';
import { osirele, pocetCekajicich, poradiSpusteni, porovnejMigrace, type AplikovanaMigrace, type MigraceRadek } from '../lib/migraceStav';
import { oznam, potvrd } from '../lib/toast';

type Stav = 'nacitam' | 'ok' | 'bez-seznamu' | 'nenasazeno' | 'chyba';

/** Spuštění jedné migrace může trvat (funkce má limit 150 s). */
const LIMIT_SPUSTENI_MS = 140_000;

export function MigraceBibleBlok() {
  const [radky, setRadky] = useState<MigraceRadek[]>([]);
  const [navic, setNavic] = useState<string[]>([]);
  const [stav, setStav] = useState<Stav>('nacitam');
  const [chybaText, setChybaText] = useState<string | null>(null);
  const [bezi, setBezi] = useState<string | null>(null);
  const [vysledky, setVysledky] = useState<{ nazev: string; ok: boolean; popis: string }[]>([]);

  async function nacti() {
    setStav('nacitam');
    let soubory: string[] = [];
    try {
      const resp = await fetch(`./migrace-bible.json?t=${Date.now()}`, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(String(resp.status));
      soubory = (await resp.json())?.soubory ?? [];
    } catch {
      setStav('bez-seznamu');
      return;
    }
    const r = await volejBibli<{ evidence: boolean; aplikovane: AplikovanaMigrace[] }>('bible-migrace', { akce: 'seznam' });
    if (!r.ok) {
      setChybaText(r.chyba.zprava);
      setStav(r.chyba.kod === 'nenasazeno' || r.chyba.kod === 'nenastaveno' ? 'nenasazeno' : 'chyba');
      return;
    }
    const aplikovane = Array.isArray(r.data.aplikovane) ? r.data.aplikovane : [];
    setRadky(porovnejMigrace(soubory, aplikovane, ''));
    setNavic(osirele(soubory, aplikovane));
    setStav('ok');
  }

  useEffect(() => { void nacti(); }, []);

  const ceka = pocetCekajicich(radky);
  const cekajici = radky.filter((r) => r.stav === 'ceka');

  async function spustVse() {
    if (bezi) return;
    const seznam = poradiSpusteni(radky);
    if (seznam.length === 0) return;
    const potvrzeno = await potvrd(
      seznam.length === 1
        ? `Spustit migraci ${seznam[0].nazev} v databázi bible?`
        : `Spustit ${seznam.length} čekajících migrací v databázi bible (po řadě od nejstarší)?`,
    );
    if (!potvrzeno) return;

    const nove: { nazev: string; ok: boolean; popis: string }[] = [];
    for (const m of seznam) {
      setBezi(m.nazev);
      const r = await volejBibli<{ jizBylo?: boolean }>('bible-migrace', { akce: 'spustit', nazev: m.nazev }, LIMIT_SPUSTENI_MS);
      if (!r.ok) {
        nove.push({ nazev: m.nazev, ok: false, popis: r.chyba.zprava });
        break;
      }
      nove.push({ nazev: m.nazev, ok: true, popis: r.data?.jizBylo ? 'už byla aplikovaná' : 'hotovo' });
    }
    setBezi(null);
    setVysledky(nove);
    const spadlo = nove.find((v) => !v.ok);
    oznam(spadlo ? `Migrace bible ${spadlo.nazev} neprošla: ${spadlo.popis}` : `Hotovo — ${nove.length} migrací bible aplikováno.`);
    await nacti();
  }

  return (
    <div className="mt-6 pt-5 border-t border-neutral-200">
      <div className="flex items-center gap-2">
        <Database className="ikona-text" />
        <span className="text-xs font-black uppercase tracking-wider text-neutral-700">Databáze bible</span>
        {stav === 'ok' && (
          <span className={`ml-auto px-2.5 py-0.5 rounded-full font-black text-udaj ${ceka > 0 ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
            {ceka > 0 ? `${ceka} čeká na spuštění` : 'nic nečeká'}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void nacti(); }}
          className={`${stav === 'ok' ? '' : 'ml-auto '}btn-ghost btn-sm`}
        >
          Načíst znovu
        </button>
      </div>
      <p className="text-xs text-neutral-600 mt-1">
        Pivovarská bible má vlastní projekt Supabase (knihy, zpracování, náklady na AI). Migrace se pouštějí tady, zvlášť od appky.
      </p>

      {stav === 'nacitam' && <p className="text-xs text-neutral-600 mt-2">Načítám…</p>}
      {stav === 'bez-seznamu' && (
        <p className="text-xs text-neutral-600 mt-2">
          Seznam migrací bible (<code>migrace-bible.json</code>) není k dispozici — vznikne při dalším buildu.
        </p>
      )}
      {stav === 'nenasazeno' && (
        <div className="mt-2 p-3 rounded bg-amber-100 text-amber-950 border border-amber-300 space-y-1">
          <p className="text-xs font-black">Bot ještě není v projektu bible nasazený.</p>
          <p className="text-xs lze-vybrat">{chybaText}</p>
          <p className="text-xs">
            Nasadí se sám po uložení GitHub secretu <code>SUPABASE_BIBLE_ACCESS_TOKEN</code> a dalším nasazení appky.
          </p>
        </div>
      )}
      {stav === 'chyba' && <p className="text-xs text-rose-900 mt-2 lze-vybrat">Nepovedlo se načíst: {chybaText}</p>}
      {stav === 'ok' && (
        <>
          {cekajici.length > 0 && (
            <div className="mt-2 p-3 rounded bg-amber-100 text-amber-950 border border-amber-300">
              <p className="text-xs font-black">Tyhle migrace bible ještě nikdo nespustil:</p>
              <ul className="mt-1 space-y-0.5">
                {cekajici.map((r) => (
                  <li key={r.nazev} className="text-xs font-bold lze-vybrat">{r.nazev}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => { void spustVse(); }}
                disabled={!!bezi}
                className="btn-primary mt-2"
              >
                {bezi ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                {bezi ? `Pouštím ${bezi}…` : cekajici.length === 1 ? 'Spustit tuhle migraci bible' : `Spustit všech ${cekajici.length} po řadě`}
              </button>
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
              <p className="text-xs font-black">V evidenci bible, ale ne v repozitáři (nejspíš přejmenovaný soubor):</p>
              <ul className="mt-1 space-y-0.5">
                {navic.map((n) => <li key={n} className="text-xs lze-vybrat">{n}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-neutral-600 mt-2">
            Celkem {radky.length} souborů: {radky.filter((r) => r.stav === 'aplikovano').length} aplikovaných, {ceka} čekajících.
          </p>
        </>
      )}
    </div>
  );
}
