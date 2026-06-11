// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// Resources page — EdResearch-for-Action reports (and related papers, tools,
// and instruments) matched to patterns detected in the district's own data.
// Spans EVERY available subject (math + ELA when both are loaded) — it does
// not follow the sidebar Subject toggle. Units convert displayed magnitudes;
// Method doesn't apply (pooled district gaps are method-independent).
// Detection + matching logic lives in engine/resources.js (Node-tested); the
// reference CSVs are the single editable source of truth.

const RES_FONT = window.FONT;
const RES_MONO = window.MONO;
const RES_LABEL = window.LABEL;

// Module-level cache so tab revisits don't refetch; a failed fetch clears the
// cache so the next visit retries.
let RES_CSV_CACHE = null;
function loadReferenceCsvs() {
  if (!RES_CSV_CACHE) {
    const get = (path) => fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.text();
    });
    RES_CSV_CACHE = Promise.all([
      get('reference/evidence_resources.csv'),
      get('reference/evidence_crosswalk.csv'),
    ]).then(([resourcesText, crosswalkText]) => ({
      resources: window.GLResources.parseCsv(resourcesText),
      crosswalk: window.GLResources.parseCsv(crosswalkText),
    }));
    RES_CSV_CACHE.catch(() => { RES_CSV_CACHE = null; });
  }
  return RES_CSV_CACHE;
}

const EVIDENCE_TYPE_LABEL = {
  synthesis: 'Synthesis',
  single_study: 'Single study',
  practitioner_tool: 'Tool',
  measurement: 'Measurement',
};
const BAND_LABEL = { elementary: 'Elementary (grades 3–5)', middle: 'Middle (grades 6–8)' };

