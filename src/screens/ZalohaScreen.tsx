// 💾 Stažení zálohy — samostatná obrazovka, jen admin.
// ---------------------------------------------------------------------------
// Dřív dlaždice „Stáhnout zálohu" otevírala celou obrazovku Uživatelé
// (seznam lidí, práva, schvalování e-mailů) a tlačítka zálohy byla jen
// přilepená nahoře — kdo chtěl jen zálohu, musel projít celou správu
// uživatelů. Zadání 24. 9. 2026: „proc sou uzivatele a prava v zaloze,
// to ma byt vlastni dlazdice jen pro admina." Teď je to opačně: vlastní
// obrazovka jen s tím, kvůli čemu se sem chodí.
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { isAdminEmail } from '../lib/config';
import { createFullBackup, downloadBackupJSON, downloadGoogleSheetsExcelBackup } from '../lib/backup';
import { chyba } from '../lib/toast';
import { Download, HardDriveDownload, Table } from 'lucide-react';

export default function ZalohaScreen() {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const [backingUp, setBackingUp] = useState<'json' | 'sheets' | null>(null);

  async function handleBackupJSON() {
    setBackingUp('json');
    try {
      const backup = await createFullBackup();
      downloadBackupJSON(backup);
    } catch (e: any) {
      chyba(`Chyba zálohování: ${e.message}`);
    } finally {
      setBackingUp(null);
    }
  }

  async function handleBackupGoogleSheets() {
    setBackingUp('sheets');
    try {
      const backup = await createFullBackup();
      downloadGoogleSheetsExcelBackup(backup);
    } catch (e: any) {
      chyba(`Chyba zálohování do Google Tabulek: ${e.message}`);
    } finally {
      setBackingUp(null);
    }
  }

  if (!isAdmin) return <div className="card p-6 text-center text-neutral-600">Stažení zálohy je dostupné pouze adminům.</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="card p-5 sm:p-6 space-y-4 bg-white border border-amber-200">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 grid place-items-center shrink-0">
            <HardDriveDownload size={20} className="text-amber-700" />
          </span>
          <div>
            <h1 className="font-display font-black text-lg text-neutral-900">Stáhnout zálohu</h1>
            <p className="text-xs text-neutral-500 font-semibold">Kopie všech dat pivovaru k sobě na počítač</p>
          </div>
        </div>
        <p className="text-sm text-neutral-700">
          Objednávky a stáčení se každý den samy zálohují — ale ta záloha jde do stejného místa jako kód aplikace.
          Tohle je jediná kopie, která je odsud pryč, takže ji stojí za to občas stáhnout a uložit jinam
          (na disk, do e-mailu, do cloudu).
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="btn-amber !rounded text-xs font-black shadow-md flex items-center gap-1.5"
            onClick={handleBackupGoogleSheets}
            disabled={backingUp !== null}
          >
            <Table size={16} className="text-emerald-800" />
            <span>{backingUp === 'sheets' ? 'Generuji…' : 'Týdenní záloha pro Google Tabulky (.xlsx)'}</span>
          </button>
          <button
            className="btn-ghost !rounded !bg-white border-amber-300 text-xs font-black shadow-xs flex items-center gap-1.5"
            onClick={handleBackupJSON}
            disabled={backingUp !== null}
          >
            <Download size={16} />
            <span>{backingUp === 'json' ? 'Zálohuji…' : 'JSON Záloha'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
