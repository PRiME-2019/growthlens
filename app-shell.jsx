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

// App body sketch v6 ----------------------------------------------------------
// Major restructure: right rail dropped entirely. Slice context and Controls
// now live in two stacked cards above the figure, full-width within the main
// column. Each tab (Gap / Scan) gets its own Controls card composition.
//
// Layout is now a simple two-column grid: LeftNav | main column.

// Subject toggle is live across all screens. Figure data is swapped behind the
// window.* globals by engine/store.js (GLStore): the bundled fixtures are the
// Math demo; an uploaded subject shadows the demo. ELA is unavailable until a
// real ELA file is uploaded.
const SUBJECTS = { ela: 'ELA', math: 'Math' };

// ---- SUBJECT DATA SWAP -> engine/store.js (GLStore) --------------------------
// The per-subject window.* swap now lives in the store; see AppBody below.

// Random-effects pooled mean + SE over per-school gap estimates.
function districtMeanRE(schools, tauSquared) {
  let wSum = 0, wxSum = 0;
  for (const s of schools) {
    if (s.meets_min_cell === false) continue;
    const se = (s.raw_se ?? s.shrunk_se);
    if (se == null) continue;
    const v = se * se + Math.max(0, tauSquared);
    if (!isFinite(v) || v <= 0) continue;
    const w = 1 / v;
    wSum += w;
    wxSum += w * (s.raw_gap ?? s.shrunk_gap ?? 0);
  }
  if (wSum <= 0) return null;
  const mu = wxSum / wSum;
  const se = 1 / Math.sqrt(wSum);
  return { mu, se, ciLo: mu - 1.96 * se, ciHi: mu + 1.96 * se };
}
window.districtMeanRE = districtMeanRE;
const DEMOS = {
  frl:     'FRL · economically disadvantaged',
  iep:     'IEP · students with disabilities',
  el:      'EL · English learners',
  race_bw: 'Race · Black vs. White',
  race_hw: 'Race · Hispanic vs. White',
};
const PAGES = {
  landing:      { label: 'Overview',             hint: 'Start here' },
  upload:       { label: 'Upload data',          hint: 'Add your data file' },
  scan:         { label: 'System Scan',          hint: 'Where to look first' },
  gap:          { label: 'Gap Analysis',         hint: 'Compare two groups'  },
  achievement:  { label: 'Status & Growth',      hint: 'Start vs. growth' },
  demographics: { label: 'Demographics',         hint: 'Growth by group' },
  exportpg:     { label: 'Export',               hint: 'Download a deck' },
};

function AppBody() {
  const [page, setPage]           = React.useState('landing');
  const [subject, setSubjectState] = React.useState('math');
  const [demo, setDemo]           = React.useState('frl');
  const [estimate, setEstimate]   = React.useState('shrunk');
  const [unit, setUnit]           = React.useState('z');
  const [forestSort, setForestSort] = React.useState('gap_desc');
  // Default threshold mode: 'section' splits below-threshold schools into a labeled
  // group at the bottom of the forest. (Matches the Upload-page FAQ copy.)
  const [threshold, setThreshold] = React.useState('section');
  // scanSort is no longer in ctx — HeatmapH1 manages its own column-click sort.
  const [demoVar, setDemoVar]     = React.useState('frl');
  const [achLevel, setAchLevel]   = React.useState('school');
  const [achShowMeans, setAchShowMeans] = React.useState(true);

  // Seed the bundled Math demo once (reads the window.* fixtures), then point
  // the well-known window.* globals at the active (subject, subgroup) via the
  // store. Pages are re-keyed on `subject` so figures re-read the swapped globals.
  React.useEffect(() => { if (window.GLStore) window.GLStore.seedDemo(); }, []);
  if (window.GLStore) { window.GLStore.setActiveSubject(subject); window.GLStore.setActiveSubgroup(demo); }
  // Only allow switching to a subject the store actually has (demo is Math-only;
  // ELA becomes available once an ELA file is uploaded). Guards the no-op toggle.
  const setSubject = (s) => { if (!window.GLStore || window.GLStore.available(s)) setSubjectState(s); };
  // Drive the SD ↔ weeks-of-learning conversion off the active subject so
  // forest-shared's fmtVal / zToWeeks pick up the right effect-size factor
  // without each call site having to thread it through props.
  window.WOL_OPTS = { year: 2025, subject };

  // Scroll to the top whenever the user changes analysis tabs so the new
  // page reads from its header; pairs with ControlsCard's scroll handler
  // which re-opens the controls when scrollY is near zero.
  React.useEffect(() => { window.scrollTo(0, 0); }, [page]);

  // Subjects the store can't render yet are greyed in the toggle (demo is
  // Math-only; ELA enables once its file uploads). Never grey the active one.
  const disabledSubjects = Object.keys(SUBJECTS).filter(
    (s) => s !== subject && !(window.GLStore && window.GLStore.available(s)),
  );

  const ctx = {
    page, setPage, subject, setSubject, disabledSubjects, demo, setDemo,
    estimate, setEstimate, unit, setUnit, forestSort, setForestSort,
    threshold, setThreshold,
    demoVar, setDemoVar,
    achLevel, setAchLevel,
    achShowMeans, setAchShowMeans,
  };

  const sliceLabel = `${SUBJECTS[subject]} · ${DEMOS[demo].split(' · ')[0]}`;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px minmax(0, 1fr)',
      minHeight: '100vh',
      background: SLU.bg,
      fontFamily: FONT,
    }}>
      <LeftNav page={page} setPage={setPage} />
      <main style={{ minWidth: 0, padding: '22px 28px 40px', display: 'flex',
                     flexDirection: 'column', gap: 20 }}>
        {(page === 'scan' || page === 'gap' || page === 'demographics' || page === 'achievement' || page === 'upload' || page === 'exportpg') && <DatasetStrip />}
        {page === 'landing'      && <DatasetStrip placeholder />}
        {page === 'landing'      && <LandingPage ctx={ctx} />}
        {page === 'upload'       && <UploadPage ctx={ctx} />}
        <div key={subject + ':' + demo} style={{ display: 'contents' }}>
          {page === 'scan'         && <ScanPage sliceLabel={sliceLabel} ctx={ctx} />}
          {page === 'gap'          && <GapPage sliceLabel={sliceLabel} ctx={ctx} />}
        </div>
        {/* Achievement & Demographics render OUTSIDE the subject-keyed wrapper
            so their SVG geometry stays mounted across ELA↔Math toggles and
            elements can tween between positions instead of re-mounting. */}
        {page === 'demographics' && window.DemographicsPage && <window.DemographicsPage sliceLabel={sliceLabel} ctx={ctx} />}
        {page === 'achievement'  && window.AchievementPage  && <window.AchievementPage  sliceLabel={sliceLabel} ctx={ctx} />}
        {page === 'exportpg'     && window.ExportPage       && <window.ExportPage       ctx={ctx} />}
      </main>
    </div>
  );
}

