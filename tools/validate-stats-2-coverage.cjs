const S = require("c:/Users/Andrew/Documents/.Projects/growthlens/engine/stats.js");
let seed = 777;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function simOnce(K, mu, tau2, seLo, seHi) {
  const rows = [], theta = [];
  for (let i = 0; i < K; i++) {
    const th = mu + gauss() * Math.sqrt(tau2);
    const se = seLo + rnd() * (seHi - seLo);
    rows.push({ gap: th + gauss() * se, se });
    theta.push(th);
  }
  return { rows, theta };
}
// t quantiles (two-sided 95%) for df 1..30
const T95 = [12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];

function run(K, tau2, label) {
  let inEB = 0, inEBfix = 0, tot = 0, inMu = 0, inMuT = 0, reps = 3000;
  for (let r = 0; r < reps; r++) {
    const { rows, theta } = simOnce(K, -0.1, tau2, 0.06, 0.25);
    const t2 = S.remlTau2(rows);
    const pooled = S.pooledMean(rows, t2);
    const tq = T95[Math.min(29, K - 2)];
    if (pooled.mu - 1.96 * pooled.se <= -0.1 && -0.1 <= pooled.mu + 1.96 * pooled.se) inMu++;
    if (pooled.mu - tq * pooled.se <= -0.1 && -0.1 <= pooled.mu + tq * pooled.se) inMuT++;
    rows.forEach((row, i) => {
      const sh = S.shrink({ rawGap: row.gap, rawSe: row.se, tau2: t2, mu: pooled.mu });
      const B = sh.B;
      if (Math.abs(theta[i] - sh.shrunkGap) <= 1.96 * sh.shrunkSe) inEB++;
      // fuller EB sd: posterior var + (1-B)^2 * var(mu-hat)
      const sdFix = Math.sqrt(B * row.se * row.se + (1 - B) * (1 - B) * pooled.se * pooled.se);
      if (Math.abs(theta[i] - sh.shrunkGap) <= 1.96 * sdFix) inEBfix++;
      tot++;
    });
  }
  console.log(label,
    "| EB cover:", (100*inEB/tot).toFixed(1) + "%",
    "| EB+mu-var:", (100*inEBfix/tot).toFixed(1) + "%",
    "| mu z-CI:", (100*inMu/reps).toFixed(1) + "%",
    "| mu t-CI:", (100*inMuT/reps).toFixed(1) + "%");
}
run(7, 0.03, "K=7  tau2=0.03");
run(7, 0.01, "K=7  tau2=0.01");
run(15, 0.03, "K=15 tau2=0.03");
run(30, 0.03, "K=30 tau2=0.03");
