import { useState, useEffect, useMemo, useRef } from 'react';
import { Beer, Package, Place, supabase } from '../lib/supabase';
import { WhatsAppIncoming, ignoreWhatsAppMessage, updateWhatsAppParsedData, napojNaObjednavku } from '../lib/whatsappApi';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';
import { loadAliasMap, saveAlias, canLearnBeerAlias, matchBeerFromHints, matchPackage, savePlaceAlias, normalize, getOrCreatePlace, type ParserAliasMap } from '../lib/orderParser';
import { matchAgainstCatalog } from '../../supabase/functions/_shared/place-match';
import { oznacVlastniObjednavku } from '../lib/mojeObjednavky';
import {
  diffOrderItems, rozsahOdpovedi, slozNavrh, potvrzeneBezPolozek, vypadaJakoPridavek,
  kandidatiNaDoplneni, datumObjednavky, vypadaJakoZmenaObjednavky,
  type DiffRow, type RozsahOdpovedi, type SkupinaObalu, type ObjednavkaKandidat,
} from '../lib/whatsappAmendment';
import { PlaceCombobox } from './PlaceCombobox';
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
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, Download, ExternalLink, Eye, FileText, Image as ImageIcon, MessageSquare, CornerDownRight, HelpCircle, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, ShoppingCart, UserCheck, X, ArrowDown, FilePlus, Plus } from 'lucide-react';
import { chyba, potvrd, uspech } from '../lib/toast';
import { zalogujANahlas } from '../lib/chybyHlaseni';
import { useChovaniDialogu } from '../lib/zavriNaZpet';
import { businessDateISO } from '../lib/businessDate';
import { rozdelVraceni, vypadaJakoVraceni } from '../lib/vraceniZeZpravy';
import { odberatelZCitace, stojiZaHledani } from '../lib/odberatelZCitace';
import {
  datumCesky, datumZavozu, objednavkyKVraceni, pripojPoznamku, poznamkaVraceni,
  zaznamyDorovnaniVraceni, type PolozkaVraceni,
} from '../lib/vraceniZObjednavky';
import { STAVY_OBJEDNAVKY, popisStavu } from '../lib/stavyObjednavek';
import { uloz } from '../lib/uloziste';
import type { Order, OrderItem } from './objednavky/spolecne';

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
  /**
   * Zavezené objednávky + jejich položky — jen pro nabídku „vrátit z téhle
   * objednávky" u VRÁCENÍ (viz jeVraceni níž). Nepovinné: bez nich zprávu
   * jde zapsat jako vrácení pořád, jen bez vazby na konkrétní objednávku
   * (stejně jako dřív).
   */
  orders?: Order[];
  orderItems?: Record<string, OrderItem[]>;
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
  // „Zkontroloval jsem to, schválit i tak" v přísném režimu. Bez tohohle
  // ústupu byl přísný režim past: tlačítko zůstalo šedé, důvod se skrýval
  // v title (na telefonu neexistuje) a jediná cesta ven vedla přes
  // zaškrtávátko o dvě obrazovky výš, které navíc mění nastavení natrvalo.
  // Platí jen pro rozečtenou zprávu, ne pro další objednávky.
  const [prisnyPrekonan, setPrisnyPrekonan] = useState(false);
  // Reference na položky pro auto-posun na první nesoulad (#9).
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Uživatel ručně upravil odběratele — inicializace ho nesmí přepsat.
  const placeTouchedRef = useRef(false);
  // Interní stav zprávy — po „přečtení znovu (AI)" se aktualizuje lokálně,
  // aby se přepis, položky i kontrola čtení okamžitě překreslily.
  const [msg, setMsg] = useState<WhatsAppIncoming | null>(props.message);
  // ↩️ „Tady vrací 1x50l. Vosmy…" — zpráva o VRÁCENÍ, ne objednávka. Musí být
  // spočítané už tady nahoře: i když zpráva zároveň cituje jinou (a dostane
  // amends_order_id z citace), NESMÍ se chovat jako úprava/schválení té
  // objednávky — schválením by vznikl závoz, který nikdy nepojede, nebo by se
  // rovnou přepsala cizí objednávka podle textu o vrácení. Viz gate níž u
  // amend-banneru a u tlačítka Schválit.
  const jeVraceni = vypadaJakoVraceni(msg?.message_text);
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
  // ➕ Přídavek („Pro Radka ještě plus toto"): objednávky téhož odběratele,
  // ke kterým může patřit. Vybírá z nich obsluha — rozhodnout to za ni by
  // znamenalo tiše připsat položky k cizí objednávce.
  const [objednavkyOkoli, setObjednavkyOkoli] = useState<ObjednavkaKandidat[]>([]);
  const [kandidatiLoading, setKandidatiLoading] = useState(false);
  const [kandidatiChyba, setKandidatiChyba] = useState<string | null>(null);
  /** Id objednávky, na kterou se právě napojuje (zamyká tlačítko). */
  const [napojuji, setNapojuji] = useState<string | null>(null);
  // ✂️ Rozdělení na dva odběratele — z provozu 15. 9. 2026: WhatsApp zpráva
  // se dvěma odběrateli (Chmeloun a Sluhy) dorazila jako jedna objednávka.
  // Zaškrtnuté položky odejdou po schválení do NOVÉ, druhé objednávky —
  // viz handleApprove. Netýká se odpovědí upravujících stávající objednávku
  // (amends_order_id) — tam by rozdělení nedávalo smysl.
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitKeys, setSplitKeys] = useState<Set<string>>(new Set());
  const [splitPlaceId, setSplitPlaceId] = useState('');
  const [splitPlaceName, setSplitPlaceName] = useState('');

  // Synchronizace s prop (otevření nové zprávy).
  useEffect(() => {
    setMsg(props.message);
    setStatusMessage(null);
    setPrevRawText(null);
    setPhotoChecked(false);
    setPrisnyPrekonan(false);
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
      // matchAgainstCatalog (ne matchPlaceFromText): `pname` je už VYBRANÉ
      // jméno (AI ho vrátila jako place_name), ne syrový text zprávy —
      // ukotvení v textu tu nedává smysl a stará cesta navíc jméno jako
      // "petr" napevno vyřazovala coby zaměstnance (viz komentář u
      // matchAgainstCatalog v _shared/place-match.ts).
      const matched = matchAgainstCatalog(pname, props.places, []);
      if (matched.id) pid = matched.id;
    }
    setPlaceId(pid);
    setPlaceName(pname || props.places.find((p) => p.id === pid)?.name || '');
    setOrigPlaceName(pname || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, msg?.id]);

  // ↩️ Odpověď bez odběratele zdědí odběratele z CITOVANÉ zprávy.
  //
  // Z provozu 17. i 18. 9. 2026: na Radkovu objednávku přišla odpověď
  // „60x0,5l. Grep a 40x0,5l. Citrón". Je to VLASTNÍ objednávka, jen na
  // Radkovu navazuje — odběratel v ní není napsaný a pole zůstávalo prázdné,
  // ačkoli appka z citace přesně ví, komu se odpovídá.
  //
  // Totéž umí edge funkce whatsapp-auto-parse od 17. 9., jenže ta se do
  // Supabase nenasadila (klíč SUPABASE_ACCESS_TOKEN není v GitHubu) — viz
  // lib/odberatelZCitace.ts. Aplikace se nasazuje sama, takže tahle cesta
  // k uživateli doopravdy dojede.
  //
  // Nic se nezapisuje: jen se PŘEDVYPLNÍ pole, které člověk před schválením
  // vidí a může přepsat. Co už napsal ručně, se nepřebíjí.
  /**
   * ❓ Co si AI při čtení téhle zprávy nebyla jistá.
   *
   * Do teď byl model nucený pokaždé hádat — „2x10" je deset piv, nebo dva
   * sudy 10 l? má odpověď objednávku upravit, nebo je to nová? — a obsluha
   * se o té nejistotě nedozvěděla. Teď se zeptá (viz KDYŽ NEVÍŠ
   * v supabase/functions/_shared/order-rules.ts).
   *
   * Bere se ze zprávy (uloženo při automatickém čtení), a když se použije
   * „Přečíst znovu (AI)", přepisuje se čerstvým výsledkem.
   */
  const [otazkyAi, setOtazkyAi] = useState<string[]>([]);
  useEffect(() => {
    setOtazkyAi(Array.isArray(msg?.parsed_otazky) ? msg.parsed_otazky : []);
  }, [msg?.id, msg?.parsed_otazky]);

  const [odberatelZOdpovedi, setOdberatelZOdpovedi] = useState<string | null>(null);
  useEffect(() => {
    setOdberatelZOdpovedi(null);
    if (!props.isOpen || !msg || !stojiZaHledani(msg)) return;
    let zruseno = false;
    (async () => {
      const { data } = await supabase
        .from('whatsapp_incoming')
        .select('id, created_at, message_text, quoted_text, imported_order_id, parsed_place_id, parsed_place_name')
        .lt('created_at', msg.created_at)
        .order('created_at', { ascending: false })
        // Celý chat se netáhne — citace se týká něčeho z posledních dní.
        .limit(200);
      if (zruseno) return;
      const nalez = odberatelZCitace(msg, (data ?? []) as any[]);
      // Mezitím mohl člověk odběratele napsat sám — to má přednost.
      if (!nalez || placeTouchedRef.current) return;
      setPlaceId(nalez.placeId ?? '');
      setPlaceName(nalez.placeName ?? '');
      setOdberatelZOdpovedi(nalez.zCitace);
    })();
    return () => { zruseno = true; };
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
  //
  // NE u VRÁCENÍ (jeVraceni): i když zpráva cituje jinou a dostala
  // amends_order_id, „upraví existující objednávku" je pro vrácení věcně
  // špatně — objednávka se propisuje výhradně přes „Zapsat jako vrácení" výš.
  useEffect(() => {
    if (!props.isOpen || !msg?.amends_order_id || jeVraceni) {
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
     
  }, [props.isOpen, msg?.amends_order_id, msg?.message_text, items, props.packages, jeVraceni]);

  // „Pro Radka jeste plus toto" — zpráva říká, že je to PŘÍDAVEK k něčemu, co
  // už je objednané. Jistě to z textu poznat nejde (a tichá záměna „přidat" za
  // „založit novou" by dělala v objednávkách nepořádek), takže se jen upozorní
  // a rozhodne člověk. Ukazuje se jen tehdy, když zpráva NENÍ odpověď s citací
  // — u té už appka ví, ke které objednávce patří.
  // Dva druhy: PŘÍDAVEK („ještě plus toto") jen přidává, ÚPRAVA („ty malé
  // soudky budou 2×20l", „petky sedí") říká, co v objednávce má být jinak —
  // tu je potřeba do vybrané objednávky zapracovat, ne z ní udělat druhou.
  // Rozlišení dělá `vypadaJakoZmenaObjednavky` a stejné pořadí drží i
  // `slozNavrh`, takže náhled ukazuje totéž, co import zapíše.
  const druhZmeny = msg?.amends_order_id ? null : vypadaJakoZmenaObjednavky(msg?.message_text);
  const vypadaJakoDoplnek = druhZmeny !== null;
  // Napojení, které vybral člověk (ne appka z citace). Odvozuje se ze ZPRÁVY,
  // ne ze stavu modálu: rozhodnutí se zapisuje do databáze hned, takže po
  // zavření a znovuotevření musí být pořád vidět, co schválení udělá —
  // a musí jít vzít zpět. Odpověď s citací tenhle příznak nemá (má
  // `quoted_text` a vazbu si drží appka sama).
  const napojenoRucne =
    !!msg?.amends_order_id && !msg?.quoted_text && !!vypadaJakoZmenaObjednavky(msg?.message_text);
  /** Jak se zpráva chová k vybrané objednávce — pro texty po napojení. */
  const druhNapojeni = napojenoRucne ? vypadaJakoZmenaObjednavky(msg?.message_text) : null;

  // Rozpad na „vrácené pivo" vs. „nejspíš prázdné obaly" (jeVraceni je
  // spočítané výš, hned u definice `msg`) dělá lib/vraceniZeZpravy.ts; řádky
  // bez piva se nezahazují, jen se nezaškrtnou — viz pravidlo od majitele tamtéž.
  const rozpadVraceni = useMemo(() => rozdelVraceni(
    items.map((it) => ({
      klic: it.key,
      beerId: it.beerId,
      beerName: it.beerName ?? props.beers.find((b) => b.id === it.beerId)?.name ?? null,
      pkgId: it.pkgId,
      packageLabel: it.packageLabel ?? props.packages.find((p) => p.id === it.pkgId)?.label ?? null,
      pocet: Number(it.qty || 0),
    })),
    msg?.message_text,
  ), [items, msg?.message_text, props.beers, props.packages]);
  /**
   * Které řádky se doopravdy zapíšou.
   *
   * Z provozu 21. 9. 2026: „v tech vratkach je nak moc polozek, ty se
   * nevracely... pokud bude neco na vraceni tak vyhod upozadu vozorneni a
   * rucne se musi potvrdit ze se vraci plny sud." Dřív se řádky s dohledaným
   * pivem (rozpadVraceni.sPivem) rovnou předzaškrtly — ale `pivoJeVTextu`
   * (viz lib/vraceniZeZpravy.ts) je jen hrubá shoda prvních tří písmen kmene
   * kdekoli ve zprávě, takže se předzaškrtlo i pivo, které se ve
   * skutečnosti nevracelo (jen padlo do stejné zprávy jinou souvislostí).
   * Nezaškrtnuté nic nezahazuje — jen to čeká na ruční potvrzení, přesně
   * jak žádá pravidlo od majitele o žádném zápisu bez jasného povelu.
   */
  const [vraceniZaskrtnuto, setVraceniZaskrtnuto] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setVraceniZaskrtnuto({});
  }, [jeVraceni, msg?.id]);
  const [ukladamVraceni, setUkladamVraceni] = useState(false);

  const vraceneRadky = [...rozpadVraceni.sPivem, ...rozpadVraceni.jenObaly]
    .filter((r) => vraceniZaskrtnuto[r.klic]);
  const vracenoKusu = vraceneRadky.reduce((a, r) => a + r.pocet, 0);

  /**
   * ↩️ Vrácení z WHATSAPP zprávy nabídne i propojení s konkrétní zavezenou
   * objednávkou stejného odběratele (stejný seznam jako záložka „Vrácení
   * piva", lib/vraceniZObjednavky.ts) — appka pak u té objednávky dopočítá
   * efektivní množství (OrderCard.tsx), místo aby vrácení zůstalo jen
   * volným záznamem ve skladu bez vazby na to, odkud pivo přišlo.
   *
   * Z provozu 21. 9. 2026: „to je ve zprave, takze normalne na cteni to
   * precetlo vraci, tak at da volbu vratit sud z ty obednavky, at to napise
   * puvodni a z ni to odecte." Zůstává NEPOVINNÉ a jde ručně přepnout nebo
   * zrušit — appka nic nezapíše bez potvrzení tlačítkem — ale když zpráva
   * cituje zprávu, ze které objednávka vznikla (amends_order_id), přednabídne
   * ji appka rovnou, ať se nemusí hledat ručně v seznamu.
   */
  const [vratitZObjednavky, setVratitZObjednavky] = useState('');
  useEffect(() => {
    setVratitZObjednavky(msg?.amends_order_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jeVraceni, msg?.id]);
  const nabidkaObjednavek = useMemo(() => {
    if (!jeVraceni || !props.orders) return [];
    const seznam = objednavkyKVraceni(props.orders, props.orderItems ?? {}, {
      dnes: businessDateISO(),
      placeId: placeId || undefined,
    }).slice(0, 10);
    // Objednávka, na kterou zpráva podle citace odpovídá, musí jít vybrat
    // vždycky — i kdyby normální filtr (posledních 56 dní, stejný odběratel,
    // max. 10 položek) na ni sám nedosáhl.
    const cilena = msg?.amends_order_id
      ? props.orders.find((o) => o.id === msg.amends_order_id)
      : null;
    if (cilena && !seznam.some((o) => o.id === cilena.id)) {
      return [cilena, ...seznam];
    }
    return seznam;
  }, [jeVraceni, props.orders, props.orderItems, placeId, msg?.amends_order_id]);
  const vybranaObjObjednavka = vratitZObjednavky
    ? props.orders?.find((o) => o.id === vratitZObjednavky) ?? null
    : null;

  /**
   * Zapíše zprávu jako vrácení: kusy se přičtou na sklad DNEŠNÍM dnem
   * (stejná cesta jako záložka „Vrácení piva", lib/vraceniZObjednavky.ts)
   * a zpráva se odloží, ať z ní nikdo omylem nezaloží objednávku.
   */
  async function zapisJakoVraceni() {
    const polozky: PolozkaVraceni[] = vraceneRadky.map((r) => ({
      beer_id: r.beerId,
      beer_name: r.beerName,
      package_id: r.pkgId,
      package_label: r.packageLabel,
      pocet: r.pocet,
    }));
    const odberatel = placeName || msg?.parsed_place_name || msg?.sender_name || '';
    const ok = await potvrd(
      `Zapsat jako vrácení ${vracenoKusu} ks od „${odberatel || 'neznámého odběratele'}"?`
      + (vybranaObjObjednavka ? ` Propíše se k objednávce z ${datumCesky(datumZavozu(vybranaObjObjednavka))}.` : '')
      + ' Přičte se to na sklad dneškem a objednávka z téhle zprávy NEvznikne.',
      { titulek: 'Vrácení piva', potvrdit: 'Zapsat vrácení' },
    );
    if (!ok) return;
    setUkladamVraceni(true);
    try {
      const dnes = businessDateISO();
      const { error } = await supabase
        .from('inventory_adjustments')
        .insert(zaznamyDorovnaniVraceni(polozky, dnes, odberatel, vybranaObjObjednavka?.id ?? null));
      if (error) throw new Error(error.message);
      if (vybranaObjObjednavka) {
        const novaPoznamka = pripojPoznamku(vybranaObjObjednavka.note, poznamkaVraceni(polozky, dnes));
        const { error: e2 } = await supabase.from('orders').update({ note: novaPoznamka }).eq('id', vybranaObjObjednavka.id);
        if (e2) throw new Error(e2.message);
      }
      await ignoreWhatsAppMessage(message.id);
      uspech(`Vráceno ${vracenoKusu} ks — přičteno na sklad. Je to vidět v Objednávkách → Vrácení piva.`);
      props.onClose();
      props.onDecision?.();
    } catch (e: any) {
      chyba('Vrácení se nepovedlo: ' + (e?.message || e));
    } finally {
      setUkladamVraceni(false);
    }
  }

  // ➕ Objednávky, ke kterým může přídavek patřit. Dřív musela obsluha
  // objednávku najít v seznamu, zapamatovat si ji a přepsat ručně — appka
  // přitom má na doplnění hotovou mašinérii (`amends_order_id`), jen k ní
  // nevedla cesta od nové zprávy.
  //
  // Načítá se JEDNOU na zprávu a výběr odběratele se pak dělá nad staženým
  // seznamem. Dotaz závislý na `placeName` by běžel po každém písmenu, které
  // obsluha napíše do pole odběratele — combobox hlásí změnu při každém stisku.
  useEffect(() => {
    if (!props.isOpen || !vypadaJakoDoplnek) {
      setObjednavkyOkoli([]); setKandidatiChyba(null);
      return;
    }
    let zruseno = false;
    setKandidatiLoading(true);
    setKandidatiChyba(null);
    (async () => {
      // Okno se bere štědré (šest týdnů zpět) a teprve `kandidatiNaDoplneni`
      // ho utáhne — objednávka zadaná dopředu má `order_date` dávno v minulosti
      // a rozhoduje až den závozu. Strop 200 řádků je při dnešním objemu
      // (kolem 90 objednávek měsíčně) nad rámec toho okna.
      const od = new Date(Date.now() - 42 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_date, delivery_date, delivery_day, place_id, place_name, status')
        .gte('order_date', od)
        .order('order_date', { ascending: false })
        .limit(200);
      if (zruseno) return;
      if (error) {
        // Selhání se musí ozvat: prázdný seznam by obsluha přečetla jako
        // „žádná objednávka není" a založila druhou.
        setKandidatiChyba(error.message);
        setObjednavkyOkoli([]);
        setKandidatiLoading(false);
        return;
      }
      setObjednavkyOkoli((data as ObjednavkaKandidat[]) ?? []);
      setKandidatiLoading(false);
    })();
    return () => { zruseno = true; };
     
  }, [props.isOpen, vypadaJakoDoplnek, msg?.id]);

  // Výběr podle odběratele je čistý výpočet nad staženým seznamem — mění se
  // s tím, jak obsluha odběratele opraví, a nestojí to dotaz do databáze.
  const kandidati = useMemo(
    () => kandidatiNaDoplneni({
      objednavky: objednavkyOkoli,
      placeId: placeId || msg?.parsed_place_id || null,
      placeName: placeName || msg?.parsed_place_name || null,
      dnes: businessDateISO(),
    }),
    [objednavkyOkoli, placeId, placeName, msg?.parsed_place_id, msg?.parsed_place_name]
  );

  /**
   * Napojí zprávu na vybranou objednávku. Zapisuje se rovnou do databáze —
   * rozhodnutí „tohle patří k Radkově objednávce" se nesmí ztratit tím, že
   * obsluha modál zavře a vrátí se k němu později.
   */
  async function napojitNaObjednavku(orderId: string) {
    if (!msg || napojuji) return;
    setNapojuji(orderId);
    try {
      await napojNaObjednavku(msg.id, orderId);
      setMsg((m) => (m ? { ...m, amends_order_id: orderId } : m));
      setStatusMessage('Zpráva je napojená na existující objednávku — schválením se položky přidají do ní.');
    } catch (error) {
      zalogujANahlas('Napojení na objednávku se nepodařilo', error);
      setStatusMessage('Napojení se nepodařilo: ' + (error as Error).message);
    } finally {
      setNapojuji(null);
    }
  }

  /** Zpět k založení nové objednávky (obsluha se překlikla). */
  async function zrusitNapojeni() {
    if (!msg || napojuji) return;
    setNapojuji('zrusit');
    try {
      await napojNaObjednavku(msg.id, null);
      setMsg((m) => (m ? { ...m, amends_order_id: null } : m));
      setStatusMessage('Napojení zrušeno — schválením vznikne nová objednávka.');
    } catch (error) {
      zalogujANahlas('Zrušení napojení se nepodařilo', error);
      setStatusMessage('Zrušení napojení se nepodařilo: ' + (error as Error).message);
    } finally {
      setNapojuji(null);
    }
  }

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

  /**
   * Ruční přidání položky. AI občas řádek přehlédne (rozmazaná fotka,
   * dopsaná poznámka pod čarou) a do teď se s tím nedalo dělat nic jiného,
   * než objednávku schválit a doplnit ji potom v Objednávkách — tedy na
   * druhé obrazovce a se ztrátou souvislosti s původní zprávou.
   *
   * Nový řádek nemá `rawLine`: kontrola čtení porovnává s originálem, a
   * ručně dopsaná položka v originále z podstaty není. Tvářit se, že ji AI
   * přečetla, by udělalo z kontroly lež.
   */
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: `item-rucne-${Date.now()}-${prev.length}`,
        beerId: '',
        pkgId: '',
        qty: '1',
        degree: null,
        beerName: null,
        packageLabel: null,
        rawLine: null,
      } as ReviewItem,
    ]);
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

  /** Zaškrtnutí položky pro druhého odběratele (viz splitEnabled). */
  function toggleSplitKey(key: string) {
    setSplitKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
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
    try { uloz(READBACK_STRICT_KEY, next ? '1' : '0'); } catch { /* */ }
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
  // ⚠️ AI čtení může spadnout (výpadek, rate limit, chybný JSON) — edge funkce
  // pak zprávu NEnechá viset v 'processing', ale nastaví 'error' (viz komentář
  // u safeUpdateMessage v supabase/functions/whatsapp-auto-parse/index.ts).
  // Bez týhle větve to ale UI ukazovalo úplně stejně jako běžící zpracování
  // ("Zpracovává se...") a bez tlačítka na nový pokus — zpráva tak vypadala,
  // že se pořád čte, ačkoli už dávno spadla a nikdy sama nedoběhne.
  const isError = message.status === 'error';
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
  // Přísný režim drží schválení zamčené — dokud obsluha neřekne, že to
  // zkontrolovala. Pak se pořád ještě zeptáme (potvrzovací dialog níž),
  // takže „schválit i tak" není jedno nedopatřené klepnutí.
  const prisnyBlokuje = !isImage && strictReadback && readback.mismatchCount > 0 && !prisnyPrekonan;
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
  // Diff přepisu proti originálu dává smysl jen u TEXTOVÉ zprávy. U fotky
  // není originál `message_text` (to je popisek u fotky, „Pro Radka jeste
  // plus toto"), ale sám papír — takže se diffem porovnával přepis papíru
  // s popiskem a celý přepis vycházel červeně jako „AI přidala". Přepis
  // fotky se proto ukazuje jako obyčejný text; co na papíře stojí, se
  // ověřuje pohledem na fotku vedle.
  const transcriptSegments = !isImage && message.parsed_raw_text
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

  const handleApprove = async (asNew = false) => {
    // asNew = schválit jako NOVOU objednávku i u zprávy, která upravuje jinou
    // (odpověď „…budou…, petky sedí"). Použije se, když se původní objednávka
    // pořádně nenačte (petky v ní nejsou) — pak je lepší založit novou, než
    // slepovat s neúplnou předlohou. Obsluha do ní chybějící petky doplní.
    // Blokace/varování při nesouladu čtení (⚠/≈) — u fotoobjednávek je toto
    // porovnání (popisek zprávy vs. přepis fotky) nesmysluplné, tam kontrolu
    // řeší tlačítko "Zkontrolovat fotku a potvrdit" (photoChecked) níže.
    // V přísném režimu je tlačítko rovnou neaktivní; jinak se zeptáme a
    // uživatel může vědomě pokračovat.
    if (!isImage && readback.mismatchCount > 0 && !prisnyBlokuje) {
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

    // Rozdělení bez vybraného druhého odběratele by založilo objednávku bez
    // jména — radši zastavit dřív, než se cokoliv zapíše.
    if (splitEnabled && splitKeys.size > 0 && !splitPlaceId && !splitPlaceName.trim()) {
      setStatusMessage('Vyber nebo napiš druhého odběratele — nebo rozdělení zrušit.');
      return;
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

      // ✂️ Rozdělení na dva odběratele (viz splitEnabled výš): zaškrtnuté
      // položky odejdou stranou, schválená PRVNÍ objednávka je vůbec
      // nedostane — jinak by je měly obě dvakrát.
      const splitActive = splitEnabled && splitKeys.size > 0 && splitKeys.size < items.length && !message.amends_order_id;
      const primaryItems = splitActive ? items.filter((it) => !splitKeys.has(it.key)) : items;
      const secondItems = splitActive ? items.filter((it) => splitKeys.has(it.key)) : [];

      // Zkopírujeme zprávu s položkami, jak je uživatel případně opravil
      // (správné pivo/obal z katalogu, upravené množství, opravený odběratel).
      const editedMessage: WhatsAppIncoming = {
        ...message,
        // Když se schvaluje jako nová, zahodíme vazbu na upravovanou objednávku
        // → import založí normální novou objednávku z přečtených položek.
        amends_order_id: asNew ? null : message.amends_order_id,
        parsed_place_id: placeId || message.parsed_place_id,
        parsed_place_name: placeName || message.parsed_place_name,
        parsed_items: primaryItems.map((it) => ({
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

      // Druhá objednávka (odštěpené položky) — samostatný, jednoduchý zápis,
      // NE přes onApprove (ten by se pro stejné message.id spustil podruhé
      // a narazil na už 'imported' zprávu). Stejný vzor jako duplicateOrder
      // v Orders.tsx.
      if (splitActive && secondItems.length > 0) {
        let resolvedPlaceId = splitPlaceId || null;
        let resolvedPlaceName = splitPlaceName.trim();
        if (!resolvedPlaceId && resolvedPlaceName) {
          const place = await getOrCreatePlace(resolvedPlaceName, props.places);
          if (place) { resolvedPlaceId = place.id; resolvedPlaceName = place.name; }
        }
        const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
          order_date: businessDateISO(),
          place_id: resolvedPlaceId, place_name: resolvedPlaceName || null,
          source: 'whatsapp', status: 'nova',
          delivery_day: message.parsed_delivery_day ?? null,
          delivery_date: message.parsed_delivery_date ?? null,
          is_prepared: false, is_packaged: false, is_delivered: false,
        }).select().single();
        if (orderErr || !newOrder) throw new Error(orderErr?.message ?? 'Druhá objednávka se nepovedla založit.');
        oznacVlastniObjednavku(newOrder.id);
        const radky = secondItems.map((it) => ({
          order_id: newOrder.id, beer_id: it.beerId || null, beer_name: it.beerName || null,
          package_id: it.pkgId || null, package_label: it.packageLabel || null,
          quantity: parseInt(it.qty, 10) || 0,
        }));
        const { error: itemsErr } = await supabase.from('order_items').insert(radky);
        if (itemsErr) throw new Error(itemsErr.message);
      }

      setStatusMessage(
        splitActive ? 'Schváleno — rozděleno na dvě objednávky!'
          : asNew ? 'Vytvořena nová objednávka!' : 'Objednávka byla schválena a importována!'
      );

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
      // Když nové čtení nenajde NIC (placeId i placeName prázdné), ale
      // odběratel byl už předtím vyplněný (ať z prvního čtení, nebo ho sem
      // ručně vyplnil někdo jiný), pole nemažeme — druhé čtení je skoro
      // vždycky NEÚSPĚCH AI, ne důkaz, že odběratel zmizel (z provozu
      // 16. 9. 2026: "Přečíst znovu" vymazalo už správně dosazeného
      // odběratele, protože AI ho podruhé nenašla).
      if (!placeTouchedRef.current) {
        const nalezenoNove = !!(parsed.placeId || parsed.placeName?.trim());
        if (nalezenoNove || !(placeId || placeName.trim())) {
          setPlaceId(parsed.placeId || '');
          setPlaceName(parsed.placeName || '');
          setOrigPlaceName(parsed.placeName || null);
        }
      }
      // Otázky z čerstvého čtení mají přednost před těmi uloženými u zprávy.
      setOtazkyAi(parsed.otazky ?? []);

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
        {/* ❓ NA CO SE AI PTÁ. Úplně nahoře: je to jediná věc v okně, kterou
            appka sama nevyřeší, a bez odpovědi se schálením zapisuje odhad.
            Do 18. 9. 2026 se model neměl jak zeptat — buď uřekl položku, nebo
            ji zahodil, a obsluha se o té nejistotě nedozvěděla. */}
        {otazkyAi.length > 0 && (
          <div className="border-2 border-violet-400 rounded bg-violet-50 p-4">
            <div className="flex items-start gap-2">
              <HelpCircle size={18} className="text-violet-700 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-display font-black text-violet-950 text-sm">
                  {otazkyAi.length === 1 ? 'AI si není jistá jednou věcí' : `AI si není jistá (${otazkyAi.length})`}
                </div>
                <p className="text-xs font-bold text-violet-900 mt-1">
                  Než objednávku schválíš, projdi tohle — položky níž jsou u těchhle míst jen odhad.
                  Oprav je rovnou ve formuláři.
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {otazkyAi.map((o, i) => (
                    <li key={i} className="text-sm font-bold text-violet-950 bg-white/70 border border-violet-200 rounded px-2.5 py-1.5">
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ↩️ VRÁCENÍ — nahoře, ať se nedá přehlédnout: pod tím je normální
            formulář objednávky a schválit ho by znamenalo odepsat ze skladu
            pivo, které se právě vrátilo. */}
        {jeVraceni && (
          <div className="border-2 border-sky-300 rounded bg-sky-50 p-4">
            <div className="flex items-start gap-2">
              <RotateCcw size={18} className="text-sky-700 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-display font-black text-sky-950 text-sm">
                  Vypadá to na VRÁCENÍ piva, ne na objednávku
                </div>
                <div className="text-xs font-bold text-sky-900 mt-1">
                  Zpráva mluví o vracení („{(message.message_text || '').slice(0, 45)}…“). Schválená
                  jako objednávka by založila závoz, který nikdy nepojede, a pivo by se ze skladu
                  odepsalo — přitom se právě vrátilo. Zaškrtni, co se doopravdy vrátilo, a zapiš to
                  jako vrácení: přičte se na sklad dneškem.
                </div>

                {rozpadVraceni.sPivem.length === 0 && rozpadVraceni.jenObaly.length === 0 ? (
                  <div className="text-xs font-bold text-sky-900 mt-3">
                    Ze zprávy se nic k vrácení nevyčetlo. Zkontroluj položky níž, nebo zprávu ignoruj
                    a vrácení zapiš v Objednávkách → Vrácení piva.
                  </div>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {rozpadVraceni.sPivem.map((r) => (
                      <label key={r.klic} className="flex items-center gap-2 bg-white border border-sky-200 rounded p-2 cursor-pointer">
                        <input
                          type="checkbox" className="w-4 h-4 shrink-0"
                          checked={!!vraceniZaskrtnuto[r.klic]}
                          onChange={(e) => setVraceniZaskrtnuto((m) => ({ ...m, [r.klic]: e.target.checked }))}
                        />
                        <span className="text-sm font-black text-neutral-900 min-w-0 truncate">
                          {r.pocet}× {r.packageLabel} {r.beerName}
                        </span>
                      </label>
                    ))}

                    {/* Prázdné obaly: pravidlo od majitele — „vrací 3x30" bez
                        napsaného piva jsou sudy, ne pivo. Nezahazují se, jen
                        nejsou zaškrtnuté; kdo ví, že v nich pivo bylo, zaškrtne. */}
                    {rozpadVraceni.jenObaly.map((r) => (
                      <label key={r.klic} className="flex items-center gap-2 bg-white border border-neutral-200 rounded p-2 cursor-pointer">
                        <input
                          type="checkbox" className="w-4 h-4 shrink-0"
                          checked={!!vraceniZaskrtnuto[r.klic]}
                          onChange={(e) => setVraceniZaskrtnuto((m) => ({ ...m, [r.klic]: e.target.checked }))}
                        />
                        <span className="text-sm font-bold text-neutral-600 min-w-0 truncate">
                          {r.pocet}× {r.packageLabel}
                          <span className="text-udaj text-neutral-500"> — u toho není napsané pivo, nejspíš prázdné obaly</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* ↩️ Volitelné propojení s konkrétní zavezenou objednávkou —
                    appka pak u ní dopočítá „počítá se X, Y vráceno" (viz
                    OrderCard.tsx). Bez výběru zůstává vrácení jen záznamem
                    ve skladu, stejně jako dřív. */}
                {nabidkaObjednavek.length > 0 && (
                  <div className="mt-3">
                    <label className="text-udaj font-black text-sky-900 uppercase tracking-wide">
                      Vrátit z konkrétní objednávky (nepovinné)
                    </label>
                    <select
                      className="input !mt-1 !py-1.5 text-sm w-full"
                      value={vratitZObjednavky}
                      onChange={(e) => setVratitZObjednavky(e.target.value)}
                    >
                      <option value="">— bez vazby na objednávku —</option>
                      {nabidkaObjednavek.map((o) => (
                        <option key={o.id} value={o.id}>
                          {datumCesky(datumZavozu(o))} · {o.place_name ?? 'bez odběratele'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={ukladamVraceni || vracenoKusu === 0}
                    onClick={() => { void zapisJakoVraceni(); }}
                  >
                    <RotateCcw size={14} /> {ukladamVraceni ? 'Zapisuji…' : `Zapsat jako vrácení (${vracenoKusu} ks)`}
                  </button>
                  <span className="text-udaj font-bold text-sky-900">
                    …nebo pokračuj dole, pokud je to přece jen objednávka.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {vypadaJakoDoplnek && (
          <div className="border-2 border-amber-300 rounded bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-display font-black text-amber-950 text-sm">
                  {druhZmeny === 'uprava'
                    ? 'Vypadá to na ÚPRAVU už existující objednávky'
                    : 'Vypadá to na PŘÍDAVEK k už existující objednávce'}
                </div>
                <div className="text-xs font-bold text-amber-900 mt-1">
                  {druhZmeny === 'uprava' ? (
                    <>
                      Zpráva říká, co v objednávce má být jinak („{(message.message_text || '').slice(0, 40)}…").
                      Takhle schválená by ale založila NOVOU objednávku. Vyber objednávku, do které
                      se má zapracovat — přepíšou se jen skupiny obalů, které zpráva jmenuje,
                      zbytek zůstane:
                    </>
                  ) : (
                    <>
                      Zpráva začíná slovy „{(message.message_text || '').slice(0, 40)}…". Takhle
                      schválená by založila NOVOU objednávku. Pokud pro odběratele objednávka na ten
                      den už jede, patří položky do ní:
                    </>
                  )}
                </div>

                {/* Objednávky téhož odběratele kolem dneška. Vybírá člověk —
                    appka umí říct „vypadá to na přídavek", ne ke které
                    objednávce patří, a připsat položky k cizí objednávce je
                    horší chyba než založit druhou. */}
                <div className="mt-3 space-y-2">
                  {kandidatiLoading && (
                    <div className="text-xs font-bold text-amber-800">Hledám objednávky odběratele…</div>
                  )}

                  {kandidatiChyba && (
                    <div className="text-xs font-bold text-rose-800 flex items-start gap-1.5">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>
                        Objednávky se nepodařilo načíst ({kandidatiChyba}) — než se rozhodneš,
                        podívej se do Objednávek ručně.
                      </span>
                    </div>
                  )}

                  {!kandidatiLoading && !kandidatiChyba && kandidati.length === 0 && (
                    <div className="text-xs font-bold text-amber-800">
                      Pro {placeName || message.parsed_place_name || 'tohoto odběratele'} jsem
                      v okolí dneška žádnou objednávku nenašel. Zkontroluj odběratele níž —
                      jinak schválením vznikne nová objednávka, což je nejspíš správně.
                    </div>
                  )}

                  {kandidati.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-2 flex-wrap bg-white border border-amber-200 rounded p-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-black text-neutral-900 truncate">
                          {o.place_name || '(bez názvu)'}
                        </div>
                        <div className="text-udaj font-bold text-neutral-600 flex items-center gap-1.5 flex-wrap">
                          <span>{datumObjednavky(o)}</span>
                          {o.delivery_day && <span>· {o.delivery_day}</span>}
                          <span className={`chip ${STAVY_OBJEDNAVKY[o.status || 'nova']?.cls ?? ''}`}>
                            {STAVY_OBJEDNAVKY[o.status || 'nova']?.znak} {popisStavu(o.status)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary shrink-0"
                        disabled={napojuji !== null}
                        onClick={() => napojitNaObjednavku(o.id)}
                      >
                        {napojuji === o.id ? <ButtonSpinner /> : <Check size={16} />}
                        {druhZmeny === 'uprava' ? 'Upravit tuhle' : 'Přidat k téhle'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ↩️ Odpověď, která upravuje dřívější objednávku. Ukáže se PŮVODNÍ
            objednávka se zvýrazněnými změnami, ať je vidět, co se potvrzuje —
            schválení objednávku upraví, nezaloží novou.
            NE u VRÁCENÍ (jeVraceni) — tenhle banner tvrdí, že schválení
            „upraví existující objednávku", což by u vrácení znamenalo
            objednávku nesmyslně přepsat podle textu o vrácení. Tam se má
            použít jen „Zapsat jako vrácení" v banneru výš. */}
        {msg?.amends_order_id && !jeVraceni && (
          <div className="border-2 border-violet-300 rounded bg-violet-50 overflow-hidden">
            <div className="p-4 border-b border-violet-200">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-violet-600 shrink-0" />
                <div className="font-display font-black text-violet-900 text-sm">
                  {!napojenoRucne
                    ? 'Tohle je odpověď — upraví už existující objednávku'
                    : druhNapojeni === 'uprava'
                      ? 'Napojeno ručně — zpráva se ZAPRACUJE do existující objednávky'
                      : 'Napojeno ručně — položky se PŘIDAJÍ do existující objednávky'}
                </div>
              </div>
              <div className="text-xs font-bold text-violet-700 mt-1">
                {amendPlace ? `Odběratel: ${amendPlace}. ` : ''}
                {napojenoRucne && druhNapojeni === 'pridavek'
                  ? 'Schválením se položky přičtou k téhle objednávce podle níže uvedeného stavu. Nová objednávka se nezaloží.'
                  : 'Schválením se objednávka přepíše podle níže uvedeného stavu. Nová objednávka se nezaloží.'}
              </div>

              {/* Cesta zpátky. Napojení zapisuje do databáze hned při kliknutí
                  (ať se rozhodnutí neztratí zavřením modálu), takže překliknutí
                  musí jít vzít zpět — jinak by zpráva zůstala natrvalo přišitá
                  k cizí objednávce. Nabízí se jen u ručního napojení; u odpovědi
                  s citací si vazbu drží appka sama a rušit ji tady nemá smysl. */}
              {napojenoRucne && (
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  disabled={napojuji !== null}
                  onClick={zrusitNapojeni}
                >
                  {napojuji === 'zrusit' ? <ButtonSpinner /> : <X size={16} />}
                  Ne, přece jen založit novou objednávku
                </button>
              )}

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
                    ale v načtené objednávce k nim není jediná položka — zkontroluj původní objednávku (třeba se z PDF nevytáhly), doplň je ručně, nebo rovnou založ novou objednávku níže.
                  </span>
                </div>
              )}

              {/* 🆕 Když se původní objednávka pořádně nenačte (petky v ní
                  nejsou), je lepší z odpovědi rovnou založit NOVOU objednávku,
                  než ji slepovat s neúplnou předlohou. Obsluha do ní chybějící
                  položky doplní. Vazba na původní objednávku se zahodí. */}
              <button
                type="button"
                onClick={() => handleApprove(true)}
                disabled={approving}
                className="btn-ghost !rounded mt-2 w-full !bg-white border-violet-300 text-violet-800 font-black text-xs shadow-xs disabled:opacity-50"
              >
                <FilePlus size={15} /> Místo úpravy vytvořit NOVOU objednávku z odpovědi
              </button>
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
                ) : isError ? (
                  <span className="text-rose-600 flex items-center gap-1" title={message.error_message || undefined}>
                    <AlertTriangle size={14} /> Čtení AI selhalo{message.error_message ? ` — ${message.error_message}` : ''}
                  </span>
                ) : (
                  <span className="text-neutral-600">Zpracovává se...</span>
                )}

                {(isPending || isError) && (
                  <button
                    onClick={handleReparse}
                    disabled={reparsing || loading}
                    className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-700 text-white text-xs font-semibold hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed tap"
                    title="Ručně spustit AI parsování této zprávy"
            >
                    {reparsing ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {reparsing ? 'Parsuji...' : isError ? 'Zkusit znovu' : 'Parsovat ručně'}
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
                <FileText size={12} /> {isImage ? 'Přepis fotky od AI' : 'Přepis AI (diff proti originálu)'}
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
                {isImage
                  ? 'Co AI přečetla z fotky. Porovnej to s fotkou nahoře — text u fotky („popisek") objednávku neobsahuje, takže se s ním nic neporovnává.'
                  : 'zeleně = čteno z originálu · červeně = AI přidala (není v originálu) · přeškrtnuto = AI přehlédla'}
              </div>
            </div>
          </div>

          {/* Legenda zvýraznění originálu — u fotky se v originálu nic
              nezvýrazňuje, protože originál je papír, ne popisek. */}
          {!isImage && (
            <div className="text-xs text-neutral-500 mt-2">
              Zeleně = přesná shoda s originálem, jantarově = částečná shoda (překlepy/pořadí slov). Číslo = položka níže.
            </div>
          )}

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
                {reparsing ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
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
                {/* Doplnilí jsme ho z citace, ať to není potichu — appka nemá
                    dělat nic, co se člověk nedozví. Přepisatelné jako cokoli
                    jiného v tomhle formuláři. */}
                {odberatelZOdpovedi && (
                  <div className="text-udaj font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded px-2 py-1 mt-1.5 inline-flex items-start gap-1">
                    <CornerDownRight size={12} className="shrink-0 mt-0.5" />
                    <span>
                      Doplněno z odpovědi na zprávu „{odberatelZOdpovedi}…" — ve zprávě samotné odběratel napsaný není. Zkontroluj a případně přepiš.
                    </span>
                  </div>
                )}
              </div>

              {/* ✂️ Rozdělit na dva odběratele — z provozu 15. 9. 2026: WhatsApp
                  zpráva se dvěma odběrateli (Chmeloun a Sluhy) dorazila jako
                  jedna objednávka. Tlačítko pro ZAPNUTÍ je dole u Ignorovat/
                  Zamítnout — tady jen rozbalený panel, jakmile je zapnuté.
                  Bez tlačítka nahoře, protože ho tam nebylo vidět (z provozu). */}
              {splitEnabled && !message.amends_order_id && items.length > 1 && (
                <div className="border border-amber-300 bg-amber-50 rounded p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-800">
                      Zaškrtni u položek níž, které patří druhému odběrateli
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSplitEnabled(false); setSplitKeys(new Set()); setSplitPlaceId(''); setSplitPlaceName(''); }}
                      className="text-xs font-bold text-neutral-500 hover:text-neutral-700 tap"
                    >
                      Zrušit rozdělení
                    </button>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">Druhý odběratel</div>
                    <PlaceCombobox
                      value={splitPlaceId || splitPlaceName}
                      onChange={(id, name) => { setSplitPlaceId(id); setSplitPlaceName(name); }}
                      places={props.places}
                    />
                  </div>
                </div>
              )}

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
                          {/* Pořadí je pořadí, ve kterém se objednávka čte:
                              PIVO — OBAL — POČET. Počet je jednou; dřív tu
                              stálo políčko s číslem a hned vedle rozbalovátko
                              s přednastavenými počty, takže na řádku byla dvě
                              místa s množstvím a nebylo poznat, které platí.
                              Všechna tři pole mají stejnou velikost písma
                              i výšku na dotek. */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {splitEnabled && (
                              <label className="flex items-center gap-1 shrink-0 text-xs font-bold text-amber-800" title="Patří druhému odběrateli">
                                <input
                                  type="checkbox"
                                  className="w-5 h-5"
                                  checked={splitKeys.has(item.key)}
                                  onChange={() => toggleSplitKey(item.key)}
                                />
                                2.
                              </label>
                            )}
                            <select
                              value={item.beerId}
                              onChange={(e) => updateItemBeer(index, e.target.value)}
                              className="select !py-1 text-sm font-black min-h-[44px] flex-1 min-w-[130px]"
                              title="Pivo"
                            >
                              <option value="">(Vyber pivo)</option>
                              {props.beers.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                            <select
                              value={item.pkgId}
                              onChange={(e) => updateItemPkg(index, e.target.value)}
                              className="select !py-1 text-sm font-black min-h-[44px] flex-1 min-w-[120px]"
                              title="Obal / objem"
                            >
                              <option value="">(Vyber obal)</option>
                              {props.packages.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                            <input
                              type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                              min={1}
                              value={item.qty}
                              onChange={(e) => updateItemQty(index, e.target.value)}
                              className="input !py-1 !px-2 text-sm font-black w-20 text-center shrink-0 min-h-[44px]"
                              title="Počet kusů"
                            />
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
                                    AI četla: „{item.rawLine}" — <b>{isImage ? 'nesedí s přepisem fotky' : 'v originální zprávě se nenašlo'}</b>, zkontrolujte přečtení!
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
                    {/* Ruční doplnění položky. AI občas řádek přehlédne
                        a do teď se dal dopsat až po schválení, na jiné
                        obrazovce a bez původní zprávy před očima. */}
                    <button
                      type="button"
                      onClick={addItem}
                      className="w-full px-3 py-2 rounded border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-black text-xs transition min-h-[44px] flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} /> Přidat řádek
                    </button>
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
            {/* Přísný režim zamkl schválení. Důvod visel jen v `title`, což
                na telefonu není nic — obsluha viděla šedé tlačítko a neměla
                kam klepnout. Teď je důvod vidět a vede z něj cesta ven. */}
            {prisnyBlokuje && (
              <div className="mb-3 p-3 rounded border-2 border-amber-400 bg-amber-50">
                <p className="text-xs font-black text-amber-950">
                  <AlertTriangle className="ikona-text" /> Přísný režim: {readback.mismatchCount} z {readback.items.length} položek
                  {' '}nesouhlasí s originálem, proto je schválení zamčené.
                </p>
                <p className="text-[11px] font-bold text-amber-900 mt-1">
                  Oprav položky, nebo — když jsi objednávku porovnal a je správně — schválení odemkni.
                </p>
                <button
                  type="button"
                  onClick={() => setPrisnyPrekonan(true)}
                  className="mt-2 px-3 py-2 rounded bg-amber-700 hover:bg-amber-600 text-white font-black text-xs transition min-h-[44px]"
                >
                  Zkontroloval jsem to — odemknout schválení
                </button>
              </div>
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

              {/* ✂️ Rozdělit na dva odběratele — vedle Ignorovat/Zamítnout,
                  ať je vidět (z provozu 15. 9. 2026: „nevidím to tlačítko,
                  dej to k tomu ignorovat, zamítnout"). Panel s výběrem
                  položek a druhého odběratele se rozbalí nahoře u položek. */}
              {!message.amends_order_id && items.length > 1 && !splitEnabled && (
                <button
                  type="button"
                  onClick={() => setSplitEnabled(true)}
                  disabled={loading}
                  className="btn-ghost"
                >
                  ✂️ Rozdělit na dva odběratele
                </button>
              )}
            </div>

            <button
              onClick={() => handleApprove(false)}
              disabled={jeVraceni || approving || loading || !isParsed || items.length === 0 || hasUnmatchedItems || (isImage ? (!!message.media_url && !photoChecked) : prisnyBlokuje)}
              className="px-6 py-2.5 bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2 font-medium"
              title={
                jeVraceni
                  ? 'Vypadá to na vrácení piva, ne na objednávku — zapiš ho tlačítkem „Zapsat jako vrácení" výše.'
                  : isImage && !!message.media_url && !photoChecked
                  ? 'Nejprve potvrďte, že jste fotku zkontroloval/a (tlačítko výše).'
                  : items.length === 0
                  ? 'Žádné položky k importu — smazanou položku vrátíte zavřením bez schválení nebo „Přečíst znovu (AI)".'
                  : hasUnmatchedItems
                    ? 'U některé položky chybí přiřazené pivo nebo obal — vyberte je z nabídky (jinak by položka zmizela ze skladu).'
                  : prisnyBlokuje
                    ? 'Přísný režim je zapnutý — opravte nesouhlasící položky, nebo schválení odemkněte tlačítkem výše.'
                    : undefined
              }
            >
              {approving ? <ButtonSpinner /> : <UserCheck size={16} />}
              {isParsed
                ? (isImage && !!message.media_url && !photoChecked
                    ? 'Nejprve zkontrolujte fotku…'
                    : hasUnmatchedItems
                      ? 'Doplňte pivo/obal…'
                    : prisnyBlokuje
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
            className="w-8 h-8 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
            title="Zavřít"
            aria-label="Zavřít"
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
            className="w-8 h-8 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
            title="Zavřít"
            aria-label="Zavřít"
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

