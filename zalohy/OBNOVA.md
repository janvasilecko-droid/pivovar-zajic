# Obnova ze zálohy

Soubory jsou pole objektů přesně tak, jak jsou v databázi. Vrátit se dají
skriptem, který napřed ukáže, co by se změnilo, a **nic nezapíše**, dokud
nedostane `--opravdu`:

```bash
node scripts/obnov-ze-zalohy.mjs
```

Vypíše u každé tabulky, kolik řádků chybí, kolik se liší a kolik je
v databázi navíc. Když to sedí, spustí se to podruhé:

```bash
node scripts/obnov-ze-zalohy.mjs --opravdu
```

### Návrat ke konkrétnímu dni

```bash
node scripts/obnov-ze-zalohy.mjs --datum 2026-08-20
```

Vezme zálohu z posledního commitu k tomu dni (nebo staršího, kdyby ten den
záloha neproběhla). Když k datu nic není, vypíše, ke kterým dnům zálohy jsou.

### Co se doplňuje a co se maže

Ve výchozím stavu se jen **doplňuje a opravuje** — omylem smazaná objednávka
se vrátí a nic novějšího se nezahodí. To je skoro vždycky to, co chcete.

Srovnat databázi **přesně** do stavu zálohy (a tím smazat všechno, co vzniklo
po ní) jde přepínačem navíc:

```bash
node scripts/obnov-ze-zalohy.mjs --datum 2026-08-20 --smazat-navic --opravdu
```

### Jen jedna tabulka

```bash
node scripts/obnov-ze-zalohy.mjs --tabulka orders
```

Pozor na pořadí: `order_items` ukazují na `orders`, takže samotné položky
bez objednávek neprojdou. Skript to při úplné obnově řeší sám.

### Přístup k databázi

Skript si vezme `VITE_SUPABASE_URL` a `VITE_SUPABASE_SERVICE_ROLE_KEY`
z `.env`, nebo `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` z prostředí.
