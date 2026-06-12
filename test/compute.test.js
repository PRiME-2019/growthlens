// computeSlice against a tiny in-memory "DuckDB": a fake connection that
// understands exactly the SQL shapes compute.js issues. Catches shape drift,
// the τ² shrink guard, districtMean, both-tail outliers, and the status filter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '../engine/compute.js'), 'utf8');

// ---- fake DuckDB over an array of canonical-table rows ---------------------
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function varSamp(a) { if (a.length < 2) return null; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); }

function fakeConn(rows) {
  return {
    async query(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      let filtered = rows;
      const where = /WHERE (\w+) = (TRUE|FALSE)/.exec(s);
      if (where) filtered = rows.filter((r) => r[where[1]] === (where[2] === 'TRUE'));
      if (/WHERE status IS NOT NULL/.test(s)) filtered = rows.filter((r) => r.status != null);

      let out;
      if (/GROUP BY school_id, grade/.test(s)) {
        const g = {};
        for (const r of filtered) (g[`${r.school_id}|${r.grade}`] = g[`${r.school_id}|${r.grade}`] || []).push(r);
        out = Object.entries(g).map(([k, rs]) => ({
          school_id: k.split('|')[0], grade: String(k.split('|')[1]),
          n: rs.length, rbar: mean(rs.map((r) => r.residual)),
          s2: varSamp(rs.map((r) => r.residual)),
          ms2: mean(rs.map((r) => r.residual_se ** 2)),
        }));
      } else if (/GROUP BY school_id/.test(s)) {
        const g = {};
        for (const r of filtered) (g[r.school_id] = g[r.school_id] || []).push(r);
        out = Object.entries(g).map(([id, rs]) => ({
          g: id, school_id: id, n: rs.length,
          rbar: mean(rs.map((r) => r.residual)),
          s2: varSamp(rs.map((r) => r.residual)),
          ms2: mean(rs.map((r) => r.residual_se ** 2)),
          status: mean(rs.filter((r) => r.status != null).map((r) => r.status)),
        }));
      } else if (/SELECT avg\(residual\) AS m/.test(s)) {
        out = [{ m: filtered.length ? mean(filtered.map((r) => r.residual)) : null }];
      } else if (/SELECT school_id, status AS x, residual AS y/.test(s)) {
        out = filtered.map((r) => ({ school_id: r.school_id, x: r.status, y: r.residual }));
      } else if (/SELECT residual FROM/.test(s)) {
        out = filtered.map((r) => ({ residual: r.residual }));
      } else {
        throw new Error('fakeConn: unrecognized SQL: ' + s.slice(0, 120));
      }
      return { toArray: () => out };
    },
  };
}

function freshCompute(rows) {
  const win = {
    GLStats: require('../engine/stats.js'),
    GLIngest: require('../engine/ingest.js'),
    GL: { getConnection: async () => fakeConn(rows) },
  };
  // eslint-disable-next-line no-new-func
  new Function('window', SRC)(win);
  return win.GLCompute;
}

// Deterministic row builder: nPerSide students per school per subgroup side.
function makeRows({ schools = 3, nPerSide = 30, gapShift = -0.2 } = {}) {
  const rows = [];
  let k = 0;
  for (let s = 0; s < schools; s++) {
    const id = `S${s + 1}`;
    for (let i = 0; i < nPerSide * 2; i++) {
      const frl = i < nPerSide;
      const base = (s - 1) * 0.1 + (frl ? gapShift : 0);
      // Spread residuals deterministically, with school 0 carrying extreme tails
      const wiggle = ((k * 37) % 21 - 10) / 25; // -0.4..0.4
      const extreme = s === 0 && i % nPerSide === 0 ? (frl ? -2.5 : 2.5) : 0;
      rows.push({
        school_id: id, grade: 3 + (i % 6),
        residual: base + wiggle + extreme,
        residual_se: 0.3,
        status: i % 7 === 0 ? null : base + wiggle / 2,   // some missing statuses
        frl, iep: !frl, el: i % 4 === 0, black: frl, white: !frl, hispanic: i % 5 === 0,
      });
      k++;
    }
  }
  return rows;
}

