"""Český překlad stran cizojazyčných knih (Claude, předplatné nebo API).

Majitel 3. 11. 2026: „je to anglicky, musí tam být i překlad do češtiny".
Po zpracování knihy se každá strana přeloží do češtiny a uloží vedle
originálu (bible_strany.preklad). Originál zůstává nedotčený — čtení v appce
přepíná Česky / Originál a čísla se dají ověřit v originále.

Kontrola: čísla v překladu se porovnají s originálem (překlad je nesmí měnit,
prompt chce čísla přesně tak, jak jsou). Když nesedí, překlad se uloží
s upozorněním „ověř v originále" — nic se tiše nepouští dál jako správné.

Překlad platí k textu, ze kterého vznikl (preklad_zdroj = md5 textu; DB
z toho počítá preklad_platny). Změní-li se text strany novým zpracováním,
starý překlad přestane platit a strana se přeloží znovu.

Do logu odsud nejde nic z textu stránky (repo i logy Actions jsou veřejné).
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass

import ocr

# Verze promptu překladu (při změně promptu se nové překlady poznají podle verze).
PREKLAD_VERZE = 'preklad-1'

JAZYKY = {'en': 'angličtiny', 'de': 'němčiny', 'sk': 'slovenštiny'}

PROMPT = """Jsi odborný překladatel pivovarské a sladařské literatury do češtiny.
Přelož text jedné strany odborné knihy do spisovné češtiny tak, jak by ho napsal zkušený český sládek.
- Překládej celý text, nic nevynechávej, neshrnuj, nevysvětluj a nic nepřidávej.
- Čísla, rozsahy, jednotky a značky (°C, °P, %, EBC, IBU, mg/l, pH, β) opiš PŘESNĚ jako v originále — stejné číslice,
  stejná desetinná tečka nebo čárka, stejné oddělovače tisíců. Nic nepřepočítávej ani nezaokrouhluj.
- Zachovej strukturu: odstavce, řádky nadpisů „# …" a „## …" (nadpis přelož), Markdown tabulky se stejným počtem
  řádků i sloupců (přelož jen slova v buňkách), vzorce mezi $ a $$ ponech beze změny.
- Vlastní jména, názvy firem, odrůd chmele a ječmene, kmenů kvasnic a latinské názvy ponech v originále.
- Místo označené [nečitelné] ponech jako [nečitelné].
- Používej české pivovarské názvosloví, např.: malt = slad, malting = sladování, steeping = máčení,
  germination = klíčení, kilning = hvozdění, mash = rmut (dílo), mashing = rmutování, decoction = dekokce,
  wort (před chmelením) = sladina, hopped wort = mladina, lautering = scezování, sparging = vyslazování,
  spent grains = mláto, boil = chmelovar, whirlpool = vířivá káď, trub = kaly, pitching = zakvašení,
  yeast = kvasnice, fermentation = kvašení, primary fermentation = hlavní kvašení, maturation / lagering = dokvašování
  a zrání, attenuation = prokvašení, original gravity = původní extrakt (stupňovitost), adjunct = nesladovaná surovina.
- Když je text už česky, vrať ho beze změny."""

SCHEMA = {
    'type': 'object',
    'properties': {'preklad': {'type': 'string'}},
    'required': ['preklad'],
    'additionalProperties': False,
}


@dataclass
class Preklad:
    text: str | None          # None = překlad se nepovedl (strana zůstane bez překladu)
    kontrola: str | None      # důvod ověřit v originále; None = v pořádku
    usage: dict


def otisk(text: str) -> str:
    """md5 textu strany — totéž, co v DB počítá md5(text) (UTF-8)."""
    return hashlib.md5((text or '').encode('utf-8')).hexdigest()


def kontrola_cisel(original: str, preklad: str) -> str | None:
    """Mají originál a překlad stejná čísla (desetinná čárka = tečka)? Jinak důvod ke kontrole."""
    a, b = ocr.cisla(original), ocr.cisla(preklad)
    if a == b:
        return None
    chybi = sum((a - b).values())
    navic = sum((b - a).values())
    casti = ([f'{chybi} z originálu v překladu chybí'] if chybi else []) + ([f'{navic} navíc'] if navic else [])
    return 'čísla v překladu nesedí s originálem (' + ', '.join(casti) + ') — ověř v originále'


def _zavolej(klient, text: str, model: str, jazyk: str | None, max_tokens: int):
    odkud = JAZYKY.get(jazyk or '', 'původního jazyka')
    parametry = {
        'model': model,
        'max_tokens': max_tokens,
        'system': PROMPT,
        'output_config': {'effort': 'medium', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': f'Přelož z {odkud} do češtiny tento text strany:\n\n<strana>\n{text}\n</strana>'},
        ]}],
    }
    mysleni = ocr.mysleni_pro_model(model)
    if mysleni is not None:
        parametry['thinking'] = mysleni
    return klient.messages.create(**parametry)


def preloz_stranu(klient, text: str, model: str, jazyk: str | None = None, max_tokens: int = 8000) -> Preklad:
    """Jedna strana → český překlad. Výjimky API nechává projít — řeší je volající.

    Useknutá odpověď se zkusí jednou s dvojnásobným limitem; useknutý nebo
    nečitelný výstup se nikdy neuloží jako překlad.
    """
    odpoved = _zavolej(klient, text, model, jazyk, max_tokens)
    usage = ocr.usage_jako_dict(odpoved.usage)
    if odpoved.stop_reason == 'max_tokens':
        odpoved = _zavolej(klient, text, model, jazyk, max_tokens * 2)
        u2 = ocr.usage_jako_dict(odpoved.usage)
        usage = {k: usage.get(k, 0) + u2.get(k, 0) for k in set(usage) | set(u2)}
    if odpoved.stop_reason in ('refusal', 'max_tokens'):
        return Preklad(None, None, usage)
    blok = next((b.text for b in odpoved.content if getattr(b, 'type', '') == 'text'), '')
    try:
        data = json.loads(blok)
    except (json.JSONDecodeError, TypeError):
        return Preklad(None, None, usage)
    preklad = str(data.get('preklad') or '').strip() if isinstance(data, dict) else ''
    if not preklad:
        return Preklad(None, None, usage)
    return Preklad(preklad, kontrola_cisel(text, preklad), usage)


def potreba_prekladu(text: str, jazyk_dokumentu: str | None, odhad) -> bool:
    """Má se strana překládat? Prázdná ne; česká ne (u dokumentu bez jazyka podle odhadu strany)."""
    if not (text or '').strip():
        return False
    if jazyk_dokumentu == 'cs':
        return False
    if jazyk_dokumentu is None and odhad(text) == 'cs':
        return False
    return True


def soucet_usage(polozky: list[dict]) -> dict:
    c: Counter = Counter()
    for u in polozky:
        c.update(u)
    return dict(c)
