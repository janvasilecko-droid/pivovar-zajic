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
| VAPID klíče | veřejný v kódu, soukromý do secrets | **vložit soukromý** |

Dokud klíče nejsou, přepínač v Nastavení je **schválně vypnutý a napíše
proč** — mlčící vypnutý zvonek by vypadal jako rozbitá funkce.

---

## 1. Klíče jsou už vyrobené

Dvojici klíčů jsem vygeneroval 4. 9. 2026.

**Veřejný** klíč je přímo v kódu (`src/lib/pushOdber.ts`) — je z podstaty
veřejný, stejně by skončil v JS bundlu, takže se nemusí nikde nastavovat.

**Soukromý** klíč v repozitáři NENÍ a nikdy tam být nesmí. Dostal jsi ho
v chatu; patří jen do projektových secrets Supabase. Kdybys ho někdy chtěl
vyměnit, `npx web-push generate-vapid-keys` vyrobí novou dvojici — pak se
musí vyměnit OBA (patří k sobě) a všechna zařízení se přihlásí znovu.

## 2. Zadat klíče na server

V Supabase (Dashboard → Project Settings → Edge Functions → Secrets):

```
VAPID_PUBLIC_KEY  = BJ-YC0Rwvk25boqlYbxKcufzUQllA_y_G0-8sjis0og-pJ6On-Q4CYH0Iwz2vW3D3dQmYBMS2mAhXszIavepX08
VAPID_PRIVATE_KEY = <soukromý klíč z chatu>
```

## 3. (nepovinné) Vlastní klíč pro web

Nic nastavovat netřeba. Jen kdyby se klíče měnily a nechtělo se sahat do
kódu, dá se veřejný klíč přebít proměnnou `VITE_VAPID_PUBLIC_KEY`
v prostředí buildu.

## 4. Pustit migraci a nasadit funkci (potřebuje počítač)

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
