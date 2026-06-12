// computeSlice(subject) → builds the five figure shapes from DuckDB + GLStats.
// Browser-only classic script. Reads the canonical table t_<subject> created by ingest.loadSubjectFile.
(function () {
  'use strict';
  const S = window.GLStats, I = window.GLIngest;
  const MIN_N = 10;

  // Aggregate residuals for an arbitrary WHERE predicate, grouped by a column expr.
  async function cells(conn, table, groupExpr, whereExpr) {
    const where = whereExpr ? `WHERE ${whereExpr}` : '';
    const rows = (await conn.query(`
      SELECT ${groupExpr} AS g,
             count(*) AS n,
             avg(residual) AS rbar,
             var_samp(residual) AS s2,
             avg(residual_se * residual_se) AS ms2
      FROM ${table} ${where}
      GROUP BY ${groupExpr}
    `)).toArray();
    return rows.map(r => ({
      g: r.g, n: Number(r.n), rbar: Number(r.rbar),
      s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2),
      se: S.cellSE({ s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), n: Number(r.n) }),
    }));
  }

  // predicate on the canonical boolean column (dbCol), not the raw DESE header (col).
  function predicate(side) { return `${side.dbCol} = ${side.val ? 'TRUE' : 'FALSE'}`; }

  // Down-sample outliers evenly across the sorted list so both tails survive —
  // a plain slice(0, k) of the ascending list keeps only the most-negative end.
  function sampleOutliers(outliers, k = 8) {
    if (!outliers || outliers.length <= k) return outliers || [];
    const step = Math.ceil(outliers.length / k);
    return outliers.filter((_, i) => i % step === 0);
  }

  async function buildGaps(conn, table, subject) {
    const byDemo = {};
    for (const sg of I.SUBGROUPS) {
      const A = await cells(conn, table, 'school_id', predicate(sg.a));
      const B = await cells(conn, table, 'school_id', predicate(sg.b));
      const aById = Object.fromEntries(A.map(c => [c.g, c]));
      const bById = Object.fromEntries(B.map(c => [c.g, c]));
      // Union of both sides: a school with zero students in one group has no
      // SQL row there, but it still belongs in the figure — listed with its
      // counts and null estimates (there is no gap to compute), so the UI can
      // show it in the too-few section instead of it silently vanishing.
      const ids = [...new Set([...A, ...B].map(c => c.g))];
      const schools = [];
      for (const id of ids) {
        const a = aById[id], b = bById[id];
        if (a && b) {
          const rawGap = a.rbar - b.rbar;               // focal − reference
          const rawSe = S.gapSE(a.se, b.se);
          const meets = a.n >= MIN_N && b.n >= MIN_N;
          schools.push({ school_id: id, n_a: a.n, n_b: b.n, raw_gap: rawGap, raw_se: rawSe, meets_min_cell: meets });
        } else {
          schools.push({ school_id: id, n_a: a ? a.n : 0, n_b: b ? b.n : 0,
                         raw_gap: null, raw_se: null, meets_min_cell: false });
        }
      }
      const fitRows = schools.filter(s => s.meets_min_cell).map(s => ({ gap: s.raw_gap, se: s.raw_se }));
      // With <2 fit schools — or τ̂² estimated at exactly zero, which happens
      // routinely in small homogeneous districts — B would hit 0 and pin
      // every school to the pooled mean with zero-width CIs: a fabricated
      // exact value. Shrinkage is degenerate there, so fall back to raw
      // (B = 1). Calibration: tools/validate-stats-3-tauzero.cjs.
      const enough = fitRows.length >= 2;
      const tau2 = enough ? S.remlTau2(fitRows) : 0;
      const canShrink = enough && tau2 > 0;
      // No reliable schools → no district-wide estimate (null, never a
      // fabricated 0 with a zero-width interval).
      const pooled = fitRows.length ? S.pooledMean(fitRows, tau2) : null;
      // Shrunken intervals use t(k−1) — μ and τ² come from only k schools.
      const qShrunk = S.tCrit95(fitRows.length - 1);
      for (const s of schools) {
        if (s.raw_gap == null) {
          // Zero-side school — nothing to estimate, nothing to shrink.
          s.raw_ci95 = null; s.shrunk_gap = null; s.shrunk_se = null;
          s.shrunk_ci95 = null; s.shrinkage_factor = null;
          continue;
        }
        s.raw_ci95 = [s.raw_gap - 1.96 * s.raw_se, s.raw_gap + 1.96 * s.raw_se];
        if (canShrink) {
          const sh = S.shrink({ rawGap: s.raw_gap, rawSe: s.raw_se, tau2, mu: pooled.mu, muSe: pooled.se });
          s.shrunk_gap = sh.shrunkGap; s.shrunk_se = sh.shrunkSe; s.shrinkage_factor = sh.B;
          s.shrunk_ci95 = [sh.shrunkGap - qShrunk * sh.shrunkSe, sh.shrunkGap + qShrunk * sh.shrunkSe];
        } else {
          s.shrunk_gap = s.raw_gap; s.shrunk_se = s.raw_se; s.shrinkage_factor = 1;
          s.shrunk_ci95 = s.raw_ci95.slice();
        }
      }
      byDemo[sg.key] = {
        meta: { subject, demographic: sg.key, groupA: sg.aLabel, groupB: sg.bLabel,
                districtGap: pooled ? pooled.mu : null,
                districtCi95: pooled ? [pooled.ciLo, pooled.ciHi] : null, tauSquared: tau2,
                nSchools: schools.length, nMeetingThreshold: schools.filter(s => s.meets_min_cell).length, minCellSize: MIN_N },
        schools,
      };
    }
    return byDemo;
  }

  async function buildHeatmap(conn, table, subject) {
    const raw = (await conn.query(`
      SELECT school_id, CAST(grade AS VARCHAR) AS grade, count(*) AS n, avg(residual) AS rbar,
             var_samp(residual) AS s2, avg(residual_se * residual_se) AS ms2
      FROM ${table} GROUP BY school_id, grade
    `)).toArray();
    const cellsAll = raw.map(r => ({
      school_id: r.school_id, grade: String(r.grade), n: Number(r.n), r: Number(r.rbar),
      se: S.cellSE({ s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), n: Number(r.n) }),
    }));

    // Cell-level EB: within a grade column, schools are the exchangeable
    // units — each cell shrinks toward its grade's pooled district mean, the
    // same machinery the forest applies to school gaps. With <2 reliable
    // schools in a grade, shrinkage is undefined (same guard as buildGaps)
    // and rs stays null so the UI falls back to the raw value.
    const byGrade = {};
    for (const c of cellsAll) (byGrade[c.grade] = byGrade[c.grade] || []).push(c);
    for (const gradeCells of Object.values(byGrade)) {
      const fit = gradeCells.filter(c => c.n >= MIN_N && isFinite(c.se)).map(c => ({ gap: c.r, se: c.se }));
      // Same degeneracy guard as buildGaps: τ̂² = 0 would pin every cell to
      // the grade mean, so rs stays null and the UI shows the raw value.
      const enough = fit.length >= 2;
      const tau2 = enough ? S.remlTau2(fit) : 0;
      const canShrink = enough && tau2 > 0;
      const pooled = canShrink ? S.pooledMean(fit, tau2) : null;
      for (const c of gradeCells) {
        c.rs = (canShrink && pooled && isFinite(c.se))
          ? S.shrink({ rawGap: c.r, rawSe: c.se, tau2, mu: pooled.mu }).shrunkGap
          : null;
      }
    }

    // Overall column: the SAME school-level shrinkage Status & Growth uses
    // (cellsOverall + pooled mean over schools), so the two pages can never
    // disagree about a school's overall growth.
    const overallBySchool = {};
    {
      const c = await cellsOverall(conn, table);
      const fit = c.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
      const enough = fit.length >= 2;
      const tau2 = enough ? S.remlTau2(fit) : 0;
      const canShrink = enough && tau2 > 0;
      const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
      for (const s of c) {
        overallBySchool[s.g] = {
          n: s.n, r: s.rbar,
          rs: canShrink ? S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu }).shrunkGap : s.rbar,
        };
      }
    }

    const bySchool = {};
    for (const c of cellsAll) {
      const id = c.school_id;
      bySchool[id] = bySchool[id] || { school_id: id, grades: {}, overall: overallBySchool[id] || null };
      bySchool[id].grades[c.grade] = { n: c.n, r: c.r, rs: c.rs, ok: c.n >= MIN_N };
    }
    return { meta: { subject }, schools: Object.values(bySchool) };
  }

  async function buildDemo(conn, table) {
    // District-wide residual distributions for each subgroup side.
    // districtMean is the dashed reference line on the Demographics figure —
    // one mean residual over the whole table (≈0 for state-standardized residuals).
    const dRow = (await conn.query(`SELECT avg(residual) AS m FROM ${table}`)).toArray()[0];
    const districtMean = dRow && dRow.m != null ? Number(dRow.m) : 0;
    const demoData = {};
    for (const sg of I.SUBGROUPS) {
      const groups = [];
      for (const side of [sg.a, sg.b]) {
        const key = side === sg.a ? 'A' : 'B', label = side === sg.a ? sg.aLabel : sg.bLabel;
        const rows = (await conn.query(`SELECT residual FROM ${table} WHERE ${predicate(side)}`)).toArray();
        const stat = S.summarize(rows.map(r => Number(r.residual)));
        if (!stat) continue; // empty subgroup side (no students) — skip rather than spread null
        groups.push({ key, label, ...stat, outliers: sampleOutliers(stat.outliers) });
      }
      demoData[sg.key] = { label: sg.label, groups, districtMean };
    }
    return { demoData };
  }

  async function buildAchievement(conn, table) {
    // Student points (raw only) + school points (status vs overall residual, raw + shrunk overall).
    // Rows with no status score would otherwise plot at x=0 (Number(null) === 0).
    const students = (await conn.query(`SELECT school_id, status AS x, residual AS y FROM ${table} WHERE status IS NOT NULL`)).toArray()
      .map((r, i) => ({ school_id: r.school_id, school_idx: 0, hue: 0, x: Number(r.x), y_raw: Number(r.y) }));
    const schoolAgg = await (async () => {
      const c = await cellsOverall(conn, table);
      const fit = c.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
      // Same degeneracy guard as buildGaps: <2 fit schools OR τ̂² = 0 → raw.
      const enough = fit.length >= 2;
      const tau2 = enough ? S.remlTau2(fit) : 0;
      const canShrink = enough && tau2 > 0;
      const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
      return c.map((s, i) => {
        const yShrunk = canShrink
          ? S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu }).shrunkGap
          : s.rbar;
        return { school_id: s.g, school_name: s.g, school_idx: i, hue: (i * 360 / c.length) % 360,
                 x: s.status, y_raw: s.rbar, y_shrunk: yShrunk, n: s.n };
      });
    })();
    const idx = Object.fromEntries(schoolAgg.map((s, i) => [s.school_id, i]));
    students.forEach(p => { p.school_idx = idx[p.school_id] ?? 0; p.hue = (p.school_idx * 360 / schoolAgg.length) % 360; });
    return {
      student: { points: students },
      school: { points: schoolAgg },
    };
  }
  async function cellsOverall(conn, table) {
    const rows = (await conn.query(`
      SELECT school_id AS g, count(*) AS n, avg(residual) AS rbar, var_samp(residual) AS s2,
             avg(residual_se*residual_se) AS ms2, avg(status) AS status
      FROM ${table} GROUP BY school_id
    `)).toArray();
    return rows.map(r => ({ g: r.school_id ?? r.g, n: Number(r.n), rbar: Number(r.rbar), status: Number(r.status),
      se: S.cellSE({ s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), n: Number(r.n) }) }));
  }

  async function computeSlice(subject) {
    const conn = await window.GL.getConnection();
    const table = `t_${subject}`;
    const gaps = await buildGaps(conn, table, subject);
    const heatmap = await buildHeatmap(conn, table, subject);
    const demo = await buildDemo(conn, table);
    const ach = await buildAchievement(conn, table);
    return { GAPS_DATA_BY_DEMO: gaps, HEATMAP_DATA: heatmap, DEMO_DATA: demo.demoData, ACH_DATA: ach };
  }

  window.GLCompute = { computeSlice };
})();
