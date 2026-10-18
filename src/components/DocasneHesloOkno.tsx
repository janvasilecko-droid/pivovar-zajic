import { Copy, KeyRound, Mail } from 'lucide-react';
import { Modal } from './ui';
import { mailtoPozvanky, textSHeslem } from '../lib/pozvanka';
import { chyba, uspech } from '../lib/toast';

// 🔑 Dočasné heslo nově schváleného (nebo znovu nastaveného) uživatele.
// Dřív se heslo ukázalo jen v hlášce, která zmizela — kdo si ho nestihl opsat,
// nemohl se přihlásit (pojmmy86@gmail.com, 18. 10. 2026). Okno zůstane, dokud
// ho admin nezavře, a heslo jde zkopírovat i s odkazem a návodem.
export function DocasneHesloOkno({ email, heslo, onClose }: { email: string; heslo: string; onClose: () => void }) {
  async function kopiruj(text: string, hotovo: string) {
    try {
      await navigator.clipboard.writeText(text);
      uspech(hotovo);
    } catch {
      chyba('Zkopírovat se nepodařilo — opiš heslo ručně.');
    }
  }

  return (
    <Modal open onClose={onClose} title="Dočasné heslo pro první přihlášení">
      <div className="space-y-4 text-sm text-neutral-800">
        <p>Uživatel <strong>{email}</strong> se přihlásí tímto e-mailem a heslem. Hned potom si založí vlastní heslo.</p>
        <div className="rounded border-2 border-amber-300 bg-amber-50 p-4 text-center">
          <div className="text-udaj font-black uppercase tracking-wider text-amber-800 flex items-center justify-center gap-1"><KeyRound size={14} /> Dočasné heslo</div>
          <div className="mt-1 font-mono text-2xl font-black tracking-wider select-all" data-testid="docasne-heslo">{heslo}</div>
        </div>
        <p className="text-xs text-neutral-500">Heslo se v aplikaci znovu nezobrazí. Kdyby se ztratilo, v Uživatelích u něj klepni na „Nové dočasné heslo“.</p>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary !rounded w-full text-sm font-black flex items-center justify-center gap-2" onClick={() => kopiruj(textSHeslem(email, heslo), 'Zpráva s heslem je zkopírovaná — vlož ji do WhatsAppu.')}>
            <Copy size={16} /> Kopírovat zprávu s heslem (WhatsApp)
          </button>
          <button type="button" className="btn-ghost !rounded w-full text-sm font-black flex items-center justify-center gap-2" onClick={() => kopiruj(heslo, 'Heslo je zkopírované.')}>
            <Copy size={16} /> Kopírovat jen heslo
          </button>
          <a href={mailtoPozvanky(email)} className="btn-ghost !rounded w-full text-sm font-black flex items-center justify-center gap-2">
            <Mail size={16} /> Pozvánka e-mailem (bez hesla)
          </a>
        </div>
        <div className="flex justify-end">
          <button type="button" className="btn-ghost !rounded text-xs font-bold" onClick={onClose}>Zavřít</button>
        </div>
      </div>
    </Modal>
  );
}
