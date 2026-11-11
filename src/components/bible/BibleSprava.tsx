// ⚙️ Správa znalostí Pivovarské bible — tematické oblasti A–T, kdo má
// přístup, kapacita databáze a úložiště, rešerše z internetu, AI (Claude)
// a náklady.
// ---------------------------------------------------------------------------
// Kapacitu PROJEKTU BIBLE (samostatný Supabase Free, R12: vlastní 500 MB
// databáze a 1 GB úložiště) vrací bible_kapacita() přes bible-api jen
// správcům knihovny. Tarif z ní poznat nejde — limity Free jsou pro srovnání.
import { ClaudeKonektorPanel } from './ClaudeKonektorPanel';
import { BibleWebZdroje } from './BibleWebZdroje';
import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import { velikostText } from '../../lib/bibleKnihovna';
import {
  nactiDokumenty, nactiKapacitu, nactiNakladyMesice, nactiNastaveni,
  type BibleDokument, type Kapacita, type NakladyMesice,
} from '../../lib/bibleKnihovnaApi';
import { nastavStrop } from '../../lib/bibleChatApi';
import { uspech } from '../../lib/toast';

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

/** Kredit Claude API (AI sládek se platí z něj). */
export const ODKAZ_KREDITU = 'https://platform.claude.com/settings/billing';

function NakladyPanel() {
  const [naklady, setNaklady] = useState<{ naklady: NakladyMesice } | { chyba: string; bezMigrace: boolean } | null>(null);
  const [nastaveni, setNastaveni] = useState<Record<string, unknown> | null>(null);
  const [novyStrop, setNovyStrop] = useState('');
  const [uklada, setUklada] = useState(false);
  const [chybaStropu, setChybaStropu] = useState<string | null>(null);
  useEffect(() => {
    void nactiNakladyMesice().then(setNaklady);
    void nactiNastaveni().then((n) => {
      setNastaveni(n);
      const s = Number(n?.strop_mesic_usd ?? NaN);
      if (Number.isFinite(s)) setNovyStrop(String(s));
    });
  }, []);
  const strop = Number(nastaveni?.strop_mesic_usd ?? NaN);

  async function ulozStrop(e: React.FormEvent) {
    e.preventDefault();
    const usdHodnota = Number(novyStrop.replace(',', '.'));
    if (!novyStrop.trim() || !Number.isFinite(usdHodnota) || usdHodnota < 0 || usdHodnota > 1000) { setChybaStropu('Strop je 0 až 1000 USD za měsíc.'); return; }
    setUklada(true);
    setChybaStropu(null);
    const r = await nastavStrop(usdHodnota);
    setUklada(false);
    if (r.stav !== 'ok') { setChybaStropu(r.zprava); return; }
    setNastaveni((n) => ({ ...(n ?? {}), strop_mesic_usd: r.data }));
    uspech(r.data > 0 ? `Měsíční strop útraty za AI: ${usd(r.data)}.` : 'AI sládek je vypnutý (strop 0 USD).');
  }

  return (
    <div className="space-y-2 text-sm">
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
      <form className="flex flex-wrap items-end gap-2 pt-1" onSubmit={(e) => void ulozStrop(e)} aria-label="Útrata za AI">
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300" htmlFor="bible-strop">
          <span className="block">Měsíční strop útraty za AI (USD)</span>
          <input id="bible-strop" className="input w-32 normal-case" type="number" min={0} max={1000} step="any" inputMode="decimal"
            value={novyStrop} onChange={(e) => setNovyStrop(e.target.value)} />
        </label>
        <button type="submit" className="btn-tmave" disabled={uklada || !nastaveni}>{uklada ? 'Ukládám…' : 'Uložit strop'}</button>
      </form>
      {chybaStropu && <div role="alert" className="text-xs font-bold text-rose-300">{chybaStropu}</div>}
      <p className="text-xs text-neutral-300">
        0 = AI sládek vypnutý. Nad stropem appka další otázku odmítne a řekne proč. Kredit Claude API:{' '}
        <a className="font-bold text-amber-300 underline" href={ODKAZ_KREDITU} target="_blank" rel="noopener noreferrer">platform.claude.com</a>
      </p>
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

      <ClaudeKonektorPanel />

      {/* Etapa 9 (architektura § 11: Správa znalostí → rešerše z internetu). */}
      <BibleWebZdroje role={role} />

      <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-2">
        <h2 className="font-black">AI a náklady</h2>
        {/* 3. 11. 2026 majitel: „žádný kredit… nebudu platit kredity" — zpracování knih jede přes předplatné.
            11. 11. 2026: „má to být chatbot" — chatbot v appce musí přes API (R14, R28), proto strop. */}
        <p className="text-sm text-neutral-200">
          Knihy zpracovává Claude přes tvoje předplatné Claude (Max): přepis skenů (Haiku 5.5), překlad do češtiny (Sonnet 5.5),
          zařazení do oblastí a přehledy témat (Opus 5.5). Tady se nic nedoplácí — přes předplatné je cena 0, zapisují se jen počty tokenů.
        </p>
        <p className="text-sm text-neutral-200">
          AI sládek (chatbot v appce) volá Claude API klíčem z app_secrets — to se platí z kreditu Anthropicu, řádově desetníky dolaru
          za odpověď. Předplatné na dotazy z appky použít nejde (pravidla Anthropicu). Útratu hlídá měsíční strop. Zdarma přes předplatné
          se dá ptát v aplikaci Claude přes konektor výš.
        </p>
        {smiSpravovat(role) && <NakladyPanel />}
      </section>
    </div>
  );
}
