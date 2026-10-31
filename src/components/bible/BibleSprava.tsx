// ⚙️ Správa znalostí Pivovarské bible — tematické oblasti A–T, kdo má
// přístup, kapacita databáze a úložiště, AI (Claude) a náklady.
// ---------------------------------------------------------------------------
// Kapacitu PROJEKTU BIBLE (samostatný Supabase Free, R12: vlastní 500 MB
// databáze a 1 GB úložiště) vrací bible_kapacita() přes bible-api jen
// správcům knihovny. Tarif z ní poznat nejde — limity Free jsou pro srovnání.
import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import { velikostText } from '../../lib/bibleKnihovna';
import {
  nactiDokumenty, nactiKapacitu, nactiNakladyMesice, nactiNastaveni,
  type BibleDokument, type Kapacita, type NakladyMesice,
} from '../../lib/bibleKnihovnaApi';

const FREE_DB = 500 * 1024 * 1024;
/** Ruční spuštění zpracování knih (GitHub Actions → Run workflow). */
export const ODKAZ_ZPRACOVANI = 'https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/bible-zpracovani.yml';
const FREE_ULOZISTE = 1024 * 1024 * 1024;

function Pruh({ nazev, bajtu, limit }: { nazev: string; bajtu: number; limit: number }) {
  const procent = Math.min(100, Math.round((bajtu / limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-bold">{nazev}</span>
        <span className="tabular-nums text-neutral-200">{velikostText(bajtu)} z {velikostText(limit)} (Free)</span>
      </div>
      <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden" role="img" aria-label={`${nazev}: ${procent} % limitu tarifu Free`}>
        <div className={`h-full ${procent >= 85 ? 'bg-rose-500' : procent >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${procent}%` }} />
      </div>
    </div>
  );
}

function KapacitaPanel() {
  const [stav, setStav] = useState<{ kapacita: Kapacita } | { chyba: string; bezMigrace: boolean } | null>(null);
  useEffect(() => { void nactiKapacitu().then(setStav); }, []);

  if (stav === null) return <div className="text-sm text-neutral-300">Zjišťuji kapacitu…</div>;
  if ('chyba' in stav) {
    return <div className="text-sm font-bold text-rose-300">{stav.bezMigrace ? 'Kapacitu ukáže až migrace databáze bible (Systém → Databázové migrace → Databáze bible).' : stav.chyba}</div>;
  }
  const k = stav.kapacita;
  const ulozisteCelkem = Object.values(k.uloziste).reduce((s, b) => s + b.bajtu, 0);
  const vektory = k.rozsireni.vector;
  return (
    <div className="space-y-3">
      <Pruh nazev="Databáze" bajtu={k.db_bajtu} limit={FREE_DB} />
      <Pruh nazev="Úložiště souborů" bajtu={ulozisteCelkem} limit={FREE_ULOZISTE} />
      <ul className="text-xs text-neutral-300 space-y-0.5">
        <li>Knihovna: {k.knihovna.dokumentu} dokumentů, {velikostText(k.knihovna.bajtu)}</li>
        <li>PostgreSQL {k.postgres}</li>
        <li>
          Vektorové hledání (pgvector): {vektory?.zapnuta ? `zapnuté, verze ${vektory.zapnuta}` : vektory?.dostupna ? `dostupné (verze ${vektory.dostupna}), zatím nezapnuté` : 'v projektu není'}
        </li>
        <li>Fulltext: {k.fulltext.join(', ') || '—'}</li>
      </ul>
    </div>
  );
}

const usd = (n: number) => `${n.toFixed(n < 1 ? 3 : 2).replace('.', ',')} USD`;

function NakladyPanel() {
  const [naklady, setNaklady] = useState<{ naklady: NakladyMesice } | { chyba: string; bezMigrace: boolean } | null>(null);
  const [nastaveni, setNastaveni] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void nactiNakladyMesice().then(setNaklady);
    void nactiNastaveni().then(setNastaveni);
  }, []);
  const strop = Number(nastaveni?.strop_mesic_usd ?? NaN);
  return (
    <div className="space-y-1 text-sm">
      {naklady === null ? (
        <div className="text-neutral-300">Načítám útratu…</div>
      ) : 'chyba' in naklady ? (
        <div className="text-neutral-200">{naklady.bezMigrace ? 'Evidence nákladů začne po migraci databáze bible (Systém → Databázové migrace → Databáze bible).' : naklady.chyba}</div>
      ) : (
        <div className="font-bold text-neutral-100">
          Tento měsíc: {usd(naklady.naklady.usd)} za {naklady.naklady.volani} volání{Number.isFinite(strop) ? ` (strop ${usd(strop)})` : ''}
        </div>
      )}
      {nastaveni && (
        <ul className="text-xs text-neutral-300 space-y-0.5">
          <li>Odpovědi: {String(nastaveni.model_odpovedi ?? '—')}</li>
          <li>Přepis skenů: {String(nastaveni.model_ocr ?? '—')}</li>
        </ul>
      )}
    </div>
  );
}

