// GrowthLens unit conversion — pure functions, no DOM. UMD: browser → window.GLUnits, Node → module.exports.
// SD ↔ weeks-of-learning via grade × subject × year conversion factors
// (reference/conversion_factors.json); see data-prep/ for how factors are built.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLUnits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ≈ 38 instructional weeks ÷ 0.29, a typical mid-grades annual-growth
  // effect size consistent with the national adjacent-grade growth norms
  // (Bloom, Hill, Black & Lipsey 2008). Used only when the factor table
  // fails to load; figure footnotes disclose the fallback.
  const FALLBACK_WEEKS_PER_SD = 132;

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
  // Convention: average the EFFECT SIZES first, convert second (base/mean(es)).
  // mean(base/es) would run ~20% larger; this form weights grades by their
  // growth on the score scale and is the more conservative conversion
  // (documented in methods.html §5).
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
