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

test('computeSlice: achievement student points exclude null-status rows', async () => {
  const rows = makeRows({});
  const C = freshCompute(rows);
  const out = await C.computeSlice('math');
  const expected = rows.filter((r) => r.status != null).length;
  assert.equal(out.ACH_DATA.student.points.length, expected);
  assert.ok(out.ACH_DATA.student.points.every((p) => p.x !== 0 || p.y_raw !== undefined));
  assert.equal(out.ACH_DATA.school.points.length, 3);
});
