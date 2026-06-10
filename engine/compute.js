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
             avg(residual_se * residual_se) AS ms2,
             avg(status) AS status
      FROM ${table} ${where}
      GROUP BY ${groupExpr}
    `)).toArray();
    return rows.map(r => ({
      g: r.g, n: Number(r.n), rbar: Number(r.rbar),
      s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), status: Number(r.status),
      se: S.cellSE({ s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), n: Number(r.n) }),
    }));
  }

  // predicate on the canonical boolean column (dbCol), not the raw DESE header (col).
  function predicate(side) { return `${side.dbCol} = ${side.val ? 'TRUE' : 'FALSE'}`; }

  async function buildGaps(conn, table, subject) {
    const byDemo = {};
    for (const sg of I.SUBGROUPS) {
      const A = await cells(conn, table, 'school_id', predicate(sg.a));
      const B = await cells(conn, table, 'school_id', predicate(sg.b));
      const bById = Object.fromEntries(B.map(c => [c.g, c]));
      const schools = [];
      for (const a of A) {
        const b = bById[a.g]; if (!b) continue;
        const rawGap = a.rbar - b.rbar;                 // focal − reference
        const rawSe = S.gapSE(a.se, b.se);
        const meets = a.n >= MIN_N && b.n >= MIN_N;
        schools.push({ school_id: a.g, n_a: a.n, n_b: b.n, raw_gap: rawGap, raw_se: rawSe, meets_min_cell: meets });
      }
      const fitRows = schools.filter(s => s.meets_min_cell).map(s => ({ gap: s.raw_gap, se: s.raw_se }));
      const tau2 = S.remlTau2(fitRows);
      const pooled = S.pooledMean(fitRows, tau2) || { mu: 0, ciLo: 0, ciHi: 0 };
      for (const s of schools) {
        const sh = S.shrink({ rawGap: s.raw_gap, rawSe: s.raw_se, tau2, mu: pooled.mu });
        s.raw_ci95 = [s.raw_gap - 1.96 * s.raw_se, s.raw_gap + 1.96 * s.raw_se];
        s.shrunk_gap = sh.shrunkGap; s.shrunk_se = sh.shrunkSe; s.shrinkage_factor = sh.B;
        s.shrunk_ci95 = [sh.shrunkGap - 1.96 * sh.shrunkSe, sh.shrunkGap + 1.96 * sh.shrunkSe];
      }
      byDemo[sg.key] = {
        meta: { subject, demographic: sg.key, groupA: sg.aLabel, groupB: sg.bLabel,
                districtGap: pooled.mu, tauSquared: tau2,
                nSchools: schools.length, nMeetingThreshold: schools.filter(s => s.meets_min_cell).length, minCellSize: MIN_N },
        schools,
      };
    }
    return byDemo;
  }

  async function buildHeatmap(conn, table, subject) {
    const raw = (await conn.query(`
      SELECT school_id, CAST(grade AS VARCHAR) AS grade, count(*) AS n, avg(residual) AS rbar
      FROM ${table} GROUP BY school_id, grade
    `)).toArray();
    const bySchool = {};
    for (const r of raw) {
      const id = r.school_id; bySchool[id] = bySchool[id] || { school_id: id, grades: {} };
      bySchool[id].grades[r.grade] = { n: Number(r.n), r: Number(r.rbar), ok: Number(r.n) >= MIN_N };
    }
    return { meta: { subject }, schools: Object.values(bySchool) };
  }

  async function buildDemo(conn, table) {
    // District-wide + per-school residual distributions for each subgroup side.
    const demoData = {}, bySchool = {};
    for (const sg of I.SUBGROUPS) {
      const groups = [];
      const perSchool = {}; // school_id -> [{key,label,...stat}]
      for (const side of [sg.a, sg.b]) {
        const key = side === sg.a ? 'A' : 'B', label = side === sg.a ? sg.aLabel : sg.bLabel;
        const rows = (await conn.query(`SELECT school_id, residual FROM ${table} WHERE ${predicate(side)}`)).toArray();
        const all = rows.map(r => Number(r.residual));
        const stat = S.summarize(all);
        if (!stat) continue; // empty subgroup side (no students) — skip rather than spread null
        groups.push({ key, label, ...stat, outliers: stat.outliers.slice(0, 8) });
        const bySch = {};
        for (const r of rows) { (bySch[r.school_id] = bySch[r.school_id] || []).push(Number(r.residual)); }
        for (const [sid, vals] of Object.entries(bySch)) {
          const st = S.summarize(vals);
          if (!st) continue; // skip empty per-school side
          (perSchool[sid] = perSchool[sid] || []).push({ key, label, ...st, outliers: st.outliers.slice(0, 8) });
        }
      }
      demoData[sg.key] = { label: sg.label, short: sg.key.toUpperCase(), groups };
      bySchool[sg.key] = {};
      for (const [sid, gs] of Object.entries(perSchool)) bySchool[sg.key][sid] = { groups: gs };
    }
    return { demoData, bySchool };
  }

  async function buildAchievement(conn, table) {
    // Student points (raw only) + school points (status vs overall residual, raw + shrunk overall).
    const students = (await conn.query(`SELECT school_id, status AS x, residual AS y FROM ${table}`)).toArray()
      .map((r, i) => ({ school_id: r.school_id, school_idx: 0, hue: 0, x: Number(r.x), y_raw: Number(r.y) }));
    const schoolAgg = await (async () => {
      const c = await cellsOverall(conn, table);
      const fit = c.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
      const tau2 = S.remlTau2(fit); const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
      return c.map((s, i) => {
        const sh = S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu });
        return { school_id: s.g, school_name: s.g, school_idx: i, hue: (i * 360 / c.length) % 360,
                 x: s.status, y_raw: s.rbar, y_shrunk: sh.shrunkGap, n: s.n };
      });
    })();
    const idx = Object.fromEntries(schoolAgg.map((s, i) => [s.school_id, i]));
    students.forEach(p => { p.school_idx = idx[p.school_id] ?? 0; p.hue = (p.school_idx * 360 / schoolAgg.length) % 360; });
    return {
      student: { points: students, reg_raw: S.ols(students, 'x', 'y_raw') },
      school: { points: schoolAgg, reg_raw: S.ols(schoolAgg, 'x', 'y_raw'), reg_shrunk: S.ols(schoolAgg, 'x', 'y_shrunk') },
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
    return { GAPS_DATA_BY_DEMO: gaps, HEATMAP_DATA: heatmap, DEMO_DATA: demo.demoData, DEMO_DATA_BY_SCHOOL: demo.bySchool, ACH_DATA: ach };
  }

  window.GLCompute = { computeSlice };
})();
