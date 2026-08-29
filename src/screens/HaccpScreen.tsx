import { useState, useEffect } from 'react';
import { AlertTriangle, Ambulance, Ban, Beer as BeerIcon, BookOpen, Brush, Cable, Calculator, CheckCircle2, ClipboardList, Cog, Cylinder, Dna, Droplets, Eye, Factory, FileText, Flame, FlaskConical, Leaf, Package, Plug, ScrollText, Search, Settings, Shield, Shirt, ShowerHead, Snowflake, Sparkles, SprayCan, Thermometer, Truck, Warehouse, Wheat, Wind, Wrench, Zap } from 'lucide-react';
import { BrewingTroubleshootingDatabase } from '../components/BrewingTroubleshootingDatabase';
import { BottlingLineMaintenance } from '../components/BottlingLineMaintenance';
import { IkonaLahev, IkonaSud, IkonaVycep } from '../components/ikony';

interface HaccpScreenProps {
  initialSection?: string;
  initialTab?: 'sanitacni_rad' | 'svhp' | 'udrzba' | 'diagram' | 'bozp_prvni_pomoc' | 'troubleshooting' | 'staceci_linka';
  setPage?: (p: any, sec?: string, sub?: string) => void;
  initialSubTab?: string;
}

type CategoryKey = 'all' | 'uvod' | 'suroviny' | 'uskladneni' | 'varna' | 'kvaseni' | 'staceni' | 'expedice' | 'pravidla';

interface HaccpItem {
  id: string;
  num: string;
  cat: CategoryKey;
  title: string;
  /** Kreslená ikona, ne emoji — stejný typ, jaký už používají `categories` níž. */
  icon: typeof BookOpen;
  content: string;
}

const DIAGRAM_ASCII = `[1.1. Přejímka a převoz sladu]     [1.2. Pitná voda]                         [1.3. Přejímka chmelu]
              │                             │                                           │
              ▼                             ▼                                           ▼
   [2.1. Uskladnění sladu]      [3.2. Vystírání a rmutování]              [2.2. Uskladnění chmelu]    [1.4. Přejímka kvasnic]
              │                             │                                           │                     │
              ▼                             ▼                                           │                     ▼
    [3.1. Šrotování sladu]      [3.3. Scezování sladiny] ───► [3.4. Chmelovar]              │          [2.3. Uskladnění kvasnic]
                                            │                      │                    │                     │
                                            ▼                      │                    │                     │
                                       [6.2. Mláto]                ▼                    │                     │
                                                            [3.5. Vířivá káď]           │                     │
                                                                   │ ◄──────────────────┴─────────────────────┘
                                                                   │
                                            ┌──────────────────────┴──────────────────────┐
                                            ▼                                             ▼
                                     [4.2. Kvašení] ◄──────────────────────────────► [4.1. Spílání]
                                            │                                             │
                                            ▼                                             │
                                    [4.3. Dokvašování] ────► [4.4. Stáčení do KEG sudů] ◄─┘
                                                                   │             ▲
                                                                   │             │
[2.5. Příjem a uskladnění lahví]                                   │       [7.1. Mytí KEG sudů] ◄── [2.4. Příjem a uskladnění
              │                                                    │                                  prázdných KEG sudů]
              ▼                                                    ▼
   [7.2. Kontrola lahví] ──────────► [5.1. Stáčení do lahví] ──► [8.1. Uskladnění stočeného piva]
                                                                   │
                                                                   ▼
                                                             [9.1. Výdej stočeného piva] ──► [10. Přeprava k zákazníkovi]`;

