// 5. 11. 2026: „u Radek je potřeba 2 GPS, občas se vozí do Hradce a občas do Prahy."
import { describe, it, expect } from 'vitest';
import {
  mistaOdberatele, maViceMist, nazevHlavnihoMista, mistoObjednavky, cilNavigace, gpsZTextu,
  mistaKUlozeni, noveMisto, chybiSloupecMist, gpsText, HLAVNI_MISTO, hodnotaVolby, zastavkaObjednavky,
  gpsZFormulare, mistaZRadku, radekZMista,
} from './mistaZavozu';
import { priplatekDne } from './knihaJizdPravidla';

const RADEK = {
  name: 'Radek',
  address: 'Korunní 10, Praha 2, 120 00',
  lat: 50.0755, lng: 14.4378,
  mista_zavozu: [{ id: 'hk', nazev: 'Hradec', adresa: 'Gočárova třída 1, Hradec Králové', lat: 50.2092, lng: 15.8328 }],
};

describe('místa odběratele', () => {
  it('další místa se přečtou; neplatné položky a dvojí id se přeskočí', () => {
    expect(mistaOdberatele({
      mista_zavozu: [
        { id: 'a', nazev: 'Hradec', adresa: ' Hradec Králové ', lat: '50.2', lng: 15.8 },
        { id: 'a', nazev: 'Duplicitní' },
        { nazev: 'Bez id' },
        { id: 'b', nazev: '  ' },
        'nesmysl',
        { id: 'c', nazev: 'Jen šířka', lat: 50 },
        { id: 'd', nazev: 'Mimo rozsah', lat: 120, lng: 15 },
      ],
    })).toEqual([
      { id: 'a', nazev: 'Hradec', adresa: 'Hradec Králové', lat: 50.2, lng: 15.8 },
      { id: 'c', nazev: 'Jen šířka', adresa: null, lat: null, lng: null },
      { id: 'd', nazev: 'Mimo rozsah', adresa: null, lat: null, lng: null },
    ]);
  });

  it('bez sloupce (migrace ještě neběžela) nebo s nesmyslem je seznam prázdný', () => {
    expect(mistaOdberatele({ name: 'Lužec' })).toEqual([]);
    expect(mistaOdberatele({ mista_zavozu: 'x' })).toEqual([]);
    expect(mistaOdberatele(null)).toEqual([]);
    expect(maViceMist({ mista_zavozu: [] })).toBe(false);
    expect(maViceMist(RADEK)).toBe(true);
  });

  it('hlavní adresa dostane krátký název podle města nebo obce', () => {
    expect(nazevHlavnihoMista(RADEK)).toBe('Praha');
    expect(nazevHlavnihoMista({ address: 'Náměstí 5, Lužec nad Vltavou, 277 06' })).toBe('Lužec nad Vltavou');
    expect(nazevHlavnihoMista({ address: 'Kynšperk nad Ohří' })).toBe('Kynšperk nad Ohří');
    expect(nazevHlavnihoMista({ address: 'Hlavní 12' })).toBe('Hlavní adresa');
    expect(nazevHlavnihoMista({ address: null })).toBe('Hlavní adresa');
  });
});

describe('kam jede objednávka', () => {
  it('zvolené další místo', () => {
    const cil = mistoObjednavky({ misto_zavozu: 'hk' }, RADEK);
    expect(cil).toEqual({ id: 'hk', nazev: 'Hradec', adresa: 'Gočárova třída 1, Hradec Králové', lat: 50.2092, lng: 15.8328, zvoleno: true, ztracene: false });
    expect(cilNavigace(cil, 'Radek')).toBe('Gočárova třída 1, Hradec Králové');
  });

  it('výslovně hlavní adresa × nevybráno × smazané místo', () => {
    expect(mistoObjednavky({ misto_zavozu: HLAVNI_MISTO }, RADEK)).toMatchObject({ id: null, nazev: 'Praha', lat: 50.0755, zvoleno: true, ztracene: false });
    expect(mistoObjednavky({ misto_zavozu: null }, RADEK)).toMatchObject({ id: null, nazev: 'Praha', zvoleno: false, ztracene: false });
    expect(mistoObjednavky({}, RADEK)).toMatchObject({ id: null, zvoleno: false });
    expect(mistoObjednavky({ misto_zavozu: 'smazane' }, RADEK)).toMatchObject({ id: null, nazev: 'Praha', zvoleno: false, ztracene: true });
    expect(hodnotaVolby(null)).toBe(HLAVNI_MISTO);
    expect(hodnotaVolby('hk')).toBe('hk');
  });

  it('místo s id „hlavni" v datech se ignoruje (nesmí se plést s hlavní adresou)', () => {
    expect(mistaOdberatele({ mista_zavozu: [{ id: HLAVNI_MISTO, nazev: 'Past' }] })).toEqual([]);
    expect(mistaKUlozeni([{ id: HLAVNI_MISTO, nazev: 'Hradec', adresa: null, lat: null, lng: null }])[0].id).not.toBe(HLAVNI_MISTO);
  });

  it('navigace: adresa, jinak GPS, jinak název', () => {
    expect(cilNavigace({ id: 'x', nazev: 'Sklad', adresa: null, lat: 50.1, lng: 14.2, zvoleno: true, ztracene: false }, 'Radek')).toBe('50.1,14.2');
    expect(cilNavigace(mistoObjednavky({}, { name: 'Lužec' }), 'Lužec')).toBe('Lužec');
  });
});

