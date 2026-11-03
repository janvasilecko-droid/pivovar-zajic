// 🔌 Schválení připojení aplikace Claude ke knihovně (OAuth „Povolit").
// ---------------------------------------------------------------------------
// Aplikace Claude sem pošle majitele při přidání konektoru (adresa
// /claude-pripojeni?client_id=…&redirect_uri=…&code_challenge=…). Appka už
// ověřila přihlášení (bez něj je tu přihlašovací obrazovka); přístup do bible
// ověří brána v bible-api (fail-closed). Po „Povolit" se vrátí do Claude.
import { useState } from 'react';
import { BookOpen, Lock } from 'lucide-react';
import { adresaZamitnuti, povolitClaude, zadostZAdresy } from '../../lib/bibleClaudeApi';

export default function ClaudePripojeni() {
  const [zadost] = useState(() => zadostZAdresy(window.location.search));
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);

  async function povolit() {
    if (!zadost) return;
    setPracuje(true);
    setChyba(null);
    const r = await povolitClaude(zadost);
    if (r.ok) { window.location.assign(r.presmerovat); return; }
    setPracuje(false);
    setChyba(r.zprava);
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-4 text-neutral-100">
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">
          <BookOpen size={16} /> Pivovarská bible
        </div>
        {!zadost ? (
          <div role="alert" className="space-y-2">
            <h1 className="text-lg font-black">Neplatná žádost o připojení</h1>
            <p className="text-sm text-neutral-300">Tahle stránka se otevírá z aplikace Claude při přidání konektoru. Zkus konektor v Claude přidat znovu.</p>
            <a className="btn-tmave" href="/">Do appky</a>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-black">Připojit aplikaci Claude ke knihovně?</h1>
            <p className="text-sm text-neutral-200">
              Claude (tvůj účet) bude moct hledat v knihách Pivovarské bible, číst jejich stránky a přehledy témat a odpovídat s odkazy na knihy.
              Nic v knihovně nezmění ani nesmaže.
            </p>
            <p className="flex items-start gap-2 text-xs text-neutral-300">
              <Lock size={14} className="mt-0.5 shrink-0 text-amber-400" />
              Připojení jde kdykoli zrušit: Pivovarská bible → Správa znalostí → Aplikace Claude → Odpojit.
            </p>
            {chyba && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-amber" onClick={povolit} disabled={pracuje}>{pracuje ? 'Povoluji…' : 'Povolit'}</button>
              <button type="button" className="btn-tmave" onClick={() => window.location.assign(adresaZamitnuti(zadost))} disabled={pracuje}>Zamítnout</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
