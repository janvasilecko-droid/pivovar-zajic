# Archiv jednorázových skriptů

Sem patří skripty, které vznikly kvůli JEDNÉ konkrétní situaci a doběhly:
diagnostiky z jednoho večera (`diag_*`, `check_bottling{,2,3}`), jednorázové
opravy dat (`fix_stock{,2}`, `fix_bottling_*`) a pomocné výpisy.

Proč se nemažou: jsou to záznamy o tom, čím se který problém řešil — a když
se stejná otázka vrátí, je rychlejší je přečíst než vymýšlet znovu.

Proč nejsou o adresář výš: ve `scripts/` má být jen to, co se opravdu
používá. Bylo tam 70 souborů a nedalo se v nich najít to živé — kontroly
(`zkontroluj-*`), migrace, zálohy a nasazování.

**Nespouštět bez přečtení.** Většina z nich zapisuje do databáze podle
předpokladů, které platily v den, kdy vznikly.
