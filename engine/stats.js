// GrowthLens statistics — pure functions, no DOM/DuckDB. UMD: browser → window.GLStats, Node → module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function quantile(sorted, q) {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q, base = Math.floor(pos), rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  }

  // Two-sided 95% Student-t critical values for df 1..30 (normal beyond).
  // The pooled-mean and shrunken-school intervals use t(k−1), a
  // Knapp–Hartung-style small-k correction for the fact that μ and τ² are
  // themselves estimated from only k schools. Calibration:
  // tools/validate-stats-*.cjs.
  const T_CRIT_95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
    2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
    2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
  function tCrit95(df) {
    if (!(df >= 1)) return 1.96;
    return df >= 30 ? 1.96 : T_CRIT_95[Math.round(df) - 1];
  }

  function dlTau2(rows) {
    const k = rows.length;
    if (k < 2) return 0;
    let sw = 0, swx = 0, sw2 = 0;
    for (const r of rows) { const w = 1 / (r.se * r.se); sw += w; swx += w * r.gap; sw2 += w * w; }
    const mu = swx / sw;
    let Q = 0; for (const r of rows) { Q += (1 / (r.se * r.se)) * (r.gap - mu) ** 2; }
    const c = sw - sw2 / sw;
    return Math.max(0, (Q - (k - 1)) / c);
  }

  const api = {
    cellSE: function ({ s2, ms2, n }) {
      if (n == null || n < 1) return null;
      if (n === 1) return Math.sqrt(ms2);
      return Math.sqrt(Math.max(s2, ms2) / n);
    },
    gapSE: function (seA, seB) { return Math.sqrt(seA * seA + seB * seB); },
    // Empirical-Bayes posterior. With muSe (the pooled mean's SE) supplied,
    // the posterior SD also carries the uncertainty about μ̂ itself:
    //   sd² = B·se² + (1−B)²·SE(μ̂)²
    // — without it (muSe = 0) this reduces to the classic μ-known √B·se,
    // which materially undercovers in small districts (see the calibration
    // scripts in tools/).
    shrink: function ({ rawGap, rawSe, tau2, mu, muSe = 0 }) {
      const B = tau2 / (tau2 + rawSe * rawSe);
      const shrunkSe = Math.sqrt(B * rawSe * rawSe + (1 - B) * (1 - B) * muSe * muSe);
      return { B, shrunkGap: B * rawGap + (1 - B) * mu, shrunkSe };
    },
    // Random-effects pooled mean. The CI uses t(k−1) rather than 1.96: with
    // few schools the plug-in τ̂² makes the z interval anticonservative
    // (simulated coverage ≈ 90% at k=7; t restores ≈ 95%).
    pooledMean: function (rows, tau2 = 0) {
      let wS = 0, wxS = 0;
      for (const r of rows) { const w = 1 / (r.se * r.se + tau2); wS += w; wxS += w * r.gap; }
      if (wS <= 0) return null;
      const mu = wxS / wS, se = 1 / Math.sqrt(wS);
      const q = tCrit95(rows.length - 1);
      return { mu, se, ciLo: mu - q * se, ciHi: mu + q * se };
    },
    tCrit95,
    dlTau2: dlTau2,
    remlTau2: function (rows) {
      const k = rows.length;
      if (k < 2) return 0;
      const dl = dlTau2(rows);
      if (dl <= 0) return 0;
      const ll = (tau2) => {
        let sumLn = 0, wS = 0, wxS = 0;
        for (const r of rows) { const v = r.se * r.se + tau2; const w = 1 / v; sumLn += Math.log(v); wS += w; wxS += w * r.gap; }
        const mu = wxS / wS;
        let q = 0; for (const r of rows) { q += (1 / (r.se * r.se + tau2)) * (r.gap - mu) ** 2; }
        return -0.5 * (sumLn + Math.log(wS) + q);
      };
      let lo = 0, hi = Math.max(10 * dl, 1), gr = (Math.sqrt(5) - 1) / 2;
      let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
      for (let i = 0; i < 200; i++) {
        if (ll(c) > ll(d)) hi = d; else lo = c;
        c = hi - gr * (hi - lo); d = lo + gr * (hi - lo);
        if (hi - lo < 1e-7) break;
      }
      const t = (lo + hi) / 2;
      return t < 1e-8 ? 0 : t;
    },
    summarize: function (values) {
      if (!values || values.length === 0) return null;
      const sorted = values.slice().sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), median = quantile(sorted, 0.5);
      const iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      const whiskerLo = sorted.find(v => v >= lo) ?? sorted[0];
      const whiskerHi = [...sorted].reverse().find(v => v <= hi) ?? sorted[sorted.length - 1];
      const outliers = sorted.filter(v => v < lo || v > hi);
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      return { n: sorted.length, mean, median, q1, q3, whiskerLo, whiskerHi, outliers, min: sorted[0], max: sorted[sorted.length - 1] };
    },
    ols: function (points, xKey, yKey) {
      const n = points.length;
      if (n < 2) return null;
      let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
      for (const p of points) { const x = p[xKey], y = p[yKey]; sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; }
      const mx = sx / n, my = sy / n;
      const denom = sxx - n * mx * mx;
      if (Math.abs(denom) < 1e-12) return null;
      const slope = (sxy - n * mx * my) / denom, intercept = my - slope * mx;
      const ssTot = syy - n * my * my;
      let ssRes = 0; for (const p of points) { const yh = intercept + slope * p[xKey]; ssRes += (p[yKey] - yh) ** 2; }
      const r2 = Math.abs(ssTot) < 1e-12 ? 1 : 1 - ssRes / ssTot;
      return { slope, intercept, r2 };
    },
  };
  return api;
});
