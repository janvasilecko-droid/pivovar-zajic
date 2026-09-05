import { useState, useEffect, useRef } from 'react';
import { Beer, Package, Place, fetchAllRows, supabase } from '../lib/supabase';
import { WhatsAppIncoming, ignoreWhatsAppMessage, updateWhatsAppParsedData } from '../lib/whatsappApi';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';
import { loadAliasMap, saveAlias, canLearnBeerAlias, matchBeerFromHints, matchPackage, matchPlaceFromText, savePlaceAlias, normalize, type ParserAliasMap } from '../lib/orderParser';
import {
  diffOrderItems, rozsahOdpovedi, slozNavrh, potvrzeneBezPolozek,
  type DiffRow, type RozsahOdpovedi, type SkupinaObalu,
} from '../lib/whatsappAmendment';
import { PlaceCombobox } from './PlaceCombobox';
import { QuickQtySelect } from './QuickQtySelect';
import { Modal } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import {
  analyzeReadback,
  buildHighlightedSegments,
  diffWords,
  computeReadbackUnmatchedCount,
  partKindLabel,
  type ReadbackItem,
  type ReadbackMatch,
  type ReadbackStatus,
} from '../lib/whatsappReadback';
import { AlertCircle, AlertTriangle, ArrowDown, Check, CheckCircle2, ChevronDown, Download, ExternalLink, Eye, FileText, Image as ImageIcon, MessageSquare, RefreshCw, ShieldAlert, ShieldCheck, ShoppingCart, UserCheck, X } from 'lucide-react';
import { potvrd } from '../lib/toast';
import { zalogujANahlas } from '../lib/chybyHlaseni';
import { useChovaniDialogu } from '../lib/zavriNaZpet';

/** Jak se skupiny obalů pojmenují v přehledu úpravy. */
const NAZVY_SKUPIN: Record<SkupinaObalu, string> = {
  maly_sud: 'Malé sudy (10–20 l)',
  tricitka: 'Třicítky',
  padesatka: 'Padesátky',
  petka: 'Petky (PET)',
  lahev: 'Lahve',
  jine: 'Ostatní',
};

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
  degree?: string | null;
  beerName?: string | null;
  packageLabel?: string | null;
  rawLine?: string | null;
}

/** Klíč přísného režimu (blokace schválení při nesouladu) v localStorage. */
const READBACK_STRICT_KEY = 'whatsapp_readback_require_fix';

