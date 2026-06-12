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

  return { buildDemoSections, label };
});
