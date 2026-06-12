// Shrink reference/prime_growth_database.csv for the wire: the growth z
// columns arrive with full double precision (17 significant digits, ~19
// chars each); the app displays 2 decimals and bins at 0.05, so 4 decimals
// preserve every displayed value while cutting the file by roughly a
// quarter. Run after dropping in a refreshed PRiME export:
//   node tools/trim-prime-db.cjs
const fs = require('fs');
const path = require('path');
const R = require('../engine/resources.js');   // parseCsv handles quoting

const FILE = path.join(__dirname, '../reference/prime_growth_database.csv');
const ROUND_COLS = ['growth_zscore_all_ela', 'growth_zscore_all_math'];

const text = fs.readFileSync(FILE, 'utf8');
const header = text.slice(0, text.indexOf('\n')).replace(/\r$/, '').split(',');
const rows = R.parseCsv(text);

const quote = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const out = [header.join(',')];
for (const r of rows) {
  out.push(header.map((h) => {
    let v = r[h] ?? '';
    if (ROUND_COLS.includes(h) && v !== '' && Number.isFinite(Number(v))) {
      v = String(parseFloat(Number(v).toFixed(4)));
    }
    return quote(String(v));
  }).join(','));
}
const result = out.join('\n') + '\n';
fs.writeFileSync(FILE, result);
console.log(`rows: ${rows.length}; size: ${(text.length / 1024).toFixed(1)} KB -> ${(result.length / 1024).toFixed(1)} KB`);