function ResourcesPage({ ctx }) {
  const SLU = window.SLU;
  const [csvs, setCsvs] = React.useState({ status: 'loading' });
  React.useEffect(() => {
    let alive = true;
    loadReferenceCsvs().then(
      (d) => { if (alive) setCsvs({ status: 'ready', ...d }); },
      () => { if (alive) setCsvs({ status: 'error' }); },
    );
    return () => { alive = false; };
  }, []);

  const unit = ctx.unit || 'z';
  const isWk = unit === 'weeks';
  // Cross-subject page: weeks conversion uses each finding's own subject
  // factor, not the active toggle's.
  const fmtV = (v, subject) => {
    const x = isWk ? window.zToWeeks(v, { subject }) : v;
    return (x >= 0 ? '+' : '−') + (isWk ? Math.abs(Math.round(x)) : Math.abs(x).toFixed(2))
      + (isWk ? ' wk' : ' SD');
  };

  let body = null;
  if (csvs.status === 'loading') {
    body = <StateCard>Loading the resource library…</StateCard>;
  } else if (csvs.status === 'error') {
    body = <StateCard>The resource library didn’t load (reference/*.csv). Check the files are being served and revisit this page to retry.</StateCard>;
  } else {
    const bySubject = window.GLStore ? window.GLStore.allSubjectsData() : {};
    const findings = window.GLResources.detectFindings({ bySubject });
    const { sections, general } = window.GLResources.matchResources({
      findings, crosswalk: csvs.crosswalk, resources: csvs.resources,
    });
    body = (
      <>
        {sections.length === 0 && (
          <StateCard>
            None of the patterns this page watches for — subgroup gaps clear of
            zero, grade bands growing below expectations — stand out from noise
            in the loaded data. That’s good news. The broad-evidence resources
            below apply all the same.
          </StateCard>
        )}
        {sections.map((sec, i) => <FindingCard key={i} section={sec} fmtV={fmtV} />)}
        {general.length > 0 && (
          <window.AuxCard title="Worth knowing regardless">
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: SLU.mute, lineHeight: 1.5, maxWidth: 720 }}>
              Broad evidence on accelerating learning — not tied to any one
              pattern above, but the strongest general playbook for districts
              moving growth.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {general.map((r) => <ResourceRow key={r.resource_id} resource={r} />)}
            </div>
          </window.AuxCard>
        )}
        <window.AuxCard title="How to read this page">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: SLU.ink2, lineHeight: 1.6, maxWidth: 760 }}>
            <li>These are matched starting points, not endorsements or prescriptions — the match says “districts with this pattern have found this evidence useful,” nothing more.</li>
            <li>Patterns describe what’s happening in your data, not why. None of this establishes a cause.</li>
            <li><b style={{ fontWeight: 600 }}>Synthesis</b> badges mark reviews of many studies; <b style={{ fontWeight: 600 }}>single study</b> badges mark findings from one context that may not travel.</li>
            <li>Links open external sites (EdResearch for Action, EdWorkingPapers, EdInstruments) in a new tab.</li>
          </ul>
        </window.AuxCard>
      </>
    );
  }

  return (
    <>
      <window.BriefHeader eyebrow="Resources"
        title="Evidence matched to your data"
        blurb={'GrowthLens looks for clear patterns in the loaded data — gaps between student groups that stand apart from noise, and grade bands growing below expectations — and matches each one to research syntheses, working papers, and practitioner tools. This page covers every loaded subject (math and ELA), whatever the sidebar toggle says.'} />
      {body}
    </>
  );
}

function StateCard({ children }) {
  const SLU = window.SLU;
  return (
    <div style={{ background: '#fff', border: `1px solid ${SLU.rule2}`, borderRadius: 8,
                  padding: '22px 24px', color: SLU.ink2, fontSize: 13.5, lineHeight: 1.55,
                  maxWidth: 860 }}>
      {children}
    </div>
  );
}

// One detected pattern + its matched resources.
function FindingCard({ section, fmtV }) {
  const SLU = window.SLU;
  const f = section.finding;
  const subjectChip = (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontFamily: RES_LABEL,
                   fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                   background: 'rgba(0, 61, 165, 0.08)', color: SLU.blue }}>
      {f.subject}
    </span>
  );

  let heading, detail;
  if (f.type === 'subgroup_gap') {
    const a = f.comparisons[0];
    heading = f.subgroup === 'race'
      ? 'Growth gaps by race'
      : `${a.groupA} students grow behind their ${a.groupB} schoolmates`;
    detail = f.comparisons.map((c) =>
      `${c.groupA} vs. ${c.groupB}: ${fmtV(c.gap, f.subject)} district-wide [${fmtV(c.ci[0], f.subject)}, ${fmtV(c.ci[1], f.subject)}]`).join(' · ')
      + ' — intervals clear of zero, so these gaps are unlikely to be chance.';
  } else {
    heading = `${BAND_LABEL[f.gradeBand] || f.gradeBand} is growing below expectations`;
    detail = `Average growth ${fmtV(f.mean, f.subject)} across ${f.n.toLocaleString()} students in this band.`;
  }

  return (
    <section style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
      padding: '18px 22px 20px', fontFamily: RES_FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {subjectChip}
        <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
          {heading}
        </h2>
      </div>
      <div style={{ fontSize: 12, color: SLU.mute, marginTop: 4, lineHeight: 1.5, maxWidth: 860 }}>
        {detail}
      </div>
      {section.matches.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14,
                      paddingTop: 12, borderTop: `1px solid ${SLU.rule2}` }}>
          {section.matches.map((m) => (
            <ResourceRow key={m.resource.resource_id} resource={m.resource}
                         strength={m.strength} rationale={m.rationale} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: SLU.mute, marginTop: 12, fontStyle: 'italic' }}>
          No matched resources for this pattern in the current library.
        </div>
      )}
    </section>
  );
}

function ResourceRow({ resource, strength, rationale }) {
  const SLU = window.SLU;
  const typeLabel = EVIDENCE_TYPE_LABEL[resource.evidence_type] || resource.evidence_type;
  const singleStudy = resource.evidence_type === 'single_study';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <a href={resource.url} target="_blank" rel="noopener noreferrer"
           style={{ fontSize: 13, fontWeight: 600, color: SLU.blue, textDecoration: 'none' }}>
          {resource.title} <span aria-hidden="true" style={{ fontSize: 11 }}>↗</span>
        </a>
        {strength && (
          <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                         fontFamily: RES_LABEL, letterSpacing: 0.6, textTransform: 'uppercase',
                         background: strength === 'direct' ? 'rgba(0, 61, 165, 0.10)' : '#F1F1F3',
                         color: strength === 'direct' ? SLU.blue : SLU.ink2 }}>
            {strength === 'direct' ? 'Direct match' : 'Related evidence'}
          </span>
        )}
        <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                       fontFamily: RES_LABEL, letterSpacing: 0.6, textTransform: 'uppercase',
                       border: `1px solid ${singleStudy ? SLU.gold : SLU.rule}`,
                       color: singleStudy ? '#7A5D0E' : SLU.mute }}>
          {typeLabel}
        </span>
      </div>
      {(rationale || resource.notes) && (
        <div style={{ fontSize: 12, color: SLU.mute, lineHeight: 1.5, maxWidth: 860 }}>
          {rationale}
          {rationale && resource.notes ? ' ' : ''}
          {resource.notes && <em>{resource.notes}.</em>}
        </div>
      )}
    </div>
  );
}

window.ResourcesPage = ResourcesPage;