// ---- LEFT NAV ---------------------------------------------------------------
function LeftNav({ page, setPage }) {
  return (
    <aside style={{
      borderRight: `1px solid ${SLU.rule2}`, background: SLU.bg,
      display: 'flex', flexDirection: 'column', position: 'sticky', top: 0,
      height: '100vh', alignSelf: 'flex-start',
    }}>
      {/* Brand block — measurement-bar glyph (V8) inline before the serif
          wordmark (V1), with a short gold rule beneath. The glyph echoes the
          forest's gap + CI vocabulary; the wordmark anchors the app name;
          PRiME / SLU is attributed beneath the rule. */}
      <div style={{ padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10,
                     borderBottom: `1px solid ${SLU.rule2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="42" height="12" viewBox="0 0 40 22" aria-hidden="true"
               style={{ display: 'block' }}>
            <rect x="0" y="9" width="40" height="4" fill={SLU.rule} rx="1" />
            <rect x="12" y="9" width="14" height="4" fill={SLU.gold} rx="1" />
            <rect x="26" y="9" width="14" height="4" fill={SLU.blue} rx="1" />
            <line x1="26" y1="3" x2="26" y2="19" stroke={SLU.ink} strokeWidth="1.4" />
            <line x1="12" y1="6" x2="12" y2="16" stroke={SLU.mute} strokeWidth="1.2" strokeDasharray="2 2" />
          </svg>
          <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 24,
                         color: SLU.ink, letterSpacing: -0.5, lineHeight: 1 }}>
            GrowthLens
          </div>
        </div>
        <div style={{ height: 1, width: '100%', background: SLU.gold }} />
        <div style={{ fontSize: 9.5, color: SLU.mute, fontFamily: LABEL,
                       textTransform: 'uppercase', letterSpacing: 1.4, lineHeight: 1.45 }}>
          PRiME Center
          <br />
          Saint Louis University
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(PAGES).map(([k, info]) => {
          const active = page === k;
          return (
            <button key={k} onClick={() => setPage(k)}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      gap: 1, padding: '9px 12px', borderRadius: 6,
                      background: active ? 'rgba(0, 61, 165, 0.08)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderLeft: `3px solid ${active ? SLU.blue : 'transparent'}`,
                      paddingLeft: active ? 9 : 12,
                    }}>
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 600,
                              color: active ? SLU.blue : SLU.ink, letterSpacing: -0.1 }}>{info.label}</span>
              <span style={{ fontSize: 11.5, color: SLU.mute, fontWeight: 500 }}>{info.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Secondary nav */}
      <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 1,
                     borderTop: `1px solid ${SLU.rule2}`, marginTop: 8, paddingTop: 14 }}>
        <NavItem label="Methods note" href="methods.html" external />
        <NavItem label="Settings" placeholder soon />
      </div>

      <span style={{ flex: 1 }} />
    </aside>
  );
}

function NavItem({ label, href, external, pdf, placeholder, soon }) {
  if (placeholder) {
    return (
      <span style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', fontSize: 13, fontWeight: 600,
        color: SLU.mute, cursor: 'default',
      }}>
        <span style={{ flex: 1 }}>{label}</span>
        {soon && (
          <span style={{
            fontSize: 9.5, fontFamily: LABEL, letterSpacing: 0.8, textTransform: 'uppercase',
            color: SLU.mute, fontWeight: 700,
            padding: '1px 6px', border: `1px solid ${SLU.rule2}`, borderRadius: 999,
            background: '#FAFAFB',
          }}>Soon</span>
        )}
      </span>
    );
  }
  return (
    <a href={href} target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 13, fontWeight: 600,
          color: SLU.ink, textDecoration: 'none', borderRadius: 6,
        }}>
      <span style={{ flex: 1 }}>{label}</span>
      {pdf && (
        <span style={{
          fontSize: 9.5, fontFamily: LABEL, letterSpacing: 0.8, textTransform: 'uppercase',
          color: SLU.mute, fontWeight: 700,
          padding: '1px 5px', border: `1px solid ${SLU.rule}`, borderRadius: 3,
        }}>PDF</span>
      )}
      {external && (
        <svg width="11" height="11" viewBox="0 0 11 11" style={{ color: SLU.mute }}>
          <path d="M4 2 H9 V7 M9 2 L4 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </a>
  );
}

// ---- DATASET STRIP ----------------------------------------------------------
function DatasetStrip({ placeholder }) {
  // Landing renders this in placeholder mode — an invisible spacer that reserves
  // the strip's height so the page header lines up with every other page.
  if (placeholder) {
    return (
      <div aria-hidden="true" style={{ fontSize: 11.5, fontFamily: MONO, visibility: 'hidden' }}>
        &nbsp;
      </div>
    );
  }
  const m = (window.GLStore && window.GLStore.getActiveMeta()) || null;
  const yr = m && (m.latestYear || m.year);
  const label = m
    ? `${m.districtCode ? m.districtCode + ' · ' : ''}`
      + `${m.source === 'uploaded' ? m.subject.toUpperCase() + ' upload' : 'sample data'}`
      + ` · ${m.nSchools} schools${yr ? ' · ' + yr : ''}`
    : 'No data loaded yet';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, fontSize: 11.5, color: SLU.mute, fontFamily: MONO,
                  flexWrap: 'wrap' }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </div>
  );
}

// ---- BRIEF HEADER -----------------------------------------------------------
function BriefHeader({ slice, eyebrow, title, blurb }) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column',
                     alignItems: 'flex-start', gap: 8, paddingBottom: 2 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 9px', borderRadius: 4,
        background: 'rgba(0, 61, 165, 0.08)', color: SLU.blue,
        fontSize: 11, fontFamily: LABEL, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 1.0,
        whiteSpace: 'nowrap',
      }}>
        {eyebrow} <span style={{ opacity: 0.45 }}>·</span> {slice}
      </span>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: SLU.ink,
                    letterSpacing: -0.3, lineHeight: 1.15, textWrap: 'balance' }}>{title}</h1>
      {blurb && (
        <p style={{ margin: '4px 0 0', maxWidth: 720,
                    fontSize: 13.5, lineHeight: 1.55, color: SLU.ink2,
                    textWrap: 'pretty' }}>{blurb}</p>
      )}
    </header>
  );
}

// ---- PAGES ------------------------------------------------------------------
function LandingPage({ ctx }) {
  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column',
                       alignItems: 'flex-start', gap: 10, paddingBottom: 4 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 9px', borderRadius: 4,
          background: 'rgba(0, 61, 165, 0.08)', color: SLU.blue,
          fontSize: 11, fontFamily: LABEL, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1.0, whiteSpace: 'nowrap',
        }}>GrowthLens · v0.4 preview</span>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: SLU.ink,
                     letterSpacing: -0.5, lineHeight: 1.12, textWrap: 'balance',
                     maxWidth: 760 }}>
          See where your students are growing — privately, in your browser.
        </h1>
        <p style={{ margin: '2px 0 0', maxWidth: 720,
                    fontSize: 14.5, lineHeight: 1.55, color: SLU.ink2,
                    textWrap: 'pretty' }}>
          Upload one file from your assessment system and GrowthLens turns it
          into a clear picture of how each school and student group is doing —
          where growth is strong, where groups are falling behind, and which
          results rest on too few students to lean on. Not one student record
          ever leaves your browser tab.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: 16 }}>
        <LandingCard
          eyebrow="01 · Bring data"
          title="Upload your file"
          body="One row per student, per subject, per year. We look for about a dozen columns; there’s a plain-language checklist and a sample file waiting on the upload page."
          cta="Go to upload →"
          onClick={() => ctx.setPage('upload')}
          accent={SLU.blue}
        />
        <LandingCard
          eyebrow="02 · Triage"
          title="System Scan"
          body="A district-wide heat map of how each grade is doing at each school. Spot where growth is consistently strong or soft before you dig into any one group."
          cta="Open System Scan →"
          onClick={() => ctx.setPage('scan')}
          accent={SLU.gold}
        />
        <LandingCard
          eyebrow="03 · Drill in"
          title="Gap Analysis"
          body="Pick a subject and two student groups, and see the gap between them at every school — ranked, with the district average for context and small-sample schools clearly flagged."
          cta="Open Gap Analysis →"
          onClick={() => ctx.setPage('gap')}
          accent={SLU.blue}
        />
      </section>

      <section style={{ padding: '4px 4px 0' }}>
        <h2 style={{
          fontFamily: LABEL, fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1.4, color: SLU.ink2,
          margin: '0 0 10px', paddingBottom: 6,
          borderBottom: `1px solid ${SLU.rule2}`,
        }}>What GrowthLens is — and isn’t</h2>
        <FAQ items={[
          {
            q: 'What it does',
            a: <>Shows how each school is doing compared with the district as a whole,
                steadies the numbers for smaller schools so a few students can’t swing
                the picture, and measures the gap between student groups school by school.</>,
          },
          {
            q: 'How it stays private',
            a: <>Everything is figured right here in your browser. Your file is never
                uploaded to a server, and the methods note spells out exactly how the
                numbers are made.</>,
          },
          {
            q: 'What it isn’t',
            a: <>It isn’t a way to evaluate individual teachers or students. Groups too
                small to read reliably are flagged so you don’t over-interpret them. And
                the numbers describe what’s happening, not why — use them to ask sharper
                questions, not to assign blame.</>,
          },
        ]} />
      </section>
    </>
  );
}

function LandingCard({ eyebrow, title, body, cta, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: '#fff', border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '18px 18px 16px',
      display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer',
      fontFamily: FONT, transition: 'box-shadow 120ms, transform 120ms',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      <span style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 700,
                     textTransform: 'uppercase', letterSpacing: 1.0, color: SLU.mute }}>{eyebrow}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: SLU.ink, letterSpacing: -0.2 }}>{title}</span>
      <span style={{ fontSize: 13.5, lineHeight: 1.5, color: SLU.ink2, textWrap: 'pretty' }}>{body}</span>
      <span style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color: accent }}>{cta}</span>
    </button>
  );
}

function UploadPage({ ctx }) {
  const [files, setFiles] = React.useState({ ela: null, math: null });
  const [stages, setStages] = React.useState({ ela: 'idle', math: 'idle' });
  const [errors, setErrors] = React.useState({ ela: null, math: null });
  // Real pipeline: read+validate the file in DuckDB-WASM, compute the figure
  // shapes, and register them in the store. Nothing leaves the browser.
  const onFile = async (key, file) => {
    setFiles((f) => ({ ...f, [key]: file.name }));
    setStages((s) => ({ ...s, [key]: 'parsing' }));
    setErrors((e) => ({ ...e, [key]: null }));
    if (!window.GL || !window.GLIngest || !window.GLCompute || !window.GLStore) {
      setStages((s) => ({ ...s, [key]: 'idle' }));
      setErrors((e) => ({ ...e, [key]: { error: 'exception', message: 'GrowthLens didn’t finish loading. Check your internet connection and reload the page, then try again.' } }));
      return;
    }
    try {
      const conn = await window.GL.getConnection();
      const res = await window.GLIngest.loadSubjectFile(file, conn, key);
      if (!res.ok) { setStages((s) => ({ ...s, [key]: 'idle' })); setErrors((e) => ({ ...e, [key]: res })); return; }
      const shapes = await window.GLCompute.computeSlice(key);
      window.GLStore.putUploaded(key, shapes, res.meta);
      setStages((s) => ({ ...s, [key]: 'ready' }));
    } catch (err) {
      setStages((s) => ({ ...s, [key]: 'idle' }));
      setErrors((e) => ({ ...e, [key]: { error: 'exception', message: String(err) } }));
    }
  };
  const setStage = (key, v) => setStages((s) => ({ ...s, [key]: v }));
  const bothReady = stages.ela === 'ready' && stages.math === 'ready';
  const anyReady = stages.ela === 'ready' || stages.math === 'ready';
  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column',
                       alignItems: 'flex-start', gap: 8, paddingBottom: 2 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 9px', borderRadius: 4,
          background: 'rgba(0, 61, 165, 0.08)', color: SLU.blue,
          fontSize: 11, fontFamily: LABEL, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1.0, whiteSpace: 'nowrap',
        }}>Upload data</span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: SLU.ink,
                     letterSpacing: -0.3, lineHeight: 1.15, textWrap: 'balance' }}>
          Bring one file per subject from your assessment system
        </h1>
        <p style={{ margin: '4px 0 0', maxWidth: 720,
                    fontSize: 13.5, lineHeight: 1.55, color: SLU.ink2, textWrap: 'pretty' }}>
          GrowthLens works with two files — one for reading (ELA) and one for
          math. Both are read right here in your browser; nothing is uploaded.
          You can start exploring a subject the moment its file loads cleanly,
          and add the other whenever you’re ready.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <SubjectDropZone
          subjectKey="ela"
          subjectLabel="ELA"
          accent={SLU.blue}
          stage={stages.ela}
          setStage={(v) => setStage('ela', v)}
          filename={files.ela}
          onFile={onFile}
          error={errors.ela}
          placeholder="ELA growth file"
        />
        <SubjectDropZone
          subjectKey="math"
          subjectLabel="Math"
          accent={SLU.gold}
          stage={stages.math}
          setStage={(v) => setStage('math', v)}
          filename={files.math}
          onFile={onFile}
          error={errors.math}
          placeholder="Math growth file"
        />
      </div>

      {anyReady && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 8,
                      background: bothReady ? 'rgba(31, 138, 91, 0.08)' : 'rgba(154, 118, 17, 0.08)',
                      border: `1px solid ${bothReady ? 'rgba(31, 138, 91, 0.25)' : 'rgba(154, 118, 17, 0.25)'}` }}>
          <span style={{ fontSize: 13.5, color: SLU.ink2, flex: 1 }}>
            {bothReady
              ? 'Both subjects are loaded. You’re ready to open System Scan or jump straight to a Gap Analysis.'
              : `${stages.ela === 'ready' ? 'ELA' : 'Math'} is loaded — you can start exploring that subject now, or add the other file before continuing.`}
          </span>
          <button onClick={() => {
            // If only one subject is loaded, jump straight to that one rather
            // than defaulting to whatever ctx.subject was on first render.
            if (stages.ela === 'ready' && stages.math !== 'ready') ctx.setSubject('ela');
            else if (stages.math === 'ready' && stages.ela !== 'ready') ctx.setSubject('math');
            ctx.setPage('scan');
          }} style={{
            padding: '8px 14px', borderRadius: 6,
            background: SLU.blue, color: '#fff', border: 'none',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}>{bothReady
              ? 'Continue to System Scan →'
              : `Continue with ${stages.ela === 'ready' ? 'ELA' : 'Math'} →`}</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <AuxCard title="What your file should include" collapsible defaultOpen>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: SLU.mute, lineHeight: 1.5 }}>
            This is the standard Missouri DESE / MOSIS growth export — one file per subject, and
            most assessment systems can produce it. GrowthLens figures out the subject from the
            growth column’s prefix (<code style={{ fontFamily: MONO }}>{'{P}'}</code> is{' '}
            <code style={{ fontFamily: MONO }}>MATH</code> or <code style={{ fontFamily: MONO }}>COMM_ARTS</code>),
            so you don’t need a separate subject column. Column names don’t have to match upper- or
            lower-case exactly.
          </p>
          <ColumnTable rows={[
            ['{P}_Z_RESIDUAL',           'float',  'Each student’s growth compared with what was expected, on a standard scale.'],
            ['{P}_Z_RESIDUAL_SE',        'float',  'How precise that growth number is for the student.'],
            ['{P}_Z_T',                  'float',  'Where the student started — this year’s score on a standard scale.'],
            ['SCHOOL_CODE',              'string', 'Which school the student attends (one district per file).'],
            ['GRADE',                    'int',    'Grades 3–8 are supported in this version.'],
            ['GROWTH_YEAR',              'int',    'The school year. The most recent year in the file is used automatically.'],
            ['FREE_OR_REDUCED_LUNCH',    'flag',   'A simple Yes/No column for economically disadvantaged students.'],
            ['IEP_DISABILITY',           'flag',   'A simple Yes/No column for students with disabilities.'],
            ['ENGLISH_LANGUAGE_LEARNER', 'flag',   'A simple Yes/No column for English learners.'],
            ['BLACK, WHITE, HISPANIC',   'flag',   'Simple Yes/No columns used for the Black-vs-White and Hispanic-vs-White gaps.'],
          ]} />
        </AuxCard>
        <AuxCard title="Frequently asked" collapsible defaultOpen>
          <FAQ items={[
            {
              q: 'Where does my data go?',
              a: <>Nowhere. Your file is read and analyzed entirely in this browser tab — no row, name, or number ever leaves your computer. You can check this yourself: open your browser’s developer tools and you’ll see there’s no network traffic while you work.</>,
            },
            {
              q: 'Do you keep my data between sessions?',
              a: <>No. Reload the tab and the data is gone, so you’ll need to upload it again. We don’t store student records in cookies or anywhere else.</>,
            },
            {
              q: 'How big a file can I upload?',
              a: <>Up to about 50 MB per subject. Most districts — even larger ones with several years of data — land between 5 and 20 MB per file. Reading and preparing the file happens in your browser and takes just a few seconds.</>,
            },
            {
              q: 'What if my district uses a different small-group cutoff?',
              a: <>Right now GrowthLens treats any group with fewer than 10 students as too small to read reliably, and flags those groups everywhere they appear. The ability to change that number to match your district’s privacy or small-group rules is coming in a future release.</>,
            },
            {
              q: 'Want the statistical details?',
              a: <>The methods note explains how growth compared with expectations is defined, how the numbers are steadied for smaller schools (including a few cases that can feel counter-intuitive), how the spread between schools is estimated, and what the known limitations are. <a href="methods.html" target="_blank" rel="noopener" style={{ color: SLU.blue, fontWeight: 600 }}>Open methods note ↗</a></>,
            },
          ]} />
        </AuxCard>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5, color: SLU.mute, flexWrap: 'wrap' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); ctx.setPage('scan'); }}
           style={{ color: SLU.mute, textDecoration: 'underline' }}>
          Skip for now and explore the sample math data
        </a>
      </div>
    </>
  );
}

function SubjectDropZone({ subjectKey, subjectLabel, accent, stage, setStage, filename, onFile, error, placeholder }) {
  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) onFile(subjectKey, f);
    else setStage('idle');
  };
  const ready = stage === 'ready';
  const errMsg = !error ? null
    : error.error === 'subject_mismatch' ? `This is the ${subjectLabel} spot, but the file looks like ${String(error.detected || '').toUpperCase()}. Try dropping it on the other subject instead.`
    : error.error === 'missing_columns' ? 'This file is missing a few columns we need: ' + (error.missing || []).join(', ') + '. Check the “What your file should include” list and try again.'
    : error.error === 'no_prefix' ? 'We couldn’t find a growth column (one ending in *_Z_RESIDUAL). This usually means it isn’t a DESE growth file — double-check the export.'
    : error.error === 'no_rows_latest' ? `We didn’t find any students for the most recent year (${error.latestYear ?? '—'}). Make sure that year’s data is included.`
    : error.error === 'no_year' ? 'We couldn’t find a GROWTH_YEAR column, so we can’t tell which school year this is. Please add it and try again.'
    : (error.message || 'We couldn’t read this file. Please double-check it’s the right export and try again.');
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setStage('dragover'); }}
      onDragLeave={() => setStage(stage === 'dragover' ? 'idle' : stage)}
      onDrop={onDrop}
      style={{
        background: stage === 'dragover' ? 'rgba(0, 61, 165, 0.04)'
                  : ready ? '#fff' : '#fff',
        border: `2px dashed ${stage === 'dragover' ? accent : ready ? accent : SLU.rule}`,
        borderRadius: 10, padding: '22px 22px',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
        transition: 'background 120ms, border-color 120ms',
        position: 'relative',
      }}>
      <span style={{
        position: 'absolute', top: 14, right: 14,
        fontFamily: LABEL, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 1.0,
        color: errMsg ? '#B42318' : ready ? '#1F8A5B' : SLU.mute,
      }}>
        {errMsg ? '⚠ Error' : ready ? '● Loaded' : stage === 'parsing' ? 'Reading…' : stage === 'dragover' ? 'Drop to load' : 'Waiting for file'}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', borderRadius: 4,
        background: `${accent}15`, color: accent,
        fontFamily: LABEL, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 1.0,
      }}>{subjectLabel}</span>
      <span style={{ fontSize: 17, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2,
                     fontFamily: ready || stage === 'parsing' ? MONO : FONT }}>
        {ready || stage === 'parsing' ? filename : placeholder}
      </span>
      <span style={{ fontSize: 12.5, color: errMsg ? '#B42318' : SLU.mute, lineHeight: 1.5 }}>
        {errMsg
          ? errMsg
          : ready
          ? 'Looks good — your file checks out and is ready to explore.'
          : `Drop a ${subjectLabel} file here, or click to choose one. One row per student, per grade, per year.`}
      </span>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 6,
          background: ready ? '#fff' : accent,
          color: ready ? SLU.ink : '#fff',
          border: ready ? `1px solid ${SLU.rule}` : 'none',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          {ready ? 'Replace' : 'Choose file'}
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                 onChange={(e) => {
                   const f = e.target.files && e.target.files[0];
                   if (f) onFile(subjectKey, f);
                 }} />
        </label>
        {ready && (
          <button onClick={() => setStage('idle')} style={{
            padding: '7px 12px', borderRadius: 6,
            background: 'transparent', border: 'none',
            color: SLU.mute, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Remove</button>
        )}
      </div>
    </div>
  );
}

function FAQ({ items }) {
  const [open, setOpen] = React.useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${SLU.rule2}` }}>
            <button onClick={() => setOpen(isOpen ? -1 : i)}
                    style={{
                      width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 2px', background: 'transparent', border: 'none',
                      cursor: 'pointer', fontFamily: FONT,
                      fontSize: 13.5, fontWeight: 600, color: SLU.ink,
                    }}>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{it.q}</span>
              <span style={{
                fontSize: 11, color: SLU.mute, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 120ms', display: 'inline-block', width: 12, textAlign: 'center',
              }}>▶</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 2px 12px', fontSize: 13, lineHeight: 1.6,
                            color: SLU.ink2, maxWidth: 640, textWrap: 'pretty' }}>
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ColumnTable({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', columnGap: 14, rowGap: 6,
                  fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                     letterSpacing: 1, color: SLU.mute }}>Column</span>
      <span style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                     letterSpacing: 1, color: SLU.mute }}>Type</span>
      <span style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                     letterSpacing: 1, color: SLU.mute }}>Notes</span>
      {rows.map(([col, type, note]) => (
        <React.Fragment key={col}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: SLU.ink }}>{col}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: SLU.mute }}>{type}</span>
          <span style={{ color: SLU.ink2 }}>{note}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function GapPage({ sliceLabel, ctx }) {
  // Subject is fixed to ELA while only ELA data exists — see SUBJECTS comment above.
  return (
    <>
      <BriefHeader eyebrow="Gap Analysis" slice={sliceLabel}
                   title="Where the gap lives, school by school"
                   blurb={'For the two groups you choose, GrowthLens measures the gap between them at every school and lines the schools up from largest to smallest. You’ll see how big each gap is and which way it leans, the district-wide average for context, and which schools have too few students to read reliably. Use it to tell whether a gap shows up across the system or sits in just a few schools.'} />
      <ControlsCard title="Controls" slice={sliceLabel}><GapControls ctx={ctx} /></ControlsCard>
      <OverviewCardGap />
      <ForestSlot ctx={ctx} />
    </>
  );
}
function ScanPage({ sliceLabel, ctx }) {
  return (
    <>
      <BriefHeader eyebrow="System Scan" slice={sliceLabel}
                   title="Where to look first"
                   blurb={'A district-wide view of how each grade is doing at each school, compared with what the district average would predict. Blue cells are growing faster than expected, rust cells slower. Scan the rows for schools that are consistently strong or soft, and the columns for grades where the whole district is ahead or behind — then dig into a specific subject and group in Gap Analysis.'} />
      <ControlsCard title="Controls" slice={sliceLabel}><ScanControls ctx={ctx} /></ControlsCard>
      <OverviewCardScan />
      <HeatmapSlot ctx={ctx} />
    </>
  );
}

