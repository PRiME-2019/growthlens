// GrowthLens key-takeaway generators — pure functions, no DOM. UMD: browser →
// window.GLInsights, Node → module.exports.
//
// Each generator turns an analysis shape into 2-4 plain-language takeaways,
// ordered most- to least-important, capped at four (three insights + an
// optional caveat). Strings carry **bold** markers the UI renders as emphasis;
// items with `caveat: true` render muted. Number formatting is injected via
// `fmt.val(z, opts)` so callers control SD vs. weeks (and per-grade factors)
// without this module knowing about conversion tables.
//
// The successor of the R prototype's fct_interpretation.R: same vocabulary
// (ranked extremes, direction words, pervasiveness, reversals, suppression
// notes), recast over the engine's computed shapes.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const fmtSDDefault = { val: (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + ' SD' };
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Three insights max, then the caveat — never more than four items total.
  function select(candidates, caveat) {
    const out = candidates.filter(Boolean).slice(0, 3);
    if (caveat) out.push(caveat);
    return out;
  }

  // ---- Gap Analysis -----------------------------------------------------
  // slices: { key: { meta, schools } } for the active subject (all available
  // comparisons, not just the one on screen); activeKey picks the comparison
  // the figure currently shows; mode follows the global Shrunken/Raw setting.
  function gapTakeaways({ slices = {}, activeKey, mode = 'shrunk', fmt = fmtSDDefault } = {}) {
    const active = slices[activeKey];
    if (!active || !active.meta) return [];
    const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
    const ciKey = mode === 'raw' ? 'raw_ci95' : 'shrunk_ci95';
    const { groupA, groupB, districtGap } = active.meta;
    const dirWord = (g) => (g < 0 ? 'behind' : 'ahead');

    const meets = active.schools.filter((s) => s.meets_min_cell && Number.isFinite(s[gapKey]));
    const below = active.schools.filter((s) => !s.meets_min_cell);

    // A — widest / narrowest district-wide gap across every comparison the
    // data carries (this is the one takeaway allowed to look past activeKey).
    let ranking = null;
    const ranked = Object.values(slices)
      .filter((sl) => sl && sl.meta && Number.isFinite(sl.meta.districtGap))
      .sort((a, b) => Math.abs(b.meta.districtGap) - Math.abs(a.meta.districtGap));
    if (ranked.length >= 2) {
      const widest = ranked[0].meta, narrowest = ranked[ranked.length - 1].meta;
      ranking = {
        text: `Of the ${ranked.length} group comparisons in this data, the widest district-wide gap is `
          + `**${widest.groupA} vs. ${widest.groupB}** (${fmt.val(widest.districtGap)}); the narrowest is `
          + `**${narrowest.groupA} vs. ${narrowest.groupB}** (${fmt.val(narrowest.districtGap)}).`,
      };
    }

    // B — pervasiveness of the active comparison: is this one campus, or the
    // whole district? "Clear of zero" = the school's interval excludes zero on
    // the same side as the district direction.
    let pervasiveness = null;
    if (meets.length >= 2 && Math.abs(districtGap) > 1e-9) {
      const dSign = Math.sign(districtGap);
      const same = meets.filter((s) => Math.sign(s[gapKey]) === dSign);
      const clear = same.filter((s) => {
        const ci = s[ciKey];
        return ci && (dSign < 0 ? ci[1] < 0 : ci[0] > 0);
      });
      if (same.length / meets.length >= 2 / 3) {
        const clearClause = clear.length > 0
          ? `, ${clear.length} of them with intervals clear of zero`
          : ', though no single school is clear of zero on its own';
        pervasiveness = {
          text: `This isn't a one-campus story: **${same.length} of ${meets.length}** reliable schools show `
            + `${groupA} ${dirWord(districtGap)}${clearClause}.`,
        };
      } else {
        pervasiveness = {
          text: `The picture is mixed: only **${same.length} of ${meets.length}** reliable schools show `
            + `${groupA} ${dirWord(districtGap)}.`,
        };
      }
    }

    // C — reversals: reliable schools whose gap points the other way from the
    // district (and isn't just noise around zero).
    let reversal = null;
    if (meets.length >= 2 && Math.abs(districtGap) >= 0.02) {
      const dSign = Math.sign(districtGap);
      const rev = meets
        .filter((s) => Math.sign(s[gapKey]) === -dSign && Math.abs(s[gapKey]) >= 0.02)
        .sort((a, b) => Math.abs(b[gapKey]) - Math.abs(a[gapKey]))
        .slice(0, 2);
      if (rev.length > 0) {
        const names = rev.map((s) => `**${s.school_id}** (${fmt.val(s[gapKey])})`).join(' and ');
        reversal = {
          text: `The gap reverses at ${names} — ${groupA} students grow ${dirWord(rev[0][gapKey])} of their `
            + `${groupB} peers there.`,
        };
      }
    }

    // D — school-level extremes for the active comparison.
    let extremes = null;
    if (meets.length >= 2) {
      const byAbs = [...meets].sort((a, b) => Math.abs(b[gapKey]) - Math.abs(a[gapKey]));
      const widest = byAbs[0], closest = byAbs[byAbs.length - 1];
      extremes = {
        text: `**${widest.school_id}** has the widest school-level gap (${fmt.val(widest[gapKey])}, `
          + `${groupA} ${dirWord(widest[gapKey])}); **${closest.school_id}** comes closest to parity `
          + `(${fmt.val(closest[gapKey])}).`,
      };
    }

    const caveat = below.length > 0
      ? {
          caveat: true,
          text: `Note: ${plural(below.length, 'school')} with too few students to read reliably `
            + `${below.length === 1 ? 'is' : 'are'} not counted in these takeaways.`,
        }
      : null;

    return select([ranking, pervasiveness, reversal, extremes], caveat);
  }

  // ---- System Scan --------------------------------------------------------
  // heat: HEATMAP_DATA ({ meta, schools: [{ school_id, grades: {g: {n,r,ok}} }] }).
  // Per-grade values pass { grade } to fmt so weeks mode can use the
  // grade-specific factor; pooled school values pass no grade (grade-average).
  function scanTakeaways({ heat, fmt = fmtSDDefault } = {}) {
    if (!heat || !Array.isArray(heat.schools)) return [];

    const cells = [];
    let suppressed = 0;
    for (const s of heat.schools) {
      for (const [g, c] of Object.entries(s.grades || {})) {
        if (!c || !(c.n > 0)) continue;
        if (c.ok) cells.push({ school: s.school_id, grade: g, n: c.n, r: c.r });
        else suppressed++;
      }
    }
    if (cells.length === 0) return [];

    const wMean = (xs) => {
      const n = xs.reduce((t, c) => t + c.n, 0);
      return n > 0 ? xs.reduce((t, c) => t + c.r * c.n, 0) / n : null;
    };

    // A — strongest / weakest school overall (n-weighted across its grades).
    let schoolExtremes = null;
    const bySchool = heat.schools
      .map((s) => ({ id: s.school_id, cells: cells.filter((c) => c.school === s.school_id) }))
      .filter((s) => s.cells.length > 0)
      .map((s) => ({ id: s.id, mean: wMean(s.cells) }));
    if (bySchool.length >= 2) {
      const sorted = [...bySchool].sort((a, b) => b.mean - a.mean);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      schoolExtremes = {
        text: `**${best.id}** shows the strongest overall growth (${fmt.val(best.mean)}); `
          + `**${worst.id}** the weakest (${fmt.val(worst.mean)}).`,
      };
    }

    // B — fastest / slowest grade district-wide, only when the spread is big
    // enough to mean something (same 0.05 SD bar the R prototype used).
    let gradeExtremes = null;
    const grades = [...new Set(cells.map((c) => c.grade))];
    const byGrade = grades
      .map((g) => ({ g, mean: wMean(cells.filter((c) => c.grade === g)) }))
      .filter((x) => x.mean != null);
    if (byGrade.length >= 2) {
      const sorted = [...byGrade].sort((a, b) => b.mean - a.mean);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      if (best.mean - worst.mean > 0.05) {
        gradeExtremes = {
          text: `District-wide, **grade ${best.g}** is growing fastest (${fmt.val(best.mean, { grade: best.g })}); `
            + `**grade ${worst.g}** slowest (${fmt.val(worst.mean, { grade: worst.g })}).`,
        };
      }
    }

    // C — standout cells (|r| ≥ 0.15, the R prototype's notable-cell bar).
    let standout = null;
    const notable = cells.filter((c) => Math.abs(c.r) >= 0.15)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 2);
    if (notable.length > 0) {
      const items = notable.map((c) =>
        `**${c.school} · grade ${c.grade}** (${fmt.val(c.r, { grade: c.grade })}, n=${c.n})`).join('; ');
      standout = { text: `The cells that stand out most: ${items}.` };
    }

    // D — sign consistency: schools pointing one way across every grade they
    // serve (needs at least two readable grades to count).
    let consistency = null;
    const consistent = heat.schools
      .map((s) => cells.filter((c) => c.school === s.school_id))
      .filter((cs) => cs.length >= 2 && cs.every((c) => Math.sign(c.r) === Math.sign(cs[0].r)));
    if (consistent.length >= 2) {
      const above = consistent.filter((cs) => cs[0].r >= 0).length;
      const belowN = consistent.length - above;
      consistency = {
        text: `**${consistent.length} of ${heat.schools.length}** schools point the same way across every grade `
          + `they serve — ${above} above expectations, ${belowN} below.`,
      };
    }

    const caveat = suppressed > 0
      ? {
          caveat: true,
          text: `Note: ${plural(suppressed, 'school-grade cell')} with fewer than 10 students `
            + `${suppressed === 1 ? 'is' : 'are'} left out of these takeaways.`,
        }
      : null;

    return select([schoolExtremes, gradeExtremes, standout, consistency], caveat);
  }

  return { gapTakeaways, scanTakeaways };
});
