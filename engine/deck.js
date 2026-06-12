// GrowthLens deck model — pure functions, no DOM, no PptxGenJS. UMD: browser →
// window.GLDeck, Node → module.exports.
//
// buildDeck() turns the store's per-subject shapes (+ the PRiME rows when the
// district is known) into an ordered array of slide DESCRIPTORS. Both the
// PPTX builder and the on-page carousel render from this one model, so the
// preview can never drift from the file. All school/district names, unit
// formatting (via the injected fmt), takeaway selection, and appendix gating
// happen here — where Node can test them.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./prime.js'), require('./insights.js'));
  } else {
    root.GLDeck = factory(root.GLPrime, root.GLInsights);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, I) {
  'use strict';

  const label = (s) => (s.school_name && s.school_name !== s.school_id ? s.school_name : s.school_id);

  // ---- demographics sections (moved from demographics.jsx — one source) ----
  // One section per demographic dimension. A group label appearing in more
  // than one race comparison (White, the shared reference) is kept once,
  // ordered last. Unknown comparison keys get their own section.
  function buildDemoSections(dd) {
    const sections = [];
    const groupsOf = (key) => (dd[key] && dd[key].groups) || [];
    if (groupsOf('frl').length) sections.push({ title: 'Income', groups: groupsOf('frl') });
    if (groupsOf('iep').length) sections.push({ title: 'Disability', groups: groupsOf('iep') });
    if (groupsOf('el').length) sections.push({ title: 'Language', groups: groupsOf('el') });
    const raceKeys = ['race_bw', 'race_hw'].filter((k) => groupsOf(k).length);
    if (raceKeys.length) {
      const counts = {};
      raceKeys.forEach((k) => groupsOf(k).forEach((g) => { counts[g.label] = (counts[g.label] || 0) + 1; }));
      const seen = new Set();
      const focal = [], shared = [];
      raceKeys.forEach((k) => groupsOf(k).forEach((g) => {
        if (seen.has(g.label)) return;
        seen.add(g.label);
        (counts[g.label] > 1 ? shared : focal).push(g);
      }));
      sections.push({ title: 'Race', groups: [...focal, ...shared] });
    }
    const known = new Set(['frl', 'iep', 'el', 'race_bw', 'race_hw']);
    for (const [key, v] of Object.entries(dd)) {
      if (known.has(key) || !v || !v.groups || !v.groups.length) continue;
      sections.push({ title: v.label || key, groups: v.groups });
    }
    return sections;
  }

  const GAP_KEYS = ['frl', 'iep', 'el', 'race_bw', 'race_hw'];
  const isReliable = (m) => !!(m && m.districtCi95 && (m.districtCi95[0] > 0 || m.districtCi95[1] < 0));

  // One table row per comparison the data carries. `reliable` drives the
  // appendix gate: the district-wide interval stays on one side of zero.
  function gapsOverview({ gaps = {}, mode = 'shrunk', fmt } = {}) {
    const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
    const rows = GAP_KEYS.filter((k) => gaps[k] && gaps[k].meta).map((k) => {
      const { meta, schools } = gaps[k];
      const reliable = isReliable(meta);
      const dSign = Math.sign(meta.districtGap || 0);
      const meets = schools.filter((s) => s.meets_min_cell && Number.isFinite(s[gapKey]));
      const leaning = dSign === 0 ? 0 : meets.filter((s) => Math.sign(s[gapKey]) === dSign).length;
      return {
        key: k, groupA: meta.groupA, groupB: meta.groupB,
        label: `${meta.groupA} vs. ${meta.groupB}`,
        gapText: fmt.val(meta.districtGap),
        rangeText: meta.districtCi95
          ? `${fmt.val(meta.districtCi95[0])} to ${fmt.val(meta.districtCi95[1])}` : '—',
        leaning: `${leaning} of ${meets.length}`,
        coverage: `${meta.nMeetingThreshold} of ${meta.nSchools}`,
        reliable,
      };
    });
    const skipped = rows.filter((r) => !r.reliable).map((r) => r.label);
    const skippedNote = skipped.length
      ? `No school-by-school slide for ${skipped.join(' or ')} — the district-wide difference there could plausibly be zero.`
      : null;
    return { kind: 'gapsOverview', rows, skippedNote };
  }

  // Appendix: one forest slide per RELIABLE comparison, schools sorted by
  // gap size, zero-side/too-small schools listed compactly instead of drawn.
  function forestSlides({ gaps = {}, subject, mode = 'shrunk', fmt } = {}) {
    const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
    const ciKey = mode === 'raw' ? 'raw_ci95' : 'shrunk_ci95';
    return GAP_KEYS
      .filter((k) => gaps[k] && isReliable(gaps[k].meta))
      .map((k) => {
        const { meta, schools } = gaps[k];
        const drawn = schools
          .filter((s) => s.meets_min_cell && Number.isFinite(s[gapKey]) && s[ciKey])
          .sort((a, b) => Math.abs(b[gapKey]) - Math.abs(a[gapKey]))
          .map((s) => ({
            name: label(s), nA: s.n_a, nB: s.n_b,
            gap: s[gapKey], ci: s[ciKey],
            text: fmt.val(s[gapKey]),
            rangeText: `${fmt.val(s[ciKey][0])} to ${fmt.val(s[ciKey][1])}`,
          }));
        const excluded = schools
          .filter((s) => !(s.meets_min_cell && Number.isFinite(s[gapKey]) && s[ciKey]))
          .map((s) => ({
            name: label(s),
            reason: !Number.isFinite(s[gapKey])
              ? `no ${s.n_a === 0 ? meta.groupA : meta.groupB} students`
              : 'too few students to read reliably',
          }));
        const ext = Math.max(0.1, Math.abs(meta.districtGap || 0),
          ...drawn.flatMap((r) => [Math.abs(r.ci[0]), Math.abs(r.ci[1])]));
        return {
          kind: 'forest', subject, key: k,
          groupA: meta.groupA, groupB: meta.groupB,
          title: `${meta.groupA} vs. ${meta.groupB} — school by school`,
          district: { gap: meta.districtGap, ci: meta.districtCi95, text: fmt.val(meta.districtGap) },
          rows: drawn, excluded,
          axis: { min: -ext * 1.1, max: ext * 1.1 },
        };
      });
  }

  return { buildDemoSections, label, gapsOverview, forestSlides };
});