describe('Kniha jízd: zastávka podle místa', () => {
  const objednavka = (misto_zavozu: string | null) => ({ place_id: 'radek', place_name: 'Radek', misto_zavozu });

  it('Hradec a Praha jsou dvě různé zastávky s vlastním GPS a příplatkem za město', () => {
    const hk = zastavkaObjednavky(objednavka('hk'), RADEK);
    const praha = zastavkaObjednavky(objednavka(HLAVNI_MISTO), RADEK);
    expect(hk).toEqual({ klic: 'radek|hk', name: 'Radek (Hradec)', lat: 50.2092, lng: 15.8328, address: 'Gočárova třída 1, Hradec Králové', bezVolby: false });
    expect(praha).toEqual({ klic: 'radek|', name: 'Radek', lat: 50.0755, lng: 14.4378, address: 'Korunní 10, Praha 2, 120 00', bezVolby: false });
    expect(priplatekDne([hk]).mesta).toEqual(['Hradec Králové']);
    expect(priplatekDne([praha]).mesta).toEqual(['Praha']);
  });

  it('nevybrané místo: hlavní adresa a upozornění; běžný odběratel upozornění nemá', () => {
    expect(zastavkaObjednavky(objednavka(null), RADEK)).toMatchObject({ name: 'Radek', lat: 50.0755, bezVolby: true });
    expect(zastavkaObjednavky({ place_id: 'l', place_name: 'Lužec' }, { name: 'Lužec', lat: 50.3, lng: 14.4 }))
      .toEqual({ klic: 'l|', name: 'Lužec', lat: 50.3, lng: 14.4, address: null, bezVolby: false });
    expect(zastavkaObjednavky({ place_name: null }, undefined)).toMatchObject({ klic: 'Místní odběratel|', name: 'Místní odběratel' });
  });
});

describe('GPS z vloženého textu', () => {
  it('desetinná čísla v běžných zápisech', () => {
    expect(gpsZTextu('50.2092, 15.8328')).toEqual({ lat: 50.2092, lng: 15.8328 });
    expect(gpsZTextu('50.2092003N, 15.8327664E')).toEqual({ lat: 50.2092003, lng: 15.8327664 });
    expect(gpsZTextu('50,2092 15,8328')).toEqual({ lat: 50.2092, lng: 15.8328 });
    expect(gpsZTextu(' 50.2092 ; 15.8328 ')).toEqual({ lat: 50.2092, lng: 15.8328 });
  });

  it('prohozené pořadí (délka, šířka) se v Česku pozná', () => {
    expect(gpsZTextu('15.8328, 50.2092')).toEqual({ lat: 50.2092, lng: 15.8328 });
    expect(gpsZTextu('15.8328E, 50.2092N')).toEqual({ lat: 50.2092, lng: 15.8328 });
  });

  it('stupně, minuty, vteřiny (Google) — i česká písmena', () => {
    const g = gpsZTextu('50°12\'33.1"N 15°49\'58.0"E')!;
    expect(g.lat).toBeCloseTo(50.209194, 5);
    expect(g.lng).toBeCloseTo(15.832778, 5);
    const c = gpsZTextu('50°12\'33.1"S 15°49\'58.0"V')!; // česky sever, východ
    expect(c.lat).toBeCloseTo(50.209194, 5);
    expect(c.lng).toBeCloseTo(15.832778, 5);
  });

  it('odkazy z map', () => {
    expect(gpsZTextu('https://mapy.cz/zakladni?x=15.8327664&y=50.2092003&z=17&source=coor&id=15.8327664%2C50.2092003'))
      .toEqual({ lat: 50.2092003, lng: 15.8327664 });
    expect(gpsZTextu('https://mapy.com/cs/zakladni?source=coor&y=50.2092003&z=17&x=15.8327664'))
      .toEqual({ lat: 50.2092003, lng: 15.8327664 });
    expect(gpsZTextu('https://www.google.com/maps/place/X/@50.2091944,15.8305861,17z/data=!3m1!4b1!4m4!3m3!8m2!3d50.2091944!4d15.8328'))
      .toEqual({ lat: 50.2091944, lng: 15.8328 });
    expect(gpsZTextu('https://www.google.com/maps/@50.0755,14.4378,15z')).toEqual({ lat: 50.0755, lng: 14.4378 });
    expect(gpsZTextu('https://maps.google.com/?q=50.0755,14.4378')).toEqual({ lat: 50.0755, lng: 14.4378 });
    expect(gpsZTextu('https://waze.com/ul?ll=50.0755%2C14.4378&navigate=yes')).toEqual({ lat: 50.0755, lng: 14.4378 });
  });

  it('nesmysl, adresa nebo zkrácený odkaz GPS nedají', () => {
    expect(gpsZTextu('')).toBeNull();
    expect(gpsZTextu('Korunní 10, Praha 2')).toBeNull();
    expect(gpsZTextu('https://maps.app.goo.gl/AbCdEf123')).toBeNull();
    expect(gpsZTextu('120.5, 300.2')).toBeNull();
  });

  it('zobrazení na šest míst', () => {
    expect(gpsText(50.2092, 15.8328)).toBe('50.209200, 15.832800');
  });
});

