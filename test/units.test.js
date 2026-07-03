const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../engine/units.js');

// Mirrors the real reference file's coverage: years 2019 + 2022–2025, grades 4–8.
const CF = {
  base_weeks: 38,
  factors: [2019, 2022, 2023, 2024, 2025].flatMap((year) =>
    [4, 5, 6, 7, 8].flatMap((grade) =>
      ['math', 'ela'].map((subject) => ({
        year, grade, subject,
        // Distinct per year so fallbacks are detectable: math 2025 g4–8 ≈ 0.40…
        annual_growth_effect_size: 0.30 + (year - 2019) * 0.01 + grade * 0.02 + (subject === 'ela' ? 0.005 : 0),
      })))),
};

test('resolveFactorYear: exact year when present', () => {
  assert.equal(U.resolveFactorYear(CF, 2024, 'math'), 2024);
});
test('resolveFactorYear: gap year falls back to nearest prior (2021 → 2019)', () => {
  assert.equal(U.resolveFactorYear(CF, 2021, 'math'), 2019);
});
test('resolveFactorYear: future year falls back to latest available (2027 → 2025)', () => {
  assert.equal(U.resolveFactorYear(CF, 2027, 'ela'), 2025);
});
test('resolveFactorYear: year before all factors → earliest available', () => {
  assert.equal(U.resolveFactorYear(CF, 2015, 'math'), 2019);
});
test('resolveFactorYear: null without factors', () => {
  assert.equal(U.resolveFactorYear(null, 2025, 'math'), null);
  assert.equal(U.resolveFactorYear({ factors: [] }, 2025, 'math'), null);
});

test('weeksPerSD: exact grade factor when grade given', () => {
  // 2025 math grade 4: es = 0.30 + 0.06 + 0.08 = 0.44 → 38/0.44
  assert.ok(Math.abs(U.weeksPerSD(CF, { year: 2025, subject: 'math', grade: 4 }) - 38 / 0.44) < 1e-9);
});
test('weeksPerSD: grade-average when no grade given', () => {
  const avgEs = (0.44 + 0.46 + 0.48 + 0.50 + 0.52) / 5; // 2025 math grades 4–8
  assert.ok(Math.abs(U.weeksPerSD(CF, { year: 2025, subject: 'math' }) - 38 / avgEs) < 1e-9);
});
test('weeksPerSD: string grade resolves its exact factor, not the average', () => {
  // Regression: grade context often travels as object keys (strings) — the
  // scan overview and insights takeaways were converting with the grade
  // average while the heatmap cells used exact factors, so weeks mode
  // disagreed between the overview card and the table.
  assert.ok(Math.abs(U.weeksPerSD(CF, { year: 2025, subject: 'math', grade: '4' }) - 38 / 0.44) < 1e-9);
  assert.equal(
    U.weeksPerSD(CF, { year: 2025, subject: 'math', grade: '7' }),
    U.weeksPerSD(CF, { year: 2025, subject: 'math', grade: 7 }));
});
test('weeksPerSD: non-numeric grade falls back to the grade average', () => {
  assert.equal(
    U.weeksPerSD(CF, { year: 2025, subject: 'math', grade: 'all' }),
    U.weeksPerSD(CF, { year: 2025, subject: 'math' }));
});
test('weeksPerSD: unknown grade (3) falls back to the grade average', () => {
  assert.equal(
    U.weeksPerSD(CF, { year: 2025, subject: 'math', grade: 3 }),
    U.weeksPerSD(CF, { year: 2025, subject: 'math' }));
});
test('weeksPerSD: year fallback flows through (2021 uses 2019 factors)', () => {
  assert.equal(
    U.weeksPerSD(CF, { year: 2021, subject: 'math', grade: 5 }),
    U.weeksPerSD(CF, { year: 2019, subject: 'math', grade: 5 }));
});
test('weeksPerSD: crude constant when no factors are loaded', () => {
  assert.equal(U.weeksPerSD(null, { year: 2025, subject: 'math' }), U.FALLBACK_WEEKS_PER_SD);
});
