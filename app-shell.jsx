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

// App body sketch v7 ----------------------------------------------------------
// Global analysis settings (subject / units / method) live in the sidebar's
// Analysis panel and persist to localStorage; per-figure options (compare,
// group, view, level) live on each figure card. There is no Controls card.
//
// Layout is a simple two-column grid: LeftNav | main column.

// Subject toggle is live across all screens. Figure data is swapped behind the
// window.* globals by engine/store.js (GLStore): the bundled fixtures are the
// Math sample, and ANY real upload suppresses the sample entirely (real and
// sample data never coexist). A subject is unavailable until its file loads.
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
  landing:      { label: 'Overview',             hint: 'Start here · add data' },
  scan:         { label: 'System Scan',          hint: 'Where to look first' },
  achievement:  { label: 'Status & Growth',      hint: 'Score vs. growth' },
  demographics: { label: 'Demographics',         hint: 'Growth by group' },
  gap:          { label: 'Gap Analysis',         hint: 'Compare two groups'  },
  exportpg:     { label: 'Export',               hint: 'Download a deck' },
  resources:    { label: 'Resources',            hint: 'Evidence for next steps' },
};

// Global analysis settings persist across sessions. UI preferences only —
// no student data ever touches storage, so the privacy promise is intact.
const ANALYSIS_PREFS_KEY = 'gl-analysis-v1';
function loadAnalysisPrefs() {
  try { return JSON.parse(localStorage.getItem(ANALYSIS_PREFS_KEY) || '{}') || {}; }
  catch { return {}; }
}

