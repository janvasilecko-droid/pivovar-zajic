// 📅 Dnešek — co je dneska potřeba udělat, hned nahoře na Domů.
// ---------------------------------------------------------------------------
// Dlaždice jsou rychlé, když člověk ví, kam jde. Neřeknou ale, CO se má dnes
// dělat — to se dosud skládalo z několika obrazovek. Tenhle pruh odpoví na
// otázku „co dnes" jedním pohledem a každý řádek je zkratka na to místo.
//
// Dlaždicový launcher zůstává pod tím beze změny.
import { useEffect, useState } from 'react';
import { ChevronRight, ClipboardList, MessageCircle, Wine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { fetchPendingWhatsAppCount } from '../lib/whatsappApi';
import { requestOrdersAutoImport, requestOrdersOverdueFilter } from '../lib/ordersFilter';
import type { Page } from './Layout';

type Radek = {
  klic: string;
  pocet: number;
  popis: string;
  detail?: string;
  ikona: typeof ClipboardList;
  barva: string;
  kam: Page;
};

const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

export default function Dnesek({ setPage }: { setPage: (p: Page) => void }) {
  const [radky, setRadky] = useState<Radek[] | null>(null);
  const dnes = businessDateISO();

  useEffect(() => {
    let zruseno = false;

    (async () => {
      const out: Radek[] = [];

      // 1) Objednávky, které ještě nikdo nevyřídil a mají závoz dnes nebo dřív.
      try {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'nova')
          .lte('delivery_date', dnes);
        if (count) {
          out.push({
            klic: 'nevyrizene',
            pocet: count,
            popis: count === 1 ? 'nevyřízená objednávka po termínu' : 'nevyřízených objednávek po termínu',
            detail: 'závoz dnes nebo dřív',
            ikona: ClipboardList,
            barva: 'text-amber-700 bg-amber-50 border-amber-200',
            kam: 'orders',
          });
        }
      } catch { /* nevadí */ }

      // 2) Naplánované stáčení na dnešek.
      try {
        const { count } = await supabase
          .from('bottling_plans')
          .select('id', { count: 'exact', head: true })
          .eq('planned_date', dnes)
          .eq('status', 'planned');
        if (count) {
          out.push({
            klic: 'staceni',
            pocet: count,
            popis: count === 1 ? 'naplánované stáčení na dnešek' : 'naplánovaná stáčení na dnešek',
            ikona: Wine,
            barva: 'text-emerald-700 bg-emerald-50 border-emerald-200',
            kam: 'bottling_needs',
          });
        }
      } catch { /* nevadí */ }

      // 3) WhatsApp objednávky čekající na kontrolu.
      try {
        const cekajici = await fetchPendingWhatsAppCount();
        if (cekajici) {
          out.push({
            klic: 'whatsapp',
            pocet: cekajici,
            popis: cekajici === 1 ? 'zpráva z WhatsAppu ke kontrole' : 'zpráv z WhatsAppu ke kontrole',
            ikona: MessageCircle,
            barva: 'text-emerald-700 bg-emerald-50 border-emerald-200',
            kam: 'orders',
          });
        }
      } catch { /* nevadí */ }

      if (!zruseno) setRadky(out);
    })();

    return () => { zruseno = true; };
  }, [dnes]);

  const datum = new Date(dnes + 'T00:00:00Z');
  const nadpis = `${DNY[datum.getUTCDay()]} ${datum.getUTCDate()}. ${datum.getUTCMonth() + 1}.`;

  // Když není co hlásit, sekce se radši úplně schová, než aby zabírala místo
  // hláškou „Nic nečeká" — Dnešek má být aktivní jen tehdy, když je opravdu
  // na co upozornit.
  if (radky !== null && radky.length === 0) return null;

  return (
    <section className="card p-4 sm:p-5" aria-label="Dnešek">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-extrabold text-lg text-neutral-900">Dnešek</h2>
        <span className="text-sm font-bold text-neutral-500 first-letter:uppercase">{nadpis}</span>
      </div>

      {radky === null ? (
        // Kostra místo kolečka — je z ní vidět, co se za chvíli objeví,
        // a stránka pod tím neposkočí, až se data načtou.
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-[60px] rounded-xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {radky.map((r) => {
            const Ikona = r.ikona;
            return (
              <button
                key={r.klic}
                onClick={() => {
                  // „X zpráv z WhatsAppu ke kontrole" má otevřít rovnou okno
                  // s objednávkami ke kontrole — dosud jen přepnulo na
                  // Objednávky a člověk skončil u obyčejného seznamu.
                  if (r.klic === 'whatsapp') requestOrdersAutoImport();
                  if (r.klic === 'nevyrizene') requestOrdersOverdueFilter();
                  setPage(r.kam);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-neutral-200/80 bg-white hover:bg-neutral-50 active:scale-[0.99] transition text-left min-h-[60px]"
              >
                <span className={`w-11 h-11 shrink-0 grid place-items-center rounded-xl border ${r.barva}`}>
                  <Ikona className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-display font-extrabold text-xl text-neutral-900 tabular-nums mr-1.5">{r.pocet}</span>
                  <span className="font-semibold text-sm text-neutral-700">{r.popis}</span>
                  {r.detail && <span className="block text-xs text-neutral-500 font-medium mt-0.5">{r.detail}</span>}
                </span>
                <ChevronRight className="w-5 h-5 text-neutral-400 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
