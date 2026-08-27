import { useEffect, useState } from 'react';
import { Beer, Package, supabase, beerBg, beerText } from '../lib/supabase';
import {
  AuditReport,
  runOrderAudit,
  mergeDuplicateItemRows,
  OrderItemDuplicateIssue,
  WhatsAppMismatchIssue,
  DuplicateOrderIssue,
  UnprocessedWhatsAppIssue,
} from '../lib/orderAudit';
import { AlertTriangle, ArrowRight, Beer as BeerIcon, Calendar, CheckCircle, ChevronDown, ChevronUp, Copy, Eye, FileCheck, Layers, MessageSquare, Phone, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Spinner } from './ui';
import { potvrd } from '../lib/toast';
import {
  tichoUOdberatelu, vypadkyPrijmu, pokrytiTydne,
  type TichoRadek, type VypadekRadek, type PokrytiRadek,
} from '../lib/kontrolaObjednavek';

interface OrderAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  selectedWeekKey?: string;
  onOpenOrder?: (orderId: string) => void;
  onProcessWhatsApp?: (messageId: string) => void;
  onRefreshOrders?: () => void;
}

type TabType = 'all' | 'items_dup' | 'wa_mismatch' | 'order_dup' | 'unprocessed' | 'prislo';

export function OrderAuditModal({
  isOpen,
  onClose,
  beers,
  packages,
  selectedWeekKey,
  onOpenOrder,
  onProcessWhatsApp,
  onRefreshOrders,
}: OrderAuditModalProps) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [filterScope, setFilterScope] = useState<'week' | 'all'>(selectedWeekKey ? 'week' : 'all');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [msgFeedback, setMsgFeedback] = useState<string | null>(null);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());
  // „Přišlo všechno?" — kontrola toho, co v databázi NENÍ. Chybějící zprávu
  // nejde najít přímo, dá se ale poznat z rytmu odesílatelů, z výpadků příjmu
  // a ze zpráv, které trigger odmítl (viz lib/kontrolaObjednavek.ts).
  const [ticho, setTicho] = useState<TichoRadek[]>([]);
  const [vypadky, setVypadky] = useState<VypadekRadek[]>([]);
  const [pokryti, setPokryti] = useState<{ chybi: PokrytiRadek[]; noviTentoTyden: string[] }>({ chybi: [], noviTentoTyden: [] });
  const [odmitnute, setOdmitnute] = useState<any[]>([]);
  // Deník příjmu: kolik zpráv došlo na webhook a kolik z nich se uložilo.
  // Tohle je jediné místo, kde jde ověřit „na WhatsAppu je 12, v appce 11".
  const [denik, setDenik] = useState<any[]>([]);

  async function nactiKontroluPrijmu() {
    try {
      const pred = new Date();
      pred.setDate(pred.getDate() - 180);
      const odIso = pred.toISOString().slice(0, 10);
      const [zpravy, objednavky, zamitnute, denikDennne] = await Promise.all([
        supabase.from('whatsapp_incoming').select('id,sender_name,created_at,status').gte('created_at', odIso),
        supabase.from('orders').select('id,place_name,delivery_date,order_date,status').gte('order_date', odIso),
        // Tabulka vzniká migrací 20261216000000 — dokud není nasazená, chyba
        // se spolkne a zbytek kontroly funguje dál.
        supabase.from('whatsapp_rejected').select('*').is('acknowledged_at', null).order('created_at', { ascending: false }).limit(50),
        // Pohled vzniká migrací 20261217000000; dokud není nasazená, spolkne
        // se chyba a zbytek kontroly funguje dál.
        supabase.from('whatsapp_prijem_denne').select('*').limit(30),
      ]);
      const seznamZprav = (zpravy.data as any[]) ?? [];
      setTicho(tichoUOdberatelu(seznamZprav, new Date()));
      setVypadky(vypadkyPrijmu(seznamZprav).slice(0, 5));
      const dnes = new Date();
      const pondeli = new Date(dnes);
      pondeli.setDate(dnes.getDate() - ((dnes.getDay() + 6) % 7));
      setPokryti(pokrytiTydne((objednavky.data as any[]) ?? [], pondeli.toISOString().slice(0, 10)));
      setOdmitnute((zamitnute.data as any[]) ?? []);
      setDenik((denikDennne.data as any[]) ?? []);
    } catch {
      // Kontrola je doplněk — když se nenačte, zbytek auditu funguje dál.
    }
  }

  const podezreniCelkem = pokryti.chybi.length + odmitnute.length + ticho.length + vypadky.length;

  async function loadAudit() {
    setLoading(true);
    setMsgFeedback(null);
    try {
      const rep = await runOrderAudit({
        weekKey: filterScope === 'week' ? selectedWeekKey : undefined,
        beers,
        packages,
      });
      setReport(rep);
      await nactiKontroluPrijmu();
    } catch (e: any) {
      console.error('Audit failed:', e);
      setMsgFeedback('Chyba při spuštění auditu: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadAudit();
    }
  }, [isOpen, filterScope, selectedWeekKey]);

  if (!isOpen) return null;

  function toggleExpandMsg(id: string) {
    setExpandedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMergeRows(issue: OrderItemDuplicateIssue, targetQty: number) {
    setActionLoading(true);
    try {
      const res = await mergeDuplicateItemRows(issue.rows, targetQty);
      if (res.success) {
        setMsgFeedback(`✓ Položka ${issue.beerName} ${issue.packageLabel} byla upravena na ${targetQty} ks.`);
        await loadAudit();
        onRefreshOrders && onRefreshOrders();
      } else {
        setMsgFeedback('Chyba při úpravě: ' + res.error);
      }
    } catch (e: any) {
      setMsgFeedback('Chyba: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStornoOrder(orderId: string) {
    if (!(await potvrd('Opravdu chcete tuto duplicitní objednávku stornovat?'))) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('orders').update({ status: 'storno' }).eq('id', orderId);
      if (error) {
        setMsgFeedback('Chyba při stornování: ' + error.message);
      } else {
        setMsgFeedback('✓ Objednávka byla stornována.');
        await loadAudit();
        onRefreshOrders && onRefreshOrders();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIgnoreWhatsApp(messageId: string) {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('whatsapp_incoming').update({ status: 'ignored' }).eq('id', messageId);
      if (error) {
        setMsgFeedback('Chyba: ' + error.message);
      } else {
        setMsgFeedback('✓ Zpráva byla označena jako vyřízená / ignorovaná.');
        await loadAudit();
      }
    } finally {
      setActionLoading(false);
    }
  }

  const itemsDupCount = report?.duplicateItemIssues.length || 0;
  const waMismatchCount = report?.whatsappMismatchIssues.length || 0;
  const orderDupCount = report?.duplicateOrderIssues.length || 0;
  const unprocessedCount = report?.unprocessedWhatsAppIssues.length || 0;
  const totalIssues = report?.totalIssuesCount || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-neutral-50 w-full sm:max-w-4xl max-h-[94vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded shadow-2xl flex flex-col overflow-hidden border border-neutral-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 text-white shadow-md shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded bg-amber-500/20 border border-amber-400/40 grid place-items-center text-2xl shadow-inner shrink-0">
                <Search className="ikona-text" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-black text-base sm:text-xl text-white tracking-tight">
                    Kontrola & Audit objednávek
                  </h2>
                  {totalIssues === 0 && !loading && (
                    <span className="text-[11px] bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <ShieldCheck size={13} /> 100% V pořádku
                    </span>
                  )}
                  {totalIssues > 0 && !loading && (
                    <span className="text-[11px] bg-rose-500/30 text-rose-300 border border-rose-400/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <AlertTriangle size={12} /> {totalIssues} k prověření
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-amber-200/80 mt-0.5">
                  Detekce zdvojených sudů, duplicit a porovnání s WhatsAppem
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={loadAudit}
                disabled={loading || actionLoading}
                className="w-10 h-10 sm:w-auto sm:px-3 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-white transition text-xs font-bold flex items-center justify-center gap-1.5 border border-white/10"
                title="Překontrolovat znovu"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Překontrolovat</span>
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 grid place-items-center rounded bg-white/10 hover:bg-white/20 active:scale-95 text-white transition border border-white/10"
                title="Zavřít"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Scope Selector: Tento týden / Vše */}
          <div className="mt-3 pt-2.5 border-t border-amber-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-black/25 p-1 rounded border border-white/10">
              <button
                onClick={() => setFilterScope('week')}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  filterScope === 'week'
                    ? 'bg-amber-500 text-amber-950 font-black shadow-xs'
                    : 'text-amber-200 hover:text-white'
                }`}
              >
                <Calendar className="ikona-text" /> Tento týden
              </button>
              <button
                onClick={() => setFilterScope('all')}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  filterScope === 'all'
                    ? 'bg-amber-500 text-amber-950 font-black shadow-xs'
                    : 'text-amber-200 hover:text-white'
                }`}
              >
                🌐 Všechny aktivní
              </button>
            </div>

            {report && !loading && (
              <div className="text-[11px] font-medium text-amber-200/90">
                Prověřeno <strong>{report.scannedOrdersCount}</strong> obj. a <strong>{report.scannedWhatsAppCount}</strong> zpráv
              </div>
            )}
          </div>
        </div>

        {/* Feedback Alert Message */}
        {msgFeedback && (
          <div className="px-4 py-2.5 bg-amber-100 text-amber-950 text-xs font-black border-b border-amber-300 flex items-center justify-between animate-in fade-in">
            <span>{msgFeedback}</span>
            <button onClick={() => setMsgFeedback(null)} className="text-amber-800 hover:text-amber-950 font-bold p-1">✕</button>
          </div>
        )}

        {/* 4 Summary Dashboard Cards (Interactive filter buttons) */}
        <div className="p-3 sm:p-4 bg-white border-b border-neutral-200 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Card 1: Zdvojené sudy */}
            <button
              onClick={() => setActiveTab(activeTab === 'items_dup' ? 'all' : 'items_dup')}
              className={`p-2.5 sm:p-3 rounded border-2 text-left transition flex flex-col justify-between select-none ${
                activeTab === 'items_dup'
                  ? 'bg-rose-100 border-rose-500 ring-2 ring-rose-400 shadow-sm'
                  : itemsDupCount > 0
                  ? 'bg-rose-50/80 border-rose-200 hover:border-rose-300'
                  : 'bg-neutral-50 border-neutral-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between text-rose-800 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider">Zdvojené sudy</span>
                <Layers size={15} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl sm:text-2xl font-black ${itemsDupCount > 0 ? 'text-rose-700' : 'text-neutral-500'}`}>
                  {itemsDupCount}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">v objednávkách</span>
              </div>
            </button>

            {/* Card 2: Neshody s WA */}
            <button
              onClick={() => setActiveTab(activeTab === 'wa_mismatch' ? 'all' : 'wa_mismatch')}
              className={`p-2.5 sm:p-3 rounded border-2 text-left transition flex flex-col justify-between select-none ${
                activeTab === 'wa_mismatch'
                  ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400 shadow-sm'
                  : waMismatchCount > 0
                  ? 'bg-amber-50/80 border-amber-200 hover:border-amber-300'
                  : 'bg-neutral-50 border-neutral-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between text-amber-800 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider">Neshody s WA</span>
                <MessageSquare size={15} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl sm:text-2xl font-black ${waMismatchCount > 0 ? 'text-amber-700' : 'text-neutral-500'}`}>
                  {waMismatchCount}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">rozdílných ks</span>
              </div>
            </button>

            {/* Card 3: Duplicitní objednávky */}
            <button
              onClick={() => setActiveTab(activeTab === 'order_dup' ? 'all' : 'order_dup')}
              className={`p-2.5 sm:p-3 rounded border-2 text-left transition flex flex-col justify-between select-none ${
                activeTab === 'order_dup'
                  ? 'bg-purple-100 border-purple-500 ring-2 ring-purple-400 shadow-sm'
                  : orderDupCount > 0
                  ? 'bg-purple-50/80 border-purple-200 hover:border-purple-300'
                  : 'bg-neutral-50 border-neutral-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between text-purple-800 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider">Duplicitní obj.</span>
                <Copy size={15} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl sm:text-2xl font-black ${orderDupCount > 0 ? 'text-purple-700' : 'text-neutral-500'}`}>
                  {orderDupCount}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">stejný zákazník</span>
              </div>
            </button>

            {/* Card 4: Čekající zprávy */}
            <button
              onClick={() => setActiveTab(activeTab === 'unprocessed' ? 'all' : 'unprocessed')}
              className={`p-2.5 sm:p-3 rounded border-2 text-left transition flex flex-col justify-between select-none ${
                activeTab === 'unprocessed'
                  ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400 shadow-sm'
                  : unprocessedCount > 0
                  ? 'bg-blue-50/80 border-blue-200 hover:border-blue-300'
                  : 'bg-neutral-50 border-neutral-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between text-blue-800 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider">Čekající zprávy</span>
                <Sparkles size={15} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl sm:text-2xl font-black ${unprocessedCount > 0 ? 'text-blue-700' : 'text-neutral-500'}`}>
                  {unprocessedCount}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">nezadaných</span>
              </div>
            </button>

            {/* Card 5: Přišlo všechno? — jediná kontrola, která hledá to,
                co v databázi CHYBÍ, ne co v ní je špatně. */}
            <button
              onClick={() => setActiveTab(activeTab === 'prislo' ? 'all' : 'prislo')}
              className={`p-2.5 sm:p-3 rounded border-2 text-left transition flex flex-col justify-between select-none ${
                activeTab === 'prislo'
                  ? 'bg-violet-100 border-violet-500 ring-2 ring-violet-400 shadow-sm'
                  : podezreniCelkem > 0
                  ? 'bg-violet-50/80 border-violet-200 hover:border-violet-300'
                  : 'bg-neutral-50 border-neutral-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between text-violet-800 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider">Přišlo všechno?</span>
                <Search size={15} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl sm:text-2xl font-black ${podezreniCelkem > 0 ? 'text-violet-700' : 'text-neutral-500'}`}>
                  {podezreniCelkem}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">podezření</span>
              </div>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <Spinner />
              <div className="text-base font-black text-amber-950">Provádím hloubkovou kontrolu objednávek…</div>
              <div className="text-xs text-neutral-500 max-w-sm mx-auto">
                Analyzuji zadané sudy, shodu s původními WhatsApp zprávami a duplicity v databázi.
              </div>
            </div>
          ) : totalIssues === 0 ? (
            <div className="py-16 px-4 text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center text-4xl mx-auto mb-4 border-2 border-emerald-300 shadow-md">
                ✓
              </div>
              <h3 className="font-display font-black text-xl text-emerald-950">Vše je 100% v pořádku!</h3>
              <p className="text-xs text-emerald-900/80 mt-1.5 leading-relaxed">
                V prověřovaném období nebyly nalezeny žádné zdvojené položky, žádné neshody s WhatsAppem ani duplicitní objednávky.
              </p>
              <button
                onClick={onClose}
                className="mt-6 btn-primary !bg-emerald-700 hover:!bg-emerald-800 text-xs font-black shadow-md px-8 py-2.5 rounded"
              >
                Hotovo / Zavřít kontrolu
              </button>
            </div>
          ) : (
            <div className="space-y-4">

              {/* 1. SEKCIE: ZDVOJENÉ ŘÁDKY POLOŽIEK (např. 2x 12% 50l) */}
              {(activeTab === 'all' || activeTab === 'prislo') && (
                <div className="space-y-3">
                  {/* 0) Deník příjmu — jediný TVRDÝ údaj. Ostatní kontroly níž
                         jsou odhady z chování; tohle je počítadlo. */}
                  {denik.length > 0 && (
                    <div className="rounded-xl border-2 border-neutral-300 bg-white p-3.5">
                      <div className="font-display font-black text-neutral-900 text-sm mb-1">Deník příjmu</div>
                      <p className="text-xs font-bold text-neutral-600 mb-2">
                        Kolik zpráv došlo na webhook a kolik z nich se uložilo. Když čísla nesedí, je u toho důvod —
                        nemusí se hádat, kde se zpráva ztratila.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                              <th className="text-left py-1.5">Den</th>
                              <th className="text-right py-1.5">Došlo</th>
                              <th className="text-right py-1.5">Uloženo</th>
                              <th className="text-right py-1.5">Duplicita</th>
                              <th className="text-right py-1.5">Zahozeno</th>
                              <th className="text-right py-1.5">Chyba</th>
                            </tr>
                          </thead>
                          <tbody>
                            {denik.map((d) => {
                              const nesedi = Number(d.zahozeno_filtr) > 0 || Number(d.chyba) > 0;
                              return (
                                <tr key={d.den} className={`border-b border-neutral-100 last:border-0 ${nesedi ? 'bg-rose-50/60' : ''}`}>
                                  <td className="py-1.5 font-bold text-neutral-800">{d.den}</td>
                                  <td className="text-right tabular-nums font-black text-neutral-900">{d.doslo}</td>
                                  <td className="text-right tabular-nums font-bold text-emerald-700">{d.ulozeno}</td>
                                  <td className="text-right tabular-nums font-semibold text-neutral-500">{d.duplicita}</td>
                                  <td className={`text-right tabular-nums font-bold ${Number(d.zahozeno_filtr) > 0 ? 'text-rose-700' : 'text-neutral-400'}`}>{d.zahozeno_filtr}</td>
                                  <td className={`text-right tabular-nums font-bold ${Number(d.chyba) > 0 ? 'text-rose-700' : 'text-neutral-400'}`}>{d.chyba}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-neutral-500 font-semibold mt-2">
                        Deník vidí zprávy od chvíle, kdy dorazí na webhook. Co se ztratí dřív (neběžel most na
                        WhatsApp), pozná až dopočtení historie po jeho restartu — most si při připojení vyžádá
                        poslední dny ze skupiny a chybějící zprávy doplní.
                      </p>
                    </div>
                  )}

                  {/* 1) Kdo objednal minulý týden a tenhle ne — nejpraktičtější
                         kontrola, dá se podle ní rovnou zavolat. */}
                  <div className="rounded-xl border-2 border-violet-200 bg-violet-50/60 p-3.5">
                    <div className="font-display font-black text-violet-950 text-sm mb-1">
                      Chybí proti minulému týdnu
                    </div>
                    {pokryti.chybi.length === 0 ? (
                      <p className="text-xs font-bold text-violet-900/70">
                        Všichni, kdo objednali minulý týden, objednali i tenhle.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-violet-900/70 mb-2">
                          Tihle objednali minulý týden a tenhle zatím ne. Nemusí to nic znamenat — ale je to
                          jediné místo, kde se pozná zpráva, která nedorazila.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {pokryti.chybi.map((r) => (
                            <span key={r.odberatel} className="px-2 py-1 rounded-lg bg-white border border-violet-300 text-[11px] font-black text-violet-950">
                              {r.odberatel}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 2) Zprávy od odesílatele mimo seznam — dřív mizely beze stopy. */}
                  {odmitnute.length > 0 && (
                    <div className="rounded-xl border-2 border-rose-300 bg-rose-50/70 p-3.5">
                      <div className="font-display font-black text-rose-950 text-sm mb-1">
                        {odmitnute.length} {odmitnute.length === 1 ? 'zpráva' : odmitnute.length < 5 ? 'zprávy' : 'zpráv'} od neznámého odesílatele
                      </div>
                      <p className="text-xs font-bold text-rose-900/80 mb-2">
                        Nedostaly se do objednávek, protože odesílatel není v seznamu povolených. Když hospoda
                        píše z nového čísla, vypadá to přesně takhle — přidejte ji do povolených v Nastavení.
                      </p>
                      <div className="space-y-1.5">
                        {odmitnute.slice(0, 8).map((z) => (
                          <div key={z.id} className="rounded-lg bg-white border border-rose-200 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-rose-950 truncate">{z.sender_name}</span>
                              <span className="text-[10px] font-bold text-neutral-500 shrink-0">
                                {String(z.created_at).slice(0, 16).replace('T', ' ')}
                              </span>
                            </div>
                            {z.message_preview && (
                              <p className="text-[11px] text-neutral-600 mt-0.5 line-clamp-2">{z.message_preview}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3) Ticho u pravidelného odesílatele. */}
                  {ticho.length > 0 && (
                    <div className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3.5">
                      <div className="font-display font-black text-amber-950 text-sm mb-1">
                        Neobvykle dlouho mlčí ({ticho.length})
                      </div>
                      <p className="text-xs font-bold text-amber-900/80 mb-2">
                        Porovnáno s vlastním rytmem každého odesílatele, ne paušálně.
                      </p>
                      <div className="space-y-1">
                        {ticho.slice(0, 10).map((t) => (
                          <div key={t.odesilatel} className="flex items-center justify-between gap-2 text-xs bg-white rounded-lg border border-amber-200 px-2 py-1.5">
                            <span className="font-black text-amber-950 truncate">{t.odesilatel}</span>
                            <span className="font-bold text-neutral-600 shrink-0 tabular-nums">
                              {t.tichoDnu} dní ticho · obvykle po {t.obvykleDnu} dnech
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4) Výpadek příjmu — nejspíš neběžel most. */}
                  {vypadky.length > 0 && (
                    <div className="rounded-xl border-2 border-neutral-300 bg-white p-3.5">
                      <div className="font-display font-black text-neutral-900 text-sm mb-1">
                        Okna bez jediné zprávy ({vypadky.length})
                      </div>
                      <p className="text-xs font-bold text-neutral-600 mb-2">
                        Podstatně delší ticho, než je v provozu obvyklé — typicky neběžel most na WhatsApp.
                        Co lidé poslali mezitím, se do aplikace nedostalo.
                      </p>
                      <div className="space-y-1">
                        {vypadky.map((v, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 px-2 py-1.5">
                            <span className="font-bold text-neutral-700 truncate">{v.od} → {v.do}</span>
                            <span className="font-black text-neutral-900 shrink-0 tabular-nums">{v.hodin} h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {podezreniCelkem === 0 && (
                    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4 flex items-center gap-3">
                      <CheckCircle size={20} className="text-emerald-600 shrink-0" />
                      <p className="text-xs font-bold text-emerald-900">
                        Nic nenasvědčuje tomu, že by některá zpráva nedorazila.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(activeTab === 'all' || activeTab === 'items_dup') && itemsDupCount > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center justify-between px-1">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={15} className="text-rose-600" />
                      <span>Zdvojené řádky v rámci jedné objednávky ({itemsDupCount})</span>
                    </span>
                    <span className="text-[11px] font-normal text-rose-700">Např. omylem zapsáno 2×</span>
                  </div>

                  {report?.duplicateItemIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 sm:p-4 rounded bg-white border-2 border-rose-300 shadow-xs space-y-3 transition-all hover:shadow-md"
                    >
                      {/* Customer & Order Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-black text-sm sm:text-base text-neutral-950">
                            {issue.placeName}
                          </span>
                          {issue.orderNumber && (
                            <span className="text-[11px] font-bold bg-rose-50 text-rose-900 border border-rose-200 px-2 py-0.5 rounded">
                              Obj. #{issue.orderNumber}
                            </span>
                          )}
                          <span className="text-xs text-neutral-500 font-semibold">
                            (Závoz: {issue.deliveryDate || issue.orderDate})
                          </span>
                        </div>

                        {onOpenOrder && (
                          <button
                            onClick={() => { onOpenOrder(issue.orderId); onClose(); }}
                            className="text-xs font-bold text-neutral-700 hover:text-neutral-950 flex items-center gap-1 hover:underline bg-neutral-100 px-2.5 py-1 rounded border border-neutral-200 transition"
                          >
                            <Eye size={13} /> Otevřít detail
                          </button>
                        )}
                      </div>

                      {/* Duplicate Item Detail */}
                      <div className="p-3 rounded bg-rose-50/80 border border-rose-200/80 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                            <span><BeerIcon className="ikona-text" /></span>
                            <span>{issue.beerName} — {issue.packageLabel}</span>
                          </span>
                          <span className="text-xs font-bold text-rose-900 bg-rose-200/80 px-2 py-0.5 rounded-md">
                            Zapsáno celkem: <strong>{issue.totalQuantity} ks</strong> ({issue.rows.length} řádky)
                          </span>
                        </div>

                        {/* Breakdown of rows */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {issue.rows.map((r, rIdx) => (
                            <span
                              key={r.id}
                              className="bg-white border border-rose-300 text-rose-950 px-2.5 py-1 rounded text-xs font-black shadow-2xs"
                            >
                              {rIdx + 1}. zápis: {r.quantity} ks
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Action Fix Buttons (Touch-friendly) */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        {/* Option 1: Ponechat jen 1. řádek (smazat duplikát) */}
                        <button
                          disabled={actionLoading}
                          onClick={() => handleMergeRows(issue, issue.rows[0].quantity)}
                          className="flex-1 py-2.5 px-3 rounded bg-white hover:bg-rose-50 text-rose-900 border-2 border-rose-300 text-xs font-black transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98]"
                        >
                          <Trash2 size={15} />
                          <span>Ponechat jen 1× ({issue.rows[0].quantity} ks — smazat duplikát)</span>
                        </button>

                        {/* Option 2: Sloučit do jednoho řádku (sečíst) */}
                        <button
                          disabled={actionLoading}
                          onClick={() => handleMergeRows(issue, issue.totalQuantity)}
                          className="flex-1 py-2.5 px-3 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
                        >
                          <Layers size={15} />
                          <span>Sloučit do 1 řádku (sečíst na {issue.totalQuantity} ks)</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. SEKCIE: NESHODY S WHATSAPP ZPRÁVAMI */}
              {(activeTab === 'all' || activeTab === 'wa_mismatch') && waMismatchCount > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center justify-between px-1">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={15} className="text-amber-600" />
                      <span>Neshody s původní WhatsApp zprávou ({waMismatchCount})</span>
                    </span>
                    <span className="text-[11px] font-normal text-amber-700">Porovnání objednávky s textem</span>
                  </div>

                  {report?.whatsappMismatchIssues.map((issue, idx) => {
                    const isExpanded = expandedMsgIds.has(issue.whatsappMessageId);
                    return (
                      <div
                        key={idx}
                        className="p-3.5 sm:p-4 rounded bg-white border-2 border-amber-300 shadow-xs space-y-3 transition-all hover:shadow-md"
                      >
                        {/* Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-black text-sm sm:text-base text-neutral-950">
                              {issue.placeName}
                            </span>
                            {issue.orderNumber && (
                              <span className="text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded">
                                Obj. #{issue.orderNumber}
                              </span>
                            )}
                            <span className="text-xs text-neutral-500 font-semibold">
                              (Od: {issue.senderName})
                            </span>
                          </div>

                          {onOpenOrder && (
                            <button
                              onClick={() => { onOpenOrder(issue.orderId); onClose(); }}
                              className="text-xs font-bold text-amber-900 hover:text-amber-950 flex items-center gap-1 hover:underline bg-amber-50 px-2.5 py-1 rounded border border-amber-200 transition"
                            >
                              <Eye size={13} /> Upravit objednávku
                            </button>
                          )}
                        </div>

                        {/* WhatsApp Message preview / accordion */}
                        <div className="rounded bg-[#EFEAE2] dark:bg-neutral-800 p-2.5 border border-neutral-300/80 space-y-1.5">
                          <div
                            onClick={() => toggleExpandMsg(issue.whatsappMessageId)}
                            className="flex items-center justify-between cursor-pointer select-none text-[11px] font-bold text-neutral-700 dark:text-neutral-300"
                          >
                            <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-400 font-black">
                              <MessageSquare size={13} />
                              <span>Původní WhatsApp zpráva</span>
                            </span>
                            <span className="flex items-center gap-1 text-neutral-500 text-[10px]">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              {isExpanded ? 'Sbalit' : 'Zobrazit text'}
                            </span>
                          </div>

                          {isExpanded ? (
                            <div className="bg-white dark:bg-neutral-900 p-2.5 rounded text-xs font-mono whitespace-pre-wrap text-neutral-900 dark:text-neutral-100 border border-neutral-200 max-h-36 overflow-y-auto">
                              {issue.messageText || '(prázdná zpráva / fotka)'}
                            </div>
                          ) : (
                            <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 italic font-mono bg-white/70 dark:bg-neutral-900/70 p-1.5 rounded">
                              {issue.messageText || '(zpráva obsahuje fotku/přílohu)'}
                            </div>
                          )}
                        </div>

                        {/* Identified Differences Grid */}
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-black uppercase tracking-wider text-amber-950">
                            Zjištěné neshody v položkách:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {issue.mismatches.map((m, mIdx) => (
                              <div
                                key={mIdx}
                                className={`p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                                  m.kind === 'qty_diff'
                                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                                    : m.kind === 'missing_in_order'
                                    ? 'bg-rose-50 text-rose-950 border-rose-300'
                                    : 'bg-purple-50 text-purple-950 border-purple-300'
                                }`}
                              >
                                <div>
                                  <div className="font-black text-xs flex items-center gap-1.5">
                                    <span>
                                      {m.kind === 'qty_diff' ? '🟡' : m.kind === 'missing_in_order' ? '🔴' : '🟣'}
                                    </span>
                                    <span>{m.beerName} ({m.packageLabel})</span>
                                  </div>
                                  <div className="text-[11px] mt-1 font-medium">
                                    {m.kind === 'qty_diff' && (
                                      <span>Ve zprávě <strong>{m.expectedQty} ks</strong> ➔ v objednávce <strong>{m.actualQty} ks</strong></span>
                                    )}
                                    {m.kind === 'missing_in_order' && (
                                      <span>Ve zprávě <strong>{m.expectedQty} ks</strong> ➔ v objednávce <strong className="text-rose-700">CHYBÍ</strong></span>
                                    )}
                                    {m.kind === 'extra_in_order' && (
                                      <span>V objednávce <strong>{m.actualQty} ks</strong> ➔ ve zprávě nebylo</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 3. SEKCIE: DUPLICITNÍ CELÉ OBJEDNÁVKY */}
              {(activeTab === 'all' || activeTab === 'order_dup') && orderDupCount > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center justify-between px-1">
                    <span className="flex items-center gap-1.5">
                      <Copy size={15} className="text-purple-600" />
                      <span>Podezřelé duplicitní objednávky ({orderDupCount})</span>
                    </span>
                    <span className="text-[11px] font-normal text-purple-700">Stejný zákazník v témže týdnu</span>
                  </div>

                  {report?.duplicateOrderIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 sm:p-4 rounded bg-white border-2 border-purple-300 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                        <span className="font-display font-black text-sm sm:text-base text-neutral-950">
                          {issue.placeName}
                        </span>
                        <span className="text-xs text-purple-900 font-bold bg-purple-100 px-2 py-0.5 rounded">
                          Týden od {issue.deliveryWeek}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {issue.orders.map((o) => (
                          <div key={o.id} className="p-3 rounded bg-purple-50/70 border border-purple-200 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-black text-purple-950">
                                {o.orderNumber ? `Objednávka #${o.orderNumber}` : 'Objednávka'}
                              </span>
                              <span className="text-[11px] font-bold text-neutral-500">
                                {o.deliveryDate || o.orderDate}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-700">
                              <strong>Položky:</strong> {o.itemsSummary}
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-purple-200/50">
                              <span className="text-[11px] font-bold text-neutral-600">
                                Celkem: {o.totalLiters} L
                              </span>
                              <div className="flex items-center gap-1">
                                {onOpenOrder && (
                                  <button
                                    onClick={() => { onOpenOrder(o.id); onClose(); }}
                                    className="p-1.5 rounded bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold"
                                    title="Zobrazit"
                                  >
                                    <Eye size={13} />
                                  </button>
                                )}
                                <button
                                  disabled={actionLoading}
                                  onClick={() => handleStornoOrder(o.id)}
                                  className="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 font-black text-xs transition"
                                  title="Stornovat duplikát"
                                >
                                  Stornovat
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 4. SEKCIE: ČEKAJÍCÍ / NEPROPADLÉ ZPRÁVY */}
              {(activeTab === 'all' || activeTab === 'unprocessed') && unprocessedCount > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center justify-between px-1">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={15} className="text-blue-600" />
                      <span>Čekající / Nepropadlé zprávy ({unprocessedCount})</span>
                    </span>
                    <span className="text-[11px] font-normal text-blue-700">Zprávy s pivem bez objednávky</span>
                  </div>

                  {report?.unprocessedWhatsAppIssues.map((issue) => (
                    <div
                      key={issue.messageId}
                      className="p-3.5 sm:p-4 rounded bg-white border-2 border-blue-300 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-black text-sm text-neutral-950">
                            {issue.placeName || issue.senderName || 'Neznámý odběratel'}
                          </span>
                          <span className="text-[11px] font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                            {issue.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-500 font-medium">
                          {new Date(issue.createdAt).toLocaleDateString('cs-CZ')}
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-blue-50/70 border border-blue-200 text-xs font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {issue.messageText || '(pouze foto / příloha)'}
                      </div>

                      <div className="text-xs text-blue-950 font-bold">
                        Detekované pivo: <span className="font-normal text-neutral-800">{issue.itemsSummary}</span>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          disabled={actionLoading}
                          onClick={() => handleIgnoreWhatsApp(issue.messageId)}
                          className="btn-secondary !py-1.5 !px-3 text-xs font-bold text-neutral-600"
                        >
                          Ignorovat
                        </button>
                        {onProcessWhatsApp && (
                          <button
                            onClick={() => { onProcessWhatsApp(issue.messageId); onClose(); }}
                            className="btn-primary !rounded !py-1.5 !px-4 text-xs font-black shadow-sm flex items-center gap-1"
                          >
                            <span>Zkontrolovat a vytvořit objednávku</span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-white border-t border-neutral-200 flex items-center justify-between shrink-0">
          <div className="text-xs font-bold">
            {totalIssues === 0 ? (
              <span className="text-emerald-700 flex items-center gap-1.5">
                <CheckCircle size={15} /> Všechny objednávky odpovídají předlohám
              </span>
            ) : (
              <span className="text-amber-900 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-amber-600" />
                <span>Nalezeno {totalIssues} záležitostí k prověření</span>
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="btn-primary !rounded text-xs font-black py-2 px-5 rounded shadow-sm"
          >
            Zavřít
          </button>
        </div>

      </div>
    </div>
  );
}
