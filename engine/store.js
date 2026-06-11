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
        // The generated demo ships all five comparisons (GAPS_DATA_DEMO_ALL);
        // the frl-only fallback covers older fixtures and test mocks.
        GAPS_DATA_BY_DEMO: window.GAPS_DATA_DEMO_ALL || { frl: window.GAPS_DATA },
        HEATMAP_DATA: window.HEATMAP_DATA, DEMO_DATA: window.DEMO_DATA,
        ACH_DATA: window.ACH_DATA,
        DEMO_SPECS: window.DEMO_SPECS,                   // optional; derived from DEMO_DATA when absent
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
    // Forget an uploaded subject: the demo (if any) shows through again, and if
    // nothing backs the active subject anymore the store moves to one that works.
    // DuckDB table cleanup is the caller's job — the store is pure JS.
    removeUploaded(subject) {
      delete sources.uploaded[subject];
      if (!available(activeSubject)) {
        const fallback = ['math', 'ela'].find(available);
        if (fallback) activeSubject = fallback;
      }
      pointGlobals(activeSubject, activeSubgroup);
    },
    // Subgroup keys the active dataset can actually render (demo ships frl only;
    // uploads carry the engine's five) — lets the UI disable the rest instead of
    // silently falling back to frl.
    availableSubgroups() {
      const ds = resolve(activeSubject);
      return ds ? Object.keys(ds.shapes.GAPS_DATA_BY_DEMO || {}) : [];
    },
    // Every comparison slice the active dataset carries — the key-takeaways
    // generator reads across comparisons, not just the one on screen.
    allGapSlices() {
      const ds = resolve(activeSubject);
      return ds ? (ds.shapes.GAPS_DATA_BY_DEMO || {}) : {};
    },
    // Gaps + heatmap for EVERY available subject — the Resources page spans
    // subjects instead of following the Subject toggle.
    allSubjectsData() {
      const out = {};
      for (const s of ['math', 'ela']) {
        const ds = resolve(s);
        if (ds) out[s] = { gaps: ds.shapes.GAPS_DATA_BY_DEMO || {}, heat: ds.shapes.HEATMAP_DATA || null };
      }
      return out;
    },
    // Uploaded meta for one subject (null if only the demo backs it) — lets the
    // Upload page remember loaded files across remounts.
    getUploadedMeta(subject) { const ds = sources.uploaded[subject]; return ds ? ds.meta : null; },
    setActiveSubject(s) { if (available(s)) { activeSubject = s; pointGlobals(activeSubject, activeSubgroup); } },
    setActiveSubgroup(k) { activeSubgroup = k; pointGlobals(activeSubject, activeSubgroup); },
    getActiveMeta() { const ds = resolve(activeSubject); return ds ? ds.meta : null; },
    activeSubject: () => activeSubject,
  };
  window.GLStore = store;
})();
