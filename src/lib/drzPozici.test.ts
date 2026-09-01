import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { najdiKotvu, najdiScroller, posunPodleKotvy, zapamatujPozici } from './drzPozici';

/** jsdom nic nerozkládá — rozměry musíme nastavit sami. */
function nastavRect(el: Element, top: number, height = 20) {
  (el as any).getBoundingClientRect = () => ({
    top, height, width: height > 0 ? 100 : 0, bottom: top + height, left: 0, right: 100, x: 0, y: top, toJSON() {},
  });
}

function udelejScroller(): HTMLElement {
  const s = document.createElement('div');
  s.style.overflowY = 'auto';
  Object.defineProperty(s, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(s, 'clientHeight', { value: 800, configurable: true });
  s.scrollTop = 1000;
  document.body.appendChild(s);
  return s;
}

describe('posunPodleKotvy', () => {
  it('kotva se nehnula → neposouvá se', () => {
    expect(posunPodleKotvy(300, 300)).toBe(0);
  });
  it('obsah nad kotvou zmizel → kotva vyjela nahoru, roluje se zpátky nahoru', () => {
    // Panel vysoký 250 px nad kotvou zmizel: kotva je najednou o 250 px výš.
    expect(posunPodleKotvy(400, 150)).toBe(-250);
  });
  it('obsah nad kotvou přibyl → roluje se dolů', () => {
    expect(posunPodleKotvy(150, 400)).toBe(250);
  });
  it('rozdíl pod pixel je šum měření, ne posun', () => {
    expect(posunPodleKotvy(300, 300.4)).toBe(0);
    expect(posunPodleKotvy(300, 299.7)).toBe(0);
  });
});

describe('najdiKotvu', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('ze dvou kopií téhož řádku vezme tu viditelnou', () => {
    // Přesně situace z inventury: mobilní karta je v DOM první, ale na
    // počítači je schovaná přes md:hidden — kotvou musí být řádek tabulky.
    const mobil = document.createElement('div');
    mobil.setAttribute('data-inv-radek', 'b1__p1');
    const desktop = document.createElement('div');
    desktop.setAttribute('data-inv-radek', 'b1__p1');
    document.body.append(mobil, desktop);
    nastavRect(mobil, 0, 0);   // schovaná: samé nuly
    nastavRect(desktop, 420, 24);

    expect(najdiKotvu('[data-inv-radek="b1__p1"]')).toBe(desktop);
  });

  it('když není vidět ani jedna, vrátí null', () => {
    const el = document.createElement('div');
    el.setAttribute('data-inv-radek', 'b1__p1');
    document.body.appendChild(el);
    nastavRect(el, 0, 0);
    expect(najdiKotvu('[data-inv-radek="b1__p1"]')).toBeNull();
  });

  it('na neexistující selektor vrátí null', () => {
    expect(najdiKotvu('[data-inv-radek="nic"]')).toBeNull();
  });
});

describe('najdiScroller', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('najde rolovacího předka, ne okno', () => {
    const s = udelejScroller();
    const radek = document.createElement('div');
    s.appendChild(radek);
    expect(najdiScroller(radek)).toBe(s);
  });

  it('prvek, který se nemá kam rolovat, přeskočí', () => {
    const nerolovaci = document.createElement('div');
    nerolovaci.style.overflowY = 'auto';
    Object.defineProperty(nerolovaci, 'scrollHeight', { value: 100 });
    Object.defineProperty(nerolovaci, 'clientHeight', { value: 100 });
    document.body.appendChild(nerolovaci);
    const radek = document.createElement('div');
    nerolovaci.appendChild(radek);
    expect(najdiScroller(radek)).toBe(document.scrollingElement);
  });
});

describe('zapamatujPozici', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // rAF v jsdom existuje, ale ať test nečeká na skutečné snímky.
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 0; });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('vrátí kotvu tam, kde byla, když nad ní zmizel panel', () => {
    const s = udelejScroller();
    const radek = document.createElement('div');
    radek.setAttribute('data-inv-radek', 'b1__p1');
    s.appendChild(radek);
    nastavRect(radek, 400);

    const vrat = zapamatujPozici('[data-inv-radek="b1__p1"]');
    nastavRect(radek, 150); // panel nad ním zmizel
    vrat();

    expect(s.scrollTop).toBe(750); // 1000 − 250
  });

  it('když kotva po překreslení zmizí, scrollem nehýbe', () => {
    const s = udelejScroller();
    const radek = document.createElement('div');
    radek.setAttribute('data-inv-radek', 'b1__p1');
    s.appendChild(radek);
    nastavRect(radek, 400);

    const vrat = zapamatujPozici('[data-inv-radek="b1__p1"]');
    radek.remove();
    vrat();

    expect(s.scrollTop).toBe(1000);
  });

  it('bez kotvy je to prázdná funkce, která nespadne', () => {
    const s = udelejScroller();
    const vrat = zapamatujPozici('[data-inv-radek="neexistuje"]');
    expect(() => vrat()).not.toThrow();
    expect(s.scrollTop).toBe(1000);
  });
});

describe('druhý pokus po realtime vlně', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Pořadí je důležité: vi.useFakeTimers() si bere i requestAnimationFrame,
    // takže se stub musí nasadit AŽ po něm, jinak se překreslení nikdy nespustí.
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 0; });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function pripravit() {
    const s = udelejScroller();
    const radek = document.createElement('div');
    radek.setAttribute('data-inv-radek', 'b1__p1');
    s.appendChild(radek);
    nastavRect(radek, 400);
    return { s, radek };
  }

  it('srovná znovu, když se rozložení hne až po přenačtení', () => {
    // Realtime přijde se zdržením 400 ms i o vlastním zápisu; čerstvá data
    // můžou ještě jednou změnit výšky řádků.
    const { s, radek } = pripravit();
    const vrat = zapamatujPozici('[data-inv-radek="b1__p1"]');
    nastavRect(radek, 150);   // obsah nad kotvou se scvrkl o 250 px
    vrat();
    expect(s.scrollTop).toBe(750);

    // Po srovnání kotva zase leží tam, kde ležela předtím.
    nastavRect(radek, 400);
    // …a pak dorazí realtime vlna a posune ji o dalších 20 px nahoru.
    nastavRect(radek, 380);
    vi.advanceTimersByTime(1000);
    expect(s.scrollTop).toBe(730);
  });

  it('když si člověk mezitím odroloval sám, druhý pokus mu to nevezme', () => {
    const { s, radek } = pripravit();
    const vrat = zapamatujPozici('[data-inv-radek="b1__p1"]');
    nastavRect(radek, 150);
    vrat();
    expect(s.scrollTop).toBe(750);

    s.scrollTop = 2000;   // ruční posun
    nastavRect(radek, 380);
    vi.advanceTimersByTime(1000);
    expect(s.scrollTop).toBe(2000);
  });
});
