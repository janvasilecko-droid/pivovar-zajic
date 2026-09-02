// Unit testy filtru čtení (brány) — bez databáze a sítě.
// Spuštění: npm test   (v whatsapp-bridge/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, buildGate, createMessageGate, smiProjit } from '../lib/filter.js';

test('norm: diakritika, velikost písmen a mezery', () => {
  assert.equal(norm('Objednávky pivovar'), 'objednavky pivovar');
  assert.equal(norm('  Objednavky  Pivovar  '), 'objednavky  pivovar');
  assert.equal(norm('Ala Milacek Milacek'), 'ala milacek milacek');
  assert.equal(norm(''), '');
});

test('prázdný whitelist = povoleno vše (zpětně kompatibilní)', () => {
  const gate = buildGate();
  assert.equal(gate.isEmpty, true);
  assert.equal(gate.isGroupAllowed('Kdokoliv', '120363000@g.us'), true);
  assert.equal(gate.isContactAllowed('Kdokoliv', '420777123456'), true);
});

test('skupina povolená podle názvu bez diakritiky', () => {
  const gate = buildGate({ allowedGroups: ['Objednávky pivovar'] });
  assert.equal(gate.isGroupAllowed('Objednavky pivovar', ''), true);
  assert.equal(gate.isGroupAllowed('Jiná skupina', ''), false);
  assert.equal(gate.isGroupAllowed('', '120363000@g.us'), false); // bez chat_id ve whitelistu
});

test('přejmenovaná skupina projde přes registrované chat_id', () => {
  const gate = buildGate({
    allowedGroups: ['Objednávky pivovar'],
    senders: [{ sender_name: 'Objednávky pivovar', chat_id: '120363111111111111@g.us' }],
  });
  // přejmenovaná skupina: název nesouhlasí, ale chat_id ano → POVOLENO
  assert.equal(gate.isGroupAllowed('Objednávky pivovar 2026', '120363111111111111@g.us'), true);
  // jiná skupina se stejným názvem, ale cizím chat_id → NEPOVOLENO
  assert.equal(gate.isGroupAllowed('Objednávky pivovar 2026', '999999999999999999@g.us'), false);
  // stále funguje i prostý název bez chat_id
  assert.equal(gate.isGroupAllowed('Objednávky pivovar', ''), true);
});

test('kontakt povolený podle jména nebo telefonního čísla', () => {
  const gate = buildGate({
    allowedContacts: ['Ala Milacek Milacek'],
    senders: [{ sender_name: 'Ala Milacek Milacek', chat_id: null }],
  });
  assert.equal(gate.isContactAllowed('ala milacek milacek', ''), true);
  assert.equal(gate.isContactAllowed('Ala', '420777123456'), false); // není ve whitelistu
  assert.equal(gate.isContactAllowed('', '420777123456'), false);
});

test('whitelist z whatsapp_senders se sjednotí s env proměnnými', () => {
  const gate = buildGate({
    allowedGroups: ['Objednávky pivovar'],
    senders: [{ sender_name: 'Pepa Novák', chat_id: null }],
  });
  assert.equal(gate.isGroupAllowed('Objednávky pivovar', ''), true); // z env
  assert.equal(gate.isContactAllowed('Pepa Novák', ''), true); // z DB (whatsapp_senders)
  assert.equal(gate.isContactAllowed('Karel Dvořák', ''), false);
});

test('chat_id ve whitelistu povolí i skupinu, která není v env skupinách', () => {
  const gate = buildGate({
    allowedGroups: [],
    senders: [{ sender_name: 'Objednávky pivovar', chat_id: '120363111111111111@g.us' }],
  });
  assert.equal(gate.isGroupAllowed('Název úplně jinak', '120363111111111111@g.us'), true);
});

test('createMessageGate: načtení whatsapp_senders a obnova whitelistu', async () => {
  let rows = [{ sender_name: 'Objednávky pivovar', chat_id: '120363111111111111@g.us' }];
  const supabase = {
    from: () => ({
      select: () => ({ then: (resolve) => resolve({ data: rows, error: null }) }),
    }),
  };
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const gate = createMessageGate({
    supabase,
    allowedGroups: ['Objednávky pivovar'],
    allowedContacts: [],
    logger,
  });

  // Před načtením platí jen env whitelist.
  assert.equal(gate.getGate().isGroupAllowed('Objednávky pivovar', ''), true);
  assert.equal(gate.getGate().isGroupAllowed('', '120363111111111111@g.us'), false);

  await gate.load();
  // Po načtení: chat_id z whatsapp_senders povolí i přejmenovanou skupinu.
  assert.equal(gate.getGate().isGroupAllowed('Přejmenovaná skupina', '120363111111111111@g.us'), true);

  // Změna whitelistu v aplikaci se projeví po dalším load() (refresh bez restartu).
  rows = [{ sender_name: 'Pepa Novák', chat_id: null }];
  await gate.load();
  assert.equal(gate.getGate().isContactAllowed('Pepa Novák', ''), true);
  assert.equal(gate.getGate().isGroupAllowed('Objednávky pivovar', ''), true); // env zůstává
  assert.equal(gate.getGate().isGroupAllowed('', '120363111111111111@g.us'), false);

  gate.stopRefresh();
});

test('createMessageGate: výpadek čtení whatsapp_senders nezpůsobí pád, jen warning', async () => {
  const supabase = {
    from: () => ({ select: () => ({ then: (resolve) => resolve({ data: null, error: { message: 'síť' } }) }) }),
  };
  const warns = [];
  const gate = createMessageGate({
    supabase,
    allowedGroups: ['Objednávky pivovar'],
    allowedContacts: [],
    logger: { info: () => {}, warn: (m) => warns.push(m) },
  });
  await gate.load();
  assert.equal(warns.length, 1);
  assert.equal(gate.getGate().isGroupAllowed('Objednávky pivovar', ''), true); // env pořád funguje
  gate.stopRefresh();
});

