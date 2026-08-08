import { useState, useEffect } from 'react';
import { Beer, Package, Place } from '../lib/supabase';
import { WhatsAppIncoming, ignoreWhatsAppMessage } from '../lib/whatsappApi';
import { loadAliasMap, saveAlias, matchBeerFromHints, matchPackage, matchPlaceFromText, savePlaceAlias, normalize, type ParserAliasMap } from '../lib/orderParser';
import { PlaceCombobox } from './PlaceCombobox';
import { Modal } from './ui';
import { Check, X, MessageSquare, Image as ImageIcon, AlertCircle, UserCheck } from 'lucide-react';

interface WhatsAppOrderReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Zavolá se po úspěšném potvrzení/zamítnutí/ignorování zprávy — parent tak
      může hned přejít na další čekající zprávu (postupné kontrolování). */
  onDecision?: () => void;
  message: WhatsAppIncoming;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  onApprove: (message: WhatsAppIncoming) => Promise<void>;
  onReject: (message: WhatsAppIncoming) => Promise<void>;
}

function ButtonSpinner() {
  return <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />;
}

interface ReviewItem {
  key: string;
  beerId: string;
  pkgId: string;
  qty: string;
  degree?: string;
  beerName?: string;
  packageLabel?: string;
  rawLine?: string;
}

