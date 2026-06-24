// GrowthLens evidence-resource matching — pure functions, no DOM. UMD:
// browser → window.GLResources, Node → module.exports.
//
// Three pieces: a small quoted-CSV parser for the reference files, a finding
// detector over the computed shapes (CI-gated, so quiet data stays quiet),
// and the crosswalk join that turns findings into matched resources with
// their match-strength tier and rationale. The reference CSVs stay the single
// editable source of truth; nothing here hardcodes a resource.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLResources = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- CSV ------------------------------------------------------------------
  // Handles the reference files' shape: every field quoted, commas and
  // doubled quotes inside fields, header row first.
  function parseCsv(text) {
    const rows = [];
    let field = '', row = [], inQuotes = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') pushField();
      else if (ch === '\n') { pushField(); pushRow(); }
      else if (ch !== '\r') field += ch;
    }
    if (field !== '' || row.length) { pushField(); pushRow(); }
    const header = rows.shift() || [];
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }

  // ---- finding detection ------------------------------------------------------
  // App comparison keys → crosswalk population keys. Comparisons that share a
  // key merge into one finding: the two race comparisons, and the two income
  // measures (FRL + direct certification) all collapse to a single finding.
  const SUBGROUP_KEY = { el: 'mll', iep: 'swd', frl: 'frl', direct_cert: 'frl', race_bw: 'race', race_hw: 'race' };
  const BANDS = { elementary: ['3', '4', '5'], middle: ['6', '7', '8'] };
  const LOW_GROWTH_FLOOR = -0.05;

  // Bands the district actually serves, from the heatmap's reliable cells —
  // lets a pooled (all-grades) gap finding match band-specific crosswalk rows.
  function bandsServed(heat) {
    const present = new Set();
    for (const s of (heat && heat.schools) || []) {
      for (const [g, c] of Object.entries(s.grades || {})) {
        if (c && c.n > 0) present.add(String(g));
      }
    }
    return Object.entries(BANDS)
      .filter(([, grades]) => grades.some((g) => present.has(g)))
      .map(([band]) => band);
  }

  // bySubject: { math: { gaps: GAPS_DATA_BY_DEMO, heat: HEATMAP_DATA }, ela: … }
  function detectFindings({ bySubject = {} } = {}) {
    const findings = [];
    for (const [subject, data] of Object.entries(bySubject)) {
      if (!data) continue;
      const served = bandsServed(data.heat);

      // Subgroup gaps — fire only when the pooled CI is clear of zero with
      // the focal group behind. Grouped by crosswalk key so race_bw/race_hw
      // land in one finding.
      const byKey = {};
      for (const slice of Object.values(data.gaps || {})) {
        const m = slice && slice.meta;
        if (!m) continue;
        const key = SUBGROUP_KEY[m.demographic];
        const ci = m.districtCi95;
        if (!key || !ci || !(ci[1] < 0)) continue;   // needs the whole interval below zero
        (byKey[key] = byKey[key] || []).push({
          key: m.demographic, groupA: m.groupA, groupB: m.groupB,
          gap: m.districtGap, ci,
        });
      }
      for (const [subgroup, comparisons] of Object.entries(byKey)) {
        findings.push({ type: 'subgroup_gap', subject, subgroup, comparisons, bandsServed: served });
      }

      // Low-growth grade bands — n-weighted mean over reliable cells, using
      // the shrunken cell values when the engine provides them (rs) so the
      // trigger matches what the heatmap displays.
      for (const [band, grades] of Object.entries(BANDS)) {
        let n = 0, sum = 0;
        for (const s of (data.heat && data.heat.schools) || []) {
          for (const g of grades) {
            const c = s.grades && s.grades[g];
            if (c && c.ok && c.n > 0) { n += c.n; sum += (c.rs != null ? c.rs : c.r) * c.n; }
          }
        }
        if (n > 0 && sum / n <= LOW_GROWTH_FLOOR) {
          findings.push({ type: 'low_growth', subject, gradeBand: band, mean: sum / n, n, bandsServed: served });
        }
      }
    }
    // Biggest subgroup gaps first, then low-growth bands (worst first).
    const worst = (f) => f.type === 'subgroup_gap'
      ? -Math.max(...f.comparisons.map((c) => Math.abs(c.gap)))
      : 1 + f.mean;
    return findings.sort((a, b) => worst(a) - worst(b));
  }

  // ---- crosswalk join ----------------------------------------------------------
  const STRENGTH_ORDER = { direct: 0, adjacent: 1 };

  function rowMatches(row, f) {
    if (row.finding_type !== f.type) return false;
    if (f.type === 'subgroup_gap' && row.subgroup !== f.subgroup) return false;
    if (row.subject !== 'any' && row.subject !== f.subject) return false;
    if (row.grade_band !== 'any') {
      if (f.type === 'low_growth') {
        if (row.grade_band !== f.gradeBand) return false;
      } else if (!(f.bandsServed || []).includes(row.grade_band)) return false;
    }
    return true;
  }

  function matchResources({ findings = [], crosswalk = [], resources = [] } = {}) {
    const byId = Object.fromEntries(resources.map((r) => [r.resource_id, r]));
    const generalIds = new Set();
    const sections = [];

    for (const f of findings) {
      const seen = new Set();
      const matches = [];
      for (const row of crosswalk) {
        if (!rowMatches(row, f)) continue;
        if (row.match_strength === 'general') { generalIds.add(row.resource_id); continue; }
        if (seen.has(row.resource_id)) continue;
        seen.add(row.resource_id);
        const resource = byId[row.resource_id];
        if (resource) matches.push({ resource, strength: row.match_strength, rationale: row.rationale });
      }
      matches.sort((a, b) =>
        (STRENGTH_ORDER[a.strength] ?? 9) - (STRENGTH_ORDER[b.strength] ?? 9)
        || a.resource.resource_id.localeCompare(b.resource.resource_id));
      sections.push({ finding: f, matches });
    }

    // Nothing fired → the broad acceleration tier still applies; surface the
    // whole general tier rather than an empty page.
    if (findings.length === 0) {
      for (const row of crosswalk) {
        if (row.match_strength === 'general') generalIds.add(row.resource_id);
      }
    }
    const general = [...generalIds].sort().map((id) => byId[id]).filter(Boolean);
    return { sections, general };
  }

  return { parseCsv, detectFindings, matchResources };
});