test('createMessageGate: pravidla brány jde volat přímo na wrapperu (regresní test TypeError isContactAllowed)', () => {
  const gate = createMessageGate({
    supabase: null,
    allowedGroups: ['Objednávky pivovar'],
    allowedContacts: ['Ala Milacek Milacek'],
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  // index.js volá gate.isGroupAllowed / gate.isContactAllowed na vráceném wrapperu,
  // ne na gate.getGate() — obojí musí fungovat (jinak spadne handleMessage).
  assert.equal(typeof gate.isGroupAllowed, 'function');
  assert.equal(typeof gate.isContactAllowed, 'function');
  assert.equal(gate.isGroupAllowed('Objednávky pivovar', ''), true);
  assert.equal(gate.isGroupAllowed('Jiná skupina', ''), false);
  assert.equal(gate.isContactAllowed('Ala Milacek Milacek', ''), true);
  assert.equal(gate.isContactAllowed('Někdo jiný', ''), false);
  gate.stopRefresh();
});

// ---------------------------------------------------------------------------
// smiProjit — rozhodnutí o jedné zprávě.
//
// Tady se hlídá díra, která už dvakrát pustila do provozní aplikace soukromou
// poštu majitele: vlastní zprávy (from_me) obcházely whitelist. Testy jsou
// napsané tak, aby spadly, kdyby se výjimka vrátila potřetí.
// ---------------------------------------------------------------------------

/** Brána, jakou má most doopravdy: objednávková skupina + jeden kontakt. */
function provozniBrana() {
  return buildGate({
    allowedGroups: ['Objednávky pivovar'],
    allowedContacts: ['Ala Milacek Milacek'],
    senders: [{ sender_name: 'Objednávky pivovar', chat_id: '120363111111111111@g.us' }],
  });
}

test('smiProjit: objednávka ze skupiny projde', () => {
  const r = smiProjit(provozniBrana(), {
    isGroup: true,
    groupName: 'Objednávky pivovar',
    chatId: '120363111111111111@g.us',
  });
  assert.equal(r.pustit, true);
});

test('smiProjit: majitelova vlastní zpráva ve skupině projde (podle skupiny, ne podle autora)', () => {
  // Objednávka napsaná z vlastního telefonu do objednávkové skupiny — musí
  // projít, a to BEZ jakékoli výjimky pro from_me. Kdyby procházela jen díky
  // výjimce, propadla by s ní i soukromá pošta (viz další test).
  const r = smiProjit(provozniBrana(), {
    isGroup: true,
    isOwn: true,
    groupName: 'Objednávky pivovar',
    chatId: '120363111111111111@g.us',
  });
  assert.equal(r.pustit, true);
});

test('smiProjit: soukromá zpráva mimo whitelist NEPROJDE, i když ji píše majitel', () => {
  // ⚠️ Přesně tohle se stalo: do aplikace se nahrály všechny majitelovy
  // zprávy včetně osobních konverzací, protože from_me obcházelo whitelist.
  // `isOwn` se funkci předává, aby šlo doložit, že na rozhodnutí NEMÁ vliv —
  // kdo tu výjimku vrátí, rozbije tenhle test.
  const soukroma = { isGroup: false, senderName: 'Manželka', senderNumber: '420600111222' };

  const cizi = smiProjit(provozniBrana(), soukroma);
  assert.equal(cizi.pustit, false);
  assert.match(cizi.duvod, /není povolený/);

  const vlastni = smiProjit(provozniBrana(), { ...soukroma, isOwn: true });
  assert.equal(vlastni.pustit, false, 'vlastní zpráva nesmí obejít whitelist');
  assert.deepEqual(vlastni, cizi, 'from_me nesmí rozhodnutí nijak změnit');
});

test('smiProjit: povolený kontakt v soukromé zprávě projde', () => {
  const r = smiProjit(provozniBrana(), {
    isGroup: false,
    senderName: 'Ala Milacek Milacek',
    senderNumber: '420600333444',
  });
  assert.equal(r.pustit, true);
});

test('smiProjit: neznámá skupina neprojde', () => {
  const r = smiProjit(provozniBrana(), {
    isGroup: true,
    groupName: 'Fotbal parta',
    chatId: '120363999999999999@g.us',
  });
  assert.equal(r.pustit, false);
  assert.match(r.duvod, /není povolená/);
});

test('smiProjit: přejmenovaná objednávková skupina projde podle chat_id', () => {
  const r = smiProjit(provozniBrana(), {
    isGroup: true,
    groupName: 'Objednávky pivovar 2027',
    chatId: '120363111111111111@g.us',
  });
  assert.equal(r.pustit, true);
});

test('smiProjit: prázdný whitelist pouští skupiny, ale NE soukromé zprávy', () => {
  // „Prázdný seznam = povoleno vše" je zpětná kompatibilita kvůli skupinám.
  // U konverzace jednoho s jedním by to znamenalo sypat do provozní appky
  // osobní poštu, dokud si někdo nevzpomene whitelist vyplnit — nevyplněný
  // whitelist je nedopatření, ne pokyn ke čtení všeho.
  const brana = buildGate({});
  assert.equal(brana.isEmpty, true);

  const skupina = smiProjit(brana, { isGroup: true, groupName: 'Cokoliv', chatId: 'x@g.us' });
  assert.equal(skupina.pustit, true);

  const soukroma = smiProjit(brana, { isGroup: false, senderName: 'Kdokoliv', senderNumber: '420600555666' });
  assert.equal(soukroma.pustit, false);
  assert.match(soukroma.duvod, /prázdný whitelist/);
});
