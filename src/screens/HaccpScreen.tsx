import { useState, useEffect } from 'react';
import { AlertTriangle, Ambulance, Ban, Beer as BeerIcon, Cable, Calculator, Cog, Droplets, Eye, Search, Shield, Shirt, ShowerHead, Snowflake, Wind, Wrench, Zap } from 'lucide-react';
import { BottlingLineMaintenance } from '../components/BottlingLineMaintenance';
import { IkonaSud, IkonaVycep } from '../components/ikony';

interface HaccpScreenProps {
  initialTab?: 'sanitacni_rad' | 'udrzba' | 'bozp_prvni_pomoc' | 'staceci_linka';
  setPage?: (p: any, sec?: string, sub?: string) => void;
  initialSubTab?: string;
}

/**
 * Sanitační řád — doslovný přepis oficiální tištěné příručky (Ing. Petr
 * Bednář, platnost od 1. 3. 2024), kterou sládek 24. 9. 2026 vyfotil a
 * požádal o přepis „ať se dá listovat a dobře hledat". Kapitoly jdou přesně
 * podle pořadí v tištěné příručce — nic se nepřeskupovalo ani nezkracovalo.
 */
const SANITACNI_RAD: { id: string; title: string; content: string }[] = [
  {
    id: 'sr-varna',
    title: 'Sanitace varna',
    content: `Po každém týdnu (pokud se vaří) se provádí alkalická sanitace varního zařízení.

Před sanitací se zkontroluje uzavření šoupěte z dopravníku sladového šrotu.

Varní kotel se napustí 5hl vody, po rozmíchání hydroxidu na koncentraci 1,5 % a přídavku 2 dcl chlornanu (chlornan v závislosti na intenzitě znečištění zařízení, ne však více než 0,5l / 5hl, případně přidávat během sanitace, až část zreaguje s nečistotami).

Varní kotel se sanituje roztokem hydroxidu o teplotě 80 °C cirkulací hlavním čerpadlem na varně skrze sanitační sprchy. Během cirkulace se také napustí celý systém trubek varny sanitačním roztokem a sanitace se nechá také procházet potrubím do vystěradla pro přívod vystírací vody, a to třikrát po dobu dvou minut.

Pokud po 15–20 minutách sanitace kotel nejeví vizuální známky znečištění, přečerpá se sanitace do scezovací kádě. Roztok hydroxidu je potřeba co možná nejdříve oplachovat čistou vodou jinak může docházet k tvorbě vápenatých usazenin.

Scezovací kád' se pak nechá 15 minut sanitovat hlavním čerpadlem na varně skrze sanitační sprchy, zde POZOR a nepouštět sanitaci do sprch pro vyslazování!!! Hrozilo by zacpání sprch případnými zbytky sladových zrn. Ke konci sanitace se pustí kopačka se spuštěnými hrably pro výhoz mláta na nízké otáčky (cca 3–4 na fm), čímž se vysanitují scezovací síta. Po sanitaci sprchami se pustí sanitace trubkami spodem do scezovacího věnce a na půl se otevře i cesta do trysek pod síta. Po pěti minutách cirkulace a oplachu stěn kádě a kopačky se pustí na 5 minut podrážení a pak se přečerpá sanitace scezovacím čerpadlem do rmutomladinové pánve.

Ve RMP se sanitace přihřeje na 85 °C a vyčerpá se do vířivé kádě. Do VK se nechá odtéct i veškerá sanitace z trubek varní soustavy, aby v systému zůstalo minimum sanitačního roztoku.

Celá varna se pak ihned řádně propláchne horkou vodou z boileru. Nejdříve se pustí voda, když jsou všechny klapky v systému otevřeny, mimo cesty do vířivé kádě. Poté co vyteče poslední sanitace ze systému trubek a teče voda se postupným zavíráním klapek v nižších polohách opláchne skrze sprchy nejdříve RMP, poté od RMP trubky do SK, poté sprchou SK. Po oplachu sprchou po dobu tří minut se zavřou výpustní klapky na SK a proplachová voda se pustí do věnce a do trysek pod síty. Po minutě proplachování se pustí scezovacím čerpadlem proplach scezovací cesty do RMP, po tříminutovém proplachu scezovací cesty se propláchne ještě cesta podrážení, cca 2 minuty. Na závěr se ještě jednou propláchne RMP včetně cesty do vystěradla. Poslední odkapová voda kontroluje hmatem na přítomnost reziduí chlornanu a hydroxidu – voda má být čistá a bez zápachu. Celý prostor varny se na závěr důkladně opláchne hadicí.

V závislosti na množství anorganických usazenin se RMP jednou za 4 až 6 týdnů po alkalické sanitaci a proplachu vysanituje kyselinou dusičnou ručně kartáčem a důkladně opláchne.`,
  },
  {
    id: 'sr-virive-kad',
    title: 'Sanitace vířivá kád\' a spílací cesta',
    content: `Po vyčerpání sanitace z varny se propojí spílací cesta (POZOR na propláchnutí chmelového filtru před deskovým chladičem!) do cirkulace zpět od kvasných tanků do sanitační sprchy vířivé kádě a horký sanitační roztok se nechá cirkulovat po dobu dvaceti minut. Do spílacího potrubí je vhodné pootevřít vzduch do vzdušnící svíčky na spílacím potrubí, který pár minut před koncem cirkulace opět zavřeme. Po cirkulaci se sanitační roztok vytlačí z potrubí do vířivé kádě od kvasných tanků.

Mezi várkami je spílací cesta sanitována horkou vodou, kdy je celé potrubí zahřáto na alespoň 65 °C po dobu min. 15 minut. Horká voda (cca 7 hl, nejméně 70 °C) se napustí do vířivé kádě a po proplachu chmelového filtru a zapojení spílací hadice včetně nerezového „téčka" na vratkové potrubí zpět na varnu se vyčerpá horká voda, během čerpání se na 10 vteřin otevře vzduch do vzdušnící svíčky. Teplota ve spílacím potrubí by měla být alespoň 65 °C po dobu 15 minut. Spílací cesta se ještě před samotným spíláním propláchuje studenou vodou po dobu deseti minut.`,
  },
  {
    id: 'sr-kvasne-tanky',
    title: 'Sanitace kvasné tanky + kvasničné hospodářství',
    content: `Před sespíláním je kvasný tank vysanitován roztokem kyseliny dusičné o koncentraci 1 % včetně spílací hadice a nerezového „téčka" sanitačním čerpadlem skrze sanitační sprchu. Pokud v na vnitřním povrchu nejsou usazeniny pivního kamene nechá se roztok kyseliny cirkulovat 15 minut. Poté se roztok kyseliny odčerpá do zásobní nádrže a tank se propláchne vodou přes sprchu třikrát po dobu tří až čtyř minut.

Před zakvašováním se nerezové kýble na zakvašování vysterilují vždy 0,1%ním roztokem Persterilu a důkladně opláchnou vodou.

Pokud se pro rozkvas sušených kvasnic odebírá sladina, používají se plastové barely od kvasnic, které jsou před použitím vysanitovány roztokem hydroxidu sodného o koncentraci 3 %, po důkladném proplachu ještě vysterilovány 0,2%ním roztokem Persterilu. Na závěr před odběrem sladinky je barel vždy důkladně opláchnut (3×) čistou vodou.

Pokud se po hlavním kvašení sbírají kvasnice, jsou nejdříve všechny pracovní pomůcky (nerez kýble, sítko na kvasnice, zásobní nádoba pro úchovu) vysanitovány 3%ním roztokem hydroxidu sodného. Nádoba na úchovu kvasnic se s roztokem hydroxidu ještě přemyje kartáčem pro čisté části provozu, včetně všech špatně přístupných míst!!! Po alkalickém mytí jsou pomůcky a zařízení ihned opláchnuty čistou vodou. Před samotným sběrem kvasnic se všechny pomůcky ještě vysterilují 0,1%ním roztokem Persterilu a důkladně opláchnou čistou vodou. Při sanitaci a oplachu sítka a kýble pro sběr kvasnic je nutné dbát na důsledné vystříkání i všech záhybů a zákoutí celého povrchu sítka a u kýble se sanituje a důkladně oplachuje i jeho vnější povrch.

Po hlavním kvašení se vystříkají zbytky kvasnic z tanku a kvasný tank se nejdříve důkladně opláchne vodou skrze sanitační sprchu. Poté se tank vysanituje 1,5%ním roztokem hydroxidu sodného, do kterého přidáme 0,1 l chlornanu sodného na 1hl sanitačního roztoku. POZOR!!! Kvasný tank během sanitace nezavírat, jelikož nemá podtlakový ventil! Hrozilo by zborcení tanku. Po deseti až patnácti minutách je již sanitační roztok silně znečištěn a neutralizován přítomným CO2.

Po první louhové sanitaci je tank propláchnut čistou vodou a je provedena vizuální kontrola, v případě, že na stěnách jsou stále zbytky kvasné deky, provede se ještě druhotná alkalická sanitace, která může být o koncentraci 1 % a roztok se nechá cirkulovat 20 minut. Po odčerpání roztoku do zásobní nádrže je tank důkladně propláchnut čistou vodou. Po vystříkání zbytků pěny se nechá tank proplachovat sprchou třikrát po dobu tří až čtyř minut.

Při sanitacích je vždy potřeba povrch tanku uvnitř pod lemem na dvířka umýt kartáčem se sanitačním roztokem, jelikož proudění při sanitaci sprchou nedostatečně tuto část vnitřního povrchu myje a v této části se pak tvoří četné usazeniny!!!`,
  },
  {
    id: 'sr-lezacke-tanky',
    title: 'Sanitace ležácké tanky',
    content: `Po vyprázdnění se tank důkladně vystříká od zbytků piva a kvasnic a propláchne vodou přes sanitační sprchu. Sanitační režim je stejný jako u kvasných tanků, jen kyselou sanitaci lze provádět vždy po dvou výrobních šaržích.`,
  },
  {
    id: 'sr-stacecí-aparat-keg',
    title: 'Sanitace stáčecího aparátu pro keg sudy',
    content: `Stáčecí aparát pro stáčení piva do keg sudů se skládá z narážeče, hadic a narážecí matice. Po stáčení piva je celý aparát propláchnutý čistou vodou, včetně bočního vývodu z narážeče pro upouštění tlaku ze sudu.

Narážecí matice jsou uloženy v roztoku 0,05%ního roztoku Persterilu. Před stáčením piva se každý den aparát vysteriluje 0,1%ním roztokem Persterilu a po pěti minutách působení se propláchne čistou vodou.

Jednou za měsíc se celý stáčecí aparát včetně narážečů rozebere do nejmenších komponentů a jednotlivé součásti se nechají odmáčet v 0,5%ním roztoku hydroxidu sodného alespoň 24 hodin. Poté jsou jednotlivé části důkladně vyčištěny a po sestavení celého aparátu se před prvním stáčením ještě provede finální sterilace Persterilem dle postupu uvedeného výše.`,
  },
  {
    id: 'sr-myti-keg',
    title: 'Sanitace a mytí keg sudů',
    content: `Povrchy sudů se myjí alkalickým roztokem chlornanu sodného s přídavkem saponátu ručně kartáčem a důkladně oplachují čistou vodou.

Vnitřní části sudů včetně fittingu jsou sanitovány na automatické myčce sudů. V prvních dvou krocích probíhá proplach sudu vodou a mytí 80 °C horkým roztokem hydroxidu sodného o koncentraci 1,5 %. Ve třetím kroku oplach 65 °C horkou vodou a v posledním kroku probíhá sterilace celého sudu párou. Během mytí probíhá i namátková kontrola správného průběhu mytí v jednotlivých krocích. Pokud v nějakém sudu po vyjetí z myčky zůstane kapalina, zjišťuje se, zda-li v sudu nezůstal roztok hydroxidu, pokud ano, sud se posílá znovu projet mycím programem.

Jednou za měsíc se hydroxid sodný po důkladném výplachu zbytků roztoku hydroxidu ze systému nahradí roztokem kyseliny dusičné a sanitace sudů v prvních dvou krocích programu se v daném dni provede 1,5%ním roztokem kyseliny dusičné. Poté se roztok kyseliny ze systému důkladně vypláchne vodou.`,
  },
  {
    id: 'sr-stacecí-aparat-lahve',
    title: 'Sanitace stáčecího aparátu pro lahve',
    content: `Stáčecí aparát pro ruční stáčení lahví (Pegas) je před každým stáčením lahví vysanitováno 0,1%ním roztokem Persterilu přes narážeč do sanitační lahve. Po pěti minutách působení roztoku se zařízení propláchne čistou vodou.

Jednou měsíčně se celý aparát rozebere a jednotlivé komponenty se nechají odmáčet v 0,5%ním roztoku hydroxidu sodného po dobu alespoň 24 hodin. Po důkladném vyčištění a oplachu čistou vodou se aparát sestaví a před stáčením ještě vysteriluje roztokem Persterilu dle postupu popsaného výše.

V případě, že se použije automatická stáčecí linka, je nejdříve provedena údržba a kontrola těsnosti a čistoty jednotlivých vnitřních komponent a následně provedena sanitace 65 °C horkým roztokem 1%ního hydroxidu sodného cirkulací po dobu 20 minut. Poté je zařízení propláchnuto 10 minut 80 °C horkou vodou a 10 minut čistou studenou vodou.`,
  },
  {
    id: 'sr-vycepni-zarizeni',
    title: 'Sanitace výčepních zařízení',
    content: `Výčepní zařízení z jednorázových akcí, nebo ze zapůjčení je po vrácení propláchnuto čistou vodou. Před použitím se výčepní zařízení napustí roztokem hydroxidu sodného o koncentraci 1,5 %. Po několika hodinách působení se zařízení propláchne čistou vodou. Výčepní kohout se odmontuje a rozmontuje na jednotlivé části, které jsou vyčištěny a opláchnuty čistou vodou. Narážeče se nechají odmočit v 0,5%ním roztoku hydroxidu sodného po dobu několika hodin, v závislosti na znečištění. Po vyjmutí jsou důkladně opláchnuty čistou vodou.`,
  },
  {
    id: 'sr-povrchy',
    title: 'Mytí a sanitace povrchů a výrobních prostor pivovaru, údržba stavebně technického stavu',
    content: `Podlahy v pivovaru jsou průběžně splachovány během každého pracovního dne a hlavně pak na závěr po ukončení pracovních činností (checklist konec dne / konec týdne). V závislosti na intenzitě znečištění a ročním období se podlahy pravidelně myjí alkalickým roztokem chlornanu sodného s přídavkem saponátu. Mycí roztok se nejdříve nanese na celou plochu podlahy, po čtvrt hodině působení se podlaha vydrhne tvrdým kartáčem se zvláštním důrazem na spáry a špatně čistitelná místa. Po mechanickém vyčištění se podlaha důkladně spláchne od nečistot a sanitačního roztoku.

Stejným postupem se pravidelně myjí i povrchy ležáckých a kvasných tanků a ostatní výrobní technologie.

Po mytí povrchů je vždy proveden záznam do sanitačního deníku, jaké prostory a kdy byly umyty.

Frekvence, se kterou jsou jednotlivé části provozu čištěny, se liší v závislosti na rychlosti znečišťování daných prostor a prioritě z pohledu nezbytnosti mikrobiální čistoty ve smyslu rizika kontaminace produktu. Nejvyšší prioritu má prostor kvašení a zrání piva a taktéž prostor stáčení piva.

Plíseň ve zdivu je pravidelně oškrabávána zednickou špachtlí a přemalovávána vápnem s příměsí chlornanu vápenatého a hydroxidu sodného. Zápis o provedení těchto prací je uveden vždy do sanitačního deníku.

Odlámané části dlažby jsou důkladně vystříkávány a na víkend se vždy dutiny pod rozbitou podlahou zalévají roztokem chlorového vápna (0,5l sypkého chlornanu vápenatého / 5 litrů vody), po víkendu se chlorové vápno z dutin vystříká čistou vodou. Jednou za rok se nechá vždy poničená podlaha opravit.

Jednotlivé práce mytí, čištění a údržby stavebně technického stavu se plánují v závislosti na akutnosti, ročním období a momentálních možnostech ve smyslu harmonogramu ostatních prací v provozu.

Jednou za rok se vyčistí i prostor nakládací rampy.`,
  },
  {
    id: 'sr-srotovnik',
    title: 'Šrotovník a sklad sladu',
    content: `Prostor šrotovny se zametá „na sucho" smetákem na konci každého týdne. Při větším množství sladového prachu je potřeba prostory zamést dvakrát. Odpad ze skladu sladu je pravidelně odvážen a v prostorách je kontrolován výskyt škůdců. Prostor je důkladně uzavírán, aby nedocházelo k proniknutí škůdců.`,
  },
  {
    id: 'sr-sanitacni-denik',
    title: 'Sanitační deník nerutinních sanitací a prací údržby',
    content: `Sanitační deník nerutinních sanitací a prací údržby, plán čištění a prací údržby, tank ledová voda, nádoba na kvasnice, výrobník sodové vody.

Do sanitačního deníku jsou zapisovány „nerutinní" sanitace, které se vykonávají pravidelně, ale s menší frekvencí – tedy všechny sanitace mimo sanitace varny, sanitace tanku a sanitace stáčecích aparátů a mytí sudů.

Stejně tak sanitační plán a plán údržby obsahuje plánované sanitace, mimo výše zmíněných, stejně jako u zápisu do sanitačního deníku.

V sociálním zázemí výrobních prostor jsou prováděny čištění dle rozpisu na denní místnosti pivovaru.`,
  },
];

