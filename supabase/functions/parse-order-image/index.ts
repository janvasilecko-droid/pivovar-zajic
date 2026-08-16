import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OrderItem {
  quantity: number | null;
  degree: string | null;
  beer_name: string | null;
  package_label: string | null;
  raw_line: string;
  place_name: string | null;
  date?: string | null;
  bbox?: { x0: number; y0: number; x1: number; y1: number } | null;
}

interface AiResponse {
  items?: OrderItem[];
  raw_text?: string;
  order_date?: string | null;
  error?: string;
}

// 🧹 Pokud AI přečetlo tu samou objednávku z fotky víckrát (duplicitní řádky
// v odpovědi), ponecháme ji jen jednou. Deduplikace probíhá podle toho, co je
// pro objednávku podstatné (odběratel, pivo, obal, stupeň, množství, datum).
function dedupeItems(items: OrderItem[]): OrderItem[] {
  const seen = new Set<string>();
  const out: OrderItem[] = [];
  for (const it of items) {
    const key = [
      it.place_name || "",
      it.beer_name || "",
      it.package_label || "",
      it.degree || "",
      it.quantity ?? "",
      it.date || "",
    ].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}



Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try { 
    // Read keys from app_secrets table (service role bypasses RLS).
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "parse-order-image",
      limit: 10,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const { data: secretRows, error: secretsErr } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);

    const secretsMap = new Map((secretRows ?? []).map((s) => [s.key, s.value]));
    const geminiKey = secretsMap.get("GEMINI_API_KEY");
    const apiKey = secretsMap.get("ANTHROPIC_API_KEY");
    const openaiKey = secretsMap.get("OPENAI_API_KEY");

    if (secretsErr || (!geminiKey && !apiKey && !openaiKey)) {
      return new Response(
        JSON.stringify({ error: "Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured in app_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await readJsonWithLimit<Record<string, any>>(req, 15 * 1024 * 1024);
    const imageBase64: string | undefined = body.imageBase64;
    const imageMimeType: string | undefined = body.imageMimeType;
    const beers: { id: string; name: string; degree: string }[] = body.beers ?? [];
    const packages: { id: string; label: string }[] = body.packages ?? [];
    const isSenderName = (s: string) => {
      const norm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return ['bednar', 'petr', 'sladek', 'gabina', 'ucetni', 'pojmi', 'bendat'].some((x) => norm.includes(x));
    };
    const places: string[] = (body.places ?? []).filter((p: string) => !isSenderName(p));
    const aliases: { alias_text: string; beer_name: string | null; package_label: string | null }[] = body.aliases ?? [];
    const placeAliases: { wrong_name: string; correct_name: string }[] = (body.placeAliases ?? []).filter((a: any) => !isSenderName(a.wrong_name) && !isSenderName(a.correct_name));


    if (!imageBase64 || !imageMimeType) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64 or imageMimeType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build a catalog hint so the model returns ids we can match directly.
    const beerList = beers.map((b) => `${b.id}: ${b.name} (${b.degree})`).join("\n");
    const pkgList = packages.map((p) => `${p.id}: ${p.label}`).join("\n");
    const placesList = places.length ? places.join(", ") : "(žádní uložení odběratelé zatím)";
    const beerAliases = aliases.filter((a) => a.beer_name);
    const pkgAliases = aliases.filter((a) => a.package_label);
    const beerAliasList = beerAliases.length
      ? beerAliases.map((a) => `"${a.alias_text}" → ${a.beer_name}`).join("\n")
      : "(žádné naučené zkratky zatím)";
    const pkgAliasList = pkgAliases.length
      ? pkgAliases.map((a) => `"${a.alias_text}" → ${a.package_label}`).join("\n")
      : "(žádné naučené zkratky zatím)";
    const placeAliasList = placeAliases.length
      ? placeAliases.map((a) => `"${a.wrong_name}" → ${a.correct_name}`).join("\n")
      : "(žádné naučené aliasy odběratelů zatím)";

    const prompt = `Jsi asistent pro pivovar. Na obrázku je objednávka piva (WhatsApp zpráva, e-mail, nebo ručně psaný seznam).
Přečti VŠECHNY řádky objednávky a vrať je jako strukturovaná data. NIKDY nevynechávej žádnou položku objednávky — i když si nejsi jistý, vrať ji s tím, co jsi rozpoznal, a nech neznámé hodnoty jako null.

NADPŘEDNOSTNÍ PRAVIDLA PŘESNOSTI (důležitější než cokoli jiného):
0a. ŘÁDKOVÁ INVENTURA: NEŽ ZAPÍŠEŠ ODPOVĚĎ, spočítej si v duchu, kolik řádků textu/objednávky je na fotce vidět (každá zpráva, každá položka, každé pokračování na novém řádku). Ke KAŽDÉMU viditelnému řádku, který obsahuje číslo nebo položku objednávky, MUSÍ v "items" existovat alespoň jedna položka. Po napsání odpovědi se znovu podívej na fotku a zkontroluj, že jsi žádný řádek nevynechal. Pokud nějaký řádek neumíš přečíst, NIKDY ho nevynechávej — přidej ho do items s null hodnotami a doslovně ho zkopíruj do raw_text.
0b. RUČNĚ PSANÝ TEXT = DVOJITÉ ČTENÍ: každé ručně psané číslo přečti DVAKRÁT — (1) podle tvaru číslic a (2) podle kontextu objednávky (kolik kusů / jaký obal dává smysl). Časté záměny rukou psaných číslic: 1↔7↔2, 4↔9↔1, 3↔8↔5, 0↔6, 5↔6. Pokud se obě čtení liší, zvol to, které odpovídá běžnému vzoru (množství 1–30 ks; obal 10/15/20/30/50l = KEG, 1/1,5l = PET, 0,33/0,5l = lahev). Nikdy nevyhoď celý řádek jen proto, že je psaný rukou a hůře čitelný — raději vrať nejpravděpodobnější hodnotu.
0c. raw_text = doslovný přepis CELÉHO textu z fotky, řádek po řádku, v pořadí jako na fotce, VČETNĚ řádků, kterým nerozumíš nebo jsou nečitelné. raw_text NIKDY nezkracuj, neparafrázuj a nevynechávej nečitelné části.

KRITICKÉ POKYNY PRO ČTENÍ TEXTU Z OBRÁZKU:
1. ČTI POZORNĚ každý řádek textu na obrázku — nespěchej, nevynechávej řádky.
2. ČÍSLA čti VELMI POZORNĚ — "5x30" NENÍ "5x50", "10x50" NENÍ "10x30". Rozdíl mezi 3 a 5, 0 a 8, 1 a 7 je kritický.
3. Pokud si nejsi jistý číslem, zkus ho odvodit z kontextu (např. "12sv 5x30" — 30 je objem kegu, 5 je počet).
4. ČTI CELÝ TEXT, ne jen první řádky. Objednávky často pokračují na více řádcích.
5. Pokud je text rozmazaný nebo špatně čitelný, zkus ho přečíst podle kontextu a běžných vzorů objednávek piva.
6. Věnuj zvláštní pozornost JMÉNU ODBĚRATELE — toto jméno je VŽDY napsané v TEXTU objednávky/zprávy (např. "Malesice", "Naseb", "Žižkov", "Seeberg"), často na začátku, v oslovení, nebo v podpisu. NIKDY ho nedoplňuj ze jména odesílatele v hlavičce WhatsApp chatu (to je jen "Pojmi", "Bednář", "Účetní" apod.).
7. Pokud je na obrázku VÍCE WhatsApp oken (více chatů), každé okno má VLASTNÍ hlavičku se jménem — přečti každou hlavičku zvlášť.
8. ČÍSLA OBJEMU (50, 30, 20, 15, 10, 1.5, 1, 0.5, 0.33) jsou KRITICKÁ — špatné přečtení objemu znamená špatný obal (KEG vs. lahev vs. PET).
 9. Pokud je číslo napsané jako "0,5" nebo "0.5" nebo "lahve"/"flašky" bez udání objemu, je to VŽDY skleněná lahev 0.5l ("Lahve 0.5l"). NIKDY to nečti jako 0.33l ani jako "05" nebo "5". ROZLIŠUJ 0,5l A 0,33l! "Lahve 0.33l" vrať POUZE pokud je v textu výslovně napsáno "0,33" nebo "0.33" nebo "třetinka".
10. Pokud je číslo napsané jako "1,5" nebo "1.5", je to VŽDY PET 1.5l.
11. KRITICKÉ — NEPLÉTEJ SI OBJEM A MNOŽSTVÍ! Zápis "20l 1x" znamená OBJEM 20 litrů (KEG 20l) a MNOŽSTVÍ 1 kus. NIKDY to nečti jako "1l 20x" (PET 1l, 20 kusů). Stejně tak "30l 2x" = 2× KEG 30l, NE 30× PET 1l. Číslo s "l" (litr) je VŽDY OBJEM/obal, číslo s "x" nebo "ks" je VŽDY MNOŽSTVÍ. Pokud je na řádku "20l 1x", quantity=1 a package_label="KEG 20l".
12. Pokud je na řádku objem s "l" (např. "20l", "30l", "50l", "1,5l") a zvlášť množství s "x" (např. "1x", "2x", "5x"), přiřaď je SPRÁVNĚ: objem → package_label, množství → quantity. NIKDY je neprohoď.
13. KRITICKÉ — "VŠE [stupeň]" NA KONCI OBJEDNÁVKY: Pokud je na konci objednávky napsáno "vše 11sv", "vse 11sv", "vše 11", "vse 11", "všechno 11sv" apod., znamená to, že VŠECHNY položky v objednávce jsou TOHO STUPNĚ. Např. "2x30 10x50 vše 11sv" = 2× KEG 30l piva 11° světlé A 10× KEG 50l piva 11° světlé. Přiřaď tento stupeň VŠEM položkám objednávky, i když u nich není explicitně napsaný.
14. Pokud je na konci objednávky "vše [stupeň]" (např. "vše 12sv", "vše tmavá", "vše 10"), aplikuj tento stupeň/barvu na VŠECHNY položky v objednávce. NIKDY nenechávej položky bez stupně, pokud je na konci "vše [stupeň]".
15. KRITICKÉ — STUPEŇ NA ZAČÁTKU ŘÁDKU SE APLIKUJE NA VŠECHNY POLOŽKY NA TOM ŘÁDKU: Pokud řádek začíná stupněm (např. "11sv 3x30 3x20 15x1"), platí tento stupeň pro VŠECHNY položky na tom řádku, i když u nich není explicitně napsaný. Příklad: "11sv 3x30 3x20 15x1" = 3× KEG 30l piva 11° světlé, 3× KEG 20l piva 11° světlé, 15× PET 1l piva 11° světlé. Přiřaď tento stupeň VŠEM položkám na řádku.
16. Pokud řádek začíná stupněm (např. "12sv 2x50 1x30"), aplikuj tento stupeň na VŠECHNY položky na tom řádku. NIKDY nenechávej položky bez stupně, pokud řádek začíná stupněm.
17. KRITICKÉ — ROZLIŠUJ "1l" OD "1,5l": "1l" (1 litr) a "1,5l" (1,5 litru) jsou RŮZNÉ objemy. "1l" = PET 1l, "1,5l" = PET 1.5l. NIKDY nezaměňuj "1l" za "1,5l" a naopak. Pokud je na obrázku napsáno "1l" (bez čárky/tečky), je to PET 1l. Pokud je napsáno "1,5l" nebo "1.5l", je to PET 1.5l.
18. POZNÁMKY K OBJEDNÁVCE: Pokud je v objednávce napsáno "(bez etiket)", "bez etiket", "bez etikety" apod., zahrň tento text do raw_line příslušné položky, aby aplikace mohla poznámku automaticky přidat k objednávce. Stejně tak pro "sklo", "výčep", "podtácky", "vrácení lahví" a další poznámky.
19. KRITICKÉ — BEDNY (PŘEPRAVKY) S LAHVEMI: Pokud je v objednávce napsáno "bedna", "bedny", "beden", "přepravka", "přepravky" apod., znamená to přepravku s lahvemi. JEDNA bedna = 20 ks lahví 0.33l. Postup:
   - "1 bedna tmavého" = 20 ks lahví 0.33l tmavého piva (quantity=20, package_label="Lahve 0.33l")
   - "2 bedny tmavého" = 2 × 20 = 40 ks lahví 0.33l tmavého piva (quantity=40, package_label="Lahve 0.33l")
   - "3 bedny 12sv" = 3 × 20 = 60 ks lahví 0.33l piva 12° světlého (quantity=60, package_label="Lahve 0.33l")
   VŽDY vynásob počet beden číslem 20 a výsledek zapiš jako quantity. Obal je VŽDY "Lahve 0.33l". Stupeň/barva piva se určí podle textu (např. "tmavého" = tmavé, "12sv" = 12° světlé).
21. KRITICKÉ — IGNORUJ CITOVANÉ ZPRÁVY A REAKCE VE WHATSAPPU:
   - Ve WhatsApp chatu se při odpovědi zobrazuje CITOVANÁ ZPRÁVA (v přišedlém/odlišeném rámečku nahoře v bublině zprávy, kde je zopakované jméno odesílatele a text původní zprávy).
   - NIKDY neextrahuj položky z CITOVANÉ ZPRÁVY jako novou samostatnou objednávku! Je to jen zopakovaný text původní zprávy.
   - Texty pod citací typu "3x30 čeho", "čeho?", "jaké pivo?", "ok", "platí", "příští týden", "díky" jsou CHATOVÉ DOTAZY/KOMENTÁŘE, NIKOLIV samostatné objednávky. Neextrahuj z nich nové položky.
22. KRITICKÉ — DEDUPLIKACE STEJNÉ OBJEDNÁVKY NA JEDNOM SNÍMKU:
   - Pokud je na fotce/snímku stejný odběratel a stejná položka zmíněna/zopakována vícekrát (např. v původní zprávě a následně v citaci nebo v otázce), VYTVOŘ TUTO POLOŽKU POUZE JEDNOU!


28. KRITICKÉ — STUPEŇ PATŘÍ K TÉ OBJEDNÁVCE, U KTERÉ JE NA FOTCE NAPSANÝ:
   Na fotografii objednávky je často napsáno jen MNOŽSTVÍ + OBAL (např. "2x50" = 2× KEG 50l) a STUPEŇ piva (např. 8, 8°, 8sv) je zapsán zvlášť — pod tím číslem, vedle něj, na stejném řádku/sloupečku, nebo v jeho blízkosti.
   POSTUP:
   1) KE KAŽDÉ položce přiřaď TEN stupeň, který je na obrázku v její BLÍZKÉM okolí (tentýž řádek, sloupec, pod číslem objednávky). Např. stojí-li u čísla "2x50" na stejném místě/sloupei stupňa "8" a níže na fotce je jiný řádek se stupněm "10", pak "2x50" = 2× KEG 50l piva 8° (ne 10°).
   2) NIKDY neber stupeň z JINÉ objednávky/řádku na fotce, jen proto, že je v blízkosti na snímku. Jestliže u "2x50" je zapsáno 8 a jinde (nahoře/dole/vedle) je 10, použij 8 pro tu "2x50" objednávku.
   3) Pokud je stupeň vizuálně u VÍCE položek najednou (tzv. skupinově v hlavičce sloupečku), platí pro všechny položky v tom sloupečku. Pokud je jasně jen u jedné konkrétní položky, platí jen pro ni.
   4) Pokud si stupeň přiřazený ke konkrétní objednávce nevidíš (není ve stejném okolí), ponech degree=null a NEDOSAZUJ ho z jiné objednávky na snímku.

29. KRITICKÉ — KDYŽ OBJEDNÁVKA NEMÁ STUPEŇ, HLEDEJ HO V KONTEXTU ODPOVĚDI; POKUD HO NENAJDEŠ, NECH HO PRÁZDNÝ:
   Stává se, že objednávka je napsaná JEN jako objem: např. "Terasa 2x50" = 2× KEG 50l, ale STUPEŇ/DRUH PIVA v tom řádku není. Pod ní (ve výřezu/pokračování konverzace) může být dotaz a odpověď, která stupeň dodá — např. dotaz účetní "co to je?" a odpověď "8" (znamená 8°).
   POSTUP:
   1) Pokud položka NEMÁ stupeň/beer_name ve svém vlastním řádku, podívej se do KONTEXTU té konverzace (výřez pod zprávou, navazující odpověď/upřesnění). Pokud je v odpovědi jednoznačný stupeň (např. "8" = 8°, "10", "12sv", "11"), DOPLŇ ho k té objednávce → např. "Terasa 2x50" + odpověď "8" = 2× KEG 50l piva 8° (beer_name i degree upřesni podle katalogu).
   2) Odpověď patří TÉ objednávce, ze které/s níž komunikace pokračuje (stejný odběratel, stejné vyslovení). Nesmíš použít stupeň z JINÉ objednávky v jiném okně na fotce.
   3) Rozlišuj pojmy: dotaz/odpověď typu "8" je STUPEŇ piva (8°), ne objem a ne počet sudů. "co to je?"/“jaký druh" se ptá na pivo.
   4) KRITICKÉ — POKUD KONTEXT NENAJDEŠ: když ani po prohledání konverzace kolem položky nenajdeš jednoznačný stupeň/druh piva, PONECHEJ degree=null a beer_name=null (vrať prázdné pole). Aplikace pak nechá druh piva NEVYPLNĚNÝ, aby si ho uživatel dohledal ručně. NIKDY nevymýšlej stupeň a NIKDY ho nedoplňuj z jiné objednávky.



27. KRITICKÉ — ODPOVĚDI NA OBJEDNÁVKU = DOPLNĚNÍ STEJNÉ OBJEDNÁVKY:
   Cháp KONTEXT CELÉHO SNÍMKU, nečti jen řádky tupe, jeden vedle druhého. Ve WhatsApp se na objednávku často ODPOVÍDÁ — pod původní zprávou (citací) je odpověď typu "ještě k tomu 2x 30l", "k tomu přidej 10x 12sv", "a 5x 50l", "budu brát i 20x 0,5", "ke kégům ještě 1x bednu tmavého" apod. Taková odpověď NAVAZUJE na tu PŮVODNÍ zprávu, na kterou reaguje, a není to nová samostatná objednávka!
   POSTUP:
   1) Pokud je na snímku citace/zopakování předchozí objednávky a pod ní odpověď, která jen doplňuje ("ještě", "k tomu", "dále", "a", "přidej", "budu", "chci i", "k těm", "kegům ještě"...), PŘIPOJ tuto odpověď k TÉ PŮVODNÍ objednávce (stejný odběratel + datum + stejné zaslání).
   2) Přiřaď položkám z odpovědi SAMEJM ODBĚRATELE A PROSTŘEDÍ jako z citované/původní zprávy. NIKDY pro ně netvoř jiný place_name ani je nenechávej bez odběratele.
   3) Chybějící informace (stupeň, barva, obal, odběratele) doplněné z původní/citované zprávy, ke které odpověď patří — např. "k tomu ještě 2x 30l" u 12° světlého piva = 2× KEG 30l 12° světlé, stejný odběratel.
   4) Nevytvářej z citace znovu položky, které už v původní objednávce jsou (viz pravidlo 22 o deduplikaci). Ale položky, které odpověď DOPLŇUJE nově, přidej jako další řádky té SAMÉ objednávky (stejného odběratele).
   5) NEPLÉTEJ si zprávy od RŮZNÝCH odběratelů: odpověď patří vždy k té citované/předchozí zprávě, ke které reaguje, ne k jiným chatům na snímku.
   6) KRITICKÉ — ODPOVĚĎ MŮŽE PŮVODNÍ OBJEDNÁVKU I UPRAVIT (NEJEN DOPLNIT): Pokud odpověď na předchozí zprávu OPRAVUJE/UPRAVUJE původní data (např. "těch 2x50 neber, dej 3x50", "místo 12sv chci 11sv", "sudů místo 2 bude 5", "k tomu 2x30 NE, jen 1x20"), pak na základě odpovědi UPRAV počet/obal/stupeň TÉ PŮVODNÍ položky v původní objednávce — ne jen přidej nový řádek. Výsledná objednávka = původní záměr PO spotřebování úprav z odpovědi.
   7) Rozlišení „doplň“ vs „oprav“: slova jako "ještě", "k tomu dod"/"přidej", "a ještě", "budu brát i" = DOPLNĚNÍ (přidej nové položky k téže objednávce). Slova jako "ne", "neber", "místo", "oprav", "změ", "bude 3x", "radši", "jen 1x" = OPRAVA (uprav/ubahon existující položku původní objednávky). Vypočítej výslednou objednávku PO všech úpravách a nevytvářej duplicitní/staré řádky.



23. KRITICKÉ — 50L SUDY:
   - POKUD JE NA FOTCE/OBRÁZKU 50L, 50 L, 50, "VELKÝ SUD", "SUD 50" NEBO "KEG 50", PAK JE OBAL VŽDY "KEG 50l"! NIKDY NEPIŠ "KEG 30l" ANI "30l"!
   - Pokud je u položky uvedeno "50l", "50 l", "50", "velký sud", "sud 50", "keg 50", Obal/package_label MUSÍ BÝT "KEG 50l"! NIKDY to nepiš jako "KEG 30l" ani nenechávej obal prázdný!
25. KRITICKÉ — VYHODNOCENÍ LAHVÍ 20x0,5 A 20x0,33:
   - Pokud je v textu "20x0,5" nebo "20x0.5" nebo "20 ks 0,5l", jde o 20 ks lahví 0,5l (package_label: "Lahve 0.5l")! NIKDY to nepíš jako 0.33l!
   - Pouze pokud je výslovně napsáno "0,33" nebo "0.33" (např. "20x0,33"), použij "Lahve 0.33l".
24. KRITICKÉ — BEDNY / PŘEPRAVKY A KUSY LAHVÍ:
   - 1 bedna (přepravka) = 20 ks lahví!
   - Pokud zákazník objedná např. "6 beden", vypočítej celkový počet kusů lahví: 6 x 20 = 120 ks lahví! Vrať quantity: 120 a package_label: "Lahve 0.5l" (případně "Lahve 0.33l" pokud je v textu explicitně 0.33).
20. KRITICKÉ — RUČNĚ PSANÉ OBJEDNÁVKY: Pokud je objednávka napsaná RUČNĚ (tužkou/perem, ne tiskem), čti ji MIMOŘÁDNĚ POZORNĚ. Ruční písmo je často nečitelné, čísla splývají a čárky/tečky jsou nejasné. Postup:
   - ČÍSLA čti podle TVARU a KONTEXTU: "1" a "7" se v ručním písmu pletou, "0" a "6", "3" a "8", "4" a "9". Pokud si nejsi jistý, zvol číslo, které dává smysl v kontextu objednávky piva (např. objem 30/50/20/15/10, počet 1-20).
   - ČÁRKY A TEČKY: V ručním písmu je čárka/tečka u desetinných čísel často nejasná. "0,5" může vypadat jako "05" nebo "5", "1,5" jako "15". VŽDY zvaž kontext: objem 0.5/0.33 = lahev, 1.5/1 = PET, 10/15/20/30/50 = KEG.
   - Pokud je napsáno jen ",1" nebo "0,1" nebo "1" (s nejasnou čárkou), zvaž, co dává smysl: "1" = PET 1l, "0,1" NENÍ běžný objem piva — pravděpodobně jde o "1l" (PET 1l) nebo "0,5l" (lahev). Nečti ",1" jako objem 0.1l — takový obal neexistuje.
   - NEPLÉTEJ SI OBJEM A MNOŽSTVÍ u ručně psaných čísel: "1x30" = 1× KEG 30l (quantity=1, package="KEG 30l"), NIKDY to nečti jako "30× PET 1l".
   - Pokud je ruční písmo opravdu nečitelné, zkus odvodit z okolních řádků a běžných vzorů objednávek (stejné pivo/obal se často opakuje).
21. KRITICKÉ — ČÍSLO "1" A OBJEM: Pokud je u položky napsáno jen "1" (bez "l", bez "x"), může to znamenat buď MNOŽSTVÍ 1 kus, nebo OBJEM 1 litr (PET 1l). Rozhodni podle kontextu:
   - "1x30" → quantity=1, package="KEG 30l" (1 je množství, 30 je objem)
   - "12sv 1" → quantity=1, package="KEG 30l" (výchozí obal, 1 je množství)
   - "1l" nebo "1 l" → quantity=1, package="PET 1l" (1 je objem)
   - "PET 1" → quantity=1, package="PET 1l"
   - Pokud je "1" u objemu kegu (30/50/20/15/10), je to MNOŽSTVÍ. Pokud je "1" samostatně u piva bez jiného objemu, je to MNOŽSTVÍ 1 kus s výchozím obalem KEG 30l.



KRITICKÉ PRAVIDLO PRO DATUM OBJEDNÁVKY (order_date):
Na obrázku může být napsáno datum objednávky, obvykle ve tvaru "na 7.8", "7.8.", "7.8", "na 7.8.", "7/8", "7. 8." apod. (den.měsíc). Postup:
1. Hledej v textu objednávky datum ve tvaru "na [den].[měsíc]" nebo "[den].[měsíc]" (např. "na 7.8" = 7. srpna, "na 7.8." = 7. srpna, "7.8" = 7. srpna).
2. Pokud najdeš datum, převeď ho na formát YYYY-MM-DD. Rok urči podle kontextu (aktuální rok, pokud není jinak uvedeno). Např. "na 7.8" → "2026-08-07".
3. Toto datum zapiš do pole "order_date" v JSON odpovědi (na úrovni celé odpovědi, ne u jednotlivých položek).
4. DŮLEŽITÉ: Pokud je na fotce VÍCE objednávek (více WhatsApp oken), datum "na [den].[měsíc]" se vztahuje JEN k té objednávce, u které je napsané. Ostatní objednávky bez data dostanou order_date: null.
5. Pokud na obrázku žádné datum není, vrať order_date: null.
6. POZOR: "7.8" NENÍ objem ani množství — je to datum (7. srpna). Nezaměňuj ho s "7x8" (množství) nebo "7l" (objem).
7. KRITICKÉ — DATUM U KAŽDÉ POLOŽKY (pole "date"): Kromě top-level "order_date" zapiš datum i do pole "date" U KAŽDÉ POLOŽKY (item), ke které patří. Postup:
   - Pokud je na fotce VÍCE objednávek (více WhatsApp oken) a jen jedna z nich má napsané datum (např. "na 7.8"), pak položky TÉ objednávky dostanou date="2026-08-07" a položky OSTATNÍCH objednávek (bez data) dostanou date=null.
   - Pokud je na fotce jen jedna objednávka s datem, všechny její položky dostanou toto datum.
   - Pokud žádné datum není, date=null u všech položek.
   - Toto per-položkové "date" je NEJDŮLEŽITĚJŠÍ pro správné rozdělení objednávek — aplikace podle něj přiřadí datum každé objednávce zvlášť.


DŮLEŽITÉ: NA JEDNÉ FOTCE MŮŽE BÝT VÍCE OBJEDNÁVEK (VÍCE WHATSAPP OKEN)

Screenshot z WhatsApp často obsahuje VÍCE chatovacích oken od RŮZNÝCH odběratelů naskládaných pod sebou. Každé okno = JEDNA samostatná objednávka od JINÉHO odběratele. Musíš:
1. Rozpoznat hranice mezi jednotlivými WhatsApp okny (obvykle je odděluje hlavička se jménem kontaktu, časové razítko, nebo vizuální předěl).
2. Každé okno přiřadit k JEHO VLASTNÍMU odběrateli (place_name) podle jména odběratele NAPSANÉHO V TEXTU toho okna (ne podle jména odesílatele v hlavičce).
3. Položky z RŮZNÝCH oken MUSÍ mít RŮZNÉ place_name — nikdy neslučuj objednávky od různých odběratelů do jedné.
4. place_name se "dědí" odshora dolů UVNITŘ jednoho okna — dokud nenarazíš na hlavičku nového okna s jiným odběratelem, všechny řádky patří k aktuálnímu odběrateli. Jakmile se objeví nové okno/jméno, přepni se na nového odběratele.

DŮLEŽITÉ: ROZDĚLENÍ NA JEDNOTLIVÉ POLOŽKY
Pokud je na jednom řádku více položek oddělených slovem "a" (např. "Seeberg 4x30 12sv a 2x30 12sv"), ROZDĚL je na SAMOSTATNÉ položky:
- První položka: quantity=4, package_label="KEG 30l", beer_name=12° světlé, place_name="Seeberg"
- Druhá položka: quantity=2, package_label="KEG 30l", beer_name=12° světlé, place_name="Seeberg"
Obě položky mají stejného odběratele (place_name) a stejný raw_line.

KRITICKÉ PRAVIDLO PRO ROZDĚLENÍ POLOŽEK SE SLOVEM "a":
Pokud řádek obsahuje slovo "a" mezi dvěma objednávkovými vzory (např. "2x50 12sv a 2x50 vosma"), MUSÍŠ ho rozdělit na DVA samostatné items:
- "2x50 12sv a 2x50 vosma" → item 1: quantity=2, package_label="KEG 50l", beer_name=12° světlé; item 2: quantity=2, package_label="KEG 50l", beer_name=8° (vosma)
- "4x30 12sv a 2x30 12sv" → item 1: quantity=4, package_label="KEG 30l", beer_name=12° světlé; item 2: quantity=2, package_label="KEG 30l", beer_name=12° světlé
- "3x20 tmava a 1x20 12sv" → item 1: quantity=3, package_label="KEG 20l", beer_name=12° tmavé; item 2: quantity=1, package_label="KEG 20l", beer_name=12° světlé
NIKDY neslučuj dvě různé položky do jedné, i když jsou na stejném řádku. Každá položka s vlastním množstvím, pivem a obalem = SAMOSTATNÝ item.


KRITICKÉ PRAVIDLO PRO ODBĚRATELE (place_name):
Níže je seznam "ZNÁMÍ ODBĚRATELÉ" — to jsou VŠICHNI existující odběratelé. MUSÍŠ každý řádek objednávky přiřadit k některému z nich, pokud to je alespoň trochu možné. Postup:
1. Podívej se na text v obrázku (tělo a záhlav�KRITICKÉ PRAVIDLO PRO JMÉNO ODBĚRATELE (ODBĚRATEL JE VŽDY V TEXTU ZPRÁVY):
1. JMÉNO ODBĚRATELE JE VŽDY NAPSÁNO PŘÍMO V TEXTU OBJEDNÁVKY / ZPRÁVY (např. "Naseb", "Malesice", "Žižkov", "Seeberg", "Lokálka", "U Zajíce", "U Labutě"). Je napsané stejnou barvou a písmenem jako zbytek objednávkové zprávy.
2. ODESÍLATELÉ ZPRÁV V HLAVIČCE WHATSAPP jako "Pojmi", "Bednář", "Bendat", "Gábina účetní", "Gábina", "Účetní" JSOU POUZE ODESÍLATELÉ (předávají nebo posílají zprávy z telefonu), NIKOLIV ODBĚRATELE! NIKDY nepoužívej tato jména odesílatelů jako place_name!
3. VŽDY hledej název odběratele / hospody V TEXTU ZPRÁVY (tělo zprávy):
   - Může být na začátku řádku nebo před objednávkou (např. "Naseb 2x50", "Malesice 5x30 12sv", "Žižkov 3x50")
   - Může být uveden jako "pro [odběratel]", "na [odběratel]", "do [odběratel]" (např. "pro Naseb", "do Malesic", "na Žižkov")
   - Může být samostatně v textu zprávy stejným písmem
4. Pokud je v textu zprávy napsáno "Lokálka 10x50", place_name = "Lokálka" (z textu). I kdyby byl v hlavičce WhatsApp odesílatel "Petr Bednář" nebo "Pojmi" nebo "Gábina", VŽDY má přednost název odběratele z textu zprávy!
5. Seznam "ZNÁMÍ ODBĚRATELÉ" níže obsahuje existující odběratele. Pokud text v zprávy odpovídá byť i přibližně (překlep, OCR šum) některému z nich, POUŽIJ PŘESNÝ NÁZEV ze seznamu.
6. NIKDY nepoužívej jako place_name: "Pojmi", "Bednář", "Bendat", "Gábina", "Gábina účetní", "Účetní", "WhatsApp", "Pivovar", "Zajíc", "Dnes", "Včera".
7. Pokud NELZE z textu zprávy určit žádného odběratele ani po porovnání se ZNÁMÍ ODBĚRATELÉ, vrať null.
   PŘÍKLAD: i když je v hlavičce WhatsApp napsáno "Petr Bednář", ale v textu objednávky je "pro Lukase", place_name = "Lukas" (jméno z textu). VŽDY hledej jméno odběratele v textu NEJDŘÍV a dej mu přednost před hlavičkou WhatsApp.
4. Pokud je v textu objednávky napsáno "pro [jméno]" nebo "do [jméno]" nebo "na [jméno]", použij toto jméno jako place_name (má přednost i před jménem z hlavičky WhatsApp — viz pravidlo 3b).


5. NIKDY nepoužívej jako place_name název piva, objem kegu, nebo jiné údaje o objednávce (např. "10x50", "KEG 30l", "12sv").
6. Pokud je v textu objednávky napsáno "Lokálka Říčany 10x50" — "Lokálka Říčany" je NÁZEV HOSPODY (odběratel), "10x50" je objednávka (10× KEG 50l). place_name = "Lokálka Říčany".
7. JMÉNO ODESÍLATELE Z HLAVIČKY WHATSAPP (např. "Petr Bednář", "Pojmi", "Bednář", "Účetní") NIKDY nepoužívej jako place_name. VŽDY platí jen jméno odběratele z TEXTU OBJEDNÁVKY.
8. Pokud je v textu objednávky napsáno "Lokálka Říčany" a NENÍ tam žádné jméno osoby, place_name = "Lokálka Říčany".
9. VŽDY přiřaď place_name ke KAŽDÉ položce — nikdy nenechávej place_name null, pokud můžeš odvodit odběratele z TEXTU OBJEDNÁVKY. Odběratele NIKDY neodvozuj z hlavičky WhatsApp (kdo zprávu poslal).



KAŽDÁ položka objednávky má:
- quantity: počet kusů (číslo)
- degree: stupeň piva jako text např. "10°", "11°", "12°", "13°" (pokud recognizable)
- beer_name: NÁZEV PIVA PŘESNĚ TAK, JAK JE V KATALOGU NÍŽE (viz "DOSTUPNÁ PIVA V KATALOGU"). VELMI DŮLEŽITÉ POŘADÍ POSTUPU:
  1) Nejprve zkontroluj NAUČENÉ ZKRATKY PRO PIVA níže — pokud text odpovídá byť jen přibližně/foneticky některé z nich, POUŽIJ PŘESNĚ ten namapovaný název piva.
  2) Pokud žádná naučená zkratka nesedí, porovnej text se seznamem DOSTUPNÁ PIVA V KATALOGU níže a najdi NEJBLIŽŠÍ SHODU (podle stupně/barvy/zkratky/překlepu) — vždy upřednostni existující položku z katalogu před vymýšlením vlastního názvu.
  3) Teprve pokud text opravdu neodpovídá ničemu z katalogu ani naučeným zkratkám, vrať null — nikdy nevymýšlej název, který v katalogu není.

  ROZPOZNÁVÁNÍ STUPNĚ/DRUHU PIVA — velmi časté zkratky a jejich význam (piš je i s překlepy, OCR šumem apod.):

  - "8", "8°", "vosmička", "osmička", "cyklo", "cykloosma" → stupeň 8°
  - "10", "10°", "desítka", "10sv", "světlé výčepní", "svetle vcepni" → stupeň 10°, světlé
  - "11", "11°", "11sv", "jedenáctka", "jedenactka" → stupeň 11°, světlé
  - "12sv", "ležák", "lezak", "světlý", "svetly", "světlý ležák", "svetly lezak", "ležák světlý" (bez slova "tmavý/tmavy") → stupeň 12°, světlé
  - "tmavý", "tmavy", "tmavý ležák", "tmavy lezak", "12tm", "tm" → stupeň 12°, tmavé
  - "13", "13°" → stupeň 13°
  - "Jantar", "Summer", "Hazy", "Bunny" a podobné vlastní názvy piv — pokud se objeví v textu, jde o KONKRÉTNÍ NÁZEV piva z katalogu, ne o stupeň — najdi v katalogu pivo s odpovídajícím názvem.
  - KRITICKÉ — "JANTAR": Pokud se v textu objeví "jantar", "jant", "jantar 12", "12 jantar", "12jantar" atd., VŽDY to znamená pivo s názvem "Jantar" (konkrétní pivo z katalogu), NIKDY NE 12° světlý ležák. Číslo "12" před/za slovem "jantar" NEoznačuje 12° světlé pivo — patří k názvu "Jantar" (zákazníci tak běžně zapisují). VŽDY použij beer_name = přesný název "Jantar" z katalogu. Stejně tak "jantarek" = Jantar.
  - "sv l", "svetle l", "svetly l", "světlé l", "sv l" → SVĚTLÉ pivo (12° Světlá / Světlý ležák) v KEG 30l (výchozí obal, když je jen "l" = litr/sud). quantity=null (množství není napsané).
  - "vycep", "výčep", "výčepní", "vycepni", "svetle vycepni", "světlé výčepní" → 10° výčepní pivo (Desítka), světlé. quantity=null (množství není napsané).
  - "tmave l", "tmavy l", "tmavé l", "tm l" → TMAVÉ pivo (12° Tmavá) v KEG 30l. quantity=null.
  Pokud text jasně neodpovídá žádnému z výše uvedených vzorů ani položce v katalogu, NEHÁDEJ — vrať beer_name: null, ať si to uživatel doplní ručně.

- package_label: obal — jeden z těchto: KEG 50l, KEG 30l, KEG 20l, KEG 15l, KEG 10l, Lahve 0.5l, Lahve 0.33l, PET 1.5l, PET 1l, sud 30l, sud 50l.

  ROZPOZNÁVÁNÍ OBALU — na objednávkách se typ obalu (KEG/lahev/PET) téměř nikdy nepíše slovem, pozná se PODLE ČÍSLA OBJEMU u položky:
  - Objem 50, 30, 20, 15 nebo 10 (litrů) → VŽDY sud/KEG s daným objemem (KEG 50l, KEG 30l, KEG 20l, KEG 15l, KEG 10l) — bez ohledu na to, jestli je u čísla napsáno slovo "keg", "sud", nebo jen holé číslo (např. "12sv 5x30" = 5× KEG 30l piva 12° světlé).
  - Objem 1.5 nebo 1 (litr) → VŽDY PET (PET 1.5l, PET 1l).
  - Objem 0.5 nebo 0.33 (litru) → VŽDY skleněná lahev (Lahve 0.5l, Lahve 0.33l). Pokud je v textu "0,5" nebo "0.5" (s čárkou nebo tečkou), VŽDY to znamená skleněnou lahev 0.5l — NIKDY to neinterpretuj jako KEG nebo PET.

  - Pokud je v textu explicitní slovo, které jasně odporuje výše uvedenému výchozímu odhadu (např. jasně napsáno "lahev 1l" nebo "PET 0.5l"), dej přednost tomu, co je NAPSANÉ SLOVEM.
  - Pokud u položky NENÍ uvedeno žádné číslo objemu ani slovo popisující obal, ale je jasné, že jde o objednávku sudů/kegů (typicky pivovar dodává pivo v kegu), VRAŤ package_label: "KEG 30l" jako rozumný výchozí obal. Většina objednávek pivovaru je v KEG 30l, takže když není objem napsaný, je to nejpravděpodobnější volba. Uživatel si ho může v aplikaci snadno změnit.
  - Pokud je jasné, že jde o lahve (slovo "lahve", "flašky", "ks" u malých objemů) → vrať "Lahve 0.5l".
  - Pokud je jasné, že jde o PET (slovo "pet", "petka") → vrať "PET 1l".
  - DŮLEŽITÉ: package_label by měl být vyplněn u VŠECH položek. Vrať null JEN pokud opravdu nejde určit vůbec nic (např. jen samotný název piva bez jakéhokoli náznaku obalu a bez kontextu).


- raw_line: přesný text řádku jak ho vidíš na obrázku
- place_name: název odběratele / místa dodání. VELMI DŮLEŽITÉ — objednávky často uvádí odběratele JEN JEDNOU, u úplně prvního řádku nebo v záhlaví/podpisu zprávy, a další řádky pod ním už žádné jméno odběratele neopakují. V takovém případě MUSÍŠ stejného odběratele přiřadit i všem následujícím položkám, dokud se v textu neobjeví jiný/nový odběratel (pak se přepni na nového a opět ho "děduj" dolů). Jinými slovy: place_name se v datech "táhne" odshora dolů, dokud ho něco nepřepíše. JMÉNO ODBĚRATELE HLEDEJ VŽDY V TEXTU OBJEDNÁVKY (tělo zprávy): v oslovení, podpisu, názvu restaurace/hospody, jméně napsaném samostatně. Nikdy ho nehledej v hlavičce WhatsApp ani ve jméně kontaktu (ten je jen odesílatel). Pokud znáš seznam UŽ EXISTUJÍCÍCH odběratelů (viz níže "ZNÁMÍ ODBĚRATELÉ") a text v obrázku jen přibližně/foneticky/s překlepem odpovídá jednomu z nich, POUŽIJ PŘESNĚ ten název ze seznamu (stejná diakritika, velká/malá písmena), ne vlastní přepis. Pokud opravdu nelze určit žádného odběratele, vrať null.
- bbox: ohraničující obdélník TOHOTO ŘÁDKU na obrázku, v PROCENTECH (0-100) vzhledem k CELKOVÉ šířce (x) a výšce (y) obrázku. Postupuj takto:
  1) Představ si na obrázku mřížku 0-100 po ose x (zleva doprava) a 0-100 po ose y (shora dolů).
  2) Najdi řádek s touto položkou objednávky a urči, na kolika procentech výšky obrázku (y) se nachází HORNÍ okraj textu tohoto řádku (y0) a na kolika procentech DOLNÍ okraj (y1).
  3) Stejně urči x0 (levý okraj textu řádku) a x1 (pravý okraj textu, kam text sahá — nemusí to být celá šířka obrázku, pokud text nezabírá celou šířku).
  4) Přidej malou rezervu cca 1-2 % na každou stranu, aby výřez nebyl useknutý, ale zbytečně velkou rezervu nepřidávej.
  5) Buď co nejpřesnější — tato souřadnice se použije pro automatické oříznutí a zobrazení uživateli, takže musí odpovídat SKUTEČNÉ poloze řádku na obrázku, ne jen přibližně kdekoliv v textu.
  Pokud je obrázek na výšku a obsahuje víc řádků pod sebou, y0/y1 pro každý řádek musí být RŮZNÉ a v pořadí, jak jdou řádky pod sebou (řádek níže na obrázku = vyšší y0). Pokud opravdu nejde odhadnout, vrať null.

DOSTUPNÁ PIVA V KATALOGU (id: název (stupeň)):
${beerList}

DOSTUPNÉ OBALY V KATALOGU (id: label):
${pkgList}

ZNÁMÍ ODBĚRATELÉ (použij přesně tento název, pokud text odpovídá byť jen přibližně):
${placesList}

NAUČENÉ ZKRATKY PRO PIVA (text v objednávce → skutečný název piva; uživatel tyto opravy ručně potvrdil v minulosti, ber je jako velmi spolehlivé):
${beerAliasList}

NAUČENÉ ZKRATKY PRO OBALY (text v objednávce → skutečný obal):
${pkgAliasList}

NAUČENÉ ALIASY ODBĚRATELŮ (špatný název z fotky → správný název; uživatel tyto opravy ručně potvrdil v minulosti, ber je jako VELMI spolehlivé — pokud text v obrázku odpovídá "špatnému názvu" z tohoto seznamu, POUŽIJ PŘESNĚ "správný název"):
${placeAliasList}

PRAVIDLA:
- "10 x 10" znamená 10× pivo 10° (NE 10× KEG 10l)
- stupeň (10°, 11°, 12°) je vlastnost piva, NE objem kegu
- "KEG", "sud", "keg" znamená sud — zkus určit objem (50l, 30l, 20l, 15l, 10l)
- "lahve", "ks", "flašky" znamená lahve (obvykle 0.5l nebo 0.33l)
- Objemy 50/30/20/15/10 (litrů) VŽDY znamenají KEG/sud daného objemu, i bez slova "keg"/"sud".
- Objemy 1.5 a 1 (litr) VŽDY znamenají PET.
- Objemy 0.5 a 0.33 (litru) VŽDY znamenají skleněnou lahev.
- Pokud u položky není žádný údaj o objemu/obalu, ale jde o objednávku piva, vrať výchozí "KEG 30l" (viz pravidla výše). package_label vyplň u VŠECH položek.


- Pokud řádek není položka objednávky (pozdrav, podpis, datum), NEZAHRNUJ ho
- Pokud quantity chybí, vrať null
- Buď tolerantní k překlepům a OCR šumu (např. "Sox" = 5x, "tox" = 10x)
- Nejprve zkontroluj NAUČENÉ ZKRATKY výše — pokud text řádku obsahuje některou z nich, použij namapovaný název piva/obalu přímo, i když by se ti bez ní zdál nejednoznačný.
- place_name se dědí odshora dolů (viz vysvětlení výše u place_name) — nikdy nenechávej null jen proto, že řádek sám o sobě jméno neobsahuje, pokud ho lze odvodit z předchozích řádků textu zprávy. NIKDY neodvozuj place_name z jména odesílatele v hlavičce WhatsApp.
- OBECNÉ PRAVIDLO PRO CELÝ VÝSTUP: u beer_name i place_name VŽDY nejprve zkus najít shodu v existujících datech (KATALOG PIV / NAUČENÉ ZKRATKY / ZNÁMÍ ODBĚRATELÉ) — i při nepřesné, fonetické nebo překlepové shodě. Teprve když opravdu nic z existujících dat neodpovídá, ber to jako nové/neznámé (u piva vrať null, u odběratele vrať text tak, jak jsi ho přečetl). Nikdy nepřepisuj/nenahrazuj existující známou položku vlastním vymyšleným textem, pokud shoda s katalogem/seznamem je rozumně možná.



Vrať ČISTĚ JSON (bez markdown, bez \`\`\`), přesně v tomto formátu, a nic jiného:
{"items":[{"quantity":4,"degree":"12°","beer_name":"12° Světlá","package_label":"KEG 50l","raw_line":"Seeberg 4x30 12sv a 2x30 12sv","place_name":"Seeberg","date":"2026-08-07","bbox":{"x0":5,"y0":12,"x1":80,"y1":18}},{"quantity":2,"degree":"12°","beer_name":"12° Světlá","package_label":"KEG 30l","raw_line":"Seeberg 4x30 12sv a 2x30 12sv","place_name":"Seeberg","date":"2026-08-07","bbox":{"x0":5,"y0":18,"x1":80,"y1":24}}],"order_date":"2026-08-07","place_name":"Seeberg","raw_text":"celý rozpoznaný text"};


DŮLEŽITÉ — TOP-LEVEL "place_name":
Do odpovědi VŽDY přidej i top-level pole "place_name" (na úrovni celé odpovědi, vedle "items" a "order_date"). Toto pole = JMÉNO ODBĚRATELE, který je na fotce NEJVÝRAZNĚJŠÍ / první / hlavní (obvykle první WhatsApp okno nahoře). Pokud je na fotce více odběratelů, top-level place_name = ten první/nejvýraznější. Pokud nelze určit žádného, vrať null. Toto pole je důležité, protože aplikace ho použije pro vytvoření nové objednávky.
`;





    const anthropicBody = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
    };


    let text = "";
    let isOpenAiUsed = false;

    // 1) Primární provider: Google Gemini (nativní JSON mode, vision).
    //    Gemini má velkorysé rate limity a čtení funguje bez Anthropic kreditů.
    //    Pozn.: "gemini-2.5-flash" už Google nezpřístupňuje novým klíčům (HTTP 404),
    //    proto používáme gemini-3.5-flash (GA, stejná kategorie flash).
    if (!text && geminiKey) {
      try {
        const geminiBody = {
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { text: "Toto je fotka objednávky piva. Přečti ji přesně podle instrukcí a vrať JSON." },
                {
                  inline_data: {
                    mime_type: imageMimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        };

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const geminiResp = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(geminiBody),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          text =
            geminiData?.candidates?.[0]?.content?.parts
              ?.map((p: any) => p.text || "")
              .join("") ?? "";
        } else {
          const errText = await geminiResp.text();
          console.warn(`Gemini API error (status ${geminiResp.status}): ${errText}`);
        }
      } catch (err) {
        console.warn(`Gemini API exception: ${err}`);
      }
    }

    // 2) Fallback k Anthropic
    if (apiKey) {
      try {
        const anthropicUrl = "https://api.anthropic.com/v1/messages";
        const anthropicResp = await fetch(anthropicUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(anthropicBody),
        });

        if (anthropicResp.ok) {
          const anthropicData = await anthropicResp.json();
          text = anthropicData?.content?.[0]?.text ?? "";
        } else {
          const errText = await anthropicResp.text();
          console.warn(`Anthropic API error (status ${anthropicResp.status}): ${errText}`);
        }
      } catch (err) {
        console.warn(`Anthropic API exception: ${err}`);
      }
    }

    // Fallback k OpenAI (Vision API)
    if (!text && openaiKey) {
      isOpenAiUsed = true;
      const openaiBody = {
        model: "gpt-4o",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: prompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Here is the image of the order. Please parse it according to the instructions.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      };

      const openaiUrl = "https://api.openai.com/v1/chat/completions";
      const openaiResp = await fetch(openaiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify(openaiBody),
      });

      if (!openaiResp.ok) {
        const errText = await openaiResp.text();
        return new Response(
          JSON.stringify({ error: `LLM service failed. OpenAI API error (${openaiResp.status}): ${errText}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const openaiData = await openaiResp.json();
      text = openaiData?.choices?.[0]?.message?.content ?? "";
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Failed to get response from any LLM provider (Gemini, Anthropic, OpenAI)" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Strip any stray markdown fences just in case.
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    // Claude sometimes wraps JSON with leading/trailing prose; try to extract the JSON object.
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    let parsed: AiResponse;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If JSON parse fails, return the raw text so frontend can show it
      parsed = { items: [], raw_text: text };
    }

    // 🧹 Deduplikace odpovědi — každou objednávku přečtenou z fotky vrátit jen jednou.
    if (Array.isArray(parsed.items)) {
      parsed.items = dedupeItems(parsed.items);
    }

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
