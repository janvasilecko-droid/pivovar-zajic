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
  bbox?: { x0: number; y0: number; x1: number; y1: number } | null;
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
    // Read Anthropic key from app_secrets table (service role bypasses RLS).
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
    const imageBase64: string | undefined = body.imageBase64;
    const imageMimeType: string | undefined = body.imageMimeType;
    const beers: { id: string; name: string; degree: string }[] = body.beers ?? [];
    const packages: { id: string; label: string }[] = body.packages ?? [];
    const places: string[] = body.places ?? [];
    const aliases: { alias_text: string; beer_name: string | null; package_label: string | null }[] = body.aliases ?? [];


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

    const prompt = `Jsi asistent pro pivovar. Na obrázku je objednávka piva (WhatsApp zpráva, e-mail, nebo ručně psaný seznam).
Přečti všechny řádky objednávky a vrať je jako strukturovaná data.

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
  Pokud text jasně neodpovídá žádnému z výše uvedených vzorů ani položce v katalogu, NEHÁDEJ — vrať beer_name: null, ať si to uživatel doplní ručně.
- package_label: obal — jeden z těchto: KEG 50l, KEG 30l, KEG 20l, KEG 15l, KEG 10l, Lahve 0.5l, Lahve 0.33l, PET 1.5l, PET 1l, sud 30l, sud 50l.

  ROZPOZNÁVÁNÍ OBALU — na objednávkách se typ obalu (KEG/lahev/PET) téměř nikdy nepíše slovem, pozná se PODLE ČÍSLA OBJEMU u položky:
  - Objem 50, 30, 20, 15 nebo 10 (litrů) → VŽDY sud/KEG s daným objemem (KEG 50l, KEG 30l, KEG 20l, KEG 15l, KEG 10l) — bez ohledu na to, jestli je u čísla napsáno slovo "keg", "sud", nebo jen holé číslo (např. "12sv 5x30" = 5× KEG 30l piva 12° světlé).
  - Objem 1.5 nebo 1 (litr) → VŽDY PET (PET 1.5l, PET 1l).
  - Objem 0.5 nebo 0.33 (litru) → VŽDY skleněná lahev (Lahve 0.5l, Lahve 0.33l).
  - Pokud je v textu explicitní slovo, které jasně odporuje výše uvedenému výchozímu odhadu (např. jasně napsáno "lahev 1l" nebo "PET 0.5l"), dej přednost tomu, co je NAPSANÉ SLOVEM.
  - Pokud u položky NENÍ uvedeno vůbec žádné číslo objemu ani slovo popisující obal (jen třeba "12sv 5x" bez čísla objemu), NEHÁDEJ obal — vrať package_label: null, ať si uživatel doplní ručně. NIKDY netipuj obal jen proto, že "to tak většinou bývá" — je lepší nechat null a barevně to označit v aplikaci pro doplnění, než vrátit špatný obal.

- raw_line: přesný text řádku jak ho vidíš na obrázku
- place_name: název odběratele / místa dodání. VELMI DŮLEŽITÉ — objednávky často uvádí odběratele JEN JEDNOU, u úplně prvního řádku nebo v záhlaví/podpisu zprávy, a další řádky pod ním už žádné jméno odběratele neopakují. V takovém případě MUSÍŠ stejného odběratele přiřadit i všem následujícím položkám, dokud se v textu neobjeví jiný/nový odběratel (pak se přepni na nového a opět ho "děduj" dolů). Jinými slovy: place_name se v datech "táhne" odshora dolů, dokud ho něco nepřepíše. Hledej jméno odběratele i v: hlavičce zprávy, jméně WhatsApp kontaktu (bývá úplně nahoře screenshotu, odděleně od těla zprávy), podpisu, oslovení, názvu restaurace/hospody v textu. Pokud znáš seznam UŽ EXISTUJÍCÍCH odběratelů (viz níže "ZNÁMÍ ODBĚRATELÉ") a text v obrázku jen přibližně/foneticky/s překlepem odpovídá jednomu z nich, POUŽIJ PŘESNĚ ten název ze seznamu (stejná diakritika, velká/malá písmena), ne vlastní přepis. Pokud opravdu nelze určit žádného odběratele, vrať null.
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

PRAVIDLA:
- "10 x 10" znamená 10× pivo 10° (NE 10× KEG 10l)
- stupeň (10°, 11°, 12°) je vlastnost piva, NE objem kegu
- "KEG", "sud", "keg" znamená sud — zkus určit objem (50l, 30l, 20l, 15l, 10l)
- "lahve", "ks", "flašky" znamená lahve (obvykle 0.5l nebo 0.33l)
- Objemy 50/30/20/15/10 (litrů) VŽDY znamenají KEG/sud daného objemu, i bez slova "keg"/"sud".
- Objemy 1.5 a 1 (litr) VŽDY znamenají PET.
- Objemy 0.5 a 0.33 (litru) VŽDY znamenají skleněnou lahev.
- Pokud u položky není vůbec žádný údaj o objemu/obalu, vrať package_label: null — nikdy netipuj náhodně.

- Pokud řádek není položka objednávky (pozdrav, podpis, datum), NEZAHRNUJ ho
- Pokud quantity chybí, vrať null
- Buď tolerantní k překlepům a OCR šumu (např. "Sox" = 5x, "tox" = 10x)
- Nejprve zkontroluj NAUČENÉ ZKRATKY výše — pokud text řádku obsahuje některou z nich, použij namapovaný název piva/obalu přímo, i když by se ti bez ní zdál nejednoznačný.
- place_name se dědí odshora dolů (viz vysvětlení výše u place_name) — nikdy nenechávej null jen proto, že řádek sám o sobě jméno neobsahuje, pokud ho lze odvodit z předchozích řádků nebo záhlaví zprávy.
- OBECNÉ PRAVIDLO PRO CELÝ VÝSTUP: u beer_name i place_name VŽDY nejprve zkus najít shodu v existujících datech (KATALOG PIV / NAUČENÉ ZKRATKY / ZNÁMÍ ODBĚRATELÉ) — i při nepřesné, fonetické nebo překlepové shodě. Teprve když opravdu nic z existujících dat neodpovídá, ber to jako nové/neznámé (u piva vrať null, u odběratele vrať text tak, jak jsi ho přečetl). Nikdy nepřepisuj/nenahrazuj existující známou položku vlastním vymyšleným textem, pokud shoda s katalogem/seznamem je rozumně možná.



Vrať ČISTĚ JSON (bez markdown, bez \`\`\`), přesně v tomto formátu, a nic jiného:
{"items":[{"quantity":10,"degree":"10°","beer_name":"Desítka","package_label":"KEG 30l","raw_line":"10 x 10 KEG 30l","place_name":"Malesice","bbox":{"x0":5,"y0":12,"x1":80,"y1":18}}],"raw_text":"celý rozpoznaný text"}`;


    const anthropicBody = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
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
