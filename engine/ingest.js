(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLIngest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUBGROUPS = [
    { key: 'frl', label: 'FRL · economically disadvantaged', a: { col: 'FREE_OR_REDUCED_LUNCH', val: true },  b: { col: 'FREE_OR_REDUCED_LUNCH', val: false }, aLabel: 'FRL', bLabel: 'non-FRL' },
    { key: 'iep', label: 'IEP · students with disabilities', a: { col: 'IEP_DISABILITY', val: true },          b: { col: 'IEP_DISABILITY', val: false }, aLabel: 'IEP', bLabel: 'non-IEP' },
    { key: 'el',  label: 'EL · English learners',            a: { col: 'ENGLISH_LANGUAGE_LEARNER', val: true }, b: { col: 'ENGLISH_LANGUAGE_LEARNER', val: false }, aLabel: 'EL', bLabel: 'non-EL' },
    { key: 'race_bw', label: 'Race · Black vs. White',       a: { col: 'BLACK', val: true },    b: { col: 'WHITE', val: true }, aLabel: 'Black', bLabel: 'White' },
    { key: 'race_hw', label: 'Race · Hispanic vs. White',    a: { col: 'HISPANIC', val: true }, b: { col: 'WHITE', val: true }, aLabel: 'Hispanic', bLabel: 'White' },
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

  return { SUBGROUPS, PREFIX_TO_SUBJECT, FLAG_COLS, canonHeader, detectPrefix, parseFlag, requiredColumns, validate };
});