// ---- CARD SHELL -------------------------------------------------------------
// Auxiliary cards (slice + controls) use a lighter title rule than the figure
// card. Gold rule stays reserved for the primary figure card.
function AuxCard({ title, children, padTop, collapsible, defaultOpen = true, headerExtra,
                   open: openProp, onToggle }) {
  // Supports both uncontrolled (internal state via defaultOpen) and controlled
  // (open prop + onToggle callback) modes so a parent can drive collapse from
  // scroll position or other external signals.
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = React.useState(defaultOpen);
  const open = isControlled ? openProp : openState;
  const toggle = () => {
    if (isControlled) { if (onToggle) onToggle(); }
    else { setOpenState(o => !o); }
  };
  return (
    <section style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
      padding: open ? '14px 20px 18px' : '12px 20px',
      transition: 'padding 140ms ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10.5, fontFamily: LABEL, color: SLU.ink2,
        textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700,
        paddingBottom: open ? 8 : 0,
        marginBottom: open ? (padTop ? padTop : 14) : 0,
        borderBottom: open ? `1px solid ${SLU.rule2}` : 'none',
        cursor: collapsible ? 'pointer' : 'default',
        userSelect: 'none',
        gap: 12,
      }}
      onClick={collapsible ? toggle : undefined}
      role={collapsible ? 'button' : undefined}
      aria-expanded={collapsible ? open : undefined}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {collapsible && (
            <span aria-hidden="true" style={{
              display: 'inline-block',
              fontSize: 9, color: SLU.mute,
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 140ms ease',
              width: 10, textAlign: 'center', lineHeight: 1,
            }}>▶</span>
          )}
          <span>{title}</span>
        </span>
        {headerExtra}
      </div>
      {open && children}
    </section>
  );
}
function ControlsCard({ title, slice, children }) {
  // Sticky to viewport top so controls stay reachable while scrolling long
  // figures (forest / heatmap). The slice strip pinned above keeps subject /
  // subgroup context visible even when the BriefHeader has scrolled away.
  //
  // Auto-collapse once when the user first scrolls down past the top, and
  // re-open as a pair when they return near the top. Manual click overrides
  // until the next auto-cycle: if the user manually collapsed at the top
  // (no auto-collapse latched), scrolling away won't re-collapse and coming
  // back won't force-open. Tab changes scroll to top in AppBody, which fires
  // this handler and naturally resets the card to its open state.
  const [open, setOpen] = React.useState(true);
  const hasAutoCollapsed = React.useRef(false);
  React.useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      if (y < 8) {
        if (hasAutoCollapsed.current) {
          hasAutoCollapsed.current = false;
          setOpen(true);
        }
      } else if (!hasAutoCollapsed.current && y > 80) {
        hasAutoCollapsed.current = true;
        setOpen(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const headerTitle = slice
    ? <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
        <span>{title}</span>
        <span style={{ fontSize: 10.5, fontFamily: LABEL, letterSpacing: 1.0,
                        textTransform: 'uppercase', color: SLU.mute, fontWeight: 700 }}>·</span>
        <span style={{ fontSize: 11, fontFamily: LABEL, letterSpacing: 1.0,
                        textTransform: 'uppercase', color: SLU.blue, fontWeight: 700 }}>{slice}</span>
      </span>
    : title;
  return (
    <div style={{
      position: 'sticky', top: 12, zIndex: 20,
      background: 'transparent',
      boxShadow: '0 6px 14px rgba(15,23,42,.05), 0 1px 2px rgba(15,23,42,.04)',
      borderRadius: 8,
    }}>
      <AuxCard title={headerTitle} collapsible open={open} onToggle={() => setOpen(o => !o)}>{children}</AuxCard>
    </div>
  );
}

// ---- OVERVIEW CARD ----------------------------------------------------------
// District-level numeric context for the current slice. Sits between the
// Controls card and the figure — a quick "what does the district look like in
// aggregate" reference before drilling into school-level detail.
function OverviewCardGap() {
  const data = window.GAPS_DATA;
  if (!data) return null;
  const { meta, schools } = data;
  const tauSD = Math.sqrt(Math.max(0, meta.tauSquared));
  const ds = window.GLStore && window.GLStore.getActiveMeta();
  const yr = (ds && (ds.latestYear || ds.year)) || '2024–25';

  return (
    <AuxCard collapsible title={`Overview · ${meta.subject.toUpperCase()} · ${meta.groupA} − ${meta.groupB} · ${yr}`}>
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        gap: '20px 32px', alignItems: 'flex-start',
      }}>
        {/* District gap */}
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <StatLabel>District-wide gap</StatLabel>
          {(() => {
            const re = (window.districtMeanRE && window.districtMeanRE(schools, meta.tauSquared)) || null;
            const mu = re ? re.mu : meta.districtGap;
            const sign = mu >= 0 ? '+' : '−';
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                                  color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
                    {sign}{Math.abs(mu).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 13, color: SLU.mute, fontWeight: 500 }}>SD</span>
                </div>
                {re && (
                  <div style={{ fontSize: 11, color: SLU.mute, marginTop: 4, fontFamily: MONO }}>
                    95% CI [{re.ciLo >= 0 ? '+' : '−'}{Math.abs(re.ciLo).toFixed(2)}, {re.ciHi >= 0 ? '+' : '−'}{Math.abs(re.ciHi).toFixed(2)}]
                  </div>
                )}
                <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
                  mean({meta.groupA}) − mean({meta.groupB}) · average gap across schools, giving steadier schools more weight
                </div>
              </>
            );
          })()}
        </div>

        {/* Between-school spread with mini strip */}
        <div style={{ flex: '2 1 380px', minWidth: 320 }}>
          <StatLabel>How much schools really differ</StatLabel>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 22, color: SLU.mute, fontFamily: MONO, lineHeight: 1 }}>±</span>
                <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                                color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
                  {tauSD.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, color: SLU.mute }}>SD</span>
              </div>
              <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6 }}>
                between schools only
              </div>
            </div>
            <DistributionStrip schools={schools} districtGap={meta.districtGap} tauSD={tauSD} />
          </div>
          <div style={{ fontSize: 11, color: SLU.mute, marginTop: 8, lineHeight: 1.4, maxWidth: 540 }}>
            Each dot is one school’s shrunken gap — its number nudged toward the district average so a few students can’t swing it. The gold band shows the range where most schools should fall if the spread is real.
          </div>
        </div>

        {/* Coverage */}
        <div style={{ flex: '1 1 180px', minWidth: 160 }}>
          <StatLabel>Schools with enough students</StatLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                            color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
              {meta.nMeetingThreshold}
            </span>
            <span style={{ fontSize: 16, color: SLU.mute, fontFamily: MONO }}>
              / {meta.nSchools}
            </span>
          </div>
          <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
            at least {meta.minCellSize} students per group
          </div>
        </div>
      </div>
    </AuxCard>
  );
}

