// 🛢️ U obalu malého sudu ve formuláři objednávky: kolik jich ještě můžeš dát
// a co je navíc (červeně). Z provozu 29. 9. 2026: „v objednávce Maneo chci
// vidět, na kolik sudů mě to pustí, na co není sud, udělej červeně".
// Počet volných počítá lib/maleSudy.ts (volneProObjednavku).

export function MaleSudyVolne({ volne, zadano }: {
  /** Kolik smí tahle objednávka celkem (null = obal se nehlídá). */
  volne: number | null;
  /** Kolik je v objednávce zadáno (všechna piva v tomhle obalu). */
  zadano: number;
}) {
  if (volne == null) return null;
  const smi = Math.max(0, volne);
  const nad = zadano - smi;
  if (nad > 0) {
    return (
      <div className="w-full text-xs font-black text-rose-800 bg-rose-50 border border-rose-300 rounded px-2 py-1" role="alert">
        Malé sudy: můžeš dát max {smi} — {nad} ks nemá sud
      </div>
    );
  }
  if (smi === 0) {
    // Nic zadáno, ale volný sud už žádný — ať se to ví dřív, než se klikne.
    return <div className="w-full text-xs font-bold text-amber-800">Malé sudy: žádný volný</div>;
  }
  return (
    <div className="w-full text-xs font-bold text-emerald-800">
      Malé sudy: můžeš dát max {smi}{zadano > 0 ? ` (zbývá ${smi - zadano})` : ''}
    </div>
  );
}

// Řádek objednávky podle přidělených malých sudů (lib/maleSudy.ts) — jen
// u malých sudů 20/15/10 l, zbytek objednávky beze změny (29. 9. 2026):
// sudy jsou → zelený řádek, jen část → oranžový s „−N×", žádný → červený
// s nápisem „nejsou sudy".
export function tridaRadkuSudu(p: { kryto: number; chybi: number } | undefined, obycejna: string): string {
  if (!p) return obycejna;
  if (p.chybi <= 0) return 'bg-emerald-50 border-emerald-400';
  return p.kryto > 0 ? 'bg-amber-100 border-amber-500' : 'bg-rose-50 border-rose-400';
}

export function MaleSudyRadek({ prideleni, obal }: { prideleni: { kryto: number; chybi: number } | undefined; obal: string }) {
  if (!prideleni || prideleni.chybi <= 0) return null;
  if (prideleni.kryto > 0) {
    return (
      <div className="w-full text-xs font-black text-amber-900">
        −{prideleni.chybi}× {obal} — sudy jen na {prideleni.kryto}
      </div>
    );
  }
  return (
    <div className="w-full text-xs font-black text-rose-800" role="alert">
      Nejsou sudy ({prideleni.chybi}× {obal})
    </div>
  );
}
