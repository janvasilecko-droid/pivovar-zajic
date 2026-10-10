// Skutečná uzávěrka z pokladny obchodu (fotka z 10. 10. 2026, Sumář prodeje
// 2/2873) přepsaná ručně do tvaru, v jakém ji vrací čtení z fotky. Slouží
// jen testům — čísla na účtence sedí sama se sebou (součet 20 675 Kč).
import type { PrectenaUzaverka } from './uzaverka.ts';

export const UCTENKA_2873: PrectenaUzaverka = {
  cislo: '2/2873',
  stredisko: '2',
  vytisteno: '2026-10-10T10:09',
  celkem: 20675,
  radky: [
    { kod: '393', nazev: 'Půllitr Mannheim 0,5l', mnozstvi: 1, cena: 140, celkem: 140 },
    { kod: '1106', nazev: 'Saponát 1l', mnozstvi: 1, cena: 25, celkem: 25 },
    { kod: '10241', nazev: 'Pivo sud 30l 10° světlá', mnozstvi: 8, cena: 1275, celkem: 10200 },
    { kod: '10242', nazev: 'Pivo sud 30l 12° světlá', mnozstvi: 1, cena: 1455, celkem: 1455 },
    { kod: '11000', nazev: 'Pivo sklo 12° světlá 0,33l', mnozstvi: 1, cena: 35, celkem: 35 },
    { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', mnozstvi: 7, cena: 48, celkem: 336 },
    { kod: '11004', nazev: 'Pivo sklo 12° tmavá 0,5l', mnozstvi: 5, cena: 49, celkem: 245 },
    { kod: '11005', nazev: 'Pivo sklo 12° tmavá 0,33l', mnozstvi: 2, cena: 36, celkem: 72 },
    { kod: '11009', nazev: 'Pivo sklo 10° sv. 0,5l', mnozstvi: 6, cena: 43, celkem: 258 },
    { kod: '11111', nazev: 'Kartonek', mnozstvi: 3, cena: 30, celkem: 90 },
    { kod: '11140', nazev: 'Pivo PET 1l 10° světlá', mnozstvi: 5, cena: 74, celkem: 370 },
    { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', mnozstvi: 13, cena: 84, celkem: 1092 },
    { kod: '11142', nazev: 'Pivo PET 1l 12° jantarový ležák', mnozstvi: 5, cena: 85, celkem: 425 },
    { kod: '11143', nazev: 'Pivo PET 1l 12° tmavá', mnozstvi: 3, cena: 86, celkem: 258 },
    { kod: '11144', nazev: 'Pivo PET 1l 11° světlý ležák', mnozstvi: 2, cena: 81, celkem: 162 },
    { kod: '11146', nazev: 'Pivo PET 1,5l 10° světlá', mnozstvi: 2, cena: 106, celkem: 212 },
    { kod: '11147', nazev: 'Pivo PET 1,5l 12° světlá', mnozstvi: 14, cena: 119, celkem: 1666 },
    { kod: '11148', nazev: 'Pivo PET 1,5l 12° jantarový ležák', mnozstvi: 4, cena: 121, celkem: 484 },
    { kod: '11149', nazev: 'Pivo PET 1,5l 12° tmavá', mnozstvi: 8, cena: 124, celkem: 992 },
    { kod: '11172', nazev: 'Pivo sklo 11° světlý ležák 0,33l', mnozstvi: 2, cena: 34, celkem: 68 },
    { kod: '11190', nazev: 'Pivo PET 1,5l 11° světlý ležák', mnozstvi: 4, cena: 115, celkem: 460 },
    { kod: '11197', nazev: 'Pivo PET 1l 8° Cyklistička Vosmička', mnozstvi: 5, cena: 73, celkem: 365 },
    { kod: '11198', nazev: 'Pivo PET 1,5l 8° Cyklistička Vosmička', mnozstvi: 5, cena: 105, celkem: 525 },
    { kod: '15117', nazev: 'Limo PET 1l (ks)', mnozstvi: 5, cena: 45, celkem: 225 },
    { kod: '15160', nazev: '0,5l limo sklo', mnozstvi: 7, cena: 31, celkem: 217 },
    { kod: '62019', nazev: 'Kyn-Pivní sprchový gel 300ml', mnozstvi: 2, cena: 149, celkem: 298 },
  ],
};
