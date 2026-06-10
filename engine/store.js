// Holds computed datasets, swaps window.* globals behind activateSubject, exposes active meta.
(function () {
  'use strict';
  const sources = { demo: {}, uploaded: {} };   // sources[src][subject] = { shapes, meta }
  let activeSubject = 'math', activeSubgroup = 'frl';

  // Seed the demo source from the bundled fixtures (Math demo). Re-signed in Task 14.
  function seedDemo() {
    sources.demo.math = {
      meta: { subject: 'math', source: 'demo', label: 'bundled demo data', nSchools: (window.GAPS_DATA?.meta?.nSchools) || 30, year: '2024–25' },
      shapes: {
        GAPS_DATA_BY_DEMO: { frl: window.GAPS_DATA },   // demo only ships FRL; others fall back to it
        HEATMAP_DATA: window.HEATMAP_DATA, DEMO_DATA: window.DEMO_DATA,
        DEMO_DATA_BY_SCHOOL: window.DEMO_DATA_BY_SCHOOL, ACH_DATA: window.ACH_DATA,
        DEMO_SPECS: window.DEMO_SPECS,                   // demo's rich variable specs; uploads derive theirs
      },
    };
  }

  function resolve(subject) { return sources.uploaded[subject] || sources.demo[subject] || null; }
  function available(subject) { return !!resolve(subject); }

  function putUploaded(subject, shapes, meta) {
    sources.uploaded[subject] = { shapes, meta: { ...meta, source: 'uploaded' } };
  }

  function pointGlobals(subject, subgroup) {
    const ds = resolve(subject); if (!ds) return;
    const sh = ds.shapes;
    const gaps = sh.GAPS_DATA_BY_DEMO[subgroup] || sh.GAPS_DATA_BY_DEMO.frl;
    window.GAPS_DATA = gaps;
    window.HEATMAP_DATA = sh.HEATMAP_DATA;
    window.DEMO_DATA = sh.DEMO_DATA;
    window.DEMO_DATA_BY_SCHOOL = sh.DEMO_DATA_BY_SCHOOL;
    window.ACH_DATA = sh.ACH_DATA;
    // Keep the Demographics "Variable" dropdown in sync with the active dataset: the demo
    // carries its rich specs; an uploaded subject derives them from its computed DEMO_DATA (the
    // engine's 5 comparisons) so stale demo keys (race/ell/gifted/...) don't render "No data".
    window.DEMO_SPECS = sh.DEMO_SPECS || Object.fromEntries(
      Object.entries(sh.DEMO_DATA || {}).map(([k, v]) => [k, { label: (v && v.label) || k }])
    );
  }

  const store = {
    seedDemo, available, putUploaded,
    setActiveSubject(s) { if (available(s)) { activeSubject = s; pointGlobals(activeSubject, activeSubgroup); } },
    setActiveSubgroup(k) { activeSubgroup = k; pointGlobals(activeSubject, activeSubgroup); },
    getActiveMeta() { const ds = resolve(activeSubject); return ds ? ds.meta : null; },
    activeSubject: () => activeSubject,
  };
  window.GLStore = store;
})();
