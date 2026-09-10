# Zálohy

Poslední záloha: **2026-09-10**

| Tabulka | Řádků |
| --- | ---: |
| orders | 198 |
| order_items | 605 |
| kegging | 253 |
| bottling | 117 |

Zálohuje se automaticky každý den (`.github/workflows/zaloha.yml`).
Každý den je jeden commit, takže se dá vrátit ke stavu k libovolnému dni.

**Obnova: [OBNOVA.md](OBNOVA.md)** — `node scripts/obnov-ze-zalohy.mjs`
nejdřív jen ukáže, co by se změnilo; zapisuje se až s `--opravdu`.

_(Tenhle soubor přepisuje záloha při každém běhu — návod patří do OBNOVA.md.)_

⚠️ Závoz (`zavoz_deductions`) se zálohuje záměrně NE — odečty se dají
odvodit z objednávek.