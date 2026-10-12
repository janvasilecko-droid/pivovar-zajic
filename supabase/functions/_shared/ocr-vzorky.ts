// 🧪 Skutečné přepisy Google Vision z fotek objednávek (srpen–říjen 2026)
// a co na lístku doopravdy stojí — podle fotky a potvrzené objednávky.
// Sada pro test opravOcrObjednavky (google-ocr.test.ts): co se dá opravit
// pravidly, musí vyjít správně; zbytek („jenFotka") Vision zkomolí tak, že
// ho přečte jen Gemini z fotky (ukázky rukopisu viz RUKOPIS_LISTKU).
//
// Nové fotky přidávej sem: [přepis z Vision, co je na lístku, jenFotka?].

export type VzorekOcr = [ocr: string, listek: string, jenFotka?: true];

export const VZORKY_OCR: Record<string, VzorekOcr[]> = {
  "2026-10-12 Radek (JONA, Drobák, Sklad)": [
    ["10x 11, 11° Sv.", "10x 1l 11° SV."],
    ['10x 1 12" JANTAR', "10x 1l 12° JANTAR"],
    ["10x 1120 TL", "10x 1l 12° TL"],
    ["10x 11 12 WINTER", "10x 1l 12° WINTER"],
    ["15x11 11°", "15x 1l 11°"],
    ["10x 1,51 11° Sv.", "10x 1,5l 11° SV."],
    ["20x 0,5 LIMO-CITRON", "20x 0,5l LIMO-CITRON"],
    ["20x 0,5! 10°", "20x 0,5l 10°"],
    ['20x 0,5" 12" Sv.', "20x 0,5l 12° SV."],
    ["20× 0,5) 12° WINTER", "20x 0,5l 12° WINTER"],
    ["35 x 11 12° sv.", "35x 1l 12° SV."],
    ["35x 11 11° Sv", "35x 1l 11° SV"],
    ["10x 10 100", "10x 1l 10°", true], // „1l" čte jako „10" — sud 10 l existuje
    ["10x 12 12° JANTAR", "10x 1l 12° JANTAR"],
    ["10x 1 12° WINTER", "10x 1l 12° WINTER"],
    ["SUAD 51 11 120 FL", "SKLAD 5x 1l 12° TL", true],
    ["3x 101 11°sv", "3x 10l 11° SV"],
    ["2x 15h 11°sv", "2x 15l 11° SV"],
    ["2 x 151 12° WINTER", "2x 15l 12° WINTER"],
    ["1x 15 120", "1x 15l 12°"],
    ["SX 20l 120", "5x 20l 12°", true], // „5" vypadá jako „S"
  ],
  "2026-09-18 Radek sklad pondělí": [
    ["17x 30l 10°", "17x 30l 10°"],
    ["2x 201 110", "2x 20l 11°"],
    ["17x 301 12°", "17x 30l 12°"],
    ["17 x 30l Mo", "17x 30l 11°"],
    ["2x10", "2x 10l 11°", true], // stupeň OCR přesunul na další řádek
    ["2x 15 11°", "2x 15l 11°"],
    ["20x 05 11°su.", "20x 0,5l 11° SV."],
    ["20x0,5/12°", "20x 0,5l 12°"],
  ],
  "2026-09-16 Radek sklad pondělí": [
    ["17 x 30% 100", "17x 30l 10°"],
    ["17x 301 Mo", "17x 30l 11°"],
    ["17x 30l 120", "17x 30l 12°"],
    ["3x 10f 110", "3x 10l 11°"],
    ["1x 15 11°", "1x 15l 11°"],
    ["20x 0,5l 11° Sv.", "20x 0,5l 11° SV."],
    ['20x0,51 12"', "20x 0,5l 12°"],
  ],
  "2026-09-07 Radek limo": [
    ["+ 1K 30 | LIMO VIŠEN", "1x 30l LIMO VIŠEŇ"],
    ["1x 30|LIMO KIUI", "1x 30l LIMO KIWI"],
  ],
  "2026-09-07 Radek čtvrtek": [
    ["11 11° Sv.", "25x 1l 11° SV.", true], // „25x" OCR utrhl na předchozí řádek
    ["25x11 12°", "25x 1l 12°"],
    ["10 x 11 10°", "10x 1l 10°"],
    ["10 x 11 12 JANTAN", "10x 1l 12° JANTAR"],
    ["20x 0,5l 12°", "20x 0,5l 12°"],
    ["20x0,5l 10°", "20x 0,5l 10°"],
    ["20x 11° SU", "20x 11° SV"], // JONA: obal nenapsaný (1l jako ostatní)
    ["10x 120", "10x 12°"],
    ["10x 12° TL", "10x 12° TL"],
    ["5+30l 120", "5x 30l 12°"],
    ["3x M's", "3x 10l 11° SV", true], // přepsaná číslice
    ["1x 45", "1x 15l 11° SV.", true], // stupeň OCR přesunul na další řádek
    ["3x 30l 12° JANTAR", "3x 30l 12° JANTAR"],
    ["2x 301 LIMO CITRON", "2x 30l LIMO CITRON"],
    ["14x 301 10°", "14x 30l 10°"],
    ["10x 30l 11° Sv.", "10x 30l 11° SV."],
    ["14x 301 12°", "14x 30l 12°"],
    ["1x 10 NEBO 15 120", "1x 10l NEBO 15l 12°", true],
  ],
  "2026-08-31 Radek středa": [
    ["Sx 30 12°", "8x 30l 12°", true], // „8" vypadá jako „S"
    ["8x301 100", "8x 30l 10°"],
    ["2x 30 12° JANTAR", "2x 30l 12° JANTAR"],
    ["1x15 11°", "1x 15l 11°"],
    ["1x 10l 12° PETASNER !", "1x 10l 12° PETASNER !"],
    ["10x 18 10°", "10x 1l 10°"],
    ["10x 18 11°", "10x 1l 11°"],
    ["10x11 12°", "10x 1l 12°"],
    ["10x11 12° JANTAR", "10x 1l 12° JANTAR"],
    ["10x11 80", "10x 1l 8°"],
    ["5x 30l 120", "5x 30l 12°"],
    ["6x301 110", "6x 30l 11°"],
  ],
  "2026-08-25 Radek čtvrtek": [
    ["3×50l 110", "3x 50l 11°"],
    ["8x30 10°", "8x 30l 10°"],
    ['8 x 30l 12"', "8x 30l 12°"],
    ["3<301 LIMO", "3x 30l LIMO"],
    ["4x 300 11°", "4x 30l 11°"],
    ["4x 301 12° JANTAR (2x VÝMENA)", "4x 30l 12° JANTAR (2x VÝMĚNA)"],
    ["15x 18 120", "15x 1l 12°"],
    ["15< 11 11°", "15x 1l 11°"],
    ["2005 LIMO CIT.", "20x 0,5l LIMO CIT."],
    ["20x 0,51 -11- GREP", "20x 0,5l -11- GREP"],
  ],
  "2026-08-18 Radek plus": [
    ["+ 10x 1,5l 12°", "10x 1,5l 12°"],
    ["10x 11 120.", "10x 1l 12°"],
    ["10x 11 11°", "10x 1l 11°"],
    ["10x 11 11° SUMMER", "10x 1l 11° SUMMER"],
  ],
  "2026-08-18 Radek čtvrtek": [
    ["Jx30112-", "5x 30l 12°", true],
    ["10x 11.8°", "10x 1l 8°"],
    ["6x 1 11° SUMMER", "6x 1l 11° SUMMER"],
    ["Sx 11 Mosv.", "8x 1l 11° SV.", true], // „8" vypadá jako „S"
    ["8x11 120", "8x 1l 12°"],
    ["10x 1110°", "10x 1l 10°"],
    ["10x 1l M°sv.", "10x 1l 11° SV."],
    ["10x 11 12° JANTAR", "10x 1l 12° JANTAR"],
    ["10x18 12", "10x 1l 12°"],
    ["10x11 &", "10x 1l 8°"],
    ["10x 11 11° SOMMER", "10x 1l 11° SUMMER"],
    ["5x sol 100", "5x 30l 10°"],
    ["5x301 110", "5x 30l 11°"],
    ["15x30 11 SUMMER", "15x 30l 11° SUMMER"],
    ["5×301 120", "5x 30l 12°"],
    ["2x 30 LIMO CIT.", "2x 30l LIMO CIT."],
    ["1x 45 120", "1x 15l 12°"],
    ["2x 101 11°", "2x 10l 11°"],
  ],
};