const HACCP_DOCUMENTS: HaccpItem[] = [
  {
    id: 'sec-A',
    num: 'A',
    cat: 'uvod',
    title: 'A. Úvod — Kynšperský pivovar s.r.o.',
    icon: ScrollText,
    content: `Jelikož pivo je ze své podstaty produktem, při jehož výrobě nevzniká veliké riziko ohrožení zdravotní nezávadnosti produktu, pravidla popsaná v této příručce jsou nastaveny nejen z pohledu zajištění zdravotní nezávadnosti produktu, ale hlavně pak taktéž jeho jakosti.

V celém provozu je zajištěna deratizace a dezinsekce odbornou firmou. V jednotlivých částech provozu je sledován výskyt škůdců a o případném nálezu je vždy veden záznam včetně popisu nápravných opatření.

Údržba čistoty a stavebně technického stavu prostor výrobní technologie je prováděna v souladu se sanitačním řádem.`
  },
  {
    id: 'sec-1-1',
    num: '1.1, 1.3, 1.4',
    cat: 'suroviny',
    title: '1.1. Přejímka sladu, 1.3. Přejímka chmelu, 1.4. Přejímka kvasnic',
    icon: Wheat,
    content: `Suroviny jsou nakupovány od ověřených dodavatelů, kteří deklarují jejich nezávadnost (prohlášení o shodě). Slad, chmel a kvasnice jsou nakupovány u dodavatelů a převáženy do pivovaru firemním automobilem zaměstnancem pivovaru. Při přejímce a během transportu a vykládce se dbá na to, aby nebyly obaly porušeny, nebo aby nenavlhnuly (v případě sladu) a nebyly jinak znečištěny.

Při přejímání surovin se kontroluje neporušenost obalů. Nejvyšší zřetel je třeba brát na balíčky se sušenými kvasnicemi. Při přejímce tekutých živých kvasnic se kontroluje pečetní samolepka na víčku barelu.

Společně s touto příručkou jsou uchovávány osvědčení o nezávadnosti surovin a prohlášení o shodě od dodavatelů.`
  },
  {
    id: 'sec-1-2',
    num: '1.2',
    cat: 'suroviny',
    title: '1.2. Pitná voda',
    icon: Droplets,
    content: `Pitná voda je odebírána od VAK Sokolov, který dodává pravidelné rozbory vody, které jsou archivovány společně s touto příručkou.`
  },
  {
    id: 'sec-2-1',
    num: '2.1',
    cat: 'uskladneni',
    title: '2.1. Uskladnění sladu',
    icon: Factory,
    content: `Slad je uskladněn v suchém skladu na prvním podlaží vedle místnosti se šrotovníkem. V prostoru je sledována relativní vlhkost vzduchu, která by neměla přesáhnout 60%.

Skladovací prostory jsou zajištěny proti vniknutí škůdců (striktní zavírání dveří a ostatní způsoby zamezení vniknutí) a zároveň probíhá kontrola jejich výskytu (výkaly, „prokousaný pytel“), která je součástí harmonogramu pravidelných operací (viz Sanitační řád). Udržování čistoty skladovacích prostor jakožto celého prostoru šrotovníku probíhá dle sanitačního řádu.

Pytle se sladem jsou uskladněny dle jednotlivých druhů. Koloběh zásob probíhá dle pravidla „FIFO“ tedy první jsou vyskladňovány zásoby, které byly naskladněny dříve než ostatní. Suroviny jsou skladovány jen nezbytně krátkou dobu a jsou z pravidla spotřebovány do jednoho týdne od doby, kdy jsou uskladněny.

V případě, že je část surovin skladována déle, jsou tyto suroviny označeny datumem uskladnění. Tím je zajištěna sledovatelnost surovin pro jednotlivé šarže várek v návaznosti na varní listy.`
  },
  {
    id: 'sec-2-2',
    num: '2.2',
    cat: 'uskladneni',
    title: '2.2. Uskladnění chmelu',
    icon: Leaf,
    content: `Chmel je uskladněn ve sklepě pivovaru při teplotě do 8°C. Většina používaných chmelů se ihned po otevření zužitkují.

U pytlů, které zůstanou „načaté“ se zaznamená datum uskladnění a datum otevření a už nejsou používány pro studené chmelení.

Sledovatelnost je zajištěna zužitkováním suroviny pro danou šarži, kdy suroviny nejsou skladovány déle než týden a je tedy lehce rozklíčovatelné, do jaké šarže piva šla jaká surovina.`
  },
  {
    id: 'sec-2-3',
    num: '2.3',
    cat: 'uskladneni',
    title: '2.3. Uskladnění kvasnic',
    icon: FlaskConical,
    content: `Pro první násadu pivovarských kvasnic se používají nakupované tekuté kvasnice, které se před upotřebením neskladují déle než tři dny od data výroby při teplotě 4°C.

Po prvním nasazení se pak kvasnice sbírají vystříkáním vodou z kvasného tanku a zbavují se hrubých kalů přecezením přes nerezové sítko. Celý proces je detailněji popsán v bodu 4.2. Kvašení piva.

Do dalšího použití jsou promyté kvasnice uskladněny v „kvasném vajíčku“ při teplotě 2–4°C. Úchova sebraných kvasnic neprobíhá nikdy déle jak 3 dny, a to pod hladinou čisté vody, která se po 24 hodinách obměňuje a teplota se udržuje 2–4°C. Pokud se kvasnice do třech dní nepoužijí, tak se likvidují.

Veškerá práce s kvasnicemi probíhá ve sterilních rukavicích se sterilními pomůckami, tak aby nedošlo k jejich kontaminaci. Sanitace nádob a pomůcek probíhá dle sanitačního řádu.`
  },
  {
    id: 'sec-3-1',
    num: '3.1',
    cat: 'varna',
    title: '3.1. Šrotování sladu',
    icon: Cog,
    content: `Během první fáze výroby, kterou je šrotování se provádí smyslová kontrola každého otevíraného pytle sladu. Vlastnosti sladu lze posuzovat již při prvním kontaktu se zrnem sladu, když ho člověk nabírá do ruky, poté následuje přivonění a ochutnání několika zrnek, přičemž mimo chuti a vůně lze zkoumat i strukturu zrna při jeho skusu.

Sleduje se i barva, která by měla u světlých sladů být obilně nažloutlá u tmavších sladů pak v závislosti na druhu sladu. Zrna by neměla být zašedlá a neměla by mít černé špičky, což jsou indikátory přítomnosti plísní. Slad by neměl jevit známky zvlhnutí ani zatuchlosti a neměl by obsahovat žádné příměsi.

Vůně by měla být typicky obilně sladová, v závislosti na typu sladu. Chuť by neměla být nepříjemná, ani kyselá ani hořká, vždy s ohledem na typ sladu a „stádium jeho praženosti“. Zrno by mělo být na skus tak akorát křehké, určitě ne tvrdé, nikoliv však ani měkké natolik, že by se nám drolilo na prach. Pokud slad jeví známky znehodnocení, je tato skutečnost oznámena odpovědné osobě, která rozhodne o dalším vývoji, o celé neshodě je proveden zápis.

Doba mezi našrotováním a vystíráním (sypáním na várku) je maximálně 24 hodin. Čištění šrotovníku a jeho prostor probíhá dle sanitačního řádu. V prostorách šrotovníku je sledován výskyt škůdců (hlodavci, hmyz).`
  },
  {
    id: 'sec-3-2',
    num: '3.2–3.5',
    cat: 'varna',
    title: '3.2–3.5. Vystírání, Rmutování, Scezování, Chmelovar, Vířivá káď',
    icon: Flame,
    content: `Před začátkem várky se provede sanitace varny dle postupu v sanitačním řádu, zpravidla se ale varna sanituje koncem týdne předešlého. Sanitace probíhá dle sanitačního řádu, poslední oplach je kontrolován na neutrální pH lakmusovým papírkem. Před napouštěním vody na várku se provede ještě jeden proplach všech potrubí a nádob varny.

Pro každou várku je zaznamenáván varní list, kam se zapisují použité suroviny a jednotlivé kroky varného postupu. Součástí varnního listu je i kvasný list - záznam o kvašení (teploty, extrakt, použité kvasnice apod.) a následně i záznam o dokvašení v ležáckém tanku.

Voda na vyslazení mláta po scezování má mít teplotu 78°C. Každá várka je zakončená 90 minut dlouhým chmelovarem a poté přečerpána do vířivé kádě, vysanitované dle sanitačního řádu. Varní soustava se po dovaření důkladně propláchne vodou. Varní nádoby jsou vždy důkladně opláchnuty od zbytků díla, aby na povrch nepřischávaly nečistoty. Po vyčerpání mladiny na vířivou káď je topné dno důkladně ostříknuto od napálenin.`
  },
  {
    id: 'sec-6-2',
    num: '6.2',
    cat: 'varna',
    title: '6.2. Mláto',
    icon: Wheat,
    content: `Ihned po scezování se nechá mláto vykapat a vyhrnuje se pomocí kypřidla scezovací kádě do šachty pro výhoz mláta, odkud se jímá do nádoby a pomocí výtahu posílá ven z pivovaru.

Po výhozu následuje řádný oplach všech podlah a znečištěných prostor, zbytky mláta jsou četnými zdroji kontaminující, pivu škodící mikroflóry.`
  },
  {
    id: 'sec-4-1',
    num: '4.1',
    cat: 'kvaseni',
    title: '4.1. Spílání',
    icon: Snowflake,
    content: `Spíláním je horká mladina průtokově zchlazována v deskovém chladiči na zákvasnou teplotu. Na vířivé kádi je ještě mladina sterilní účinkem vysoké teploty. Po zchlazení je z pohledu perfektní jakosti hotového piva naprosto elementárním faktorem čistota všech povrchů zařízení a pomůcek, přicházejících do styku s produktem. Je kladen důraz na svědomité dodržování sanitačního řádu a zásad správné výrobní a hygienické praxe.

Deskový chladič včetně spílací cesty je před každou první várkou v týdnu vždy vysvitován horkým roztokem hydroxidu sodného, mezi jednotlivými várkami je pak spílací cesta alespoň vysterilována horkou vodou (viz Sanitační řád) a před samotným spíláním je propláchnuta studenou vodou. Mladina se čerpá potrubím zaplaveným vodou, protláčka z trubek se odpouští na kanál „těčkem“ včetně cca prvních 10ti litrů mladiny, která se cestou smíchala s vodou.

Cca 30 minut od vyčerpání várky na vířivou káď se mladina čerpá do kvasného tanku za současného průtokového zchlazování na zákvasnou teplotu a provzdušňována vzdušnicí svíčnou. Kvasný tank je vysterilován dle sanitačního řádu. Před posledním proplachem se sterilníma rukavicemi nasadí těsnící guma dvířek tanku a po posledním proplachu je sterilníma rukavicemi vložena panenka do výpustě kvasného tanku, důraz je kladen na to, aby panenka nebyla ve výpusti volně uložena, aby nedošlo k vyražení z výpustě během plnění tanku.

Správná zákvasná teplota je nezbytným faktorem pro správnou funkci kvasnic a nastartování správných kvasných pochodů, a proto je kontrolována během celého procesu spílání, a to jak za deskovým chladičem v potrubí, tak i v kvasném tanku. Od této chvíle začíná být zamezení mikrobiální kontaminace tím nejdůležitějším faktorem podílejícím se na kvalitě finálního produktu. Z tohoto důvodu je třeba důsledně dodržovat sanitační řád, veškeré pracovní úkony provádět ve sterilních rukavicích a veškeré pracovní pomůcky důkladně sterilovat roztokem persterilu (viz Sanitační řád).

V průběhu spílání se mladina zakvašuje kulturou pivovarských kvasinek. Voda z kvasnic je z kvasného vajíčka slita a zakvašuje se hustými kvasnicemi. Kvasnice během spílání se rozmíchají se zchlazenou mladinou přetahováním z jednoho kýble do druhého. Dávkuje se 0,5l hustých kvasnic (konzistence 100%) na 1 hl mladiny. Všechny kroky postupu jsou prováděny tak, aby nedošlo k jakékoliv kontaminaci. Pokud to harmonogram várek umožňuje, používají se kvasnice sebrané z kvasné kádě po hlavním kvašení opakovaně. Maximální počet „otočení“ je 4x.`
  },
  {
    id: 'sec-4-2',
    num: '4.2',
    cat: 'kvaseni',
    title: '4.2. Kvašení piva & Sběr kvasnic',
    icon: Dna,
    content: `Do 24 hodin od zakvašení se začíná tvořit CO2. Maximální teplota kvašení je hlídána teplotním čidlem. Termostat pak ovládá otevírání elektroventilu přívodu chladící kapaliny do duplikátoru chlazení kvasného tanku a tím je udržována teplota kvašení. Spodně kvašená piva mají maximální teplotu kvašení 12°C a svrchně kvašená piva 21°C, pokud není specifikováno jinak.

Průběh kvašení se kontroluje. Probíhá kontrola teploty kvašení a úbytku extraktu sacharometrem, případně hradícího protitlaku. Hradící protitlak je ideální nechat vystoupat z nuly na 1,1 bar ve chvíli, kdy je zdánlivý stupeň prokvašení cca 50%. Hradící protitlak by po zahrazení neměl klesnout pod 1,0 bar, minimální hodnota je pak 0,8 bar. Zároveň však nesmí hodnota protitlaku dosáhnout více než 1,4 bar.

Délka hlavního kvašení se odvíjí od typu vyráběného piva a použitých kvasnic. Pohybuje se od 4 do 10ti dní. Záznam kvašení je veden v kvasném listu, který je součástí varnního listu, ve které je označeno číslo várky, které se vyznačí i na daný kvasný tank.

Po hlavním kvašení, kdy je mladina prokvašená na mladé pivo, je šarže piva přetlačována do ležáckého tanku. Ležácký tank, včetně všech hadic a průzorů je vysanitován dle sanitačního řádu. Před posledním oplachem čistou vodou se sterilními rukavicemi nasadí těsnící guma dvířek tanku a po posledním proplachu čistou vodou se do vnitřní výpustě tanku vloží panenka tak, aby nebyla uložena volně aby se neuvolnila prouděním piva. Následně se mladé pivo z kádě přetlačí do ležáckého tanku. Před samotným přetlačováním jsou z výpustě odstřeleny kvasnice (cca 5l, než je pěna světlá). Přetlačování probíhá do protitlaku 0,8 bar na ležáckém tanku. V průběhu přetlačování se udržuje tlak na kvasném tanku cca 1,2 bar, nebo minimálně o 0,3 bar vyšší, než byl na konci hlavního kvašení. V případě studeného chmelení se do ležáckého tanku nadávkuje příslušné množství chmelových produktů (převážně jsou používány pelety).

Do doby, než se rozdíly tlaků na kvasném a ležáckém tanku ustálí tak, že lze klapku na ležáckém tanku (LT) otevřít na plno a proudění nebylo příliš prudké, je stavoznak na LT zavřený, po otevření klapky na LT na plno se teprve otevírá stavoznak a důsledně se hlídá konec přetlačování, aby nedošlo k probublání mladého piva na LT. Po odpojení hadic jsou všechny hadice propláchnuty a zbytky piva z klapky tanku a z podlahy jsou důkladně spláchnuty. Pokud se kvasnice nesbírají, jsou spolu s proplachem tanku spláchnuty do odpadu. Tank se po propláchnutí (pozor také na vzorkovací kohout, těsnící gumu dvířek a hradící aparát!!!) čistou vodou vysanituje dle sanitačního řádu.

Pokud se sbírají kvasnice pro opětovné použití je tato operace prováděna s maximální obezřetností, na zamezení jakékoliv kontaminace sbíraných kvasnic. Pracovní pomůcky (sítko, kýbl) a nádoba pro uchovávání (kvasné vajíčko, barel) musí být vysterilovány dle sanitačního řádu. Veškeré pracovní úkony jsou prováděny ve sterilních rukavicích, aby nedošlo ke kontaminaci várečných kvasnic z rukou. Po otevření dvířek tanku se vyjme panenka z výpustě – POZOR, v tanku je po hlavním kvašení vysoká koncentrace CO2 – panenku je potřeba vytáhnout se zadrženým dechem. Při tomto úkonu je vždy přivolaná druhá osoba, která hlídá, aby nedošlo k případnému udušení. Při sběru kvasnic je i vzduch prosycen oxidem uhličitým, a proto je nutné při sběru kvasnic nechat pootevřené dveře z prostoru kvasných tanků.

Kvasnice se sbírají z výpustě kvasného tanku do nerezového kýble vystříkáváním čistou vodou a přelitím do druhého nerezového kýble přes sítko se vyčistí od hrubých nečistot. Promyté kvasnice jsou pak přelity do kvasného vajíčka a po sebrání dostatečného množství se doplní čistou vodou, čímž se promyjí. Pokud je potřeba kvasnice nasadit dříve než za 24 hodin po sebrání, tak se již vodou nedoplňují, aby nedocházelo k dalšímu snižování konzistence kvasnic nasazovaných při zakvašování. Po sebrání kvasnic se tank propláchne a vysanituje dle sanitačního řádu.`
  },
  {
    id: 'sec-4-3',
    num: '4.3',
    cat: 'kvaseni',
    title: '4.3. Dokvašování',
    icon: Thermometer,
    content: `V průběhu zrání piva se kontroluje teplota a tlak. Teplota zrání je od +4°C do +2°C. Hradícím ventilem je udržován přetlak během ležení piva na hodnotě 0,8 bar přetlak by neměl klesnout pod 0,7 baru.

Po dané době zrání v závislosti na typu piva je pivo hotové a připravené ke stáčení do KEG sudů. Narážecí klapka (výpust tanku, případně i vzorkovací ventil) je udržován v perfektně čistém stavu, a to nejen jeho vnitřní část, ale také jeho vnější části, hlavně pak i spodní části.

Tlak na tancích a teplota v ležáckém sklepu se pravidelně kontroluje. Teplota by neměla přesáhnout 4°C a hradící tlaky by neměly být pod 0,8 bar. Pokud je nalezena neshoda, je uvědomena odpovědná osoba a o nápravném opatření je proveden zápis.

V prostorách ležáckého sklepa je udržována čistota všech povrchů a podlah dle sanitačního řádu.`
  },
  {
    id: 'sec-2-4',
    num: '2.4',
    cat: 'staceni',
    title: '2.4. Příjem a uskladnění prázdných KEG sudů',
    icon: IkonaSud,
    content: `Prázdné sudy jsou po vyložení/vrácení odváženy k myčce sudů. Vadné sudy se pak před jejich opravou skladují odděleně, aby nedošlo k jejich používání při výrobě, než dojde k jejich opravě.

Sudy, které jsou před mytím skladovány déle jak 8 týdnů, nebo je známo, že byly po delší čas nepoužívány, se řádně označí, aby byly umyty dvojitým průchodem mycích cyklů.`
  },
  {
    id: 'sec-7-1',
    num: '7.1',
    cat: 'staceni',
    title: '7.1. Mytí KEG sudů & Obsluha myčky sudů',
    icon: SprayCan,
    content: `Před mytím vnitřních částí povrchů na automatické myčce se myjí vnější povrchy sudů. Vnitřní části KEG sudů se myjí na rotační automatické myčce, kde probíhá mytí a sterilace v několika krocích. V prvních třech krocích jsou nejdříve sudy po proplachu vodou umyty dvěma kroky alkalického mytí s časovou prodlevou v jednom kroku mezi kroky alkalického mytí. Následuje další krok, ve kterém je sud opláchnut horkou vodou. Posledním krokem je sterilace párou. Detailněji je postup mytí KEG sudů popsán v sanitačním řádu.

Kontrola umytých sudů je prováděna na výstupu z myčky. Kontroluje se teplota – sud musí být horký a také jestli je sud prázdný – neobsahuje zbytky kapaliny. Pokud je sud studený, zkontroluje se funkčnost fittingu a pokud fitting nejeví známky poškození, nechá se sud projet dalším mycím cyklem. Pokud sud obsahuje zbytky kapaliny zkoumá se při vypouštění přebytku ze sudu, zda-li je alkalické povahy, či nikoliv. Pokud má kapalina neutrální reakci (pH) sud se po vyprázdnění může použít pro stáčení, pokud má kapalina v sudu alkalickou reakci, nechá se sud projet ještě jedním mycím cyklem znovu.

--- Pokyny pro obsluhu myčky KEG sudů ---
Veškeré pracovní úkony u myčky probíhají dle zásad bezpečnosti a ochrany zdraví při práci. Mimo opaření a poleptání horkými chemikáliemi hrozí mimo jiné i vážný úraz z mechanicky pohybujících se částí mycí linky. Jedná se převážně o řetězy a ozubená kola válečků dopravníku sudů ale i podavač sudů a celý rotomatik. Do pohyblivých částí se za provozu v žádném případě nezasahuje rukama nebo jinými částmi těla. Před údržbovými pracemi se obsluha vždy musí ujistit, že je stroj vypnutý alespoň do ručního režimu.

Po najetí páry (u nádrže na hydroxid) se nechají nádrže ohřát alespoň na 60°C. Zkontroluje se funkce čidel a před najetím sudů se nechá rotomatik několikrát protočit a zkontroluje se přesné dosedání po přetočení. V případě, že dosedání není ideální je potřeba „poštělovat“ zajížděcí aretační kolík dole, případně i nahoře rotomatiku. Před najetím sudů se ještě odpustí kondenzát z parního potrubí (kohout na filtru páry u rozvodů). Ventily přívodu páry na zásobních nádržích se musí správně nastavit, aby nedocházelo k přehřívání nad 80°C, což by vedlo k příliš velké produkci páry do prostoru mycí linky a hrozilo by poškození elektrických rozvodů. Po celou dobu mytí sudů je potřeba pravidelně kontrolovat teplotu v zásobních nádržích a případně upravovat přívod páry.

Sudy jsou nejprve omyty z venkovní části kartáčem alkalickým roztokem chlornanu sodného se saponátem a řádně opláchnuty. Myčka funguje v režimu polovičního výkonu a sudy se dávají na pás tak, aby na rotomatiku byla vždy mezi každým sudem mezera jednoho místa. V průběhu mytí se kontroluje funkce všech ventilů v jednotlivých krocích, případně na kontrolkách, jestli byl na daném stanovišti rotomatiku přijmut sud mycím programem. Vzduchový ventil pro vyfukování sudů je potřeba přiškrtit tak akorát, aby došlo k dostatečnému vyfouknutí sudů v každém z kroků, ale zároveň aby nedocházelo ke zbytečným únikům tlakového vzduchu. Po skončení mytí je provedena kontrola uzavření všech ventilů a vypnutí systému.`
  },
  {
    id: 'sec-4-4',
    num: '4.4',
    cat: 'staceni',
    title: '4.4. Stáčení do KEG sudů',
    icon: IkonaSud,
    content: `Před naražením tanku se stáčecí kohout vysteriluje roztokem persterilu. Čistota stáčecího aparátu se udržuje dle sanitačního řádu (sterilace před stáčením, sterilace na konci týdne).

Při prvním naražení tanku se vždy odstřelí prvních cca 10 litrů piva s kvasnicemi. Do umytého sudu (viz výše a sanitační řád) a předfouknutého sterilním vzduchem, se mírným rozdílem tlaků (např. v sudu 0,8, na tanku 1,0) přetláčí pivo z tanku. Rozdíl tlaků nesmí být příliš velký, jelikož by rychlým prouděním piva docházelo k přílišnému pěnění piva a k větším výtratám v odcházející pěně. Zároveň tlak v sudu NESMÍ být vyšší než je tlak na tanku, jelikož by došlo k obrácení proudění a potenciální kontaminaci celé šarže v ležáckém tanku!!!

Sud je plný, když z bočního ventilu stáčecího aparátu začne vytékat pivo – pozor, nejdříve „prská“ pěna s bublinami, po odpuštění pěny je proud z boční výpusti ze sudu plynulý. Po ukončení stáčení a mezi jednotlivými přerážení tanků je vždy stáčecí aparát propláchnut vodou. Fitink spolu s celým sudem se důkladně ostříká vodou a na fitink se nasadí víčko.

Většina sudů se stáčí dle objednávek jeden až dva dny předem. Některé se stáčí „do foroty“, ty jsou do jejich upotřebení uskladněny v prostorách pivovaru.`
  },
  {
    id: 'sec-2-5',
    num: '2.5',
    cat: 'staceni',
    title: '2.5. Příjem a uskladnění prázdných lahví',
    icon: IkonaLahev,
    content: `Lahve se nakupují nové a jsou dodavatelem zaváženy na paletách do provozovny pivovaru. Při přejímce je mimo průvodní dokumentace kontrolován stav dodávky, zejména neporušenost obalů.

Lahve jsou uskladněny na původních paletách tak, aby nedocházelo k jejich kontaminaci z prostředí. V prostorách skladu je prováděna deratizace a sleduje se výskyt škůdců. V měsíčních intervalech se sleduje stav zásob prázdných lahví. Stejně tak i víčka lahve jsou skladována tak, aby nedocházelo k jejich kontaminaci.`
  },
  {
    id: 'sec-7-2',
    num: '7.2',
    cat: 'staceni',
    title: '7.2. Kontrola lahví',
    icon: Search,
    content: `Vizuálně se kontroluje čistota a neporušenost lahví. Tento krok je ve výrobním diagramu v příručce HACCP součástí kroku 5.1. Stáčení do lahví.`
  },
  {
    id: 'sec-5-1',
    num: '5.1',
    cat: 'staceni',
    title: '5.1. Stáčení do lahví',
    icon: IkonaLahev,
    content: `Stáčení piva do lahví se provádí na stáčecím aparátu, do kterého je po vysanitování a proplachu (viz Sanitační řád) přetlačeno pivo z KEG sudu.

Lahev se po nasazení na stáčecí aparát natlakuje na stejný tlak jako je v sudu (maximum 2 bary!). Otevře se přívod piva a pozvolným odpouštěním tlaku z lahve se nechá pivo přetlačit ze sudu do lahve, dbá se na to, aby rychlost proudění byla taková, aby nedocházelo k přepěňování piva a velkým ztrátám. Po naplnění lahve se nejdříve zavře ventil pro odpouštění tlaku, tím se proudění piva zastaví a teprve potom se zavírá přívod piva do aparátu. Tlak z lahve se pak pozvolna odpouští až je v lahvi nulový přetlak. Po vyjmutí plné lahve je lahev IHNED uzavřena víčkem.

Po naplnění lahve dle předepsaného pracovního postupu je lahev označena etiketou. Před označením jednotlivých lahví etiketami jsou neolepené lahve důsledně označovány o jakou šarži a druh piva se jedná, jelikož PŘI STÁČENÍ VÍCE DRUHŮ PIVA LEHCE DOJDE K ZÁMĚNĚ!!! Při olepování lahví etiketami musí být zřetelně jasné o jaké pivo se jedná, pokud vznikne jakákoliv pochyba ve smyslu jistoty toho o jaké pivo se jedná, je pak šarže stáčení vyhodnocena degustačním posouzením odpovědnou osobou. V nejbližší možné době následuje přesun piva do skladu.`
  },
  {
    id: 'sec-8-1',
    num: '8.1',
    cat: 'expedice',
    title: '8.1. Uskladnění stočeného piva',
    icon: Warehouse,
    content: `Stočené pivo v lahvích a v sudech je uskladněno v chladných prostorách pivovaru. Teplota i v letních měsících zde nepřevyšuje 12°C a je pravidelně kontrolována.`
  },
  {
    id: 'sec-9-1',
    num: '9.1',
    cat: 'expedice',
    title: '9.1. Výdej stočeného piva',
    icon: Package,
    content: `Při odebírání sudů ze skladu je třeba dbát na to aby byla šarže řádně označena datem minimální trvanlivosti. Sledovatelnost lahví je zajištěna skrze datum trvanlivosti.`
  },
  {
    id: 'sec-10-1',
    num: '10.1',
    cat: 'expedice',
    title: '10.1. Přeprava k zákazníkovi',
    icon: Truck,
    content: `Během přepravy a předání piva zákazníkovi probíhá mimo kontroly průvodní dokumentace i kontrola správnosti označení výrobní šarže (DMT).

Pro veškeré množství převáženého piva musí být v převozní dokumentaci vyčíslena odvedená spotřební daň z piva.`
  },
  {
    id: 'sec-C',
    num: 'C',
    cat: 'pravidla',
    title: 'C. Obecná pravidla SVHP — Hygiena, Sledovatelnost & Trvanlivost',
    icon: Shield,
    content: `--- Provozní hygiena ---
Pro správnou výrobní a hygienickou praxi je také nutné zajistit, aby výrobní prostory splňovaly požadavky na nároky potravinářského provozu a to jak konstrukční ale hlavně pak i nároky na čistotu provozu. V prvé řadě se jedná o prostory ležáckého sklepa, ve kterém probíhá kvašení v otevřených nádobách a uskladnění kvasnic v otevřených nádobách. Pivo se stáčí v ležáckém sklepě nefiltrované a nepasterované je tedy naprosto nezbytné aby pivo obsahovalo pouze kulturní kvasinky.

Stejně tak důležitý je i konstrukční stav zařízení a provozu. Při stavebních poškozeních vznikají nesanitovatelná místa, která pak mohou být zdrojem potenciální kontaminace. Stav provozu je proto pravidelně kontrolován. Každý týden je kontrolován hygienický stav ležáckého sklepa. Jednou za čtvrt roku je prováděn provozní audit celého provozu odpovědnou osobou, kdy se posuzuje konstrukční stav a úroveň čistoty provozu. Kontroluje se i stav technologických zařízení a jejich funkčnost. Z každého auditu je proveden zápis, výstupem je pak akční plán pro nápravu nalezených nedostatků.

--- Osobní hygiena ---
Zaměstnanci dbají na osobní hygienu, aby nedocházelo k zanášení kontaminace do výrobních prostor prostřednictvím personálu. Zejména se jedná o používání čistého pracovního oděvu, v závislosti na rizikovosti pracovní pozice (mytí sudů – výměna max po týdnu, u rizikových operací vždy čistý oděv na další den). Mytí rukou mýdlem a teplou vodou, a to zejména po použití WC, ale taktéž při každém znečištění rukou (výhoz mláta apod.). Během rizikových operací, jako je sbírání kvasné pěny (deky) z mladého piva a veškerá práce s kvasnicemi (sbírání z kádě, zakvašování) jsou vždy používány sterilní rukavice a čistý pracovní oděv.

--- Sledovatelnost ---
Suroviny jako slad a chmel jsou nakupovány bezprostředně před danou várkou, není tedy problém dohledat, jaká dodávka sladu šla do jaké várky. Pro každou výrobní šarži je evidován samostatný varní list. Varní list obsahuje mimo použitých surovin a zápisu varného postupu také záznam o kvašení na kvasném tanku, dokvašování na ležáckém tanku a stáčení hotového piva do KEG sudů. Číslo šarže (datum DMT) je pak psáno na každé víčko sudu s pivem, který opouští sklep. U lahvového piva je taktéž datum DMT označením výrobní šarže. Je tedy možné vždy říci z jakých surovin jaký zákazník dostal dané pivo a také jak výroba daného piva probíhala.

--- Trvanlivost ---
Trvanlivost stočeného piva je stanovena na 90 dní od data stáčení. Datum DMT je zároveň označení šarže pro zajištění sledovatelnosti. Podmínkou garance výše zmíněných dob trvanlivostí je, že u zákazníka pivo bude skladováno v temnu za teploty 2–8°C. Stočené pivo není skladováno na pivovaru v prostorách sklepů déle než 30 dní od stočení. V těchto skladovacích prostorách nemá teplota v letních měsících přesáhnout 12°C. Správnost nastavení DMT je kontrolována deponací namátkových vzorků piva, která jsou pravidelně kontrolována degustačně a jednou za rok se nechá udělat i mikrobiologický rozbor.

--- Školení SVHP ---
Pro zajištění aplikace správné výrobní a hygienické praxe při výrobě piva jsou prováděna pravidelná školení. U nových zaměstnanců vždy v termínu nástupu. Stálí zaměstnanci jsou proškolováni 1x ročně, nebo v případě změny ve výrobní praxi. Ze školení je veden záznam, který je archivován spolu s touto příručkou.`
  }
];

