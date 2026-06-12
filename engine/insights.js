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
    // the same side as the district direction. With a single reliable school
    // there is nothing to spread across — say so explicitly instead, since the
    // "district-wide" number is really just that school.
    let pervasiveness = null;
    if (meets.length === 1) {
      pervasiveness = {
        text: `**${meets[0].school_id}** is the only school with enough students to compare here, `
          + `so the district-wide gap is just this school's gap.`,
      };
    } else if (meets.length >= 2 && Math.abs(districtGap) > 1e-9) {
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

    // Cell values prefer the engine's shrunken estimate (rs) so the takeaways
    // describe exactly what the heatmap displays; raw is the fallback for
    // older fixtures or grades the engine couldn't pool.
    const val = (c) => (c.rs != null ? c.rs : c.r);
    const cells = [];
    let suppressed = 0;
    for (const s of heat.schools) {
      for (const [g, c] of Object.entries(s.grades || {})) {
        if (!c || !(c.n > 0)) continue;
        if (c.ok) cells.push({ school: s.school_id, grade: g, n: c.n, r: val(c) });
        else suppressed++;
      }
    }
    if (cells.length === 0) return [];

    const wMean = (xs) => {
      const n = xs.reduce((t, c) => t + c.n, 0);
      return n > 0 ? xs.reduce((t, c) => t + c.r * c.n, 0) / n : null;
    };

    // A — strongest / weakest school overall: the data-shipped school-level
    // value (same shrinkage as Status & Growth) when present, else an
    // n-weighted mean across the school's readable grades.
    let schoolExtremes = null;
    const bySchool = heat.schools
      .map((s) => ({ id: s.school_id, overall: s.overall, cells: cells.filter((c) => c.school === s.school_id) }))
      .filter((s) => s.overall || s.cells.length > 0)
      .map((s) => ({ id: s.id, mean: s.overall ? val(s.overall) : wMean(s.cells) }));
    if (bySchool.length >= 2) {
      const sorted = [...bySchool].sort((a, b) => b.mean - a.mean);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      schoolExtremes = {
        text: `**${best.id}** shows the strongest overall growth (${fmt.val(best.mean)}); `
          + `**${worst.id}** the weakest (${fmt.val(worst.mean)}).`,
      };
    } else if (bySchool.length === 1) {
      // Single-school upload: no across-school comparison to make — anchor
      // the takeaways to the one school instead.
      schoolExtremes = {
        text: `**${bySchool[0].id}** is the only school in this data; its overall growth is `
          + `${fmt.val(bySchool[0].mean)}.`,
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

  // ---- Status & Growth ----------------------------------------------------
  // ach: ACH_DATA ({ school: { points }, student: { points } }). School y
  // follows the global Method; student level has no shrinkage. The quadrant
  // split mirrors the figure: n-weighted district means over school points.
  function achievementTakeaways({ ach, mode = 'shrunk', fmt = fmtSDDefault } = {}) {
    const schools = (ach && ach.school && ach.school.points) || [];
    const students = (ach && ach.student && ach.student.points) || [];
    if (schools.length === 0) return [];
    const y = (p) => (mode === 'raw' || p.y_shrunk == null) ? p.y_raw : p.y_shrunk;
    const name = (p) => p.school_name && p.school_name !== p.school_id ? p.school_name : p.school_id;

    let wSum = 0, xw = 0, yw = 0;
    for (const p of schools) {
      const w = p.n || 1;
      wSum += w; xw += p.x * w; yw += y(p) * w;
    }
    const xMean = wSum ? xw / wSum : 0;
    const yMean = wSum ? yw / wSum : 0;

    // A — pattern-breaker: scores below the district average, grows faster.
    let bright = null;
    const brights = schools.filter((p) => p.x < xMean && y(p) > yMean)
      .sort((a, b) => y(b) - y(a));
    if (brights.length > 0) {
      const p = brights[0];
      bright = {
        text: `**${name(p)}** breaks the pattern: it scores below the district average but grows `
          + `faster than expected (${fmt.val(y(p))}) — worth a closer look at what’s working there.`,
      };
    }

    // B — the opposite corner: high status hiding slow growth.
    let masked = null;
    const maskeds = schools.filter((p) => p.x > xMean && y(p) < yMean)
      .sort((a, b) => y(a) - y(b));
    if (maskeds.length > 0) {
      const p = maskeds[0];
      masked = {
        text: `**${name(p)}** scores above the district average but grows slower than expected `
          + `(${fmt.val(y(p))}) — high status can hide slow growth.`,
      };
    }

    // C — student share at/above expectations.
    let share = null;
    if (students.length > 0) {
      const pct = Math.round(100 * students.filter((p) => p.y_raw >= 0).length / students.length);
      share = { text: `**${pct}%** of students grew at or above expectations this year.` };
    }

    // D — school growth range.
    let range = null;
    if (schools.length >= 2) {
      const sorted = [...schools].sort((a, b) => y(b) - y(a));
      const best = sorted[0], worst = sorted[sorted.length - 1];
      range = {
        text: `School growth runs from ${fmt.val(y(best))} at **${name(best)}** down to `
          + `${fmt.val(y(worst))} at **${name(worst)}**.`,
      };
    }

    const small = schools.filter((p) => (p.n || 0) < 10);
    const caveat = small.length > 0
      ? {
          caveat: true,
          text: `Note: ${small.map(name).join(', ')} ${small.length === 1 ? 'has' : 'have'} fewer than `
            + `10 students with scores — read ${small.length === 1 ? 'its dot' : 'their dots'} with care.`,
        }
      : null;

    return select([bright, masked, share, range], caveat);
  }

  // ---- Demographics ---------------------------------------------------------
  // data: DEMO_DATA[key] ({ label, districtMean, groups: [{label, n, median,
  // q1, q3, …}] }). District-wide box plots — no method dimension here.
  function demographicsTakeaways({ data, fmt = fmtSDDefault } = {}) {
    const groups = (data && data.groups) || [];
    if (groups.length === 0) return [];
    const mag = (v) => fmt.val(Math.abs(v)).replace(/^[+−]\s?/, '');

    // A — the median gap between the highest and lowest group.
    let medianGap = null;
    if (groups.length >= 2) {
      const sorted = [...groups].sort((a, b) => b.median - a.median);
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      medianGap = {
        text: `The typical **${hi.label}** student grew ${fmt.val(hi.median)}, vs. ${fmt.val(lo.median)} `
          + `for the typical **${lo.label}** student — ${mag(hi.median - lo.median)} apart at the middle `
          + `of the pack.`,
      };
    }

    // B — within-group spread vs. between-group gap: when the middle halves
    // dwarf the gap, group membership says little about any one student.
    let overlap = null;
    if (groups.length >= 2) {
      const iqrs = groups.map((g) => g.q3 - g.q1).filter(Number.isFinite);
      const avgIqr = iqrs.length ? iqrs.reduce((a, b) => a + b, 0) / iqrs.length : 0;
      const meds = groups.map((g) => g.median);
      const gap = Math.abs(Math.max(...meds) - Math.min(...meds));
      if (avgIqr > 2 * gap && avgIqr > 0) {
        overlap = {
          text: `Growth varies far more within each group than between them — the middle half of a `
            + `group spans about ${mag(avgIqr)}, against a ${mag(gap)} gap — so the groups overlap heavily.`,
        };
      }
    }

    // C — when even a group's 75th percentile sits below expectations, say so.
    let depth = null;
    const sunk = groups.filter((g) => g.median < 0 && g.q3 < 0)
      .sort((a, b) => a.median - b.median);
    if (sunk.length > 0) {
      depth = {
        text: `Even the 75th-percentile **${sunk[0].label}** student grew below expectations `
          + `(${fmt.val(sunk[0].q3)}) — this isn't just a struggling tail.`,
      };
    }

    const small = groups.filter((g) => (g.n || 0) < 10);
    const caveat = small.length > 0
      ? {
          caveat: true,
          text: `Note: the ${small.map((g) => `**${g.label}**`).join(' and ')} group${small.length === 1 ? ' has' : 's have'} `
            + `fewer than 10 students — too few to read reliably.`,
        }
      : null;

    return select([medianGap, overlap, depth], caveat);
  }

  return { gapTakeaways, scanTakeaways, achievementTakeaways, demographicsTakeaways };
});
