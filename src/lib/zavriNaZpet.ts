import { useEffect, useRef } from 'react';

/**
 * ⬅️ Aby dialog zavřelo tlačítko Zpět (hardwarové na Androidu i v prohlížeči),
 * a ne aby odešlo z celé obrazovky i s rozepsanou prací.
 *
 * Tohle uměl jen společný `<Modal>` z `components/ui.tsx`. Jenže třináct
 * dialogů si kreslí `fixed inset-0` samo — kontrola objednávky z WhatsAppu,
 * audit objednávek, import z fotky, pohyby skladu, fotky u záznamu,
 * kalendář, historie — a v nich Zpět odešel ze stránky. Na telefonu je
 * Zpět nejpřirozenější způsob, jak něco zavřít, takže to nebyla kosmetika:
 * kdo v kontrole objednávky ťukl Zpět, přišel o rozepsané opravy.
 *
 * Chování je vytažené z `Modal` beze změny, včetně dvou věcí, které nejsou
 * vidět, ale jsou podstatné:
 *
 *  - Do historie se přidá krok se ZACHOVÁNÍM `page`/`subTab`, aby App.tsx
 *    při jeho odpopnutí nepřehodil stránku.
 *  - `history.back()` je asynchronní (popstate přijde až příští tick). Když
 *    se jeden dialog zavře a hned v témže renderu otevře další (potvrzení →
 *    checklist), zpožděný `back()` toho prvního by odpopnul historii AŽ PO
 *    tom, co si druhý pushnul svůj záznam — a jeho posluchač by ho tím
 *    zavřel. Proto se `back()` volá jen tehdy, když je na vrcholu historie
 *    pořád VLASTNÍ záznam (podle unikátního id).
 *
 * Použití:
 *
 * ```tsx
 * export function MujDialog({ open, onClose }) {
 *   useZavriNaZpet(open, onClose);
 *   if (!open) return null;
 *   return <div className="fixed inset-0 z-modal">…</div>;
 * }
 * ```
 *
 * Hook se musí volat PŘED `if (!open) return null` — jinak se mění počet
 * hooků mezi vykresleními a React na to spadne.
 */
export function useZavriNaZpet(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const modalId = Math.random().toString(36).slice(2);
    window.history.pushState({ ...window.history.state, modalOpen: true, modalId }, '');
    const onPopState = () => onCloseRef.current();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (window.history.state?.modalOpen && window.history.state?.modalId === modalId) {
        window.history.back();
      }
    };
  }, [open]);
}

/**
 * Escape zavírá a pod otevřeným dialogem se neroluje stránka.
 *
 * Druhá půlka toho, co `Modal` dělá navíc proti ručně nakresleným dialogům.
 * Bez zamčeného rolování se pod dialogem posouvá obsah, takže po zavření
 * kouká člověk jinam, než kde skončil.
 */
export function useZavriNaEscape(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const naKlavesu = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', naKlavesu);
    const puvodni = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', naKlavesu);
      document.body.style.overflow = puvodni;
    };
  }, [open]);
}

/** Obojí najednou — to, co dělá `<Modal>`, pro ručně nakreslený dialog. */
export function useChovaniDialogu(open: boolean, onClose: () => void): void {
  useZavriNaZpet(open, onClose);
  useZavriNaEscape(open, onClose);
}