test('computeSlice: emits all five comparisons with focal − reference signs', async () => {
  const C = freshCompute(makeRows({}));
  const out = await C.computeSlice('math');
  assert.deepEqual(Object.keys(out.GAPS_DATA_BY_DEMO).sort(),
    ['el', 'frl', 'iep', 'race_bw', 'race_hw']);
  const frl = out.GAPS_DATA_BY_DEMO.frl;
  assert.equal(frl.meta.groupA, 'FRL');
  assert.ok(frl.meta.districtGap < 0, 'FRL focal group sits below reference');
  assert.equal(frl.schools.length, 3);
  for (const s of frl.schools) {
    assert.ok(Array.isArray(s.raw_ci95) && Array.isArray(s.shrunk_ci95));
    assert.ok(s.shrinkage_factor >= 0 && s.shrinkage_factor <= 1);
  }
});

test('computeSlice: heatmap cells shrink toward their grade pool; Overall matches Status & Growth', async () => {
  const C = freshCompute(makeRows({}));
  const out = await C.computeSlice('math');
  const heat = out.GAPS_DATA_BY_DEMO && out.HEATMAP_DATA;
  const achById = Object.fromEntries(out.ACH_DATA.school.points.map((p) => [p.school_id, p]));
  for (const s of heat.schools) {
    // Overall column = exactly the school-level shrinkage Status & Growth uses.
    assert.ok(s.overall, `${s.school_id} carries an overall entry`);
    assert.ok(Math.abs(s.overall.rs - achById[s.school_id].y_shrunk) < 1e-12,
      `${s.school_id} overall.rs equals ACH y_shrunk`);
    assert.ok(Math.abs(s.overall.r - achById[s.school_id].y_raw) < 1e-12,
      `${s.school_id} overall.r equals ACH y_raw`);
    for (const [g, c] of Object.entries(s.grades)) {
      if (!c.ok) continue;
      // rs is null when that grade's τ̂² estimates 0 (degeneracy guard —
      // the UI shows the raw value); otherwise it must be a real number.
      assert.ok(c.rs === null || Number.isFinite(c.rs),
        `${s.school_id} grade ${g} rs is finite or the τ̂²=0 fallback`);
    }
  }
  // The school-level (Overall) path must actually shrink in this fixture:
  // school means differ by ~0.1 with tiny SEs, so τ̂² > 0 there.
  assert.ok(heat.schools.some((s) => s.overall && s.overall.rs !== s.overall.r),
    'school-level shrinkage is exercised by the fixture');
  // Shrinkage coherence: within each grade, every cell's shrunken value sits
  // between its raw value and that grade's precision-weighted center (it
  // never overshoots past raw in the wrong direction).
  const grades = [...new Set(heat.schools.flatMap((s) => Object.keys(s.grades)))];
  for (const g of grades) {
    const cells = heat.schools.map((s) => s.grades[g]).filter((c) => c && c.ok && c.rs != null);
    if (cells.length < 2) continue;
    const lo = Math.min(...cells.map((c) => c.r)), hi = Math.max(...cells.map((c) => c.r));
    for (const c of cells) {
      assert.ok(Math.abs(c.rs - c.r) < (hi - lo) + 1e-9, 'shrinkage moves cells, not teleports them');
      assert.ok(c.rs >= lo - 1e-9 && c.rs <= hi + 1e-9, 'shrunken value stays within the grade range');
    }
  }
});

test('computeSlice: a school with zero students on one side appears with null estimates', async () => {
  const rows = makeRows({});
  // S3 loses all its EL students — the school exists in the comparison's
  // reference side only. It must still be listed (so the UI can show it in
  // the too-few section) with null estimates rather than NaN or absence.
  rows.forEach((r) => { if (r.school_id === 'S3') r.el = false; });
  const C = freshCompute(rows);
  const out = await C.computeSlice('math');
  const el = out.GAPS_DATA_BY_DEMO.el;
  assert.equal(el.schools.length, 3, 'zero-side school still listed');
  const s3 = el.schools.find((s) => s.school_id === 'S3');
  assert.equal(s3.n_a, 0);
  assert.ok(s3.n_b > 0);
  assert.equal(s3.meets_min_cell, false);
  assert.equal(s3.raw_gap, null);
  assert.equal(s3.raw_ci95, null);
  assert.equal(s3.shrunk_gap, null);
  assert.equal(s3.shrunk_ci95, null);
  assert.equal(s3.shrinkage_factor, null);
  // The schools with both sides keep real estimates.
  for (const s of el.schools.filter((x) => x.school_id !== 'S3')) {
    assert.ok(Number.isFinite(s.raw_gap) && Number.isFinite(s.shrunk_gap));
  }
});

