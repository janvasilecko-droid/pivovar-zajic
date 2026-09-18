// 📖 Jak se v Pivovaru Zajíc píšou objednávky — společná pravidla pro VŠECHNY
// tři cesty, kterými objednávka do aplikace přijde:
//   • parse-order-image   (fotka/screenshot — 112 ze 165 objednávek)
//   • parse-order-text    (přepis hlasu, e-mail, ruční vložení)
//   • whatsapp-auto-parse (zprávy ze skupiny „Objednávky pivovar" — 45)
//
// Proč společně: každý z těch tří promptů si dřív držel vlastní kopii pravidel
// a kopie se rozešly. Stejná zpráva se pak přečetla jinak podle toho, kudy
// přišla. Tenhle soubor je jediný zdroj pravdy; prompty ho vkládají doslova.
//
// Pravidla níže NEJSOU vymyšlená — vznikla porovnáním toho, co AI přečetla,
// s tím, co po kontrole člověkem doopravdy vzniklo (42 WhatsApp objednávek
// s doloženým importem, z toho 6 muselo být opraveno, plus 177 naučených
// zkratek z ručních oprav). Každý bod má u sebe reálný příklad.

/**
 * Rozlišení „je to stupeň, nebo objem sudu?" — nejčastější zdroj špatně
 * přiřazených položek. Vychází z katalogu: sudy jsou 10/15/20/30/50 l,
 * stupně piv 8/10/11/12/13. Překrývá se JEDINÉ číslo — 10.
 */
export const CISLA_STUPEN_VS_OBJEM = `
════════════════════════════════════════════════════════════════════
ROZHODOVACÍ TABULKA: STUPEŇ vs. OBJEM SUDU (nejdůležitější pravidlo)
════════════════════════════════════════════════════════════════════
Pivovar má sudy JEN v objemech 10, 15, 20, 30 a 50 litrů.
Piva má JEN ve stupních 8, 10, 11, 12 a 13.
Z toho plyne tvrdé pravidlo, které NIKDY neporušuj:

  • 11, 12, 13 a 8  →  je to VŽDY STUPEŇ PIVA. Sud takové velikosti
    NEEXISTUJE. "2x 12" znamená 2 kusy piva 12°, NIKDY ne 12litrový sud.
  • 15, 20, 30, 50  →  je to VŽDY OBJEM SUDU. Pivo takového stupně
    NEEXISTUJE. "8x30" znamená 8 kusů 30l sudu, NIKDY ne pivo 30°.
  • 10  →  JEDINÉ dvojznačné číslo (je i sud 10l, i pivo 10°).
    Rozhodni takto, v tomto pořadí:
      1) Je na řádku jiný jednoznačný stupeň (11sv, 12°, 8, jméno piva)?
         → potom je 10 OBJEM SUDU.
         Příklad: "Plus 3x10 11sv" = 3 kusy sudu 10l piva 11° Světlá.
         (Tohle je skutečná objednávka z 25. 8. 2026, kterou AI přečetla
         jako 10° Desítku — protože „10" vzala jako stupeň.)
      2) Jde o PET/lahve (v textu „pet", „petka", „lahev", „0,5", „1,5")?
         → potom je 10 STUPEŇ (PET desetilitrový neexistuje).
         Příklad: "pet. pivo 4x 10" = 4 kusy PET piva 10°.
      3) Jinak je 10 OBJEM SUDU (u sudů je to častější).

  • Číslo hned za "x" nebo "×" je objem NEBO stupeň podle tabulky výše;
    číslo PŘED "x" je vždy MNOŽSTVÍ. "14x30" = 14 kusů, 30l sud.
`;

/**
 * Vzory zápisu, které se v objednávkách opakují. Každý z nich AI aspoň jednou
 * přečetla špatně — proto jsou tady i s tím konkrétním případem.
 */