export function WhatsAppOrderReviewModal(props: WhatsAppOrderReviewModalProps) {
  // Zpět zavře kontrolu objednávky místo odchodu z obrazovky. Tady na tom
  // záleží nejvíc: v kontrole se opravují rozpoznané položky a odchod
  // z obrazovky je zahodí.
  useChovaniDialogu(props.isOpen, props.onClose);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [origPlaceName, setOrigPlaceName] = useState<string | null>(null);
  const [strictReadback, setStrictReadback] = useState(false);
  const [prevRawText, setPrevRawText] = useState<string | null>(null);
  const [rebuildKey, setRebuildKey] = useState(0);
  // Explicitní potvrzení "porovnal/a jsem fotku s přepisem" u fotoobjednávek
  // — dokud uživatel nekliknul, schválení je zamčené (ať se fotka opravdu
  // zkontroluje, ne jen proklikne).
  const [photoChecked, setPhotoChecked] = useState(false);
  // Reference na položky pro auto-posun na první nesoulad (#9).
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Uživatel ručně upravil odběratele — inicializace ho nesmí přepsat.
  const placeTouchedRef = useRef(false);
  // Interní stav zprávy — po „přečtení znovu (AI)" se aktualizuje lokálně,
  // aby se přepis, položky i kontrola čtení okamžitě překreslily.
  const [msg, setMsg] = useState<WhatsAppIncoming | null>(props.message);
  // Rozdíl mezi současnou objednávkou a tím, co z odpovědi vyšlo.
  const [amendDiff, setAmendDiff] = useState<DiffRow[]>([]);
  const [amendPlace, setAmendPlace] = useState<string | null>(null);
  const [amendLoading, setAmendLoading] = useState(false);
  // Původní zpráva, ze které objednávka vznikla — vedle odpovědi se ukazuje
  // k porovnání. Bez ní obsluha nemá podle čeho poznat, jestli „malé soudky
  // budou…" nahradilo to, co mělo.
  const [amendOriginalMsg, setAmendOriginalMsg] = useState<
    { message_text: string | null; media_url: string | null; created_at: string } | null
  >(null);
  // Které skupiny obalů odpověď diktuje znovu a které jen potvrzuje.
  const [amendRozsah, setAmendRozsah] = useState<RozsahOdpovedi>({ nahradit: [], potvrzeno: [] });
  // Skupiny, které odpověď potvrdila („petky sedí"), ale v načtené objednávce
  // k nim není jediná položka — obsluha to musí vidět, jinak z „sedí" tiše
  // nevznikne nic (např. petky z PDF se do objednávky nedostaly).
  const [amendPotvrzenoPrazdne, setAmendPotvrzenoPrazdne] = useState<SkupinaObalu[]>([]);

  // Synchronizace s prop (otevření nové zprávy).
  useEffect(() => {
    setMsg(props.message);
    setStatusMessage(null);
    setPrevRawText(null);
    setPhotoChecked(false);
  }, [props.message?.id]);

  // Přísný režim: zakázat schválení, dokud nejsou nesoulady opraveny.
  useEffect(() => {
    try { setStrictReadback(localStorage.getItem(READBACK_STRICT_KEY) === '1'); } catch { /* */ }
  }, []);

  // Odběratel (parsed_place_id / parsed_place_name) — předvyplň z AI. Inicializace
  // je SYNCHRONNÍ a nezávisí na načítání aliasů. Dřív probíhala až po asynchronním
  // loadAliasMap() (síťový dotaz), takže když uživatel začal psát odběratele dřív,
  // než dotaz doběhl, jeho vstup se přepsal parsed_place_name („nedal se
  // objednavatel do pole“). Uživatel ho pak může v modálu opravit; oprava se uloží
  // jako naučený alias pro příště a zapíše se i zpět do zprávy.
  useEffect(() => {
    if (!props.isOpen || !msg) return;
    placeTouchedRef.current = false;
    let pid = msg.parsed_place_id || '';
    const pname = msg.parsed_place_name || '';
    if (!pid && pname) {
      const matched = matchPlaceFromText(pname, props.places);
      if (matched.placeId && matched.placeName) pid = matched.placeId;
    }
    setPlaceId(pid);
    setPlaceName(pname || props.places.find((p) => p.id === pid)?.name || '');
    setOrigPlaceName(pname || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, msg?.id]);

  // Při otevření modálu načteme naučené aliasy a doplníme ke každé položce
  // správné pivo/obal z katalogu (podle názvu, stupně a balení). Uživatel může
  // přiřazení před schválením opravit.
  useEffect(() => {
    if (!props.isOpen || !msg) return;
    let cancelled = false;
    (async () => {
      let aliasMap: ParserAliasMap = { beer: new Map(), package: new Map() };
      try { aliasMap = await loadAliasMap(); } catch { /* bez aliasů pokračujeme */ }
      if (cancelled) return;

      const parsedItems = msg!.parsed_items || [];
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
          key: `item-${msg!.id}-${i}-${Date.now()}`,
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
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, msg?.id, rebuildKey]);

  // ↩️ Když zpráva upravuje existující objednávku, načti její SOUČASNÝ obsah
  // a porovnej s tím, co z odpovědi vyšlo — obsluha pak vidí celou objednávku
  // se zvýrazněnými změnami, ne jen samotnou odpověď.
  useEffect(() => {
    if (!props.isOpen || !msg?.amends_order_id) {
      setAmendDiff([]); setAmendPlace(null); setAmendOriginalMsg(null);
      setAmendRozsah({ nahradit: [], potvrzeno: [] });
      setAmendPotvrzenoPrazdne([]);
      return;
    }
    let zruseno = false;
    setAmendLoading(true);
    (async () => {
      // Celá původní objednávka + zpráva, ze které vznikla. Obojí naráz:
      // objednávka kvůli obsahu, zpráva kvůli náhledu k porovnání.
      const [{ data }, { data: puvodni }] = await Promise.all([
        supabase
          .from('orders')
          .select('place_name, items:order_items(beer_id, package_id, quantity)')
          .eq('id', msg.amends_order_id!)
          .maybeSingle(),
        supabase
          .from('whatsapp_incoming')
          .select('message_text, media_url, created_at')
          .eq('imported_order_id', msg.amends_order_id!)
          .order('created_at', { ascending: true })
          .limit(1),
      ]);
      if (zruseno) return;
      setAmendPlace((data as any)?.place_name ?? null);
      setAmendOriginalMsg((((puvodni as any[]) ?? [])[0] as any) ?? null);

      const soucasne = (((data as any)?.items ?? []) as any[]).map((i) => ({
        beer_id: i.beer_id, package_id: i.package_id, quantity: Number(i.quantity || 0),
      }));
      const zOdpovedi = items.map((it) => ({
        beer_id: it.beerId || null, package_id: it.pkgId || null, quantity: Number(it.qty) || 0,
      }));

      // ↩️ Odpověď mluví o ČÁSTI objednávky. „Ty male soudky budou … Tricitky
      //    a petky sedi" nahrazuje jen malé sudy; třicítky a petky zůstávají.
      //    Dřív se návrh z odpovědi bral jako celý nový obsah, takže všechno
      //    nejmenované vyšlo jako „odebrat" — u téhle zprávy by z objednávky
      //    spadly 2 třicítky a 24 petek, o kterých odběratel napsal, že sedí.
      const rozsah = rozsahOdpovedi(msg.message_text);
      setAmendRozsah(rozsah);
      const obaly = props.packages.map((p) => ({
        id: p.id, label: p.label, kind: (p as any).kind, volume_l: (p as any).volume_l,
      }));
      const navrh = slozNavrh({ soucasne, zOdpovedi, text: msg.message_text, obaly });

      setAmendDiff(diffOrderItems(soucasne, navrh));
      setAmendPotvrzenoPrazdne(potvrzeneBezPolozek({ soucasne, potvrzeno: rozsah.potvrzeno, obaly }));
      setAmendLoading(false);
    })();
    return () => { zruseno = true; };
     
  }, [props.isOpen, msg?.amends_order_id, msg?.message_text, items, props.packages]);

  const beerNameById = (id: string | null) => props.beers.find((b) => b.id === id)?.name ?? '(neurčené pivo)';
  const pkgLabelById = (id: string | null) => String(props.packages.find((p) => p.id === id)?.label ?? '').trim();

  function updateItemBeer(index: number, beerId: string) {
    const next = [...items];
    const prev = next[index];
    if (beerId && beerId !== prev.beerId) {
      // Zkratku si zapamatuj jen tehdy, když z ní vzejde použitelné pravidlo —
      // ne když opravovaný text správně jmenuje jiné pivo z katalogu nebo nese
      // cizí stupeň (viz canLearnBeerAlias). Jinak by jedna oprava jedné
      // objednávky rozbila čtení všech dalších zpráv.
      const aliasText = (prev.beerName || prev.rawLine || '').trim();
      if (aliasText && canLearnBeerAlias(aliasText, beerId, props.beers)) {
        saveAlias(aliasText.slice(0, 120), beerId, null).catch(() => {});
      }
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

  function deleteItem(index: number) {
    // ✕ Smazání položky: odebereme ji z editačního seznamu i z lokálního stavu
    // zprávy, aby kontrola čtení (readback) a indexy položek zůstaly v souladu.
    // Do databáze se smazání zapíše až při schválení (viz handleApprove), takže
    // zavřením modálu bez schválení se nic neztratí.
    setItems((prev) => prev.filter((_, i) => i !== index));
    setMsg((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        parsed_items: (prev.parsed_items || []).filter((_, i) => i !== index),
      };
    });
  }

  function updatePlace(pid: string, pname: string) {
    placeTouchedRef.current = true;
    setPlaceId(pid);
    setPlaceName(pname);
  }

  function toggleStrictReadback() {
    const next = !strictReadback;
    setStrictReadback(next);
    try { localStorage.setItem(READBACK_STRICT_KEY, next ? '1' : '0'); } catch { /* */ }
  }

  // Auto-posun na první nesoulad (⚠/≈) při otevření modálu. Musí být před
  // early returnem, aby byl počet hooks konzistentní napříč renderem (#9).
  const preReadback = msg ? analyzeReadback(msg) : null;
  const firstMismatchIndex = preReadback?.items.find(
    (i) => i.status === 'unmatched' || i.status === 'fuzzy'
  )?.index ?? -1;
  useEffect(() => {
    if (props.isOpen && firstMismatchIndex >= 0 && itemRefs.current[firstMismatchIndex]) {
      const t = setTimeout(() => {
        itemRefs.current[firstMismatchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [props.isOpen, firstMismatchIndex]);

  if (!props.isOpen || !msg) return null;

  const message = msg;
  // Starší zprávy (Make.com/Tasker před bridge) můžou mít message_type NULL —
  // nesmí to shodit render (TypeError na .includes).
  const isImage = (message.message_type || '').includes('image');
  // Fotoobjednávka s dostupnou fotkou → napevno přilepený panel s fotkou
  // nahoře a scrollovatelný zbytek dole (místo běžného Modalu), ať jde
  // fotku průběžně porovnávat s přepsanými položkami při scrollování.
  const useFullscreenPhotoLayout = isImage && !!message.media_url;
  // Textová objednávka s originálním textem → stejný princip jako u fotky:
  // napevno přilepený originál zprávy nahoře a scrollovatelné položky dole,
  // ať jde text průběžně porovnávat s tím, co se z něj zapsalo.
  const useFullscreenTextLayout = !isImage && !!message.message_text;
  const isParsed = message.status === 'parsed';
  const isPending = message.status === 'pending';
  const isImported = message.status === 'imported';
  const parsedItems = message.parsed_items || [];
  const hasParsedData = parsedItems.length > 0 || message.parsed_place_name || message.parsed_delivery_date;

  // Položka bez přiřazeného piva/obalu by se v order_items zapsala s
  // beer_id/package_id = null a mlčky by zmizela ze všech skladových výpočtů
  // (ty všude filtrují „if (!beer_id || !package_id) return"). Amber varování
  // u položky (níže) samo o sobě schválení nezablokuje, proto se to musí
  // vynutit i tady — stejně jako EditOrderModal.tsx vyžaduje beerId+pkgId.
  const hasUnmatchedItems = items.some((it) => !it.beerId || !it.pkgId);

  // Kontrola čtení: porovnání raw_line položek (to, co AI tvrdí, že přečetla)
  // s originálním textem zprávy. Přesná shoda ✓, částečná (překlepy/pořadí slov)
  // ≈, žádná shoda ⚠. K tomu kontrola po částech (množství/objem/stupeň).
  const readback = preReadback!;
  const readbackByItem = new Map(readback.items.map((i) => [i.index, i]));
  // Zvýraznit originál lze jen u položek s polohou v textu (match). Regrese
  // „Cannot read properties of null (reading 'start')“ u fotek ukázala, že status
  // 'fuzzy' nemusí nutně znamenat nenulový match — proto ho ověřujeme výslovně.
  const matchedReadback = readback.items.filter(
    (i): i is ReadbackItem & { match: ReadbackMatch } =>
      i.match !== null && (i.status === 'matched' || i.status === 'fuzzy')
  );
  const originalSegments = buildHighlightedSegments(
    message.message_text || '',
    matchedReadback.map((i) => ({
      start: i.match.start,
      end: i.match.end,
      badge: i.index + 1,
      tone: i.status === 'matched' ? ('ok' as const) : ('warn' as const),
    }))
  );
  const transcriptSegments = message.parsed_raw_text
    ? diffWords(message.message_text || '', message.parsed_raw_text)
    : [];

  // Originál zprávy — v běžném (Modal) zobrazení součást gridu "Kontrola
  // čtení", u textových objednávek (useFullscreenTextLayout) se stejný obsah
  // vykreslí zvlášť v napevno přilepeném panelu nahoře (viz níže).
  const originalMessageBlock = (
    <div>
      <div className="text-xs font-medium text-neutral-500 mb-1 flex items-center gap-1">
        <MessageSquare size={12} /> Originál zprávy
      </div>
      <div className="border rounded p-3 bg-white font-mono text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">
        {message.message_text ? (
          originalSegments.map((seg, si) =>
            seg.highlighted ? (
              <span
                key={si}
                className={seg.tone === 'warn' ? 'bg-amber-200/80 rounded px-0.5' : 'bg-emerald-200/80 rounded px-0.5'}
                title={`AI četla odtud — položka ${seg.badges.join(', ')}`}
              >
                {seg.text}
                {seg.badges.map((b) => (
                  <sup key={b} className="text-udaj font-bold text-neutral-700 ml-0.5">#{b}</sup>
                ))}
              </span>
            ) : (
              <span key={si}>{seg.text}</span>
            )
          )
        ) : (
          <span className="text-neutral-400">(bez textu - fotka)</span>
        )}
      </div>
    </div>
  );

  const handleApprove = async () => {
    // Blokace/varování při nesouladu čtení (⚠/≈) — u fotoobjednávek je toto
    // porovnání (popisek zprávy vs. přepis fotky) nesmysluplné, tam kontrolu
    // řeší tlačítko "Zkontrolovat fotku a potvrdit" (photoChecked) níže.
    // V přísném režimu je tlačítko rovnou neaktivní; jinak se zeptáme a
    // uživatel může vědomě pokračovat.
    if (!isImage && readback.mismatchCount > 0 && !strictReadback) {
      const ok = (await potvrd(
        `${readback.mismatchCount} z ${readback.items.length} položek nesouhlasí s originálem (AI mohla špatně přečíst).\n\n` +
        `Pokračovat a i přesto objednávku schválit?` +
        (readback.unmatchedCount > 0
          ? `\n\nTip: přísný režim („Vyžadovat opravu nesouladů") schválení zablokuje, dokud je neopravíte.`
          : '')
      ));
      if (!ok) {
        setStatusMessage('Schválení zrušeno — nejprve zkontrolujte nesoulady čtení.');
        return;
      }
    }

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

      // 💾 Opraveného odběratele i upravené/smazané položky zapíšeme zpět do zprávy
      // (před importem — ještě je status 'parsed', takže ho update nepřehodí na
      // 'imported'). Bez toho by se po zavření/znovuotevření modálu ukázal zase
      // starý název od AI, resp. smazaná položka, a korekce by se „ztratila“.
      // Vlastní import (onApprove) pak zprávu označí jako 'imported'.
      await updateWhatsAppParsedData(message.id, {
        parsedPlaceId: editedMessage.parsed_place_id || null,
        parsedPlaceName: editedMessage.parsed_place_name || null,
        parsedItems: editedMessage.parsed_items,
      }).catch(() => {});

      await props.onApprove(editedMessage);
      setStatusMessage('Objednávka byla schválena a importována!');

      // Po krátké době zavřít modal a přejít na další čekající zprávu
      setTimeout(() => {
        props.onClose();
        props.onDecision?.();
      }, 1500);
    } catch (error) {
      zalogujANahlas('Chyba při schvalování', error);
      setStatusMessage('Chyba při schvalování: ' + (error as Error).message);
    } finally {
      setApproving(false);
    }
  };

  // 🔁 „Přečíst znovu (AI)" — znovu spustí AI čtení a uloží nový přepis,
  // položky i výsledek kontroly čtení. Předchozí přepis se uchová pro srovnání.
  const handleReparse = async () => {
    if (!message || reparsing) return;
    // První parsování (zpráva čeká) vs. opakované čtení už rozparsované zprávy.
    const isFirstParse = message.status === 'pending' || !message.parsed_items;
    // Nový přepis nahrazuje ten, který uživatel případně už "Zkontrolovat
    // fotku a potvrdil" — potvrzení se musí zopakovat pro nová data, jinak
    // by šlo kontrolu fotky obejít opakovaným "Přečíst znovu (AI)".
    setPhotoChecked(false);
    setReparsing(true);
    setStatusMessage(isFirstParse ? 'Parsuji zprávu přes AI...' : 'Čtu zprávu znovu přes AI...');
    try {
      const prevRaw = message.parsed_raw_text || null;
      const parsed = await parseWhatsAppOrderMessageWithAI(
        message.message_text,
        props.beers,
        props.packages,
        props.places,
        message.sender_name,
        message.message_timestamp,
        undefined,
        undefined,
        message.id,
        message.media_url ?? null
      );
      const newParsedItems: WhatsAppIncoming['parsed_items'] = (parsed.items || []).map((item) => ({
        beer_id: item.beer_id,
        pkg_id: item.package_id,
        qty: item.quantity ?? 1,
        degree: (item as any).degree ?? null,
        beer_name: item.beer_name || null,
        package_label: item.package_label || null,
        raw_line: item.raw || item.originalLine || null,
      }));
      // U fotoobjednávek nemá tenhle textový diff smysl (viz photoChecked
      // gate výše) — nepočítej ho, ať se nezobrazí zavádějící "N nesouladů".
      const unmatched = isImage ? 0 : computeReadbackUnmatchedCount(newParsedItems || [], message.message_text);

      await updateWhatsAppParsedData(message.id, {
        parsedItems: newParsedItems,
        parsedPlaceId: parsed.placeId,
        parsedPlaceName: parsed.placeName,
        parsedDeliveryDay: parsed.deliveryDay,
        parsedDeliveryDate: parsed.deliveryDate,
        parsedNote: parsed.note,
        parsedRawText: parsed.raw_text ?? null,
        readbackUnmatchedCount: unmatched,
      });

      setMsg((prev) => prev ? {
        ...prev,
        status: 'parsed',
        parsed_items: newParsedItems,
        parsed_place_id: parsed.placeId,
        parsed_place_name: parsed.placeName,
        parsed_delivery_day: parsed.deliveryDay,
        parsed_delivery_date: parsed.deliveryDate,
        parsed_note: parsed.note,
        parsed_raw_text: parsed.raw_text ?? null,
        readback_unmatched_count: unmatched,
      } : prev);
      setPrevRawText(prevRaw);
      setRebuildKey((k) => k + 1); // znovu postaví editační položky z nových parsed_items

      // Pokud uživatel odběratele ručně neopravil, promítneme nové místo z AI.
      if (!placeTouchedRef.current) {
        setPlaceId(parsed.placeId || '');
        setPlaceName(parsed.placeName || '');
        setOrigPlaceName(parsed.placeName || null);
      }

      setStatusMessage(
        unmatched > 0
          ? (isFirstParse
              ? `Zpráva rozparsována — ${unmatched} položky nesouhlasí s originálem.`
              : `Zpráva přečtena znovu — ${unmatched} položky stále nesouhlasí s originálem.`)
          : (isFirstParse
              ? 'Zpráva rozparsována — vše sedí s originálem'
              : 'Zpráva přečtena znovu — vše sedí s originálem')
      );
    } catch (error) {
      zalogujANahlas('Chyba při opakovaném čtení', error);
      setStatusMessage((isFirstParse ? 'Chyba při parsování: ' : 'Chyba při opakovaném čtení: ') + (error as Error).message);
    } finally {
      setReparsing(false);
    }
  };

  const handleReject = async () => {
    if (!(await potvrd('Opravdu chcete zamítnout tuto WhatsApp objednávku?'))) return;

    setRejecting(true);
    setStatusMessage('Zamítám objednávku...');

    try {
      await props.onReject(message);
      setStatusMessage('Objednávka byla zamítnuta!');

      setTimeout(() => {
        props.onClose();
        props.onDecision?.();
      }, 1500);
    } catch (error) {
      zalogujANahlas('Chyba při zamítnutí', error);
      setStatusMessage('Chyba při zamítnutí: ' + (error as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  const handleIgnore = async () => {
    if (!(await potvrd('Opravdu chcete tuto zprávu ignorovat? Nebude importována do objednávek.'))) return;

    setLoading(true);
    try {
      await ignoreWhatsAppMessage(message.id);
      props.onClose();
      props.onDecision?.();
    } catch (error) {
      zalogujANahlas('Chyba při ignorování', error);
      setStatusMessage('Chyba při ignorování: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const body = (
      <div className="space-y-6">
        {/* ↩️ Odpověď, která upravuje dřívější objednávku. Ukáže se PŮVODNÍ
            objednávka se zvýrazněnými změnami, ať je vidět, co se potvrzuje —
            schválení objednávku upraví, nezaloží novou. */}
        {msg?.amends_order_id && (
          <div className="border-2 border-violet-300 rounded bg-violet-50 overflow-hidden">
            <div className="p-4 border-b border-violet-200">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-violet-600 shrink-0" />
                <div className="font-display font-black text-violet-900 text-sm">
                  Tohle je odpověď — upraví už existující objednávku
                </div>
              </div>
              <div className="text-xs font-bold text-violet-700 mt-1">
                {amendPlace ? `Odběratel: ${amendPlace}. ` : ''}
                Schválením se objednávka přepíše podle níže uvedeného stavu. Nová objednávka se nezaloží.
              </div>

              {/* Co odpověď přepisuje a co nechává být — bez tohohle není z
                  výpisu poznat, proč některé položky zůstaly nedotčené. */}
              {(amendRozsah.nahradit.length > 0 || amendRozsah.potvrzeno.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {amendRozsah.nahradit.map((s) => (
                    <span key={`n-${s}`} className="chip bg-amber-100 text-amber-900 border-amber-300">
                      {NAZVY_SKUPIN[s]} — přepisuje se
                    </span>
                  ))}
                  {amendRozsah.potvrzeno.map((s) => (
                    <span key={`p-${s}`} className="chip bg-emerald-100 text-emerald-900 border-emerald-300">
                      {NAZVY_SKUPIN[s]} — zůstávají
                    </span>
                  ))}
                </div>
              )}

              {/* ⚠️ „Petky sedí", ale v načtené objednávce žádné petky nejsou.
                  „Sedí" = nech to být — jenže není co nechat: buď se původní
                  objednávka načetla neúplná (třeba se z PDF petky nevytáhly),
                  nebo odběratel mluví o něčem, co v objednávce není. Bez téhle
                  hlášky by z „petky sedí" tiše nevzniklo nic. */}
              {amendPotvrzenoPrazdne.length > 0 && (
                <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-start gap-1.5">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Odběratel píše, že {amendPotvrzenoPrazdne.map((s) => NAZVY_SKUPIN[s].toLowerCase()).join(' a ')} sedí,
                    ale v načtené objednávce k nim není jediná položka — zkontroluj původní objednávku (třeba se z PDF nevytáhly) a případně je doplň ručně.
                  </span>
                </div>
              )}
            </div>

            {/* 👀 Obě zprávy k porovnání: původní objednávka a odpověď na ni.
                Odpověď sama („ty male soudky budou…") nedává smysl bez toho,
                co upravuje — obsluha musí vidět obojí, aby poznala, jestli se
                přepsalo to, co se přepsat mělo. */}
            <div className="grid gap-3 sm:grid-cols-2 p-4 pt-0">
              <div>
                <div className="text-udaj font-black uppercase tracking-wider text-violet-700 mb-1">
                  Původní objednávka
                </div>
                {amendOriginalMsg ? (
                  <div className="border border-violet-200 rounded p-2.5 bg-white text-xs font-mono whitespace-pre-wrap max-h-56 overflow-y-auto lze-vybrat">
                    {amendOriginalMsg.media_url && (
                      <a
                        href={amendOriginalMsg.media_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block mb-2"
                      >
                        <img
                          src={amendOriginalMsg.media_url}
                          alt="Původní objednávka — příloha"
                          loading="lazy"
                          decoding="async"
                          className="max-h-40 rounded border border-violet-200"
                        />
                      </a>
                    )}
                    {amendOriginalMsg.message_text || (
                      <span className="font-sans text-neutral-500">
                        {amendOriginalMsg.media_url ? '(jen příloha, bez textu)' : '(bez textu)'}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="border border-violet-200 rounded p-2.5 bg-white/60 text-xs font-bold text-neutral-500">
                    {amendLoading
                      ? 'Načítám…'
                      : 'Původní zprávu nemám — objednávka nevznikla z WhatsAppu, nebo se zpráva smazala.'}
                  </div>
                )}
              </div>

              <div>
                <div className="text-udaj font-black uppercase tracking-wider text-violet-700 mb-1">
                  Tato odpověď
                </div>
                <div className="border border-violet-200 rounded p-2.5 bg-white text-xs font-mono whitespace-pre-wrap max-h-56 overflow-y-auto lze-vybrat">
                  {msg?.message_text || (
                    <span className="font-sans text-neutral-500">(bez textu)</span>
                  )}
                </div>
              </div>
            </div>

            {amendLoading ? (
              <div className="p-4 text-xs font-bold text-violet-700">Načítám původní objednávku…</div>
            ) : amendDiff.length === 0 ? (
              <div className="p-4 text-xs font-bold text-violet-700">Původní objednávka se nepodařilo načíst.</div>
            ) : (
              <ul className="divide-y divide-violet-100 bg-white/70">
                {amendDiff.map((d, i) => {
                  const nazev = `${beerNameById(d.beer_id)} ${pkgLabelById(d.package_id)}`.trim();
                  const styl =
                    d.zmena === 'pridano' ? 'bg-emerald-50' :
                    d.zmena === 'odebrano' ? 'bg-rose-50' :
                    d.zmena === 'zmeneno' ? 'bg-amber-50' : '';
                  return (
                    <li key={`${d.beer_id}-${d.package_id}-${i}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-xs ${styl}`}>
                      <span className={`font-black min-w-0 truncate ${d.zmena === 'odebrano' ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
                        {nazev}
                      </span>
                      <span className="shrink-0 font-mono font-bold flex items-center gap-2">
                        {d.zmena === 'pridano' && <span className="text-emerald-700">+ {d.after} ks — nově</span>}
                        {d.zmena === 'odebrano' && <span className="text-rose-700">{d.before} ks → odebrat</span>}
                        {d.zmena === 'zmeneno' && (
                          <span className="text-amber-800">
                            <span className="line-through text-neutral-400">{d.before}</span> → <strong>{d.after} ks</strong>
                          </span>
                        )}
                        {d.zmena === 'beze_zmeny' && <span className="text-neutral-500">{d.after} ks</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Informace o zprávě */}
        <div className="border rounded p-4 bg-sky-50">
          <div className="flex items-center gap-2 mb-2">
            {isImage ? (
              <ImageIcon size={18} className="text-sky-600" />
            ) : (
              <MessageSquare size={18} className="text-sky-600" />
            )}
            <div className="font-medium text-sky-800">Nová WhatsApp objednávka</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm text-neutral-600">Odesílatel</div>
              <div className="font-medium">{message.sender_name}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-600">Čas přijetí</div>
              <div className="font-medium">
                {new Date(message.message_timestamp || message.created_at).toLocaleString('cs-CZ', {
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
                {isImage ? (<><ImageIcon size={14} /> Fotka</>) : (<><MessageSquare size={14} /> Text</>)}
              </div>
            </div>

            <div>
              <div className="text-sm text-neutral-600">Stav zpracování</div>
              <div className="font-medium">
                {isParsed ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <Check size={14} /> Rozparsováno AI
                  </span>
                ) : isPending ? (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertCircle size={14} /> Čeká na parsování
                  </span>
                ) : (
                  <span className="text-neutral-600">Zpracovává se...</span>
                )}

                {isPending && (
                  <button
                    onClick={handleReparse}
                    disabled={reparsing || loading}
                    className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-700 text-white text-xs font-semibold hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed tap"
                    title="Ručně spustit AI parsování této zprávy" aria-label="Ručně spustit AI parsování této zprávy"
                  >
                    {reparsing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {reparsing ? 'Parsuji...' : 'Parsovat ručně'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Fotka/příloha — čtení objednávek z fotky: zoomovatelný/posuvný
              náhled (stejná komponenta jako ruční „Číst z fotky"). Když je
              foto k dispozici, zobrazí se v napevno přilepeném panelu nahoře
              (viz níže), tady jen odkazy pro otevření/stažení — jde tak
              průběžně porovnávat fotku s tím, co se z ní zapsalo (#22,
              DeepSeek fotky nečte, takže je kontrola objednávky z fotky
              vždy na člověku). */}
          {message.media_url ? (
            <div className="mt-3">
              {!useFullscreenPhotoLayout && (
                <div className="h-[45vh] sm:h-96 rounded overflow-hidden border border-sky-200 shadow-lg">
                  <PhotoReviewPane
                    photos={[{ dataUrl: message.media_url, name: 'Fotka objednávky' }]}
                    activeIndex={0}
                    onChangeIndex={() => {}}
                  />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={message.media_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold"
                >
                  <ExternalLink size={14} /> Otevřít fotografii
                </a>
                <a
                  href={message.media_url}
                  download
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-semibold"
                  title="Stáhnout fotografii na počítač"
                >
                  <Download size={14} /> Stáhnout fotografii
                </a>
              </div>
            </div>
          ) : isImage ? (
            <div className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
              <ImageIcon size={14} /> Fotka — médium nebylo doručeno (webhook neposlal mediaUrl).
            </div>
          ) : null}
        </div>

        {/* Kontrola čtení: originál vs. přepis AI */}
        <div className="border rounded p-4 bg-neutral-50">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Eye size={16} className="text-sky-600" />
              Kontrola čtení — originál vs. přepis AI
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {readback.score != null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    readback.score >= 90 ? 'bg-emerald-100 text-emerald-800' :
                    readback.score >= 60 ? 'bg-amber-100 text-amber-800' :
                    'bg-rose-100 text-rose-800'
                  }`}
                  title={`Skóre důvěryhodnosti přečtení: ${readback.score} %`}
                >
                  {readback.score} % {readback.scoreLabel}
                </span>
              )}
              <span className="text-xs">
                {readback.items.length > 0 ? (
                  readback.mismatchCount === 0 ? (
                    <span className="text-emerald-700 font-medium">
                      <Check className="ikona-text" /> Všechny položky sedí ({readback.matchedCount}/{readback.items.length})
                    </span>
                  ) : (
                    <span className="text-amber-700 font-medium">
                      <AlertTriangle className="ikona-text" /> {readback.unmatchedCount} nesouhlasí · ≈ {readback.partialCount} částečně · <Check className="ikona-text" /> {readback.matchedCount}
                    </span>
                  )
                ) : (
                  <span className="text-neutral-500">Položky zatím nejsou rozparsované</span>
                )}
              </span>
            </div>
          </div>

          {/* Přísný režim — blokace schválení při nesouladu (#4). U fotoobjednávek
              nemá smysl (originál je jen popisek, ne text k porovnání) — tam
              kontrolu řeší tlačítko "Zkontrolovat fotku a potvrdit" níže. */}
          {!isImage && (
            <label className="flex items-center gap-2 text-xs text-neutral-600 mb-2 cursor-pointer select-none">
              <input type="checkbox" checked={strictReadback} onChange={toggleStrictReadback} className="accent-amber-600" />
              {strictReadback ? <ShieldCheck size={14} className="text-emerald-600" /> : <ShieldAlert size={14} className="text-amber-600" />}
              Vyžadovat opravu nesouladů před schválením
            </label>
          )}

          {/* Side-by-side na desktopu, pod sebou na mobilu (#7). U textových
              objednávek (useFullscreenTextLayout) se originál zobrazuje
              zvlášť v přilepeném panelu nahoře, tady by byl duplicitně. */}
          <div className={`grid grid-cols-1 gap-3 ${useFullscreenTextLayout ? '' : 'lg:grid-cols-2'}`}>
            {!useFullscreenTextLayout && originalMessageBlock}

            <div>
              <div className="text-xs font-medium text-neutral-500 mb-1 flex items-center gap-1">
                <FileText size={12} /> Přepis AI (diff proti originálu)
              </div>
              <div className="border rounded p-3 bg-white font-mono text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">
                {transcriptSegments.length > 0 ? (
                  transcriptSegments.map((seg, si) => {
                    if (seg.op === 'same') return <span key={si}>{seg.text} </span>;
                    if (seg.op === 'added') return <span key={si} className="bg-rose-100 text-rose-700 rounded px-0.5">{seg.text}</span>;
                    return <span key={si} className="bg-amber-100 text-amber-700 rounded px-0.5 line-through">{seg.text}</span>;
                  })
                ) : message.parsed_raw_text ? (
                  <span className="whitespace-pre-wrap">{message.parsed_raw_text}</span>
                ) : message.status === 'pending' ? (
                  <span className="text-neutral-400">
                    Přepis od AI zatím není k dispozici — zpráva se teprve zpracovává. Pokud se tak nestane samo, klepněte na „Parsovat ručně“ výše.
                  </span>
                ) : isImage ? (
                  <span className="text-neutral-400">
                    Tahle zpráva je fotka bez přepisu od AI — byla rozparsovaná v době, kdy se fotky nečetly. Zkontrolujte objednávku podle fotky, případně použijte „Přečíst znovu (AI)".
                  </span>
                ) : (
                  <span className="text-neutral-400">
                    Přepis od AI není k dispozici (zpráva rozparsovaná před nasazením kontroly čtení). Použijte „Přečíst znovu (AI)".
                  </span>
                )}
              </div>
              <div className="text-udaj text-neutral-400 mt-1">
                zeleně = čteno z originálu · červeně = AI přidala (není v originálu) · přeškrtnuto = AI přehlédla
              </div>
            </div>
          </div>

          {/* Legenda zvýraznění originálu */}
          <div className="text-xs text-neutral-500 mt-2">
            Zeleně = přesná shoda s originálem, jantarově = částečná shoda (překlepy/pořadí slov). Číslo = položka níže.
          </div>

          {/* Srovnání s předchozím čtením po „přečti znovu" (#15) */}
          {prevRawText && message.parsed_raw_text && prevRawText !== message.parsed_raw_text && (
            <details className="mt-2 group">
              <summary className="text-xs text-neutral-600 cursor-pointer hover:text-neutral-800 select-none flex items-center gap-1">
                <RefreshCw size={14} /> Srovnání s předchozím čtením AI
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 border rounded p-3 bg-white font-mono text-xs max-h-48 overflow-y-auto">
                {diffWords(prevRawText, message.parsed_raw_text).map((seg, si) => {
                  if (seg.op === 'same') return <span key={si}>{seg.text} </span>;
                  if (seg.op === 'added') return <span key={si} className="bg-rose-100 text-rose-700 rounded px-0.5">{seg.text}</span>;
                  return <span key={si} className="bg-amber-100 text-amber-700 rounded px-0.5 line-through">{seg.text}</span>;
                })}
              </div>
            </details>
          )}
        </div>

        {/* Rozparsované informace (pokud jsou) */}
        {hasParsedData && (
          <div>
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <Check size={16} className="text-emerald-600" />
              AI rozpoznalo z objednávky
              <button
                onClick={handleReparse}
                disabled={reparsing || loading}
                className="ml-auto px-2.5 py-1 rounded bg-sky-50 text-sky-700 text-xs font-medium hover:bg-sky-100 disabled:opacity-50 flex items-center gap-1.5 tap"
                title="Znovu spustit AI čtení zprávy — nový přepis nahradí ten stávající (a porovná se s ním)"
              >
                {reparsing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {reparsing ? 'Čtu znovu...' : 'Přečíst znovu (AI)'}
              </button>
            </div>

            <div className="border rounded p-4 bg-emerald-50 space-y-3">
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
                      const rbItem = readbackByItem.get(index);
                      const isMismatch = rbItem?.status === 'unmatched' || rbItem?.status === 'fuzzy';
                      return (
                        <div
                          key={item.key}
                          ref={(el) => { itemRefs.current[index] = el; }}
                          className={`p-2 bg-white rounded border ${
                            isMismatch ? 'border-amber-300 ring-2 ring-amber-200' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                              min={1}
                              value={item.qty}
                              onChange={(e) => updateItemQty(index, e.target.value)}
                              className="input !py-1 !px-2 text-sm font-bold w-16 text-center shrink-0"
                              title="Množství"
                            />
                            <QuickQtySelect
                              pkg={props.packages.find((p) => p.id === item.pkgId)}
                              qty={item.qty}
                              onSelect={(q) => updateItemQty(index, String(q))}
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
                            <button
                              type="button"
                              onClick={() => deleteItem(index)}
                              aria-label="Smazat položku"
                              title="Smazat položku z objednávky"
                              className="p-1 rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors shrink-0 tap"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          {item.rawLine && (() => {
                            if (rbItem?.status === 'unmatched') {
                              return (
                                <div className="text-xs mt-1 flex items-start gap-1">
                                  <AlertCircle size={12} className="text-rose-600 mt-0.5 shrink-0" />
                                  <span className="text-rose-700">
                                    AI četla: „{item.rawLine}" — <b>v originální zprávě se nenašlo</b>, zkontrolujte přečtení!
                                  </span>
                                </div>
                              );
                            }
                            if (rbItem?.status === 'fuzzy') {
                              return (
                                <div className="text-xs mt-1 flex items-start gap-1">
                                  <AlertCircle size={12} className="text-amber-600 mt-0.5 shrink-0" />
                                  <span className="text-amber-700">
                                    AI četla: „{item.rawLine}" — <b>částečná shoda</b> (překlepy/pořadí slov), zkontrolujte čísla níže.
                                  </span>
                                </div>
                              );
                            }
                            if (rbItem?.status === 'matched') {
                              return (
                                <div className="text-xs mt-1 flex items-start gap-1">
                                  <Check size={12} className="text-emerald-600 mt-0.5 shrink-0" />
                                  <span className="text-emerald-700">AI četla z originálu: „{item.rawLine}"</span>
                                </div>
                              );
                            }
                            return (
                              <div className="text-xs text-neutral-500 mt-1">„{item.rawLine}"</div>
                            );
                          })()}

                          {/* Kontrola po částech: množství / objem / stupeň (#2) */}
                          {rbItem && rbItem.parts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {rbItem.parts.map((p, pi) => (
                                <span
                                  key={pi}
                                  className={`px-1.5 py-0.5 rounded text-udaj flex items-center gap-1 ${
                                    p.found ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                  title={p.found
                                    ? `${partKindLabel(p.part.kind)} ${p.part.display} se v originálu našlo`
                                    : `${partKindLabel(p.part.kind)} ${p.part.display} se v originálu NENAŠLO`}
                                >
                                  {p.found ? <Check size={12} /> : <AlertCircle size={12} />}
                                  {partKindLabel(p.part.kind)} {p.part.display}
                                </span>
                              ))}
                            </div>
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
          <div className={`p-3 rounded ${statusMessage.includes('Chyba') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {statusMessage}
          </div>
        )}

        {/* Akce */}
        {isImported ? (
          <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            <CheckCircle2 className="ikona-text" /> Zpráva už byla importována do objednávky — prohlížíte archiv originálu a kontrolu čtení.
            {message.readback_checked_at && (
              <span className="block text-xs text-emerald-700 mt-1">
                Zkontrolováno {new Date(message.readback_checked_at).toLocaleString('cs-CZ')}
                {message.readback_checked_by ? ` · ${message.readback_checked_by.slice(0, 8)}` : ''}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-4 border-t">
            {isImage && message.media_url && (
              <button
                type="button"
                onClick={() => setPhotoChecked((v) => !v)}
                className={`self-start flex items-center gap-2 px-3.5 py-2 rounded text-sm font-semibold border transition ${
                  photoChecked
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
                }`}
              >
                {photoChecked ? <Check size={16} /> : <Eye size={16} />}
                {photoChecked ? 'Zkontrolováno — fotka odpovídá přepisu' : 'Zkontrolovat fotku a potvrdit'}
              </button>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleIgnore}
                disabled={loading}
                className="px-4 py-2 border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Ignorovat zprávu
              </button>

              <button
                onClick={handleReject}
                disabled={rejecting || loading}
                className="px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
              >
                {rejecting ? <ButtonSpinner /> : <X size={16} />}
                Zamítnout objednávku
              </button>
            </div>

            <button
              onClick={handleApprove}
              disabled={approving || loading || !isParsed || items.length === 0 || hasUnmatchedItems || (isImage ? (!!message.media_url && !photoChecked) : (strictReadback && readback.mismatchCount > 0))}
              className="px-6 py-2.5 bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2 font-medium"
              title={
                isImage && !!message.media_url && !photoChecked
                  ? 'Nejprve potvrďte, že jste fotku zkontroloval/a (tlačítko výše).'
                  : items.length === 0
                  ? 'Žádné položky k importu — smazanou položku vrátíte zavřením bez schválení nebo „Přečíst znovu (AI)".'
                  : hasUnmatchedItems
                    ? 'U některé položky chybí přiřazené pivo nebo obal — vyberte je z nabídky (jinak by položka zmizela ze skladu).'
                  : !isImage && strictReadback && readback.mismatchCount > 0
                    ? 'Přísný režim je zapnutý — opravte nesouhlasící položky nebo přísný režim vypněte.'
                    : undefined
              }
            >
              {approving ? <ButtonSpinner /> : <UserCheck size={16} />}
              {isParsed
                ? (isImage && !!message.media_url && !photoChecked
                    ? 'Nejprve zkontrolujte fotku…'
                    : hasUnmatchedItems
                      ? 'Doplňte pivo/obal…'
                    : !isImage && strictReadback && readback.mismatchCount > 0
                      ? `Opravte ${readback.mismatchCount} nesouladů…`
                      : items.length === 0
                        ? 'Žádné položky…'
                        : 'Schválit a importovat')
                : 'Čeká na parsování...'}
            </button>
            </div>
          </div>
        )}

        {/* Informace pro uživatele */}
        <div className="text-sm text-neutral-500 bg-amber-50 p-3 rounded border border-amber-200">
          <div className="font-medium text-amber-800 mb-1">Jak to funguje?</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Zkontrolujte originální zprávu/fotku (vlevo) a porovnejte s přepisem AI (vpravo)</li>
            <li><AlertTriangle className="ikona-text" /> = položka se v originálu nenašla, ≈ = částečná shoda, <Check className="ikona-text" /> = přečteno správně</li>
            <li>Čipy u položky ukazují kontrolu množství / objemu / stupně zvlášť</li>
            <li>Při nesouladu použijte „Přečíst znovu (AI)" nebo opravte položku ručně</li>
            <li>Schválte import - objednávka se automaticky vytvoří v systému</li>
            <li>Pokud není objednávka správná, zamítněte ji nebo ignorujte</li>
            <li>Opravené pivo/obal/odběratele si AI pamatuje a příště je pozná sama</li>
          </ol>
        </div>
      </div>
  );

  // Fotoobjednávka: vlastní fullscreen layout s napevno přilepenou fotkou
  // nahoře (ne Modal — jeho tělo scrolluje jako celek, což by fotku odneslo
  // pryč se zbytkem obsahu).
  if (useFullscreenPhotoLayout && message.media_url) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0 bg-white">
          <h3 className="font-display font-bold text-base text-neutral-900 tracking-tight"><ShoppingCart className="ikona-text" /> Kontrola WhatsApp objednávky</h3>
          <button
            onClick={props.onClose}
            className="w-8 h-8 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition tap"
            title="Zavřít" aria-label="Zavřít"
          >
            <X size={18} />
          </button>
        </div>
        <div className="h-[42vh] sm:h-[45vh] shrink-0 border-b border-sky-200">
          <PhotoReviewPane
            photos={[{ dataUrl: message.media_url, name: 'Fotka objednávky' }]}
            activeIndex={0}
            onChangeIndex={() => {}}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {body}
        </div>
      </div>
    );
  }

  // Textová objednávka: stejný princip jako u fotky — originál zprávy
  // napevno přilepený nahoře (vlastní scroll uvnitř, když je text dlouhý),
  // položky a zbytek kontroly se scrollují pod ním.
  if (useFullscreenTextLayout) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0 bg-white">
          <h3 className="font-display font-bold text-base text-neutral-900 tracking-tight"><ShoppingCart className="ikona-text" /> Kontrola WhatsApp objednávky</h3>
          <button
            onClick={props.onClose}
            className="w-8 h-8 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition tap"
            title="Zavřít" aria-label="Zavřít"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[38vh] sm:max-h-[42vh] shrink-0 border-b border-sky-200 bg-sky-50/40 p-3 overflow-y-auto scrollbar-thin">
          {originalMessageBlock}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {body}
        </div>
      </div>
    );
  }

  return (
    <Modal open={props.isOpen} onClose={props.onClose} title="Kontrola WhatsApp objednávky" wide>
      {body}
    </Modal>
  );
}