describe('uložení míst z formuláře', () => {
  it('ořízne texty, zahodí prázdné řádky, místo bez názvu pojmenuje podle adresy', () => {
    const r = mistaKUlozeni([
      { id: 'hk', nazev: ' Hradec ', adresa: ' Gočárova 1, Hradec Králové ', lat: 50.2, lng: 15.8 },
      { id: 'x', nazev: '', adresa: '', lat: null, lng: null },
      { id: 'y', nazev: '', adresa: 'Skladová 3, Kolín, 280 02', lat: null, lng: null },
      { id: 'z', nazev: '', adresa: null, lat: 50.1, lng: 14.2 },
    ]);
    expect(r).toEqual([
      { id: 'hk', nazev: 'Hradec', adresa: 'Gočárova 1, Hradec Králové', lat: 50.2, lng: 15.8 },
      { id: 'y', nazev: 'Kolín', adresa: 'Skladová 3, Kolín, 280 02', lat: null, lng: null },
      { id: 'z', nazev: 'Místo 4', adresa: null, lat: 50.1, lng: 14.2 },
    ]);
  });

  it('dvojí id se přejmenuje, nové místo má id', () => {
    const r = mistaKUlozeni([{ ...noveMisto('A'), id: 'q' }, { ...noveMisto('B'), id: 'q' }]);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
    expect(noveMisto('Praha').id).toMatch(/^[a-z0-9-]{6,}$/);
  });

  it('GPS z formuláře: nezměněné zůstane přesné, prázdné = bez GPS, nesmysl = chyba', () => {
    expect(gpsZFormulare('50.123457, 14.123457', { lat: 50.1234567, lng: 14.1234567 })).toEqual({ lat: 50.1234567, lng: 14.1234567 });
    expect(gpsZFormulare('50.2, 15.8', { lat: 50.1234567, lng: 14.1234567 })).toEqual({ lat: 50.2, lng: 15.8 });
    expect(gpsZFormulare('  ')).toEqual({ lat: null, lng: null });
    expect(gpsZFormulare('kousek za Hradcem')).toBe('nepoznane');
  });

  it('řádky formuláře → místa; nepoznané GPS se vrátí jako chyba', () => {
    const radek = radekZMista({ id: 'hk', nazev: 'Hradec', adresa: null, lat: 50.2091944, lng: 15.8328 });
    expect(radek).toEqual({ id: 'hk', nazev: 'Hradec', adresa: '', gps: '50.209194, 15.832800', lat0: 50.2091944, lng0: 15.8328 });
    expect(mistaZRadku([radek])).toEqual({ mista: [{ id: 'hk', nazev: 'Hradec', adresa: null, lat: 50.2091944, lng: 15.8328 }], chyby: [] });
    const r = mistaZRadku([{ ...radek, gps: 'nevím' }]);
    expect(r.chyby).toEqual(['Hradec: GPS jsem nepoznal']);
  });

  it('chybějící sloupec v databázi se pozná', () => {
    expect(chybiSloupecMist({ code: 'PGRST204', message: "Could not find the 'mista_zavozu' column of 'places'" })).toBe(true);
    expect(chybiSloupecMist({ code: '42703', message: 'column orders.misto_zavozu does not exist' })).toBe(true);
    expect(chybiSloupecMist({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(chybiSloupecMist(null)).toBe(false);
  });
});
