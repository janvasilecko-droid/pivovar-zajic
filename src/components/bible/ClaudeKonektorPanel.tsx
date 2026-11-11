// 🔌 Správa znalostí → Aplikace Claude: jak připojit konektor a kdo je připojený.
import { useEffect, useState } from 'react';
import { Bot, Copy } from 'lucide-react';
import { ADRESA_KONEKTORU, nactiPripojeni, odpojitClaude, type PripojeniClaude } from '../../lib/bibleClaudeApi';

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function ClaudeKonektorPanel() {
  const [stav, setStav] = useState<{ pripojeni: PripojeniClaude[]; migrace: boolean } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zkopirovano, setZkopirovano] = useState(false);

  async function nacti() {
    const r = await nactiPripojeni();
    if (r.ok) { setStav({ pripojeni: r.pripojeni, migrace: r.migrace }); setChyba(null); } else setChyba(r.zprava);
  }
  useEffect(() => { void nacti(); }, []);

  async function odpoj(id: string | null) {
    const r = await odpojitClaude(id);
    if (!r.ok) { setChyba(r.zprava); return; }
    await nacti();
  }

  async function kopiruj() {
    try {
      await navigator.clipboard.writeText(ADRESA_KONEKTORU);
      setZkopirovano(true);
    } catch {
      setZkopirovano(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-3" aria-label="Aplikace Claude">
      <h2 className="flex items-center gap-2 font-black"><Bot size={18} className="text-amber-400" /> Aplikace Claude</h2>
      <p className="text-sm text-neutral-200">
        Připoj knihovnu ke své aplikaci Claude (mobil i počítač, v rámci tvého předplatného). Pak se zeptáš třeba „napiš to nejlepší o chmelovaru
        z mých knih" a Claude sám prohledá knihy, přečte stránky a odpoví s odkazy na knihu a stranu. Umí taky počítat (výpočty z laboratoře),
        číst profil pivovaru, porovnat várky, uložit zdroj z webu (vždy jako neověřený) a zapsat zjištění k problému — co zapíše, je v appce označené „Claude (konektor)".
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-200">
        <li>Na <a className="font-bold text-amber-300 underline" href="https://claude.ai/settings/connectors" target="_blank" rel="noopener noreferrer">claude.ai → Nastavení → Konektory</a> klikni „Přidat vlastní konektor".</li>
        <li>Název: Pivovarská bible. Adresa: tahle (tlačítko ji zkopíruje):</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-neutral-950 px-2 py-1 text-xs text-amber-100 lze-vybrat">{ADRESA_KONEKTORU}</code>
        <button type="button" className="btn-tmave" onClick={kopiruj}><Copy size={16} /> {zkopirovano ? 'Zkopírováno' : 'Kopírovat'}</button>
      </div>
      <ol start={3} className="list-decimal space-y-1 pl-5 text-sm text-neutral-200">
        <li>Klikni „Připojit" — otevře se appka pivovaru, potvrď „Povolit".</li>
        <li>V Claude v chatu zapni konektor Pivovarská bible (ikona nástrojů) a ptej se.</li>
      </ol>
      {chyba && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      {stav && !stav.migrace && <p className="text-sm text-amber-200">Konektor čeká na migraci databáze bible 20261103030000_bible_mcp (Systém → Databázové migrace → Databáze bible).</p>}
      {stav && stav.migrace && (
        stav.pripojeni.length === 0 ? (
          <p className="text-sm text-neutral-300">Zatím není připojená žádná aplikace Claude.</p>
        ) : (
          <div className="space-y-2">
            <div className="text-sm font-bold">Připojeno:</div>
            <ul className="space-y-2">
              {stav.pripojeni.map((p) => (
                <li key={p.pripojeni} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-700 p-2 text-sm">
                  <span>{p.klient ?? 'Claude'} · od {datum(p.od)} · naposled {datum(p.naposled)}</span>
                  <button type="button" className="btn-tmave" onClick={() => odpoj(p.pripojeni)}>Odpojit</button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </section>
  );
}