export default function HaccpScreen({ initialTab = 'sanitacni_rad', setPage, initialSubTab }: HaccpScreenProps) {
  const [activeTab, setActiveTab] = useState<'sanitacni_rad' | 'udrzba' | 'bozp_prvni_pomoc' | 'staceci_linka'>((initialSubTab as any) || initialTab);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActiveTab((initialSubTab as any) || initialTab);
  }, [initialSubTab, initialTab]);

  function selectTab(t: 'sanitacni_rad' | 'udrzba' | 'bozp_prvni_pomoc' | 'staceci_linka') {
    if (setPage) setPage('haccp', undefined, t);
    else setActiveTab(t);
  }

  // Kalkulačka „hrubé" koncentrace sanitačního roztoku — M = P × V / C,
  // přesně podle vzorce v tištěné příručce.
  const [calcP, setCalcP] = useState('1.5');
  const [calcV, setCalcV] = useState('500');
  const [calcC, setCalcC] = useState('100');
  const calcM = (() => {
    const p = parseFloat(calcP);
    const v = parseFloat(calcV);
    const c = parseFloat(calcC);
    if (!isNaN(p) && !isNaN(v) && !isNaN(c) && c > 0) return ((p * v) / c).toFixed(2);
    return null;
  })();

  const filteredSanitacniRad = SANITACNI_RAD.filter((doc) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return doc.title.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q);
  });

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
              <h2 className="font-display font-black text-lg text-neutral-900 tracking-tight">Sanitační řád</h2>
              <p className="text-xs text-neutral-600 font-bold">Kynšperský pivovar s.r.o. — Sokolovská 482/40, Kynšperk nad Ohří</p>
            </div>
          </div>
        </div>

        {/* Přilepené pod záložkami SanitaceTabbed nad tím. */}
        <div className="sticky top-0 z-10 bg-white flex items-center gap-2 overflow-x-auto scrollbar-thin pt-1 border-t border-amber-200/60">
          <button
            onClick={() => selectTab('sanitacni_rad')}
            className={`px-4 py-2.5 rounded text-xs font-black transition flex items-center gap-2 shrink-0 ${
              activeTab === 'sanitacni_rad'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Droplets size={16} />
            <span>Sanitační řád</span>
          </button>

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

      {/* TAB 0: SANITAČNÍ ŘÁD (doslovný přepis tištěné příručky) */}
      {activeTab === 'sanitacni_rad' && (
        <div className="space-y-5">
          <div className="card p-6 bg-white border border-neutral-200/90 rounded shadow-xs space-y-4">
            <div className="border-b border-neutral-100 pb-4 space-y-1">
              <h1 className="text-xl sm:text-2xl font-display font-black text-neutral-900 flex items-center gap-2">
                <Droplets className="text-amber-600" size={26} />
                <span>Sanitační řád — Kynšperský pivovar s.r.o.</span>
              </h1>
              <p className="text-xs text-neutral-600 font-bold">
                Sokolovská 482/40, Kynšperk nad Ohří, 357 51 · Příručku vytvořil: <strong>Ing. Petr Bednář</strong> · Platnost od 1. března 2024
              </p>
            </div>

            <p className="text-xs text-neutral-800 font-medium leading-relaxed">
              Sanitační řád je nastaven v souladu s pravidly pro BOZP. Pro práci s chemikáliemi jsou používány ochranné pracovní pomůcky – gumové rukavice, ochranné brýle, práce je prováděna v odpovídající pracovní obuvi. Z chemikálií jsou používány hydroxid sodný a chlornan sodný pro alkalické sanitace a kyselina dusičná a fosforečná pro kyselé sanitace. Pro finální sterilaci stáčecích aparátů je používaná ještě kyselina peroxyoctová (Persteril). Pro hrubou sterilaci podlah se používá chlorové vápno – chlornan vápenatý.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kalkulačka koncentrace */}
              <div className="p-4 rounded bg-amber-50 border-2 border-amber-300 space-y-3">
                <div className="font-black text-amber-950 text-sm flex items-center gap-2">
                  <Calculator className="ikona-text" /> Výpočet „hrubé" koncentrace sanitačního roztoku
                </div>
                <div className="text-center font-mono font-black text-lg text-amber-950 bg-white rounded py-2 border border-amber-200">M = P × V / C</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="block">
                    <span className="block font-bold text-amber-900 mb-0.5">P — % roztoku</span>
                    <input className="input !py-1.5 text-xs font-mono font-bold" value={calcP} onChange={(e) => setCalcP(e.target.value)} placeholder="1.5" />
                  </label>
                  <label className="block">
                    <span className="block font-bold text-amber-900 mb-0.5">V — voda (l)</span>
                    <input className="input !py-1.5 text-xs font-mono font-bold" value={calcV} onChange={(e) => setCalcV(e.target.value)} placeholder="500" />
                  </label>
                  <label className="block">
                    <span className="block font-bold text-amber-900 mb-0.5">C — konc. chemikálie (%)</span>
                    <input className="input !py-1.5 text-xs font-mono font-bold" value={calcC} onChange={(e) => setCalcC(e.target.value)} placeholder="100" />
                  </label>
                </div>
                <div className="p-2.5 rounded bg-neutral-900 text-amber-300 text-center font-mono">
                  <span className="text-udaj text-neutral-400 uppercase block">Hmotnost chemikálie M</span>
                  <span className="font-display font-black text-2xl">{calcM ? `${calcM} kg` : '—'}</span>
                </div>
                <p className="text-udaj text-amber-900/80 font-medium leading-snug">
                  P = požadované procento san. roztoku (% hm.) · V = objem vody v litrech · C = hmotnostní koncentrace chemikálie (čistá látka = 100 %, kapaliny méně).
                </p>
              </div>

              {/* Obecné zásady */}
              <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-2">
                <div className="font-black text-neutral-900 text-sm">Hlavní obecné zásady pro správné provedení sanitace a dlouhodobou udržitelnost čistoty výrobního zařízení</div>
                <ul className="space-y-1.5 text-xs text-neutral-700 font-medium leading-relaxed list-disc pl-4">
                  <li>Zařízení po alkalické sanitaci je potřeba ihned propláchnout čistou vodou, jinak hrozí tvorba anorganických usazenin.</li>
                  <li>Důkladné splachování nečistot před sanitací, proplach po sanitaci a oplachy čistou vodou jsou nezbytným předpokladem funkční a řádné sanitace. Před sanitací výrobního zařízení je třeba vždy řádně vypláchnout co možná všechny zbytky piva, kvasnic apod.</li>
                  <li>Neexistuje žádný předpis, který přesně definuje, jaká koncentrace, teplota a doba sanitace je zárukou absolutní účinnosti. Parametry je mnohdy potřeba upravit podle intenzity znečištění a míry rizika znehodnocení produktu — vyšší teplotu může nahradit vyšší koncentrace a delší doba sanitace a naopak.</li>
                  <li>Organické usazeniny — alkalická sanitace, případně s přídavkem oxidačního činidla. Anorganické usazeniny — kyselá sanitace.</li>
                  <li>Používají se vizuálně odlišitelné druhy kartáčů: přísnější pro povrchy přicházející do styku s produktem, jiné pro znečištěnější části provozu (podlahy apod.).</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Hledání a kapitoly */}
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              className="input !pl-10 font-medium text-xs bg-white border-neutral-200 w-full"
              placeholder="Hledat v sanitačním řádu (např. sanitace varna, keg sudy, podlahy)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {filteredSanitacniRad.length === 0 ? (
              <div className="card p-8 text-center text-xs font-bold text-neutral-500 bg-white">Žádná kapitola neodpovídá hledání.</div>
            ) : (
              filteredSanitacniRad.map((doc) => (
                <div key={doc.id} id={doc.id} className="card p-5 bg-white border border-neutral-200/90 rounded space-y-2 shadow-xs scroll-mt-20">
                  <h3 className="font-display font-black text-base text-amber-950 flex items-center gap-2">
                    <Droplets size={16} className="text-amber-600 shrink-0" />
                    <span>{doc.title}</span>
                  </h3>
                  <div className="text-xs text-neutral-700 font-medium leading-relaxed whitespace-pre-line">
                    {doc.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
