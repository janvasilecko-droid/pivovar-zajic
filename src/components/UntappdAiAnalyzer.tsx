import { useState } from 'react';
import { Award, Leaf, MessageSquare, RefreshCw, Sparkles, Star, Tag, ThumbsUp } from 'lucide-react';

type ReviewAnalysisResult = {
  overallRating: number;
  totalReviewsAnalyzed: number;
  sentimentScorePct: number;
  topFlavorNotes: { note: string; count: number; category: 'hop' | 'malt' | 'body' | 'aroma' }[];
  positiveHighlights: string[];
  constructiveFeedback: string[];
  sladekSummary: string;
};

export function UntappdAiAnalyzer() {
  const [rawText, setRawText] = useState<string>(
    `"Super světlý ležák 11! Krásná chmelová vůně Žateckého červeňáku, parádní plné tělo a čistý říz. Bez diacetylu, skvělá pitelnost!" - Honza K. (4.5/5)
"Skvělý pivko, pěna drží kroužky až na dno skla. Jemná hořkost v doznuku." - Petr M. (4.25/5)
"Příjemná 11ka, osvěžující na letní rozvoz. Možná o trochu víc karamelového sladu by neškodilo, ale jinak top." - Martin B. (4.0/5)
"Vynikající nefiltr z Minipivovaru Zajíc. Čistý profil, bez pachutí." - Pavel K. (4.75/5)`
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ReviewAnalysisResult | null>(null);

  function runAnalysis() {
    setAnalyzing(true);
    setTimeout(() => {
      // Mocked AI Natural Language Processing extraction engine for Untappd reviews
      const reviews = rawText.split('\n').filter((l) => l.trim().length > 0);
      const count = reviews.length;

      setAnalysis({
        overallRating: 4.38,
        totalReviewsAnalyzed: count,
        sentimentScorePct: 94,
        topFlavorNotes: [
          { note: 'Žatecký červeňák (Chmel)', count: count * 2, category: 'hop' },
          { note: 'Plné sladové tělo', count: Math.max(1, count - 1), category: 'malt' },
          { note: 'Čistý říz & Pěna', count: count, category: 'aroma' },
          { note: 'Vysoká pitelnost', count: Math.max(1, count - 1), category: 'body' },
        ],
        positiveHighlights: [
          'Vynikající stabilita pěny a kroužkování na skle.',
          'Příkladná čistota ležáku bez stop diacetylu.',
          'Vyvážená hořkost v doznuku díky žateckému chmeli.',
        ],
        constructiveFeedback: [
          'Jeden hodnotitel by uvítal mírně vyšší podíl plnosti karamelového sladu.',
        ],
        sladekSummary:
          'Šarže má skvělý ohlas u zákazníků (94% pozitivních zmínek). Doporučeno zachovat stávající sypání sladu i chmelový profil Žateckého poloraného červeňáku.',
      });
      setAnalyzing(false);
    }, 800);
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 text-white rounded space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
            <Star className="ikona-text" />
          </div>
          <div>
            <h3 className="font-display font-black text-xl text-amber-400">
              AI Analýza textových recenzí z Untappd & Piva
            </h3>
            <p className="text-xs text-neutral-300 font-medium">
              Vlož textové recenze z Untappd nebo Google Reviews a AI extrahuje chuťový profil, chmelové tóny, hodnocení a doporučení pro sládka.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-amber-300 uppercase tracking-wider">
            Vlož textové recenze (z Untappd, sociálních sítí nebo degustačního archu):
          </label>
          <textarea
            rows={5}
            className="w-full p-4 rounded bg-neutral-800 border border-neutral-700 text-white text-xs font-mono placeholder-neutral-500 focus:outline-hidden focus:ring-2 focus:ring-amber-400 leading-relaxed"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Sem vlož textové recenze zákazníků…"
          />

          <div className="flex justify-end pt-1">
            <button
              onClick={runAnalysis}
              disabled={analyzing || !rawText.trim()}
              className="btn-amber !rounded text-xs font-black px-6 py-3 shadow-lg flex items-center gap-2"
            >
              <Sparkles size={16} />
              <span>{analyzing ? 'AI Analýza probíhá…' : 'Spustit AI Analýzu recenzí'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Results Display */}
      {analysis && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5 bg-white border border-amber-200 rounded space-y-1 shadow-xs">
              <div className="text-udaj font-black uppercase text-neutral-400">Průměrné Untappd Skóre:</div>
              <div className="text-3xl font-display font-black text-amber-600 flex items-baseline gap-1">
                <span>{analysis.overallRating}</span>
                <span className="text-xs text-neutral-400 font-bold">/ 5.0 <Star className="ikona-text" /></span>
              </div>
            </div>

            <div className="card p-5 bg-white border border-emerald-200 rounded space-y-1 shadow-xs">
              <div className="text-udaj font-black uppercase text-neutral-400">Sentiment hodnocení:</div>
              <div className="text-3xl font-display font-black text-emerald-600">
                {analysis.sentimentScorePct}% <span className="text-xs font-bold text-neutral-500">Pozitivní</span>
              </div>
            </div>

            <div className="card p-5 bg-white border border-violet-200 rounded space-y-1 shadow-xs">
              <div className="text-udaj font-black uppercase text-neutral-400">Počet recenzí:</div>
              <div className="text-3xl font-display font-black text-violet-600">
                {analysis.totalReviewsAnalyzed} <span className="text-xs font-bold text-neutral-500">záznamů</span>
              </div>
            </div>
          </div>

          {/* Flavor Notes Grid */}
          <div className="card p-6 bg-white border border-neutral-200 rounded space-y-4 shadow-sm">
            <h4 className="font-display font-black text-base text-neutral-950 flex items-center gap-2">
              <Tag className="text-amber-600" size={18} />
              <span>Nejčastější senzory a chmelové/sladové tóny v recenzích:</span>
            </h4>

            <div className="flex flex-wrap gap-2">
              {analysis.topFlavorNotes.map((note) => (
                <span
                  key={note.note}
                  className="px-3.5 py-2 rounded bg-amber-100 text-amber-950 font-extrabold text-xs border border-amber-300 flex items-center gap-1.5 shadow-2xs"
                >
                  <span><Leaf className="ikona-text" /> {note.note}</span>
                  <span className="bg-amber-500 text-neutral-950 px-2 py-0.5 rounded-full text-udaj font-black">
                    {note.count}×
                  </span>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="font-black text-xs uppercase text-emerald-950 flex items-center gap-1.5">
                  <ThumbsUp size={16} className="text-emerald-600" />
                  <span>Hlavní plusy a pochvaly piva:</span>
                </div>
                <ul className="text-xs space-y-1 text-emerald-950 font-medium list-disc pl-4">
                  {analysis.positiveHighlights.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded bg-amber-50 border border-amber-200 space-y-2">
                <div className="font-black text-xs uppercase text-amber-950 flex items-center gap-1.5">
                  <Award size={16} className="text-amber-600" />
                  <span>Doporučení pro Sládka:</span>
                </div>
                <p className="text-xs text-amber-950 font-bold leading-relaxed">{analysis.sladekSummary}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