function DistributionStrip({ schools, districtGap, tauSD }) {
  const width = 320, height = 56;
  // Auto-range from data so dots never silently clamp to the edge.
  const gaps = schools.map(s => s.shrunk_gap);
  const dataMin = Math.min(districtGap - tauSD, ...gaps);
  const dataMax = Math.max(districtGap + tauSD, ...gaps);
  const pad = Math.max(0.08, (dataMax - dataMin) * 0.12);
  const min = Math.floor((dataMin - pad) * 20) / 20;
  const max = Math.ceil ((dataMax + pad) * 20) / 20;
  const x = (g) => ((g - min) / (max - min)) * width;
  const y = height / 2 - 4;
  const bandLo = x(districtGap - tauSD);
  const bandHi = x(districtGap + tauSD);
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <rect x={bandLo} y={y - 9} width={bandHi - bandLo} height={18}
            fill={SLU.gold} fillOpacity={0.18}
            stroke={SLU.gold} strokeOpacity={0.5} strokeWidth={1} rx={2} />
      <line x1={x(districtGap)} x2={x(districtGap)} y1={y - 12} y2={y + 12}
            stroke={SLU.gold} strokeWidth={1.4} />
      <line x1={0} x2={width} y1={y + 16} y2={y + 16} stroke={SLU.rule} strokeWidth={1} />
      {(() => {
        // Build ~4 nice ticks across the [min, max] range
        const span = max - min;
        const step = span > 1.4 ? 0.5 : span > 0.6 ? 0.25 : 0.1;
        const start = Math.ceil(min / step) * step;
        const out = [];
        for (let t = start; t <= max + 1e-6; t += step) out.push(Math.round(t * 100) / 100);
        return out;
      })().map(t => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={y + 14} y2={y + 18} stroke={SLU.mute} strokeWidth={1} />
          <text x={x(t)} y={y + 28} fontSize={9} fontFamily={MONO} fill={SLU.mute} textAnchor="middle">
            {t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2)}
          </text>
        </g>
      ))}
      <text x={x(districtGap)} y={y - 14} fontSize={9} fontFamily={FONT} fill={SLU.gold}
            textAnchor="middle" fontWeight={600}>
        district +{districtGap.toFixed(2)}
      </text>
      {schools.map(s => {
        const cx = Math.max(3, Math.min(width - 3, x(s.shrunk_gap)));
        const inside = s.shrunk_gap >= districtGap - tauSD && s.shrunk_gap <= districtGap + tauSD;
        return (
          <circle key={s.school_id} cx={cx} cy={y} r={3}
                  fill={inside ? SLU.mute : SLU.ink}
                  fillOpacity={inside ? 0.55 : 0.95} />
        );
      })}
    </svg>
  );
}

