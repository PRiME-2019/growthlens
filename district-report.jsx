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

// Statewide comparison — where the district's schools land in the statewide PRiME
// growth distribution, and how they've moved over time. Built on the bundled
// reference/prime_growth_database.csv (public data, fetched same-origin so no
// request ever reveals which district someone is looking at). Shows both
// subjects and ignores the sidebar Subject toggle; the Units toggle applies,
// converting through the same weeksPerSD machinery as every other page (each
// chart's own year × subject grade-average factor; the trend uses one factor
// for all years so switching units never reshapes the line).
//
// District detection: an upload's COUNTY_DISTRICT_CODE (meta.districtCode)
// wins; the sample data browses Jackson R-II as a worked example; the picker
// can always pull up any district in the database.

// ---- PRiME database loader ---------------------------------------------------
// Module-level singleton, shared with the upload flow's name crosswalk
// (app-shell awaits window.loadPrimeDb() before stamping school names).
// A failed fetch clears the cache so the next call retries.
let PRIME_DB_CACHE = null;
function loadPrimeDb() {
  if (!PRIME_DB_CACHE) {
    PRIME_DB_CACHE = fetch('reference/prime_growth_database.csv')
      .then((r) => {
        if (!r.ok) throw new Error(`prime_growth_database.csv: HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => window.GLResources.parseCsv(text));
    PRIME_DB_CACHE.catch(() => { PRIME_DB_CACHE = null; });
  }
  return PRIME_DB_CACHE;
}
window.loadPrimeDb = loadPrimeDb;
// Deliberately NOT prefetched: the 1.2 MB CSV is fetched on first need (this
// page mounting, an upload carrying a district code, or the Export page) and
// cached for the session — most visits never pay for it. Each consumer
// already shows a loading state for the one-time fetch.

const DEMO_DISTRICT = '016090';   // Jackson R-II — the sample data's worked example
const RPT_BIN_W = 0.05;
const RPT_SUBJECTS = ['ela', 'math'];
const RPT_SUBJ_LABEL = { ela: 'ELA', math: 'Math' };
const LEVEL_ORDER = ['Elementary', 'Middle', 'EleMiddle', 'Other'];
const LEVEL_HEADING = {
  Elementary: 'Elementary schools',
  Middle: 'Middle schools',
  EleMiddle: 'Elementary–middle schools',
  Other: 'Other schools',
};
const LEVEL_NOUN = {
  Elementary: 'elementary school',
  Middle: 'middle school',
  EleMiddle: 'elementary–middle school',
  Other: 'school',
};

const fmtZSigned = (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2);
// Unit-aware value text: weeks mode converts through the chart's own
// year × subject grade-average factor (the same conversion as every other
// page); SD mode keeps the signed two-decimal form.
const rptVal = (z, unit, opts) => (unit === 'weeks' ? fmtVal(z, 'weeks', opts) : fmtZSigned(z));
// Short signed axis label: whole-ish weeks ("+25") or SD ("+0.20").
const rptTick = (t, unit) => (Math.abs(t) < 1e-9 ? '0'
  : unit === 'weeks' ? (t > 0 ? '+' : '−') + Math.abs(Number(t.toFixed(1))) : fmtZSigned(t));
// Same nice-step ladder the deck figures use, so the page and the exported
// slides pick identical week gridlines.
function rptNiceStep(span, target) {
  const raw = Math.abs(span) / target || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}
// Width-responsive rendering uses the shared useMeasuredWidth hook from
// forest-shared.jsx (native pixel size, no viewBox scaling).
function rptOrdinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] || 'th'}`;
}

function DistrictReportPage({ ctx }) {
  const unit = ctx.unit || 'z';
  const [db, setDb] = React.useState({ status: 'loading', rows: null });
  React.useEffect(() => {
    let alive = true;
    loadPrimeDb().then(
      (rows) => { if (alive) setDb({ status: 'ready', rows }); },
      () => { if (alive) setDb({ status: 'error', rows: null }); },
    );
    return () => { alive = false; };
  }, []);

  // Detected district: an upload's COUNTY_DISTRICT_CODE wins; with uploads
  // but no code there is nothing to detect (prompt instead of guessing);
  // the sample data browses the worked example.
  const [lea, setLea] = React.useState(() => {
    const metas = ['ela', 'math']
      .map((k) => (window.GLStore && window.GLStore.getUploadedMeta) ? window.GLStore.getUploadedMeta(k) : null)
      .filter(Boolean);
    if (metas.length) return metas.map((m) => m.districtCode).find(Boolean) || null;
    return DEMO_DISTRICT;
  });
  const [year, setYear] = React.useState(null);       // null → district's latest
  const pickLea = (v) => { setLea(v || null); setYear(null); };

  const anyUploaded = !!(window.GLStore && window.GLStore.anyUploaded && window.GLStore.anyUploaded());
  const rows = db.rows;
  const report = (db.status === 'ready' && lea && window.GLPrime)
    ? window.GLPrime.districtReport(rows, lea) : null;
  const shownYear = report ? (year && report.years.includes(year) ? year : report.years[report.years.length - 1]) : null;

  let body = null;
  if (db.status === 'loading') {
    body = <RptStateCard>Loading the statewide growth database…</RptStateCard>;
  } else if (db.status === 'error') {
    body = <RptStateCard>The statewide growth database didn’t load. Check your internet connection, then come back to this page to try again.</RptStateCard>;
  } else if (!lea) {
    body = (
      <RptStateCard>
        Your file doesn’t name its district, so pick yours from the list above
        to see where your schools land statewide.
      </RptStateCard>
    );
  } else if (!report) {
    body = (
      <RptStateCard>
        District code <b style={{ fontWeight: 600 }}>{lea}</b> isn’t in the
        statewide database. Pick your district from the list above instead.
      </RptStateCard>
    );
  } else {
    body = (
      <>
        <ReportOverviewCard report={report} year={shownYear} unit={unit} />
        <HistogramCard rows={rows} report={report} lea={lea} year={shownYear} setYear={setYear} unit={unit} />
        <TrendCard report={report} unit={unit} />
      </>
    );
  }

  return (
    <>
      <BriefHeader eyebrow="Statewide comparison" slice={report ? report.name : 'Statewide'}
                   title="How your schools compare statewide"
                   blurb={'Every Missouri public school gets a growth score each year — how much its students learned compared with students who started at the same place. These charts show where each of your schools lands among all schools statewide, and how that has moved over time. A score of 0 means a typical year of growth. This is the state’s scale — separate from the subject and group settings used elsewhere in this tool — but the Units toggle applies: switch to weeks to read every score as weeks of learning.'} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontFamily: LABEL, color: SLU.mute,
                       textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
          District
        </span>
        <select value={lea || ''} onChange={(e) => pickLea(e.target.value)}
                aria-label="District"
                style={{ fontFamily: FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
                         maxWidth: 340, border: `1px solid ${SLU.rule}`, borderRadius: 6, background: '#fff' }}>
          <option value="">— Choose a district —</option>
          {(db.status === 'ready' && window.GLPrime ? window.GLPrime.districtList(rows) : []).map((d) => (
            <option key={d.lea_id} value={d.lea_id}>{d.name}</option>
          ))}
        </select>
        {!anyUploaded && lea === DEMO_DISTRICT && (
          <span style={{ fontSize: 11.5, color: SLU.mute }}>
            Showing one real district as an example — pick yours from the list.
          </span>
        )}
      </div>
      {body}
    </>
  );
}

function RptStateCard({ children }) {
  return (
    <section style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      padding: '26px 24px', fontSize: 13.5, lineHeight: 1.6, color: SLU.ink2,
      fontFamily: FONT, maxWidth: 860,
    }}>{children}</section>
  );
}

// ---- Overview ----------------------------------------------------------------
function ReportOverviewCard({ report, year, unit }) {
  const pointAt = (s, sub) => (s.series[sub] || []).find((p) => p.year === year) || null;
  const counts = RPT_SUBJECTS.map((sub) => {
    const pts = report.schools.map((s) => pointAt(s, sub)).filter(Boolean);
    return { sub, at: pts.filter((p) => p.z >= 0).length, n: pts.length };
  });
  // Typical statewide standing: the median of rank ÷ pool across both
  // subjects, in "top X%" language a board slide can carry.
  const pcts = [];
  for (const s of report.schools) {
    for (const sub of RPT_SUBJECTS) {
      const p = pointAt(s, sub);
      if (p && p.rank != null && p.poolN > 0) pcts.push(p.rank / p.poolN);
    }
  }
  pcts.sort((a, b) => a - b);
  const medianPct = pcts.length
    ? pcts[Math.floor((pcts.length - 1) / 2)] : null;

  // primeTakeaways passes { subject, year } on value calls so weeks mode can
  // pick the right conversion factor; SD mode ignores them.
  const takeaways = window.GLPrime
    ? window.GLPrime.primeTakeaways({ report, year, fmt: { val: (z, opts = {}) =>
        rptVal(z, unit, { subject: opts.subject || 'ela',
                          year: Number(opts.year != null ? opts.year : year) }) } })
    : [];

  return (
    <AuxCard title={`Overview · ${report.name} · ${year}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 32px', alignItems: 'flex-start' }}>
        {counts.map((c) => (
          <div key={c.sub} style={{ flex: '1 1 200px', minWidth: 180 }}>
            <StatLabel>Growing at least as fast as typical · {RPT_SUBJ_LABEL[c.sub]}</StatLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                             color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>{c.at}</span>
              <span style={{ fontSize: 16, color: SLU.mute, fontFamily: MONO }}>/ {c.n}</span>
            </div>
            <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
              schools at or above a typical year of growth in {year}
            </div>
          </div>
        ))}
        <div style={{ flex: '1 1 200px', minWidth: 180 }}>
          <StatLabel>Where your schools typically rank</StatLabel>
          {medianPct != null ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                               color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>
                  top {Math.max(1, Math.round(medianPct * 100))}%
                </span>
              </div>
              <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
                half of your schools’ results rank higher than this, half lower — each
                against Missouri schools of the same type
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: SLU.mute, lineHeight: 1.5 }}>
              No statewide ranks for this district in {year}.
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 150 }}>
          <StatLabel>Years of data</StatLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 36, fontWeight: 600, fontFamily: MONO,
                           color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 }}>{report.years.length}</span>
          </div>
          <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
            {report.years[0]}–{report.years[report.years.length - 1]} · {report.schools.length} school{report.schools.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <KeyTakeaways items={takeaways} />
    </AuxCard>
  );
}

// ---- Tile histograms -----------------------------------------------------------
function HistogramCard({ rows, report, lea, year, setYear, unit }) {
  // The displayed year decides which level each school counts under — a
  // school reclassified between years moves pools with the year picker.
  const levels = LEVEL_ORDER.filter((lv) =>
    report.schools.some((s) => RPT_SUBJECTS.some((sub) =>
      (s.series[sub] || []).some((p) => p.year === year && p.level === lv))));

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
      padding: 24, fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
            Where your schools land among all Missouri schools
          </h2>
          <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2, maxWidth: 720 }}>
            Each gray bar counts Missouri schools of the same type with that growth score in {year};
            each gold tile is one of your schools. The dashed line marks a typical year of growth.
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontFamily: LABEL, color: SLU.mute,
                         textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"
                  style={{ fontFamily: FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
                           border: `1px solid ${SLU.rule}`, borderRadius: 6, background: '#fff' }}>
            {report.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {levels.length === 0 && (
        <div style={{ fontSize: 12.5, color: SLU.mute, padding: '18px 0' }}>
          No growth scores for this district in {year} — pick another year above.
        </div>
      )}
      {levels.map((lv) => (
        <div key={lv} style={{ marginTop: 18 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 11, fontFamily: LABEL, color: SLU.ink2,
                       textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700,
                       paddingBottom: 6, borderBottom: `1px solid ${SLU.rule2}` }}>
            {LEVEL_HEADING[lv]} · {year}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 28px' }}>
            {RPT_SUBJECTS.map((sub) => (
              <TileHistogram key={sub} level={lv} subject={sub} year={year} unit={unit}
                             hist={window.GLPrime.histogram(rows, { year, level: lv, subject: sub, binWidth: RPT_BIN_W, lea })} />
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${SLU.rule2}`,
                    display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 11.5, color: SLU.mute, lineHeight: 1.5 }}>
        <span><span style={{ color: SLU.gold, fontWeight: 600 }}>Gold tile</span> = one of your schools — hover it for the school’s name and statewide rank.</span>
        <span>Schools are ranked only against schools of the same type, so an elementary school is never compared with a middle school.</span>
        {unit === 'weeks' && (
          <span>
            <span style={{ color: SLU.ink2, fontWeight: 600 }}>Weeks of learning</span> = about
            how many weeks each step stands for (ELA SD × {Math.round(weeksPerSD({ subject: 'ela', year: Number(year) }))},
            Math × {Math.round(weeksPerSD({ subject: 'math', year: Number(year) }))};{' '}
            {(() => { const fy = wolFactorYear({ subject: 'ela', year: Number(year) }); return fy ? `${fy} grade 4–8 averages` : 'typical MAP averages'; })()} — see methods).
          </span>
        )}
      </div>
    </div>
  );
}

function TileHistogram({ hist, subject, level, year, unit }) {
  const [hov, setHov] = React.useState(null);   // index into hist.schools
  const [ref, W] = useMeasuredWidth(380);
  if (!hist || hist.poolN === 0) {
    return (
      <div style={{ flex: '1 1 360px', minWidth: 300, fontSize: 12, color: SLU.mute }}>
        {RPT_SUBJ_LABEL[subject]}: no statewide scores for this school type this year.
      </div>
    );
  }
  const H = 168, padL = 6, padR = 6, padT = 26, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = hist.bins.length;
  const barW = plotW / n;
  const maxC = Math.max(...hist.bins.map((b) => b.count));
  const x0 = hist.bins[0].x0, x1 = hist.bins[n - 1].x1;
  const xOf = (z) => padL + ((z - x0) / (x1 - x0)) * plotW;
  const hOf = (c) => (c / maxC) * plotH;
  // Gold tiles get a fixed, visible height — with a 1,000-school pool the
  // honest per-school sliver would be invisible. The bin position is what
  // carries the meaning; the caption and hover carry the exact rank.
  const tileH = Math.min(9, Math.max(5, plotH / 16));
  const atOrAbove = hist.schools.filter((s) => s.z >= 0).length;
  // Ticks: every 0.2 SD, or nice week multiples in weeks mode — positions stay
  // on the z scale (k = weeks per SD), so the bars never move between units.
  const k = unit === 'weeks' ? weeksPerSD({ subject, year: Number(year) }) : 1;
  const tickStep = unit === 'weeks' ? rptNiceStep((x1 - x0) * k, 6) : 0.2;
  const ticks = [];
  for (let t = Math.ceil((x0 * k) / tickStep) * tickStep; t <= x1 * k + 1e-9; t += tickStep) {
    ticks.push(Math.round(t * 10) / 10);
  }

  return (
    <div ref={ref} style={{ flex: '1 1 360px', minWidth: 300, position: 'relative' }}>
      <svg width={W} height={H} role="img"
           aria-label={`${RPT_SUBJ_LABEL[subject]}: ${atOrAbove} of your ${hist.schools.length} ${LEVEL_NOUN[level]}s grew at least as fast as typical, out of ${hist.poolN.toLocaleString()} statewide.`}
           style={{ display: 'block', fontFamily: FONT }}>
        <text x={padL} y={14} style={{ fontSize: 12, fontWeight: 700, fill: SLU.ink }}>
          {RPT_SUBJ_LABEL[subject]}
        </text>
        <text x={W - padR} y={14} textAnchor="end" style={{ fontSize: 10.5, fill: SLU.mute }}>
          {hist.poolN.toLocaleString()} schools statewide
        </text>
        {hist.bins.map((b, i) => b.count > 0 && (
          <rect key={i} x={xOf(b.x0) + 0.5} y={padT + plotH - hOf(b.count)}
                width={Math.max(0.5, barW - 1)} height={hOf(b.count)}
                fill="#E4E5E9" />
        ))}
        {/* District schools: gold tiles stacked from the axis in their bin */}
        {hist.schools.map((s, i) => {
          const stackPos = hist.schools.filter((o, j) => o.bin === s.bin && j < i).length;
          const bx = xOf(hist.bins[s.bin].x0);
          const by = padT + plotH - (stackPos + 1) * (tileH + 1);
          const tip = `${s.name}: ${rptVal(s.z, unit, { subject, year: Number(year) })}${s.rank != null ? ` — ${rptOrdinal(s.rank)} of ${hist.poolN.toLocaleString()} ${LEVEL_NOUN[level]}s` : ''}`;
          return (
            <rect key={`${s.school_id}-${i}`} x={bx + 0.5} y={by}
                  width={Math.max(0.5, barW - 1)} height={tileH}
                  fill={SLU.gold} stroke="#fff" strokeWidth={0.75}
                  tabIndex={0} className="gl-focus" role="img" aria-label={tip}
                  onMouseEnter={() => setHov({ i, tip, leftPct: ((bx + barW / 2) / W) * 100 })}
                  onMouseLeave={() => setHov(null)}
                  onFocus={() => setHov({ i, tip, leftPct: ((bx + barW / 2) / W) * 100 })}
                  onBlur={() => setHov(null)}
                  style={{ cursor: 'pointer' }} />
          );
        })}
        {/* Typical-growth line drawn above the bars so it never disappears */}
        <line x1={xOf(0)} x2={xOf(0)} y1={padT - 4} y2={padT + plotH}
              stroke={SLU.ink2} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke={SLU.rule} strokeWidth={1} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xOf(t / k)} x2={xOf(t / k)} y1={padT + plotH} y2={padT + plotH + 4} stroke={SLU.rule} strokeWidth={1} />
            <text x={xOf(t / k)} y={padT + plotH + 15} textAnchor="middle"
                  style={{ fontSize: 9.5, fontFamily: MONO, fill: SLU.mute }}>
              {rptTick(t, unit)}
            </text>
          </g>
        ))}
        <text x={xOf(0)} y={padT + plotH + 27} textAnchor="middle"
              style={{ fontSize: 9.5, fill: SLU.ink2 }}>typical growth</text>
      </svg>
      {hov && (
        <div style={{ position: 'absolute', bottom: 38,
                      left: `clamp(8%, ${hov.leftPct}%, 92%)`, transform: 'translateX(-50%)',
                      background: SLU.ink, color: '#fff', padding: '6px 10px', borderRadius: 6,
                      fontSize: 11.5, lineHeight: 1.4, whiteSpace: 'nowrap', pointerEvents: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 5 }}>
          {hov.tip}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: SLU.ink2, marginTop: 6, lineHeight: 1.45 }}>
        <b style={{ fontWeight: 600 }}>{atOrAbove} of {hist.schools.length}</b> of your {LEVEL_NOUN[level]}s
        grew at least as fast as the typical Missouri {LEVEL_NOUN[level]}.
      </div>
    </div>
  );
}

