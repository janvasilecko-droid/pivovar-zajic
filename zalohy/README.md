# Zálohy

Poslední záloha: **2026-08-27**

| Tabulka | Řádků |
| --- | ---: |
| orders | 166 |
| order_items | 497 |
| kegging | 164 |
| bottling | 56 |

Zálohuje se automaticky každý den (`.github/workflows/zaloha.yml`).
Každý den je jeden commit, takže se dá vrátit ke stavu k libovolnému dni —
stačí v historii tohohle adresáře najít datum a stáhnout soubory z něj.

Obnova: soubory jsou pole objektů přesně tak, jak jsou v databázi.
Nahrát zpět se dají přes Supabase → Table editor → Import, nebo dotazem.

⚠️ Závoz (`zavoz_deductions`) se zálohuje záměrně NE — odečty se dají
odvodit z objednávek.