// ---- OVERVIEW CARD (SCAN) ---------------------------------------------------
// One cell per grade — same box vocabulary as the heatmap, but summarized.
// District-level mean residual is ~0 by construction, so we don't color-encode
// here; cells show the grade and student count, with overall coverage on the
// left as a sister stat block.
function OverviewCardScan() {
  const data = window.HEATMAP_DATA;
  if (!data) return null;
  const grades = ['3', '4', '5', '6', '7', '8'];

  const color = window.divColor || (() => '#fff');
  const byGrade = grades.map(g => {
    const cells = data.schools
      .map(s => s.grades[g])
      .filter(c => c && c.ok);
    const n = cells.reduce((acc, c) => acc + c.n, 0);
    const schoolCount = cells.length;
    // n-weighted mean residual across schools at this grade
    const mean = n > 0
      ? cells.reduce((acc, c) => acc + c.r * c.n, 0) / n
      : 0;
    return { g, n, schoolCount, mean };
  });

  const totalN = byGrade.reduce((a, b) => a + b.n, 0);
  const totalSchools = data.schools.length;
  const ds = window.GLStore && window.GLStore.getActiveMeta();
  const yr = (ds && (ds.latestYear || ds.year)) || '2024–25';

  return (
    <AuxCard collapsible title={`Overview · ${data.meta.subject.toUpperCase()} · how each grade is doing · ${yr}`}>
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        gap: '20px 36px', alignItems: 'flex-start',
      }}>
        {/* Coverage summary */}
        <div style={{ flex: '0 0 auto', minWidth: 160 }}>
          <StatLabel>Schools included</StatLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                            color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
              {totalSchools}
            </span>
            <span style={{ fontSize: 13, color: SLU.mute }}>schools</span>
          </div>
          <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, fontFamily: MONO, lineHeight: 1.5 }}>
            {totalN.toLocaleString()} students<br/>grades 3–8 · {data.meta.subject.toUpperCase()} MAP
          </div>
        </div>

        {/* Per-grade cells — one box per grade */}
        <div style={{ flex: '1 1 520px', minWidth: 380 }}>
          <StatLabel>Average growth by grade <span style={{ textTransform: 'none', fontWeight: 500, color: SLU.mute }}>— compared with the district average (SD)</span></StatLabel>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, marginTop: 8 }}>
            {byGrade.map(({ g, n, schoolCount, mean }) => {
              const abs = Math.abs(mean).toFixed(2);
              const above = mean >= 0;
              // Same glyph-color rule as HeatmapH1: invert to white when the
              // diverging fill is dark enough that the brand pos/neg ink loses
              // contrast (past the heatmap's SCALE_DARK threshold).
              const glyphColor = Math.abs(mean) > (window.HEATMAP_SCALE_DARK || 0.18)
                ? '#fff'
                : (above ? SLU.pos : SLU.neg);
              return (
                <div key={g} style={{
                  flex: '1 1 0', minWidth: 60,
                  background: color(mean),
                  border: `1px solid ${SLU.rule}`,
                  padding: '12px 10px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-start', justifyContent: 'space-between',
                  minHeight: 96,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: SLU.mute,
                                 fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Grade {g}
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 600, fontFamily: MONO,
                                   color: SLU.ink, letterSpacing: -0.5, lineHeight: 1,
                                   display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ color: glyphColor, fontSize: 14, lineHeight: 1 }}>
                        {above ? '▲' : '▼'}
                      </span>
                      <span>{abs}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: SLU.mute, marginLeft: 2 }}>SD</span>
                    </div>
                    <div style={{ fontSize: 10, color: SLU.mute, fontFamily: MONO, marginTop: 4 }}>
                      n={n.toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AuxCard>
  );
}

function StatLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontFamily: LABEL, color: SLU.mute,
                   textTransform: 'uppercase', letterSpacing: 1.0,
                   fontWeight: 700, marginBottom: 8 }}>
      {children}
    </div>
  );
}

