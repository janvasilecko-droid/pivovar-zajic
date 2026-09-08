/**
 * ⏱️ Hodnota, která se „dožene" až po chvíli klidu.
 *
 * Inventura přepočítává celou bilanční tabulku (přes 300 řádků: očekávaný
 * stav, manko, dorovnání, ceny) při KAŽDÉ změně políčka. Na počítači to není
 * znát, na telefonu se psaní zadrhává — mezi úhozem a písmenem na displeji
 * je vidět prodleva.
 *
 * Políčko proto zůstává okamžité (píše se do `actualStock`) a těžký přepočet
 * se pověsí na odloženou kopii: přepočítá se jednou, až člověk na chvíli
 * přestane psát.
 *
 * Prodleva je schválně krátká (150 ms). Delší by se projevila tím, že po
 * dopsání čísla ještě chvíli svítí stará barva políčka — a políčko, které
 * lže o shodě se skladem, je horší než mírné zdržení.
 */
import { useEffect, useState } from 'react';

export function useOdlozenaHodnota<T>(hodnota: T, prodlevaMs = 150): T {
  const [odlozena, setOdlozena] = useState(hodnota);

  useEffect(() => {
    const id = setTimeout(() => setOdlozena(hodnota), prodlevaMs);
    return () => clearTimeout(id);
  }, [hodnota, prodlevaMs]);

  return odlozena;
}
