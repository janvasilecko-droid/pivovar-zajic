// 🐛 Regrese k výpadku z 21.–22. 9. 2026 (už podruhé): proces mostu žil, tep
// se zapisoval každou minutu, ale spojení s WhatsAppem bylo 9 hodin mrtvé —
// protože znovupřipojení po chybě nikdo nezopakoval a nic proces neukončilo,
// takže ho Render neměl důvod restartovat.
//
// Spuštění: npm test   (v whatsapp-bridge/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rozhodniOObnove,
  odstupMs,
  MRTVO_MINUT,
  HLUCHO_MINUT,
  MAX_POKUSU,
} from '../lib/oziveni.js';

const TED = new Date('2026-09-22T12:00:00.000Z');
const predMinutami = (m) => new Date(TED.getTime() - m * 60_000).toISOString();

test('připojený most s čerstvým provozem se nechává být', () => {
  const r = rozhodniOObnove({
    pripojeno: true,
    odpojenoOd: null,
    posledniUdalost: predMinutami(2),
    ted: TED,
  });
  assert.equal(r.akce, 'nic');
});

test('čerstvě spárovaný most (nikdy nic nepřišlo) se nerestartuje', () => {
  // Bez jediné události se hluchost posoudit nedá — jinak by se most
  // restartoval hned po spárování, než přijde první objednávka.
  const r = rozhodniOObnove({
    pripojeno: true,
    odpojenoOd: null,
    posledniUdalost: null,
    ted: TED,
  });
  assert.equal(r.akce, 'nic');
});

test('krátký výpadek spojení se ještě neřeší (most se připojuje sám)', () => {
  const r = rozhodniOObnove({
    pripojeno: false,
    odpojenoOd: predMinutami(MRTVO_MINUT - 1),
    posledniUdalost: predMinutami(30),
    ted: TED,
  });
  assert.equal(r.akce, 'nic');
});

test('odpojeno přes práh → obnova (přesně ten stav, co 9 h nikdo neřešil)', () => {
  const r = rozhodniOObnove({
    pripojeno: false,
    odpojenoOd: predMinutami(9 * 60),
    posledniUdalost: predMinutami(9 * 60),
    pokusu: 0,
    ted: TED,
  });
  assert.equal(r.akce, 'obnovit');
  assert.match(r.duvod, /odpojeno/);
});

test('když obnova opakovaně selhává, proces se radši ukončí (Render nahodí čistý)', () => {
  const r = rozhodniOObnove({
    pripojeno: false,
    odpojenoOd: predMinutami(60),
    posledniUdalost: predMinutami(60),
    pokusu: MAX_POKUSU,
    ted: TED,
  });
  assert.equal(r.akce, 'restart');
});

test('„přihlášená, ale hluchá" session se taky řeší, ne jen popisuje', () => {
  // Tohle most uměl POZNAT už od 31. 8. 2026, ale jen si to psal do poznámky
  // v tepu — spojení zůstalo hluché, dokud si toho nevšiml člověk.
  const r = rozhodniOObnove({
    pripojeno: true,
    odpojenoOd: null,
    posledniUdalost: predMinutami(HLUCHO_MINUT + 1),
    pokusu: 0,
    ted: TED,
  });
  assert.equal(r.akce, 'obnovit');
  assert.match(r.duvod, /hluch/);
});

test('hluchá session po marných pokusech taky vede na restart', () => {
  const r = rozhodniOObnove({
    pripojeno: true,
    odpojenoOd: null,
    posledniUdalost: predMinutami(HLUCHO_MINUT + 1),
    pokusu: MAX_POKUSU,
    ted: TED,
  });
  assert.equal(r.akce, 'restart');
});

test('nesmyslný čas v tepu nesmí spustit restart', () => {
  const r = rozhodniOObnove({
    pripojeno: false,
    odpojenoOd: 'nedatum',
    posledniUdalost: null,
    ted: TED,
  });
  assert.equal(r.akce, 'nic');
});

test('odstup mezi pokusy roste, ale zastropuje se na minutě', () => {
  assert.equal(odstupMs(0), 3_000);
  assert.ok(odstupMs(1) > odstupMs(0));
  assert.equal(odstupMs(99), 60_000);
  // Záporný/nesmyslný pokus nesmí vrátit undefined a rozbít setTimeout.
  assert.equal(odstupMs(-5), 3_000);
});