export const VZORY_ZAPISU = `
════════════════════════════════════════════════════════════════════
JAK ODBĚRATELÉ PÍŠOU — OPAKUJÍCÍ SE VZORY
════════════════════════════════════════════════════════════════════
A) PIVO ŘEČENÉ JEDNOU PLATÍ PRO VŠECHNY OBALY ZA NÍM (na tomtéž řádku)
   "SV 12 = 4x50l KEG + 24x1,5l PET + 20x0,5l lahev"
   → VŠECHNY tři položky jsou 12° Světlá. Ne jen ta první.
   Skutečná chyba: AI dala první položce 12° a PETce 11°.
   Totéž zprava: "lokalka 10x50l 2x20l 12sv" — stupeň je až na konci
   a platí pro OBA sudy.

B) STUPEŇ JAKO NADPIS ODSTAVCE
   Duck and Dog:
       11%
       14x30
       10x20
       6x50
       12%
       2x50
   → Nadpis "11%" platí pro všechny řádky POD ním až do dalšího nadpisu.
   Tedy 14×30l, 10×20l a 6×50l je 11°; 2×50l je 12°.
   Nadpisem může být "11%", "11°", "11sv", "12 tmavá", "PET:", "Sudy:".

C) OBJEM PRVNÍ, PIVO AŽ ZA NÍM, POLOŽKY ODDĚLENÉ ČÁRKOU
   "50l Vosma, 30l 11sv"
   → DVĚ samostatné položky: 1×50l Osma A 1×30l 11° Světlá.
   Každá má SVOJE pivo — nepřenášej pivo přes čárku.
   Skutečná chyba: AI spojila "Vosma" s "30l" a udělala z toho Osmu 30l.

D) "VŠE [stupeň]" NA KONCI PLATÍ PRO CELOU OBJEDNÁVKU
   "malenovice 7x30 2x10 1x20 vse 10sv" → všechny tři položky 10° Desítka.
   (Pozor: "2x10" je tady sud 10l, protože stupeň dodává "vse 10sv".)

E) MNOŽSTVÍ BEZ "x"
   "3 50 svetle" = 3 kusy 50l světlé. "sluhy 10 30 litru 10°" = 10 kusů
   30l piva 10°. První číslo je množství, druhé objem podle tabulky.

F) VLASTNÍ JMÉNA PIV JSOU SILNĚJŠÍ NEŽ ČÍSLA
   Jantar, Summer Ale, Citron, Grep, Hazy Spring Day a Osma se poznají
   podle JMÉNA, ne podle stupně:
     • "jantar", "jant", "jantarek", "jantar 12"  → VŽDY pivo Jantar.
       Číslo u slova jantar NEZNAMENÁ 12° Světlou.
     • "summer", "sumr", "SA"                     → Summer Ale
     • "vosma", "osma", "8my", "cyklo", "cyklistická" → Osma
     • "limo citron", "citr", "cit."              → Citron
     • "limo grep"                                → Grep
   Když je v textu jméno piva, má přednost před jakýmkoli stupněm.
`;

/**
 * Co dělat, když si AI není jistá. Vychází z toho, že špatně přiřazená
 * položka stojí víc práce než prázdná — obsluha objednávku stejně kontroluje.
 */

/**
 * Odpovědi a kontext — nejčastější zdroj špatně zapsaných objednávek v září
 * 2026. Všechny příklady níž jsou skutečné zprávy ze skupiny „Objednávky
 * pivovar" a u každé je napsané, co se stalo špatně.
 */
export const KONTEXT_A_ODPOVEDI = `
════════════════════════════════════════════════════════════════════
ODPOVĚDI NA ZPRÁVY (WhatsApp reply) A KONTEXT KONVERZACE
════════════════════════════════════════════════════════════════════
Ve skupině se na objednávku běžně ODPOVÍDÁ a ta odpověď s ní něco dělá.
Nejdřív rozhodni CO, teprve pak čti čísla. Jsou jen čtyři možnosti:

1) ÚPRAVA — odpověď říká, co má být JINAK.
   „Nakonec summer 9x30"       → z 15 dělá 9, nepřičítá
   „Bez summera"               → tu položku z objednávky odeber
   „30 litrů, ne 20??"         → mění OBAL, ne množství
   ⚠️ Mění se JEN to, co odpověď jmenuje. „Ty malé sudy budou 2x20l,
   třicítky a petky sedí" = přepiš malé sudy, TŘICÍTKY A PETKY NECHEJ BÝT.
   (Z provozu: bralo se to jako celý nový obsah, takže z objednávky
   vypadly 2 třicítky a 24 petek, o kterých odběratel napsal, že sedí.)

2) PŘÍDAVEK — odpověď něco PŘIDÁVÁ k tomu, co už je.
   „Plus 3x10 11sv", „ještě dvě dvanáctky", „pro Radka ještě tohle"
   → původní položky zůstávají, tyhle se přičtou.

3) VLASTNÍ OBJEDNÁVKA, která na cizí zprávu jen navazuje.
   Odpověď na Radkovu objednávku: „60x0,5l. Grep a 40x0,5l. Citrón"
   → Radkovu objednávku NEMĚNÍ. Je to samostatná objednávka; z citované
   zprávy se převezme JEN ODBĚRATEL, protože v odpovědi napsaný není.
   Poznáš to tak, že odpověď nemluví o tom, co je v původní zprávě
   (jiná piva, jiné obaly) a neobsahuje slova jako „nakonec", „bez",
   „místo", „plus", „ještě".

4) VRÁCENÍ — odpověď mluví o tom, že se pivo VRACÍ.
   „Tady vrací 1x50l. Vosmy a jednu vosmu roztočenou, téměř plnou"
   → NENÍ TO OBJEDNÁVKA. Vrať items prázdné a do "otazky" napiš, že jde
   o vrácení. (Z provozu: založila se z toho objednávka na dvě padesátky,
   která nikdy nepojede, a pivo se odepsalo ze skladu.)
   ⚠️ Množství BEZ NAPSANÉHO PIVA („vrací 3x30") jsou prázdné obaly, ne
   pivo — sudy se vracejí pořád, pivo v nich skoro nikdy.
   ⚠️ „vratné lahve" a „vratný sud" v objednávce vrácení NEJSOU — to jsou
   obaly, které se v objednávkách píšou běžně.

ODBĚRATEL U ODPOVĚDI
• Když odpověď odběratele nejmenuje, je to ten z CITOVANÉ zprávy.
  Nehádej ho z jiných zpráv v chatu.
• Jména se skloňují: „pro Radka" = odběratel „Radek". Ber i obecnou
  češtinu s předsazeným v-: „Vosmy" = pivo „Osma", „vokno" = „okno".

ČEMU NEPODLÉHAT
• Zprávu, na kterou se odpovídá, čti kvůli KONTEXTU — ale NIKDY z ní
  neber položky do téhle objednávky, pokud nejde o úpravu nebo přídavek.
• Stupeň z jiné zprávy nebo od jiného odběratele se NEPŘENÁŠÍ nikdy.
`;

