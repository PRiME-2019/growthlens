const S = require("c:/Users/Andrew/Documents/.Projects/growthlens/engine/stats.js");
let seed = 4242;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Realistic operating point: 7-school district, per-school gap SEs 0.07-0.15
// (n of 250-900 per side), true between-school tau2 0.005 / 0.02.
function run(K, tau2) {
  let zeroT = 0, reps = 4000, covAll = 0, covZero = 0, covPos = 0, nAll = 0, nZero = 0, nPos = 0, widthZero = 0;
  for (let r = 0; r < reps; r++) {
    const rows = [], theta = [];
    for (let i = 0; i < K; i++) {
      const th = -0.1 + gauss() * Math.sqrt(tau2);
      const se = 0.07 + rnd() * 0.08;
      rows.push({ gap: th + gauss() * se, se }); theta.push(th);
    }
    const t2 = S.remlTau2(rows);
    const pooled = S.pooledMean(rows, t2);
    if (t2 === 0) zeroT++;
    rows.forEach((row, i) => {
      const sh = S.shrink({ rawGap: row.gap, rawSe: row.se, tau2: t2, mu: pooled.mu });
      const hit = Math.abs(theta[i] - sh.shrunkGap) <= 1.96 * sh.shrunkSe ? 1 : 0;
      covAll += hit; nAll++;
      if (t2 === 0) { covZero += hit; nZero++; widthZero += sh.shrunkSe; } else { covPos += hit; nPos++; }
    });
  }
  console.log(`K=${K} tau2=${tau2}: tau-hat=0 in ${(100*zeroT/reps).toFixed(0)}% of reps | EB cover all ${(100*covAll/nAll).toFixed(1)}%`
    + ` | cover when tau-hat=0: ${nZero ? (100*covZero/nZero).toFixed(1) : "-"}% (mean interval half-width ${(1.96*widthZero/Math.max(1,nZero)).toFixed(4)})`
    + ` | cover when tau-hat>0: ${nPos ? (100*covPos/nPos).toFixed(1) : "-"}%`);
}
run(7, 0.005);
run(7, 0.02);
run(15, 0.005);
