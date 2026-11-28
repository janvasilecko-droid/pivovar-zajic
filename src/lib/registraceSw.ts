// 📴 Kdy zaregistrovat service worker (public/sw.js) — to, díky čemu appka naběhne bez signálu.
// ---------------------------------------------------------------------------
// Dřív až po události `load`, tedy až se stránka načte celá i s obrázky a písmy. Na slabém signálu to po
// klepnutí na „Aktualizovat" trvalo desítky vteřin (změřeno 28. 11. 2026 na 200 kbit/s: 35 s po tom, co nová
// verze už běžela) — a celou tu dobu byla appka bez service workeru: kdyby ji člověk zavřel a otevřel bez
// signálu, nenaběhla by. Tlačítko „Aktualizovat" totiž starý service worker i uloženou kopii maže.
//
// Teď se registruje při `load`, NEJPOZDĚJI ale za pár vteřin po spuštění — podle toho, co přijde dřív.

/** Nejdéle za jak dlouho po spuštění se service worker zaregistruje, i když se stránka ještě načítá (ms). */
export const REGISTRACE_NEJPOZDEJI_MS = 3_000;

/**
 * Zavolá `registruj` právě jednou: při události `load`, nebo po `REGISTRACE_NEJPOZDEJI_MS` — co nastane dřív.
 * Když už je stránka načtená, hned. Vrací úklid (zruší čekání).
 */
export function zaregistrujServiceWorker(registruj: () => void, okno: Window = window): () => void {
  let casovac: ReturnType<typeof setTimeout> | null = null;
  // Po prvním zavolání (i po úklidu) už není co by `spust` zavolalo znovu: časovač je zrušený, posluchač odhlášený.
  const uklid = () => {
    if (casovac) clearTimeout(casovac);
    okno.removeEventListener('load', spust);
  };
  function spust() {
    uklid();
    try { registruj(); } catch { /* registrace je jen vylepšení — appka běží i bez ní */ }
  }
  if (okno.document.readyState === 'complete') {
    spust();
    return () => {};
  }
  okno.addEventListener('load', spust);
  casovac = setTimeout(spust, REGISTRACE_NEJPOZDEJI_MS);
  return uklid;
}
