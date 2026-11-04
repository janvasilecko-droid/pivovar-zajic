"""Přehledy témat: Claude porovná, co o tématu píšou knihy, a napíše to nejlepší s odkazy.

Majitel 3. 11. 2026: „když zadám chmelovar, vyhledáš data z těch knih, porovnáš
je a napíšeš to nejlepší o chmelovaru", „s tím, že tam budou odkazy na knihy"
a „až budou načteny všechny knihy a přeloženy, případně pokud se načte nová
kniha, tak to doplnit o nová fakta".

Jak:
- pro každé téma se v knihovně najdou pasáže (bible_hledej — originál i český
  překlad) podle několika dotazů česky, anglicky a německy;
- Claude dostane JEN tyto úryvky, očíslované [1]…[n], a napíše česky přehled:
  to nejdůležitější pro praxi, kde se knihy shodují a kde liší; každé tvrzení
  s citací [n]. Z vlastních znalostí nic nepřidává;
- citace se v appce zobrazí jako odkaz kniha – strana a otevřou čtečku;
- kontrola: neexistující citace se odstraní a ohlásí, čísla v přehledu se
  porovnají se zdroji — co ve zdrojích není, dostane upozornění „ověř";
- přehled se přepíše jen když se změnily jeho zdroje (otisk) — nová kniha nebo
  nový překlad = nová fakta; jinak zůstává.

Do logu odsud nejde nic z textu knih (repo i logy Actions jsou veřejné).
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field

import ocr

# prehled-2 (4. 11. 2026): citace ve tvaru [2, 5] / [2–5] se dřív nepoznaly (19 z 36 přehledů bez odkazů) —
# nová verze změní otisk, takže se všechny přehledy napíšou znovu.
PREHLED_VERZE = 'prehled-2'
MAX_ZDROJU = 24
ZNAKU_ZDROJE = 2500
NA_DOTAZ = 12

# Témata podle oblastí A–T (src/lib/bibleOblasti.ts). Dotazy: všechna slova
# jednoho dotazu musí být na jedné stránce, hledají se začátky slov; české
# dotazy najdou překlady, anglické a německé originály.
TEMATA: list[dict] = [
    {'klic': 'slad', 'nazev': 'Slad a sladování', 'oblast': 'A', 'dotazy': ['sladování', 'hvozdění', 'malting', 'kilning', 'Mälzerei']},
    {'klic': 'jecmen', 'nazev': 'Ječmen a jakost sladu', 'oblast': 'A', 'dotazy': ['ječmen', 'barley', 'Gerste', 'malt quality', 'friabilita']},
    {'klic': 'chmel', 'nazev': 'Chmel a hořké látky', 'oblast': 'A', 'dotazy': ['chmel', 'alfa kyseliny', 'hops', 'alpha acids', 'Hopfen']},
    {'klic': 'voda', 'nazev': 'Varní voda a její úprava', 'oblast': 'B', 'dotazy': ['varní voda', 'tvrdost', 'brewing water', 'alkalinity', 'Brauwasser']},
    {'klic': 'ph', 'nazev': 'pH rmutu a mladiny', 'oblast': 'B', 'dotazy': ['pH rmutu', 'mash pH', 'wort pH', 'pH-Wert']},
    {'klic': 'srotovani', 'nazev': 'Šrotování', 'oblast': 'C', 'dotazy': ['šrotování', 'šrot', 'milling', 'grist', 'Schrot']},
    {'klic': 'rmutovani', 'nazev': 'Rmutování', 'oblast': 'D', 'dotazy': ['rmutování', 'rmut', 'mashing', 'Maischen']},
    {'klic': 'enzymy', 'nazev': 'Enzymy a teplotní prodlevy', 'oblast': 'D', 'dotazy': ['amyláza', 'prodleva', 'amylase', 'rest temperature', 'Rast']},
    {'klic': 'dekokce', 'nazev': 'Dekokční a infuzní rmutování', 'oblast': 'D', 'dotazy': ['dekokce', 'infuze', 'decoction', 'infusion', 'Dekoktion']},
    {'klic': 'scezovani', 'nazev': 'Scezování', 'oblast': 'E', 'dotazy': ['scezování', 'scezovací káď', 'lautering', 'lauter tun', 'Läutern']},
    {'klic': 'vyslazovani', 'nazev': 'Vyslazování a výtěžnost', 'oblast': 'E', 'dotazy': ['vyslazování', 'výtěžnost', 'sparging', 'brewhouse yield', 'Ausbeute']},
    {'klic': 'chmelovar', 'nazev': 'Chmelovar', 'oblast': 'F', 'dotazy': ['chmelovar', 'odpar', 'wort boiling', 'evaporation', 'Würzekochen']},
    {'klic': 'chmeleni', 'nazev': 'Chmelení a hořkost (IBU)', 'oblast': 'F', 'dotazy': ['chmelení', 'hořkost', 'hopping', 'bitterness', 'IBU']},
    {'klic': 'kaly', 'nazev': 'Kaly a vířivá káď', 'oblast': 'F', 'dotazy': ['vířivá káď', 'kaly', 'whirlpool', 'trub', 'Trub']},
    {'klic': 'dms', 'nazev': 'DMS a těkavé látky', 'oblast': 'F', 'dotazy': ['DMS', 'dimethylsulfid', 'dimethyl sulfide', 'Dimethylsulfid']},
    {'klic': 'chlazeni', 'nazev': 'Chlazení a provzdušnění mladiny', 'oblast': 'G', 'dotazy': ['chlazení mladiny', 'provzdušnění', 'wort cooling', 'aeration', 'Würzekühlung']},
    {'klic': 'kvasinky', 'nazev': 'Kvasinky a zakvašení', 'oblast': 'H', 'dotazy': ['kvasnice', 'zakvašení', 'yeast', 'pitching', 'Hefe']},
    {'klic': 'kvaseni', 'nazev': 'Hlavní kvašení', 'oblast': 'H', 'dotazy': ['hlavní kvašení', 'kvašení', 'fermentation', 'Gärung']},
    {'klic': 'prokvaseni', 'nazev': 'Prokvašení a extrakt', 'oblast': 'H', 'dotazy': ['prokvašení', 'stupňovitost', 'attenuation', 'original gravity', 'Vergärungsgrad']},
    {'klic': 'diacetyl', 'nazev': 'Diacetyl a vedlejší produkty kvašení', 'oblast': 'H', 'dotazy': ['diacetyl', 'estery', 'esters', 'higher alcohols', 'Diacetyl']},
    {'klic': 'zrani', 'nazev': 'Dokvašování a zrání', 'oblast': 'I', 'dotazy': ['dokvašování', 'zrání', 'maturation', 'lagering', 'Lagerung']},
    {'klic': 'karbonizace', 'nazev': 'Oxid uhličitý a sycení', 'oblast': 'I', 'dotazy': ['oxid uhličitý', 'sycení', 'carbon dioxide', 'carbonation', 'Kohlensäure']},
    {'klic': 'filtrace', 'nazev': 'Filtrace piva', 'oblast': 'J', 'dotazy': ['filtrace', 'křemelina', 'filtration', 'kieselguhr', 'Filtration']},
    {'klic': 'stabilita', 'nazev': 'Koloidní a chuťová stabilita', 'oblast': 'J', 'dotazy': ['stabilita', 'zákal', 'stability', 'haze', 'Trübung']},
    {'klic': 'staceni', 'nazev': 'Stáčení a balení', 'oblast': 'K', 'dotazy': ['stáčení', 'lahve', 'packaging', 'bottling', 'Abfüllung']},
    {'klic': 'pasterace', 'nazev': 'Pasterace', 'oblast': 'K', 'dotazy': ['pasterace', 'pasteurization', 'PU', 'Pasteurisation']},
    {'klic': 'cip', 'nazev': 'Sanitace a CIP', 'oblast': 'L', 'dotazy': ['sanitace', 'CIP', 'cleaning', 'Reinigung']},
    {'klic': 'kontaminace', 'nazev': 'Kontaminace a mikrobiologie', 'oblast': 'M', 'dotazy': ['kontaminace', 'bakterie', 'contamination', 'bacteria', 'Kontamination']},
    {'klic': 'laborator', 'nazev': 'Laboratorní rozbory', 'oblast': 'N', 'dotazy': ['rozbor', 'stanovení', 'analysis', 'determination', 'Analyse']},
    {'klic': 'barva', 'nazev': 'Barva piva (EBC)', 'oblast': 'N', 'dotazy': ['barva', 'EBC', 'colour', 'color', 'Farbe']},
    {'klic': 'pena', 'nazev': 'Pěna a říz', 'oblast': 'N', 'dotazy': ['pěna', 'pěnivost', 'foam', 'Schaum']},
    {'klic': 'varna', 'nazev': 'Varna a zařízení', 'oblast': 'O', 'dotazy': ['varna', 'mladinová pánev', 'brewhouse', 'kettle', 'Sudhaus']},
    {'klic': 'tanky', 'nazev': 'Kvasné a ležácké tanky', 'oblast': 'O', 'dotazy': ['tank', 'cylindrokónický', 'fermenter', 'cylindroconical', 'Tank']},
    {'klic': 'cerpadla', 'nazev': 'Čerpadla a potrubí', 'oblast': 'P', 'dotazy': ['čerpadlo', 'potrubí', 'pump', 'piping', 'Pumpe']},
    {'klic': 'energie', 'nazev': 'Energie a teplo ve varně', 'oblast': 'R', 'dotazy': ['energie', 'spotřeba tepla', 'energy', 'heat recovery', 'Energie']},
    {'klic': 'vady', 'nazev': 'Vady piva a jejich příčiny', 'oblast': 'T', 'dotazy': ['vada', 'příchuť', 'off-flavour', 'off-flavor', 'Fehlgeschmack']},
]

PROMPT = """Jsi zkušený hlavní sládek a odborný autor. Dostaneš očíslované úryvky z odborných pivovarských knih
a napíšeš česky přehled jednoho tématu: to nejlepší a nejdůležitější pro praxi pivovaru.
- Piš JEN z přiložených úryvků. Nic nepřidávej z vlastních znalostí; co úryvky neříkají, nepiš.
- Každé tvrzení, hodnotu a doporučení označ citací zdroje: číslo úryvku v hranatých závorkách, každé číslo
  ve vlastních závorkách — [3], více zdrojů [2][5]. Nikdy nepiš [2, 5], [2–5], (2) ani „zdroj 2".
  Používej jen čísla přiložených úryvků.
