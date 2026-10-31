// ⌨️ Přepínače příkazové řádky pro skripty záloh: --jmeno hodnota,
// --jmeno=hodnota a --prepinac.
//
// Neznámý přepínač, chybějící hodnota nebo hodnota začínající „--" je CHYBA.
// Tichý pád na výchozí hodnotu je u obnovy nebezpečný: `--sada=bible
// --opravdu` by jinak obnovil HLAVNÍ databázi a vrátil objednávky do stavu
// z noční zálohy.
export function prectiArgumenty(argv, { hodnoty = [], prepinace = [] } = {}) {
  const vysledek = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const m = /^--([a-z][a-z-]*)(?:=([\s\S]*))?$/.exec(arg);
    if (!m) throw new Error(`Neznámý argument „${arg}".`);
    const [, jmeno, rovno] = m;
    if (prepinace.includes(jmeno)) {
      if (rovno !== undefined) throw new Error(`Přepínač --${jmeno} nebere hodnotu.`);
      vysledek[jmeno] = true;
    } else if (hodnoty.includes(jmeno)) {
      const hodnota = rovno !== undefined ? rovno : argv[i + 1];
      if (rovno === undefined) i += 1;
      if (hodnota === undefined || hodnota === '' || hodnota.startsWith('--')) throw new Error(`Za --${jmeno} chybí hodnota.`);
      vysledek[jmeno] = hodnota;
    } else {
      throw new Error(`Neznámý přepínač --${jmeno}.`);
    }
  }
  return vysledek;
}
