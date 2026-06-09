// GrowthLens statistics — pure functions, no DOM/DuckDB. UMD: browser → window.GLStats, Node → module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    cellSE: function ({ s2, ms2, n }) {
      if (!n || n < 1) return null;
      if (n === 1) return Math.sqrt(ms2);
      return Math.sqrt(Math.max(s2, ms2) / n);
    },
    gapSE: function (seA, seB) { return Math.sqrt(seA * seA + seB * seB); },
    shrink: function ({ rawGap, rawSe, tau2, mu }) {
      const B = tau2 / (tau2 + rawSe * rawSe);
      return { B, shrunkGap: B * rawGap + (1 - B) * mu, shrunkSe: Math.sqrt(B) * rawSe };
    },
    pooledMean: function (rows, tau2) {
      let wS = 0, wxS = 0;
      for (const r of rows) { const w = 1 / (r.se * r.se + tau2); wS += w; wxS += w * r.gap; }
      if (wS <= 0) return null;
      const mu = wxS / wS, se = 1 / Math.sqrt(wS);
      return { mu, se, ciLo: mu - 1.96 * se, ciHi: mu + 1.96 * se };
    },
    dlTau2: function (rows) {
      const k = rows.length;
      if (k < 2) return 0;
      let sw = 0, swx = 0, sw2 = 0;
      for (const r of rows) { const w = 1 / (r.se * r.se); sw += w; swx += w * r.gap; sw2 += w * w; }
      const mu = swx / sw;
      let Q = 0; for (const r of rows) { Q += (1 / (r.se * r.se)) * (r.gap - mu) ** 2; }
      const c = sw - sw2 / sw;
      return Math.max(0, (Q - (k - 1)) / c);
    },
    remlTau2: function (rows) {
      const k = rows.length;
      if (k < 2) return 0;
      const dl = this.dlTau2(rows);
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
    _quantile: function (sorted, q) {
      if (sorted.length === 0) return 0;
      const pos = (sorted.length - 1) * q, base = Math.floor(pos), rest = pos - base;
      return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
    },
    summarize: function (values) {
      const sorted = values.slice().sort((a, b) => a - b);
      const q1 = this._quantile(sorted, 0.25), q3 = this._quantile(sorted, 0.75), median = this._quantile(sorted, 0.5);
      const iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      const whiskerLo = sorted.find(v => v >= lo) ?? sorted[0];
      const whiskerHi = [...sorted].reverse().find(v => v <= hi) ?? sorted[sorted.length - 1];
      const outliers = sorted.filter(v => v < lo || v > hi);
      const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
      return { n: sorted.length, mean, median, q1, q3, whiskerLo, whiskerHi, outliers, min: sorted[0], max: sorted[sorted.length - 1] };
    },
    ols: function (points, xKey, yKey) {
      const n = points.length; let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
      for (const p of points) { const x = p[xKey], y = p[yKey]; sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; }
      const mx = sx / n, my = sy / n;
      const slope = (sxy - n * mx * my) / (sxx - n * mx * mx), intercept = my - slope * mx;
      const ssTot = syy - n * my * my;
      let ssRes = 0; for (const p of points) { const yh = intercept + slope * p[xKey]; ssRes += (p[yKey] - yh) ** 2; }
      return { slope, intercept, r2: 1 - ssRes / ssTot };
    },
  };
});