export const KDYZ_NEVIS = `
════════════════════════════════════════════════════════════════════
KDYŽ SI NEJSI JISTÝ
════════════════════════════════════════════════════════════════════
• Radši NEVYPLNĚNO než UHÁDNUTO. Obsluha každou objednávku kontroluje;
  prázdné pole opraví za pár vteřin, ale špatně přiřazené pivo přehlédne
  a odjede k odběrateli. Když pivo neurčíš jednoznačně, vrať
  beer_name: null a degree: null.
• NIKDY neber stupeň z JINÉ objednávky nebo jiného odběratele na stejné
  fotce. Stupeň platí jen tam, kde je napsaný (nebo kde ho určuje nadpis
  či "vše [stupeň]" TÉ SAMÉ objednávky).
• NIKDY si nevymýšlej položku, která v textu není. Když řádek nepřečteš,
  vrať ho s null hodnotami a doslovně ho opiš do raw_line.
• Množství nikdy nehádej „aby to sedělo". Když u položky číslo není,
  nech quantity: null.

KDYŽ TO NEJDE ROZHODNOUT — ZEPTEJ SE
Máš k tomu pole "otazky" (seznam vět). Napiš do něj krátkou otázku pro
obsluhu vždycky, když by sis jinak musel vybrat mezi dvěma výklady.
Obsluha zprávu stejně kontroluje; otázka ji stojí vteřinu, špatně
uhádnutá objednávka odjede k odběrateli.

Ptej se hlavně na tohle:
  • „Je '2x10' deset kusů 10° piva, nebo dva sudy 10 l?"
  • „Má tahle odpověď původní objednávku upravit, nebo je to nová?"
  • „Ve zprávě není odběratel a nedá se odvodit z citace — pro koho to je?"
  • „Zpráva mluví o vracení — mám to zapsat jako vrácení, ne objednávku?"
  • „U '3x30' není napsané pivo — jsou to prázdné obaly?"

Pravidla pro otázky:
  • Piš je česky, celou větou a konkrétně: vždy odcituj kus zprávy,
    které se otázka týká. Ne „nejasná položka", ale „U '5x30' není
    napsané pivo — které to má být?"
  • Nejvýš tři otázky na zprávu. Když je nejasností víc, zeptej se na ty,
    které mění MNOŽSTVÍ nebo ODBĚRATELE.
  • Otázka NENAHRAZUJE položky: co přečíst jde, přečti a vrať v items;
    otázka je jen k tomu, co zbylo nejisté.
  • Když je všechno jasné, vrať "otazky": [].
`;

/** Celý blok pravidel k vložení do promptu. */
export const PRAVIDLA_CTENI_OBJEDNAVEK = `${CISLA_STUPEN_VS_OBJEM}${VZORY_ZAPISU}${KONTEXT_A_ODPOVEDI}${KDYZ_NEVIS}`;