// ---- Growth over time ----------------------------------------------------------
function TrendCard({ report, unit }) {
  const [overlay, setOverlay] = React.useState('');
  const overlaySchool = report.schools.find((s) => s.school_id === overlay) || null;
  // One factor per subject (the latest year's), applied to every year — a pure
  // axis relabel, so switching units never reshapes the lines.
  const fYear = Number(report.years[report.years.length - 1]);

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.blue}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
      padding: 24, fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
            Growth over time
          </h2>
          <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2, maxWidth: 720 }}>
            The district line averages all your schools’ statewide growth scores each year.
            Pick a school to lay its own line on top. The dashed stretch crosses 2020,
            the year state testing was cancelled — no score exists for that year.
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontFamily: LABEL, color: SLU.mute,
                         textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>School</span>
          <select value={overlay} onChange={(e) => setOverlay(e.target.value)} aria-label="School to overlay"
                  style={{ fontFamily: FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
                           maxWidth: 280, border: `1px solid ${SLU.rule}`, borderRadius: 6, background: '#fff' }}>
            <option value="">District average only</option>
            {report.schools.map((s) => <option key={s.school_id} value={s.school_id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 28px' }}>
        {RPT_SUBJECTS.map((sub) => (
          <TrendChart key={sub} report={report} subject={sub} overlaySchool={overlaySchool} unit={unit} />
        ))}
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${SLU.rule2}`,
                    display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 11.5, color: SLU.mute, lineHeight: 1.5 }}>
        <span><span style={{ color: SLU.blue, fontWeight: 600 }}>Blue line</span> = district average, weighting schools equally.</span>
        {overlaySchool && <span><span style={{ color: SLU.gold, fontWeight: 600 }}>Gold line</span> = {overlaySchool.name}.</span>}
        <span>The gray dashed line is a typical year of growth — above it, students gained more ground than similar students statewide.</span>
        <span>Hover any point for its exact score.</span>
        {unit === 'weeks' && (
          <span>
            <span style={{ color: SLU.ink2, fontWeight: 600 }}>Weeks of learning</span> = ELA
            SD × {Math.round(weeksPerSD({ subject: 'ela', year: fYear }))},
            Math × {Math.round(weeksPerSD({ subject: 'math', year: fYear }))}{' '}
            ({(() => { const fy = wolFactorYear({ subject: 'ela', year: fYear }); return fy ? `${fy} grade 4–8 averages` : 'typical MAP averages'; })()})
            — one factor for every year, so the lines keep their shape (see methods).
          </span>
        )}
      </div>
    </div>
  );
}

function TrendChart({ report, subject, overlaySchool, unit }) {
  const [hov, setHov] = React.useState(null);
  const [ref, W] = useMeasuredWidth(380);
  const fYear = Number(report.years[report.years.length - 1]);
  const k = unit === 'weeks' ? weeksPerSD({ subject, year: fYear }) : 1;
  const mean = window.GLPrime.districtMeanSeries(report, subject);
  const over = overlaySchool ? (overlaySchool.series[subject] || []) : [];
  if (mean.length === 0) {
    return (
      <div style={{ flex: '1 1 360px', minWidth: 300, fontSize: 12, color: SLU.mute }}>
        {RPT_SUBJ_LABEL[subject]}: no scores for this district.
      </div>
    );
  }

  const H = 190, padL = 36, padR = 10, padT = 26, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yearsAll = [];
  const yMin = Number(report.years[0]), yMax = Number(report.years[report.years.length - 1]);
  for (let y = yMin; y <= yMax; y++) yearsAll.push(String(y));
  const xOf = (yr) => padL + (yearsAll.length === 1 ? plotW / 2
    : ((Number(yr) - yMin) / (yMax - yMin)) * plotW);
  const ext = Math.max(0.15, ...mean.map((p) => Math.abs(p.z)), ...over.map((p) => Math.abs(p.z)));
  const lim = Math.ceil(ext * 10) / 10;
  const yOf = (z) => padT + ((lim - z) / (2 * lim)) * plotH;
  // Consecutive-year runs only — the line breaks across 2020 instead of
  // bridging a year that doesn't exist.
  const segments = (pts) => {
    const segs = [];
    let cur = [];
    for (const p of pts) {
      if (cur.length && Number(p.year) !== Number(cur[cur.length - 1].year) + 1) { segs.push(cur); cur = []; }
      cur.push(p);
    }
    if (cur.length) segs.push(cur);
    return segs;
  };
  const path = (seg) => seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.year)},${yOf(p.z)}`).join(' ');
  // Gridlines: quarter-extents in SD; nice week multiples in weeks mode,
  // positioned back on the z scale through the panel's single factor.
  const yTicks = [];
  if (unit === 'weeks') {
    const wext = lim * k, wstep = rptNiceStep(wext, 3);
    yTicks.push(0);
    for (let t = wstep; t <= wext + 1e-9; t += wstep) yTicks.push(-t, t);
  } else {
    yTicks.push(...[-lim, -lim / 2, 0, lim / 2, lim].map((t) => Math.round(t * 100) / 100));
  }
  // Dashed bridges across missing years (2020): the line itself continues
  // point-to-point, dashed, so the series reads as one school's story while
  // the dashes admit there was no measurement in between.
  const bridges = (pts) => {
    const segs = segments(pts);
    const out = [];
    for (let i = 1; i < segs.length; i++) {
      out.push([segs[i - 1][segs[i - 1].length - 1], segs[i][0]]);
    }
    return out;
  };

  const pointTip = (p, who) => `${who}, ${p.year}: ${rptVal(p.z, unit, { subject, year: fYear })}`
    + (p.rank != null && p.poolN ? ` — ${rptOrdinal(p.rank)} of ${p.poolN.toLocaleString()}` : '');

  const renderPoints = (pts, color, who, shape) => pts.map((p) => (
    <g key={`${who}-${p.year}`}>
      {shape === 'diamond' ? (
        <rect x={xOf(p.year) - 3.4} y={yOf(p.z) - 3.4} width={6.8} height={6.8}
              transform={`rotate(45 ${xOf(p.year)} ${yOf(p.z)})`}
              fill={color} stroke="#fff" strokeWidth={1}
              tabIndex={0} className="gl-focus" role="img" aria-label={pointTip(p, who)}
              onMouseEnter={() => setHov({ tip: pointTip(p, who), leftPct: (xOf(p.year) / W) * 100, topPx: yOf(p.z) })}
              onMouseLeave={() => setHov(null)}
              onFocus={() => setHov({ tip: pointTip(p, who), leftPct: (xOf(p.year) / W) * 100, topPx: yOf(p.z) })}
              onBlur={() => setHov(null)} style={{ cursor: 'pointer' }} />
      ) : (
        <circle cx={xOf(p.year)} cy={yOf(p.z)} r={3.6}
                fill={color} stroke="#fff" strokeWidth={1}
                tabIndex={0} className="gl-focus" role="img" aria-label={pointTip(p, who)}
                onMouseEnter={() => setHov({ tip: pointTip(p, who), leftPct: (xOf(p.year) / W) * 100, topPx: yOf(p.z) })}
                onMouseLeave={() => setHov(null)}
                onFocus={() => setHov({ tip: pointTip(p, who), leftPct: (xOf(p.year) / W) * 100, topPx: yOf(p.z) })}
                onBlur={() => setHov(null)} style={{ cursor: 'pointer' }} />
      )}
    </g>
  ));

  return (
    <div ref={ref} style={{ flex: '1 1 360px', minWidth: 300, position: 'relative' }}>
      <svg width={W} height={H} style={{ display: 'block', fontFamily: FONT }}>
        <text x={padL} y={14} style={{ fontSize: 12, fontWeight: 700, fill: SLU.ink }}>
          {RPT_SUBJ_LABEL[subject]}
        </text>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yOf(t / k)} y2={yOf(t / k)}
                  stroke={t === 0 ? SLU.ink2 : SLU.rule2} strokeWidth={1}
                  strokeDasharray={t === 0 ? '3 3' : 'none'} />
            <text x={padL - 6} y={yOf(t / k) + 3} textAnchor="end"
                  style={{ fontSize: 9.5, fontFamily: MONO, fill: SLU.mute }}>
              {rptTick(t, unit)}
            </text>
          </g>
        ))}
        {yearsAll.map((yr) => (
          <text key={yr} x={xOf(yr)} y={H - 6} textAnchor="middle"
                style={{ fontSize: 9.5, fontFamily: MONO,
                         fill: report.years.includes(yr) ? SLU.mute : SLU.rule }}>
            {'’' + yr.slice(2)}
          </text>
        ))}
        {segments(over).map((seg, i) => (
          <path key={`o${i}`} d={path(seg)} fill="none" stroke={SLU.gold} strokeWidth={2} />
        ))}
        {bridges(over).map(([a, b], i) => (
          <line key={`ob${i}`} x1={xOf(a.year)} y1={yOf(a.z)} x2={xOf(b.year)} y2={yOf(b.z)}
                stroke={SLU.gold} strokeWidth={2} strokeDasharray="4 5" opacity={0.7} />
        ))}
        {segments(mean).map((seg, i) => (
          <path key={`m${i}`} d={path(seg)} fill="none" stroke={SLU.blue} strokeWidth={2.5} />
        ))}
        {bridges(mean).map(([a, b], i) => (
          <line key={`mb${i}`} x1={xOf(a.year)} y1={yOf(a.z)} x2={xOf(b.year)} y2={yOf(b.z)}
                stroke={SLU.blue} strokeWidth={2.5} strokeDasharray="4 5" opacity={0.7} />
        ))}
        {overlaySchool && renderPoints(over, SLU.gold, overlaySchool.name, 'diamond')}
        {renderPoints(mean, SLU.blue, 'District average', 'circle')}
      </svg>
      {hov && (
        <div style={{ position: 'absolute', top: Math.max(0, hov.topPx - 36),
                      left: `clamp(12%, ${hov.leftPct}%, 88%)`, transform: 'translateX(-50%)',
                      background: SLU.ink, color: '#fff', padding: '6px 10px', borderRadius: 6,
                      fontSize: 11.5, lineHeight: 1.4, whiteSpace: 'nowrap', pointerEvents: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 5 }}>
          {hov.tip}
        </div>
      )}
    </div>
  );
}

window.DistrictReportPage = DistrictReportPage;
