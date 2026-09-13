# Obnova ze zálohy

**Od 13. 9. 2026 jsou zálohy zašifrované** (repozitář je veřejný). Obnova
potřebuje heslo — v `.env` jako `ZALOHA_HESLO=…` (stejné jako secret
`ZALOHA_HESLO` v GitHubu). **Bez hesla zálohu nikdo neobnoví**, proto musí
být uložené i mimo GitHub (správce hesel, papír v trezoru).

Skript napřed ukáže, co by se změnilo, a **nic nezapíše**, dokud nedostane
`--opravdu`:

```bash
node scripts/obnov-ze-zalohy.mjs
```

Vypíše u každé tabulky, kolik řádků chybí, kolik se liší a kolik je
v databázi navíc. Když to sedí:

```bash
node scripts/obnov-ze-zalohy.mjs --opravdu
```

### Návrat ke konkrétnímu dni

```bash
node scripts/obnov-ze-zalohy.mjs --datum 2026-08-20
```

Vezme zálohu z posledního commitu k tomu dni. Zálohy před 13. 9. 2026 jsou
nešifrované a obsahují jen objednávky, položky a stáčení — přečtou se bez
hesla.

### Co se doplňuje a co se maže

Ve výchozím stavu se jen **doplňuje a opravuje**. Srovnat databázi **přesně**
do stavu zálohy (a smazat všechno novější):

```bash
node scripts/obnov-ze-zalohy.mjs --datum 2026-08-20 --smazat-navic --opravdu
```

### Jen jedna tabulka

```bash
node scripts/obnov-ze-zalohy.mjs --tabulka orders
```

Pořadí tabulek a vazby řeší skript sám (`scripts/lib/zalohaTabulky.mjs`),
včetně kruhového odkazu objednávky ↔ WhatsApp zprávy — ten se doplní ve
druhém kole.

### Co v záloze není

API klíče (`app_secrets`), přihlášení WhatsApp mostu (`whatsapp_session`)
a push odběry. Po obnově na novou databázi se musí klíče vložit znovu,
WhatsApp spárovat a prohlížeče se k upozorněním přihlásí samy.

### Zkouška obnovy

Jednou měsíčně ji dělá GitHub Actions (`zkouska-obnovy.yml`) do prázdné
dočasné databáze. Ručně bez databáze (jen rozšifrování a kontrola manifestu):

```bash
node scripts/zkouska-obnovy.mjs
```

### Staré nešifrované zálohy

Zůstávají **v historii gitu** a jsou pořád veřejně čitelné. Odstranit je jde
jen přepsáním historie (nevratné, rozbije klony repozitáře) nebo přechodem na
nový repozitář.

### Přístup k databázi

`VITE_SUPABASE_URL` a `VITE_SUPABASE_SERVICE_ROLE_KEY` z `.env`, nebo
`SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` z prostředí.
