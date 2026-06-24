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
      // Optional subgroups: a file missing this column (or with no students on a
      // side) has nothing to compare, so omit the slice entirely — the store
      // derives the "Groups to compare" options from the keys present here, so
      // the UI only offers splits the data actually supports. The canonical
      // column always exists (NULL when the source header is absent), so the
      // predicate above is valid SQL regardless.
      const totalA = A.reduce((s, c) => s + c.n, 0);
      const totalB = B.reduce((s, c) => s + c.n, 0);
      if (totalA === 0 || totalB === 0) continue;
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
      // Both sides must be present to show a comparison — drops optional
      // subgroups whose column the file lacks (same rule as buildGaps).
      if (groups.length < 2) continue;
      demoData[sg.key] = { label: sg.label, groups, districtMean };
    }
    return { demoData };
  }

  // School-level scatter points (status x vs residual y) from per-school cells,
  // with the same degeneracy-guarded shrinkage everywhere. `cells` is a list of
  // { g, n, rbar, se, status }; idx/hue keep colors stable across grade filters.
  function schoolPointsFromCells(cells, idx, nSchoolsTotal) {
    const fit = cells.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
    const enough = fit.length >= 2;
    const tau2 = enough ? S.remlTau2(fit) : 0;
    const canShrink = enough && tau2 > 0;
    const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
    return cells.map((s, i) => {
      const ix = idx ? (idx[s.g] ?? 0) : i;
      const yShrunk = canShrink ? S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu }).shrunkGap : s.rbar;
      return { school_id: s.g, school_name: s.g, school_idx: ix, hue: (ix * 360 / nSchoolsTotal) % 360,
               x: s.status, y_raw: s.rbar, y_shrunk: yShrunk, n: s.n };
    });
  }

  async function buildAchievement(conn, table) {
    // Student points (raw only) + school points (status vs overall residual, raw + shrunk overall).
    // Rows with no status score would otherwise plot at x=0 (Number(null) === 0).
    // grade rides along so the page's grade filter can subset the student view.
    const students = (await conn.query(`SELECT school_id, grade, status AS x, residual AS y FROM ${table} WHERE status IS NOT NULL`)).toArray()
      .map((r) => ({ school_id: r.school_id, grade: r.grade == null ? null : Number(r.grade), school_idx: 0, hue: 0, x: Number(r.x), y_raw: Number(r.y) }));
    const c = await cellsOverall(conn, table);
    const idx = Object.fromEntries(c.map((s, i) => [s.g, i]));
    const schoolAgg = schoolPointsFromCells(c, idx, c.length);
    students.forEach(p => { p.school_idx = idx[p.school_id] ?? 0; p.hue = (p.school_idx * 360 / schoolAgg.length) % 360; });

    // Per-grade school points so the School view can filter to one grade. Each
    // grade pools its own schools (shrinkage within grade, like the heatmap);
    // colors reuse the all-grades idx so a school keeps its hue across grades.
    const gradeCells = await cellsOverallByGrade(conn, table);
    const byGradeGroups = {};
    for (const cell of gradeCells) (byGradeGroups[cell.grade] = byGradeGroups[cell.grade] || []).push(cell);
    const byGrade = {};
    for (const [g, cells] of Object.entries(byGradeGroups)) {
      // A cell with no non-null status has no x to plot — drop it from the scatter.
      const plottable = cells.filter(s => s.status != null);
      if (plottable.length) byGrade[g] = schoolPointsFromCells(plottable, idx, schoolAgg.length);
    }
    return {
      student: { points: students },
      school: { points: schoolAgg, byGrade },
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
  // Same per-school aggregate as cellsOverall, but split by grade — backs the
  // School view's grade filter. status is null when a (school, grade) cell has
  // no scored students (kept null, not coerced to 0, so the caller can drop it).
  async function cellsOverallByGrade(conn, table) {
    const rows = (await conn.query(`
      SELECT school_id AS g, CAST(grade AS VARCHAR) AS grade, count(*) AS n, avg(residual) AS rbar,
             var_samp(residual) AS s2, avg(residual_se*residual_se) AS ms2, avg(status) AS status
      FROM ${table} GROUP BY school_id, grade
    `)).toArray();
    return rows.map(r => ({ g: r.school_id ?? r.g, grade: String(r.grade), n: Number(r.n), rbar: Number(r.rbar),
      status: r.status == null ? null : Number(r.status),
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
