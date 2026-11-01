"""Cena volání AI podle ceníku z bible_nastaveni (testy: tests/test_naklady.py).

Zadání, bod 12: „Eviduj náklady na AI API." Cena se počítá z tokenů, které
vrátí API (usage), a z ceníku v databázi — model bez ceníku je chyba, ne nula.
"""
from __future__ import annotations

from dataclasses import dataclass, field


class ChybiCenik(KeyError):
    pass


def cena_usd(model: str, usage: dict, cenik: dict) -> float:
    """USD za jedno volání. Ceník je USD za 1 milion tokenů."""
    c = cenik.get(model)
    if not c:
        raise ChybiCenik(f'Model {model} nemá v bible_nastaveni ceník — náklady by nešly evidovat.')
    vstup = float(c['vstup'])
    return (
        int(usage.get('input_tokens') or 0) * vstup
        + int(usage.get('output_tokens') or 0) * float(c['vystup'])
        + int(usage.get('cache_read_input_tokens') or 0) * float(c.get('cache_cteni', vstup * 0.1))
        + int(usage.get('cache_creation_input_tokens') or 0) * float(c.get('cache_zapis', vstup * 1.25))
    ) / 1_000_000


@dataclass
class Polozka:
    volani: int = 0
    vstup: int = 0
    vystup: int = 0
    cache_cteni: int = 0
    cache_zapis: int = 0
    cena: float = 0.0


@dataclass
class Ucet:
    """Náklady jednoho běhu: dosud nezapsané položky po modelech a strop útraty.

    `utraceno` je celá útrata běhu (i to, co už se zapsalo do ai_naklady);
    strop se hlídá proti ní, takže průběžný zápis nákladů strop neobejde.
    """
    cenik: dict
    strop_usd: float
    polozky: dict[str, Polozka] = field(default_factory=dict)
    utraceno: float = 0.0
    # 'api' = placený kredit; 'predplatne' = Claude Code s předplatným (tokeny se evidují, útrata 0).
    zdroj: str = 'api'

    def pridej(self, model: str, usage: dict, zdarma: bool = False) -> float:
        """Zaeviduje volání. `zdarma` (předplatné Claude): tokeny ano, cena 0 a bez ceníku."""
        cena = 0.0 if zdarma else cena_usd(model, usage, self.cenik)
        self.utraceno += cena
        p = self.polozky.setdefault(model, Polozka())
        p.volani += 1
        p.vstup += int(usage.get('input_tokens') or 0)
        p.vystup += int(usage.get('output_tokens') or 0)
        p.cache_cteni += int(usage.get('cache_read_input_tokens') or 0)
        p.cache_zapis += int(usage.get('cache_creation_input_tokens') or 0)
        p.cena += cena
        return cena

    @property
    def celkem(self) -> float:
        """Dosud nezapsaná útrata."""
        return sum(p.cena for p in self.polozky.values())

    def prekroceno(self) -> bool:
        return self.utraceno >= self.strop_usd

    def vynuluj(self) -> dict[str, Polozka]:
        """Vrátí dosavadní položky (k zápisu do ai_naklady) a začne znovu."""
        stare = self.polozky
        self.polozky = {}
        return stare
