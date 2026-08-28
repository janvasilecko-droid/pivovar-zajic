import { Save } from 'lucide-react';
import { Modal } from './ui';
import type { NavItem } from './Layout';

export function MenuCustomizeModal({
  open,
  permittedNav,
  hiddenModules,
  onSave,
  onClose,
}: {
  open: boolean;
  permittedNav: NavItem[];
  hiddenModules: string[];
  onSave: (hidden: string[]) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const [currentHidden, setCurrentHidden] = useState<string[]>(hiddenModules);

  function toggle(id: string) {
    if (currentHidden.includes(id)) {
      setCurrentHidden(currentHidden.filter((x) => x !== id));
    } else {
      setCurrentHidden([...currentHidden, id]);
    }
  }

  function resetAll() {
    setCurrentHidden([]);
  }

  function handleSave() {
    onSave(currentHidden);
    onClose();
  }

  return (
    <Modal open={true} onClose={onClose} title="👁️ Přizpůsobení osobního menu" wide>
      <div className="space-y-4">
        <div className="bg-amber-50 p-4 rounded border border-amber-200 text-xs text-amber-950 leading-relaxed">
          <strong>Osobní skrytí položek:</strong> Zde si můžete sami vypnout sekce, které v denním provozu nepoužíváte. Vaše přístupová práva od administrátora tím zůstanou nedotčena. Skryté sekce se nebudou zobrazovat v bočním menu ani v navigaci.
        </div>

        <div className="flex items-center justify-between px-1 text-xs font-extrabold text-neutral-700">
          <span>Dostupné sekce ({permittedNav.length})</span>
          <button
            type="button"
            onClick={resetAll}
            className="text-amber-700 hover:text-amber-900 underline font-bold"
          >
            Zobrazit všechny sekce
          </button>
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1 scrollbar-thin">
          {permittedNav.map((item) => {
            const Icon = item.icon;
            const isHidden = currentHidden.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`p-3.5 rounded border-2 transition-all flex items-center justify-between cursor-pointer select-none ${
                  isHidden
                    ? 'bg-neutral-100/80 border-neutral-200 opacity-60'
                    : 'bg-white border-amber-200/90 shadow-2xs hover:bg-amber-50/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded flex items-center justify-center ${
                    isHidden ? 'bg-neutral-200 text-neutral-500' : 'bg-amber-500 text-neutral-950 font-bold'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-neutral-900">{item.label}</div>
                    <div className="text-[11px] text-neutral-500">{item.group}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`chip text-xs font-black ${
                    isHidden ? 'bg-neutral-200 text-neutral-600' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isHidden ? '👁️‍🗨️ Skryto v menu' : '✓ Viditelné'}
                  </span>
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={() => {}}
                    className="w-5 h-5 accent-amber-500 pointer-events-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-neutral-200 pt-3 flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-neutral-500">
            Skryto: <strong className="text-neutral-900">{currentHidden.length}</strong> z {permittedNav.length}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
            <button type="button" className="btn-primary !rounded !py-2.5 !px-5 font-black" onClick={handleSave}>
              <Save className="ikona-text" /> Uložit mé nastavení
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
import { useState } from 'react';