- Porovnej zdroje: kde se shodují, napiš to jednou s více citacemi; kde se liší, uveď hodnoty z jednotlivých
  knih vedle sebe (např. „62–65 °C [1], 63 °C [4]").
- Čísla, rozsahy a jednotky opiš přesně jako ve zdroji (nic nepřepočítávej, nezaokrouhluj).
- Struktura: nejdřív 2–4 věty shrnutí, pak oddíly „## …" (např. Princip, Doporučené hodnoty, Postup,
  Na co si dát pozor), případně Markdown tabulka hodnot podle zdrojů. Odborná čeština, bez vaty.
- Když úryvky k tématu skoro nic neříkají, napiš krátce, co v nich je, a že knihovna k tématu víc nemá."""

SCHEMA = {
    'type': 'object',
    'properties': {'text': {'type': 'string'}},
    'required': ['text'],
    'additionalProperties': False,
}


@dataclass
class Zdroj:
    dokument_id: str
    nazev: str
    zdroj: str            # original / preklad
    pdf_index: int
    tistena_strana: str | None
    kapitola: str | None
    text: str


@dataclass
class Prehled:
    text: str | None
    kontrola: str | None
    usage: dict
    pouzite: list[int] = field(default_factory=list)
    surovy: str | None = None   # text, jak ho napsal model (jen pro počty tvarů citací v logu)


def vyber_zdroje(radky_po_dotazech: list[list[dict]], max_zdroju: int = MAX_ZDROJU) -> list[Zdroj]:
    """Zdroje pro přehled: bez duplicit (stejná strana jen jednou), střídavě z knih
    (ať jedna kniha nepřeválcuje ostatní), v pořadí skóre."""
    videne: set[tuple[str, int]] = set()
    po_knihach: dict[str, list[Zdroj]] = {}
    kandidati = sorted((r for radky in radky_po_dotazech for r in radky), key=lambda r: -float(r.get('skore') or 0))
    for r in kandidati:
        klic = (str(r['dokument_id']), int(r['pdf_index']))
        text = str(r.get('text') or '').strip()
        if klic in videne or not text:
            continue
        videne.add(klic)
        po_knihach.setdefault(klic[0], []).append(Zdroj(
            dokument_id=klic[0], nazev=str(r.get('nazev') or 'Kniha'), zdroj=str(r.get('zdroj') or 'original'),
            pdf_index=klic[1], tistena_strana=r.get('tistena_strana'), kapitola=r.get('kapitola'),
            text=text[:ZNAKU_ZDROJE]))
    vybrane: list[Zdroj] = []
    fronty = list(po_knihach.values())
    while fronty and len(vybrane) < max_zdroju:
        for f in list(fronty):
            if not f:
                fronty.remove(f)
                continue
            vybrane.append(f.pop(0))
            if len(vybrane) >= max_zdroju:
                break
    return vybrane


def otisk_zdroju(zdroje: list[Zdroj]) -> str:
    """Otisk zdrojů přehledu: změní se, když přibude nebo se změní pasáž (nová kniha, nový překlad)."""
    h = hashlib.md5(PREHLED_VERZE.encode())
    for z in sorted(zdroje, key=lambda z: (z.dokument_id, z.pdf_index, z.zdroj)):
        h.update(f'{z.dokument_id}|{z.pdf_index}|{z.zdroj}|'.encode())
        h.update(hashlib.md5(z.text.encode('utf-8')).digest())
    return h.hexdigest()


def _misto(z: Zdroj) -> str:
    return f's. {z.tistena_strana}' if z.tistena_strana else f'list {z.pdf_index}'


def zadani(tema: dict, zdroje: list[Zdroj]) -> str:
    casti = [f'Téma: {tema["nazev"]}\n\nÚryvky z knih:']
    for i, z in enumerate(zdroje, 1):
        jazyk = 'český překlad' if z.zdroj == 'preklad' else 'originál'
        kap = f', kapitola „{z.kapitola}"' if z.kapitola else ''
        casti.append(f'[{i}] {z.nazev}, {_misto(z)}{kap} ({jazyk}):\n<uryvek>\n{z.text}\n</uryvek>')
    casti.append(f'Napiš přehled tématu „{tema["nazev"]}" podle pravidel.')
    return '\n\n'.join(casti)


_CITACE = re.compile(r'\[(\d{1,3})\]')
# Skupina citací, jak ji model občas napíše: [2, 5], [2,5], [2; 5], [2–5], [2-5], [2 a 5], [zdroj 2].
_SKUPINA = re.compile(
    r'\[((?:\s*(?:zdroje?|zdrojích|viz|č\.)\s*)?\d{1,3}(?:\s*(?:,|;|–|-|\ba\b|\band\b)\s*\d{1,3})+\s*'
    r'|\s*(?:zdroje?|zdrojích|viz|č\.)\s*\d{1,3}\s*)\]', re.I)
_SLOVA_CITACE = re.compile(r'(?i)zdrojích|zdroje?|viz|č\.')


def normalizuj_citace(text: str) -> str:
    """[2, 5] / [2–4] / [zdroj 2] → [2][5] / [2][3][4] / [2], ať citace pozná appka i kontrola."""
    def nahrad(m: re.Match) -> str:
        obsah = _SLOVA_CITACE.sub('', m.group(1)).strip()
        cisla: list[int] = []
        for cast in re.split(r'\s*(?:,|;|\ba\b|\band\b)\s*', obsah):
            rozsah = re.fullmatch(r'(\d{1,3})\s*[–-]\s*(\d{1,3})', cast)
            if rozsah:
                a, b = int(rozsah.group(1)), int(rozsah.group(2))
                cisla += list(range(a, b + 1)) if 0 < b - a <= 30 else [a, b]
            elif cast.isdigit():
                cisla.append(int(cast))
        return ''.join(f'[{c}]' for c in dict.fromkeys(cisla)) or m.group(0)
    return _SKUPINA.sub(nahrad, text)


def tvary_citaci(text: str) -> dict:
    """Počty tvarů citací v textu (jen čísla do logu — žádný text knihy)."""
    return {
        'jednotlive': len(_CITACE.findall(text or '')),
        'skupiny': len(_SKUPINA.findall(text or '')),
        'zavorky': len(re.findall(r'\(\s*\d{1,3}(?:\s*[,;–-]\s*\d{1,3})*\s*\)', text or '')),
        'horni_index': len(re.findall(r'[¹²³⁴⁵⁶⁷⁸⁹⁰]+', text or '')),
    }


# Číslování odrážek a nadpisů („1. Rmut…", „## 3.2 Rmutování") není údaj z knihy.
_CISLOVANI = re.compile(r'^(\s*(?:#{1,6}\s*|[-*+]\s+)?)\d{1,3}(?:\.\d{1,3})*[.)]?(?=\s)', re.M)


def zkontroluj(text: str, zdroje: list[Zdroj]) -> tuple[str, str | None, list[int]]:
    """Odstraní citace mimo rozsah zdrojů a porovná čísla přehledu se zdroji.

    Vrátí (text, důvod ke kontrole nebo None, použité zdroje). Číslo, které není
    v žádném zdroji, je podezřelé (přehled ho nesmí mít odjinud).
    """
    n = len(zdroje)
    spatne = 0
    text = normalizuj_citace(text)

    def oprav(m: re.Match) -> str:
        nonlocal spatne
        k = int(m.group(1))
        if 1 <= k <= n:
            return m.group(0)
        spatne += 1
        return ''

    cisty = _CITACE.sub(oprav, text)
    pouzite = sorted({int(k) for k in _CITACE.findall(cisty)})
    ve_zdrojich = ocr.cisla('\n'.join(z.text for z in zdroje))
    bez_citaci = _CISLOVANI.sub(r'\1', _CITACE.sub('', cisty))
    cizi = [c for c in ocr.cisla(bez_citaci) if c not in ve_zdrojich]
    duvody = []
    if spatne:
        duvody.append(f'{spatne} citací mimo zdroje bylo odstraněno')
    if cizi:
        duvody.append(f'{len(cizi)} čísel v přehledu není v citovaných knihách — ověř')
    if not pouzite:
        duvody.append('přehled nemá žádnou citaci — ověř')
    return cisty, ('; '.join(duvody) or None), pouzite


def napis_prehled(klient, tema: dict, zdroje: list[Zdroj], model: str, max_tokens: int = 8000) -> Prehled:
    """Jeden přehled tématu. Výjimky API nechává projít — řeší je volající."""
    parametry = {
        'model': model,
        'max_tokens': max_tokens,
        'system': PROMPT,
        'output_config': {'effort': 'high', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': zadani(tema, zdroje)}]}],
    }
    mysleni = ocr.mysleni_pro_model(model)
    if mysleni is not None:
        parametry['thinking'] = mysleni
    odpoved = klient.messages.create(**parametry)
    usage = ocr.usage_jako_dict(odpoved.usage)
    if odpoved.stop_reason in ('refusal', 'max_tokens'):
        return Prehled(None, None, usage)
    blok = next((b.text for b in odpoved.content if getattr(b, 'type', '') == 'text'), '')
    try:
        data = json.loads(blok)
    except (json.JSONDecodeError, TypeError):
        return Prehled(None, None, usage)
    text = str(data.get('text') or '').strip() if isinstance(data, dict) else ''
    if not text:
        return Prehled(None, None, usage)
    cisty, kontrola, pouzite = zkontroluj(text, zdroje)
    return Prehled(cisty, kontrola, usage, pouzite, surovy=text)


def radek_zdroje(i: int, z: Zdroj) -> dict:
    """Citace pro appku: číslo, kniha a místo (odkaz otevře čtečku). Bez textu knihy."""
    return {'n': i, 'dokument_id': z.dokument_id, 'nazev': z.nazev, 'pdf_index': z.pdf_index,
            'tistena_strana': z.tistena_strana, 'kapitola': z.kapitola, 'zdroj': z.zdroj}
