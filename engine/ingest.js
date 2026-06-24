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
    // A second income measure: direct certification (SNAP/TANF/Medicaid etc.) is
    // a tighter poverty signal than FRL. Same Y/N flag shape as FRL.
    { key: 'direct_cert', label: 'Direct cert · directly certified for meals', a: { col: 'DIRECT_CERT', dbCol: 'direct_cert', val: true }, b: { col: 'DIRECT_CERT', dbCol: 'direct_cert', val: false }, aLabel: 'Direct cert', bLabel: 'non-Direct cert' },
    { key: 'iep', label: 'IEP · students with disabilities', a: { col: 'IEP_DISABILITY', dbCol: 'iep', val: true },          b: { col: 'IEP_DISABILITY', dbCol: 'iep', val: false }, aLabel: 'IEP', bLabel: 'non-IEP' },
    { key: 'el',  label: 'EL · English learners',            a: { col: 'ENGLISH_LANGUAGE_LEARNER', dbCol: 'el', val: true }, b: { col: 'ENGLISH_LANGUAGE_LEARNER', dbCol: 'el', val: false }, aLabel: 'EL', bLabel: 'non-EL' },
    { key: 'gifted', label: 'Gifted · gifted & talented',     a: { col: 'GIFTED', dbCol: 'gifted', val: true },  b: { col: 'GIFTED', dbCol: 'gifted', val: false }, aLabel: 'Gifted', bLabel: 'non-Gifted' },
    // GENDER is one M/F column, not a Y/N flag — split into two booleans
    // (female/male) and compared like the race pairs. Students with a missing
    // or other-coded gender fall into neither side.
    { key: 'gender', label: 'Gender · Female vs. Male',       a: { col: 'GENDER', dbCol: 'female', val: true },  b: { col: 'GENDER', dbCol: 'male', val: true }, aLabel: 'Female', bLabel: 'Male' },
    { key: 'race_bw', label: 'Race · Black vs. White',       a: { col: 'BLACK', dbCol: 'black', val: true },    b: { col: 'WHITE', dbCol: 'white', val: true }, aLabel: 'Black', bLabel: 'White' },
    { key: 'race_hw', label: 'Race · Hispanic vs. White',    a: { col: 'HISPANIC', dbCol: 'hispanic', val: true }, b: { col: 'WHITE', dbCol: 'white', val: true }, aLabel: 'Hispanic', bLabel: 'White' },
  ];
  const PREFIX_TO_SUBJECT = { MATH: 'math', COMM_ARTS: 'ela' };
  const STRUCT_COLS = ['SCHOOL_CODE', 'GRADE', 'GROWTH_YEAR'];

  // Optional student-demographic columns. Each maps a raw DESE header to the
  // canonical boolean column compute.js predicates on (dbCol). ALL are optional:
  // only the structural + growth columns are required (see requiredColumns), so
  // an older export missing, say, GIFTED still loads — that split just isn't
  // offered. `kind` selects the SQL: 'flag' is a Y/N column true for the usual
  // affirmative tokens; 'eq' splits one categorical column (GENDER) into two
  // booleans by value. A NULL / absent value yields NULL (not FALSE), so a
  // student with a missing value is excluded from BOTH sides of a comparison
  // rather than counted as "non-".
  const FLAG_TRUE = "('y','1','t','true','yes')";
  const DEMOG_COLS = [
    { dbCol: 'frl',         src: 'FREE_OR_REDUCED_LUNCH',    kind: 'flag' },
    { dbCol: 'direct_cert', src: 'DIRECT_CERT',             kind: 'flag' },
    { dbCol: 'iep',      src: 'IEP_DISABILITY',           kind: 'flag' },
    { dbCol: 'el',       src: 'ENGLISH_LANGUAGE_LEARNER', kind: 'flag' },
    { dbCol: 'gifted',   src: 'GIFTED',                   kind: 'flag' },
    { dbCol: 'black',    src: 'BLACK',                    kind: 'flag' },
    { dbCol: 'white',    src: 'WHITE',                    kind: 'flag' },
    { dbCol: 'hispanic', src: 'HISPANIC',                 kind: 'flag' },
    { dbCol: 'female',   src: 'GENDER', kind: 'eq', match: "('f','female')" },
    { dbCol: 'male',     src: 'GENDER', kind: 'eq', match: "('m','male')" },
  ];

  const canonHeader = (s) => String(s).trim().toUpperCase();

  // SQL expression list for the canonical table's demographic booleans, given
  // the canonical headers actually present in the file. A column whose source
  // header is absent is emitted as NULL::BOOLEAN so compute.js's predicates
  // still reference a real column — every student is NULL there, so that
  // subgroup has no students on a side and is omitted from the figures (see
  // compute.buildGaps / buildDemo). DuckDB matches the quoted UPPER name
  // case-insensitively, so a lower- or mixed-case header still resolves.
  function demographicColumnsSql(presentCanonHeaders) {
    const present = presentCanonHeaders instanceof Set ? presentCanonHeaders : new Set(presentCanonHeaders);
    return DEMOG_COLS.map((c) => {
      if (!present.has(c.src)) return `NULL::BOOLEAN AS ${c.dbCol}`;
      const test = c.kind === 'eq' ? c.match : FLAG_TRUE;
      return `lower(trim("${c.src}")) IN ${test} AS ${c.dbCol}`;
    }).join(',\n        ');
  }

  // DESE / MOSIS growth files download as tab-delimited .txt; users have been
  // round-tripping them through Excel to get a comma .csv. Sniff the delimiter
  // off the header line so both land directly. `char` splits the header for
  // validation; `sql` is the literal handed to DuckDB's read_csv `sep` (the CSV
  // reader interprets the \t escape, so a tab file parses without an Excel step).
  // Order matters only as the tie-break order; comma is the default when the
  // header has no separators at all (a one-column file we'd reject anyway).
  const DELIMITERS = [
    { char: '\t', sql: '\\t' },
    { char: ',',  sql: ','   },
    { char: ';',  sql: ';'   },
    { char: '|',  sql: '|'   },
  ];
  function detectDelimiter(headerLine) {
    let best = DELIMITERS[1]; // comma
    let bestCount = 0;
    for (const d of DELIMITERS) {
      const count = headerLine.split(d.char).length - 1;
      if (count > bestCount) { bestCount = count; best = d; }
    }
    return best;
  }

  function detectPrefix(headers) {
    const up = headers.map(canonHeader);
    const m = up.map(h => /^(.*)_Z_RESIDUAL$/.exec(h)).find(Boolean);
    if (!m) return null;
    const prefix = m[1];
    return { prefix, subject: PREFIX_TO_SUBJECT[prefix] || null };
  }

  // Only the growth + structural columns are required. Every demographic column
  // is optional (see DEMOG_COLS / demographicColumnsSql), so a file that lacks
  // one still loads — it simply can't be split that way.
  function requiredColumns(prefix) {
    return [`${prefix}_Z_RESIDUAL`, `${prefix}_Z_RESIDUAL_SE`, `${prefix}_Z_T`, ...STRUCT_COLS];
  }

  // District codes in the PRiME database are 6 digits with leading zeros
  // ("016090"); uploads that passed through Excel often lose the padding.
  // Restore it for plain digit strings; anything else passes through as-is.
  function normalizeDistrictCode(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (s === '') return null;
    return /^\d{1,6}$/.test(s) ? s.padStart(6, '0') : s;
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
    const nl = text.indexOf('\n');
    const headerLine = (nl === -1 ? text : text.slice(0, nl)).replace(/\r$/, '');
    const delim = detectDelimiter(headerLine);
    const headers = headerLine.split(delim.char);
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
    // Pin the delimiter we sniffed so DuckDB's reader and our header validation
    // agree even on a tab .txt; types are still auto-detected (all_varchar here).
    await conn.query(`CREATE TABLE ${table}_all AS SELECT * FROM read_csv_auto('${v.subject}.csv', header=true, all_varchar=true, sep='${delim.sql}')`);

    const SUBJECT = v.prefix;
    const yrRow = (await conn.query(`SELECT max(TRY_CAST("GROWTH_YEAR" AS INTEGER)) AS y FROM ${table}_all`)).toArray()[0];
    const latestYear = yrRow && yrRow.y != null ? Number(yrRow.y) : null;
    if (latestYear == null) return { ok: false, error: 'no_year' };

    // Canonical, typed, latest-year-only table. Demographic columns normalized
    // to booleans, built from whichever ones the file actually has (absent ones
    // become NULL::BOOLEAN). TRY_CAST throughout: one malformed GRADE/GROWTH_YEAR
    // value should drop that row, not surface as a raw DuckDB exception.
    const demogSql = demographicColumnsSql(new Set(headers.map(canonHeader)));
    await conn.query(`
      CREATE TABLE ${table} AS
      SELECT
        "SCHOOL_CODE"::VARCHAR AS school_id,
        TRY_CAST("GRADE" AS INTEGER) AS grade,
        CAST("${SUBJECT}_Z_RESIDUAL" AS DOUBLE) AS residual,
        TRY_CAST("${SUBJECT}_Z_RESIDUAL_SE" AS DOUBLE) AS residual_se,
        TRY_CAST("${SUBJECT}_Z_T" AS DOUBLE) AS status,
        ${demogSql}
      FROM ${table}_all
      WHERE TRY_CAST("GROWTH_YEAR" AS INTEGER) = ${latestYear}
        AND TRY_CAST("${SUBJECT}_Z_RESIDUAL" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("GRADE" AS INTEGER) BETWEEN 3 AND 8
    `);

    // Rows from the latest year that fell outside grades 3–8 (the only grades
    // every page renders) — surfaced on the dropzone so the cut isn't silent.
    const gradeDropRow = (await conn.query(`
      SELECT count(*) AS n FROM ${table}_all
      WHERE TRY_CAST("GROWTH_YEAR" AS INTEGER) = ${latestYear}
        AND TRY_CAST("${SUBJECT}_Z_RESIDUAL" AS DOUBLE) IS NOT NULL
        AND (TRY_CAST("GRADE" AS INTEGER) IS NULL OR TRY_CAST("GRADE" AS INTEGER) NOT BETWEEN 3 AND 8)
    `)).toArray()[0];
    const nDroppedGrades = Number(gradeDropRow.n);

    // Optional district identity: the modal COUNTY_DISTRICT_CODE among
    // latest-year rows (files without the column load exactly as before).
    let districtCode = null;
    const cdcHeader = headers.find((h) => canonHeader(h) === 'COUNTY_DISTRICT_CODE');
    if (cdcHeader) {
      const cdcRow = (await conn.query(`
        SELECT trim("${cdcHeader}") AS code, count(*) AS n FROM ${table}_all
        WHERE TRY_CAST("GROWTH_YEAR" AS INTEGER) = ${latestYear}
          AND trim("${cdcHeader}") <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 1
      `)).toArray()[0];
      if (cdcRow && cdcRow.code != null) districtCode = normalizeDistrictCode(cdcRow.code);
    }

    const stat = (await conn.query(`
      SELECT count(*) AS n, count(DISTINCT school_id) AS schools FROM ${table}
    `)).toArray()[0];
    const nRowsLatest = Number(stat.n);
    if (nRowsLatest === 0) return { ok: false, error: 'no_rows_latest', latestYear };
    const totalAll = Number((await conn.query(`SELECT count(*) AS n FROM ${table}_all`)).toArray()[0].n);

    return {
      ok: true, table,
      meta: {
        subject: v.subject, prefix: SUBJECT, latestYear,
        nSchools: Number(stat.schools), nRowsLatest, nDropped: totalAll - nRowsLatest,
        nDroppedGrades,
        districtCode,
      },
    };
  }

  return { SUBGROUPS, PREFIX_TO_SUBJECT, DEMOG_COLS, canonHeader, detectPrefix, detectDelimiter, demographicColumnsSql, requiredColumns, normalizeDistrictCode, validate, loadSubjectFile };
});