// ---- CONTROL ATOMS ----------------------------------------------------------
function GHead({ children }) {
  return (
    <div style={{ fontSize: 10.5, fontFamily: LABEL, color: SLU.mute,
                   textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700,
                   marginBottom: 10 }}>
      {children}
    </div>
  );
}
function CGroup({ title, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <GHead>{title}</GHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}
function CLabel({ children, hint }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 10, fontFamily: LABEL, color: SLU.mute,
                  textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
      <span>{children}</span>
      {hint && (
        <span title={hint} aria-label={hint} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 13, height: 13, borderRadius: '50%',
          border: `1px solid ${SLU.rule}`, background: '#fff',
          fontSize: 8.5, fontWeight: 700, fontFamily: FONT,
          color: SLU.mute, cursor: 'help', textTransform: 'none',
          letterSpacing: 0,
        }}>i</span>
      )}
    </div>
  );
}
function CSegmented({ value, onChange, options, label, hint, optionHints, disabledKeys = [] }) {
  // Roving-tabindex radiogroup: only the active option is in the tab order,
  // ←/→ (and ↑/↓) move and select within the group, Home/End jump to ends.
  const keys = Object.keys(options);
  const refs = React.useRef({});
  const onKey = (e) => {
    const nav = keys.filter((k) => !disabledKeys.includes(k));
    const i = nav.indexOf(value);
    if (i < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = nav[(i + 1) % nav.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = nav[(i - 1 + nav.length) % nav.length];
    else if (e.key === 'Home') next = nav[0];
    else if (e.key === 'End') next = nav[nav.length - 1];
    if (next) {
      e.preventDefault();
      onChange(next);
      requestAnimationFrame(() => refs.current[next] && refs.current[next].focus());
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <CLabel hint={hint}>{label}</CLabel>
      <div role="radiogroup" aria-label={label} onKeyDown={onKey}
           style={{ display: 'inline-flex', background: SLU.rule2, borderRadius: 6, padding: 2 }}>
        {keys.map((k) => {
          const v = options[k];
          const active = value === k;
          const optHint = optionHints && optionHints[k];
          const isDisabled = disabledKeys.includes(k);
          return (
            <button key={k} role="radio" aria-checked={active}
                    aria-disabled={isDisabled || undefined}
                    disabled={isDisabled}
                    tabIndex={active ? 0 : -1}
                    ref={(el) => { refs.current[k] = el; }}
                    onClick={() => { if (!isDisabled) onChange(k); }}
                    title={isDisabled ? 'Upload this subject’s file to turn it on' : optHint}
                    style={{
                      flex: 1, border: 'none',
                      background: active ? '#fff' : 'transparent',
                      color: isDisabled ? SLU.mute : active ? SLU.ink : SLU.ink2,
                      padding: '6px 10px', borderRadius: 4,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.45 : 1,
                      fontSize: 12, fontWeight: active ? 600 : 500,
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${SLU.blue}`; }}
                    onBlur={(e) => { e.currentTarget.style.boxShadow = active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'; }}>
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function CSelect({ value, onChange, options, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <CLabel>{label}</CLabel>
      <select value={value} onChange={e => onChange(e.target.value)}
              style={{
                fontFamily: FONT, fontSize: 12, color: SLU.ink, padding: '7px 24px 7px 9px',
                border: `1px solid ${SLU.rule}`, borderRadius: 6, background: '#fff',
                cursor: 'pointer', width: '100%',
              }}>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

// Controls cards lay out their groups in a horizontal grid. Each group keeps
// its label + a vertical stack of its individual controls. Wraps at narrow
// widths so groups never crush into one another.
function ControlsGrid({ children, columns = 3 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
      gap: 28,
    }}>{children}</div>
  );
}

const METHOD_OPTS = { shrunk: 'Shrunken', raw: 'Raw' };
const METHOD_HINT = 'How each school’s number is figured. Shrunken gently pulls schools with less data toward the district average, so a handful of students can’t swing the result — steadier for small schools, but less extreme. Raw shows each school’s own number exactly as measured: honest, but jumpier when only a few students are involved.';
const METHOD_OPT_HINTS = {
  shrunk: 'Shrunken: schools with fewer students are nudged toward the district average, so their numbers are steadier but less extreme.',
  raw: 'Raw: each school’s own number, exactly as measured — honest about its data, but jumpier when only a few students are involved.',
};
const UNIT_HINT = 'How to show the numbers. SD is a standard scale compared with the district average. Weeks converts that into about how many weeks of learning it represents, using Missouri MAP growth norms.';

const SORTS_FALLBACK = {
  gap_desc: 'Gap (largest first)',
  gap_asc:  'Gap (smallest first)',
  alpha:    'School (A–Z)',
  n_desc:   'Sample size',
};
const THRESH_FALLBACK = {
  inline:  'Mark in place (dimmed)',
  section: 'Group at the bottom',
  hide:    'Hide',
};

function flattenOptionMap(map, fallback) {
  if (!map) return fallback;
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = (v && typeof v === 'object') ? (v.label ?? String(k)) : v;
  }
  return out;
}
function GapControls({ ctx }) {
  const sortOpts   = flattenOptionMap(window.SORTS_FINAL,     SORTS_FALLBACK);
  const threshOpts = flattenOptionMap(window.THRESHOLD_MODES, THRESH_FALLBACK);
  return (
    <ControlsGrid>
      <CGroup title="Show">
        <CSegmented value={ctx.subject} onChange={ctx.setSubject} options={SUBJECTS} label="Subject" disabledKeys={ctx.disabledSubjects} />
        <CSelect value={ctx.demo} onChange={ctx.setDemo} options={DEMOS} label="Groups to compare" />
      </CGroup>
      <CGroup title="How it’s figured">
        <CSegmented value={ctx.estimate} onChange={ctx.setEstimate}
                    options={METHOD_OPTS} label="Method"
                    hint={METHOD_HINT} optionHints={METHOD_OPT_HINTS} />
        <CSegmented value={ctx.unit} onChange={ctx.setUnit}
                    options={{ z: 'SD', weeks: 'Weeks' }} label="Units"
                    hint={UNIT_HINT} />
      </CGroup>
      <CGroup title="Order">
        <CSelect value={ctx.forestSort} onChange={ctx.setForestSort}
                 options={sortOpts} label="Sort" />
        <CSelect value={ctx.threshold} onChange={ctx.setThreshold}
                 options={threshOpts} label="Small groups" />
      </CGroup>
    </ControlsGrid>
  );
}
function ScanControls({ ctx }) {
  return (
    <ControlsGrid>
      <CGroup title="Show">
        <CSegmented value={ctx.subject} onChange={ctx.setSubject} options={SUBJECTS} label="Subject" disabledKeys={ctx.disabledSubjects} />
      </CGroup>
      <CGroup title="Units">
        <CSegmented value={ctx.unit} onChange={ctx.setUnit}
                    options={{ z: 'SD', weeks: 'Weeks' }} label="Units"
                    hint={UNIT_HINT} />
      </CGroup>
    </ControlsGrid>
  );
}

// ---- SLOTS ------------------------------------------------------------------
function ForestSlot({ ctx }) {
  if (window.ForestFinal) return (
    <window.ForestFinal
      estimate={ctx.estimate}
      unit={ctx.unit}
      sort={ctx.forestSort}
      setSort={ctx.setForestSort}
      threshold={ctx.threshold}
      setThreshold={ctx.setThreshold}
    />
  );
  return <PlaceholderCard label="Forest plot" h={680} />;
}
function HeatmapSlot({ ctx }) {
  if (window.HeatmapH1) return <window.HeatmapH1 estimate={ctx.estimate} unit={ctx.unit} />;
  return <PlaceholderCard label="Heatmap (H1)" h={820} />;
}
function PlaceholderCard({ label, h }) {
  return (
    <div style={{
      background: '#fff', border: `1px dashed ${SLU.rule}`, borderRadius: 8,
      height: h, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: SLU.mute, fontSize: 13,
    }}>{label}</div>
  );
}

// Expose shared helpers so demographics.jsx / achievement.jsx (and any other
// page modules loaded after the shell) can reuse the same chrome.
window.AppBody = AppBody;
window.BriefHeader = BriefHeader;
window.ControlsCard = ControlsCard;
window.AuxCard = AuxCard;
window.ControlsGrid = ControlsGrid;
window.CGroup = CGroup;
window.CLabel = CLabel;
window.CSelect = CSelect;
window.CSegmented = CSegmented;
window.SUBJECTS = SUBJECTS;
window.DEMOS = DEMOS;
window.METHOD_OPTS = METHOD_OPTS;
window.METHOD_HINT = METHOD_HINT;
window.METHOD_OPT_HINTS = METHOD_OPT_HINTS;
window.UNIT_HINT = UNIT_HINT;