function AppBody() {
  const [page, setPage]           = React.useState('landing');
  const [subject, setSubjectState] = React.useState(() =>
    loadAnalysisPrefs().subject === 'ela' ? 'ela' : 'math');
  const [demo, setDemo] = React.useState(() => {
    const d = loadAnalysisPrefs().demo;
    return DEMOS[d] ? d : 'frl';
  });
  const [estimate, setEstimate] = React.useState(() =>
    loadAnalysisPrefs().estimate === 'raw' ? 'raw' : 'shrunk');
  const [unit, setUnit] = React.useState(() =>
    loadAnalysisPrefs().unit === 'weeks' ? 'weeks' : 'z');
  // scanSort is no longer in ctx — HeatmapH1 manages its own column-click sort.
  // demoVar is gone too — Demographics shows every group at once.
  const [achLevel, setAchLevel]   = React.useState('school');
  const [achShowMeans, setAchShowMeans] = React.useState(true);
  // Bumped by the Upload page when data lands or is removed, so the shell
  // (DatasetStrip, store re-pointing, availability) refreshes without waiting
  // for a navigation.
  const [, setDataRev] = React.useState(0);
  const bumpDataRev = React.useCallback(() => setDataRev((r) => r + 1), []);

  // Seed the bundled Math demo once (reads the window.* fixtures), then point
  // the well-known window.* globals at the active (subject, subgroup) via the
  // store. Pages are re-keyed on `subject` so figures re-read the swapped globals.
  React.useEffect(() => { if (window.GLStore) window.GLStore.seedDemo(); }, []);
  if (window.GLStore) { window.GLStore.setActiveSubject(subject); window.GLStore.setActiveSubgroup(demo); }
  // Only allow switching to a subject the store actually has (demo is Math-only;
  // ELA becomes available once an ELA file is uploaded). Guards the no-op toggle.
  const setSubject = (s) => { if (!window.GLStore || window.GLStore.available(s)) setSubjectState(s); };
  // Drive the SD ↔ weeks-of-learning conversion off the active subject — and the
  // active dataset's growth year once a real file is loaded — so forest-shared's
  // fmtVal / zToWeeks pick up the right effect-size factor without each call
  // site having to thread it through props.
  const activeMeta = window.GLStore && window.GLStore.getActiveMeta();
  window.WOL_OPTS = {
    year: activeMeta && typeof activeMeta.latestYear === 'number' ? activeMeta.latestYear : 2025,
    subject,
  };

  // Scroll to the top whenever the user changes analysis tabs so the new
  // page reads from its header.
  React.useEffect(() => { window.scrollTo(0, 0); }, [page]);
  // Title tracks the page for history / bookmarks / screen readers.
  React.useEffect(() => {
    document.title = page === 'landing' ? 'GrowthLens' : `${PAGES[page].label} · GrowthLens`;
  }, [page]);

  // Subjects the store can't render yet are greyed in the toggle (demo is
  // Math-only; ELA enables once its file uploads). Never grey the active one.
  const disabledSubjects = Object.keys(SUBJECTS).filter(
    (s) => s !== subject && !(window.GLStore && window.GLStore.available(s)),
  );

  // Persist the analysis settings; failure (private mode) just means no restore.
  React.useEffect(() => {
    try { localStorage.setItem(ANALYSIS_PREFS_KEY, JSON.stringify({ subject, unit, estimate, demo })); }
    catch { /* ignore */ }
  }, [subject, unit, estimate, demo]);
  // A subject the store can't serve snaps to one it can — a persisted 'ela'
  // with the Math-only sample, or 'math' right after an ELA upload suppresses
  // the sample. Never dead-end on "No data".
  React.useEffect(() => {
    if (!window.GLStore || window.GLStore.available(subject)) return;
    const fallback = ['math', 'ela'].find((s) => window.GLStore.available(s));
    if (fallback && fallback !== subject) setSubjectState(fallback);
  });

  // Same idea for subgroups: the demo ships only the FRL slice, so the other
  // four "Groups to compare" options are disabled rather than silently showing
  // FRL data under the wrong header. Snap back if the active one vanishes
  // (e.g. removing an upload returns to the FRL-only demo).
  const availableDemos = (window.GLStore && window.GLStore.availableSubgroups()) || Object.keys(DEMOS);
  const disabledDemos = Object.keys(DEMOS).filter(
    (k) => k !== demo && availableDemos.length > 0 && !availableDemos.includes(k),
  );
  React.useEffect(() => {
    if (!window.GLStore) return;
    const avail = window.GLStore.availableSubgroups();
    if (avail.length && !avail.includes(demo)) setDemo(avail.includes('frl') ? 'frl' : avail[0]);
  });

  const ctx = {
    page, setPage, subject, setSubject, disabledSubjects, demo, setDemo, disabledDemos,
    estimate, setEstimate, unit, setUnit,
    achLevel, setAchLevel,
    achShowMeans, setAchShowMeans,
    bumpDataRev,
  };

  const sliceLabel = `${SUBJECTS[subject]} · ${DEMOS[demo].split(' · ')[0]}`;
  // Scan / Demographics / Status & Growth don't slice by subgroup, so their
  // headers show the subject only — the full slice label belongs to Gap Analysis.
  const subjectLabel = SUBJECTS[subject];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px minmax(0, 1fr)',
      minHeight: '100vh',
      background: SLU.bg,
      fontFamily: FONT,
    }}>
      <LeftNav page={page} setPage={setPage} ctx={ctx} />
      <main style={{ minWidth: 0, padding: '22px 28px 40px', display: 'flex',
                     flexDirection: 'column', gap: 20 }}>
        {(page === 'landing' || page === 'scan' || page === 'gap' || page === 'demographics' || page === 'achievement' || page === 'resources' || page === 'exportpg') && <DatasetStrip />}
        {page === 'landing'      && <OverviewPage ctx={ctx} />}
        <div key={subject + ':' + demo} style={{ display: 'contents' }}>
          {page === 'scan'         && <ScanPage sliceLabel={subjectLabel} ctx={ctx} />}
          {page === 'gap'          && <GapPage sliceLabel={sliceLabel} ctx={ctx} />}
        </div>
        {/* Achievement & Demographics render OUTSIDE the subject-keyed wrapper
            so their SVG geometry stays mounted across ELA↔Math toggles and
            elements can tween between positions instead of re-mounting. */}
        {page === 'demographics' && window.DemographicsPage && <window.DemographicsPage sliceLabel={subjectLabel} ctx={ctx} />}
        {page === 'achievement'  && window.AchievementPage  && <window.AchievementPage  sliceLabel={subjectLabel} ctx={ctx} />}
        {page === 'resources'    && window.ResourcesPage    && <window.ResourcesPage    ctx={ctx} />}
        {page === 'exportpg'     && window.ExportPage       && <window.ExportPage       ctx={ctx} />}
      </main>
    </div>
  );
}

