// GrowthLens unit conversion — pure functions, no DOM. UMD: browser → window.GLUnits, Node → module.exports.
// SD ↔ weeks-of-learning via grade × subject × year conversion factors
// (reference/conversion_factors.json); see data-prep/ for how factors are built.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLUnits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FALLBACK_WEEKS_PER_SD = 132; // ≈ 38 / 0.29 — typical MAP convention if factors unavailable

  // The factor year actually used for (year, subject): the requested year when
  // factors exist, else the nearest year at or before it, else the earliest
  // available. Null when no usable factors are loaded — callers fall back to
  // the crude constant and should say so in any footnote.
  function resolveFactorYear(cf, year, subject) {
    if (!cf || !Array.isArray(cf.factors)) return null;
    if (cf.factors.some(f => f.year === year && f.subject === subject)) return year;
    const years = [...new Set(cf.factors.filter(f => f.subject === subject).map(f => f.year))];
    if (years.length === 0) return null;
    const prior = years.filter(y => y <= year);
    return prior.length ? Math.max(...prior) : Math.min(...years);
  }

  // weeks per 1 SD of growth residual. Exact-grade factor when grade is given
  // and present; otherwise the year × subject average across available grades.
  function weeksPerSD(cf, { year, subject, grade = null } = {}) {
    if (!cf || !Array.isArray(cf.factors)) return FALLBACK_WEEKS_PER_SD;
    const base = typeof cf.base_weeks === 'number' ? cf.base_weeks : 38;
    const useYear = resolveFactorYear(cf, year, subject);
    if (useYear == null) return FALLBACK_WEEKS_PER_SD;
    const matches = cf.factors.filter(f => f.year === useYear && f.subject === subject);

    let es = null;
    if (grade != null) {
      const exact = matches.find(f => f.grade === grade);
      if (exact) es = exact.annual_growth_effect_size;
    }
    if (es == null) {
      es = matches.reduce((s, f) => s + f.annual_growth_effect_size, 0) / matches.length;
    }
    if (!es || !isFinite(es) || es <= 0) return FALLBACK_WEEKS_PER_SD;
    return base / es;
  }

  return { FALLBACK_WEEKS_PER_SD, resolveFactorYear, weeksPerSD };
});
