const fs = require('fs');
const path = require('path');

const backupPath = 'd:/stazene/zajic/whatsapp-incoming-backups/whatsapp_incoming_2026-08-09.json';

if (!fs.existsSync(backupPath)) {
  console.error('Backup not found!');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
console.log('Total messages in backup:', data.length);

const filtered = data.filter(x => {
  const dateStr = x.message_timestamp || x.created_at;
  const date = new Date(dateStr);
  const friday = new Date('2026-08-07T00:00:00Z');
  return x.sender_name === 'Objednávky pivovar' && date >= friday;
});

console.log('Matching messages since Friday 7.8 in backup count:', filtered.length);
if (filtered.length > 0) {
  console.log('First 5 matching backup messages:');
  console.log(filtered.slice(0, 5));
}
