// Verze aplikace â€” zvyĹˇuje se pĹ™i kaĹľdĂ© provedenĂ© ĂşpravÄ›, aby Ĺˇlo v UI poznat,
// jestli je naÄŤtenĂˇ nejnovÄ›jĹˇĂ­ nasazenĂˇ verze (Ĺ™eĹˇĂ­ problĂ©my s cachĂ­ prohlĂ­ĹľeÄŤe/PWA).
export const APP_VERSION = '1.806';
export const APP_VERSION_DATE = '23.8.2026 18:32';




// Stručný přehled změn v aktuální verzi (zobrazuje se v admin sekci Nastavení)

export const APP_CHANGELOG: string[] = [
  '🔐 Kompletní audit a opravy: přístup jen pro adminem schválené e-maily, povinná změna prvního hesla, bezpečnější oprávnění, offline synchronizace, tisk, AI funkce a transakční zápisy. v1.621',
  '🔐 Zabezpečení a spolehlivost: účet lze vytvořit jen pro schválený e-mail, klient už nemůže sám přidělit administrátorskou roli, opraveny duplicitní odpočty závozu a ztráta nových operací při offline synchronizaci. v1.620',
  '🍺 Objednávky: nové zadávání objednávek — dlaždice piv (klikni na pivo → obaly a množství), datum závozu (aktuální týden + den), souhrn objednávky dole pod dlaždicemi s úpravou, poznámka s automatickým doplněním data závozu (17.8. / pátek) a zaškrtávací pole 🚰 Půjčení výčepu s rezervačním systémem. v1.619',
  '🏪 Odběratelé: tlačítko 🔍 Načíst adresu pro automatické dohledání adresy a telefonu hospody z map/Google, nové pole pro telefon zákazníka a štítky ⚠️ Bez adresy. v1.618',
  '⚡ Objednávky: detekce duplicity v týdnu, 1-Click opakování poslední objednávky hospody. 📦 Sklad: červené zvýraznění záporného teoretického deficitu (nestihlo se zapsat stočení). 🚚 Závoz: 1-Click navigace (Mapy/Waze/Mapy.cz), WhatsApp avízo, prázdné sudy a podpis. v1.617',
  '🚚 Závoz & Řidič: 1-Click navigace (Google Mapy / Waze / Mapy.cz), WhatsApp odeslání avíza zákazníkovi, dotykový podpis na sklo při převzetí a evidence vrácených prázdných KEG sudů. 🏰 Sklep: Vizuální mapa tanků a CKT s hladinami a zráním. 🍻 Půjčovna výčepů: evidence kaucí, kontaktů a vrácení. 📦 Sklad: rychlé mobilní dotykové sčítadlo. 🎙️ Hlasové diktování ve stáčení lahví. v1.616',
  '👤 Nastavení: přidána možnost změny vlastního jména (používá se v zápisech, např. fašování, stáčení, sanitace). Verze aplikace se přesunula z horní lišty dolů do menu (vedle vašeho jména/stavu připojení) a horní lišta už neotevírá Nastavení — Nastavení zůstává jen v menu. v1.615',

  '🛢️ KEG (Potřeba stočit): kliknutím na kterýkoliv řádek tabulky potřeb (např. 12° Světlá 50l, chybí 3 ks) se přímo otevře Přehled objednávek s automatickým vyfiltrováním daného piva a sudu v aktuálním týdnu. v1.607',
  '🍺 Objednávky (Zadávání): na kartách jednotlivých piv se v odznaku nyní zobrazuje přesný obal i počet kusů (např. 50l 12, 30l 2, 1l 4) místo pouhého celkového součtu kusů. v1.606',
  '📦 Objednávky (Zadávání): pole přejmenováno na „Týden závozu (jiný týden)“ a s tlačítkem „Tento týden“ pro rychlý návrat na aktuální týden. v1.605',
  '📦 Objednávky (Zadávání): Datum závozu / dodání (jiný týden) je nyní primárně předvyplněno aktuálním datem, Den závozu je volitelný výběr a tlačítko „Tento týden“ okamžitě nastaví aktuální týden i datum. v1.604',
  '💬 WhatsApp objednávky (Kontrola a úprava): automatická detekce odběratele z textu/přepisu (Bar, Terasa, Restaurace...), možnost kdykoliv odběratele vybrat/upravit, přímé nastavení data závozu s rychlými volbami (Dnes/Zítra), poznámky k objednávce a plná editace položek (+ / − množství, rychlé počty, výběr piva a obalu, tlačítko smazat × a přidání další položky). v1.603',
  '🍺 KEG (Stáčení): checklist „1. Začátek stáčení“ nyní nabízí VOLBU chemie — proplach pivních cest buď NaOH 2% (20 minut), nebo Persteril 0.2% (10 minut) (vybere se vždy jen jeden postup; do Sanitárního deníku KEGů se zapíše zvolená chemie). V posledním týdnu měsíce se nyní zobrazuje varování i pro stáčení KEGů a checklist „4. Měsíční údržba“ je rozšířen: kompletně rozebrat VŠECHNY narážeče a rychlospojky (naložit do louhu NaOH, po 24 h vyčistit kartáčem, opláchnout vodou a zkontrolovat těsnění). v1.593',

  '🍺 KEG (Stáčení): checklist „1. Začátek stáčení“ nyní odpovídá aktuálnímu postupu a má 4 kroky — 1) proplach cest: NaOH 2% (20 minut) nebo Persteril 0.2% (10 minut), 2) vystříkat klapky Persterilem 0.2%, 3) oplach klapek vodou, 4) oplach vodou stáčečku (2 minuty); stejné kroky (a jejich pořadí) jsou i v „Části A: Před stáčením“ Sanitárního deníku KEGů, kde vypadl samostatný krok drhnutí klapek louhem. v1.592',
  '🧼 Sanitace: u každého kroku sanitárních deníků lahví i KEGů se nyní zaznamenává čas provedení — po odškrtnutí se u kroku objeví pole s časem (předvyplněným aktuálním časem, lze ručně upravit); časy se ukládají a zobrazují v přehledu i exportu do Excelu. Přibyl zcela nový „Sanitární deník výčepů“ (kohouty a výčepní vedení) — kroky s časy, důvodem, provádějící a schvalující osobou, filtrováním podle měsíce a exportem. v1.574',
  '🍺 KEG (Stáčení): u každého řádku zápisu se automaticky přiřadí a zobrazí aktivní tank, ze kterého se pivo stáčí (tank se „Zahájeným stáčením“ a daným pivem — např. zadáte 12sv a označí se Tank č.5), a z něj se rovnou odečte stočený objem; pokud je aktivních tanků se stejným pivem víc (2+), řádek výrazně upozorní ⚠️ a nechá vybrat, ze kterého odečítat; nahoře ve formuláři je živý souhrn „Odečte se z tanků“. v1.559',
  '🍾 Sanitace: nový „Sanitární deník lahví“ (záložka v Sanitačním deníku) — denní záznam sanitace stáčecí linky lahví: louh NaOH každý den, proplach čistou vodou, celá cesta včetně vzduchové na louhu s opláchem a úklid prostor; po dokončení checklistu „Konec stáčení“ nebo „Měsíční údržba“ se záznam pro dané datum zapíše automaticky; jde editovat, mazat a exportovat do Excelu. v1.558',
  '🍾 Lahve (Stáčení): tlačítko „Konec stáčení“ se přesunulo zespodu formuláře zápisu nahoru do hlavičky (vedle „Zadání stočení z fotky“), aby bylo po ruce hned na začátku. v1.557',
  '⚠️ Lahve (Stáčení): v posledním týdnu měsíce se po přihlášení při každém otevření aplikace zobrazí výrazné upozornění, že je tento týden potřeba udělat měsíční úklid (tlačítko „OK vím o tom“); po splnění úvodního checklistu „1. Začátek stáčení“ se automaticky otevře okno s měsíčním checklistem („4. Měsíční údržba“) s novou položkou — propláchnout veškeré cesty včetně odtokové na pivo, nevyčerpat louh ze sudu všechen (aby tlak vzduchu nevytlačil louh z pivních cest) a nechat do nejbližšího stáčení na stáčečky na louhu; checklist „2. Konec stáčení“ je opět s odškrtávacími políčky. v1.556',
  '📋 Lahve (Stáčení): checklist „2. Konec stáčení“ (úklid) je nyní čistý textový přehled BEZ zaškrtávacích políček — žádné odškrtávání ani „Potvrdit konec stáčení“, jen body k dodržení a tlačítko Zavřít. v1.555',
  '🍾 Lahve (Stáčení): ve formuláři zápisu přibylo tlačítko „Konec stáčení“, které otevře checklist „2. Konec stáčení“ (úklid) — položky seřízeny podle aktuálního postupu; „Naplnit“ u úkolu ke stočení teď přepíše celý formulář zápisu vybraným úkolem (pivo + obaly + KEG) a u počtu lahví 1./2./3. obalu se objevily rychlé volby množství v ks. v1.554',
  '🍾 Číselníky: sekce „Zadávání stáčení lahví“ (potřeba stáčení na týden + tlačítko „Stočit“) se přesunula z Nastavení (ADMIN) do Číselníků jako nová záložka „Potřeby stáčení“ — je viditelná jen pro administrátory. v1.553',
  '📋 Lahve (Stáčení): položka „Zkontrolovat vnitřky stáčeček a vyčistit kartáčem vnitřní a vnější plochy všech stáčeček (na kterých se bude stáčet) studeným louhem o koncentraci 2% a důkladně opláchnout čistou vodou“ se v checklistu „1. Začátek stáčení“ objeví jen do prvního splnění v týdnu — stačí ji udělat 1× týdně, na dalších stáčeních v tom samém týdnu se už nezobrazuje a neblokuje vstup do zápisu stáčení. v1.552',
  '🍾 Nastavení (ADMIN): nová sekce „Zadávání stáčení lahví“ — přehled potřeby na týden (lahve na skladě, sudy na skladě, objednávky + fašování, chybí stočit, konec týdne) a tlačítko „Stočit“, které otevře menu s velikostmi obalů (až 3) a počtem KEG sudů; úkol se uloží a automaticky propíše do formuláře stáčení (Lahve → „Úkoly ke stočení“ → „Naplnit“). v1.551',
  '📋 Lahve (Stáčení): „Stáčecí den“ je nyní povinná brána — po otevření zápisu stáčení se checklist sám otevře a nejde zavřít (Esc, kliknutí mimo ani „Zavřít“), dokud není odškrtnutá celá sekce „1. Začátek stáčení“ (příprava pracoviště); po splnění se uvolní „Pokračovat na stáčení“. Sekce „2. Konec stáčení“, „3. Týdenní kontrola“ a „4. Měsíční údržba“ se dají splnit kdykoli a vstup neblokují. v1.550',
  '📋 Lahve (Stáčení): při vstupu do zápisu stáčení se automaticky otevře „Stáčecí den“ — kontrolní seznam přípravy pracoviště (checklist), dokud není pro daný den splněný; po splnění se už sám neotevírá (tlačítko v liště zůstává). v1.549',
  '🌾 Šrotování sladu: kalkulačka v „Kalkulačkách“ přepracovaná na plán šrotování — 4 řádky s rozklikávacím výběrem piva, kolik se šrotuje (kg sladu) a dopočtem pytlů 25 kg; odstraněna vystírka a výpočty °P/výtěžnosti. v1.546',

  '🔐 Zabezpečení: z klientské aplikace odstraněn service-role klíč (RLS tak opravdu chrání data — bez přihlášení nikdo nemůže číst WhatsApp zprávy ani ostatní data) a webhook přijímá zprávy jen s hlavičkou x-webhook-token. v1.545',
  '💬 WhatsApp: do aplikace se teď ukládají a importují JEN zprávy ze skupiny „Objednávky pivovar" — webhook zprávy od všech ostatních odesílatelů zahodí (žádný banner, seznam ani počítadlo). Všechny zprávy ze skupiny se rozparsují a zobrazí ke schválení. v1.544',

  '💬 WhatsApp kontrola čtení: nový panel „Kontrola čtení — originál vs. přepis AI“ — originální zpráva se zeleně zvýrazněnými místy, odkud AI četla (s čísly položek), u každé položky ✓/⚠ štítek podle toho, jestli se AI čtený text v originálu opravdu nachází, a rozbalovací „Doslovný přepis AI“; zprávy s nesouhlasícím přepisem mají v Auto-Importu ⚠ odznak. v1.542',

  '📦 Sklad: záložka „Sklo, Etikety, Podtáčky“ (evidence skla, etiket, podtáčků a prázdných lahví) se přesunula z „Odpis, Promo, Sklo, Podtáčky“ do Skladu — v Skladu je nově horní záložka vedle přehledu zásob; tlačítko „Přejít do evidence etiket & lahví“ přepne přímo na tuto záložku. Položka v menu se zkrátila na „Odpis“. v1.541',

  '📝 WhatsApp/poznámky: oprava čtení „ještě sklo“ / „ještě podtácky“ (i s diakritikou) — dříve se taková poznámka nerozpoznala; rozšířeno na všechny tvary „ještě/ještě“ a „podtácky/podtáček“ s/bez diakritiky. v1.540',

  '📦 Objednávky: rozbalovací pole počtu je nově i při zadávání/úpravě objednávek a ve WhatsApp kontrole — podle obalu nabídne keg 4/6/10/12 ks, lahev 0,33/0,5 l 10/20/40/60/80/100 ks a lahev 1/1,5 l 5/6/12/20/24/36/40/50 ks; výchozí položka „+“. v1.538',
  '🏪 Prodejna: rychlé pole počtu v Zápisu nově nabízí i 24 a 40 ks (6/10/12/20/24/40); výchozí položka „+“. v1.537',

  '🏪 Prodejna: rozbalovací pole počtu (6/10/12/20 ks) je nově i ve formuláři Zápis vedle „−/+“ — jedním klikem nastaví počet a hned uloží; výchozí položka „+“. v1.536',

  '🍺 KEG: rychlá pole počtu sudů nově nabízejí i 18 a 36 ks (6/12/18/24/30/36); ve formuláři Zápis je výchozí položka „+". v1.535',

  '🍺 KEG: rozbalovací pole počtu sudů je nově i ve formuláři Zápis (vedle „−/+“) — jedním klikem nastaví 6 / 12 / 24 / 30 ks a hned uloží. v1.534',

  '🍺 KEG (Přehled i týdenní stáčení): nové rozbalovací pole u počtu sudů — jedním klikem nastaví 6 / 12 / 18 / 24 ks a hned uloží. v1.533',

  '👆 Oprava zoomování dvěma prsty: odstraněn vlastní JS zoom, který bojoval s nativním zoomem prohlížeče a sekal se. Zoom teď plynule obstarává prohlížeč (přiblížení/oddálení prsty, kolečko myši s Ctrl, bez dvojitého zoomu při dvojitém ťuknutí). v1.532',

  '🎨 Menu (mobil): odstraněn bílý pruh se zavíracím křížkem nahoře — menu teď začíná až úplně nahoře; zavírá se křížkem v rohu, kliknutím na položku nebo mimo menu. v1.531',

  '💬 Horní tlačítko „WhatsApp" nyní ukazuje červený odznak s počtem zpráv čekajících na schválení — aktualizuje se živě při příchodu i po zpracování zpráv. v1.530',

  '💬 Horní tlačítko „Auto-Import" přejmenováno na „WhatsApp" — jedním kliknutím se otevře přehled objednávek stažených z WhatsAppu (hromadné zpracování a načtení vybraných). v1.529',

  '🎨 Úpravy layoutu: odstraněn zajíc (logo) z horní části menu, menu má opět stejnou šířku jako dřív (256 px) a je roztažené svisle až k hornímu okraji. v1.528',

  '⚡ Rychlá tlačítka v Nastavení: nově lze vybrat Závoz a všechny stránky/záložky aplikace (výběr z rozbalovacího seznamu, respektuje oprávnění). Odstraněny mrtvé stránky (Varní listy, Stáčení KEG — zadání/přehled) a související mrtvý kód. v1.527',

  '🛒 WhatsApp kontrola: po potvrzení/zamítnutí objednávky se zpráva odstraní a automaticky se otevře další čekající zpráva — jde tak kontrolovat jednu po druhé. v1.526',

  '📥 WhatsApp: notifikace o nové objednávce k ověření funguje na VŠECH obrazovkách aplikace (dříve jen na stránce Objednávky) — systémová notifikace, zvuk i banner; kliknutí přepne na Objednávky. v1.525',

  '🐛 WhatsApp: oprava — jméno odesílatele zprávy (např. "Miláček") se už nikdy nepoužije jako odběratel. Odběratel (místo, pro které je objednávka) se hledá vždy uvnitř textu zprávy (např. "pro U Dubu"); pokud tam není, objednávka se vytvoří bez odběratele jako "Neznámý odběratel".',

  '⚠️ WhatsApp: kontrola duplicit při čtení objednávek do aplikace — když dva lidé schválí stejnou objednávku (nebo ji už zadal někdo jiný), systém to pozná (odběratel + týden + položky) a zeptá se před vytvořením. Zabrání to dvojímu zadání téže objednávky.',
  '📖 WhatsApp: lepší čtení — odběratelé, obaly i druhy piva se primárně párují s databází aplikace (přesná shoda, shoda slov, fuzzy, OCR opravy). Čte se i poznámka (výčep, sklo, etikety, vratné lahve, zaplaceno, faktura…) i z řádků s položkami.',
  '🗓️ WhatsApp: když je ve zprávě konkrétní datum (např. "25.8."), zapíše se do poznámky a objednávka se automaticky přesune do týdne toho data (25.8. = týden 25.8.).',
  '🚰 WhatsApp: když je v objednávce výčep (pipa/kohout/výčep…), při schválení se automaticky otevře rezervace výčepu s ověřením dostupnosti v daném termínu.',
  'đź“± WhatsApp: oprava â€” zprĂˇvy, kterĂ© pĹ™iĹˇly, kdyĹľ byla aplikace zavĹ™enĂˇ (nebo na jinĂ© obrazovce), se teÄŹ po otevĹ™enĂ­ ObjednĂˇvek samy doÄŤtou, rozparsujĂ­ a zobrazĂ­ modĂˇl ke schvĂˇlenĂ­. DĹ™Ă­v zĹŻstaly neviditelnĂ©.',
  'đź¤– WhatsApp Auto-Processor: novĂ© tlaÄŤĂ­tko "AI Processing" v objednĂˇvkĂˇch pro automatickĂ© zpracovĂˇnĂ­ WhatsApp zprĂˇv vÄŤetnÄ› OCR obrĂˇzkĹŻ a batch importu.',
  'đź¤– AutomatickĂ˝ import WhatsApp zprĂˇv pĹ™es Make.com: novĂˇ funkce pro automatickĂ˝ pĹ™Ă­jem objednĂˇvek z WhatsApp pomocĂ­ AutoNotification, Tasker a Make.com webhooku.',
  'âšˇ Offline-first PWA: aplikace se vĹľdy otevĹ™e z cache (i bez internetu), navigaÄŤnĂ­ requesty pouĹľĂ­vajĂ­ cache-first strategii pro okamĹľitĂ© naÄŤtenĂ­.',
  'đź“± Reorganizace menu podle tvrzĂ­: verze aplikace pĹ™esunuta do nastavenĂ­, kniha jĂ­zd pĹ™esunuta do Auta, obaly/lahve pĹ™esunuty do Lahve stĂˇÄŤenĂ­, odbÄ›ratelĂ©/piva pĹ™esunuty do InventĂˇĹ™e, upomĂ­nky/poznĂˇmky/kalendĂˇĹ™ slouÄŤeny pod jeden odkaz.',
  'đźŽ¨ CentrĂˇlnĂ­ kontrast napĹ™Ă­ÄŤ celou aplikacĂ­: tmavĂ© panely majĂ­ automaticky svÄ›tlĂ˝ text a svÄ›tlĂ© pozadĂ­ tmavĂ˝ text â€” ĹľĂˇdnĂ© neÄŤitelnĂ© kombinace barev. v1.506',
  'đź› ď¸Ź PĹ™idĂˇnĂ­ listopadu vyÄŤĂ­tĂˇnĂ­ duplicitnĂ­ch objednĂˇvek pĹ™i ÄŤtenĂ­ z fotky: novĂ˝ pokyn pro AI ignorovat opakujĂ­cĂ­ se potvrzenĂ­ (â€žokâ€ś, â€žanoâ€ś, â€žbudemâ€ś, â€žstejnĂ©â€ś) a deduplikaci na Ăşrovni frontendu, aby se stejnĂˇ objednĂˇvka pĹ™i opakovanĂ©m vĂ˝skytu neparsovala vĂ­cekrĂˇt.',


  'đź›˘ď¸Ź â€žPotĹ™eba stoÄŤit KEGyâ€ś: zjednoduĹˇenĂˇ tabulka â€” odstranÄ›ny sloupce inventura/poÄŤ. stav a vĂ˝deje. ZĹŻstĂˇvĂˇ jen Pivo(obal), StoÄŤeno, Sklad, ObjednĂˇno, PotĹ™eba stoÄŤit a Stav (chybĂ­). ÄŚitelnĂ© na mobilu na jednu obrazovku. v1.505',

  'đźŽ¨ OdstranÄ›na ÄŤernĂˇ barva z celĂ© aplikace: pozadĂ­ je svÄ›tle ĹˇedĂ© (mĂ­sto ÄŤernĂ©ho), tmavĂ˝ reĹľim je vypnutĂ˝ â€” ĹľĂˇdnĂ© ÄŤernĂ© plochy ani neÄŤitelnĂ© ÄŤernĂ© pĂ­smo. v1.504',

  'đźŤľ Oprava â€žStĂˇÄŤenĂ­ z fotkyâ€ś (lahve): vybranĂˇ fotka se teÄŹ sprĂˇvnÄ› naÄŤte a zpracuje (dĹ™Ă­ve se uklĂˇdala jen do fronty a nikdy se nespustila). v1.503',

  'đź–Ľď¸Ź ÄŚtenĂ­ z fotky: ikona galerie (đź–Ľď¸Ź) otevĹ™e rovnou fotogalerii (bez dialogu â€žSoubory/Fotogalerieâ€ś). Pro PDF soubory je zvlĂˇĹˇĹĄ tlaÄŤĂ­tko â€žđź“„ PDFâ€ś. v1.502',

  'đź“¸ ÄŚtenĂ­ z fotky: upozornÄ›nĂ­ na duplikĂˇt funguje i pro fotky, kterĂ© jsi naÄŤetl dĹ™Ă­ve (pamatuje se otisk naÄŤtenĂ˝ch fotek). HromadnĂ© naÄŤĂ­tĂˇnĂ­ (napĹ™. 50 fotek) se uklĂˇdĂˇ do fronty a ÄŤte jedna po druhĂ©. v1.501',

  'đź–Ľď¸Ź ÄŚtenĂ­ objednĂˇvek z fotky: vedle tlaÄŤĂ­tka fotoaparĂˇtu (đź“·) je teÄŹ ikona galerie (đź–Ľď¸Ź) â€” kliknutĂ­m se otevĹ™e galerie / vĂ˝bÄ›r souboru. v1.500',

  'đźŽ¨ Detail objednĂˇvky: pozadĂ­ je teÄŹ ĹˇedĂ© (mĂ­sto ÄŤernĂ©ho/tmavĂ©ho v tmavĂ©m reĹľimu) â€” lepĹˇĂ­ ÄŤitelnost i pĹ™i otevĹ™enĂ©m detailu. v1.499',

  'đź—“ď¸Ź PĹ™ehled objednĂˇvek: v reĹľimu â€žCelĂ˝ mÄ›sĂ­câ€ś pĹ™idĂˇny Ĺˇipky â€ą â€ş pro pĹ™epĂ­nĂˇnĂ­ mÄ›sĂ­cĹŻ (tĂ˝dny Ĺˇipky uĹľ mÄ›ly) â€” stejnÄ› jako u stĂˇÄŤenĂ­ KEG/lahvĂ­. v1.498',

  'đźŤş Oprava automatickĂ© rezervace vĂ˝ÄŤepu: rezervace se uĹľ nevytvoĹ™Ă­, kdyĹľ poznĂˇmka objednĂˇvky obsahuje jen bÄ›ĹľnĂˇ slova (â€žbarâ€ś, â€žhospodaâ€ś, â€žpivniceâ€ś, â€žstojanâ€ś) â€” spustĂ­ se jen pĹ™i reĂˇlnĂ© zmĂ­nce o vĂ˝ÄŤepu (vĂ˝ÄŤep/pipa/kohout...). v1.497',

  'đźŽ¨ ÄŚitelnost objednĂˇvek: odstranÄ›ny skoro-ÄŤernĂ© texty (â€‘950/â€‘900) v seznamu a v rozkliknutĂ©m detailu objednĂˇvky nahrazeny tmavÄ› Ĺˇedou/ÄŤitelnÄ›jĹˇĂ­ barvou â€” bez ÄŤernĂ©, lepĹˇĂ­ ÄŤitelnost. v1.496',

  'đźŤş U objednĂˇvky s rezervacĂ­ vĂ˝ÄŤepu se zobrazĂ­ ikona đźŤş a nĂˇzev vĂ˝ÄŤepu. ObjednĂˇvka na budoucĂ­ termĂ­n (napĹ™. 25.8.) se Ĺ™adĂ­ do tĂ˝dne toho termĂ­nu a na zaÄŤĂˇtku toho tĂ˝dne + den pĹ™edem se spustĂ­ upozornÄ›nĂ­. v1.495',

  'đź“ť Oprava poznĂˇmky u objednĂˇvky z fotky: pĹ™estanou se tam zapisovat vĂˇgnĂ­ slova jako â€žbarâ€ś nebo samostatnĂ© â€žsklo?â€ś (zĹŻstane jen reĂˇlnĂ˝ poĹľadavek, napĹ™. â€žpĹ™idat skloâ€ś, â€žvĂ˝ÄŤepâ€ś). v1.494',

  'âž• PĹ™idat Ĺ™Ăˇdek pĹ™i ÄŤtenĂ­ z fotky (objednĂˇvky) se teÄŹ vloĹľĂ­ hned na mĂ­sto, kde prĂˇvÄ› pĂ­ĹˇeĹˇ (za aktuĂˇlnĂ­ Ĺ™Ăˇdek), ne vĹľdy dolĹŻ na konec. v1.493',

  'đźŤş Oprava ÄŤtenĂ­ â€ž2x50â€ś z fotky: pokud AI pĹ™eÄŤte jen â€ž2x50â€ś (2Ă— sud 50l) a nedoplnĂ­ obal/mnoĹľstvĂ­, aplikace to teÄŹ odvodĂ­ sama pĹ™Ă­mo z textu â€” objednĂˇvka se uĹľ neztratĂ­. v1.492',

  'âš ď¸Ź VrĂˇceno tlaÄŤĂ­tko â€žChybyâ€ś nahoĹ™e v zĂˇhlavĂ­ (ÄŤervenĂ©) â€” mrkveckĂ˝m, uvÄ›domĂ­Ĺˇ chybu nebo nĂˇpad rovnou s moĹľnostĂ­ pĹ™iloĹľit fotku. v1.491',

  'đźŤş StupeĹ piva teÄŹ patĹ™Ă­ k tĂ© objednĂˇvce, u kterĂ© je na fotce napsanĂ˝: AI uĹľ nemĹŻĹľe zamÄ›nit stupeĹ z jinĂ© objednĂˇvky (napĹ™. â€ž2x50â€ś dostane sprĂˇvnĂ˝ stupeĹ z vlastnĂ­ fotky, ne z jinĂ©ho Ĺ™Ăˇdku). Opraveno i pro samostatnÄ› rozpoznanĂ˝ stupeĹ. v1.490',

  'đź“˛ ÄŚtenĂ­ z fotky (objednĂˇvky): kdyĹľ se stejnĂˇ objednĂˇvka pĹ™eÄŤte z fotky vĂ­ckrĂˇt (duplicitnĂ­ Ĺ™Ăˇdky od AI), aplikace ji teÄŹ vrĂˇtĂ­ jen jednou â€” automatickĂˇ deduplikace podle odbÄ›ratele, piva, obalu, stupnÄ›, mnoĹľstvĂ­ a data. v1.489',
  'đź“¸ ÄŚtenĂ­ z fotky (objednĂˇvky): nahrĂˇĹˇ-li 2Ă— tentĂ˝Ĺľ snĂ­mek obrazovky, aplikace tÄ› na to upozornĂ­ a umoĹľnĂ­ ho pĹ™eskoÄŤit (detekce podle nĂˇzvu, velikosti a ÄŤasu souboru). v1.489',
  'đź’¬ WhatsApp (AI): ÄŤtenĂ­ objednĂˇvek bere v Ăşvahu KONTEXT celĂ© konverzace. KdyĹľ se na objednĂˇvku odpovĂ­dĂˇ (â€žjeĹˇtÄ› k tomuâ€ś, â€žpĹ™idejâ€ś apod.), odpovÄ›ÄŹ se doplnĂ­ do pĹŻvodnĂ­ objednĂˇvky stejnĂ©ho odbÄ›ratele/data a neÄŤte se tupe Ĺ™Ăˇdek po Ĺ™Ăˇdku. TotĂ©Ĺľ platĂ­ pro screenshoty konverzace (fotka). v1.489',

  'âšˇ Oprava pĂˇrovĂˇnĂ­ piva Jantar (13Â° Jantar polotmavĂ˝ leĹľĂˇk): zabrĂˇnÄ›no pĹ™esmÄ›rovĂˇnĂ­ na 12Â° SvÄ›tlĂˇ z obecnĂ˝ch aliasĹŻ. v1.488',
  'âšˇ Oprava pĂˇrovĂˇnĂ­ lahvĂ­ 20x0,5: Ĺ™etÄ›zce "20x0,5" se bezpeÄŤnÄ› pĹ™iĹ™azujĂ­ k obalu Lahve 0.5l (nikoliv 0,33l). v1.487',
  'âšˇ Oprava pĂˇrovĂˇnĂ­ 50l sudĹŻ: explicitnĂ­ vyhodnocenĂ­ objemu 50l pĹ™ed aliasem "keg" (kterĂˇ zpĹŻsobovala pĹ™epis na 30l). v1.486',
  'âšˇ SW Network-First oprava: Vynuceno naÄŤĂ­tĂˇnĂ­ nejnovÄ›jĹˇĂ­ho kĂłdu ze sĂ­tÄ› bez zasekĂˇvĂˇnĂ­ na starĂ© cache. v1.485',
  'đź“‹ KompletnĂ­ oficiĂˇlnĂ­ KontrolnĂ­ seznam (56 bodĹŻ: ZaÄŤĂˇtek, Konec, TĂ˝dennĂ­ a MÄ›sĂ­ÄŤnĂ­ ĂşdrĹľba stĂˇÄŤenĂ­ lahvĂ­).',
  'đź“Ą PĹ™idĂˇno tlaÄŤĂ­tko a modul "Import z Excelu / Google Tabulky" do Inventury s automatickĂ˝m pĂˇrovĂˇnĂ­m piva a obalu.',
  'âšˇ Opravena barva pĂ­sma v BilanÄŤnĂ­ tabulce inventury na vĂ˝raznÄ› tmavĂ© + vylepĹˇeno 2-prstovĂ© gest pinch-to-zoom pro celou aplikaci.',
  'đź“‹ PridĂˇn KontrolnĂ­ seznam (Checklist) pro StĂˇÄŤenĂ­ lahvĂ­ (sanitace, obaly, etikety, ĹˇarĹľe, DMT, kontrola plnÄ›nĂ­ a Ăşklid).',
  'âšˇ AutomatickĂˇ aktualizace verze: Opraven kontrast textĹŻ v objednĂˇvkĂˇch a inventuĹ™e, zapracovĂˇno neomylnĂ© zĂˇchrannĂ© pĂˇrovĂˇnĂ­ piva a obalu, aktivovĂˇn 2-prstovĂ˝ pinch-zoom pro celou aplikaci.',
  'âšˇď¸Ź Oprava fronty fotografiĂ­: KompletnÄ› pĹ™epsĂˇn mechanismus zpracovĂˇnĂ­ fronty fotografiĂ­ na pozadĂ­ pomocĂ­ sekvenÄŤnĂ­ho asynchronnĂ­ho cyklu (async/await). OdstranÄ›na zĂˇvislost na sloĹľitĂ©m a chybovĂ©m provĂˇzĂˇnĂ­ React efektĹŻ, coĹľ zaruÄŤuje 100% spolehlivost pĹ™i nahrĂˇvĂˇnĂ­ libovolnĂ©ho mnoĹľstvĂ­ snĂ­mkĹŻ, a to i v kombinaci s editorem oĹ™ezĹŻ pĹ™ed odeslĂˇnĂ­m na AI.',
  'đź“¸ AutomatickĂˇ fronta fotografiĂ­: PĹ™i vĂ˝bÄ›ru nebo vyfocenĂ­ vĂ­ce snĂ­mkĹŻ najednou se nynĂ­ vĹˇechny fotky zpracujĂ­ na pozadĂ­ automaticky jedna po druhĂ© (do spoleÄŤnĂ© fronty). VĂ˝sledky se postupnÄ› pĹ™ipojujĂ­ a uĹľivatel je mĹŻĹľe zkontrolovat a importovat najednou, namĂ­sto dĹ™Ă­vÄ›jĹˇĂ­ho zdlouhavĂ©ho ÄŤekĂˇnĂ­ a schvalovĂˇnĂ­ po jednotlivĂ˝ch snĂ­mcĂ­ch.',
  'đź“± DynamickĂˇ hlaviÄŤka importu: OdstranÄ›n statickĂ˝ text â€žRozparsovanĂ© poloĹľkyâ€ś v hlaviÄŤce a nahrazen textem, kterĂ˝ AI pĹ™eÄŤetla na aktuĂˇlnÄ› vybranĂ©m/upravovanĂ©m Ĺ™Ăˇdku. ZobrazenĂ­ se automaticky a okamĹľitÄ› mÄ›nĂ­ pĹ™i pĹ™echodu nebo kliknutĂ­ na jakĂ˝koli vstup jinĂ©ho Ĺ™Ăˇdku, takĹľe pĹ™i psanĂ­ pod sebou na mobilu mĂˇte stĂˇle na oÄŤĂ­ch originĂˇlnĂ­ text z fotky.',
  'đź“± Vzhled na mobilu: VĂ˝raznÄ› zvÄ›tĹˇena a zpĹ™ehlednÄ›na textovĂˇ pole a rozbalovacĂ­ vĂ˝bÄ›ry (pivo, obal) pĹ™i importech z fotek/AI (objednĂˇvky, stĂˇÄŤenĂ­, inventura). Na mobilu se nynĂ­ pole roztahujĂ­ na plnou ĹˇĂ­Ĺ™ku a majĂ­ vÄ›tĹˇĂ­ pĂ­smo, coĹľ usnadĹuje kontrolu a zabraĹuje nechtÄ›nĂ©mu pĹ™iblĂ­ĹľenĂ­ v prohlĂ­ĹľeÄŤi.',
  'âš ď¸Ź NahlaĹˇovĂˇnĂ­ chyb: PĹ™idĂˇno rychlĂ© ÄŤervenĂ© tlaÄŤĂ­tko â€žChybyâ€ś nahoĹ™e v zĂˇhlavĂ­ pro snadnĂ© hlĂˇĹˇenĂ­ zĂˇvad a nĂˇpadĹŻ na vylepĹˇenĂ­ pĹ™Ă­mo s moĹľnostĂ­ pĹ™iloĹľit fotku z galerie ÄŤi fotoaparĂˇtu. Fotky se automaticky zmenĹˇujĂ­ a komprimujĂ­ na pozadĂ­ a sprĂˇvce je uvidĂ­ pĹ™ehlednÄ› v poznĂˇmkĂˇch a nĂˇpadech.',
  'âśŹď¸Ź Ăšprava stĂˇÄŤenĂ­: U stĂˇÄŤenĂ­ lahvĂ­ i KEG sudĹŻ byla pĹ™idĂˇna moĹľnost kompletnĂ­ a detailnĂ­ editace zĂˇznamĹŻ (kliknutĂ­m na ikonu tuĹľky âśŹď¸Ź) â€” lze upravit datum, pivo, obal, mnoĹľstvĂ­, tank i poznĂˇmku.',
  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­ (PĹ™ehled): poÄŤet sudĹŻ â€žđź›˘ď¸Ź SudĹŻâ€ś i velikost â€žKEGâ€ś jsou nynĂ­ EDITOVATELNĂ‰ pĹ™Ă­mo v pĹ™ehledu â€” poÄŤet sudĹŻ tlaÄŤĂ­tky â’ / + a velikost sudu rozbalovacĂ­m vĂ˝bÄ›rem; zmÄ›na se projevĂ­ pro celou ĹˇarĹľi (vĹˇechny obaly stoÄŤenĂ© z danĂ˝ch sudĹŻ) a pĹ™epoÄŤĂ­tĂˇ se i zdrojovĂ˝ objem a ztrĂˇta',
  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­ (PĹ™ehled): KEG a poÄŤet sudĹŻ lze nynĂ­ DOPLNIT i u zĂˇznamĹŻ, kde byl KEG zapomenut â€” u kaĹľdĂ© ĹˇarĹľe bez zadanĂ©ho sudu je aktivnĂ­ vĂ˝bÄ›r velikosti KEG a tlaÄŤĂ­tka â’ / + pro poÄŤet sudĹŻ (dĹ™Ă­ve se zobrazovala jen pomlÄŤka)',


  'đź“· Import z fotky (AI): oprava pĹ™iĹ™azenĂ­ OBJEMU u KEG sudĹŻ â€” pokud je v textu objednĂˇvky napsĂˇno â€ž2x50â€ś (pĹ™esnÄ› viditelnĂ© v textu), ale AI do obalu zapĂ­Ĺˇe â€ž2x30â€ś nebo â€žKEG 30lâ€ś, aplikace nynĂ­ sprĂˇvnÄ› pouĹľije objem z textu (50l) a nenechĂˇ chybnĂ˝ obal 30l. TĂ˝kĂˇ se i fragmentĹŻ typu â€ž2x30â€ś, kterĂ© AI omylem zapĂ­Ĺˇe jako obal.',

  'đźŤş Jantar: pivo â€žJantarâ€ś mĂˇ nynĂ­ jednoznaÄŤnou pĹ™ednost â€” pokud v objednĂˇvce zaznĂ­/napĂ­Ĺˇe â€ž12 jantarâ€ś, â€žjantâ€ś nebo â€žjantarekâ€ś, vĹľdy se vybere pivo Jantar (ne 12Â° SvÄ›tlĂˇ), i kdyby u nÄ›j stĂˇlo ÄŤĂ­slo 12. Opraveno pro ruÄŤnĂ­ zadĂˇnĂ­ textem, hlas i fotku.',
  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­ (PĹ™ehled): pĹ™idĂˇn sloupec â€žđź›˘ď¸Ź SudĹŻâ€ś â€” ukazuje, z kolika sudĹŻ byly lahve stoÄŤeny (z pole kegs_used); v souhrnu â€žCelkemâ€ś je celkovĂ˝ poÄŤet pouĹľitĂ˝ch sudĹŻ (s deduplikacĂ­ zdroje)',
  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­ (PĹ™ehled): pĹ™idĂˇny zĂˇloĹľky đźŤľ Lahve / đź›˘ď¸Ź KEG / đź“¦ VĹˇe pro oddÄ›lenĂ­ zĂˇznamĹŻ lahvĂ­ a KEG sudĹŻ',
  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­ (PĹ™ehled): u zobrazenĂ­ â€žMÄ›sĂ­câ€ś pĹ™idĂˇna navigace â€ą / â€ş pro listovĂˇnĂ­ mezi mÄ›sĂ­ci (dĹ™Ă­ve Ĺˇlo listovat jen u tĂ˝dnĹŻ)',
  'đź“‹ Inventura: sloupec â€žVĂ˝d.â€ś (vĂ˝deje) ve FyzickĂ© inventuĹ™e nynĂ­ zahrnuje VĹ ECHNY odchody ze skladu â€” FasovĂˇnĂ­ + Prodejna + Odpis + ObjednĂˇvky + StĂˇÄŤenĂ­ lahvĂ­ + Akce (dĹ™Ă­ve jen FasovĂˇnĂ­ + Prodejna + Odpis)',

  'đź›˘ď¸Ź KEG (StĂˇÄŤenĂ­ & PĹ™ehled): â€žZbĂ˝vĂˇ stoÄŤit kegâ€ś se nynĂ­ poÄŤĂ­tĂˇ jako objednĂˇno â’ (sklad na konci mÄ›sĂ­ce + stoÄŤeno tento mÄ›sĂ­c) â€” porovnĂˇvĂˇ se s inventurou a stĂˇÄŤenĂ­m v aktuĂˇlnĂ­m mÄ›sĂ­ci',
  'đź“‹ Inventura: pĹ™idĂˇn mÄ›sĂ­ÄŤnĂ­ filtr (â€ą / â€ş) pĹ™Ă­mo do zĂˇloĹľky â€žStav sudĹŻ na konci mÄ›sĂ­ceâ€ś (BilanÄŤnĂ­ konto sudĹŻ) â€” lze si vyfiltrovat libovolnĂ˝ mÄ›sĂ­c (napĹ™. ÄŤervenec) a celĂ© konto se pĹ™epoÄŤĂ­tĂˇ',


  'ďż˝ Sklad: na kartÄ› piva pĹ™idĂˇn Ĺ™Ăˇdek â€žCelkem odchodyâ€ś (fasovĂˇnĂ­ + stĂˇÄŤenĂ­ lahvĂ­ + akce + objednĂˇvky + odpisy + prodejna) a reĂˇlnĂ˝ stav â€žK dispozici (po vĹˇech odchodech)â€ś',
  'đź›˘ď¸Ź Inventura: opraveno â€žStĂˇÄŤenĂ­ lahvĂ­â€ś v bilanÄŤnĂ­m kontu sudĹŻ â€” nynĂ­ se sprĂˇvnÄ› odeÄŤĂ­tajĂ­ pouĹľitĂ© sudy ze skladu sudĹŻ (napĹ™. 2Ă—50L na 94 ks 1L PET); lahve stoÄŤenĂ© bez sudĹŻ (dotĂˇÄŤenĂ­ z akcĂ­) se pĹ™iÄŤtou do skladu lahvĂ­, ale sudy se neodeÄŤĂ­tajĂ­',

  'ďż˝đź”„ AutomatickĂˇ aktualizace: aplikace se nynĂ­ sama aktualizuje po kaĹľdĂ©m nasazenĂ­ novĂ© verze (kontrola kaĹľdou minutu) â€” bez nutnosti ruÄŤnÄ› obnovovat strĂˇnku; pokud zrovna pĂ­Ĺˇete do formulĂˇĹ™e, aktualizace poÄŤkĂˇ, aĹľ dokonÄŤĂ­te zĂˇpis',
  'đź“¦ Sklad: â€žSklademâ€ś nynĂ­ = stav k zaÄŤĂˇtku mÄ›sĂ­ce (inventura) + stoÄŤeno â’ VĹ ECHNY odchody (fasovĂˇnĂ­/scenĂ˝ sud, odpisy, stĂˇÄŤenĂ­ lahvĂ­, akce, objednĂˇvky). Po zadĂˇnĂ­ scenĂ©ho sudu se poÄŤet sudĹŻ v pĹ™ehledu sprĂˇvnÄ› snĂ­ĹľĂ­',
  'đź“¦ Sklad: detail po obalech nynĂ­ ukazuje VĹ ECHNY odchody v samostatnĂ˝ch sloupcĂ­ch â€” ObjednĂˇvky, Odpisy, FasovĂˇnĂ­, Akce, StĂˇÄŤenĂ­ lahvĂ­ a Celkem odchody; objednĂˇvky se odeÄŤĂ­tajĂ­ v tĂ˝dnu zĂˇvozu (delivery_date)',



  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­: pĹ™idĂˇn druhĂ˝ sloupec â€žLahve 2â€ś â€” z jednoho sudu lze stoÄŤit vĂ­ce druhĹŻ obalĹŻ najednou (napĹ™. 0,5L i 1,5L); opravena nabĂ­dka lahvĂ­, kde chybÄ›ly 1,5L lahve',

  'đźŤľ StĂˇÄŤenĂ­ lahvĂ­: pĹ™i stĂˇÄŤenĂ­ do lahvĂ­ ze sudĹŻ se zadĂˇvĂˇ poÄŤet pouĹľitĂ˝ch sudĹŻ (napĹ™. 6Ă—50L) vedle obalu; tyto sudy se odeÄŤtou ze skladu KEG (jako objednĂˇvka) a v pĹ™ehledu vytraty je vidÄ›t zdroj ze sudĹŻ, stoÄŤeno do lahvĂ­ a ztrĂˇta (litry i %)',

  'đź›˘ď¸Ź StĂˇÄŤenĂ­ KEG: pĹ™ehled je nynĂ­ na samostatnĂ© zĂˇloĹľce â€žPĹ™ehledâ€ś (oddÄ›leno od zĂˇpisu); nahoĹ™e je vidÄ›t â€žZbĂ˝vĂˇ stoÄŤit kegâ€ś a pod nĂ­m pĹ™ehled stoÄŤenĂ˝ch sudĹŻ s filtrem podle dne/tĂ˝dne/mÄ›sĂ­ce a podle piva',


  'đźŹšď¸Ź Sklep & Spilka: na kartÄ› tanku je nynĂ­ pĹ™Ă­mĂˇ volba piva a poÄŤĂˇteÄŤnĂ­ho objemu (bez otevĂ­rĂˇnĂ­ â€žUpravitâ€ś); u kaĹľdĂ©ho tanku je vidÄ›t poÄŤĂˇteÄŤnĂ­ objem a kolik piva zbĂ˝vĂˇ v HL',
  'đźŹšď¸Ź Sklep & Spilka: odstranÄ›n HACCP banner nahoĹ™e; statistiky (souhrn mÄ›sĂ­c/rok, historie cyklĹŻ a pĹ™etĂˇÄŤenĂ­) pĹ™esunuty do Statistiky â€” ve Sklepu zĹŻstĂˇvĂˇ jen pĹ™ehled tankĹŻ a spilky',
  'đź“‹ ObjednĂˇvky: karty objednĂˇvek majĂ­ nynĂ­ jednotnou bĂ­lou barvu (bez podbarvenĂ­ dnem/pivem); jednotlivĂˇ piva jsou barevnÄ› rozliĹˇenĂˇ teÄŤkou u nĂˇzvu ve stejnĂ©m stylu jako StĂˇÄŤenĂ­ (keg/lahve)',
  'đź“‹ ObjednĂˇvky: zĂˇloĹľka â€žObjednĂˇvkyâ€ś pĹ™ejmenovĂˇna na â€žPĹ™ehledâ€ś; v pĹ™ehledu a zĂˇvozu sjednoceny ikony do jednotnĂ©ho stylu (lucide) a zpĹ™ehlednÄ›ny barvy â€” tmavÄ› ĹľlutĂ© texty nahrazeny ÄŤitelnÄ›jĹˇĂ­mi (ÄŤernĂˇ na ĹľlutĂ©m podkladu, bĂ­lĂˇ na jantarovĂ©m)',
  'đź“‹ ObjednĂˇvky: ZĂˇvoz je nynĂ­ tĹ™etĂ­ zĂˇloĹľkou vedle NovĂ© a ObjednĂˇvky â€” nahoĹ™e jsou vĹľdy zĂˇloĹľky NovĂ© / ObjednĂˇvky / ZĂˇvoz, aĹĄ kliknete na kteroukoli; obsah zĂˇvozu se zobrazĂ­ pĹ™Ă­mo v objednĂˇvkĂˇch',
  'đźŽ¨ ObjednĂˇvky a ZĂˇvoz: sjednoceny ikony do jednotnĂ©ho stylu (lucide) â€” NovĂ© (+), ObjednĂˇvky (faktura), ZĂˇvoz (dodĂˇvka), WhatsApp, Fotka/AI, Tisk, Export, FasovĂˇnĂ­, Smazat, Vybrat vĹˇe a dalĹˇĂ­',
  'đź“‹ ObjednĂˇvky: â€žDetaily obj.â€ś pĹ™ejmenovĂˇno na â€žObjednĂˇvkyâ€ś; v kartÄ› objednĂˇvky je hlavnĂ­ datum akce/zĂˇvozu (napĹ™. 21.8) a datum zadĂˇnĂ­ je vedlejĹˇĂ­; opravena kontrola â€žVĹˇe sklademâ€ś â€” poÄŤĂ­tĂˇ se podle tĂ˝dne zĂˇvozu, ne zadĂˇnĂ­; â€žPĹ™ipr.â€ś je vedle â€žVĹˇe sklademâ€ś; zĂˇloĹľka â€žNovĂ©â€ś zobrazuje jen formulĂˇĹ™ zadĂˇvĂˇnĂ­, seznam a detaily jen v â€žObjednĂˇvkyâ€ś',
  'đź“‹ ObjednĂˇvky: tlaÄŤĂ­tka ZadĂˇnĂ­ objednĂˇvek, Detaily objednĂˇvek a ZĂˇvoz na jednom Ĺ™Ăˇdku; opraven filtr poloĹľek â€” vĂ˝bÄ›r piva a velikosti obalu se kombinuje (napĹ™. 11SV + 30L zobrazĂ­ jen objednĂˇvky s obojĂ­m)',
  'đź“‹ ObjednĂˇvky: zĂˇloĹľka â€žPĹ™ehledâ€ś pĹ™ejmenovĂˇna na â€žZadĂˇnĂ­ objednĂˇvekâ€ś; v â€žDetaily objednĂˇvekâ€ś odstranÄ›n formulĂˇĹ™ zadĂˇvĂˇnĂ­, pole â€žDenâ€ś pĹ™ejmenovĂˇno na â€žZĂˇvozâ€ś, odstranÄ›no FasovĂˇnĂ­, opravena viditelnost tlaÄŤĂ­tek ZruĹˇit/Smazat na telefonu a pĹ™idĂˇny filtry podle piva a velikosti obalu',
  'đź“‹ ObjednĂˇvky: PĹ™ehled nynĂ­ zobrazuje VĹ ECHNY zadanĂ© objednĂˇvky â€” lze nastavit den zĂˇvozu, upravit objednĂˇvku a vidÄ›t vĹˇechny objednanĂ© poloĹľky',
  'đźšš ZĂˇvoz: filtr dnĹŻ â€” â€žVĹˇechny dnyâ€ś pĹ™ejmenovĂˇno na â€žVĹˇechnyâ€ś, odstranÄ›na ÄŤĂ­sla, zvĂ˝raznÄ›ny jen dny se zĂˇvozem',
  'đźšš Historie a pĹ™ehled tras pĹ™esunuty ze ZĂˇvozu do Statistiky (zĂˇloĹľka â€žHistorie a pĹ™ehled trasâ€ś)',
  'đźšš ZĂˇvoz: datum zmenĹˇen, tlaÄŤĂ­tka ZadĂˇvĂˇnĂ­ objednĂˇvek a PĹ™ehled objednĂˇvek pĹ™esunuta nahoru, odstranÄ›no Diktovat hlasem, CelkovĂˇ vĂˇha a Zavezeno na jednom Ĺ™Ăˇdku a zmenĹˇeny',
  'đźšš ZĂˇvoz: historie a pĹ™ehled tras â€” pĹ™idĂˇny filtry (dny/tĂ˝dny/mÄ›sĂ­ce, odbÄ›rnĂ© mĂ­sto, pivo, velikost obalu)',
  'đź“‹ ObjednĂˇvky: grafickĂˇ optimalizace karet objednĂˇvek na kompaktnĂ­ Ĺ™Ăˇdky, aby se v telefonu veĹˇlo vĂ­ce poloĹľek',
  'đź“‹ ObjednĂˇvky: tlaÄŤĂ­tka PĹ™ehled, Detaily objednĂˇvek a ZĂˇvoz pĹ™esunuty nahoru nad hlasovĂ© zadĂˇvĂˇnĂ­, WhatsApp a fotku',
  'đź“‹ ObjednĂˇvky: odstranÄ›n souhrn tĂ˝dne (pĹ™ehled objednĂˇvek a kusĹŻ jednotlivĂ˝ch sudĹŻ)',
  'đźšš ObjednĂˇvky: tlaÄŤĂ­tko ZĂˇvoz nahoĹ™e otevĂ­rĂˇ strĂˇnku ZĂˇvoz',
  'đźš° Rezervace vĂ˝ÄŤepu: rozpoznĂˇvĂˇnĂ­ vĹˇech synonym (jednokohout, dvojkohout, dvojpĂ­pa, trojpĂ­pa, pĂ­pa, vĂ˝ÄŤepâ€¦) a vĂ˝bÄ›r druhu vĂ˝ÄŤepu',
  'đźš° Rezervace vĂ˝ÄŤepu se propisuje do zĂˇloĹľky VĂ˝ÄŤepy',
  'đź“ť ZadĂˇvĂˇnĂ­ objednĂˇvek: odstranÄ›n sloupec OdbÄ›ratel z tabulky, roztaĹľen sloupec Pivo (odbÄ›ratel je nahoĹ™e v hlaviÄŤce)',
];
