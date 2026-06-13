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
      // The direction reference is always the (shrunken) district gap in
      // meta.districtGap — there is no raw district pooled mean in the shape.
      const dSign = Math.sign(meta.districtGap || 0);
      const meets = schools.filter((s) => s.meets_min_cell && Number.isFinite(s[gapKey]));
      const leaning = dSign === 0 ? 0 : meets.filter((s) => Math.sign(s[gapKey]) === dSign).length;
      return {
        key: k, groupA: meta.groupA, groupB: meta.groupB,
        label: `${meta.groupA} vs. ${meta.groupB}`,
        // districtGap is null when no school met the threshold — show a dash,
        // never a fabricated zero.
        gapText: Number.isFinite(meta.districtGap) ? fmt.val(meta.districtGap) : '—',
        rangeText: meta.districtCi95
          ? `${fmt.val(meta.districtCi95[0])} to ${fmt.val(meta.districtCi95[1])}` : '—',
        leaning: Number.isFinite(meta.districtGap) ? `${leaning} of ${meets.length}` : '—',
        coverage: `${meta.nMeetingThreshold} of ${meta.nSchools}`,
        reliable,
      };
    });
    const skipped = rows.filter((r) => !r.reliable).map((r) => r.label);
    const skippedNote = skipped.length
      ? `No school-by-school slide for ${skipped.join(' or ')} — the district-wide difference there could plausibly be zero.`
      : null;
    const activeKey = GAP_KEYS.find((k) => gaps[k] && gaps[k].meta);
    return { kind: 'gapsOverview', rows, skippedNote,
             takeaways: pickTakeaways(I.gapTakeaways({ slices: gaps, activeKey, mode, fmt })) };
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
            // The interval as words, for renderers without a drawn bar
            // (speaker notes, accessibility text).
            rangeText: `${fmt.val(s[ciKey][0])} to ${fmt.val(s[ciKey][1])}`,
          }));
        const excluded = schools
          .filter((s) => !(s.meets_min_cell && Number.isFinite(s[gapKey]) && s[ciKey]))
          .map((s) => ({
            name: label(s),
            // An empty group side is the only case that earns the "no X
            // students" caption; everything else is a sample-size problem.
            reason: (s.n_a === 0 || s.n_b === 0)
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

  const GRADES = [3, 4, 5, 6, 7, 8];
  const cellVal = (c) => (c.rs != null ? c.rs : c.r);

  // Each figure slide carries its page's generated takeaways — the same
  // insights the app's overview cards show, minus caveats, capped at three.
  const pickTakeaways = (items) => (items || []).filter((t) => t && !t.caveat).slice(0, 3);

  function heatSlide({ heat, subject, fmt } = {}) {
    if (!heat || !heat.schools || !heat.schools.length) return null;
    const grades = GRADES.filter((g) => heat.schools.some((s) => s.grades && s.grades[g] && s.grades[g].n > 0));
    const rows = heat.schools.map((s) => {
      const cells = grades.map((g) => {
        const c = s.grades && s.grades[g];
        if (!c || !(c.n > 0)) return null;
        const z = cellVal(c);
        return { z, n: c.n, ok: !!c.ok, text: fmt.val(z, { grade: g }) };
      });
      const ovz = s.overall ? cellVal(s.overall) : null;
      return {
        name: label(s), cells,
        overall: ovz == null ? null : { z: ovz, n: s.overall.n, text: fmt.val(ovz) },
      };
    });
    return { kind: 'heat', subject, grades, rows,
             takeaways: pickTakeaways(I.scanTakeaways({ heat, fmt })) };
  }

  function scatterSlide({ ach, subject, mode = 'shrunk', fmt } = {}) {
    const pts = (ach && ach.school && ach.school.points) || [];
    if (!pts.length) return null;
    const y = (p) => (mode === 'raw' || p.y_shrunk == null) ? p.y_raw : p.y_shrunk;
    const points = pts.map((p) => ({ name: label(p), x: p.x, y: y(p), n: p.n || 1 }));
    let w = 0, xw = 0, yw = 0;
    points.forEach((p) => { w += p.n; xw += p.x * p.n; yw += p.y * p.n; });
    const sorted = [...points].sort((a, b) => b.y - a.y);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    return {
      kind: 'scatter', subject, points,
      xMean: w ? xw / w : 0, yMean: w ? yw / w : 0,
      best: { name: best.name, text: fmt.val(best.y) },
      worst: { name: worst.name, text: fmt.val(worst.y) },
      takeaways: pickTakeaways(I.achievementTakeaways({ ach, mode, fmt })),
    };
  }

  function groupsSlide({ demo, subject, fmt } = {}) {
    if (!demo) return null;
    const rawSections = buildDemoSections(demo);
    if (!rawSections.length) return null;
    const sections = rawSections.map((sec) => ({
      title: sec.title,
      groups: sec.groups.map((g) => ({
        label: g.label, n: g.n, median: g.median, q1: g.q1, q3: g.q3,
        text: fmt.val(g.median),
      })),
    }));
    const raw = rawSections.flatMap((s) => s.groups);
    const lo = Math.min(...raw.map((g) => (g.whiskerLo != null ? g.whiskerLo : g.q1)));
    const hi = Math.max(...raw.map((g) => (g.whiskerHi != null ? g.whiskerHi : g.q3)));
    return { kind: 'groups', subject, sections, domain: { min: lo, max: hi },
             takeaways: pickTakeaways(I.demographicsTakeaways({ data: { groups: raw }, fmt })) };
  }

  // Tiles + the first non-caveat takeaway from each page's generator,
  // scan and gaps first, capped at six bullets.
  function glanceSlide({ bySubject = {}, mode = 'shrunk', fmt } = {}) {
    const subjects = Object.keys(bySubject);
    if (!subjects.length) return null;
    const tiles = [];
    for (const s of subjects) {
      const heat = bySubject[s].heat;
      const ov = ((heat && heat.schools) || []).map((x) => x.overall).filter(Boolean);
      if (ov.length) {
        tiles.push({
          label: `Growing faster than expected · ${s === 'ela' ? 'ELA' : 'Math'}`,
          value: `${ov.filter((o) => cellVal(o) >= 0).length} / ${ov.length}`,
          sub: 'schools, after steadying small ones',
        });
      }
    }
    let widest = null;
    for (const s of subjects) {
      for (const k of GAP_KEYS) {
        const m = bySubject[s].gaps && bySubject[s].gaps[k] && bySubject[s].gaps[k].meta;
        if (m && Number.isFinite(m.districtGap)
            && (!widest || Math.abs(m.districtGap) > Math.abs(widest.gap))) {
          widest = { gap: m.districtGap, label: `${m.groupA} vs. ${m.groupB}`, subject: s };
        }
      }
    }
    if (widest) tiles.push({
      label: 'Largest gap between groups',
      value: fmt.val(widest.gap),
      sub: `${widest.label} · ${widest.subject === 'ela' ? 'ELA' : 'Math'}`,
    });
    const students = subjects.reduce((t, s) =>
      Math.max(t, (bySubject[s].meta && bySubject[s].meta.nRowsLatest) || 0), 0);
    if (students) tiles.push({ label: 'Students included', value: students.toLocaleString(), sub: 'latest year' });

    const takeaways = [];
    const first = (items) => (items || []).find((t) => !t.caveat);
    for (const s of subjects) {
      const b = bySubject[s];
      const picks = [
        first(I.scanTakeaways({ heat: b.heat, fmt })),
        first(I.gapTakeaways({ slices: b.gaps, activeKey: GAP_KEYS.find((k) => b.gaps && b.gaps[k]), mode, fmt })),
        first(I.achievementTakeaways({ ach: b.ach, mode, fmt })),
        // All groups across sections, matching the Demographics page's own
        // overview card — its "largest difference" deliberately compares the
        // farthest-apart pair across groupings, not within one comparison.
        first(b.demo ? I.demographicsTakeaways({ data: { groups: buildDemoSections(b.demo).flatMap((x) => x.groups) }, fmt }) : null),
      ].filter(Boolean);
      takeaways.push(...picks);
    }
    return { kind: 'glance', tiles, takeaways: takeaways.slice(0, 6) };
  }

  const LEVEL_ORDER = ['Elementary', 'Middle', 'EleMiddle', 'Other'];
  const LEVEL_HEADING = { Elementary: 'Elementary schools', Middle: 'Middle schools',
    EleMiddle: 'Elementary–middle schools', Other: 'Other schools' };
  const SUBJ_WORD = { ela: 'ELA', math: 'Math' };

  // Statewide section: latest year with district data; per level present that
  // year, per subject: histogram bins + the district's named schools; plus a
  // growth-over-time district-mean series per subject.
  //
  // Units: positions stay on the PRiME z scale; weeks mode stamps one
  // weeks-per-SD factor per subject (the latest year's grade-average, via the
  // injected wps) so renderers can relabel axes and the trend keeps its shape
  // — a single factor per panel is a pure relabeling, never a reshaping.
  function statewideSlides({ prime, unit = 'z', fmt = null, wps = () => 1, factorYear = () => null } = {}) {
    if (!prime || !prime.rows || !prime.rows.length || !prime.lea || !P) return [];
    const report = P.districtReport(prime.rows, prime.lea);
    if (!report) return [];
    const year = report.years[report.years.length - 1];
    const yearN = Number(year);
    const weeks = unit === 'weeks';
    const val = (fmt && fmt.val) ? fmt.val : (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2);
    const factor = {};
    for (const sub of ['ela', 'math']) factor[sub] = weeks ? wps(sub, yearN) : 1;
    const levels = LEVEL_ORDER.filter((lv) =>
      report.schools.some((s) => ['ela', 'math'].some((sub) =>
        (s.series[sub] || []).some((p) => p.year === year && p.level === lv))));
    const histLevels = levels.map((lv) => {
      // A subject with no statewide pool at this level still gets a block
      // (poolN 0, empty bins) — renderers filter on poolN > 0.
      const subjects = {};
      for (const sub of ['ela', 'math']) {
        const h = P.histogram(prime.rows, { year, level: lv, subject: sub, binWidth: 0.05, lea: prime.lea });
        subjects[sub] = {
          poolN: h.poolN,
          bins: h.bins.map((b) => ({ x0: b.x0, x1: b.x1, count: b.count, district: b.district })),
          yours: h.schools.map((s) => ({ name: s.name, z: s.z, rank: s.rank,
            text: val(s.z, { subject: sub, year: yearN }) })),
          wps: factor[sub],
        };
      }
      return { level: lv, heading: LEVEL_HEADING[lv], subjects };
    });
    const series = {};
    for (const sub of ['ela', 'math']) series[sub] = P.districtMeanSeries(report, sub);
    const fy = weeks ? factorYear('ela', yearN) : null;
    const factorsClause = weeks
      ? `ELA SD × ${Math.round(factor.ela)}, Math SD × ${Math.round(factor.math)}`
        + (fy ? ` — ${fy} grade 4–8 averages` : ' — typical MAP averages')
      : null;
    return [
      { kind: 'stateHist', district: report.name, year, levels: histLevels, unit,
        weeksNote: weeks ? `Weeks of learning: ${factorsClause}; see the methods note.` : null },
      { kind: 'stateTrend', district: report.name, years: report.years, series, unit, wps: factor,
        weeksNote: weeks
          ? `Weeks of learning: ${factorsClause}; one factor for every year, so the line’s shape matches the SD view.`
          : null },
    ];
  }

  // The unit choice is baked into the injected fmt for every value string;
  // `unit` + `wps`/`factorYear` exist only for the statewide figures, whose
  // axes need the numeric weeks-per-SD factor, not just formatted text.
  function buildDeck({ bySubject = {}, prime = null, unit = 'z', unitLabel = 'SD (standard scale)',
                       mode = 'shrunk', fmt, today = '', wps = () => 1, factorYear = () => null } = {}) {
    const subjects = ['math', 'ela'].filter((s) => bySubject[s]);
    const metas = subjects.map((s) => bySubject[s].meta).filter(Boolean);
    const sample = !metas.some((m) => m && m.source === 'uploaded');
    const district = (metas.map((m) => m && m.districtName).find(Boolean))
      || (sample ? 'Sample district' : 'Your district');
    // Same fallback the app shell uses: uploads carry latestYear, the seeded
    // demo only carries a year label ('2024–25').
    const year = metas.map((m) => m && (m.latestYear || m.year)).find(Boolean) || '';

    const slides = [];
    slides.push({ kind: 'cover', district, year, sample, today,
                  subjects: subjects.map((s) => SUBJ_WORD[s]) });
    slides.push({ kind: 'intro', unitLabel, bullets: [
      'Every number compares growth with what was expected: 0 means a typical year of growth, positive means faster, negative means slower.',
      'Small schools and groups are steadied toward the district average, so a handful of students can\'t swing a result.',
      `Values are shown in ${unitLabel}.`,
    ]});
    const glance = glanceSlide({ bySubject, mode, fmt });
    if (glance) slides.push(glance);
    for (const s of subjects) {
      const b = bySubject[s];
      for (const sl of [heatSlide({ heat: b.heat, subject: s, fmt }),
                        scatterSlide({ ach: b.ach, subject: s, mode, fmt }),
                        groupsSlide({ demo: b.demo, subject: s, fmt })]) {
        if (sl) slides.push(sl);
      }
      const ov = gapsOverview({ gaps: b.gaps, mode, fmt });
      if (ov.rows.length) slides.push({ ...ov, subject: s });
    }
    slides.push(...statewideSlides({ prime, unit, fmt, wps, factorYear }));
    slides.push({ kind: 'cautions', unitLabel, bullets: [
      'Numbers are nudged toward the district average (shrinkage), so a few students can\'t swing a school.',
      'Groups with fewer than 10 students are flagged, not trusted.',
      'These figures describe what\'s happening, not why — use them to ask sharper questions, never to evaluate individual teachers.',
      'All analysis ran privately in the browser; no student data left the device.',
    ]});
    const forests = subjects.flatMap((s) =>
      forestSlides({ gaps: bySubject[s].gaps, subject: s, mode, fmt }));
    if (forests.length) {
      slides.push({ kind: 'divider', title: 'Appendix — school-by-school detail',
        sub: 'One slide per group comparison with a clear district-wide signal.' });
      slides.push(...forests);
    }
    slides.forEach((s, i) => { s.n = i + 1; });
    return { slides, meta: { district, year, sample, subjects: subjects.map((s) => SUBJ_WORD[s]), unitLabel } };
  }

  return { buildDemoSections, label, gapsOverview, forestSlides,
           heatSlide, scatterSlide, groupsSlide, glanceSlide,
           statewideSlides, buildDeck };
});
