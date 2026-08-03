import { createClient } from "npm:@supabase/supabase-js@2";

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
  date: string | null;
}

interface WhatsAppMessageHint {
  sender: string | null;
  date: string | null;
  text: string;
}

interface AiResponse {
  items?: OrderItem[];
  raw_text?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: secretRow, error: secretErr } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", "ANTHROPIC_API_KEY")
      .maybeSingle();

    const apiKey = secretRow?.value;
    if (secretErr || !apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured in app_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const rawText: string | undefined = body.rawText;
    const beers: { id: string; name: string; degree: string }[] = body.beers ?? [];
    const packages: { id: string; label: string }[] = body.packages ?? [];
    const places: string[] = body.places ?? [];
    const aliases: { alias_text: string; beer_name: string | null; package_label: string | null }[] = body.aliases ?? [];
    const placeAliases: { wrong_name: string; correct_name: string }[] = body.placeAliases ?? [];
    const messages: WhatsAppMessageHint[] = body.messages ?? [];

    if (!rawText || !rawText.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing rawText" }),
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

    // Sestav seznam rozpoznaných zpráv (odesílatel + datum) jako silný hint pro AI.
    // Každá zpráva z WhatsApp exportu má svého odesílatele — to je nejspolehlivější
    // zdroj pro určení odběratele (place_name) každé položky.
    const messagesList = messages.length
      ? messages
          .map((m, i) => {
            const sender = m.sender ? `Odesílatel: "${m.sender}"` : "Odesílatel: (neznámý)";
            const date = m.date ? `, datum: ${m.date}` : "";
            const preview = m.text.replace(/\s+/g, " ").slice(0, 120);
            return `Zpráva ${i + 1}: ${sender}${date}\n  Obsah: "${preview}"`;
          })
          .join("\n")
      : "(žádné rozpoznané zprávy — text nebyl rozdělen na jednotlivé zprávy)";

    const prompt = `Jsi asistent pro pivovar. Níže je text objednávky piva z WhatsApp (může to být celý měsíc konverzace od VÍCE odběratelů).
Přečti VŠECHNY objednávky a vrať je jako strukturovaná data. NIKDY nevynechávej žádnou položku objednávky — i když si nejsi jistý, vrať ji s tím, co jsi rozpoznal, a nech neznámé hodnoty jako null.

KRITICKÉ POKYNY PRO ČTENÍ TEXTU:
1. ČTI POZORNĚ každý řádek textu — nespěchej, nevynechávej řádky.
2. ČÍSLA čti VELMI POZORNĚ — "5x30" NENÍ "5x50", "10x50" NENÍ "10x30". Rozdíl mezi 3 a 5, 0 a 8, 1 a 7 je kritický.
3. Pokud si nejsi jistý číslem, zkus ho odvodit z kontextu (např. "12sv 5x30" — 30 je objem kegu, 5 je počet).
4. ČTI CELÝ TEXT, ne jen první řádky. Objednávky často pokračují na více řádcích.
5. Věnuj zvláštní pozornost JMÉNU ODBĚRATELE — obvykle je v hlavičce zprávy, v oslovení, nebo v podpisu.
6. ČÍSLA OBJEMU (50, 30, 20, 15, 10, 1.5, 1, 0.5, 0.33) jsou KRITICKÁ — špatné přečtení objemu znamená špatný obal (KEG vs. lahev vs. PET).
 7. Pokud je číslo napsané jako "0,5" nebo "0.5", je to VŽDY skleněná lahev 0.5l — nikdy to nečti jako "05" nebo "5".
 8. Pokud je číslo napsané jako "1,5" nebo "1.5", je to VŽDY PET 1.5l.
 9. KRITICKÉ — NEPLÉTEJ SI OBJEM A MNOŽSTVÍ! Zápis "20l 1x" znamená OBJEM 20 litrů (KEG 20l) a MNOŽSTVÍ 1 kus. NIKDY to nečti jako "1l 20x" (PET 1l, 20 kusů). Stejně tak "30l 2x" = 2× KEG 30l, NE 30× PET 1l. Číslo s "l" (litr) je VŽDY OBJEM/obal, číslo s "x" nebo "ks" je VŽDY MNOŽSTVÍ. Pokud je na řádku "20l 1x", quantity=1 a package_label="KEG 20l".
10. Pokud je na řádku objem s "l" (např. "20l", "30l", "50l", "1,5l") a zvlášť množství s "x" (např. "1x", "2x", "5x"), přiřaď je SPRÁVNĚ: objem → package_label, množství → quantity. NIKDY je neprohoď.
11. KRITICKÉ — "VŠE [stupeň]" NA KONCI OBJEDNÁVKY: Pokud je na konci objednávky napsáno "vše 11sv", "vse 11sv", "vše 11", "vse 11", "všechno 11sv" apod., znamená to, že VŠECHNY položky v objednávce jsou TOHO STUPNĚ. Např. "2x30 10x50 vše 11sv" = 2× KEG 30l piva 11° světlé A 10× KEG 50l piva 11° světlé. Přiřaď tento stupeň VŠEM položkám objednávky, i když u nich není explicitně napsaný.
12. Pokud je na konci objednávky "vše [stupeň]" (např. "vše 12sv", "vše tmavá", "vše 10"), aplikuj tento stupeň/barvu na VŠECHNY položky v objednávce. NIKDY nenechávej položky bez stupně, pokud je na konci "vše [stupeň]".
13. KRITICKÉ — STUPEŇ NA ZAČÁTKU ŘÁDKU SE APLIKUJE NA VŠECHNY POLOŽKY NA TOM ŘÁDKU: Pokud řádek začíná stupněm (např. "11sv 3x30 3x20 15x1"), platí tento stupeň pro VŠECHNY položky na tom řádku, i když u nich není explicitně napsaný. Příklad: "11sv 3x30 3x20 15x1" = 3× KEG 30l piva 11° světlé, 3× KEG 20l piva 11° světlé, 15× PET 1l piva 11° světlé. Přiřaď tento stupeň VŠEM položkám na řádku.
14. Pokud řádek začíná stupněm (např. "12sv 2x50 1x30"), aplikuj tento stupeň na VŠECHNY položky na tom řádku. NIKDY nenechávej položky bez stupně, pokud řádek začíná stupněm.
15. KRITICKÉ — ROZLIŠUJ "1l" OD "1,5l": "1l" (1 litr) a "1,5l" (1,5 litru) jsou RŮZNÉ objemy. "1l" = PET 1l, "1,5l" = PET 1.5l. NIKDY nezaměňuj "1l" za "1,5l" a naopak. Pokud je napsáno "1l" (bez čárky/tečky), je to PET 1l. Pokud je napsáno "1,5l" nebo "1.5l", je to PET 1.5l.
16. POZNÁMKY K OBJEDNÁVCE: Pokud je v objednávce napsáno "(bez etiket)", "bez etiket", "bez etikety" apod., zahrň tento text do raw_line příslušné položky, aby aplikace mohla poznámku automaticky přidat k objednávce. Stejně tak pro "sklo", "výčep", "podtácky", "vrácení lahví" a další poznámky.







KRITICKÉ PRAVIDLO PRO CELÝ MĚSÍC KONVERZACE:
Text může obsahovat objednávky od VÍCE odběratelů v RŮZNÝCH dnech. Každá zpráva má časové razítko (např. "[12:00, 1.1.2026]") a jméno odesílatele. Postup:
1. ROZDĚL text na jednotlivé zprávy podle časových razítek.
2. Pro KAŽDOU zprávu urči odběratele (place_name) podle jména odesílatele (kontakt v WhatsApp).
3. Pro KAŽDOU položku urči datum (date) z časového razítka té zprávy, ve které se nachází.
4. Pokud stejný odběratel poslal objednávky v RŮZNÝCH dnech, vytvoř SAMOSTATNÉ položky pro každý den (každá s vlastním date).
5. NIKDY neslučuj objednávky od stejného odběratele z různých dnů do jedné.
6. NIKDY nevynechávej položky jen proto, že se opakují — každá objednávka v jiný den je samostatná.

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
Níže je seznam "ZNÁMÍ ODBĚRATELÉ" — to jsou VŠICHNI existující odběratelé. MUSÍŠ každou objednávku přiřadit k některému z nich, pokud to je alespoň trochu možné. Postup:
1. Podívej se na text zprávy (jméno WhatsApp kontaktu, oslovení, podpis, název hospody/restaurace v textu).
2. Porovnej ho se seznamem ZNÁMÍ ODBĚRATELÉ — hledej PŘIBLIŽNOU shodu (podobná výslovnost, možné překlepy).
3. PŘÍKLADY očekávaného chování:
   - Text "Seeberg" nebo "seeger" nebo "zeeburg" → odběratel "Seeberg" (pokud je v seznamu)
   - Text "U Labute" nebo "u labute" nebo "labut" → odběratel "U Labutě" (pokud je v seznamu)
   - Text "Malesice" nebo "malessice" → odběratel "Malesice" (pokud je v seznamu)
   - Text "U Zajice" nebo "zajic" → odběratel "U Zajíce" (pokud je v seznamu)
4. Pokud text obsahuje slovo, které se podobá některému známému odběrateli (i když je zkomolené), POUŽIJ PŘESNÝ název ze seznamu.
5. place_name se "dědí" odshora dolů — pokud první řádek patří k odběrateli X, všechny následující řádky patří k X, dokud se neobjeví jiný odběratel.
6. Pokud je v textu VÍCE odběratelů (celý měsíc konverzace), přiřaď každou položku správnému odběrateli podle toho, kdo ji poslal.

KRITICKÉ PRAVIDLO PRO JMÉNO ODBĚRATELE (OSOBNÍ JMÉNO vs. NÁZEV HOSPODY):
DŮLEŽITÉ: Odběratel může být JAK NÁZEV HOSPODY/RESTAURACE, TAK I JMÉNO OSOBY (např. "Petr Bednář", "Jana Nováková"). Postup:
1. Pokud je v textu objednávky JMÉNO OSOBY (křestní jméno + příjmení, nebo jen křestní jméno), použij ho jako place_name PŘESNĚ TAK, JAK JE NAPSANÉ.
2. Pokud je v textu objednávky NÁZEV HOSPODY (např. "Lokálka Říčany", "U Zajíce", "Restaurace U Labutě"), použij ho jako place_name.
3. Pokud je v textu JAK název hospody, TAK i jméno osoby (např. "Lokálka Říčany" v textu objednávky a "Petr Bednář" jako odesílatel zprávy), POUŽIJ JMÉNO OSOBY jako place_name — to je odběratel, který objednávku posílá.
4. Pokud je v textu objednávky napsáno "pro [jméno]" nebo "do [jméno]" nebo "na [jméno]", použij toto jméno jako place_name.
5. NIKDY nepoužívej jako place_name název piva, objem kegu, nebo jiné údaje o objednávce (např. "10x50", "KEG 30l", "12sv").
6. Pokud je v textu objednávky napsáno "Lokálka Říčany 10x50" — "Lokálka Říčany" je NÁZEV HOSPODY (odběratel), "10x50" je objednávka (10× KEG 50l). place_name = "Lokálka Říčany".
7. Pokud je odesílatel zprávy "Petr Bednář" a v textu objednávky "Lokálka Říčany 10x50", place_name = "Petr Bednář" (jméno odesílatele je odběratel).
8. Pokud je v textu objednávky napsáno "Lokálka Říčany" a NENÍ tam žádné jméno osoby, place_name = "Lokálka Říčany".
9. VŽDY přiřaď place_name ke KAŽDÉ položce — nikdy nenechávej place_name null, pokud můžeš odvodit odběratele z textu, odesílatele, nebo kontextu.

NEJDŮLEŽITĚJŠÍ VODÍTKO — ROZPOZNANÉ ZPRÁVY S ODESÍLATELEM:

Níže je seznam "ROZPOZNANÉ ZPRÁVY" — každá zpráva z WhatsApp exportu má svého ODESÍLATELE (jméno kontaktu, které je obvykle název hospody/odbytiště) a DATUM. Toto je NEJSPOLEHLIVĚJŠÍ zdroj pro určení odběratele (place_name) a data každé položky:
- Položky, které se nacházejí v obsahu zprávy č. X, patří ODESÍLATELI té zprávy.
- Pokud odesílatel zprávy odpovídá (i přibližně/foneticky) některému ze ZNÁMÍ ODBĚRATELÉ, použij PŘESNÝ název ze seznamu.
- Pokud odesílatel neodpovídá žádnému známému odběrateli, použij jako place_name jméno odesílatele tak, jak je napsané.
- Datum položky vezmi z data té zprávy, ve které se položka nachází.
- Pokud je v jedné zprávě více položek, všechny patří stejnému odběrateli (odesílateli) a stejnému datu.

KAŽDÁ položka objednávky má:
- quantity: počet kusů (číslo)
- degree: stupeň piva jako text např. "10°", "11°", "12°", "13°" (pokud recognizable)
- beer_name: NÁZEV PIVA PŘESNĚ TAK, JAK JE V KATALOGU NÍŽE (viz "DOSTUPNÁ PIVA V KATALOGU"). VELMI DŮLEŽITÉ POŘADÍ POSTUPU:
  1) Nejprve zkontroluj NAUČENÉ ZKRATKY PRO PIVA níže — pokud text odpovídá byť jen přibližně/foneticky některé z nich, POUŽIJ PŘESNĚ ten namapovaný název piva.
  2) Pokud žádná naučená zkratka nesedí, porovnej text se seznamem DOSTUPNÁ PIVA V KATALOGU níže a najdi NEJBLIŽŠÍ SHODU (podle stupně/barvy/zkratky/překlepu) — vždy upřednostni existující položku z katalogu před vymýšlením vlastního názvu.
  3) Teprve pokud text opravdu neodpovídá ničemu z katalogu ani naučeným zkratkám, vrať null — nikdy nevymýšlej název, který v katalogu není.

  ROZPOZNÁVÁNÍ STUPNĚ/DRUHU PIVA — velmi časté zkratky a jejich význam (piš je i s překlepy):
  - "8", "8°", "vosmička", "osmička", "cyklo", "cykloosma" → stupeň 8°
  - "10", "10°", "desítka", "10sv", "světlé výčepní", "svetle vcepni" → stupeň 10°, světlé
  - "11", "11°", "11sv", "jedenáctka", "jedenactka" → stupeň 11°, světlé
  - "12sv", "ležák", "lezak", "světlý", "svetly", "světlý ležák", "svetly lezak", "ležák světlý" (bez slova "tmavý/tmavy") → stupeň 12°, světlé
  - "tmavý", "tmavy", "tmavý ležák", "tmavy lezak", "12tm", "tm" → stupeň 12°, tmavé
  - "13", "13°" → stupeň 13°
  - "Jantar", "Summer", "Hazy", "Bunny" a podobné vlastní názvy piv — pokud se objeví v textu, jde o KONKRÉTNÍ NÁZEV piva z katalogu, ne o stupeň — najdi v katalogu pivo s odpovídajícím názvem.
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
  - DŮLEŽITÉ: package_label by měl být vyplněn u VŠECH položek. Vrať null JEN pokud opravdu nejde určit vůbec nic.


- raw_line: přesný text řádku jak ho vidíš
- place_name: název odběratele / místa dodání. VELMI DŮLEŽITÉ — objednávky často uvádí odběratele JEN JEDNOU, u úplně prvního řádku nebo v záhlaví/podpisu zprávy, a další řádky pod ním už žádné jméno odběratele neopakují. V takovém případě MUSÍŠ stejného odběratele přiřadit i všem následujícím položkám, dokud se v textu neobjeví jiný/nový odběratel (pak se přepni na nového a opět ho "děduj" dolů). Jinými slovy: place_name se v datech "táhne" odshora dolů, dokud ho něco nepřepíše. Hledej jméno odběratele i v: jméně WhatsApp kontaktu, podpisu, oslovení, názvu restaurace/hospody v textu. Pokud znáš seznam UŽ EXISTUJÍCÍCH odběratelů (viz níže "ZNÁMÍ ODBĚRATELÉ") a text jen přibližně/foneticky/s překlepem odpovídá jednomu z nich, POUŽIJ PŘESNĚ ten název ze seznamu (stejná diakritika, velká/malá písmena), ne vlastní přepis. Pokud opravdu nelze určit žádného odběratele, vrať null.
- date: DATUM objednávky ve formátu YYYY-MM-DD. Text je export z WhatsApp, kde každá zpráva má časové razítko jako "[12:00, 1.1.2026]" nebo "1.1.2026, 12:00 -". Přečti z časového razítka zprávy, ke které položka patří, a převeď ho na YYYY-MM-DD (např. "1.1.2026" → "2026-01-01"). Pokud zpráva žádné časové razítko nemá, vrať null. DŮLEŽITÉ: pokud je v textu VÍCE zpráv od stejného odběratele v RŮZNÝCH dnech, každá položka musí mít SVÉ datum z té zprávy, ve které se nachází — NESLUČUJ je do jednoho data. Tím se objednávky od stejného odběratele v různých dnech správně rozdělí na samostatné objednávky.


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

NAUČENÉ ALIASY ODBĚRATELŮ (špatný název → správný název; uživatel tyto opravy ručně potvrdil v minulosti, ber je jako VELMI spolehlivé — pokud text odpovídá "špatnému názvu" z tohoto seznamu, POUŽIJ PŘESNĚ "správný název"):
${placeAliasList}

ROZPOZNANÉ ZPRÁVY (každá zpráva = jeden odesílatel + datum; použij je jako hlavní vodítko pro place_name a date):
${messagesList}

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
- Buď tolerantní k překlepům (např. "Sox" = 5x, "tox" = 10x)
- Nejprve zkontroluj NAUČENÉ ZKRATKY výše — pokud text řádku obsahuje některou z nich, použij namapovaný název piva/obalu přímo, i když by se ti bez ní zdál nejednoznačný.
- place_name se dědí odshora dolů (viz vysvětlení výše u place_name) — nikdy nenechávej null jen proto, že řádek sám o sobě jméno neobsahuje, pokud ho lze odvodit z předchozích řádků nebo záhlaví zprávy.
- OBECNÉ PRAVIDLO PRO CELÝ VÝSTUP: u beer_name i place_name VŽDY nejprve zkus najít shodu v existujících datech (KATALOG PIV / NAUČENÉ ZKRATKY / ZNÁMÍ ODBĚRATELÉ) — i při nepřesné, fonetické nebo překlepové shodě. Teprve když opravdu nic z existujících dat neodpovídá, ber to jako nové/neznámé (u piva vrať null, u odběratele vrať text tak, jak jsi ho přečetl). Nikdy nepřepisuj/nenahrazuj existující známou položku vlastním vymyšleným textem, pokud shoda s katalogem/seznamem je rozumně možná.

Vrať ČISTĚ JSON (bez markdown, bez \`\`\`), přesně v tomto formátu, a nic jiného:
{"items":[{"quantity":4,"degree":"12°","beer_name":"Světlý ležák","package_label":"KEG 30l","raw_line":"Seeberg 4x30 12sv a 2x30 12sv","place_name":"Seeberg","date":"2026-01-01"},{"quantity":2,"degree":"12°","beer_name":"Světlý ležák","package_label":"KEG 30l","raw_line":"Seeberg 4x30 12sv a 2x30 12sv","place_name":"Seeberg","date":"2026-01-01"}],"raw_text":"celý rozpoznaný text"}`;


    const anthropicBody = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "text", text: `\n\nTEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText}\n"""` },
          ],
        },
      ],
    };


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

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error (${anthropicResp.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResp.json();
    const text: string | undefined = anthropicData?.content?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Anthropic returned no text", raw: anthropicData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Strip any stray markdown fences just in case.
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    let parsed: AiResponse;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { items: [], raw_text: text };
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