// ---- LEFT NAV ---------------------------------------------------------------
function LeftNav({ page, setPage, ctx }) {
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

      <AnalysisPanel ctx={ctx} />

      {/* Secondary nav */}
      <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 1,
                     borderTop: `1px solid ${SLU.rule2}`, marginTop: 8, paddingTop: 14 }}>
        <NavItem label="Methods note" href="methods.html" external />
      </div>

      <span style={{ flex: 1 }} />
    </aside>
  );
}

// Global analysis settings — subject, units, method — live in the sidebar so
// the state that changes what every figure means is always visible. Per-figure
// options live on the figure cards themselves.
function AnalysisPanel({ ctx }) {
  return (
    <div style={{ padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: 12,
                   borderTop: `1px solid ${SLU.rule2}`, marginTop: 8 }}>
      <div style={{ fontSize: 10, fontFamily: LABEL, color: SLU.mute,
                     textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
        Analysis
      </div>
      <CSegmented value={ctx.subject} onChange={ctx.setSubject} options={SUBJECTS}
                  label="Subject" disabledKeys={ctx.disabledSubjects} />
      <CSegmented value={ctx.unit} onChange={ctx.setUnit}
                  options={{ z: 'SD', weeks: 'Weeks' }} label="Units" hint={UNIT_HINT} />
      <CSegmented value={ctx.estimate} onChange={ctx.setEstimate}
                  options={METHOD_OPTS} label="Method"
                  hint={METHOD_HINT} optionHints={METHOD_OPT_HINTS} />
    </div>
  );
}

function NavItem({ label, href, external, placeholder, soon }) {
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
  const isDemo = m && m.source !== 'uploaded';
  const rest = m
    ? `${m.districtCode ? m.districtCode + ' · ' : ''}`
      + `${m.source === 'uploaded' ? m.subject.toUpperCase() + ' upload · ' : ''}`
      + `${m.nSchools} school${m.nSchools === 1 ? '' : 's'}${yr ? ' · ' + yr : ''}`
    : 'No data loaded yet';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, fontSize: 11.5, color: SLU.mute, fontFamily: MONO,
                  flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                     whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {/* Sample data gets a real badge — tiny gray mono was easy to miss,
            and screenshots of synthetic data shouldn't pass for real numbers. */}
        {isDemo && (
          <span style={{ padding: '2px 7px', borderRadius: 4, fontFamily: LABEL,
                         fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
                         textTransform: 'uppercase',
                         background: 'rgba(154, 118, 17, 0.14)', color: '#7A5D0E' }}>
            Sample data
          </span>
        )}
        <span>{rest}</span>
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
// Overview = the old landing + upload pages in one place: the pitch, the drop
// zones, where to go next, and the file/privacy reference. Everything a first
// visit needs without a second stop.

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

function OverviewPage({ ctx }) {
  // Seed from the store so navigating away and back doesn't show "Waiting for
  // file" over data that is still loaded and driving every figure.
  const upMeta = (k) => (window.GLStore && window.GLStore.getUploadedMeta) ? window.GLStore.getUploadedMeta(k) : null;
  const [files, setFiles] = React.useState(() => ({
    ela: (upMeta('ela') || {}).filename || null,
    math: (upMeta('math') || {}).filename || null,
  }));
  const [stages, setStages] = React.useState(() => ({
    ela: upMeta('ela') ? 'ready' : 'idle',
    math: upMeta('math') ? 'ready' : 'idle',
  }));
  const [errors, setErrors] = React.useState({ ela: null, math: null });
  // Per-zone note shown under the "Looks good" line (e.g. rows outside grades
  // 3–8 that were set aside). Seeded from the store like files/stages.
  const [notes, setNotes] = React.useState(() => {
    const note = (k) => {
      const m = upMeta(k);
      return m && m.nDroppedGrades > 0
        ? `${m.nDroppedGrades.toLocaleString()} rows outside grades 3–8 were set aside.` : null;
    };
    return { ela: note('ela'), math: note('math') };
  });
  // Ignore a second file dropped on a slot while its first is still parsing —
  // two computeSlice runs racing on the same t_<subject> table would interleave.
  const inFlight = React.useRef({ ela: false, math: false });
  // Real pipeline: read+validate the file in DuckDB-WASM, compute the figure
  // shapes, and register them in the store. Nothing leaves the browser.
  const onFile = async (key, file) => {
    if (inFlight.current[key]) return;
    inFlight.current[key] = true;
    try {
      setFiles((f) => ({ ...f, [key]: file.name }));
      setErrors((e) => ({ ...e, [key]: null }));
      if (file.size > 50 * 1024 * 1024) {
        // Matches the FAQ's promised "up to about 50 MB" limit.
        setStages((s) => ({ ...s, [key]: 'idle' }));
        setErrors((e) => ({ ...e, [key]: { error: 'too_large', message: 'That file is over the 50 MB limit. Most district exports land between 5 and 20 MB — double-check this is one subject for one district.' } }));
        return;
      }
      setStages((s) => ({ ...s, [key]: 'parsing' }));
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
        window.GLStore.putUploaded(key, shapes, { ...res.meta, filename: file.name });
        setNotes((n) => ({
          ...n,
          [key]: res.meta.nDroppedGrades > 0
            ? `${res.meta.nDroppedGrades.toLocaleString()} rows outside grades 3–8 were set aside.` : null,
        }));
        setStages((s) => ({ ...s, [key]: 'ready' }));
        ctx.bumpDataRev();   // re-render the shell so the DatasetStrip & globals refresh now
      } catch (err) {
        setStages((s) => ({ ...s, [key]: 'idle' }));
        setErrors((e) => ({ ...e, [key]: { error: 'exception', message: String(err) } }));
      }
    } finally {
      inFlight.current[key] = false;
    }
  };
  const setStage = (key, v) => setStages((s) => ({ ...s, [key]: v }));
  // Really remove an upload: forget it in the store (figures fall back to the
  // demo, or the subject disables), keep React's subject/subgroup in step, and
  // clear the student-level rows out of DuckDB.
  const onRemove = async (key) => {
    setFiles((f) => ({ ...f, [key]: null }));
    setStages((s) => ({ ...s, [key]: 'idle' }));
    setErrors((e) => ({ ...e, [key]: null }));
    setNotes((n) => ({ ...n, [key]: null }));
    if (window.GLStore) {
      window.GLStore.removeUploaded(key);
      if (ctx.subject === key && !window.GLStore.available(key)) ctx.setSubject('math');
      const avail = window.GLStore.availableSubgroups();
      if (avail.length && !avail.includes(ctx.demo)) ctx.setDemo('frl');
      ctx.bumpDataRev();
    }
    try {
      if (window.GL) {
        const conn = await window.GL.getConnection();
        await conn.query(`DROP TABLE IF EXISTS t_${key}`);
        await conn.query(`DROP TABLE IF EXISTS t_${key}_all`);
        const db = await window.GL.getDB();
        if (db.dropFile) await db.dropFile(`${key}.csv`);
      }
    } catch (err) {
      console.warn('DuckDB cleanup after remove failed:', err);
    }
  };
  const bothReady = stages.ela === 'ready' && stages.math === 'ready';
  const anyReady = stages.ela === 'ready' || stages.math === 'ready';
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

      <section style={{ padding: '4px 4px 0' }}>
        <h2 style={{
          fontFamily: LABEL, fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1.4, color: SLU.ink2,
          margin: '0 0 6px', paddingBottom: 6,
          borderBottom: `1px solid ${SLU.rule2}`,
        }}>Add your data — one file per subject</h2>
        <p style={{ margin: '0 0 14px', maxWidth: 720,
                    fontSize: 13, lineHeight: 1.55, color: SLU.mute, textWrap: 'pretty' }}>
          One file for reading (ELA), one for math — both read right here in
          your browser. You can start exploring a subject the moment its file
          loads cleanly, and add the other whenever you’re ready.
        </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <SubjectDropZone
          subjectKey="ela"
          subjectLabel="ELA"
          accent={SLU.blue}
          stage={stages.ela}
          setStage={(v) => setStage('ela', v)}
          filename={files.ela}
          onFile={onFile}
          onRemove={onRemove}
          error={errors.ela}
          note={notes.ela}
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
          onRemove={onRemove}
          error={errors.math}
          note={notes.math}
          placeholder="Math growth file"
        />
      </div>
      {!anyReady && (
        <p style={{ margin: '10px 2px 0', fontSize: 12.5, color: SLU.mute }}>
          <a href="#" onClick={(e) => { e.preventDefault(); ctx.setPage('scan'); }}
             style={{ color: SLU.mute, textDecoration: 'underline' }}>
            Skip for now and explore the sample math data
          </a>
        </p>
      )}
      </section>

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

      <section style={{ padding: '4px 4px 0' }}>
        <h2 style={{
          fontFamily: LABEL, fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1.4, color: SLU.ink2,
          margin: '0 0 12px', paddingBottom: 6,
          borderBottom: `1px solid ${SLU.rule2}`,
        }}>Where to go next</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <LandingCard
            eyebrow="Triage"
            title="System Scan"
            body="A district-wide heat map of how each grade is doing at each school. Spot where growth is consistently strong or soft before you dig into any one group."
            cta="Open System Scan →"
            onClick={() => ctx.setPage('scan')}
            accent={SLU.gold}
          />
          <LandingCard
            eyebrow="Drill in"
            title="Gap Analysis"
            body="Pick a subject and two student groups, and see the gap between them at every school — ranked, with the district average for context and small-sample schools clearly flagged."
            cta="Open Gap Analysis →"
            onClick={() => ctx.setPage('gap')}
            accent={SLU.blue}
          />
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <AuxCard title="What your file should include" collapsible defaultOpen>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: SLU.mute, lineHeight: 1.5 }}>
            This is the standard Missouri DESE / MOSIS growth export — one file per subject, and
            most assessment systems can produce it. GrowthLens figures out the subject from the
            growth column’s prefix (<code style={{ fontFamily: MONO }}>{'{SUBJECT}'}</code> is{' '}
            <code style={{ fontFamily: MONO }}>MATH</code> or <code style={{ fontFamily: MONO }}>COMM_ARTS</code>),
            so you don’t need a separate subject column. Column names don’t have to match upper- or
            lower-case exactly.
          </p>
          <ColumnTable rows={[
            ['{SUBJECT}_Z_RESIDUAL',     'float',  'Each student’s growth compared with what was expected, on a standard scale.'],
            ['{SUBJECT}_Z_RESIDUAL_SE',  'float',  'How precise that growth number is for the student.'],
            ['{SUBJECT}_Z_T',            'float',  'Where the student started — this year’s score on a standard scale.'],
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
              q: 'What does GrowthLens do?',
              a: <>Shows how each school is doing compared with the district as a whole,
                  steadies the numbers for smaller schools so a few students can’t swing
                  the picture, and measures the gap between student groups school by school.</>,
            },
            {
              q: 'What isn’t it?',
              a: <>It isn’t a way to evaluate individual teachers or students. Groups too
                  small to read reliably are flagged so you don’t over-interpret them. And
                  the numbers describe what’s happening, not why — use them to ask sharper
                  questions, not to assign blame.</>,
            },
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
    </>
  );
}

