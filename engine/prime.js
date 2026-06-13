// GrowthLens PRiME-database functions — pure, no DOM. UMD: browser →
// window.GLPrime, Node → module.exports.
//
// Works over rows parsed from reference/prime_growth_database.csv (one row per
// school × year; columns lea_id, school_id, lea_name, school_name,
// school_year, school_level, growth_zscore_all_{ela,math},
// prime_rank_all_1yr_{ela,math}). Two consumers: the name crosswalk that
// stamps school names onto uploaded-data shapes, and the District Report page
// (statewide tile histograms + growth over time).
//
// Identity is always the composite (lea_id, school_id) — school codes repeat
// across districts. Codes are strings with leading zeros preserved; never
// coerce them to numbers.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLPrime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUBJECTS = ['ela', 'math'];
  const Z_COL = { ela: 'growth_zscore_all_ela', math: 'growth_zscore_all_math' };
  const RANK_COL = { ela: 'prime_rank_all_1yr_ela', math: 'prime_rank_all_1yr_math' };

  const num = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const key = (lea, school) => `${lea}|${school}`;

  // ---- name lookup ------------------------------------------------------
  // Latest year's name wins (districts and schools get renamed; the newest
  // row is what people recognize).
  function nameLookup(rows) {
    const schools = new Map();   // lea|school → { year, name }
    const districts = new Map(); // lea → { year, name }
    for (const r of rows) {
      const y = r.school_year;
      const sk = key(r.lea_id, r.school_id);
      const s = schools.get(sk);
      if (!s || y > s.year) schools.set(sk, { year: y, name: r.school_name });
      const d = districts.get(r.lea_id);
      if (!d || y > d.year) districts.set(r.lea_id, { year: y, name: r.lea_name });
    }
    return {
      school: (lea, school) => {
        const s = schools.get(key(lea, school));
        return s ? s.name : null;
      },
      district: (lea) => {
        const d = districts.get(lea);
        return d ? d.name : null;
      },
    };
  }

  // ---- level by displayed year ------------------------------------------
  // A school's level can change across years (rarely). The displayed year's
  // classification wins; with no row that year, fall back to the latest known.
  function detectLevel(rows, lea, school, year) {
    let exact = null, latest = null;
    for (const r of rows) {
      if (r.lea_id !== lea || r.school_id !== school) continue;
      if (r.school_year === String(year)) exact = r.school_level;
      if (!latest || r.school_year > latest.year) latest = { year: r.school_year, level: r.school_level };
    }
    return exact != null ? exact : (latest ? latest.level : null);
  }

  // ---- statewide pool sizes ----------------------------------------------
  // Ranks in the DB are within level × year, so the pool behind "33rd of
  // 1,008 elementary schools" is the count of ranked schools at that level
  // that year.
  function poolCounts(rows) {
    const counts = new Map(); // year|level|subject → n ranked
    for (const r of rows) {
      for (const sub of SUBJECTS) {
        if (num(r[RANK_COL[sub]]) == null) continue;
        const k = `${r.school_year}|${r.school_level}|${sub}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return counts;
  }

  // ---- district report -----------------------------------------------------
  // Everything the report page needs for one district: name, years with data,
  // and per-school series per subject ({year, level, z, rank, poolN}).
  function districtReport(rows, lea) {
    const pools = poolCounts(rows);
    const bySchool = new Map();
    const years = new Set();
    let name = null, nameYear = null;
    for (const r of rows) {
      if (r.lea_id !== lea) continue;
      years.add(r.school_year);
      if (nameYear == null || r.school_year > nameYear) { name = r.lea_name; nameYear = r.school_year; }
      let s = bySchool.get(r.school_id);
      if (!s) {
        s = { school_id: r.school_id, name: r.school_name, nameYear: r.school_year, rows: [] };
        bySchool.set(r.school_id, s);
      }
      if (r.school_year > s.nameYear) { s.name = r.school_name; s.nameYear = r.school_year; }
      s.rows.push(r);
    }
    if (!bySchool.size) return null;

    const schools = [...bySchool.values()].map((s) => {
      s.rows.sort((a, b) => (a.school_year < b.school_year ? -1 : 1));
      const series = {};
      for (const sub of SUBJECTS) {
        series[sub] = s.rows
          .filter((r) => num(r[Z_COL[sub]]) != null)
          .map((r) => ({
            year: r.school_year,
            level: r.school_level,
            z: num(r[Z_COL[sub]]),
            rank: num(r[RANK_COL[sub]]),
            poolN: pools.get(`${r.school_year}|${r.school_level}|${sub}`) || 0,
          }));
      }
      return { school_id: s.school_id, name: s.name, series };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return { lea_id: lea, name, years: [...years].sort(), schools };
  }

  // ---- tile histogram --------------------------------------------------------
  // Statewide pool for one year × level × subject, binned for unit tiles.
  // Bin edges are integer multiples of binWidth so the dashed 0 line always
  // falls on an edge; binning works in integer bin indices (with an epsilon)
  // to keep boundary z's like 0.20 out of float-error limbo.
  function histogram(rows, { year, level, subject, binWidth = 0.1, lea = null } = {}) {
    const pool = [];
    for (const r of rows) {
      if (r.school_year !== String(year) || r.school_level !== level) continue;
      const z = num(r[Z_COL[subject]]);
      if (z == null) continue;
      pool.push({ lea_id: r.lea_id, school_id: r.school_id, name: r.school_name, z, rank: num(r[RANK_COL[subject]]) });
    }
    if (!pool.length) return { poolN: 0, bins: [], schools: [] };

    const binOf = (z) => Math.floor(z / binWidth + 1e-9);
    let kMin = Infinity, kMax = -Infinity;
    for (const p of pool) {
      const k = binOf(p.z);
      if (k < kMin) kMin = k;
      if (k > kMax) kMax = k;
    }
    const bins = [];
    for (let k = kMin; k <= kMax; k++) {
      bins.push({ x0: k * binWidth, x1: (k + 1) * binWidth, count: 0, district: 0 });
    }
    const schools = [];
    for (const p of pool) {
      const b = bins[binOf(p.z) - kMin];
      b.count++;
      if (lea != null && p.lea_id === lea) {
        b.district++;
        schools.push({ ...p, bin: binOf(p.z) - kMin });
      }
    }
    return { poolN: pool.length, bins, schools };
  }

  // ---- district mean over time ----------------------------------------------
  // Unweighted mean of the district's school z's per year (the DB carries no
  // enrollment counts to weight by).
  function districtMeanSeries(report, subject) {
    if (!report) return [];
    const byYear = new Map();
    for (const s of report.schools) {
      for (const p of s.series[subject] || []) {
        if (!byYear.has(p.year)) byYear.set(p.year, []);
        byYear.get(p.year).push(p.z);
      }
    }
    return [...byYear.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([year, zs]) => ({ year, z: zs.reduce((t, z) => t + z, 0) / zs.length, n: zs.length }));
  }

  // ---- district picker list ---------------------------------------------------
  function districtList(rows) {
    const names = new Map();
    for (const r of rows) {
      const d = names.get(r.lea_id);
      if (!d || r.school_year > d.year) names.set(r.lea_id, { year: r.school_year, name: r.lea_name });
    }
    return [...names.entries()]
      .map(([lea_id, d]) => ({ lea_id, name: d.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- uploaded-shape enrichment ----------------------------------------------
  // Stamps school_name onto the computed shapes when the upload's district
  // code matches a PRiME district. Unknown school codes are left untouched
  // (figures fall back to the id). Returns the district name, or null when
  // nothing matched (no code, or a district the DB doesn't know).
  function enrichShapes(shapes, districtCode, rows) {
    if (!districtCode || !rows || !rows.length) return null;
    const names = nameLookup(rows);
    const districtName = names.district(districtCode);
    if (!districtName) return null;

    const stamp = (item) => {
      if (!item || item.school_id == null) return;
      const nm = names.school(districtCode, String(item.school_id));
      if (nm) item.school_name = nm;
    };
    for (const slice of Object.values(shapes.GAPS_DATA_BY_DEMO || {})) {
      for (const s of (slice && slice.schools) || []) stamp(s);
    }
    for (const s of (shapes.HEATMAP_DATA && shapes.HEATMAP_DATA.schools) || []) stamp(s);
    const ach = shapes.ACH_DATA || {};
    for (const p of (ach.school && ach.school.points) || []) stamp(p);
    for (const p of (ach.student && ach.student.points) || []) stamp(p);
    return districtName;
  }

  // ---- takeaways -------------------------------------------------------------
  const fmtSDDefault = { val: (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + ' SD' };
  const ordinal = (n) => {
    const t = n % 100;
    if (t >= 11 && t <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] || 'th'}`;
  };
  const LEVEL_WORD = { Elementary: 'elementary', Middle: 'middle', EleMiddle: 'elementary-middle', Other: 'other' };

  // 2-3 insights + a scale caveat for the District Report overview card.
  function primeTakeaways({ report, year, fmt = fmtSDDefault } = {}) {
    if (!report || !report.schools.length) return [];
    const y = String(year);
    const pointAt = (s, sub, yr) => (s.series[sub] || []).find((p) => p.year === yr) || null;

    // A — schools at/above typical growth per subject in the displayed year.
    const counts = [];
    for (const sub of SUBJECTS) {
      const pts = report.schools.map((s) => pointAt(s, sub, y)).filter(Boolean);
      if (pts.length) counts.push({ sub, at: pts.filter((p) => p.z >= 0).length, n: pts.length });
    }
    let atOrAbove = null;
    if (counts.length) {
      const phrase = (c) => `**${c.at} of ${c.n}** school${c.n === 1 ? '' : 's'} in ${c.sub === 'ela' ? 'ELA' : 'math'}`;
      atOrAbove = {
        text: `In ${y}, students grew at least as fast as the typical Missouri student at `
          + counts.map(phrase).join(' and at ') + '.',
      };
    }

    // B — standout school: best single-subject growth in the displayed year,
    // with its statewide rank when the DB carries one.
    let standout = null;
    let best = null;
    for (const s of report.schools) {
      for (const sub of SUBJECTS) {
        const p = pointAt(s, sub, y);
        if (p && (!best || p.z > best.p.z)) best = { s, sub, p };
      }
    }
    if (best && best.p.z > 0) {
      const rankClause = best.p.rank != null && best.p.poolN
        ? ` — ${ordinal(best.p.rank)} of ${best.p.poolN.toLocaleString()} ${LEVEL_WORD[best.p.level] || ''} schools statewide`
        : '';
      standout = {
        // Subject + year ride along so a weeks-mode fmt can pick the right
        // conversion factor; the SD default ignores them.
        text: `**${best.s.name}** posted the district's strongest growth: `
          + `${fmt.val(best.p.z, { subject: best.sub, year: Number(y) })} in `
          + `${best.sub === 'ela' ? 'ELA' : 'math'}${rankClause}.`,
      };
    }

    // C — direction vs. the prior year with data, on the district average.
    let direction = null;
    const yi = report.years.indexOf(y);
    if (yi > 0) {
      const prevY = report.years[yi - 1];
      const moves = [];
      for (const sub of SUBJECTS) {
        const mean = districtMeanSeries(report, sub);
        const now = mean.find((p) => p.year === y);
        const prev = mean.find((p) => p.year === prevY);
        if (now && prev) moves.push({ sub, d: now.z - prev.z });
      }
      if (moves.length) {
        const word = (d) => (Math.abs(d) < 0.02 ? 'held steady' : d > 0 ? 'picked up' : 'slowed');
        direction = {
          text: `Compared with ${prevY}, district-average growth `
            + moves.map((m) => `${word(m.d)} in ${m.sub === 'ela' ? 'ELA' : 'math'}`).join(' and ') + '.',
        };
      }
    }

    const out = [atOrAbove, standout, direction].filter(Boolean).slice(0, 3);
    out.push({
      caveat: true,
      text: 'These are statewide PRiME growth scores — a different scale from the rest of this tool. '
        + 'Zero means a typical year of growth; scores are not comparable to the SD or weeks numbers on other pages.',
    });
    return out;
  }

  return {
    SUBJECTS, nameLookup, detectLevel, poolCounts, districtReport,
    histogram, districtMeanSeries, districtList, enrichShapes, primeTakeaways,
  };
});