export function BibleSprava({ role, setPage }: {
  role: BibleRole;
  setPage?: (p: any, sec?: string, sub?: string) => void;
}) {
  const [dokumenty, setDokumenty] = useState<BibleDokument[] | null>(null);
  useEffect(() => {
    void nactiDokumenty().then((n) => setDokumenty(n.stav === 'ok' ? n.dokumenty : []));
  }, []);
  const pocetVOblasti = (kod: string) => (dokumenty ?? []).filter((d) => d.oblasti.includes(kod)).length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-2">
        <h2 className="flex items-center gap-2 font-black"><ShieldCheck size={18} className="text-amber-400" /> Kdo má přístup</h2>
        <p className="text-sm text-neutral-200">
          Knihovna je soukromá. Číst a spravovat ji smí admin, šéf, sládek a manažer. Ostatním ji povolí admin v Uživatelé → Práva → „Pivovarská bible": vidět = číst, upravovat = i nahrávat knihy.
        </p>
        <p className="text-sm text-neutral-200">Tvoje role v knihovně: <strong>{role === 'spravuje' ? 'správce' : role === 'prispiva' ? 'čte a nahrává' : 'čte'}</strong>.</p>
        {smiSpravovat(role) && setPage && (
          <button type="button" className="btn-tmave" onClick={() => setPage('users')}>Otevřít Uživatelé → Práva</button>
        )}
      </section>

      {smiSpravovat(role) && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-3">
          <h2 className="font-black">Kapacita projektu bible</h2>
          <p className="text-xs text-neutral-300">Bible má vlastní projekt Supabase — knihy neubírají místo appce pivovaru.</p>
          <KapacitaPanel />
        </section>
      )}

      <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-3">
        <h2 className="font-black">Tematické oblasti</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {BIBLE_OBLASTI.map((o) => (
            <li key={o.kod} className="flex justify-between gap-2 border-b border-neutral-800 py-1">
              <span><strong className="text-amber-300">{o.kod}</strong> {o.nazev}</span>
              <span className="tabular-nums text-neutral-200">{dokumenty === null ? '…' : pocetVOblasti(o.kod)}</span>
            </li>
          ))}
        </ul>
      </section>

      {smiSpravovat(role) && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-2">
          <h2 className="font-black">Zpracování knih</h2>
          <p className="text-sm text-neutral-200">
            Nahrané knihy zpracuje server sám (zhruba každé tři hodiny, GitHub ho občas zdrží). Hned se dá spustit na GitHubu: otevři odkaz a klepni „Run workflow".
          </p>
          <a className="btn-tmave" href={ODKAZ_ZPRACOVANI} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Spustit zpracování
          </a>
        </section>
      )}

      <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-2">
        <h2 className="font-black">AI a náklady</h2>
        <p className="text-sm text-neutral-200">
          Odpovídat bude Claude (Anthropic) — Opus 5.5, levnější Sonnet 5.5 jde přepnout. Skeny knih přepíše Claude Haiku 5.5. Každé volání se zapíše s počtem tokenů a cenou a hlídá ho měsíční strop.
        </p>
        {smiSpravovat(role) && <NakladyPanel />}
        <a className="btn-tmave" href="https://platform.claude.com/settings/billing" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Kredit Anthropic API
        </a>
      </section>
    </div>
  );
}
