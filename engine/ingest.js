(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLIngest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // `col` = raw DESE header (used for validation/provenance); `dbCol` = the boolean column the
  // canonical t_<subject> table aliases it to (see loadSubjectFile) — compute.js predicates on dbCol.
  const SUBGROUPS = [
    { key: 'frl', label: 'FRL · economically disadvantaged', a: { col: 'FREE_OR_REDUCED_LUNCH', dbCol: 'frl', val: true },  b: { col: 'FREE_OR_REDUCED_LUNCH', dbCol: 'frl', val: false }, aLabel: 'FRL', bLabel: 'non-FRL' },
    { key: 'iep', label: 'IEP · students with disabilities', a: { col: 'IEP_DISABILITY', dbCol: 'iep', val: true },          b: { col: 'IEP_DISABILITY', dbCol: 'iep', val: false }, aLabel: 'IEP', bLabel: 'non-IEP' },
    { key: 'el',  label: 'EL · English learners',            a: { col: 'ENGLISH_LANGUAGE_LEARNER', dbCol: 'el', val: true }, b: { col: 'ENGLISH_LANGUAGE_LEARNER', dbCol: 'el', val: false }, aLabel: 'EL', bLabel: 'non-EL' },
    { key: 'race_bw', label: 'Race · Black vs. White',       a: { col: 'BLACK', dbCol: 'black', val: true },    b: { col: 'WHITE', dbCol: 'white', val: true }, aLabel: 'Black', bLabel: 'White' },
    { key: 'race_hw', label: 'Race · Hispanic vs. White',    a: { col: 'HISPANIC', dbCol: 'hispanic', val: true }, b: { col: 'WHITE', dbCol: 'white', val: true }, aLabel: 'Hispanic', bLabel: 'White' },
  ];
  const PREFIX_TO_SUBJECT = { MATH: 'math', COMM_ARTS: 'ela' };
  const STRUCT_COLS = ['SCHOOL_CODE', 'GRADE', 'GROWTH_YEAR'];
  const FLAG_COLS = ['FREE_OR_REDUCED_LUNCH', 'IEP_DISABILITY', 'ENGLISH_LANGUAGE_LEARNER', 'BLACK', 'WHITE', 'HISPANIC'];

  const canonHeader = (s) => String(s).trim().toUpperCase();

  function detectPrefix(headers) {
    const up = headers.map(canonHeader);
    const m = up.map(h => /^(.*)_Z_RESIDUAL$/.exec(h)).find(Boolean);
    if (!m) return null;
    const prefix = m[1];
    return { prefix, subject: PREFIX_TO_SUBJECT[prefix] || null };
  }

  function parseFlag(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'y' || s === '1' || s === 't' || s === 'true' || s === 'yes';
  }

  function requiredColumns(prefix) {
    return [`${prefix}_Z_RESIDUAL`, `${prefix}_Z_RESIDUAL_SE`, `${prefix}_Z_T`, ...STRUCT_COLS, ...FLAG_COLS];
  }

  function validate(headers) {
    const up = new Set(headers.map(canonHeader));
    const det = detectPrefix(headers);
    if (!det || !det.subject) return { ok: false, error: 'no_prefix', missing: [], subject: null };
    const missing = requiredColumns(det.prefix).filter(c => !up.has(c));
    return { ok: missing.length === 0, missing, subject: det.subject, prefix: det.prefix };
  }

  // Browser-only: read a File, register it in DuckDB, validate, filter to latest GROWTH_YEAR.
  // Returns { ok, table, meta } or { ok:false, error, ... }. `conn` is a DuckDB connection.
  async function loadSubjectFile(file, conn, dropzoneSubject) {
    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip a leading BOM (Windows/Excel CSV exports) so the header sniff and DuckDB see clean column names
    const headerLine = text.slice(0, text.indexOf('\n')).replace(/\r$/, '');
    const headers = headerLine.split(',');
    const v = validate(headers);
    if (!v.ok) return { ok: false, error: v.error || 'missing_columns', missing: v.missing };
    if (dropzoneSubject && v.subject !== dropzoneSubject)
      return { ok: false, error: 'subject_mismatch', detected: v.subject, expected: dropzoneSubject };

    const table = `t_${v.subject}`;
    await conn.query(`DROP TABLE IF EXISTS ${table}`);
    await conn.query(`DROP TABLE IF EXISTS ${table}_all`);
    // DuckDB reads registered buffers; register the file text and read_csv_auto it.
    const db = await window.GL.getDB();
    await db.registerFileText(`${v.subject}.csv`, text);
    await conn.query(`CREATE TABLE ${table}_all AS SELECT * FROM read_csv_auto('${v.subject}.csv', header=true, all_varchar=true)`);

    const P = v.prefix;
    const yrRow = (await conn.query(`SELECT max(CAST("GROWTH_YEAR" AS INTEGER)) AS y FROM ${table}_all`)).toArray()[0];
    const latestYear = yrRow && yrRow.y != null ? Number(yrRow.y) : null;
    if (latestYear == null) return { ok: false, error: 'no_year' };

    // Canonical, typed, latest-year-only table. Flags normalized to booleans.
    await conn.query(`
      CREATE TABLE ${table} AS
      SELECT
        "SCHOOL_CODE"::VARCHAR AS school_id,
        CAST("GRADE" AS INTEGER) AS grade,
        CAST("${P}_Z_RESIDUAL" AS DOUBLE) AS residual,
        TRY_CAST("${P}_Z_RESIDUAL_SE" AS DOUBLE) AS residual_se,
        TRY_CAST("${P}_Z_T" AS DOUBLE) AS status,
        lower(trim("FREE_OR_REDUCED_LUNCH")) IN ('y','1','t','true','yes') AS frl,
        lower(trim("IEP_DISABILITY")) IN ('y','1','t','true','yes') AS iep,
        lower(trim("ENGLISH_LANGUAGE_LEARNER")) IN ('y','1','t','true','yes') AS el,
        lower(trim("BLACK")) IN ('y','1','t','true','yes') AS black,
        lower(trim("WHITE")) IN ('y','1','t','true','yes') AS white,
        lower(trim("HISPANIC")) IN ('y','1','t','true','yes') AS hispanic
      FROM ${table}_all
      WHERE CAST("GROWTH_YEAR" AS INTEGER) = ${latestYear}
        AND TRY_CAST("${P}_Z_RESIDUAL" AS DOUBLE) IS NOT NULL
    `);

    const stat = (await conn.query(`
      SELECT count(*) AS n, count(DISTINCT school_id) AS schools FROM ${table}
    `)).toArray()[0];
    const nRowsLatest = Number(stat.n);
    if (nRowsLatest === 0) return { ok: false, error: 'no_rows_latest', latestYear };
    const totalAll = Number((await conn.query(`SELECT count(*) AS n FROM ${table}_all`)).toArray()[0].n);

    return {
      ok: true, table,
      meta: {
        subject: v.subject, prefix: P, latestYear,
        nSchools: Number(stat.schools), nRowsLatest, nDropped: totalAll - nRowsLatest,
        districtCode: null,
      },
    };
  }

  return { SUBGROUPS, PREFIX_TO_SUBJECT, FLAG_COLS, canonHeader, detectPrefix, parseFlag, requiredColumns, validate, loadSubjectFile };
});