export function WhatsAppOrderReviewModal(props: WhatsAppOrderReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [origPlaceName, setOrigPlaceName] = useState<string | null>(null);

  // Při otevření modálu načteme naučené aliasy a doplníme ke každé položce
  // správné pivo/obal z katalogu (podle názvu, stupně a balení). Uživatel může
  // přiřazení před schválením opravit.
  useEffect(() => {
    if (!props.isOpen || !props.message) return;
    let cancelled = false;
    (async () => {
      let aliasMap: ParserAliasMap = { beer: new Map(), package: new Map() };
      try { aliasMap = await loadAliasMap(); } catch { /* bez aliasů pokračujeme */ }
      if (cancelled) return;

      const parsedItems = props.message!.parsed_items || [];
      const initItems: ReviewItem[] = parsedItems.map((item, i) => {
        const beer =
          props.beers.find((b) => b.id === item.beer_id) ??
          // Přednost má původní text objednávky (raw_line) — název od AI může být špatný
          matchBeerFromHints(
            normalize([item.raw_line, item.degree].filter(Boolean).join(' ')),
            props.beers,
            aliasMap
          ).beer ??
          matchBeerFromHints(
            normalize(item.beer_name || ''),
            props.beers,
            aliasMap
          ).beer;
        const pkg =
          props.packages.find((p) => p.id === item.pkg_id) ??
          matchPackage(
            normalize([item.package_label, item.raw_line].filter(Boolean).join(' ')),
            props.packages,
            aliasMap
          );
        return {
          key: `item-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          beerId: beer?.id || '',
          pkgId: pkg?.id || '',
          qty: String(item.qty ?? 1),
          degree: item.degree,
          beerName: item.beer_name,
          packageLabel: item.package_label,
          rawLine: item.raw_line,
        };
      });
      setItems(initItems);

      // Odběratel: předvyplň z AI (parsed_place_id / parsed_place_name) — uživatel
      // ho může v modálu opravit; oprava se uloží jako naučený alias pro příště.
      let initialPlaceId = props.message.parsed_place_id || '';
      let initialPlaceName = props.message.parsed_place_name || '';
      if (!initialPlaceId && initialPlaceName) {
        const matched = matchPlaceFromText(initialPlaceName, props.places);
        if (matched.placeId && matched.placeName) initialPlaceId = matched.placeId;
      }
      setPlaceId(initialPlaceId);
      setPlaceName(initialPlaceName || props.places.find((p) => p.id === initialPlaceId)?.name || '');
      setOrigPlaceName(initialPlaceName || null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, props.message?.id]);

  function updateItemBeer(index: number, beerId: string) {
    const next = [...items];
    const prev = next[index];
    if (beerId && beerId !== prev.beerId) {
      const aliasText = (prev.beerName || prev.rawLine || '').trim();
      if (aliasText) saveAlias(aliasText.slice(0, 120), beerId, null).catch(() => {});
    }
    next[index] = { ...prev, beerId };
    setItems(next);
  }

  function updateItemPkg(index: number, pkgId: string) {
    const next = [...items];
    const prev = next[index];
    if (pkgId && pkgId !== prev.pkgId) {
      const aliasText = (prev.packageLabel || prev.rawLine || '').trim();
      if (aliasText) saveAlias(aliasText.slice(0, 120), null, pkgId).catch(() => {});
    }
    next[index] = { ...prev, pkgId };
    setItems(next);
  }

  function updateItemQty(index: number, qty: string) {
    const next = [...items];
    next[index] = { ...next[index], qty };
    setItems(next);
  }

  function updatePlace(pid: string, pname: string) {
    setPlaceId(pid);
    setPlaceName(pname);
  }

  if (!props.isOpen || !props.message) return null;

  const message = props.message;
  const isImage = message.message_type.includes('image');
  const isParsed = message.status === 'parsed';
  const isPending = message.status === 'pending';
  const parsedItems = message.parsed_items || [];
  const hasParsedData = parsedItems.length > 0 || message.parsed_place_name || message.parsed_delivery_date;

  const handleApprove = async () => {
    setApproving(true);
    setStatusMessage('Schvaluji objednávku...');

    try {
      // 🧠 Učení: uživatel opravil odběratele, kterého AI rozpoznala špatně →
      // ulož alias (špatný název od AI → správný odběratel), aby to AI příště věděla.
      const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const finalPlaceName = placeName.trim();
      if (origPlaceName && finalPlaceName && normName(origPlaceName) !== normName(finalPlaceName)) {
        savePlaceAlias(origPlaceName, placeId, finalPlaceName).catch(() => {});
      }

      // Zkopírujeme zprávu s položkami, jak je uživatel případně opravil
      // (správné pivo/obal z katalogu, upravené množství, opravený odběratel).
      const editedMessage: WhatsAppIncoming = {
        ...message,
        parsed_place_id: placeId || message.parsed_place_id,
        parsed_place_name: placeName || message.parsed_place_name,
        parsed_items: items.map((it) => ({
          beer_id: it.beerId || null,
          pkg_id: it.pkgId || null,
          qty: parseInt(it.qty, 10) || 0,
          degree: it.degree || null,
          beer_name: it.beerName || null,
          package_label: it.packageLabel || null,
          raw_line: it.rawLine || null,
        })) as WhatsAppIncoming['parsed_items'],
      };
      await props.onApprove(editedMessage);
      setStatusMessage('Objednávka byla schválena a importována!');

      // Po krátké době zavřít modal a přejít na další čekající zprávu
      setTimeout(() => {
        props.onClose();
        props.onDecision?.();
      }, 1500);
    } catch (error) {
      console.error('Chyba při schvalování:', error);
      setStatusMessage('Chyba při schvalování: ' + (error as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Opravdu chcete zamítnout tuto WhatsApp objednávku?')) return;

    setRejecting(true);
    setStatusMessage('Zamítám objednávku...');

    try {
      await props.onReject(message);
      setStatusMessage('Objednávka byla zamítnuta!');

      // Po krátké době zavřít modal a přejít na další čekající zprávu
      setTimeout(() => {
        props.onClose();
        props.onDecision?.();
      }, 1500);
    } catch (error) {
      console.error('Chyba při zamítnutí:', error);
      setStatusMessage('Chyba při zamítnutí: ' + (error as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  const handleIgnore = async () => {
    if (!confirm('Opravdu chcete tuto zprávu ignorovat? Nebude importována do objednávek.')) return;

    setLoading(true);
    try {
      await ignoreWhatsAppMessage(message.id);
      props.onClose();
      props.onDecision?.();
    } catch (error) {
      console.error('Chyba při ignorování:', error);
      setStatusMessage('Chyba při ignorování: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={props.isOpen} onClose={props.onClose} title="🛒 Kontrola WhatsApp objednávky" wide>
      <div className="space-y-6">
        {/* Informace o zprávě */}
        <div className="border rounded-xl p-4 bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            {isImage ? (
              <ImageIcon size={18} className="text-blue-600" />
            ) : (
              <MessageSquare size={18} className="text-blue-600" />
            )}
            <div className="font-medium text-blue-800">Nová WhatsApp objednávka</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm text-neutral-600">Odesílatel</div>
              <div className="font-medium">{message.sender_name}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-600">Čas přijetí</div>
              <div className="font-medium">
                {new Date(message.created_at).toLocaleString('cs-CZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            <div>
              <div className="text-sm text-neutral-600">Typ zprávy</div>
              <div className="font-medium flex items-center gap-1">
                {isImage ? (
                  <>
                    <ImageIcon size={14} /> Fotka
                  </>
                ) : (
                  <>
                    <MessageSquare size={14} /> Text
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm text-neutral-600">Stav zpracování</div>
              <div className="font-medium">
                {isParsed ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <Check size={14} /> Rozparsováno AI
                  </span>
                ) : isPending ? (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertCircle size={14} /> Čeká na parsování
                  </span>
                ) : (
                  <span className="text-neutral-600">Zpracovává se...</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Originální obsah */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-2">
            <MessageSquare size={16} />
            Originální zpráva
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50 font-mono text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
            {message.message_text || '(bez textu - fotka)'}
          </div>
        </div>

        {/* Rozparsované informace (pokud jsou) */}
        {hasParsedData && (
          <div>
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <Check size={16} className="text-green-600" />
              AI rozpoznalo z objednávky
            </div>

            <div className="border rounded-lg p-4 bg-green-50 space-y-3">
              <div>
                <div className="text-sm text-neutral-600 mb-1 flex items-center gap-1">
                  Odběratel
                  {message.parsed_place_name && (
                    <span className="text-xs text-neutral-400 font-normal">(AI: {message.parsed_place_name})</span>
                  )}
                </div>
                <PlaceCombobox value={placeId || placeName} onChange={updatePlace} places={props.places} />
              </div>

              {(message.parsed_delivery_day || message.parsed_delivery_date) && (
                <div>
                  <div className="text-sm text-neutral-600">Datum dodání</div>
                  <div className="font-medium">
                    {message.parsed_delivery_day && `Den: ${message.parsed_delivery_day}`}
                    {message.parsed_delivery_date && ` Datum: ${message.parsed_delivery_date}`}
                  </div>
                </div>
              )}

              {items.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-sm text-neutral-600 mb-1">
                    Položky objednávky
                    <span className="text-xs text-amber-700">(zkontrolujte a opravte přiřazení piva/obalu)</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((item, index) => {
                      const hasBeer = !!props.beers.find((b) => b.id === item.beerId);
                      const hasPkg = !!props.packages.find((p) => p.id === item.pkgId);
                      return (
                        <div key={item.key} className="p-2 bg-white rounded border">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => updateItemQty(index, e.target.value)}
                              className="input !py-1 !px-2 text-sm font-bold w-16 text-center"
                              title="Množství"
                            />
                            <select
                              value={item.beerId}
                              onChange={(e) => updateItemBeer(index, e.target.value)}
                              className="select !py-1 text-sm font-medium flex-1 min-w-[130px]"
                            >
                              <option value="">(Vyber pivo)</option>
                              {props.beers.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                            <select
                              value={item.pkgId}
                              onChange={(e) => updateItemPkg(index, e.target.value)}
                              className="select !py-1 text-sm font-medium flex-1 min-w-[110px]"
                            >
                              <option value="">(Vyber obal)</option>
                              {props.packages.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                          {item.rawLine && (
                            <div className="text-xs text-neutral-500 mt-1">„{item.rawLine}"</div>
                          )}
                          {(!hasBeer || !hasPkg) && (
                            <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                              <AlertCircle size={12} /> Pivo/obal se nepodařilo přiřadit automaticky — vyberte z nabídky
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Informace o stavu */}
        {statusMessage && (
          <div className={`p-3 rounded-lg ${statusMessage.includes('Chyba') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {statusMessage}
          </div>
        )}

        {/* Akce */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between pt-4 border-t">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleIgnore}
              disabled={loading}
              className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Ignorovat zprávu
            </button>

            <button
              onClick={handleReject}
              disabled={rejecting || loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {rejecting ? <ButtonSpinner /> : <X size={16} />}
              Zamítnout objednávku
            </button>
          </div>

          <button
            onClick={handleApprove}
            disabled={approving || loading || !isParsed}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {approving ? <ButtonSpinner /> : <UserCheck size={16} />}
            {isParsed ? 'Schválit a importovat' : 'Čeká na parsování...'}
          </button>
        </div>

        {/* Informace pro uživatele */}
        <div className="text-sm text-neutral-500 bg-amber-50 p-3 rounded-lg border border-amber-200">
          <div className="font-medium text-amber-800 mb-1">Jak to funguje?</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Zkontrolujte originální zprávu/fotku</li>
            <li>Prohlédněte si, co AI rozpoznalo z objednávky</li>
            <li>Schválte import - objednávka se automaticky vytvoří v systému</li>
            <li>Pokud není objednávka správná, zamítněte ji nebo ignorujte</li>
            <li>Opravené pivo/obal/odběratele si AI pamatuje a příště je pozná sama</li>
            <li>Schválit může každý uživatel s přístupem do aplikace</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}

