import { useState } from 'react';
import { Search, AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, BookOpen } from 'lucide-react';

type OffFlavorDef = {
  id: string;
  name: string;
  chemicalName: string;
  sensoryProfile: string;
  threshold: string;
  cause: string;
  solution: string;
  prevention: string;
  category: 'fermentation' | 'lautering' | 'sanitation' | 'packaging';
};

const TROUBLESHOOTING_KNOWLEDGE_BASE: OffFlavorDef[] = [
  {
    id: 'diacetyl',
    name: 'Diacetyl (Máslovost / Máslový popcorn)',
    chemicalName: '2,3-butanedion',
    sensoryProfile: 'Vůně a chuť čerstvého másla, máslové hračky, popkornové příchuti, mastný pocit na patře.',
    threshold: '0.04 - 0.1 mg/l (velmi nízký prah vnímavosti u světlého ležáku)',
    cause: 'Předčasné stočení ležáku z kvasných tanků bez dostatečné diacetylové pauzy (zvýšení teploty na 12-14°C na konci hlavního kvašení). Nebo bakteriální kontaminace Pediococcus / Lactobacillus.',
    solution: 'Nechat pivo delší dobu v kontaktu se živými kvasinkami v CCT (diacetylový odpočinek při 13°C po dobu 48 hod). Kvasinky diacetyl zpětně vstřebají a redukují na neochucený acetoin a 2,3-butandiol.',
    prevention: 'Vždy provádět diacetylový test před zchlazením CCT na 2°C. Dodržovat sanitační protokoly vyčerpání kvasnic.',
    category: 'fermentation',
  },
  {
    id: 'dms',
    name: 'DMS (Vařená zelenina / Kukuřice)',
    chemicalName: 'Dimethylsulfid',
    sensoryProfile: 'Zápach a chuť vařené kukuřice, zeleného hrášku, zelí nebo celeru.',
    threshold: '0.03 mg/l (výrazný u světlých plzeňských sladů)',
    cause: 'Nedostatečně intenzivní nebo krátký chmelovar (méně než 60-90 min). Pomalé zchlazování mladiny v vířivé kadi (SMM prekurzor se mění na DMS i při 80°C bez odvětrání).',
    solution: 'Pokud je DMS v pivu, je obtížné ho odstranit. Lze zkusit profukovat čerstvým CO₂ se sterilním filtrem ze dna tanku pro odvětrání.',
    prevention: 'Vařit mladinu minimálně 75-90 minut s otevřeným odtahovým komínem (odparek > 8%). Zchladit mladinu z 95°C na 15°C za méně než 45 minut.',
    category: 'lautering',
  },
  {
    id: 'acetaldehyde',
    name: 'Acetaldehyd (Zelená jablka / Rozmačkané listí)',
    chemicalName: 'Ethanal (prekurzor ethanolu)',
    sensoryProfile: 'Chuť nezralých zelených jablek, čerstvě posekané trávy nebo emulze z laku na nehty.',
    threshold: '5 - 15 mg/l',
    cause: 'Předčasně ukončené kvašení, mladé "zelené" pivo stočené před dokvašením. Nebo lehká oxidace již hotového piva u přetlačování.',
    solution: 'Prodloužit ležení piva v ležáckém tanku. Kvasinky acetaldehyd v dokvašovací fázi přemění na ethylalkohol.',
    prevention: 'Zajistit dostatečné množství zdravých kvasnic (pitching rate), optimální prozvzdušnění mladiny na začátku (8-10 mg O₂/l) a nespěchat se stáčením.',
    category: 'fermentation',
  },
  {
    id: 'oxidation',
    name: 'Oxidace (Mokrý karton / Staričké pivo)',
    chemicalName: 'trans-2-nonenal',
    sensoryProfile: 'Vůně navlhlého papírového kartonu, chleba, medu, sherry nebo ztuhlého tuku.',
    threshold: 'Závisí na stáří piva',
    cause: 'Přístup vzdušného kyslíku (DO - Dissolved Oxygen) při přetlačování piva z CCT do ležáku nebo při plnění do sudů a lahví bez CO₂ evakuace.',
    solution: 'Není reverzibilní. Zoxidované pivo rychle spotřebovat nebo stočit s vyšším sycením.',
    prevention: 'Proplachovat všechny trubky a kegy sterilním CO₂ před plněním. Evakuovat lahve CO₂ na náplňové lince. Udržovat rozpuštěný O₂ pod 50 ppb.',
    category: 'packaging',
  },
  {
    id: 'isovaleric',
    name: 'Stříbrný / Starý chmel (Kyselina isovalerová)',
    chemicalName: 'Isovaleric acid',
    sensoryProfile: 'Zápach starých sýrů, potu z ponožek, koželužny nebo žluklého tuku.',
    threshold: '1 mg/l',
    cause: 'Použití starého, zoxidovaného nebo špatně skladovaného chmele (nevakuovaného uložení při pokojové teplotě).',
    solution: 'Nemožné odstranit. Lze zjemnit kupáží s čerstvým aromatickým pivem (Studené chmelení).',
    prevention: 'Chmel skladovat výhradně ve vakuových hliníkových sáčcích v mrazáku při -18°C až 2°C.',
    category: 'lautering',
  },
  {
    id: 'stuck_mash',
    name: 'Ucpání scazovací kádě / Zastavené scazování',
    chemicalName: 'Mechanická vada složení mláta',
    sensoryProfile: 'Mladina neproudí přes síto scazovací kádě, vysoká hladina nad mlátem.',
    threshold: 'N/A',
    cause: 'Příliš jemně našrotovaný slad, příliš vysoký podíl pšenice/nesladovaného obilí bez pluch, nebo příliš rychlé odčerpávání mladiny (podtlak ucpal síto).',
    solution: 'Zastavit čerpadlo mladiny. Provést kypření mláta noži, vpravit horkou vodu zdola pod síto (proplach dna) a nechat mláto 10 minut znovu usadit.',
    prevention: 'Naladit dvouválcový šrotovník tak, aby pluchy zůstaly celé. U pšeničných piv přidat rýžové slupky pro zlepšení propustnosti.',
    category: 'lautering',
  },
];

