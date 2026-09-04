# Upozornění na telefon, i když appka neběží

Dosavadní upozornění v aplikaci fungují **jen když je appka otevřená**. To
znamená, že „přišla objednávka na WhatsApp" nebo „výčep je po termínu" se
dozví jen ten, kdo se zrovna dívá do telefonu.

Skutečný push je hotový v kódu, ale **nespustí se bez dvou klíčů, které
nemám a mít nemám** (jsou to tvoje serverová tajemství). Tenhle návod je
postup, jak je vyrobit a zadat. Trvá to asi deset minut a dělá se to jednou.

---

## Co je hotové

| Část | Kde to je | Stav |
| --- | --- | --- |
| Přihlášení telefonu k odběru | `src/lib/pushOdber.ts` | hotové |
| Zobrazení upozornění se zavřenou appkou | `public/sw.js` | hotové |
| Uložení zařízení | migrace `20261228030000_push_odbery.sql` | **spustit** |
| Odeslání ze serveru | edge funkce `posli-push` | **nasadit** |
| Zapínání v Nastavení | Nastavení → Upozornění | hotové |
| VAPID klíče | projektové secrets + `.env` | **udělat** |

Dokud klíče nejsou, přepínač v Nastavení je **schválně vypnutý a napíše
proč** — mlčící vypnutý zvonek by vypadal jako rozbitá funkce.

---

## 1. Vyrobit VAPID klíče

Na počítači, kde je Node:

```bash
npx web-push generate-vapid-keys
```

Vypíše dva řetězce — `Public Key` a `Private Key`.

> **Soukromý klíč nikam neposílej**, ani do chatu, ani do repozitáře.
> Kdo ho má, může posílat upozornění do vašich telefonů.

## 2. Zadat je na server

V Supabase (Dashboard → Project Settings → Edge Functions → Secrets):

```
VAPID_PUBLIC_KEY  = <public key>
VAPID_PRIVATE_KEY = <private key>
```

## 3. Zadat veřejný klíč do aplikace

Veřejný klíč patří i do buildu webu (Cloudflare Pages → Settings →
Environment variables) a do lokálního `.env`:

```
VITE_VAPID_PUBLIC_KEY=<public key>
```

Je to **veřejný** klíč — je v JS bundlu a to je v pořádku, přesně takhle
je to myšlené.

## 4. Pustit migraci a nasadit funkci

```bash
node scripts/apply-migration.mjs supabase/migrations/20261228030000_push_odbery.sql
npx supabase functions deploy posli-push
```

## 5. Zapnout v telefonu

Nastavení → Upozornění → **Upozornění i se zavřenou aplikací**. Zapíná se
na každém zařízení zvlášť (odběr patří k jednomu prohlížeči v jednom
telefonu).

## 6. Vyzkoušet

```bash
curl -X POST "https://<projekt>.supabase.co/functions/v1/posli-push" \
  -H "Authorization: Bearer <tvůj přihlašovací token>" \
  -H "Content-Type: application/json" \
  -d '{"titulek":"Zkouška","telo":"Push funguje.","stranka":"orders"}'
```

Funkce vrátí, kolik zařízení dostalo zprávu, kolik mrtvých odběrů se
smazalo a u kterých byla chyba.

---

## Co to zatím neumí

- **Zabalená Android appka (APK) push nedostane.** Je to obal kolem webu a
  push v něm jde jen přes Firebase (jiná technologie, vlastní projekt a
  klíče). V Chromu na Androidu a v appce přidané na plochu („Přidat na
  plochu") to funguje.
- **Nikdo to zatím sám neposílá.** Funkce `posli-push` je připravená, ale
  není nikde zavolaná automaticky. Až budou klíče, dá se na ni napojit
  příchozí WhatsApp objednávka a výčep po termínu — jsou to dvě místa,
  kde už appka o události ví.
