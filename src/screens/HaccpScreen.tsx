import { useState, useEffect } from 'react';
import { AlertTriangle, Ambulance, Ban, Beer as BeerIcon, Cable, Cog, Eye, Shield, Shirt, ShowerHead, Snowflake, Wind, Wrench, Zap } from 'lucide-react';
import { BottlingLineMaintenance } from '../components/BottlingLineMaintenance';
import { IkonaSud, IkonaVycep } from '../components/ikony';

interface HaccpScreenProps {
  initialTab?: 'udrzba' | 'bozp_prvni_pomoc' | 'staceci_linka';
  setPage?: (p: any, sec?: string, sub?: string) => void;
  initialSubTab?: string;
}

export default function HaccpScreen({ initialTab = 'udrzba', setPage, initialSubTab }: HaccpScreenProps) {
  const [activeTab, setActiveTab] = useState<'udrzba' | 'bozp_prvni_pomoc' | 'staceci_linka'>((initialSubTab as any) || initialTab);

  useEffect(() => {
    setActiveTab((initialSubTab as any) || initialTab);
  }, [initialSubTab, initialTab]);

  function selectTab(t: 'udrzba' | 'bozp_prvni_pomoc' | 'staceci_linka') {
    if (setPage) setPage('haccp', undefined, t);
    else setActiveTab(t);
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Navigation Tabs */}
      <div className="card p-5 bg-white border-2 border-amber-300 rounded space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-amber-500 text-neutral-950 font-black flex items-center justify-center shadow-md shrink-0">
              <Shield size={22} />
            </div>
            <div>
              <h2 className="font-display font-black text-lg text-neutral-900 tracking-tight">Sanitační řád — Údržba & BOZP</h2>
              <p className="text-xs text-neutral-600 font-bold">Kynšperský pivovar s.r.o. — Sokolovská 482/40, Kynšperk nad Ohří</p>
            </div>
          </div>
        </div>

        {/* Přilepené pod záložkami SanitaceTabbed nad tím. */}
        <div className="sticky top-0 z-10 bg-white flex items-center gap-2 overflow-x-auto scrollbar-thin pt-1 border-t border-amber-200/60">
          <button
            onClick={() => selectTab('udrzba')}
            className={`px-4 py-2.5 rounded text-xs font-black transition flex items-center gap-2 shrink-0 ${
              activeTab === 'udrzba'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Wrench size={16} />
            <span>Údržba strojů</span>
          </button>

          <button
            onClick={() => selectTab('staceci_linka')}
            className={`px-4 py-2.5 rounded text-xs font-black transition flex items-center gap-2 shrink-0 ${
              activeTab === 'staceci_linka'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Cog size={16} />
            <span>Údržba stáčecí linky</span>
          </button>

          <button
            onClick={() => selectTab('bozp_prvni_pomoc')}
            className={`px-4 py-2.5 rounded text-xs font-black transition flex items-center gap-2 shrink-0 ${
              activeTab === 'bozp_prvni_pomoc'
                ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-300 scale-[1.02]'
                : 'bg-rose-50 text-rose-950 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <AlertTriangle size={16} className="text-rose-600 group-hover:text-rose-700" />
            <span>První pomoc & BOZP S kyselinami</span>
          </button>
        </div>
      </div>

      {/* TAB 3: ÚDRŽBA ZAŘÍZENÍ, KOHOUTŮ, HADIC A NARÁŽEČŮ */}
      {activeTab === 'udrzba' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-neutral-200/90 rounded shadow-xs space-y-4">
            <h2 className="text-lg font-display font-black text-neutral-900 flex items-center gap-2">
              <Wrench className="text-amber-600" size={22} />
              <span><Wrench className="ikona-text" /> Preventivní údržba strojního zařízení pivovaru</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
                <div className="font-bold text-neutral-900">Myčka KEG sudů & Rotomatik</div>
                <p className="text-neutral-600">Kontrola dosedání aretačních kolíků rotomatiku, čistota trysek alkalického i parního okruhu, odpouštění kondenzátu z parního filtru.</p>
              </div>
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
                <div className="font-bold text-neutral-900">Šrotovník sladu</div>
                <p className="text-neutral-600">Čištění válců šrotovníku a odsávacího prostoru od sladového prachu. Kontrola napnutí řemenů a mazání ložisek.</p>
              </div>
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
                <div className="font-bold text-neutral-900">Ležácké tanky & Hradící ventily</div>
                <p className="text-neutral-600">Kontrola těsnosti gumiček dvířek, vzorkovacích kohoutů, rozebírání a čištění hradících přístrojů.</p>
              </div>
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
                <div className="font-bold text-neutral-900">Deskový chladič</div>
                <p className="text-neutral-600">Reverzní proplach horkou vodou s čisticím prostředkem pro odstranění kalů ze zchlazování mladiny.</p>
              </div>
            </div>
          </div>

          {/* DŮKLADNÝ NÁVOD: ÚDRŽBA KOHOUTŮ, NARÁŽEČŮ A HADIC */}
          <div className="card p-6 bg-white border-2 border-amber-300 rounded space-y-5 shadow-sm">
            <div className="flex items-center gap-3 border-b border-amber-200 pb-3">
              <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
                <IkonaVycep className="ikona-text" />
              </div>
              <div>
                <h3 className="font-display font-black text-xl text-neutral-950">Údržba výčepních kohoutů, narážečů a pivních hadic</h3>
                <p className="text-xs text-neutral-600 font-bold">Standardní operační postup (SOP) sanitace a preventivní péče o stáčecí a výčepní aparáty</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 1. Narážeče */}
              <div className="p-5 rounded bg-white border border-amber-200 space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-amber-900 font-black text-sm border-b border-amber-100 pb-2">
                  <span><IkonaSud className="ikona-text" /> Narážeče (Flach / Kombi / KORB)</span>
                </div>
                <ul className="space-y-2 text-xs text-neutral-700 font-medium leading-relaxed">
                  <li>• <strong>Po každém narazení:</strong> Opláchnout narážecí hlavu teplou vodou pro odstranění zaschlého piva z břitu.</li>
                  <li>• <strong>1× měsíčně kompletní rozebírání:</strong> Vyjmout narážecí trn, těsnění sudu, zpětnou kuličku CO₂ a plynů.</li>
                  <li>• <strong>Odmáčení v louhu:</strong> Rozložené díly odmáčet 2 hodiny v 2–3% teplém roztoku NaOH (Louhu) k odstranění pivního kamene.</li>
                  <li>• <strong>Výměna O-kroužků & Mazání:</strong> Zkontrolovat otlačená těsnění. Při znovusložení promazat O-kroužky silikonovou vazelínou s atestem pro styk s potravinami (NSF H1).</li>
                </ul>
              </div>

              {/* 2. Výčepní kohouty */}
              <div className="p-5 rounded bg-white border border-amber-200 space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-amber-900 font-black text-sm border-b border-amber-100 pb-2">
                  <span><BeerIcon className="ikona-text" /> Výčepní kohouty (Kompenzátorové)</span>
                </div>
                <ul className="space-y-2 text-xs text-neutral-700 font-medium leading-relaxed">
                  <li>• <strong>1× za 14 dní rozebírání:</strong> Odšroubovat hubici, regulátor kompenzátoru, ovládací páku a těsnění jehly.</li>
                  <li>• <strong>Čištění pivního kamene:</strong> Odmáčet kompenzátor a vnitřek kohoutu v roztoku kyseliny dusičné nebo fosforečné.</li>
                  <li>• <strong>Čištění hubice:</strong> Hubici zkontrolovat kartáčkem – nesmí v ní zůstat biofilm způsobený zbytkem odkapávajícího piva.</li>
                  <li>• <strong>Zpětná montáž:</strong> Závitové části a o-kroužky promazat potravinářskou silikonovou vazelínou pro hladký chod páky.</li>
                </ul>
              </div>

              {/* 3. Pivní a sanitační hadice */}
              <div className="p-5 rounded bg-white border border-amber-200 space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-amber-900 font-black text-sm border-b border-amber-100 pb-2">
                  <Cable className="ikona-text" /> <span>Pivní a sanitační vedení (Hadice)</span>
                </div>
                <ul className="space-y-2 text-xs text-neutral-700 font-medium leading-relaxed">
                  <li>• <strong>Sanitace vedení:</strong> Při sanitaci prohnat pivním vedením sanitační kuličky za použití sanitačního roztoku (Persteril / Kyselina).</li>
                  <li>• <strong>Vizuální kontrola zákalu:</strong> Zkontrolovat průhlednost EPDM/PVC hadic. Zákaz čištění vnitřku hadic drátem nebo mechanicky!</li>
                  <li>• <strong>Výměna vedení:</strong> Hadice se ztmavlým biofilmem nebo prasklinami se MUSÍ OKAMŽITĚ VYMĚNIT za nové.</li>
                  <li>• <strong>Kontrola těsnosti spon:</strong> Prověřit utažení nerezových spon a stav rychlospojek John Guest.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PRVNÍ POMOC A BOZP PŘI PRÁCI S KYSELINAMI A LOUHY */}
      {activeTab === 'bozp_prvni_pomoc' && (
        <div className="space-y-6">
          {/* Emergency Contacts Banner */}
          <div className="p-6 rounded bg-gradient-to-r from-rose-600 via-rose-700 to-neutral-900 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-rose-500/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded bg-white text-rose-600 flex items-center justify-center font-black text-2xl shadow-md">
                  <Ambulance className="ikona-text" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-black text-white">Nouzové telefonní kontakty – První Pomoc</h2>
                  <p className="text-xs text-rose-200 font-bold">Kynšperský pivovar s.r.o. — Zásady BOZP při práci s chemikáliemi</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Plná barva, ne bílá s průhledností: štítek leží na
                    přechodu rose-600 → neutral-900, takže se bílý text na
                    světlejším konci ztrácel. */}
                <span className="px-3 py-1.5 rounded bg-rose-900 text-white text-xs font-mono font-black border border-rose-300">
                  TIS: 224 919 293
                </span>
                <span className="px-3 py-1.5 rounded bg-rose-600 text-white text-xs font-mono font-black border border-rose-300">
                  ZZS: 155
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-udaj text-rose-200 font-bold uppercase">Záchranka (ZZS)</div>
                <div className="text-2xl font-black text-white">155</div>
              </div>
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-udaj text-rose-200 font-bold uppercase">Hasiči (HZS)</div>
                <div className="text-2xl font-black text-white">150</div>
              </div>
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-udaj text-rose-200 font-bold uppercase">Toxikologie (TIS)</div>
                <div className="text-base font-black text-amber-300">224 919 293</div>
              </div>
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-udaj text-rose-200 font-bold uppercase">Tísňové volání</div>
                <div className="text-2xl font-black text-white">112</div>
              </div>
            </div>
          </div>

          {/* First Aid Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 👀 Zasažení očí */}
            <div className="card p-6 bg-white border-2 border-rose-200 rounded space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
                <div className="w-10 h-10 rounded bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xl">
                  <Eye className="ikona-text" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-rose-950">1. Zasažení očí chemikálií (Kyselina / Louh)</h3>
                  <span className="text-udaj font-bold text-rose-600">NEJNEBEZPEČNĚJŠÍ ÚRAZ – RIZIKO TRVALÉHO OSLEPNUTÍ!</span>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-800 font-medium">
                <li className="p-2.5 rounded bg-rose-50 border border-rose-200 font-bold text-rose-950">
                  <Zap className="ikona-text" /> <strong>OKAMŽITĚ ROZEVŘÍT VÍČKA a OPLACHOVAT POUZE ČISTOU VODOU!</strong>
                </li>
                <li>• Vyplachovat proudem čisté vlažné vody po dobu <strong>minimálně 15 minut</strong>.</li>
                <li>• Oplachovat směrem od vnitřního koutku k vnějšímu (aby zasažená voda nevtekla do druhého oka).</li>
                <li>• <strong>PŘÍSNÝ ZÁKAZ</strong> používat neutralizační roztoky (ocet, sodu) – vznikající teplo z neutralizace by oko ještě více popálilo!</li>
                <li>• Okamžitě privolat ZZS (155) nebo zajistit odborný lékařský transport.</li>
              </ul>
            </div>

            {/* 🦵 Poleptání kůže */}
            <div className="card p-6 bg-white border-2 border-amber-200 rounded space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b border-amber-100 pb-3">
                <div className="w-10 h-10 rounded bg-amber-100 text-amber-700 flex items-center justify-center font-black text-xl">
                  <ShowerHead className="ikona-text" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-amber-950">2. Poleptání kůže a těla</h3>
                  <span className="text-udaj font-bold text-amber-700">Kyselina dusičná / fosforečná / Hydroxid sodný</span>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-800 font-medium">
                <li className="p-2.5 rounded bg-amber-50 border border-amber-200 font-bold text-amber-950">
                  <Shirt className="ikona-text" /> <strong>Ihned svléknout potřísněný oděv</strong> (oděv drží chemikálii na kůži).
                </li>
                <li>• Oplachovat postižené místo silným proudem studené vody po dobu 10–15 minut.</li>
                <li>• <strong>Zásah kyselinou:</strong> Po důkladném opláchnutí vodou lze omýt mýdlovou vodou nebo 1% roztokem jedlé sody.</li>
                <li>• <strong>Zásah louhem:</strong> Po důkladném opláchnutí vodou lze omýt slabým roztokem octa nebo kyseliny citronové.</li>
                <li>• Překrýt sterilním obvazem a v případě šoku nebo rozsáhlého poleptání volat ZZS (155).</li>
              </ul>
            </div>

            {/* 💨 Nadhýchání výparů & CO2 v kvasném tanku */}
            <div className="card p-6 bg-white border-2 border-sky-200 rounded space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b border-sky-100 pb-3">
                <div className="w-10 h-10 rounded bg-sky-100 text-sky-700 flex items-center justify-center font-black text-xl">
                  <Wind className="ikona-text" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-sky-950">3. Nadhýchání výparů & Nebezpečí CO₂</h3>
                  <span className="text-udaj font-bold text-sky-700">Kvasné tanky, Persteril a desinfekční výpary</span>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-800 font-medium">
                <li className="p-2.5 rounded bg-sky-50 border border-sky-200 font-bold text-sky-950">
                  <Snowflake className="ikona-text" /> <strong>POZOR NA CO₂ V KVASNÝCH TANCÍCH:</strong> CO₂ se drží u dna tanku, vytěsňuje kyslík a způsobuje bleskový kolaps bez varování!
                </li>
                <li>• Při vstupu nebo vyjímání panenky z kvasného tanku vždy úkon provádět za přítomnosti <strong>2. osoby</strong>!</li>
                <li>• Při nadhýchání Persterilu nebo chlorových výparů vynést postiženého na čerstvý vzduch.</li>
                <li>• Zabezpečit klid, teplo a uvolnit oděv kolem krku a hrudníku. Volat ZZS (155).</li>
              </ul>
            </div>

            {/* 🚰 Požití chemikálie */}
            <div className="card p-6 bg-white border-2 border-violet-200 rounded space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b border-violet-100 pb-3">
                <div className="w-10 h-10 rounded bg-violet-100 text-violet-700 flex items-center justify-center font-black text-xl">
                  <IkonaVycep className="ikona-text" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-violet-950">4. Požití kyseliny nebo louhu</h3>
                  <span className="text-udaj font-bold text-violet-700">Náhodné požití sanitačního roztoku</span>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-800 font-medium">
                <li className="p-2.5 rounded bg-violet-50 border border-violet-200 font-bold text-violet-950">
                  <Ban className="ikona-text" /> <strong>NEVYVOLÁVAT ZVRACENÍ!</strong> Zvratky by znovu poleptaly jícen a hrozí proděravění žaludku.
                </li>
                <li>• Postiženému dát ihned vypít 2–5 dcl čisté chladné vody pro rozředění chemikálie.</li>
                <li>• Nepodávat živočišné uhlí ani jídlo!</li>
                <li>• Okamžitě volat <strong>Toxikologické informační středisko (224 919 293)</strong> nebo ZZS (155).</li>
              </ul>
            </div>
          </div>

          {/* Golden Rule of Acid Dilution */}
          <div className="p-5 rounded bg-neutral-900 text-amber-300 border-2 border-amber-500 font-mono text-xs space-y-2 shadow-lg">
            <div className="font-black text-white text-sm uppercase flex items-center gap-2">
              <span><AlertTriangle className="ikona-text" /> ZÁKLADNÍ BEZPEČNOSTNÍ PRAVIDLO ŘEDĚNÍ KYSELIN:</span>
            </div>
            {/* podklad: bg-neutral-900 — panel pravidla výš. */}
            <div className="text-base font-black text-amber-400 p-3 rounded bg-black/50 border border-amber-500/40 text-center">
              „KYSELINU VŽDY LIJEME DO VODY! NIKDY VODU DO KYSELINY!“
            </div>
            <p className="text-neutral-400 text-xs">
              Při nalití vody do koncentrované kyseliny dochází k okamžité prudké exotermické reakci, voda vzkypí a horká kyselina vystříkne obsluze do obličeje a očí!
            </p>
          </div>
        </div>
      )}

      {/* TAB 7: ÚDRŽBA STÁČECÍ LINKY */}
      {activeTab === 'staceci_linka' && <BottlingLineMaintenance />}
    </div>
  );
}
