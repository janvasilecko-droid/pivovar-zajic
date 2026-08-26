import { createClient } from "npm:@supabase/supabase-js@2";
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
  date: string | null;
}

interface WhatsAppMessageHint {
  sender: string | null;
  date: string | null;
  text: string;
  fromMe?: boolean;
  // Text zprávy, na kterou tahle odpovídá (WhatsApp "reply"/citace) — když je
  // vyplněný, je to JISTOTA (ne odhad), které dřívější zprávy/objednávky se
  // tahle týká.
  quotedText?: string | null;
}

interface AiResponse {
  items?: OrderItem[];
  raw_text?: string;
  place_name?: string | null;
  error?: string;
}

// 🧹 Pokud AI přečetlo tu samou objednávku víckrát (duplicitní řádky v odpovědi),
// ponecháme ji jen jednou. Deduplikace probíhá podle toho, co je pro objednávku
// podstatné (odběratel, pivo, obal, stupeň, množství, datum).
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

// ============================================================
// Validace výstupu LLM + auto-fallback.
// Když provider odpoví HTTP 200, ale výstup je zjevně rozbitý
// (nejde o JSON, chybí items, položky nesedí na katalog), bere se
// to jako neúspěch a automaticky se zkouší další provider.
// ============================================================

function normKey(s: string): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Vyčistí surový text odpovědi (``` fency, text okolo {}) a zkusí JSON.parse.
function cleanJson(text: string): { ok: boolean; cleaned: string; parsed: AiResponse | null } {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart > 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }
  try {
    const parsed = JSON.parse(cleaned) as AiResponse;
    return { ok: true, cleaned, parsed };
  } catch {
    return { ok: false, cleaned, parsed: null };
  }
}

// Kontrola struktury odpovědi + shody s katalogem piva/obalů.
// Toleruje: prázdné items, chybějící/null pole. Odmítá: rozbité schéma,
// špatné typy a odpověď, která zjevně ignorovala katalog.
function validateOutput(
  parsed: AiResponse,
  beerNameKeys: Set<string>,
  pkgLabelKeys: Set<string>,
): { ok: boolean; reason?: string } {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "odpověď není objekt" };
  }
  if (!Array.isArray(parsed.items)) {
    return { ok: false, reason: "items není pole" };
  }
  if (parsed.items.length === 0) {
    return { ok: true }; // zpráva bez objednávky = platná prázdná odpověď
  }
  let checkable = 0;
  let matched = 0;
  for (const it of parsed.items) {
    if (typeof it !== "object" || it === null) {
      return { ok: false, reason: "položka není objekt" };
    }
    if (it.quantity !== null && it.quantity !== undefined && typeof it.quantity !== "number") {
      return { ok: false, reason: "quantity není číslo/null" };
    }
    for (const f of ["degree", "beer_name", "package_label", "place_name", "date"] as const) {
      const v = (it as any)[f];
      if (v !== null && v !== undefined && typeof v !== "string") {
        return { ok: false, reason: `${f} není string/null` };
      }
    }
    // Obal musí sedět na katalog (porovnáváme jen pokud katalog obalů existuje).
    const pkg = (it as any).package_label;
    if (pkg != null && String(pkg).trim() !== "" && pkgLabelKeys.size > 0) {
      checkable++;
      if (pkgLabelKeys.has(normKey(String(pkg)))) matched++;
    }
    // Pivo musí sedět na katalog (tolerance na chybějící stupeň, "Světlá" vs "12° Světlá").
    const beer = (it as any).beer_name;
    if (beer != null && String(beer).trim() !== "" && beerNameKeys.size > 0) {
      checkable++;
      const bk = normKey(String(beer));
      if (beerNameKeys.has(bk) || [...beerNameKeys].some((k) => k.includes(bk) || bk.includes(k))) matched++;
    }
  }
  // Alespoň polovina rozpoznaných pivo/obal polí musí sedět na katalog,
  // jinak provider zjevně katalog ignoroval.
  if (checkable > 0 && matched / checkable < 0.5) {
    return { ok: false, reason: `jen ${matched}/${checkable} pivo/obal polí odpovídá katalogu` };
  }
  return { ok: true };
}

// Zpracuje odpověď providera: vyčistí, zvaliduje a vrátí vyčištěný JSON.
// Vrátí "" když je výstup nepřijatelný — pak pokračujeme na dalšího providera.
function acceptOutput(
  provider: string,
  candidate: string,
  beerNameKeys: Set<string>,
  pkgLabelKeys: Set<string>,
): string {
  if (!candidate) return "";
  const clean = cleanJson(candidate);
  if (!clean.ok) {
    console.warn(`parse-order-text: PROVIDER=${provider} → nevalidní JSON, zkouším dalšího providera`);
    return "";
  }
  const v = validateOutput(clean.parsed!, beerNameKeys, pkgLabelKeys);
  if (!v.ok) {
    console.warn(`parse-order-text: PROVIDER=${provider} → nevalidní výstup (${v.reason}), zkouším dalšího providera`);
    return "";
  }
  console.log(`parse-order-text: PROVIDER=${provider}`);
  return clean.cleaned;
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "parse-order-text",
      limit: 20,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const { data: secretRows, error: secretsErr } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["GEMINI_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY"]);

    const secretsMap = new Map((secretRows ?? []).map((s) => [s.key, s.value]));
    const geminiKey = secretsMap.get("GEMINI_API_KEY");
    const groqKey = secretsMap.get("GROQ_API_KEY");
    const mistralKey = secretsMap.get("MISTRAL_API_KEY");
    const openaiKey = secretsMap.get("OPENAI_API_KEY");

    if (secretsErr || (!geminiKey && !groqKey && !mistralKey && !openaiKey)) {
      return new Response(
        JSON.stringify({ error: "Neither GEMINI_API_KEY nor GROQ_API_KEY nor MISTRAL_API_KEY nor OPENAI_API_KEY is configured in app_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await readJsonWithLimit<Record<string, any>>(req, 15 * 1024 * 1024);
    const rawText: string | undefined = body.rawText;
    const imageBase64: string | undefined = body.imageBase64;
    const imageMimeType: string | undefined = body.imageMimeType || "image/jpeg";
    const beers: { id: string; name: string; degree: string }[] = body.beers ?? [];
    const packages: { id: string; label: string }[] = body.packages ?? [];
    // Katalogové klíče (normalizované) pro validaci výstupu LLM.
    const beerNameKeys = new Set((beers ?? []).map((b) => normKey(b?.name ?? "")));
    const pkgLabelKeys = new Set((packages ?? []).map((p) => normKey(p?.label ?? "")));
    const isSenderName = (s: string) => {
      const norm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return ['bednar', 'petr', 'sladek', 'gabina', 'ucetni', 'pojmi', 'bendat'].some((x) => norm.includes(x));
    };
    const places: string[] = (body.places ?? []).filter((p: string) => !isSenderName(p));
    const aliases: { alias_text: string; beer_name: string | null; package_label: string | null }[] = body.aliases ?? [];
    const placeAliases: { wrong_name: string; correct_name: string }[] = (body.placeAliases ?? []).filter((a: any) => !isSenderName(a.wrong_name) && !isSenderName(a.correct_name));
    const messages: WhatsAppMessageHint[] = body.messages ?? [];

    if ((!rawText || !rawText.trim()) && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing rawText or imageBase64" }),
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

    // Sestav seznam rozpoznaných zpráv (odesílatel + datum + PLNÝ TEXT) jako
    // kontext pro AI. Plný text každé zprávy je důležitý, protože uživatel často
    // na předchozí objednávku ODPOVÍDÁ — odpověď navazuje na předešlou zprávu a
    // bez plného znění AI nemůže doplnit chybějící informace.
    // Odesílatel slouží k rozlišení zpráv a dat. VÝJIMKA: když text zprávy říká
    // "pro mě"/"mi"/"mně"/"pro mne" (objednávka pro pisatele), je odběratelem
    // (place_name) PRÁVĚ ODESÍLATEL té zprávy.
    const messagesList = messages.length
      ? messages
          .map((m, i) => {
            const sender = m.sender
              ? `Odesílatel: "${m.sender}" (když text zprávy říká "pro mě"/"mi"/"mně"/"pro mne", je TOHLE jméno odběratelem)${m.fromMe ? " — tato zpráva je od VÁS (pivovar), ne od zákazníka" : ""}`
              : "Odesílatel: (neznámý)";
            const date = m.date ? `, datum: ${m.date}` : "";
            const fullText = m.text.replace(/\s+/g, " ").trim();
            const quoted = m.quotedText
              ? `\n  ⭐ TOHLE JE ODPOVĚĎ (WhatsApp reply) NA ZPRÁVU S TÍMTO TEXTEM: "${m.quotedText.replace(/\s+/g, " ").trim()}" — najdi tuhle zprávu výše v seznamu (mezi Zprávami 1..${i}) a POUZE k NÍ tuhle odpověď připoj/uprav (viz pravidlo o citovaných odpovědích níže). Je to JISTOTA, ne odhad. ⚠️ Text citace uvedený zde SLOUŽÍ JEN K DOHLEDÁNÍ té zprávy v seznamu výše — NIKDY z něj samotného nečti/nevytvářej žádnou položku navíc. Pokud odpovídající zprávu v seznamu výše nenajdeš, přečti JEN samotný obsah téhle odpovědi (fullText) a nic nevymýšlej z textu citace.`
              : "";
            return `Zpráva ${i + 1}: ${sender}${date}\n  Celý obsah zprávy: "${fullText}"${quoted}`;
          })
          .join("\n")
      : "(žádné rozpoznané zprávy — text nebyl rozdělen na jednotlivé zprávy)";

    // Když je ke zprávě přiložená i FOTKA, AI ji přečte taky (Gemini vision).
    // Fotka je zdrojová objednávka; text zprávy je jen doplněk (popisek).
    const photoSection = imageBase64
      ? `

📷 FOTKA OBJEDNÁVKY Z WHATSAPP:
K této objednávce je přiložená i FOTKA (viz obrázek v požadavku). Přečti objednávku PŘEDEVŠÍM Z FOTKY.
- raw_text = doslovný přepis CELÉHO textu z fotky, řádek po řádku, v pořadí jako na fotce (i nečitelné části).
- Ke KAŽDÉMU řádku fotky s objednávkovým údajem MUSÍ existovat položka v items (viz pravidla výše).
- Čísla čti VELMI POZORNĚ (5x30 ≠ 5x50, 3 vs 5 vs 8, 0 vs 6).
- Text zprávy níže je jen doplněk k fotce — má přednost to, co je na fotce.`
      : "";

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
17. KRITICKÉ — ČÍSLO "1" A OBJEM: Pokud je u položky napsáno jen "1" (bez "l", bez "x"), může to znamenat buď MNOŽSTVÍ 1 kus, nebo OBJEM 1 litr (PET 1l). Rozhodni podle kontextu:
    - "1x30" → quantity=1, package="KEG 30l" (1 je množství, 30 je objem)
    - "12sv 1" → quantity=1, package="KEG 30l" (výchozí obal, 1 je množství)
    - "1l" nebo "1 l" → quantity=1, package="PET 1l" (1 je objem)
    - "PET 1" → quantity=1, package="PET 1l"
    - Pokud je "1" u objemu kegu (30/50/20/15/10), je to MNOŽSTVÍ. Pokud je "1" samostatně u piva bez jiného objemu, je to MNOŽSTVÍ 1 kus s výchozím obalem KEG 30l.
18. KRITICKÉ — BEDNY (PŘEPRAVKY) S LAHVEMI: Pokud je v objednávce napsáno "bedna", "bedny", "beden", "přepravka", "přepravky" apod., znamená to přepravku s lahvemi. JEDNA bedna = 20 ks lahví 0.33l. Postup:
    - "1 bedna tmavého" = 20 ks lahví 0.33l tmavého piva (quantity=20, package_label="Lahve 0.33l")
    - "2 bedny tmavého" = 2 × 20 = 40 ks lahví 0.33l tmavého piva (quantity=40, package_label="Lahve 0.33l")
    - "3 bedny 12sv" = 3 × 20 = 60 ks lahví 0.33l piva 12° světlého (quantity=60, package_label="Lahve 0.33l")
    VŽDY vynásob počet beden číslem 20 a výsledek zapiš jako quantity. Obal je VŽDY "Lahve 0.33l" (pokud je v textu výslovně napsáno 0,5l nebo "lahve 0,5", pak "Lahve 0.5l"). Stupeň/barva piva se určí podle textu (např. "tmavého" = tmavé, "12sv" = 12° světlé).
19. KRITICKÉ — 50L SUDY: POKUD JE V OBJEDNÁVCE 50L, 50 L, 50, "VELKÝ SUD", "SUD 50" NEBO "KEG 50", PAK JE OBAL VŽDY "KEG 50l"! NIKDY NEPIŠ "KEG 30l" ANI "30l"! Pokud je u položky uvedeno "50l", "50 l", "50", "velký sud", "sud 50", "keg 50", Obal/package_label MUSÍ BÝT "KEG 50l"! NIKDY to nepiš jako "KEG 30l" ani nenechávej obal prázdný!
20. KRITICKÉ — VYHODNOCENÍ LAHVÍ 20x0,5 A 20x0,33: Pokud je v textu "20x0,5" nebo "20x0.5" nebo "20 ks 0,5l", jde o 20 ks lahví 0,5l (package_label: "Lahve 0.5l")! NIKDY to nepiš jako 0.33l! Pouze pokud je výslovně napsáno "0,33" nebo "0.33" (např. "20x0,33"), použij "Lahve 0.33l".
21. KRITICKÉ — STUPEŇ PATŘÍ K TÉ OBJEDNÁVCE, U KTERÉ JE NAPSANÝ: Stupeň/barva piva napsaná v konkrétní zprávě patří TÉ objednávce (položkám té zprávy), u které je napsaná. Pokud je u jiné objednávky (jiné zprávy/dne/odběratele) napsaný jiný stupeň, NEPŘENÁŠEJ ho mezi objednávkami. Pokud u objednávky stupeň napsaný není a nejde ho jednoznačně dovodit z kontextu odpovědi (viz pravidla u ODPOVĚDÍ), ponech degree=null a NEDOSAZUJ ho z jiné objednávky.
22. KRITICKÉ — NIKDY NEPŘEPISUJ "1,5" NA "15"! To jsou dva ÚPLNĚ JINÉ obaly: "1,5" (jeden a půl) = PET 1.5l, "15" (patnáct) = KEG/sud 15l. Slovo "PET" nebo "petka" u položky (i s překlepem — "peT", "pet.", "pETR", "peťky", "petky") ZARUČUJE, že číslo u něj je 1,5 nebo 1 (PET) — NIKDY 15. Kegy 15l jsou vzácné a vyskytují se JEN v kontextu ostatních objemů sudů (50/30/20/10) nebo se slovem "keg"/"sud" v blízkosti, NIKDY vedle slova "PET"/"petka". Pokud vidíš "PET 15" nebo "petka 15", je to skoro jistě ztracená čárka — správně je "PET 1,5".
23. KRITICKÉ — NADPIS SEZNAMU URČUJE OBAL VŠECH POLOŽEK POD NÍM: Objednávky často mají tvar "nadpis" (např. "PET:", "PET", "Petky:", "Lahve:", "Sudy:", "Kegy:") a POD ním seznam čísel/piv BEZ opakování obalu na každém řádku. Nadpis platí pro VŠECHNY položky pod ním, dokud se neobjeví jiný nadpis nebo jiný explicitní obal u konkrétní položky. Příklad:
    "PET
    12sv 1,5
    10° 1
    tmavé 1,5"
    → všechny 3 položky mají package_label PET (podle čísla u nich: 1.5l/1l/1.5l), NIKOLIV KEG — i kdyby číslo u položky bylo napsané jako holé "15" nebo "1" bez desetinné čárky, protože nadpis "PET" jednoznačně určuje kategorii obalu pro celý seznam pod ním.

ODPOVĚDI NA ZPRÁVY = KONTEXT (VELMI DŮLEŽITÉ):
V WhatsApp se na objednávku často ODPOVÍDÁ — další zpráva je pokračováním/doplněním té PŘEDCHOZÍ (stejný odběratel, stejný den), NE nová samostatná objednávka. Typicky může jít o: citaci původní zprávy, slova jako "ještě", "k tomu", "dále", "a", "do objednávky přidej", "pak taky", "jo a ještě", nebo odpověď obsahuje jen čísla/piva bez jména odběratele.

0a. KRITICKÉ — ⭐ OZNAČENÍ "TOHLE JE ODPOVĚĎ NA..." MÁ ABSOLUTNÍ PŘEDNOST PŘED POŘADÍM ZPRÁV: Pokud má zpráva v seznamu níže označení "⭐ TOHLE JE ODPOVĚĎ NA ZPRÁVU S TÍMTO TEXTEM", je to skutečná WhatsApp citace (uživatel klepnul na konkrétní starší zprávu a odpověděl na NI) — NE odhad. Najdi v seznamu zprávu, jejíž text odpovídá tomu citovanému, a doplnění/opravu z pravidel 1–11 níže aplikuj PRÁVĚ na TU zprávu/objednávku (jejího odběratele a den) — i kdyby mezitím v chatu přišly JINÉ, nesouvisející objednávky jiných odběratelů. Bez tohohle označení (zpráva ho nemá) postupuj podle pravidel 1–11 a bodu 13 níže (odhad podle pořadí a jazykových signálů, opatrně kvůli sdílenému chatu s více odběrateli).

POSTUP při čtení vícenásobné/odpověďové zprávy:
0. Pokud zpráva neobsahuje žádné konkrétní objednávkové údaje (množství, obal, pivo, stupeň) a obsahuje pouze obecná potvrzení („ok“, „ano“, „dobře“, „budem“, „jo“, „potvrzuji“, „+1“, „stejné“, emotikony ze sad 👍👌✅✔️), celou ji ignoruj, neextrahuj z ní žádné položky. Tím zabráníš přidávání duplicit nebo neúplných záznamů.


1. NEČTI řádky tupe, jeden vedle druhého, jako izolované položky. VŽDY vezmi v úvahu KONTEXT CELÉ konverzace (seznam ROZPOZNANÝCH ZPRÁV níže s plnými texty).
2. Když zpráva zjevně NAVAZUJE na předchozí zprávu od stejného odběratele ve stejný den (obsahuje "ještě", "k tomu", "přidej", "doplň", citaci, nebo jen doplňky), NESLUČUJ ji do samostatné částečné objednávky, ale DOPLŇ ji k původní objednávce toho odběratele a dne.
3. Chybějící informace v odpovědi DOBER z původní zprávy: pokud se odpověď zmiňuje o pivu/obalu jen částečně (např. "k tomu ještě 2x 30l"), doplň stupeň/balení/odbyvatele z původní (citované/předchozí) objednávky, ke které odpověď patří.
4. Pokud odpověď neobsahuje jméno odběratele, použij odběratele a datum z té předchozí/původní zprávy, na kterou odpovídá (stejné place_name i date).
5. Nech raw_line každé položky odpovídat tomu textu, ze kterého reaguje, aby bylo jasné, že patří do stejné objednávky, a místo aby se každý řádek bral jako jiná objednávka.
6. KRITICKÉ — IGNORUJ CITOVANÉ ZPRÁVY A REAKCE VE WHATSAPPU: Ve WhatsApp chatu se při odpovědi zobrazuje CITOVANÁ ZPRÁVA (v rámečku nahoře v bublině zprávy, kde je zopakované jméno odesílatele a text původní zprávy). NIKDY neextrahuj položky z CITOVANÉ ZPRÁVY jako novou samostatnou objednávku — je to jen zopakovaný text původní zprávy. Texty pod citací typu "3x30 čeho", "čeho?", "jaké pivo?", "ok", "platí", "příští týden", "díky" jsou CHATOVÉ DOTAZY/KOMENTÁŘE, NIKOLIV samostatné objednávky. Neextrahuj z nich nové položky.
   ⚠️ Tohle platí STEJNĚ i pro DOPLNĚNÍ (bod 2–3 výše, "Plus"/"ještě"/"k tomu")! Citovaný text ("⭐ TOHLE JE ODPOVĚĎ NA ZPRÁVU S TÍMTO TEXTEM") slouží JEN k tomu, abys našel/l tu původní zprávu v seznamu a věděl/a, ke kterému odběrateli/dni doplnění patří — NENÍ to zdroj položek. Vrať z citované zprávy JEN ty položky, které skutečně vidíš v jejím VLASTNÍM textu ve Zprávě výše v seznamu (ne z uvozovek u ⭐), plus to, co je NOVĚ napsané v aktuální odpovědi. Příklad chyby, kterou NESMÍŠ udělat: odpověď "Plus 3x10 11sv" (doplnění k objednávce Maneo) smí vrátit JEN položku 3× 10l 11° — pokud v aktuální odpovědi není napsaná žádná další položka, nevymýšlej/nepřidávej k ní žádnou další položku "navíc" jen proto, že se podobně formulovaná objevuje v citovaném textu.
7. KRITICKÉ — IGNORUJ CHATOVÝ TEXT, KTERÝ NEPATŘÍ K OBJEDNÁVCE (ZBYTEK JINÉ KONVERZACE):
   Do zprávy se občas připlete kousek textu, který s objednávkou NESOUVISÍ — zbytek
   předchozí/jiné konverzace nebo odpověď na otázku jiného odesílatele (jiné téma).
   Takový text NEPARSUJ jako položky a NEDOPLŇUJ k němu pivo/obal/stupeň z předchozích
   řádků (dědění kontextu platí JEN pro skutečné řádky objednávky, ne pro tento text).
   Poznáš ho takto:
   - je to za ukončením objednávky („Děkuji moc.", „Díky moc.", „Díky.", „Moc děkuji")
     a NEnavazuje na objednávku (chybí „ještě", „k tomu", „přidej", „doplň", „a taky"),
   - nemá odrážku (•/‑/–), neobsahuje název odběratele a nezačíná konkrétní položkou
     (množství + pivo/objem),
   - typicky obsahuje chatové obraty typu „Ty máme", „my máme", „Tak ...", „tohle",
     „to k tomu nepatří", „mimo objednávku".
   PŘÍKLAD:
   Text: „Malesice\n• SV 12 = 3x50l KEG + 24x1,5l PET (bez etikety) + 20x0,5l lahev (etiketa MM)\n• Jantar 12 = 3x30l KEG + 12x1,5l PET…..Děkuji moc.\nTy máme 3x\nTak 1x15 + 1x20l"
   → VRAŤ JEN položky objednávky Malešice (SV 12: 3× KEG 50l + 24× PET 1.5l + 20× Lahve 0.5l, pivo 12° Světlá; Jantar: 3× KEG 30l + 12× PET 1.5l, pivo Jantar). Řádky „Ty máme 3x" a „Tak 1x15 + 1x20l" IGNORUJ — nepatří k objednávce, nepřidávej z nich žádné položky a nedoplňuj je pivem z předchozích řádků.

8. KRITICKÉ — DEDUPLIKACE STEJNÉ OBJEDNÁVKY: Pokud je stejný odběratel a stejná položka zmíněna/zopakována vícekrát (např. v původní zprávě a následně v citaci nebo v otázce), VYTVOŘ TUTO POLOŽKU POUZE JEDNOU!
9. KRITICKÉ — KDYŽ OBJEDNÁVKA NEMÁ STUPEŇ, HLEDEJ HO V KONTEXTU ODPOVĚDI; POKUD HO NENAJDEŠ, NECH HO PRÁZDNÝ: Stává se, že objednávka je napsaná JEN jako objem: např. "Terasa 2x50" = 2× KEG 50l, ale STUPEŇ/DRUH PIVA v tom řádku není. Pod ní může být dotaz a odpověď, která stupeň dodá — např. dotaz účetní "co to je?" a odpověď "8" (znamená 8°). POSTUP:
   1) Pokud položka NEMÁ stupeň/beer_name ve svém vlastním řádku, podívej se do KONTEXTU té konverzace (navazující odpověď/upřesnění). Pokud je v odpovědi jednoznačný stupeň (např. "8" = 8°, "10", "12sv", "11"), DOPLŇ ho k té objednávce → např. "Terasa 2x50" + odpověď "8" = 2× KEG 50l piva 8° (beer_name i degree upřesni podle katalogu).
   2) Odpověď patří TÉ objednávce, ze které/s níž komunikace pokračuje (stejný odběratel, stejný den). Nesmíš použít stupeň z jiné objednávky jiného odběratele/dne.
10. KRITICKÉ — ODPOVĚĎ MŮŽE PŮVODNÍ OBJEDNÁVKU I UPRAVIT (NEJEN DOPLNIT): Pokud odpověď na předchozí zprávu OPRAVUJE/UPRAVUJE původní data (např. "těch 2x50 neber, dej 3x50", "místo 12sv chci 11sv", "sudů místo 2 bude 5", "k tomu 2x30 NE, jen 1x20"), pak na základě odpovědi UPRAV počet/obal/stupeň TÉ PŮVODNÍ položky v původní objednávce — ne jen přidej nový řádek. Výsledná objednávka = původní záměr PO spotřebování úprav z odpovědi.
11. Rozlišení „doplň" vs „oprav": slova jako "ještě", "k tomu dod"/"přidej", "a ještě", "budu brát i" = DOPLNĚNÍ (přidej nové položky k téže objednávce). Slova jako "ne", "neber", "místo", "oprav", "změ", "bude 3x", "radši", "jen 1x" = OPRAVA (uprav existující položku původní objednávky). Vypočítej výslednou objednávku PO všech úpravách a nevytvářej duplicitní/staré řádky.
12. KRITICKÉ — SEZNAM ZPRÁV JE CHRONOLOGICKÝ, POSLEDNÍ ZPRÁVA JE NEJNOVĚJŠÍ: Zprávy v seznamu níže jsou seřazené od NEJSTARŠÍ po NEJNOVĚJŠÍ. Poslední zpráva v seznamu je ta, kterou právě zpracováváš. Když je to odpověď na předchozí zprávu, může obsahovat FINÁLNÍ ÚPRAVU objednávky (doplnění NEBO opravu). VÝSLEDKEM je objednávka PO všech úpravách z poslední zprávy — nikdy nevracej zároveň starou i upravenou verzi téže položky/objednávky. Datum (date) a odběratele (place_name) vezmi z původní zprávy, ke které odpověď patří (doplnění/oprava sama je obvykle neobsahuje).
13. KRITICKÉ — STEJNÝ CHAT/ODESÍLATEL ČASTO PŘEPOSÍLÁ OBJEDNÁVKY VÍCE RŮZNÝCH ODBĚRATELŮ! Odesílatel/participant v tomto chatu bývá jedna osoba (např. řidič/dispečer), která do JEDNOHO chatu postupně přeposílá objednávky od RŮZNÝCH, VZÁJEMNĚ NESOUVISEJÍCÍCH zákazníků. Stejný odesílatel/participant tedy NENÍ důkaz, že jde o stejnou objednávku — rozhoduje POUZE to, jestli zpráva zjevně NAVAZUJE na tu předchozí (viz body 1–11: obsahuje "ještě"/"k tomu"/"přidej"/citaci/jen doplňky BEZE jména odběratele) NEBO uvádí SVÉHO VLASTNÍHO, jinak pojmenovaného odběratele.
    - Pokud poslední zpráva (nebo k ní přiložená FOTKA) sama uvádí KONKRÉTNÍHO odběratele — jméno firmy/osoby v textu, oslovení "pro [jméno]", nebo hlavičku/logo na faktuře/nabídkovém listu na fotce (např. "Maneo, s.r.o.") — je to VŽDY SAMOSTATNÁ, KOMPLETNÍ objednávka TOHOTO odběratele.
    - V takovém případě NIKDY nepřidávej položky z jiných zpráv v kontextu, i kdyby byly od téhož odesílatele/participanta a i kdyby byly z téhož dne — patří jinému odběrateli.
    - Kontext (předchozí zprávy) použij k DOPLNĚNÍ jen tehdy, když poslední zpráva SAMA žádného vlastního odběratele needuje a zjevně navazuje na tu bezprostředně předchozí (viz body 1–4).
    PŘÍKLAD: Zpráva 1 "Pivní Kvelb\n10° - 8x30l KEG..." (odběratel Pivní Kvelb), zpráva 2 "Pro Romana Šonku... 2x50l 12sv" (odběratel Roman Šonka), zpráva 3 fotka faktury s hlavičkou "Maneo, s.r.o." (odběratel Maneo) — i když jsou všechny tři od stejného odesílatele ve stejném chatu, jde o TŘI ZCELA SAMOSTATNÉ objednávky tří různých odběratelů. Při zpracování zprávy 3 vrať POUZE položky z faktury Maneo — položky Pivní Kvelbu ani Romana Šonky do ní NIKDY nepřidávej.
14. KRITICKÉ — I JEDNA ZPRÁVA MŮŽE OBSAHOVAT VÍCE RŮZNÝCH MÍST DODÁNÍ NAJEDNOU: Pokud JEDNA zpráva vyjmenuje víc různých míst/odběratelů (např. víc adres, "sklad", konkrétní čtvrť/lokalitu), přiřaď KAŽDÉ položce vlastní place_name podle toho místa, ke kterému se v textu vztahuje — NIKDY nepřiřazuj všem položkám ze zprávy jen první zmíněné místo. Zvlášť "Žižkov"/"Zizkov": bývá to samostatná dodávka, která jezdí JINDY než zbytek objednávky ve stejné zprávě (i od stejného odesílatele jako Radek) — i když je psaná ve stejné zprávě jako jiná místa (např. "Dadali", "Sklad"), VŽDY jí dej vlastní place_name "Žižkov" (nebo přesný název z textu) a NIKDY ji neslučuj do položek jiného místa ze stejné zprávy.








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


KRITICKÉ PRAVIDLO PRO ODBĚRATELE (ODBĚRATEL JE VŽDY V TEXTU ZPRÁVY):
1. JMÉNO ODBĚRATELE JE VŽDY NAPSÁNO PŘÍMO V TEXTU OBJEDNÁVKY / ZPRÁVY (např. "Naseb", "Malesice", "Žižkov", "Seeberg", "Lokálka", "U Zajíce", "U Labutě").
2. ODESÍLATELÉ ZPRÁV V HLAVIČCE WHATSAPP jako "Pojmi", "Bednář", "Bendat", "Gábina účetní", "Gábina", "Účetní" JSOU POUZE ODESÍLATELÉ (předávají nebo posílají zprávy z telefonu), NIKOLIV ODBĚRATELE! NIKDY nepoužívej tato jména odesílatelů jako place_name!
3. VŽDY hledej název odběratele / hospody V TEXTU ZPRÁVY (tělo zprávy):
   - Může být na začátku řádku nebo před objednávkou (např. "Naseb 2x50", "Malesice 5x30 12sv", "Žižkov 3x50")
   - Může být uveden jako "pro [odběratel]", "na [odběratel]", "do [odběratel]" (např. "pro Naseb", "do Malesic", "na Žižkov")
   - Může být samostatně v textu zprávy stejným písmem
4. Pokud je v textu zprávy napsáno "Lokálka 10x50", place_name = "Lokálka" (z textu). I kdyby byl odesílatel zprávy "Petr Bednář" nebo "Pojmi" nebo "Gábina", VŽDY má přednost název odběratele z textu zprávy!
5. Seznam "ZNÁMÍ ODBĚRATELÉ" níže obsahuje existující odběratele. Pokud text v zprávy odpovídá byť i přibližně (překlep, OCR šum) některému z nich, POUŽIJ PŘESNÝ NÁZEV ze seznamu.
6. NIKDY nepoužívej jako place_name: "Pojmi", "Bednář", "Bendat", "Gábina", "Gábina účetní", "Účetní", "WhatsApp", "Pivovar", "Zajíc", "Dnes", "Včera".
7. Pokud NELZE z textu zprávy určit žádného odběratele ani po porovnání se ZNÁMÍ ODBĚRATELÉ, vrať null.
8. Pokud je v textu objednávky napsáno "pro [jméno]" nebo "do [jméno]" nebo "na [jméno]", použij toto jméno jako place_name (má přednost i před jménem z hlavičky WhatsApp). PŘÍKLAD: i když je odesílatel zprávy "Petr Bednář", ale v textu objednávky je "pro Lukase", place_name = "Lukas" (jméno z textu). VŽDY hledej jméno odběratele v textu NEJDŘÍV a dej mu přednost před hlavičkou WhatsApp.
9. NIKDY nepoužívej jako place_name název piva, objem kegu, nebo jiné údaje o objednávce (např. "10x50", "KEG 30l", "12sv"). Pokud je napsáno "Lokálka Říčany 10x50", place_name = "Lokálka Říčany" a "10x50" je objednávka (10× KEG 50l).
10. ODESÍLATEL MŮŽE BÝT ODBĚRATEL — POUZE jako záloha, když text žádného odběratele neobsahuje: Pokud v textu zprávy NENÍ žádné jméno odběratele, můžeš jako place_name použít JMÉNO ODESÍLATELE (kontakt v WhatsApp), ALE POUZE pokud je to skutečný odběratel (hospoda/restaurace/osoba objednávající pivo), NE zaměstnanec pivovaru ("Pojmi", "Bednář", "Gábina", "Účetní", "Petr") a NE pivovar samotný ("Zajíc", "Hospoda U Zajíce", "Pivovar").
11. PŘÍSNĚ ZAKÁZÁNO — NEVYMÝŠLEJ ODBĚRATELE: Nikdy nepoužívej jako place_name název ze seznamu ZNÁMÍ ODBĚRATELÉ, který se NEVYSKYTUJE v textu zprávy ani ve jméně odesílatele — to je vymýšlení a vede k objednávce u špatného zákazníka. Pokud nelze odběratele určit ani z textu ani z odesílatele, vrať null.

KAŽDÁ položka objednávky má:
- quantity: počet kusů (číslo)
- degree: stupeň piva jako text např. "10°", "11°", "12°", "13°" (pokud recognizable)
- beer_name: NÁZEV PIVA PŘESNĚ TAK, JAK JE V KATALOGU NÍŽE (viz "DOSTUPNÁ PIVA V KATALOGU"). VELMI DŮLEŽITÉ POŘADÍ POSTUPU:
  1) Nejprve zkontroluj NAUČENÉ ZKRATKY PRO PIVA níže — pokud text odpovídá byť jen přibližně/foneticky některé z nich, POUŽIJ PŘESNĚ ten namapovaný název piva.
  2) Pokud žádná naučená zkratka nesedí, porovnej text se seznamem DOSTUPNÁ PIVA V KATALOGU níže a najdi NEJBLIŽŠÍ SHODU (podle stupně/barvy/zkratky/překlepu) — vždy upřednostni existující položku z katalogu před vymýšlením vlastního názvu.
  3) Teprve pokud text opravdu neodpovídá ničemu z katalogu ani naučeným zkratkám, vrať null — nikdy nevymýšlej název, který v katalogu není.

  ROZPOZNÁVÁNÍ STUPNĚ/DRUHU PIVA — velmi časté zkratky a jejich význam (piš je i s překlepy):
  - ⚠️ KRITICKÉ PRAVIDLO — ČÍSLO (8–16) NAPSANÉ U ZKRATKY/STUPNĚ/BARVY URČUJE STUPEŇ, ZKRATKA URČUJE BARVU: Číslo napsané vedle barvy/zkratky VŽDY určuje stupeň — bez ohledu na pořadí. Platí v OBOJÍM pořadí: "11sl" i "sl 11" = 11° světlé, "sv 12" i "12sv" = 12° světlé, "tm 12" i "12tm" = 12° tmavé. Bez čísla = výchozí 12° ("sl"/"svetly"/"lezak" = 12° světlé, "tm"/"tmavy" = 12° tmavé). NIKDY nepřehazuj číslo mezi položkami — "11sl" je VŽDY 11° (ne 12°), "sv 12" je VŽDY 12° (ne 11°).
  - "8", "8°", "vosmička", "osmička", "cyklo", "cykloosma" → stupeň 8°
  - "10", "10°", "desítka", "10sv", "světlé výčepní", "svetle vcepni" → stupeň 10°, světlé
  - "11", "11°", "11sv", "11sl", "11 sl", "sl 11", "sv 11", "sv11", "svetly 11", "svetla 11", "jedenáctka", "jedenactka" → stupeň 11°, světlé
  - "12sv", "12sl", "12 sl", "sl 12", "sv 12", "sv12", "svetly 12", "svetla 12", "12 svetly lezak", "12 svetle lezak", "svetly lezak 12", "ležák", "lezak", "světlý", "svetly", "světlý ležák", "svetly lezak", "ležák světlý" (bez slova "tmavý/tmavy") → stupeň 12°, světlé (STUPEŇ = ČÍSLO nebo výchozí 12°)
  - "12tm", "12 tm", "tm 12", "tmavý", "tmavy", "tmavý ležák", "tmavy lezak" (bez čísla) → stupeň 12°, tmavé (STUPEŇ = ČÍSLO nebo výchozí 12°)
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
  - DŮLEŽITÉ: package_label by měl být vyplněn u VŠECH položek. Vrať null JEN pokud opravdu nejde určit vůbec nic.


- raw_line: přesný text řádku jak ho vidíš
- place_name: název odběratele / místa dodání. VELMI DŮLEŽITÉ — objednávky často uvádí odběratele JEN JEDNOU, u úplně prvního řádku nebo v záhlaví/podpisu zprávy, a další řádky pod ním už žádné jméno odběratele neopakují. V takovém případě MUSÍŠ stejného odběratele přiřadit i všem následujícím položkám, dokud se v textu neobjeví jiný/nový odběratel (pak se přepni na nového a opět ho "děduj" dolů). Jinými slovy: place_name se v datech "táhne" odshora dolů, dokud ho něco nepřepíše. Hledej jméno odběratele i v: jméně WhatsApp kontaktu, podpisu, oslovení, názvu restaurace/hospody v textu. Pokud znáš seznam UŽ EXISTUJÍCÍCH odběratelů (viz níže "ZNÁMÍ ODBĚRATELÉ") a text jen přibližně/foneticky/s překlepem odpovídá jednomu z nich, POUŽIJ PŘESNĚ ten název ze seznamu (stejná diakritika, velká/malá písmena), ne vlastní přepis. Pokud text říká "pro mě"/"mi"/"mně"/"pro mne" (objednávka pro pisatele), použij jméno ODESÍLATELE té zprávy ze seznamu ROZPOZNANÝCH ZPRÁV. Pokud opravdu nelze určit žádného odběratele, vrať null.
- date: DATUM objednávky ve formátu YYYY-MM-DD. Text je export z WhatsApp, kde každá zpráva má časové razítko jako "[12:00, 1.1.2026]" nebo "1.1.2026, 12:00 -". Přečti z časového razítka zprávy, ke které položka patří, a převeď ho na YYYY-MM-DD (např. "1.1.2026" → "2026-01-01"). Pokud zpráva žádné časové razítko nemá, vrať null. DŮLEŽITÉ: pokud je v textu VÍCE zpráv od stejného odběratele v RŮZNÝCH dnech, každá položka musí mít SVÉ datum z té zprávy, ve které se nachází — NESLUČUJ je do jednoho data. Tím se objednávky od stejného odběratele v různých dnech správně rozdělí na samostatné objednávky. POZOR: zápis "7.8" nebo "7. 8." v textu objednávky NENÍ objem ani množství — je to datum (7. srpna). Nezaměňuj ho s "7x8" (množství) nebo "7l" (objem).


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

ROZPOZNANÉ ZPRÁVY (každá zpráva = jeden odesílatel + datum; odesílatel slouží k rozlišení zpráv a k určení date — place_name určuj z textu zprávy, S VÝJIMKOU "pro mě"/"mi"/"mně"/"pro mne", kdy je odběratelem PRÁVĚ odesílatel):
${messagesList}

DŮLEŽITÉ - ODESÍLATEL vs ODBĚRATEL:
- ODESÍLATEL je osoba/telefon, kdo zprávu poslal (např. "Bednář", "Gábina Účetní", "+420...", "Miláček"). Obvykle je to POUZE posel/doručovatel — NIKDY odběratel-hospoda. Jméno odesílatele v place_name VŽDY ignoruj.
- ALE VÝJIMKA — "PRO MĚ" = ODESÍLATEL: Pokud text zprávy objednávky výslovně říká, že objednávka je PRO PISATELE — typicky "pro mě", "pro mne", "mi", "mně", "na mě", "pro sebe" — pak je odběratelem (place_name) ODESÍLATEL té zprávy. Použij PŘESNĚ jeho jméno ze seznamu ROZPOZNANÝCH ZPRÁV (např. text "pro mě na středu 50l" od odesílatele "Sládek P. Bednář" → place_name: "Sládek P. Bednář"). Pozor: "pro měho kamaráda Dana" NENÍ "pro mě" — "měho" znamená "mého" (někoho jiného), tam hledej jméno v textu ("Dan").
- ODBĚRATEL (place_name) je restaurace/hospoda/místo, PRO KTERÉ je objednávka určena. Hledej ho VŽDY VE VLASTNÍM TEXTU OBJEDNÁVKY — typicky u slov jako "pro U Dubu", "objednávka pro U Dubu", "poslat pro U Dubu", "U Dubu objednává", "na U Dubu", nebo v hlavičce/podpisu zprávy.
- POZOR: jméno odesílatele se může objevit UVNITŘ textu jako pozdrav/podpis (např. "Ahoj, tady Miláček", "díky, Miláček"). To NENÍ odběratel — to je jen podpis posla. Odběratel je ten, PRO KOHO je objednávka určena a koho v textu najdeš jako místo určení.
- Pokud text žádného odběratele neobsahuje (a neříká "pro mě"/"mi"/"mně" — viz výjimka výše), vrať place_name = null. NIKDY neodvozuj odběratele z JMÉNA ODESÍLATELE — ani tehdy, když je odesílatel mezi ZNÁMÍMI ODBĚRATELI, a ani tehdy, když to vypadá jako nejpravděpodobnější volba. Odesílatel je vždy jen posel (kromě výjimky "pro mě"). NIKDY nevybírej odběratele ze seznamu ZNÁMÍ ODBĚRATELÉ, který není v textu — to je vymýšlení, vrať raději null.
- Každá položka patří zprávě, pod kterou v textu spadá. Položkám z jedné zprávy přiřaď STEJNÝ place_name (odběratele té zprávy) a STEJNÉ date (datum té zprávy). V každém items vyplň i date (datum zprávy, ke které položka patří).


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
- place_name se dědí odshora dolů — nikdy nenechávej null jen proto, že řádek sám o sobě jméno neobsahuje, pokud ho lze odvodit z PŘEDCHOZÍCH ŘÁDKŮ zprávy. Záhlaví zprávy / jméno odesílatele se pro odběratele NEPOUŽÍVÁ (kromě výjimky "pro mě"/"mi"/"mně"/"pro mne", kdy je odběratelem odesílatel).
- OBECNÉ PRAVIDLO PRO CELÝ VÝSTUP: u beer_name i place_name VŽDY nejprve zkus najít shodu v existujících datech (KATALOG PIV / NAUČENÉ ZKRATKY / ZNÁMÍ ODBĚRATELÉ) — i při nepřesné, fonetické nebo překlepové shodě. Teprve když opravdu nic z existujících dat neodpovídá, ber to jako nové/neznámé (u piva vrať null, u odběratele vrať text tak, jak jsi ho přečetl). Nikdy nepřepisuj/nenahrazuj existující známou položku vlastním vymyšleným textem, pokud shoda s katalogem/seznamem je rozumně možná.

Vrať ČISTĚ JSON (bez markdown, bez \`\`\`), přesně v tomto formátu, a nic jiného:
{"items":[{"quantity":4,"degree":"12°","beer_name":"12° Světlá","package_label":"KEG 50l","raw_line":"Seeberg 4x30 12sv a 2x30 12sv","place_name":"Seeberg","date":"2026-01-01"},{"quantity":2,"degree":"12°","beer_name":"12° Světlá","package_label":"KEG 30l","raw_line":"Seeberg 4x30 12sv a 2x30 12sv","place_name":"Seeberg","date":"2026-01-01"}],"place_name":"Seeberg","raw_text":"celý rozpoznaný text"}

DŮLEŽITÉ — TOP-LEVEL "place_name":
Do odpovědi VŽDY přidej i top-level pole "place_name" (na úrovni celé odpovědi, vedle "items" a "raw_text"). Toto pole = JMÉNO ODBĚRATELE, jehož objednávka je v textu NEJVÝRAZNĚJŠÍ / první / hlavní (obvykle první zpráva nahoře). Pokud je v textu více odběratelů, top-level place_name = ten první/nejvýraznější. Pokud text říká "pro mě"/"mi"/"mně"/"pro mne", použij jméno ODESÍLATELE první/nejvýraznější zprávy. Pokud nelze určit žádného (ať už proto, že v textu žádný není, nebo protože jediný kandidát je jméno odesílatele, aniž by text říkal "pro mě"), vrať null. Příklad bez odběratele: {"items":[...],"place_name":null,"raw_text":"..."}. Toto pole je důležité, protože aplikace ho použije pro vytvoření nové objednávky.
${photoSection}`;


    const groqBody = {
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: `TEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText}\n"""`,
        },
      ],
    };


    const mistralBody = {
      model: "mistral-large-latest",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: `TEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText}\n"""`,
        },
      ],
    };


    let text = "";
    let isOpenAiUsed = false;

    // 1) Primární provider: Google Gemini (nativní JSON mode).
    //    Gemini má velkorysé rate limity (na rozdíl od OpenAI TPM limitů)
    //    a čtení funguje bez kreditů navíc.
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
                { text: `TEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText}\n"""` },
                ...(imageBase64
                  ? [
                      {
                        inline_data: {
                          mime_type: imageMimeType,
                          data: imageBase64,
                        },
                      },
                    ]
                  : []),
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
          const candidate =
            geminiData?.candidates?.[0]?.content?.parts
              ?.map((p: any) => p.text || "")
              .join("") ?? "";
          text = acceptOutput("gemini", candidate, beerNameKeys, pkgLabelKeys);
        } else {
          const errText = await geminiResp.text();
          console.warn(`Gemini API error (status ${geminiResp.status}): ${errText}`);
        }
      } catch (err) {
        console.warn(`Gemini API exception: ${err}`);
      }
    }

    // 2) Fallback: Groq (Llama 3.3 70B). Jakmile Gemini vrátí chybu nebo vyčerpá
    //    denní limit (HTTP 429/500), přepneme OKAMŽITĚ (bez čekání, řádově 0,5 s),
    //    takže čtení objednávek z WhatsAppu funguje 24/7 bez přerušení.
    if (!text && groqKey) {
      try {
        const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
        const groqResp = await fetch(groqUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${groqKey}`,
          },
          body: JSON.stringify(groqBody),
        });

        if (groqResp.ok) {
          const groqData = await groqResp.json();
          const candidate = groqData?.choices?.[0]?.message?.content ?? "";
          text = acceptOutput("groq", candidate, beerNameKeys, pkgLabelKeys);
        } else {
          const errText = await groqResp.text();
          console.warn(`Groq API error (status ${groqResp.status}): ${errText}`);
        }
      } catch (err) {
        console.warn(`Groq API exception: ${err}`);
      }
    }

    // 3) Další pojistka: Mistral (mistral-large-latest). Když vyčerpá limit
    //    i Groq (HTTP 429/500), přepneme OKAMŽITĚ dál — bez čekání, řádově 0,5 s.
    if (!text && mistralKey) {
      try {
        const mistralUrl = "https://api.mistral.ai/v1/chat/completions";
        const mistralResp = await fetch(mistralUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mistralKey}`,
          },
          body: JSON.stringify(mistralBody),
        });

        if (mistralResp.ok) {
          const mistralData = await mistralResp.json();
          const candidate = mistralData?.choices?.[0]?.message?.content ?? "";
          text = acceptOutput("mistral", candidate, beerNameKeys, pkgLabelKeys);
        } else {
          const errText = await mistralResp.text();
          console.warn(`Mistral API error (status ${mistralResp.status}): ${errText}`);
        }
      } catch (err) {
        console.warn(`Mistral API exception: ${err}`);
      }
    }

    // 4) Poslední záchrana: OpenAI (gpt-4o-mini) — kdyby selhaly Gemini, Groq i Mistral.
    if (!text && openaiKey) {
      isOpenAiUsed = true;
      const openaiBody = {
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: prompt,
          },
          {
            role: "user",
            content: imageBase64
              ? [
                  { type: "text", text: `TEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText}\n"""` },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${imageMimeType};base64,${imageBase64}`,
                    },
                  },
                ]
              : `TEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText}\n"""`,
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
      const candidate = openaiData?.choices?.[0]?.message?.content ?? "";
      text = acceptOutput("openai", candidate, beerNameKeys, pkgLabelKeys);
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Failed to get response from any LLM provider (Gemini, Groq, Mistral, OpenAI)" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // text už prošel validací (acceptOutput), ale parse proběhne tady.
    const finalJson = cleanJson(text);
    if (!finalJson.ok) {
      return new Response(
        JSON.stringify({ error: "All LLM providers returned unparseable JSON output" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let parsed = finalJson.parsed as AiResponse;

    // 🧹 Deduplikace odpovědi — každou objednávku přečíst jen jednou.
    if (Array.isArray(parsed.items)) {
      parsed.items = dedupeItems(parsed.items);
    }

    // Normalizace typů (model někdy vynechá raw_line apod.).
    parsed.items = (parsed.items ?? []).map((it) => ({
      quantity: typeof it.quantity === "number" ? it.quantity : null,
      degree: typeof it.degree === "string" ? it.degree : null,
      beer_name: typeof it.beer_name === "string" ? it.beer_name : null,
      package_label: typeof it.package_label === "string" ? it.package_label : null,
      raw_line: typeof it.raw_line === "string" ? it.raw_line : "",
      place_name: typeof it.place_name === "string" ? it.place_name : null,
      date: typeof it.date === "string" ? it.date : null,
    }));

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
