# Checkpointy

## 2026-08-10 — tag: `checkpoint-staceni-lahve-keg`

**Před přepracováním obrazovek „Stáčení lahví (Lahve)" a „KEG".**

- Aplikace: **v1.546** — deploynuto na `zajic-pivovar.pages.dev` (10.8.2026 09:09).
- Stav v tomto bodu:
  - 🧮 Kalkulačka „Šrotování sladu" v **Nástroje → Kalkulačky** (záložka „🌾 Šrotování sladu"): plán šrotování 4× — rozklikávací výběr piva, kolik se šrotuje (kg sladu), dopočet pytlů 25 kg. (Vystírka/výpočty °P odstraněny.)
  - 📦 Migrace pro chybějící produkční tabulky (soubory v `supabase/migrations/`, **zatím neaplikované na produkční DB**):
    `sanitation_logs`, `srotovani`, `audit_log`, `cellar_batches`, `zadavani`, + další čekající (WhatsApp, KEG prefuk, poznámky, remidery…).
  - 💬 WhatsApp zpracování objednávek (parser, kontrola čtení, webhook gating) — rozpracováno.
- **Návrat k tomuto bodu:**
  ```
  git checkout checkpoint-staceni-lahve-keg
  ```
- **Plán dál:** přepracovat stáčení lahví a KEG tak, aby se k tomuto bodu dalo v případě potřeby vrátit.