function SubjectDropZone({ subjectKey, subjectLabel, accent, stage, setStage, filename, onFile, onRemove, error, note, placeholder }) {
  // Remember the last non-dragover stage so a drag that passes over (or misses)
  // a loaded zone restores "ready" instead of clobbering it back to idle.
  const lastStable = React.useRef('idle');
  if (stage !== 'dragover') lastStable.current = stage;
  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) onFile(subjectKey, f);
    else setStage(lastStable.current);
  };
  const ready = stage === 'ready';
  const errMsg = !error ? null
    : error.error === 'subject_mismatch' ? `This is the ${subjectLabel} spot, but the file looks like ${String(error.detected || '').toUpperCase()}. Try dropping it on the other subject instead.`
    : error.error === 'missing_columns' ? 'This file is missing a few columns we need: ' + (error.missing || []).join(', ') + '. Check the “What your file should include” list and try again.'
    : error.error === 'no_prefix' ? 'We couldn’t find a growth column (one ending in *_Z_RESIDUAL). This usually means it isn’t a DESE growth file — double-check the export.'
    : error.error === 'no_rows_latest' ? `We didn’t find any students for the most recent year (${error.latestYear ?? '—'}). Make sure that year’s data is included.`
    : error.error === 'no_year' ? 'We couldn’t read any year values from the GROWTH_YEAR column, so we can’t tell which school year this is. Check that column’s values and try again.'
    : (error.message || 'We couldn’t read this file. Please double-check it’s the right export and try again.');
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (stage !== 'dragover') setStage('dragover'); }}
      onDragLeave={() => { if (stage === 'dragover') setStage(lastStable.current); }}
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
          ? `Looks good — your file checks out and is ready to explore.${note ? ' ' + note : ''}`
          : `Drop a ${subjectLabel} file here, or use Choose file below. One row per student, per grade, per year.`}
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
          {/* Visually hidden (not display:none) so keyboard users can Tab to it
              and press Enter to open the file picker. */}
          <input type="file" accept=".csv,text/csv"
                 aria-label={`Choose ${subjectLabel} file`}
                 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
                          overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}
                 onChange={(e) => {
                   const f = e.target.files && e.target.files[0];
                   if (f) onFile(subjectKey, f);
                 }} />
        </label>
        {ready && (
          <button onClick={() => onRemove(subjectKey)} style={{
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
                    aria-expanded={isOpen}
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
  return (
    <>
      <BriefHeader eyebrow="Gap Analysis" slice={sliceLabel}
                   title="Where the gap lives, school by school"
                   blurb={'For the two groups you choose, GrowthLens measures the gap between them at every school and lines the schools up from largest to smallest. You’ll see how big each gap is and which way it leans, the district-wide average for context, and which schools have too few students to read reliably. Use it to tell whether a gap shows up across the system or sits in just a few schools.'} />
      <OverviewCardGap unit={ctx.unit} estimate={ctx.estimate} />
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
      <OverviewCardScan unit={ctx.unit} />
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
      tabIndex={collapsible ? 0 : undefined}
      onKeyDown={collapsible ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      } : undefined}
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
          {/* Real heading for structure — visually identical to the old span */}
          <h2 style={{ margin: 0, font: 'inherit', letterSpacing: 'inherit',
                       textTransform: 'inherit', color: 'inherit' }}>{title}</h2>
        </span>
        {headerExtra}
      </div>
      {open && children}
    </section>
  );
}

// ---- OVERVIEW CARD ----------------------------------------------------------
// Plain-language bullets generated from the data (engine/insights.js) —
// **bold** markers render as emphasis; caveat items render muted/italic.
function KeyTakeaways({ items }) {
  if (!items || items.length === 0) return null;
  const renderMd = (text) => text.split('**').map((seg, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: SLU.ink, fontWeight: 600 }}>{seg}</strong>
      : seg);
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${SLU.rule2}` }}>
      <StatLabel>Key takeaways</StatLabel>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none',
                   display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline',
                               fontSize: 12, lineHeight: 1.5, maxWidth: 880,
                               color: it.caveat ? SLU.mute : SLU.ink2,
                               fontStyle: it.caveat ? 'italic' : 'normal' }}>
            <span aria-hidden="true" style={{ color: it.caveat ? SLU.mute : SLU.gold,
                                               fontSize: 10, lineHeight: 1.8 }}>▪</span>
            <span>{renderMd(it.text)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// District-level numeric context for the current slice. Sits between the
// page header and the figure — a quick "what does the district look like in
// aggregate" reference before drilling into school-level detail.
function OverviewCardGap({ unit = 'z', estimate = 'shrunk' }) {
  const data = window.GAPS_DATA;
  if (!data) return null;
  const { meta, schools } = data;
  const tauSD = Math.sqrt(Math.max(0, meta.tauSquared));
  const ds = window.GLStore && window.GLStore.getActiveMeta();
  const yr = (ds && (ds.latestYear || ds.year)) || '2024–25';
  // Track the global Units setting: weeks values round to whole weeks (the
  // scale's resolution), SD keeps two decimals. The pooled district gap and
  // τ are method-independent, so only the strip dots follow Method.
  const isWk = unit === 'weeks';
  const fmtBig = (v) => {
    const x = isWk ? window.zToWeeks(v) : v;
    return (x >= 0 ? '+' : '−') + (isWk ? Math.abs(Math.round(x)) : Math.abs(x).toFixed(2));
  };
  // Spelled out, with the singular handled — "1 week", "12 weeks".
  const unitTagFor = (v) => isWk
    ? (Math.abs(Math.round(window.zToWeeks(v))) === 1 ? 'week' : 'weeks')
    : 'SD';

  // Generated takeaways follow the global subject/units/method, but read
  // across every comparison the dataset carries, not just the one on screen.
  const takeaways = (window.GLInsights && window.GLStore)
    ? window.GLInsights.gapTakeaways({
        slices: window.GLStore.allGapSlices(),
        activeKey: meta.demographic,
        mode: estimate,
        fmt: { val: (v) => `${fmtBig(v)} ${unitTagFor(v)}` },
      })
    : [];

  return (
    <AuxCard title={`Overview · ${meta.subject.toUpperCase()} · ${meta.groupA} − ${meta.groupB} · ${yr}`}>
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
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                                  color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
                    {fmtBig(mu)}
                  </span>
                  <span style={{ fontSize: 13, color: SLU.mute, fontWeight: 500 }}>{unitTagFor(mu)}</span>
                </div>
                {re && (
                  <div style={{ fontSize: 11, color: SLU.mute, marginTop: 4, fontFamily: MONO }}>
                    95% CI [{fmtBig(re.ciLo)}, {fmtBig(re.ciHi)}]
                  </div>
                )}
                <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
                  {meta.groupA} average minus {meta.groupB} average · across schools, giving steadier schools more weight
                </div>
              </>
            );
          })()}
        </div>

        {/* Between-school spread with mini strip — meaningless with fewer
            than two reliable schools, so it gives way to a short note. */}
        <div style={{ flex: '2 1 380px', minWidth: 320 }}>
          <StatLabel>How much schools really differ</StatLabel>
          {schools.filter((s) => s.meets_min_cell).length >= 2 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: 22, color: SLU.mute, fontFamily: MONO, lineHeight: 1 }}>±</span>
                    <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                                    color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
                      {isWk ? Math.abs(Math.round(window.zToWeeks(tauSD))) : tauSD.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 13, color: SLU.mute }}>{unitTagFor(tauSD)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6 }}>
                    between schools only
                  </div>
                </div>
                <DistributionStrip schools={schools} districtGap={meta.districtGap} tauSD={tauSD}
                                   unit={unit} estimate={estimate} />
              </div>
              <div style={{ fontSize: 11, color: SLU.mute, marginTop: 8, lineHeight: 1.4, maxWidth: 540 }}>
                {estimate === 'raw'
                  ? 'Each dot is one school’s raw gap — exactly as measured, so schools with few students can swing wide. The gold band shows the range where most schools should fall if the spread is real.'
                  : 'Each dot is one school’s shrunken gap — its number nudged toward the district average so a few students can’t swing it. The gold band shows the range where most schools should fall if the spread is real.'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: SLU.mute, lineHeight: 1.5, maxWidth: 420 }}>
              Fewer than two schools have enough students to compare, so
              between-school spread doesn’t apply.
            </div>
          )}
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
      <KeyTakeaways items={takeaways} />
    </AuxCard>
  );
}

function DistributionStrip({ schools, districtGap, tauSD, unit = 'z', estimate = 'shrunk' }) {
  const width = 320, height = 56;
  // Dots follow the global Method setting; geometry stays in z-space and only
  // the labels convert to weeks (z↔weeks is linear, same trick as the forest
  // axis). Auto-range from data so dots never silently clamp to the edge.
  // Zero-side schools carry null estimates — they have no dot to draw.
  const gapKey = estimate === 'raw' ? 'raw_gap' : 'shrunk_gap';
  const dots = schools.filter(s => Number.isFinite(s[gapKey]));
  const gaps = dots.map(s => s[gapKey]);
  const fmtN = (v) => {
    const x = unit === 'weeks' ? Math.round(window.zToWeeks(v)) : v;
    if (x === 0) return '0';
    return (x > 0 ? '+' : '−') + (unit === 'weeks' ? Math.abs(x) : Math.abs(x).toFixed(2));
  };
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
            {fmtN(t)}
          </text>
        </g>
      ))}
      <text x={x(districtGap)} y={y - 14} fontSize={9} fontFamily={FONT} fill={SLU.gold}
            textAnchor="middle" fontWeight={600}>
        district {fmtN(districtGap)}
      </text>
      {dots.map(s => {
        const cx = Math.max(3, Math.min(width - 3, x(s[gapKey])));
        const inside = s[gapKey] >= districtGap - tauSD && s[gapKey] <= districtGap + tauSD;
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
function OverviewCardScan({ unit = 'z' }) {
  const data = window.HEATMAP_DATA;
  if (!data) return null;
  const grades = ['3', '4', '5', '6', '7', '8'];
  // Units follow the global setting, converted per grade like the heatmap's
  // cells (estimate is a no-op here for the same reason it is there — the
  // dataset stores one residual per cell). Cell colors stay in SD space so
  // they always match the heatmap legend.
  const isWk = unit === 'weeks';

  // Generated takeaways follow the global units; per-grade values convert
  // through the same { grade } context the heatmap cells use.
  const takeaways = window.GLInsights
    ? window.GLInsights.scanTakeaways({
        heat: data,
        fmt: { val: (v, o) => {
          if (!isWk) return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' SD';
          const w = Math.round(window.zToWeeks(v, o));
          return (w >= 0 ? '+' : '−') + Math.abs(w) + ` week${Math.abs(w) === 1 ? '' : 's'}`;
        } },
      })
    : [];

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
    <AuxCard title={`Overview · ${data.meta.subject.toUpperCase()} · how each grade is doing · ${yr}`}>
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
            <span style={{ fontSize: 13, color: SLU.mute }}>school{totalSchools === 1 ? '' : 's'}</span>
          </div>
          <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, fontFamily: MONO, lineHeight: 1.5 }}>
            {totalN.toLocaleString()} students<br/>grades 3–8 · {data.meta.subject.toUpperCase()} MAP
          </div>
        </div>

        {/* Per-grade cells — one box per grade */}
        <div style={{ flex: '1 1 520px', minWidth: 380 }}>
          <StatLabel>Average growth by grade <span style={{ textTransform: 'none', fontWeight: 500, color: SLU.mute }}>— compared with the district average ({isWk ? 'weeks of learning' : 'SD'})</span></StatLabel>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, marginTop: 8 }}>
            {/* Grades absent from the data would render misleading "▲0.00 · n=0" boxes. */}
            {byGrade.filter((b) => b.n > 0).map(({ g, n, schoolCount, mean }) => {
              const abs = isWk
                ? String(Math.abs(Math.round(window.zToWeeks(mean, { grade: g }))))
                : Math.abs(mean).toFixed(2);
              const above = mean >= 0;
              // Same luminance-based ink rules as HeatmapH1's cells.
              const glyphColor = window.heatGlyphInk ? window.heatGlyphInk(mean) : (above ? SLU.pos : SLU.neg);
              const numColor = window.heatCellInk ? window.heatCellInk(mean) : SLU.ink;
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
                                   color: numColor, letterSpacing: -0.5, lineHeight: 1,
                                   display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ color: glyphColor, fontSize: 14, lineHeight: 1 }}>
                        {above ? '▲' : '▼'}
                      </span>
                      <span>{abs}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: SLU.mute, marginLeft: 2 }}>{isWk ? (abs === '1' ? 'week' : 'weeks') : 'SD'}</span>
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
      <KeyTakeaways items={takeaways} />
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

const METHOD_OPTS = { shrunk: 'Shrunken', raw: 'Raw' };
const METHOD_HINT = 'How each school’s number is figured. Shrunken gently pulls schools with less data toward the district average, so a handful of students can’t swing the result — steadier for small schools, but less extreme. Raw shows each school’s own number exactly as measured: honest, but jumpier when only a few students are involved.';
const METHOD_OPT_HINTS = {
  shrunk: 'Shrunken: schools with fewer students are nudged toward the district average, so their numbers are steadier but less extreme.',
  raw: 'Raw: each school’s own number, exactly as measured — honest about its data, but jumpier when only a few students are involved.',
};
const UNIT_HINT = 'How to show the numbers. SD is a standard scale compared with the district average. Weeks converts that into about how many weeks of learning it represents, using Missouri MAP growth norms.';

// ---- SLOTS ------------------------------------------------------------------
function ForestSlot({ ctx }) {
  if (window.ForestFinal) return (
    <window.ForestFinal
      estimate={ctx.estimate}
      unit={ctx.unit}
      demo={ctx.demo} setDemo={ctx.setDemo}
      demoOptions={DEMOS} disabledDemos={ctx.disabledDemos}
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
window.AuxCard = AuxCard;
window.KeyTakeaways = KeyTakeaways;
window.StatLabel = StatLabel;
window.CLabel = CLabel;
window.CSegmented = CSegmented;
window.SUBJECTS = SUBJECTS;
window.DEMOS = DEMOS;
window.METHOD_OPTS = METHOD_OPTS;
window.METHOD_HINT = METHOD_HINT;
window.METHOD_OPT_HINTS = METHOD_OPT_HINTS;
window.UNIT_HINT = UNIT_HINT;
