// 📋 Mřížka pro vložení dat zkopírovaných odjinud (Google Sheets, Excel).
// Vlož (Ctrl+V) do libovolné buňky — appka rozpozná víc řádků/sloupců
// najednou a vyplní mřížku od té buňky dál, přesně jako když se vkládá do
// tabulkového procesoru. Obecná komponenta bez appkové logiky — co se s daty
// stane po „Zpracovat", řeší volající (viz ImportStaceniLahviExcel.tsx).
import { useState } from 'react';
import { Spinner } from './ui';
import { Plus, Trash2 } from 'lucide-react';

type Props = {
  sloupce: string[];
  pocatecniRadky?: number;
  zpracovava?: boolean;
  onZpracovat: (radky: string[][]) => void;
};

function prazdnyRadek(pocetSloupcu: number): string[] {
  return new Array(pocetSloupcu).fill('');
}

export default function MrizkaVlozeniDat({ sloupce, pocatecniRadky = 15, zpracovava, onZpracovat }: Props) {
  const [data, setData] = useState<string[][]>(() =>
    Array.from({ length: pocatecniRadky }, () => prazdnyRadek(sloupce.length)),
  );

  function nastavBunku(r: number, c: number, hodnota: string) {
    setData((prev) => {
      const next = prev.map((radek) => [...radek]);
      next[r][c] = hodnota;
      return next;
    });
  }

  function vlozit(e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // jedna hodnota — necháme normální vložení
    e.preventDefault();
    const radkyTextu = text.replace(/\r/g, '').split('\n');
    // Kopírování z tabulky obvykle přidá prázdný řádek navíc na konec.
    if (radkyTextu.length > 1 && radkyTextu[radkyTextu.length - 1] === '') radkyTextu.pop();

    setData((prev) => {
      const next = prev.map((radek) => [...radek]);
      radkyTextu.forEach((radekTextu, ri) => {
        const bunky = radekTextu.split('\t');
        while (next.length <= r + ri) next.push(prazdnyRadek(sloupce.length));
        bunky.forEach((hodnota, ci) => {
          if (c + ci >= sloupce.length) return; // víc sloupců, než appka pro tenhle import čeká
          next[r + ri][c + ci] = hodnota;
        });
      });
      return next;
    });
  }

  function pridatRadky(pocet: number) {
    setData((prev) => [...prev, ...Array.from({ length: pocet }, () => prazdnyRadek(sloupce.length))]);
  }

  function vycistit() {
    setData(Array.from({ length: pocatecniRadky }, () => prazdnyRadek(sloupce.length)));
  }

  const maNejakaData = data.some((radek) => radek.some((bunka) => bunka.trim() !== ''));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-1 px-1 rounded-xl border border-neutral-200">
        <table className="border-collapse text-sm min-w-full">
          <thead>
            <tr>
              {sloupce.map((s) => (
                <th key={s} className="sticky top-0 bg-neutral-50 border-b border-neutral-200 px-2 py-1.5 text-left text-udaj font-black uppercase tracking-wider text-neutral-500 whitespace-nowrap">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((radek, r) => (
              <tr key={r} className="border-b border-neutral-100 last:border-0">
                {radek.map((bunka, c) => (
                  <td key={c} className="p-0">
                    <input
                      value={bunka}
                      onChange={(e) => nastavBunku(r, c, e.target.value)}
                      onPaste={(e) => vlozit(e, r, c)}
                      className="w-24 min-w-[5.5rem] px-2 py-1.5 border-0 focus:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 tabular-nums"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => pridatRadky(10)} className="btn-ghost !rounded-xl !py-2 !px-3 text-xs font-black flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Přidat 10 řádků
        </button>
        <button type="button" onClick={vycistit} className="btn-ghost !rounded-xl !py-2 !px-3 text-xs font-black text-neutral-500 flex items-center gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> Vyčistit
        </button>
        <button
          type="button"
          onClick={() => onZpracovat(data)}
          disabled={!maNejakaData || zpracovava}
          className="btn-primary !rounded-xl !py-2 !px-4 text-sm font-black disabled:opacity-40 flex items-center gap-2 ml-auto"
        >
          {zpracovava && <Spinner className="w-4 h-4" />}
          Zpracovat
        </button>
      </div>
    </div>
  );
}
