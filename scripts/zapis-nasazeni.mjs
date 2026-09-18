#!/usr/bin/env node
// 📌 Zapíše do supabase/nasazeno.json, které funkce se právě nasadily.
// Volá se z CI po povedeném nasazení: node scripts/zapis-nasazeni.mjs slug [slug…]
import { zaznamenejNasazeni } from './nasazeni-zaznam.mjs';

const slugy = process.argv.slice(2).filter(Boolean);
if (slugy.length === 0) {
  console.log('Nebyla předána žádná funkce — není co zapsat.');
  process.exit(0);
}
const zapsane = zaznamenejNasazeni(slugy);
console.log(zapsane.length > 0
  ? `Zapsáno do supabase/nasazeno.json: ${zapsane.join(', ')}`
  : 'Nic k zápisu (funkce se v repozitáři nenašly).');