test('computeSlice: DEMO_DATA carries districtMean and both outlier tails', async () => {
  const C = freshCompute(makeRows({ nPerSide: 60 }));
  const out = await C.computeSlice('math');
  const frl = out.DEMO_DATA.frl;
  assert.ok(typeof frl.districtMean === 'number');
  const g = frl.groups[0]; // focal side, school 0 planted ±2.5 extremes
  if (g.outliers.length) {
    assert.ok(g.outliers.length <= 8, 'outliers down-sampled');
  }
  // The planted +2.5/−2.5 extremes must survive sampling in at least one group
  const allOutliers = frl.groups.flatMap((gr) => gr.outliers);
  assert.ok(allOutliers.some((v) => v > 1), 'high tail survives');
  assert.ok(allOutliers.some((v) => v < -1), 'low tail survives');
});

test('computeSlice: shrinkage falls back to raw when <2 schools meet min-n', async () => {
  const C = freshCompute(makeRows({ schools: 1 }));
  const out = await C.computeSlice('math');
  const s = out.GAPS_DATA_BY_DEMO.frl.schools[0];
  assert.equal(s.shrinkage_factor, 1);
  assert.equal(s.shrunk_gap, s.raw_gap);
  assert.deepEqual(s.shrunk_ci95, s.raw_ci95);
});

test('computeSlice: τ̂² = 0 (identical school gaps) falls back to raw, never zero-width CIs', async () => {
  // Residuals depend only on (side, i) — every school has the IDENTICAL gap,
  // so DL/REML estimate τ̂² = 0. B = 0 would pin each school to the pooled
  // mean with a zero-width interval; the guard must show raw instead.
  const rows = [];
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 60; i++) {
      const frl = i < 30;
      rows.push({
        school_id: `S${s + 1}`, grade: 3 + (i % 6),
        residual: (frl ? -0.2 : 0) + ((i * 37) % 21 - 10) / 25,
        residual_se: 0.3, status: 0.1,
        frl, iep: !frl, el: i % 4 === 0, black: frl, white: !frl, hispanic: i % 5 === 0,
      });
    }
  }
  const C = freshCompute(rows);
  const out = await C.computeSlice('math');
  const slice = out.GAPS_DATA_BY_DEMO.frl;
  assert.equal(slice.meta.tauSquared, 0, 'identical gaps estimate zero heterogeneity');
  for (const s of slice.schools) {
    assert.equal(s.shrinkage_factor, 1, 'raw fallback (B=1) at τ̂²=0');
    assert.equal(s.shrunk_gap, s.raw_gap);
    assert.ok(s.shrunk_ci95[1] - s.shrunk_ci95[0] > 0.01, 'interval never collapses to a point');
  }
});

test('computeSlice: zero reliable schools → district gap is null, not a fabricated 0', async () => {
  const C = freshCompute(makeRows({ schools: 3, nPerSide: 5 }));   // 5 < MIN_N on both sides
  const out = await C.computeSlice('math');
  const m = out.GAPS_DATA_BY_DEMO.frl.meta;
  assert.equal(m.nMeetingThreshold, 0);
  assert.equal(m.districtGap, null);
  assert.equal(m.districtCi95, null);
  // schools still carry their raw estimates with the B=1 fallback
  for (const s of out.GAPS_DATA_BY_DEMO.frl.schools) {
    assert.ok(Number.isFinite(s.raw_gap));
    assert.equal(s.shrinkage_factor, 1);
  }
});

test('computeSlice: achievement student points exclude null-status rows', async () => {
  const rows = makeRows({});
  const C = freshCompute(rows);
  const out = await C.computeSlice('math');
  const expected = rows.filter((r) => r.status != null).length;
  assert.equal(out.ACH_DATA.student.points.length, expected);
  assert.ok(out.ACH_DATA.student.points.every((p) => p.x !== 0 || p.y_raw !== undefined));
  assert.equal(out.ACH_DATA.school.points.length, 3);
});