export default function HaccpScreen({ initialSection, initialTab = 'sanitacni_rad', setPage, initialSubTab }: HaccpScreenProps) {
  const [activeTab, setActiveTab] = useState<'sanitacni_rad' | 'svhp' | 'udrzba' | 'diagram' | 'bozp_prvni_pomoc' | 'troubleshooting' | 'staceci_linka'>((initialSubTab as any) || initialTab);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActiveTab((initialSubTab as any) || initialTab);
  }, [initialSubTab, initialTab]);

  function selectTab(t: 'sanitacni_rad' | 'svhp' | 'udrzba' | 'diagram' | 'bozp_prvni_pomoc' | 'troubleshooting' | 'staceci_linka') {
    if (setPage) setPage('haccp', undefined, t);
    else setActiveTab(t);
  }

  // Kalkulačka sanitační koncentrace M = (P * V) / C
  const [calcP, setCalcP] = useState<string>('1.5');
  const [calcV, setCalcV] = useState<string>('500');
  const [calcC, setCalcC] = useState<string>('100');

  const calcM = (() => {
    const p = parseFloat(calcP);
    const v = parseFloat(calcV);
    const c = parseFloat(calcC);
    if (!isNaN(p) && !isNaN(v) && !isNaN(c) && c > 0) {
      return ((p * v) / c).toFixed(2);
    }
    return null;
  })();

  useEffect(() => {
    if (initialSection) {
      setActiveTab('svhp');
      setTimeout(() => {
        const element = document.getElementById(initialSection);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [initialSection]);

  const categories: { id: CategoryKey; label: string; icon: typeof BookOpen }[] = [
    { id: 'all', label: 'Všechny kapitoly', icon: BookOpen },
    { id: 'uvod', label: 'Úvod & Cíl SVHP', icon: ScrollText },
    { id: 'suroviny', label: '1. Suroviny & Voda', icon: Wheat },
    { id: 'uskladneni', label: '2. Uskladnění surovin', icon: Factory },
    { id: 'varna', label: '3. Varna & Mláto', icon: Cog },
    { id: 'kvaseni', label: '4. Kvašení & Spílání', icon: Snowflake },
    { id: 'staceni', label: '5. Stáčení & Myčka', icon: Cylinder },
    { id: 'expedice', label: '6. Expedice & Sklad', icon: Truck },
    { id: 'pravidla', label: 'Pravidla SVHP & Hygiena', icon: Shield },
  ];

  const filteredDocs = HACCP_DOCUMENTS.filter((doc) => {
    if (activeCategory !== 'all' && doc.cat !== activeCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return doc.title.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q) || doc.num.toLowerCase().includes(q);
    }
    return true;
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
              <h2 className="font-display font-black text-lg text-neutral-900 tracking-tight">Sanitační řád & Příručka SVHP / HACCP</h2>
              <p className="text-xs text-neutral-600 font-bold">Kynšperský pivovar s.r.o. — Sokolovská 482/40, Kynšperk nad Ohří</p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded bg-neutral-900 text-amber-300 font-mono font-black text-xs shadow-2xs">
            Ing. Petr Bednář (od 1. 3. 2024)
          </span>
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
            <span>Sanitační řád Pivovaru Zajíc</span>
          </button>

          <button
            onClick={() => selectTab('svhp')}
            className={`px-4 py-2.5 rounded text-xs font-black transition flex items-center gap-2 shrink-0 ${
              activeTab === 'svhp'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <FileText size={16} />
            <span>Příručka SVHP / HACCP (1.1–10.1)</span>
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
            onClick={() => selectTab('diagram')}
            className={`px-4 py-2.5 rounded text-xs font-black transition flex items-center gap-2 shrink-0 ${
              activeTab === 'diagram'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Sparkles size={16} />
            <span>Schéma (Diagram)</span>
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

      {/* TAB 1: SANITAČNÍ ŘÁD (Oficiální dokumentace Ing. Petr Bednář) */}
      {activeTab === 'sanitacni_rad' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-neutral-200/90 rounded shadow-xs space-y-6">
            <div className="border-b border-neutral-100 pb-4 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl sm:text-2xl font-display font-black text-neutral-900 flex items-center gap-2">
                  <Droplets className="text-amber-600" size={26} />
                  <span>Sanitační řád — Kynšperský pivovar s.r.o.</span>
                </h1>
                <span className="px-3 py-1 rounded bg-amber-100 text-amber-950 font-mono font-black text-xs border border-amber-300">
                  Platnost od 1. března 2024
                </span>
              </div>
              <p className="text-xs text-neutral-600 font-bold">
                Sokolovská 482/40, Kynšperk nad Ohří, 357 51 · Příručku vytvořil: <strong>Ing. Petr Bednář</strong>
              </p>
            </div>

            {/* BOZP a Chemikálie */}
            <div className="p-5 rounded bg-rose-50/80 border-2 border-rose-200 space-y-3">
              <h3 className="font-black text-rose-950 text-base flex items-center gap-2">
                <AlertTriangle size={20} className="text-rose-600" />
                <span>Bezpečnost práce (BOZP) & Používané chemikálie</span>
              </h3>
              <p className="text-xs text-neutral-800 font-medium leading-relaxed">
                Sanitační řád je nastaven v souladu s pravidly pro BOZP. Pro práci s chemikáliemi jsou používány ochranné pracovní pomůcky – <strong>gumové rukavice, ochranné brýle, práce je prováděna v odpovídající pracovní obuvi</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                <div className="p-3 rounded bg-white border border-rose-200 text-xs">
                  <strong className="block text-rose-900 font-black mb-1"><SprayCan className="ikona-text" /> Alkalická sanitace</strong>
                  <span className="text-neutral-700">Hydroxid sodný (NaOH) a chlornan sodný. Odstraňuje organické úsady a kvasnice.</span>
                </div>
                <div className="p-3 rounded bg-white border border-rose-200 text-xs">
                  <strong className="block text-rose-900 font-black mb-1"><FlaskConical className="ikona-text" /> Kyselá sanitace</strong>
                  <span className="text-neutral-700">Kyselina dusičná a fosforečná. Odstraňuje anorganické usazeniny a pivní kámen.</span>
                </div>
                <div className="p-3 rounded bg-white border border-rose-200 text-xs">
                  <strong className="block text-rose-900 font-black mb-1"><Sparkles className="ikona-text" /> Finální sterilace</strong>
                  <span className="text-neutral-700">Kyselina peroxyoctová (Persteril) pro stáčecí aparáty, kvasnice a sudy.</span>
                </div>
                <div className="p-3 rounded bg-white border border-rose-200 text-xs">
                  <strong className="block text-rose-900 font-black mb-1"><Brush className="ikona-text" /> Sanitace podlah</strong>
                  <span className="text-neutral-700">Chlorové vápno (chlornan vápenatý) pro hrubou sterilaci podlah.</span>
                </div>
              </div>
            </div>

            {/* Výpočet hrubé koncentrace */}
            <div className="p-5 rounded bg-neutral-900 text-white space-y-4 shadow-md">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-display font-black text-base text-amber-400 flex items-center gap-2">
                  <Calculator size={20} />
                  <span>Výpočet „hrubé“ koncentrace sanitačního roztoku</span>
                </h3>
                <span className="text-xs font-mono font-bold bg-neutral-800 px-3 py-1 rounded text-amber-300 border border-neutral-700">
                  M = (P × V) / C
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="block text-neutral-400 font-bold">P — Požadované %</span>
                  <span className="text-neutral-200">Koncentrace (cca % hm.)</span>
                  <input className="input !py-1.5 text-xs font-mono font-bold text-neutral-900 bg-white mt-1" value={calcP} onChange={(e) => setCalcP(e.target.value)} placeholder="1.5" />
                </div>
                <div>
                  <span className="block text-neutral-400 font-bold">V — Objem vody (litry)</span>
                  <span className="text-neutral-200">Přesný objem lázně v l</span>
                  <input className="input !py-1.5 text-xs font-mono font-bold text-neutral-900 bg-white mt-1" value={calcV} onChange={(e) => setCalcV(e.target.value)} placeholder="500" />
                </div>
                <div>
                  <span className="block text-neutral-400 font-bold">C — Koncentrace látky (%)</span>
                  <span className="text-neutral-200">Čistá látka = 100%</span>
                  <input className="input !py-1.5 text-xs font-mono font-bold text-neutral-900 bg-white mt-1" value={calcC} onChange={(e) => setCalcC(e.target.value)} placeholder="100" />
                </div>
                <div className="p-3 rounded bg-amber-500 text-neutral-950 font-mono flex flex-col justify-center">
                  <span className="text-[11px] uppercase font-black tracking-wider text-amber-950">M — Hmotnost chemikálie</span>
                  <span className="font-display font-black text-2xl">{calcM ? `${calcM} kg` : '—'}</span>
                </div>
              </div>
            </div>

            {/* Hlavní obecné zásady */}
            <div className="p-5 rounded bg-amber-50/60 border border-amber-200/90 space-y-3">
              <h3 className="font-display font-black text-base text-amber-950 flex items-center gap-2">
                <CheckCircle2 size={20} className="text-amber-600" />
                <span>Hlavní obecné zásady pro správné provedení sanitace</span>
              </h3>
              <ul className="text-xs text-neutral-800 font-medium space-y-2 list-disc pl-5">
                <li><strong>Okamžitý proplach po alkalické sanitaci:</strong> Zařízení po alkalické sanitaci je potřeba IHNED propláchnout čistou vodou, jinak hrozí tvorba anorganických usazenin!</li>
                <li><strong>Důkladné spláchnutí nečistot před sanitací:</strong> Před sanitací výrobního zařízení je třeba vždy řádně vypláchnout co možná všechny zbytky piva, kvasnic apod. Proplach a oplachy čistou vodou jsou nezbytným předpokladem funkční sanitace.</li>
                <li><strong>Volba parametrů sanitace:</strong> Vyšší teplotu může nahradit vyšší koncentrace a delší doba sanitace a naopak. Organické usazeniny → alkalická sanitace (+ oxidační činidlo). Anorganické usazeniny → kyselá sanitace.</li>
                <li><strong>Rozlišení kartáčů:</strong> Používáme vizuálně odlišitelné druhy kartáčů pro čištění povrchů v kontaktu s pivem (vysoká sterilita) a jiné pro znečištěnější části provozu (podlahy apod.).</li>
              </ul>
            </div>

            {/* Detailní předpisy pro technologii */}
            <div className="space-y-4 pt-2">
              <h3 className="font-display font-black text-lg text-neutral-900 border-b border-neutral-200 pb-2">
                <ClipboardList className="ikona-text" /> Postupy sanitace jednotlivých úseků technologií
              </h3>

              {/* Varna */}
              <div className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h4 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span><Settings className="ikona-text" /> Sanitace Varny (Varní kotel, Scezovací káď, RMP, Vířivka)</span>
                  </h4>
                  <span className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 font-mono font-bold text-xs">Po každém týdnu várek</span>
                </div>
                <div className="text-xs text-neutral-700 font-medium leading-relaxed space-y-2.5">
                  <p>Po každém týdnu (pokud se vaří) se provádí alkalická sanitace varného zařízení. Před sanitací se zkontroluje uzavření šoupěte z dopravníku sladového šrotu.</p>
                  <div className="p-3 rounded bg-neutral-50 border border-neutral-200 space-y-1.5">
                    <strong className="text-neutral-900">1. Varní kotel:</strong>
                    <p>Napustí se 5 hl vody, rozmíchá se hydroxid sodný na koncentraci 1,5% a přidají se 2 dcl chlornanu (dle znečištění, max 0,5 l/5 hl). Cirkuluje se hlavním čerpadlem skrze sanitační sprchy při teplotě <strong>80 °C</strong>. Během cirkulace se napustí celý systém trubek a sanitace se nechá procházet potrubím do vystěradla (3x po dobu 2 minut). Po 15–20 minutách se přečerpá do scezovací kádě.</p>
                  </div>
                  <div className="p-3 rounded bg-neutral-50 border border-neutral-200 space-y-1.5">
                    <strong className="text-neutral-900">2. Scezovací káď:</strong>
                    <p>Cirkulace 15 minut skrze sanitační sprchy (<strong>POZOR: Nepouštět sanitaci do sprch pro vyslazování!</strong> Hrozilo by zacpání). Ke konci se pustí kopačka na nízké otáčky (3-4 na fm) pro sanitaci sít. Poté se sanitace pustí trubkami spodem do scezovacího věnce a na půl se otevře cesta do trysek pod síta (5 min). Přečerpá se scezovacím čerpadlem do rmutomladinové pánve (RMP).</p>
                  </div>
                  <div className="p-3 rounded bg-neutral-50 border border-neutral-200 space-y-1.5">
                    <strong className="text-neutral-900">3. RMP & Vířivá káď:</strong>
                    <p>Ve RMP se sanitace přihřeje na <strong>85 °C</strong> a vyčerpá se do vířivé kádě. Do VK se nechá odtéct i veškerá sanitace z trubek.</p>
                  </div>
                  <div className="p-3 rounded bg-amber-50 border border-amber-200 space-y-1.5">
                    <strong className="text-amber-950">4. Proplach a kontrola:</strong>
                    <p>Celá varna se ihned propláchne horkou vodou z bojleru. Postupným zavíráním klapek se propláchne RMP, trubky do SK, sprcha SK (3 min), věnec a trysky pod síty (1 min), scezovací cesta do RMP (3 min), podrážení (2 min) a vystěradlo. <strong>Poslední odkapová voda se kontroluje hmatem na přítomnost reziduí hydroxidu a chlornanu – voda musí být čistá a bez zápachu!</strong></p>
                  </div>
                  <p className="italic text-neutral-500">1x za 4 až 6 týdnů se RMP po alkalické sanitaci vysanituje kyselinou dusičnou ručně kartáčem od anorganických usazenin.</p>
                </div>
              </div>

              {/* Vířivá káď a Spílací cesta */}
              <div className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h4 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span><Snowflake className="ikona-text" /> Sanitace Vířivé kádě & Spílací cesty</span>
                  </h4>
                  <span className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 font-mono font-bold text-xs">Před a mezi várkami</span>
                </div>
                <div className="text-xs text-neutral-700 font-medium leading-relaxed space-y-2">
                  <p><strong>Alkalická sanitace po varně:</strong> Propojí se spílací cesta (POZOR na propláchnutí chmelového filtru před deskovým chladičem!) do cirkulace zpět od kvasných tanků do sprchy vířivé kádě. Horký sanitační roztok se nechá cirkulovat 20 minut s pootevřeným vzduchem do vzdušnící svíčky.</p>
                  <p><strong>Sanitace horkou vodou mezi várkami:</strong> Horká voda (min 7 hl, nejméně 70°C) se vyčerpá z VK přes spílací potrubí. Teplota v potrubí musí dosáhnout <strong>min. 65 °C po dobu 15 minut</strong>. Před samotným spíláním se spílací cesta proplachuje studenou vodou 10 minut.</p>
                </div>
              </div>

              {/* Kvasné tanky a Kvasničné hospodářství */}
              <div className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h4 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span><FlaskConical className="ikona-text" /> Kvasné tanky & Kvasničné hospodářství</span>
                  </h4>
                  <span className="px-2.5 py-1 rounded bg-rose-100 text-rose-950 font-mono font-bold text-xs border border-rose-300"><AlertTriangle className="ikona-text" /> POZOR na CO2 a podtlak</span>
                </div>
                <div className="text-xs text-neutral-700 font-medium leading-relaxed space-y-2.5">
                  <p><strong>Před sespíláním:</strong> Sanitace 1% roztokem kyseliny dusičné skrze sprchu (15 min), následně 3x proplach vodou (3-4 min).</p>
                  <p><strong>Nádoby na kvasnice:</strong> Nerezové kýble se sterilují 0,1% Persterilem. Barely na rozkvas sušených kvasnic se sanitují 3% NaOH, 0,2% Persterilem a 3x oplachují pitnou vodou. Pomůcky pro sběr kvasnic se myjí 3% NaOH s kartáčem určeným pro čisté části a sterilují 0,1% Persterilem.</p>
                  <div className="p-3.5 rounded bg-rose-50 border border-rose-300 text-rose-950 space-y-1.5">
                    <strong className="block text-rose-900 font-black"><AlertTriangle className="ikona-text" /> DŮLEŽITÁ UPOZORNĚNÍ PRO KVASNÉ TANKY:</strong>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Kvasný tank během sanitace NEZAVÍRAT! Nemá podtlakový ventil – hrozí zborcení tanku!</strong></li>
                      <li>Po hlavním kvašení: 1,5% NaOH + 0,1 l chlornanu/1 hl. Po 10-15 min je roztok neutralizován CO2. Pokud zůstává deka, provede se 2. alkalická sanitace 1% NaOH (20 min).</li>
                      <li><strong>Ruční mytí kartáčem:</strong> Povrch tanku uvnitř pod lemem na dvířka je nutné umýt kartáčem se sanitačním roztokem ručně, sprcha tam nedostříkne!</li>
                      <li><strong>Při vyjmutí panenky z výpustě pozor na vysokou koncentraci CO2:</strong> Úkon provádět se zadrženým dechem a druhou přivolanou osobou!</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Ležácké tanky */}
              <div className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h4 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span><IkonaSud className="ikona-text" /> Ležácké tanky (LT)</span>
                  </h4>
                </div>
                <div className="text-xs text-neutral-700 font-medium leading-relaxed">
                  Po vyprázdnění se tank vystříká od piva a kvasnic. Sanitační režim je stejný jako u kvasných tanků (alkalické mytí NaOH + oplach), kyselou sanitaci kyselinou dusičnou lze provádět po dvou výrobních šaržích.
                </div>
              </div>

              {/* Stáčecí aparát pro KEG sudy */}
              <div className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h4 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <Plug className="ikona-text" /> <span>Stáčecí aparát pro KEG sudy</span>
                  </h4>
                </div>
                <div className="text-xs text-neutral-700 font-medium leading-relaxed space-y-2">
                  <p>Narážecí matice jsou trvale uloženy v 0,05% roztoku Persterilu. Každý den před stáčením se aparát vysteriluje 0,1% Persterilem (5 min) a propláchne vodou.</p>
                  <p><strong>1x měsíčně kompletní rozebírka:</strong> Stáčecí aparát včetně narážečů se rozebere do nejmenších komponentů a nechá odmáčet v 0,5% roztoku NaOH alespoň 24 hodin, vyčistí a znovu steriluje.</p>
                </div>
              </div>

              {/* Mytí a sanitace KEG sudů */}
              <div className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h4 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span><SprayCan className="ikona-text" /> Sanitace a mytí KEG sudů</span>
                  </h4>
                </div>
                <div className="text-xs text-neutral-700 font-medium leading-relaxed space-y-2">
                  <p><strong>Povrchy sudů:</strong> Ruční mytí kartáčem roztokem chlornanu sodného se saponátem a proplach čistou vodou.</p>
                  <p><strong>Vnitřní myčka sudů:</strong> 1. a 2. krok: Proplach vodou + 80°C horký 1,5% NaOH. 3. krok: Oplach horkou vodou 65°C. 4. krok: Sterilace párou. Sud musí z myčky vyjet horký, prázdný a bez zbytků luhu.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PŘÍRUČKA SVHP / HACCP */}
      {activeTab === 'svhp' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                className="input !pl-10 font-medium text-xs bg-white border-neutral-200"
                placeholder="Hledat v příručce SVHP / HACCP (např. sanitace, teplota, kvasnice, hradící tlak)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 ${
                    activeCategory === cat.id
                      ? 'bg-amber-500 text-neutral-950 shadow-xs'
                      : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <cat.icon size={14} />
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredDocs.length === 0 ? (
              <div className="card p-10 text-center text-xs font-bold text-neutral-500 bg-white">Žádné kapitoly neodpovídají zadanému filtru nebo hledání.</div>
            ) : (
              filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  id={doc.id}
                  className="card p-6 bg-white border border-neutral-200/90 rounded space-y-3 shadow-xs hover:shadow-md transition-all scroll-mt-20"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded bg-amber-100 text-amber-900 font-bold grid place-items-center text-base shrink-0 border border-amber-300">
                        <doc.icon size={18} />
                      </span>
                      <div>
                        <span className="text-[11px] font-mono font-black uppercase text-amber-600 tracking-wider">Bod {doc.num}</span>
                        <h3 className="font-display font-black text-base text-neutral-900 leading-tight">{doc.title}</h3>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-neutral-700 font-medium leading-relaxed whitespace-pre-line space-y-2">
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
                <span className="px-3 py-1.5 rounded bg-white/20 text-white text-xs font-mono font-black border border-white/30">
                  TIS: 224 919 293
                </span>
                <span className="px-3 py-1.5 rounded bg-rose-600 text-white text-xs font-mono font-black border border-rose-300">
                  ZZS: 155
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-[11px] text-rose-200 font-bold uppercase">Záchranka (ZZS)</div>
                <div className="text-2xl font-black text-white">155</div>
              </div>
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-[11px] text-rose-200 font-bold uppercase">Hasiči (HZS)</div>
                <div className="text-2xl font-black text-white">150</div>
              </div>
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-[11px] text-rose-200 font-bold uppercase">Toxikologie (TIS)</div>
                <div className="text-base font-black text-amber-300">224 919 293</div>
              </div>
              <div className="p-3 rounded bg-white/10 border border-white/20">
                <div className="text-[11px] text-rose-200 font-bold uppercase">Tísňové volání</div>
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
                  <span className="text-[11px] font-bold text-rose-600">NEJNEBEZPEČNĚJŠÍ ÚRAZ – RIZIKO TRVALÉHO OSLEPNUTÍ!</span>
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
                  <span className="text-[11px] font-bold text-amber-700">Kyselina dusičná / fosforečná / Hydroxid sodný</span>
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
                  <span className="text-[11px] font-bold text-sky-700">Kvasné tanky, Persteril a desinfekční výpary</span>
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
                  <span className="text-[11px] font-bold text-violet-700">Náhodné požití sanitačního roztoku</span>
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
            <div className="text-base font-black text-amber-400 p-3 rounded bg-black/50 border border-amber-500/40 text-center">
              „KYSELINU VŽDY LIJEME DO VODY! NIKDY VODU DO KYSELINY!“
            </div>
            <p className="text-neutral-400 text-xs">
              Při nalití vody do koncentrované kyseliny dochází k okamžité prudké exotermické reakci, voda vzkypí a horká kyselina vystříkne obsluze do obličeje a očí!
            </p>
          </div>
        </div>
      )}

      {/* TAB 6: ŘEŠENÍ PIVOVARSKÝCH CHYB & VAD PIVA */}
      {activeTab === 'troubleshooting' && <BrewingTroubleshootingDatabase />}

      {/* TAB 7: ÚDRŽBA STÁČECÍ LINKY */}
      {activeTab === 'staceci_linka' && <BottlingLineMaintenance />}
    </div>
  );
}
