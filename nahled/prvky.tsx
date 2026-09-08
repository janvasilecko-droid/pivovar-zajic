// 🎨 PŘEHLED PRVKŮ — všechno, z čeho je aplikace složená, na jedné stránce.
//
// K čemu to je: ladit vzhled po jednotlivých obrazovkách znamená projít
// jednačtyřicet obrazovek a stejně přehlédnout stav, který se běžně
// nezobrazí (chyba, prázdno, načítání). Tady stojí role tlačítek, štítky,
// karty, pole, tabulka, kostra i prázdné stavy vedle sebe — takže je na
// první pohled vidět, co se rozchází.
//
// Zároveň je to podklad pro vizuální regresi: `node scripts/snimky.mjs`
// tuhle stránku vyfotí ve třech šířkách a v obou režimech a porovná
// s minulým stavem.
//
// NENÍ SOUČÁSTÍ APLIKACE — produkční build bere index.html v kořeni.
//   npx vite --config vite.nahled.config.ts   →   /prvky.html
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Kostra, EmptyState, Modal, Stat, Field, UkazatelPlnosti } from '../src/components/ui';
import { TabBar } from '../src/components/TabBar';
import { IkonaSud, IkonaLahev } from '../src/components/ikony';
import { Beer, Boxes, ClipboardList, Truck } from 'lucide-react';

function Sekce({ nazev, popis, children }: { nazev: string; popis?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h2 className="text-podtitul font-display font-black text-neutral-900">{nazev}</h2>
        {popis && <p className="text-popisek text-neutral-500 font-semibold">{popis}</p>}
      </div>
      <div className="card p-3.5 space-y-3">{children}</div>
    </section>
  );
}

