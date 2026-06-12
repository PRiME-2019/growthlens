// Calibration of the SHIPPED interval policy (post methodology-review fixes),
// exercised exactly as engine/compute.js applies it:
//   - tau-hat = 0 (or k < 2)  ->  raw estimate with z = 1.96 (calibrated as-is)
//   - otherwise               ->  EB posterior with muSe-widened SD and t(k-1)
// Run: node tools/validate-stats-4-policy.cjs
const S = require('../engine/stats.js');

let seed = 31337;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function run(K, tau2, reps = 3000) {
  let hits = 0, tot = 0, muHits = 0;
  for (let r = 0; r < reps; r++) {
    const rows = [], theta = [];
    for (let i = 0; i < K; i++) {
      const th = -0.1 + gauss() * Math.sqrt(tau2);
      const se = 0.07 + rnd() * 0.08;     // per-school gap SEs for 250-900 students/side
      rows.push({ gap: th + gauss() * se, se }); theta.push(th);
    }
    const t2 = S.remlTau2(rows);
    const canShrink = rows.length >= 2 && t2 > 0;
    const pooled = S.pooledMean(rows, t2);
    const q = S.tCrit95(rows.length - 1);
    if (pooled.ciLo <= -0.1 && -0.1 <= pooled.ciHi) muHits++;
    rows.forEach((row, i) => {
      if (!canShrink) {
        hits += Math.abs(theta[i] - row.gap) <= 1.96 * row.se ? 1 : 0;
      } else {
        const sh = S.shrink({ rawGap: row.gap, rawSe: row.se, tau2: t2, mu: pooled.mu, muSe: pooled.se });
        hits += Math.abs(theta[i] - sh.shrunkGap) <= q * sh.shrunkSe ? 1 : 0;
      }
      tot++;
    });
  }
  console.log(`K=${K} tau2=${tau2}: school-interval coverage = ${(100 * hits / tot).toFixed(1)}%`
    + ` | district t-CI coverage = ${(100 * muHits / reps).toFixed(1)}%`);
}
console.log('Shipped policy calibration (nominal 95%):');
for (const K of [5, 7, 10, 15, 30]) for (const t of [0.005, 0.02, 0.06]) run(K, t);
