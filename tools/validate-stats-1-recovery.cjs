// Numerical validation of GrowthLens stats.js against simulated truth.
const S = require("c:/Users/Andrew/Documents/.Projects/growthlens/engine/stats.js");

let seed = 12345;
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

// 1) tau2 recovery (K=30, tau2=0.04)
let reps = 400, sumR = 0, sumD = 0;
for (let r = 0; r < reps; r++) {
  const { rows } = simOnce(30, -0.1, 0.04, 0.05, 0.2);
  sumR += S.remlTau2(rows); sumD += S.dlTau2(rows);
}
console.log("tau2 recovery (true 0.04, K=30): REML mean", (sumR/reps).toFixed(4), "| DL mean", (sumD/reps).toFixed(4));

// 2) EB credible-interval coverage of true theta + raw CI coverage + pooled-mu CI coverage
let inEB = 0, totEB = 0, inRaw = 0, inMu = 0, muReps = 0;
for (let r = 0; r < reps; r++) {
  const { rows, theta } = simOnce(25, -0.1, 0.03, 0.06, 0.25);
  const t2 = S.remlTau2(rows);
  const pooled = S.pooledMean(rows, t2);
  if (pooled.ciLo <= -0.1 && -0.1 <= pooled.ciHi) inMu++;
  muReps++;
  rows.forEach((row, i) => {
    const sh = S.shrink({ rawGap: row.gap, rawSe: row.se, tau2: t2, mu: pooled.mu });
    if (Math.abs(theta[i] - sh.shrunkGap) <= 1.96 * sh.shrunkSe) inEB++;
    if (Math.abs(theta[i] - row.gap) <= 1.96 * row.se) inRaw++;
    totEB++;
  });
}
console.log("EB 95% credible coverage of true effects:", (100*inEB/totEB).toFixed(1) + "%",
            "| raw 95% CI coverage:", (100*inRaw/totEB).toFixed(1) + "%",
            "| pooled-mean 95% CI coverage:", (100*inMu/muReps).toFixed(1) + "%");

// 3) small-K pooled coverage (K=7, like a 7-school district)
inMu = 0; muReps = 0;
for (let r = 0; r < 2000; r++) {
  const { rows } = simOnce(7, -0.1, 0.03, 0.06, 0.25);
  const t2 = S.remlTau2(rows);
  const pooled = S.pooledMean(rows, t2);
  if (pooled.ciLo <= -0.1 && -0.1 <= pooled.ciHi) inMu++;
  muReps++;
}
console.log("pooled-mean 95% CI coverage at K=7:", (100*inMu/muReps).toFixed(1) + "%");

// 4) golden-section upper bound: does 10*DL ever truncate REML badly?
let truncated = 0;
for (let r = 0; r < 400; r++) {
  const { rows } = simOnce(8, 0, 0.08, 0.15, 0.4);   // noisy, small K: DL often small
  const dl = S.dlTau2(rows);
  if (dl <= 0) continue;
  const reml = S.remlTau2(rows);
  const hi = Math.max(10 * dl, 1);
  if (reml > 0.98 * hi) truncated++;
}
console.log("REML estimates pinned at the search upper bound (of 400 noisy small-K reps):", truncated);

// 5) DL=0 shortcut: how often would REML have been positive when DL=0?
let dlZero = 0, remlWouldBePos = 0;
for (let r = 0; r < 1000; r++) {
  const { rows } = simOnce(10, 0, 0.01, 0.15, 0.3);  // weak heterogeneity
  if (S.dlTau2(rows) > 0) continue;
  dlZero++;
  // grid-search REML over [0, 0.5] to see if the mode is meaningfully positive
  const ll = (tau2) => { let sumLn=0,wS=0,wxS=0; for (const x of rows){const v=x.se*x.se+tau2;sumLn+=Math.log(v);wS+=1/v;wxS+=x.gap/v;} const mu=wxS/wS; let q=0; for (const x of rows){q+=(x.gap-mu)**2/(x.se*x.se+tau2);} return -0.5*(sumLn+Math.log(wS)+q); };
  let best = 0, bestLL = ll(0);
  for (let t = 0.001; t <= 0.5; t += 0.001) { const L = ll(t); if (L > bestLL) { bestLL = L; best = t; } }
  if (best > 0.005) remlWouldBePos++;
}
console.log("DL=0 cases:", dlZero, "| of those, grid-REML mode > 0.005:", remlWouldBePos);

// 6) weeks-per-SD averaging choice: 38/mean(es) vs mean(38/es), 2025 ELA factors
const es2025ela = [0.6072, 0.3352, 0.1881, 0.5718, 0.2808];
const a = 38 / (es2025ela.reduce((s, x) => s + x, 0) / es2025ela.length);
const b = es2025ela.map((x) => 38 / x).reduce((s, x) => s + x, 0) / es2025ela.length;
console.log("weeksPerSD 2025 ELA grade-average: 38/mean(es) =", a.toFixed(1), "| mean(38/es) =", b.toFixed(1));
console.log("grade-6 ELA 2024 weeks/SD =", (38/0.1289).toFixed(0), "-> a +0.20 SD cell shows", Math.round(0.2*38/0.1289), "weeks");