export function BrewingTroubleshootingDatabase() {
  const [query, setQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');

  const filtered = TROUBLESHOOTING_KNOWLEDGE_BASE.filter((item) => {
    const matchesCat = selectedCat === 'all' || item.category === selectedCat;
    const matchesQuery =
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.sensoryProfile.toLowerCase().includes(query.toLowerCase()) ||
      item.cause.toLowerCase().includes(query.toLowerCase()) ||
      item.solution.toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-amber-950 via-neutral-900 to-neutral-950 text-white rounded-3xl space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
            🚨
          </div>
          <div>
            <h3 className="font-display font-black text-xl text-amber-400">
              Databáze pivovarských chyb, vad a řešení (Knowledgebase)
            </h3>
            <p className="text-xs text-neutral-300 font-medium">
              Průvodce senzorickými vadami piva, chybami při kvašení, ucpáním scazování a nápravnými opatřeními Sládka.
            </p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-3.5 top-3 text-neutral-400" size={18} />
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-400 text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              placeholder="Hledat podle chuti, vůně nebo příčiny (diacetyl, DMS, karton, scazování…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select
            className="py-2.5 px-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white text-xs font-bold"
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
          >
            <option value="all">🔍 Všechny kategorie vad</option>
            <option value="fermentation">🧫 Vady kvašení & Kvasnic</option>
            <option value="lautering">🌾 Varny, Slad & Scazování</option>
            <option value="sanitation">🧼 Sanitace & Kontaminace</option>
            <option value="packaging">🛢️ Stáčení, Oxidace & Plyn</option>
          </select>
        </div>
      </div>

      {/* Cards list */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className="card p-6 bg-white border border-neutral-200 rounded-3xl space-y-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <span className="text-xs font-black text-amber-700 uppercase tracking-wider bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                  {item.category === 'fermentation' ? '🧫 Kvašení' : item.category === 'lautering' ? '🌾 Varna & Scazování' : item.category === 'sanitation' ? '🧼 Sanitace' : '🛢️ Stáčení & Balení'}
                </span>
                <h4 className="font-display font-black text-lg text-neutral-900 mt-2">{item.name}</h4>
                <div className="text-xs font-mono text-neutral-500 font-bold">Chemická sloučenina / Vadný stav: {item.chemicalName}</div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-[10px] font-black uppercase text-neutral-400">Prah vnímání:</div>
                <div className="text-xs font-mono font-bold text-neutral-700">{item.threshold}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Senzorický profil */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
                <div className="font-black text-amber-950 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-amber-600" />
                  <span>Senzorická charakteristika:</span>
                </div>
                <p className="text-neutral-700 leading-relaxed font-medium">{item.sensoryProfile}</p>
              </div>

              {/* Příčina */}
              <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-1">
                <div className="font-black text-rose-950 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-rose-600" />
                  <span>Příčina vzniku v pivovaru:</span>
                </div>
                <p className="text-neutral-700 leading-relaxed font-medium">{item.cause}</p>
              </div>

              {/* Řešení & Prevence */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                <div className="font-black text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>Náprava & Prevence sládka:</span>
                </div>
                <p className="text-neutral-900 font-bold leading-relaxed">{item.solution}</p>
                <div className="text-[11px] text-neutral-600 font-medium pt-1 border-t border-emerald-200/60 mt-1">
                  <strong>Prevence:</strong> {item.prevention}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