/** Stavy objednávky — kopie tabulky z Orders.tsx, ať je vidět odstupňování. */
const STAVY = [
  { label: 'Nová', cls: 'bg-primary-50 text-primary-700 border-primary-200', znak: '•' },
  { label: 'Připravená', cls: 'bg-amber-50 text-amber-800 border-amber-200', znak: '◐' },
  { label: 'Expedovaná', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', znak: '↑' },
  { label: 'Zavezeno', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', znak: '✓' },
  { label: 'Vyřízeno', cls: 'bg-emerald-200 text-emerald-950 border-emerald-300', znak: '✓✓' },
  { label: 'Storno', cls: 'bg-rose-50 text-rose-700 border-rose-200', znak: '✕' },
];

const ZALOZKY = [
  { id: 'a', label: 'Objednávky', icon: ClipboardList, color: '#38d9a9', badge: 7 },
  { id: 'b', label: 'Přehled', icon: Boxes, color: '#4dabf7' },
  { id: 'c', label: 'Závoz', icon: Truck, color: '#ffa94d' },
];

function Prvky() {
  const [tmavy, setTmavy] = useState(false);
  const [zalozka, setZalozka] = useState('a');
  const [otevreno, setOtevreno] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tmavy);
    document.documentElement.dataset.theme = tmavy ? 'dark' : 'light';
  }, [tmavy]);

  return (
    <div className="min-h-screen bg-neutral-50 p-3 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-titul font-display font-black text-neutral-900">Přehled prvků</h1>
          <p className="text-popisek text-neutral-500 font-semibold">
            Z čeho je aplikace složená. Není to obrazovka appky — je to vzorník.
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setTmavy((t) => !t)}>
          {tmavy ? '☀️ Světlý režim' : '🌙 Tmavý režim'}
        </button>
      </header>

      <Sekce nazev="Tlačítka" popis="Pět rolí. Kdo potřebuje jinou barvu, má sáhnout po jiné ROLI, ne malovat vlastní.">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">Hlavní akce</button>
          <button className="btn-amber">Uložit</button>
          <button className="btn-emerald">Hotovo</button>
          <button className="btn-secondary">Zrušit</button>
          <button className="btn-ghost">Vedlejší</button>
          <button className="btn-danger">Smazat</button>
          <button className="btn-primary btn-sm">Malé</button>
          <button className="btn-pocet">−</button>
          <button className="btn-pocet">+</button>
          <button className="btn-primary" disabled>Nedostupné</button>
        </div>
      </Sekce>

      <Sekce nazev="Stavy objednávky" popis="Barva i tvar — aby se stav přečetl i bez rozlišování barev.">
        <div className="flex flex-wrap gap-2">
          {STAVY.map((s) => (
            <span key={s.label} className={`chip ${s.cls}`}>
              <span aria-hidden="true" className="font-black">{s.znak}</span>{s.label}
            </span>
          ))}
        </div>
      </Sekce>

      <Sekce nazev="Štítky a odznaky">
        <div className="flex flex-wrap gap-2">
          <span className="chip badge-amber">Jantar</span>
          <span className="chip badge-emerald">Sedí</span>
          <span className="chip badge-rose">Chybí 12</span>
          <span className="chip badge-slate">Bez změny</span>
        </div>
      </Sekce>

      <Sekce nazev="Písmo" popis="Pět rolí místo náhodných velikostí.">
        <div className="space-y-1">
          <p className="text-titul font-display font-black text-neutral-900">Titul — nadpis obrazovky</p>
          <p className="text-podtitul font-display font-bold text-neutral-900">Podtitul — nadpis karty</p>
          <p className="text-text text-neutral-800">Text — běžný odstavec, kterým se něco vysvětluje.</p>
          <p className="text-popisek text-neutral-600 font-semibold">Popisek — vysvětlení pod údajem</p>
          <p className="text-udaj font-bold text-neutral-700 tabular-nums">Údaj — 1 234 ks · 12,5 hl</p>
        </div>
      </Sekce>

      <Sekce nazev="Pole">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Odběratel"><input className="input" placeholder="Hospoda U Zajíce" /></Field>
          <Field label="Počet kusů" hint="Číselná klávesnice na telefonu">
            <input className="input" type="number" inputMode="numeric" placeholder="0" />
          </Field>
          <Field label="Obal">
            <select className="input"><option>KEG 50 l</option><option>Lahev 0,5 l</option></select>
          </Field>
          <Field label="Poznámka"><textarea className="input" rows={2} placeholder="…" /></Field>
        </div>
      </Sekce>

      <Sekce nazev="Číselné dlaždice">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Stočeno" value="1 240" icon={IkonaSud} tone="amber" />
          <Stat label="Lahve" value="3 480" icon={IkonaLahev} tone="primary" />
          <Stat label="Objednávky" value="17" icon={ClipboardList} tone="success" />
          <Stat label="Chybí" value="12" icon={Beer} tone="danger" />
        </div>
        <div className="pruh-cisel">
          <div><div className="cislo">42</div><div className="nazev">Sudy</div></div>
          <div><div className="cislo">18</div><div className="nazev">Lahve</div></div>
          <div><div className="cislo">3</div><div className="nazev">Odpis</div></div>
        </div>
      </Sekce>

      <Sekce nazev="Tabulka" popis="Zebra, přilepená hlavička, tabulární číslice.">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Pivo</th>
                <th scope="col">Obal</th>
                <th scope="col" className="text-right">Ks</th>
              </tr>
            </thead>
            <tbody>
              {[['12° Světlý ležák', 'KEG 50 l', 20], ['12° Světlý ležák', 'Lahev 0,5 l', 342],
                ['11° Světlá', 'KEG 30 l', 11], ['10° Desítka', 'KEG 50 l', 8]].map((r) => (
                <tr key={String(r[0]) + r[1]}>
                  <td className="font-bold">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td className="text-right font-black">{r[2]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}>Celkem</td><td className="text-right">381</td></tr></tfoot>
          </table>
        </div>
      </Sekce>

      <Sekce nazev="Záložky" popis="Nejčastěji tisknutá věc v aplikaci — cíl 44 px na telefonu.">
        <TabBar items={ZALOZKY} activeId={zalozka} onSelect={setZalozka} />
      </Sekce>

      <Sekce nazev="Plnost tanku" popis="Barva nese stav, ale slovo pod ní taky.">
        <UkazatelPlnosti zbyvaLitru={820} kapacitaLitru={1000} />
        <UkazatelPlnosti zbyvaLitru={310} kapacitaLitru={1000} />
        <UkazatelPlnosti zbyvaLitru={40} kapacitaLitru={1000} />
      </Sekce>

      <Sekce nazev="Načítání a prázdno" popis="Tři stavy, které se běžně nezobrazí naráz — a nejčastěji se rozejdou.">
        <Kostra radku={2} />
        <EmptyState text="Zatím žádné stočení do sudů." icon={IkonaSud} akce={{ popis: 'Zapsat stočení', onClick: () => {} }} />
        <EmptyState varianta="chyba" text="Stáčení se nepodařilo načíst: Failed to fetch" akce={{ popis: 'Zkusit znovu', onClick: () => {} }} />
      </Sekce>

      <Sekce nazev="Dialog">
        <button className="btn-primary" onClick={() => setOtevreno(true)}>Otevřít dialog</button>
        <Modal open={otevreno} onClose={() => setOtevreno(false)} title="Opravdu smazat?">
          <p className="text-text text-neutral-700">
            Na telefonu je to spodní list, na počítači karta uprostřed. Zavírá ho Escape,
            klepnutí vedle i hardwarové tlačítko Zpět.
          </p>
          <div className="lista-akci mt-4">
            <button className="btn-secondary" onClick={() => setOtevreno(false)}>Zrušit</button>
            <button className="btn-danger" onClick={() => setOtevreno(false)}>Smazat</button>
          </div>
        </Modal>
      </Sekce>
    </div>
  );
}

createRoot(document.getElementById('prvky')!).render(<Prvky />);
