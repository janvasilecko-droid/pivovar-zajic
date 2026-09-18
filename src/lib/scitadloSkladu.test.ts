// 🧮 Sčítadlo skladu — kde se ukládá a kde jen vyplňuje.
// ---------------------------------------------------------------------------
// Majitel se ptal, co to tlačítko dělá, a shrnul si to jako „fyzický stav,
// bez úpravy dat, jen se vyplní pole inventura". Pro TÝDENNÍ KONTROLU to tak
// platí — tam se opravdu jen předvyplní „Napočítáno". Ve SKLADU ale uložení
// zapisuje inventuru, a ta je podle skladové knihy RESET: od toho dne se stav
// počítá od napočítaných čísel a starší pohyby už do výsledku nevstupují
// (lib/stockLedger.ts). Proto tam musí být dotaz a možnost vzít to zpět.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('src/screens/Dashboard.tsx', 'utf8');
const tydenni = readFileSync('src/components/TydenniInventuraPanel.tsx', 'utf8');

describe('sčítadlo ve Skladu inventuru ukládá — a ptá se', () => {
  const ulozeni = dashboard.slice(dashboard.indexOf('async function handleConfirmQuickCount'));
  const telo = ulozeni.slice(0, ulozeni.indexOf('\n  async function', 1) + 1 || 3000);

  it('před zápisem se zeptá', () => {
    expect(telo).toMatch(/potvrd\(/);
  });

  it('dotaz říká, že se od toho dne počítá stav od nových čísel', () => {
    expect(telo).toMatch(/skladový stav počítá od těchto čísel/);
  });

  it('po uložení jde vzít zpět, a to podle id vložených řádků', () => {
    expect(telo).toMatch(/toastZpet\(/);
    expect(telo).toMatch(/\.select\('id'\)/);
    expect(telo, 'mazat podle data by smazalo i cizí inventuru').toMatch(/\.in\('id', ids\)/);
  });
});

describe('sčítadlo v týdenní kontrole jen vyplňuje pole', () => {
  it('má vlastní tlačítko', () => {
    expect(tydenni).toMatch(/setScitadlo\(true\)/);
  });

  it('napočítané kusy jdou do „Napočítáno", ne do databáze', () => {
    const fn = tydenni.slice(tydenni.indexOf('function vyplnZeScitadla'));
    // Jen tělo té funkce — konec je první `}` na jejím odsazení. Bez toho
    // se do výřezu dostal i kód za ní a test hlásil cizí `supabase.`.
    const telo = fn.slice(0, fn.indexOf('\n  }') + 4);
    expect(telo).toMatch(/setNapocitano\(/);
    expect(telo, 'v týdenní kontrole se nesmí nic zapisovat').not.toMatch(/supabase\./);
  });

  it('na tlačítku je vidět, že se jen vyplňuje', () => {
    expect(tydenni).toMatch(/potvrditPopisek="Vyplnit do kontroly"/);
  });
});
