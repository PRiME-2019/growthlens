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

// Final forest plot — point + credible interval only, animated toggle between raw and shrunken.
// HTML divs positioned over an SVG axis so CSS transitions on left/width animate the move.
//
// Unit helpers (weeksPerSD, zToWeeks, fmtVal, fmtCI) live in forest-shared.jsx;
// they consult window.WOL_OPTS (year + subject) and the loaded conversion-
// factors JSON for grade × subject × year-aware weeks-of-learning.

const TRANSITION = MOTION_OK ? '420ms cubic-bezier(0.32, 0.72, 0.24, 1)' : '0ms';

function ForestFinal({ estimate, unit: unitProp, demo, setDemo, demoOptions = {}, disabledDemos = [] } = {}) {
  const data = window.GAPS_DATA;
  const mode = estimate || 'shrunk';
  const unit = unitProp || 'z';
  const [view, setView] = React.useState('chart');          // 'chart' | 'table'

  const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
  // Fixed order: largest gap first by the displayed estimate (rows re-sort on
  // the Method toggle and the position animation covers the move). Zero-side
  // schools carry null estimates and always sort last.
  const all = [...data.schools].sort((a, b) => {
    const an = a[gapKey] == null, bn = b[gapKey] == null;
    if (an || bn) return an === bn ? 0 : (an ? 1 : -1);
    return b[gapKey] - a[gapKey];
  });
  const meets = all.filter(s => s.meets_min_cell);
  const below = all.filter(s => !s.meets_min_cell);

  // Axis domain — symmetric around zero, so the favors-A and favors-B halves
  // of the plot are the same size and zero sits at the center. The extent
  // auto-ranges from the active method's CIs (raw OR shrunken, not their union)
  // plus the district line. Toggling Method re-scales the axis — ticks jump to
  // the new domain while the bars' CSS transitions tween into the new projection.
  const axis = React.useMemo(() => {
    const ciKey = mode === 'raw' ? 'raw_ci95' : 'shrunk_ci95';
    const pool = data.schools;
    // Zero-side schools carry null CIs, and non-finite bounds (a degenerate
    // cell that slipped into the data) are excluded — a single NaN would
    // otherwise NaN the whole scale and pile every marker onto one spot.
    const finite = (xs) => xs.filter(Number.isFinite);
    const cis = pool.map(s => s[ciKey]).filter(Boolean);
    const lows = finite(cis.map(c => c[0]));
    const highs = finite(cis.map(c => c[1]));
    const ext = Math.max(Math.abs(data.meta.districtGap) || 0,
                         ...finite(data.meta.districtCi95 || []).map(Math.abs),
                         ...lows.map(Math.abs), ...highs.map(Math.abs));
    const pad = Math.max(0.04, ext * 0.08);
    const max = Math.ceil((ext + pad) * 20) / 20;
    const min = -max;
    const span = max - min;
    const step = span > 2 ? 0.5 : span > 0.9 ? 0.25 : span > 0.35 ? 0.1 : 0.05;
    const ticks = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
      ticks.push(Math.round(t * 100) / 100);
    }
    return { min, max, ticks };
  }, [data, mode]);

  // Plot column is fluid — it absorbs whatever width the card has beyond the
  // fixed label/n columns — with a floor below which the chart scrolls
  // horizontally instead of crushing. Bars/axis position by percentage, so no
  // pixel measurement is needed. (Divs are content-box: the floor math adds
  // each column's horizontal padding.)
  const PLOT_MIN_W = 560;
  const MIN_CHART_W = (86 + 20) + 2 * (60 + 20) + (PLOT_MIN_W + 16);
  const ROW_H = 26;

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
      padding: 24, fontFamily: FONT,
    }}>
        {/* Title row — figure title + Compare select + view toggle. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 12, rowGap: 14, marginBottom: 14 }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
              {data.meta.subject.toUpperCase()} · {data.meta.groupA} vs. {data.meta.groupB} growth, school by school
            </div>
            <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
              How much more or less {data.meta.groupA} students grew than their {data.meta.groupB} schoolmates, {unit === 'weeks' ? 'in weeks of learning' : 'in SD (standard scale)'}.
              The zero line = same growth; each bar is the range the estimate most likely falls in (95% {mode === 'shrunk' ? 'credible' : 'confidence'} interval).
              <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
              {data.meta.nMeetingThreshold}/{data.meta.nSchools} schools meet n≥{data.meta.minCellSize}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
                         rowGap: 10, justifyContent: 'flex-end' }}>
            {setDemo && <CompareSelect value={demo} onChange={setDemo}
                                       options={demoOptions} disabledKeys={disabledDemos} />}
            <ViewToggle view={view} setView={setView} />
          </div>
        </div>

        {/* Body — chart scrolls horizontally at narrow widths instead of crushing */}
        {view === 'table' ? (
          <ForestTable meets={meets} below={below} mode={mode} unit={unit}
                       districtGap={data.meta.districtGap}
                       districtCi={data.meta.districtCi95 || null}
                       groupA={data.meta.groupA} groupB={data.meta.groupB} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: MIN_CHART_W }}>
            <HeaderRow plotMinW={PLOT_MIN_W} unit={unit} groupA={data.meta.groupA} groupB={data.meta.groupB} axis={axis} />
            <DistrictRow data={data} unit={unit} axis={axis} plotMinW={PLOT_MIN_W} rowH={ROW_H} />
            {meets.map((s, i) => <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} axis={axis} plotMinW={PLOT_MIN_W} rowH={ROW_H} stripe={i % 2 === 1} />)}
            {below.length > 0 && (
              <>
                <SectionDivider label="Too few students to read reliably — handle with care" count={below.length} />
                {below.map((s, i) => <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} axis={axis} plotMinW={PLOT_MIN_W} rowH={ROW_H} stripe={i % 2 === 1} dimmed />)}
              </>
            )}
            </div>
          </div>
        )}

        {/* Footer legend */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${SLU.rule2}`,
                      display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 11.5, color: SLU.mute, lineHeight: 1.5 }}>
          {view === 'chart' ? (
            <>
              <LegendSwatch groupA={data.meta.groupA} groupB={data.meta.groupB} />
              <span><span style={{ color: SLU.gold, fontWeight: 600 }}>Gold diamond &amp; dashed line</span> = the district-wide average.</span>
              {unit === 'weeks' && (
                <span><span style={{ color: SLU.ink2, fontWeight: 600 }}>Weeks of learning</span> = about how many weeks of learning each step on the scale stands for (SD × {Math.round(weeksPerSD({ subject: data.meta.subject }))}, {(() => { const fy = wolFactorYear({ subject: data.meta.subject }); return fy ? `${fy} grade 4–8 average` : 'typical MAP average'; })()}; varies by grade — see methods).</span>
              )}
            </>
          ) : (
            <>
              <span><b style={{ color: SLU.ink2, fontWeight: 600 }}>{data.meta.groupA} vs. {data.meta.groupB}</b> in {unit === 'weeks' ? 'weeks of learning' : 'SD'}; positive = {data.meta.groupA} ahead, negative = behind.</span>
              <span><b style={{ color: SLU.ink2, fontWeight: 600 }}>B</b> = how far this school was nudged toward the district average (0 = pulled all the way, 1 = left as measured).</span>
              {unit === 'weeks' && (
                <span><span style={{ color: SLU.ink2, fontWeight: 600 }}>Weeks</span> = about how many weeks of learning each step stands for (SD × {Math.round(weeksPerSD({ subject: data.meta.subject }))}, {(() => { const fy = wolFactorYear({ subject: data.meta.subject }); return fy ? `${fy} grade 4–8 average` : 'typical MAP average'; })()}).</span>
              )}
            </>
          )}
        </div>
    </div>
  );
}

// Which comparison this figure (and the Export deck) slices by. Lives on the
// card because it defines what the figure compares; subject/units/method are
// global in the sidebar panel.
function CompareSelect({ value, onChange, options, disabledKeys = [] }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: LABEL, color: SLU.mute,
                      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        Compare
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        fontFamily: FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
        border: `1px solid ${SLU.rule}`, borderRadius: 999, background: '#fff', cursor: 'pointer',
      }}>
        {Object.entries(options).map(([k, v]) => {
          const off = disabledKeys.includes(k);
          return <option key={k} value={k} disabled={off}>{v}{off ? ' (not in this data)' : ''}</option>;
        })}
      </select>
    </label>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: LABEL, color: SLU.mute, textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        View
      </span>
      <div style={{ position: 'relative', display: 'inline-flex', background: SLU.rule2, borderRadius: 999, padding: 3 }}>
        <div style={{
          position: 'absolute', top: 3, bottom: 3, width: 'calc(50% - 3px)',
          left: view === 'chart' ? 3 : 'calc(50% + 0px)',
          background: '#fff', borderRadius: 999,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          transition: `left ${TRANSITION}`,
        }} />
        {[['chart', 'Chart'], ['table', 'Table']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
                  aria-pressed={view === k}
                  style={{
                    position: 'relative', zIndex: 1, border: 'none', background: 'transparent',
                    padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                    fontSize: 12.5, fontWeight: view === k ? 600 : 500,
                    color: view === k ? SLU.ink : SLU.ink2, fontFamily: FONT,
                  }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- TABLE VIEW -------------------------------------------------------------
// Same data as the forest rows, in a plain dense table. Most useful for export
// and for users who'd rather scan numbers than aim at dots.
function ForestTable({ meets, below, mode, unit, districtGap, districtCi, groupA, groupB }) {
  const rows = [...meets, ...below];
  const dividerAt = meets.length;
  // Pooled Ns mirror the chart's District panel: only schools meeting the
  // cell-size floor feed the pooled mean.
  const dNa = meets.reduce((t, s) => t + s.n_a, 0);
  const dNb = meets.reduce((t, s) => t + s.n_b, 0);

  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 12.5,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${SLU.rule}` }}>
            <TH align="left">School</TH>
            <TH>n {groupA}</TH>
            <TH>n {groupB}</TH>
            <TH>{groupA} vs. {groupB} ({unit === 'weeks' ? 'wk' : 'SD'})</TH>
            <TH>95% CI</TH>
            <TH>vs. district</TH>
            <TH>Shrinkage B</TH>
          </tr>
        </thead>
        <tbody>
          {/* District pooled estimate pinned first — vs. district and B don't
              apply to the reference itself */}
          <tr style={{ borderBottom: `1px solid ${SLU.rule}`, background: 'rgba(154, 118, 17, 0.07)' }}>
            <TD align="left">
              <span style={{ fontFamily: FONT, fontWeight: 700, color: SLU.ink }}>District</span>
            </TD>
            <TD mono mute>{dNa}</TD>
            <TD mono mute>{dNb}</TD>
            <TD mono bold color={SLU.gold}>{fmtVal(districtGap, unit)}</TD>
            <TD mono mute>{districtCi ? fmtCI(districtCi, unit) : '—'}</TD>
            <TD mono mute>—</TD>
            <TD mono mute>—</TD>
          </tr>
          {rows.map((s, i) => {
            const gap = mode === 'raw' ? s.raw_gap : s.shrunk_gap;
            const ci  = mode === 'raw' ? s.raw_ci95 : s.shrunk_ci95;
            const noEst = gap == null || ci == null;   // zero-side school
            const dimmed = i >= dividerAt;
            const sectionStart = i === dividerAt && below.length > 0;
            const vs = noEst ? null : gap - districtGap;
            const isNeg = !noEst && gap < 0;
            return (
              <React.Fragment key={s.school_id}>
                {sectionStart && (
                  <tr>
                    <td colSpan={7} style={{
                      padding: '14px 10px 6px', fontSize: 10.5, fontFamily: LABEL,
                      color: SLU.mute, textTransform: 'uppercase', letterSpacing: 1.0,
                      fontWeight: 700, borderTop: `1px dashed ${SLU.rule}`,
                    }}>
                      Too few students to read reliably — handle with care · {below.length}
                    </td>
                  </tr>
                )}
                <tr style={{
                  borderBottom: `1px solid ${SLU.rule2}`,
                  opacity: dimmed ? 0.5 : 1,
                  background: i % 2 === 1 ? '#FAFAFB' : '#fff',
                }}>
                  <TD align="left" mono>{s.school_id}</TD>
                  <TD mono mute>{s.n_a}</TD>
                  <TD mono mute>{s.n_b}</TD>
                  <TD mono bold={!noEst} mute={noEst} color={noEst ? undefined : (isNeg ? SLU.neg : SLU.pos)}>
                    {noEst ? '—' : fmtVal(gap, unit)}
                  </TD>
                  <TD mono mute>{noEst ? '—' : fmtCI(ci, unit)}</TD>
                  <TD mono mute={noEst} color={noEst ? undefined : SLU.ink2}>
                    {noEst ? '—' : fmtVal(vs, unit)}
                  </TD>
                  <TD mono mute>{s.shrinkage_factor == null ? '—' : s.shrinkage_factor.toFixed(2)}</TD>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TH({ children, align = 'right' }) {
  return (
    <th style={{
      padding: '8px 10px', textAlign: align,
      fontSize: 10.5, fontFamily: LABEL, color: SLU.mute,
      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}
function TD({ children, align = 'right', mono, bold, mute, color }) {
  return (
    <td style={{
      padding: '7px 10px', textAlign: align,
      fontFamily: mono ? MONO : FONT, fontSize: 12,
      fontWeight: bold ? 600 : 400,
      color: color || (mute ? SLU.mute : SLU.ink2),
      whiteSpace: 'nowrap',
    }}>{children}</td>
  );
}

function HeaderRow({ plotMinW, unit, groupA, groupB, axis }) {
  const colHead = (label, w, align = 'right') => (
    <div style={{ width: w, padding: '0 10px 6px', textAlign: align,
                  fontSize: 10.5, fontFamily: LABEL, color: SLU.mute, textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
      {label}
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: `1px solid ${SLU.rule}` }}>
      {colHead('School', 86, 'left')}
      {colHead(`n ${groupA}`, 60)}
      {colHead(`n ${groupB}`, 60)}
      <div style={{ flex: '1 1 0%', minWidth: plotMinW, padding: '0 8px' }}>
        <UnitAxis groupA={groupA} groupB={groupB} unit={unit} axis={axis} />
      </div>
    </div>
  );
}

// Custom axis that re-labels ticks based on unit. Tick positions are still in
// z-domain; only the rendered text changes, since z↔weeks is a linear scale.
// Coordinates are percentages so the axis tracks the fluid plot column with no
// pixel measurement. Two layered bands keep the header readable: direction
// cues above, tick labels + marks below. Zero is anchored to the reference
// group: its tick is labeled with the group's name instead of "0", and the
// cues read as the focal group sitting behind/ahead of that anchor. The unit
// name itself lives in the figure subtitle.
function UnitAxis({ groupA, groupB, unit, axis }) {
  const ax = axis || AXIS;
  const pct = (x) => ((x - ax.min) / (ax.max - ax.min)) * 100;
  const fmtTick = (t) => {
    if (unit === 'weeks') {
      const w = Math.round(zToWeeks(t));
      return w === 0 ? '0' : (w > 0 ? '+' : '−') + Math.abs(w);
    }
    return t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2);
  };
  const height = 46;
  const zeroPct = pct(0);
  return (
    <svg width="100%" height={height} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {/* direction cues — own band so they never collide with tick labels;
          each side renders only when zero sits far enough in for it to fit */}
      {zeroPct > 14 && (
        <text x={`${zeroPct}%`} dx={-7} y={12} fontSize={10} fontWeight={600}
              fill={SLU.mute} fontFamily={FONT} textAnchor="end">◀ {groupA} behind</text>
      )}
      {zeroPct < 86 && (
        <text x={`${zeroPct}%`} dx={7} y={12} fontSize={10} fontWeight={600}
              fill={SLU.mute} fontFamily={FONT} textAnchor="start">{groupA} ahead ▶</text>
      )}
      {/* zero gets a taller, inked mark */}
      <line x1={`${zeroPct}%`} x2={`${zeroPct}%`} y1={height - 8} y2={height} stroke={SLU.ink} strokeWidth={1} />
      {ax.ticks.map(t => {
        const p = pct(t);
        const isZero = t === 0;
        // Numeric labels too close to the anchor name would overlap it —
        // keep their tick marks but drop the text.
        if (!isZero && Math.abs(p - zeroPct) < 6) {
          return <line key={t} x1={`${p}%`} x2={`${p}%`} y1={height - 5} y2={height} stroke={SLU.mute} strokeWidth={1} />;
        }
        // Clamp anchors at the extremes so edge labels overhang the padding
        // instead of clipping ("−0.50" → ".50").
        const anchor = p < 3 ? 'start' : p > 97 ? 'end' : 'middle';
        return (
          <g key={t}>
            <line x1={`${p}%`} x2={`${p}%`} y1={height - 5} y2={height} stroke={SLU.mute} strokeWidth={1} />
            <text x={`${p}%`} y={height - 10}
                  fontSize={isZero ? 9 : 10}
                  fontFamily={isZero ? LABEL : MONO}
                  fontWeight={isZero ? 700 : 400}
                  fill={isZero ? SLU.ink : SLU.ink2} textAnchor={anchor}
                  style={isZero ? { textTransform: 'uppercase', letterSpacing: 0.8 } : undefined}>
              {isZero ? groupB : fmtTick(t)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// (UnitToggle removed — units live in the shared Controls card.)

// District average panel — the pooled estimate every school below is compared
// against, pinned above the per-school rows. Diamond marks the pooled mean
// (the meta-analysis convention); gold matches the dashed district rule that
// runs through the school rows. The pooled mean comes only from schools
// meeting the cell-size floor, so the n columns sum over those schools. The
// estimate is the shrinkage prior — it doesn't change with the Method toggle.
function DistrictRow({ data, unit, axis, plotMinW, rowH }) {
  const [hover, setHover] = React.useState(false);
  const ax = axis;
  const gap = data.meta.districtGap;
  const ci = data.meta.districtCi95 || null;   // absent on data computed before this field existed
  const pool = data.schools.filter(s => s.meets_min_cell);
  const nA = pool.reduce((t, s) => t + s.n_a, 0);
  const nB = pool.reduce((t, s) => t + s.n_b, 0);
  const xPct = (x) => `${((x - ax.min) / (ax.max - ax.min)) * 100}%`;
  const tipOnLeft = (gap - ax.min) / (ax.max - ax.min) > 0.55;
  const h = rowH + 8;
  const dirText = `${data.meta.groupA} ${gap < 0 ? 'behind' : 'ahead'}`;
  const magnitude = fmtVal(gap, unit).replace(/^[+−]/, '');

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: h,
                  background: 'rgba(154, 118, 17, 0.07)' }}>
      <div style={{ width: 86, padding: '0 10px', fontFamily: FONT, fontSize: 12,
                    fontWeight: 700, color: SLU.ink }}>
        District
      </div>
      <NumCell w={60} value={nA} mute />
      <NumCell w={60} value={nB} mute />
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
           onFocus={() => setHover(true)} onBlur={() => setHover(false)}
           tabIndex={0}
           role="img"
           aria-label={`District average: ${dirText} by ${magnitude}${unit === 'weeks' ? '' : ' SD'}${ci ? `, 95% CI ${fmtCI(ci, unit)}` : ''}, pooled across ${pool.length} schools, n ${nA + nB}`}
           style={{ flex: '1 1 0%', minWidth: plotMinW, padding: '0 8px', position: 'relative', height: h,
                    background: hover ? 'rgba(154, 118, 17, 0.07)' : 'transparent',
                    cursor: 'crosshair', outline: 'none',
                    boxShadow: hover ? `inset 0 0 0 1px ${SLU.gold}44` : 'none' }}>
        <div style={{ position: 'absolute', left: 8, right: 8, top: 0, bottom: 0 }}>
          {/* Zero rule — continues the reference-group anchor column from the
              school rows */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: xPct(0), width: 1, background: SLU.mute,
                        opacity: 0.55, transition: `left ${TRANSITION}` }} />
          {ci && (
            <>
              <div style={{
                position: 'absolute', top: '50%', height: 2, transform: 'translateY(-50%)',
                left: xPct(ci[0]), width: `calc(${xPct(ci[1])} - ${xPct(ci[0])})`,
                background: SLU.gold,
                transition: `left ${TRANSITION}, width ${TRANSITION}`,
              }} />
              <CICap leftPct={xPct(ci[0])} side="left" color={SLU.gold} opacity={1} />
              <CICap leftPct={xPct(ci[1])} side="right" color={SLU.gold} opacity={1} />
            </>
          )}
          {/* Pooled-mean diamond */}
          <div style={{ position: 'absolute', top: '50%', left: xPct(gap),
                        width: 15, height: 15, marginTop: -7.5, marginLeft: -7.5,
                        transition: `left ${TRANSITION}`, lineHeight: 0 }}>
            <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" style={{ display: 'block' }}>
              <polygon points="0,-6 6,0 0,6 -6,0" fill={SLU.gold} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {hover && (
          <Tooltip
            schoolId="District"
            gap={gap} ci={ci} unit={unit}
            n_a={nA} n_b={nB} B={null}
            anchorLeftPct={xPct(gap)}
            tipOnLeft={tipOnLeft}
            tag="pooled" accent={SLU.gold}
            dirText={dirText}
          />
        )}
      </div>
    </div>
  );
}

function ForestRow({ s, mode, unit, axis, plotMinW, rowH, stripe, dimmed }) {
  const [hover, setHover] = React.useState(false);
  const ax = axis || AXIS;
  const gap = mode === 'raw' ? s.raw_gap : s.shrunk_gap;
  const ci = mode === 'raw' ? s.raw_ci95 : s.shrunk_ci95;
  const meta = window.GAPS_DATA.meta;
  // Zero-side school: no estimate to draw. The row still renders — id, n
  // columns (one of them 0), reference rules — with a note naming the
  // empty group, so the school doesn't silently vanish from the comparison.
  const noEst = gap == null || ci == null;
  const missing = s.n_a === 0 ? meta.groupA : meta.groupB;
  const xPct = (x) => `${((x - ax.min) / (ax.max - ax.min)) * 100}%`;
  const left = noEst ? null : xPct(ci[0]);
  const right = noEst ? null : xPct(ci[1]);
  const dotX = noEst ? null : xPct(gap);
  const opacity = dimmed ? 0.42 : 1;
  const isNeg = !noEst && gap < 0;
  const tipOnLeft = !noEst && (gap - ax.min) / (ax.max - ax.min) > 0.55;
  const dirText = noEst ? null : `${meta.groupA} ${isNeg ? 'behind' : 'ahead'}`;
  const magnitude = noEst ? null : fmtVal(gap, unit).replace(/^[+−]/, '');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: rowH,
      background: stripe ? '#FAFAFB' : '#fff',
    }}>
      <div style={{ width: 86, padding: '0 10px', fontFamily: MONO, fontSize: 12, color: dimmed ? SLU.mute : SLU.ink2,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
        {s.school_id}
      </div>
      <NumCell w={60} value={s.n_a} dim={dimmed} mute />
      <NumCell w={60} value={s.n_b} dim={dimmed} mute />
      {/* Plot strip */}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
           onFocus={() => setHover(true)} onBlur={() => setHover(false)}
           tabIndex={0}
           role="img"
           aria-label={noEst
             ? `${s.school_id}: no ${missing} students — nothing to compare`
             : `${s.school_id}: ${dirText} by ${magnitude}${unit === 'weeks' ? '' : ' SD'}, 95% CI ${fmtCI(ci, unit)}, n ${s.n_a + s.n_b}, shrinkage B ${s.shrinkage_factor.toFixed(2)}`}
           style={{ flex: '1 1 0%', minWidth: plotMinW, padding: '0 8px', position: 'relative', height: rowH,
                    background: hover && !noEst ? 'rgba(0, 61, 165, 0.04)' : 'transparent',
                    cursor: noEst ? 'default' : 'crosshair', outline: 'none',
                    boxShadow: hover && !noEst ? `inset 0 0 0 1px ${SLU.blue}33` : 'none' }}>
        <div style={{ position: 'absolute', left: 8, right: 8, top: 0, bottom: 0 }}>
          {/* Zero rule — the reference-group anchor; a touch darker than the
              grid since "on this line = growing like {groupB}" carries the
              figure's meaning. Tweens with the bars when the axis re-scales. */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: xPct(0), width: 1, background: SLU.mute,
                        opacity: 0.55, transition: `left ${TRANSITION}` }} />
          {/* District gap rule (Bayes prior) */}
          <div style={{ position: 'absolute', top: 2, bottom: 2, left: xPct(window.GAPS_DATA.meta.districtGap),
                        width: 1, borderLeft: `1px dashed ${SLU.gold}`, transition: `left ${TRANSITION}` }} />
          {noEst ? (
            <span style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0,
                           fontSize: 10.5, fontStyle: 'italic', color: SLU.mute, opacity }}>
              no {missing} students
            </span>
          ) : (
            <>
              {/* CI bar — animated via CSS transitions on left/width */}
              <div style={{
                position: 'absolute', top: '50%', height: 2, transform: 'translateY(-50%)',
                left, width: `calc(${right} - ${left})`,
                background: isNeg ? SLU.neg : SLU.pos, opacity,
                transition: `left ${TRANSITION}, width ${TRANSITION}, background-color ${TRANSITION}`,
              }} />
              {/* CI end caps */}
              <CICap leftPct={left} side="left" color={isNeg ? SLU.neg : SLU.pos} opacity={opacity} />
              <CICap leftPct={right} side="right" color={isNeg ? SLU.neg : SLU.pos} opacity={opacity} />
              {/* Point */}
              <Dot leftPct={dotX} gap={gap} opacity={opacity} hover={hover} />
            </>
          )}
        </div>
        {hover && !noEst && (
          <Tooltip
            schoolId={s.school_id}
            gap={gap} ci={ci} unit={unit} mode={mode}
            n_a={s.n_a} n_b={s.n_b}
            B={s.shrinkage_factor}
            anchorLeftPct={dotX}
            tipOnLeft={tipOnLeft}
            isNeg={isNeg}
            dirText={dirText}
          />
        )}
      </div>

      {/* Numeric gap + CI now shown in hover tooltip on the bar */}
    </div>
  );
}

function CICap({ leftPct, side, color, opacity }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(50% - 5px)', height: 10, width: 1.5,
      left: leftPct,
      transform: side === 'left' ? 'translateX(0)' : 'translateX(-1.5px)',
      background: color, opacity,
      transition: `left ${TRANSITION}, background-color ${TRANSITION}`,
    }} />
  );
}

function Dot({ leftPct, gap, opacity }) {
  const isNeg = gap < 0;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: leftPct,
      width: 13, height: 13, marginTop: -6.5, marginLeft: -6.5,
      transition: `left ${TRANSITION}`,
      opacity,
      lineHeight: 0,
    }}>
      {/* Triangle for negative, circle for positive — shape pairs with color */}
      {isNeg ? (
        <svg width="13" height="13" viewBox="-6.5 -6.5 13 13" style={{ display: 'block', overflow: 'visible' }}>
          <polygon points="0,5 -5.4,-3.6 5.4,-3.6" fill={SLU.neg} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="-6.5 -6.5 13 13" style={{ display: 'block' }}>
          <circle r="4.7" fill={SLU.pos} stroke="#fff" strokeWidth="1" />
        </svg>
      )}
    </div>
  );
}

function NumCell({ w, value, dim, mute }) {
  return (
    <div style={{
      width: w, padding: '0 10px', textAlign: 'right',
      fontFamily: MONO, fontSize: 11.5,
      color: dim ? SLU.mute : (mute ? SLU.mute : SLU.ink2),
    }}>
      {value}
    </div>
  );
}

// Tooltip — anchored to the dot, flips side near the right edge so it doesn't clip.
// White-bg variant matches the demographics / achievement tooltip vocabulary.
// The district row reuses it with `tag` / `accent` overrides, a null B (the
// shrinkage factor has no meaning for the pooled mean), and possibly no CI.
function Tooltip({ schoolId, gap, ci, unit, mode, n_a, n_b, B, anchorLeftPct, tipOnLeft, isNeg,
                   tag, accent: accentProp, dirText }) {
  const offset = 14;
  const accent = accentProp || (isNeg ? SLU.neg : SLU.pos);
  const baseStyle = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: '#fff',
    color: SLU.ink,
    padding: '10px 12px',
    borderRadius: 6,
    border: `1px solid ${accent}`,
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 1.45,
    pointerEvents: 'none',
    zIndex: 5,
    minWidth: 180,
    boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
    whiteSpace: 'nowrap',
  };
  const sideStyle = tipOnLeft
    ? { right: `calc(100% - ${anchorLeftPct} + ${offset}px)` }
    : { left:  `calc(${anchorLeftPct} + ${offset}px)` };
  return (
    <div style={{ ...baseStyle, ...sideStyle }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: SLU.mute }}>{schoolId}</span>
        <span style={{ fontSize: 10, color: SLU.mute, fontFamily: LABEL,
                        textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
          {tag || (mode === 'shrunk' ? 'shrunken' : 'raw')}
        </span>
      </div>
      <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 16, fontWeight: 600, color: accent }}>
        {fmtVal(gap, unit)}
        {dirText && (
          <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 600, color: SLU.mute, marginLeft: 7 }}>
            {dirText}
          </span>
        )}
      </div>
      {ci && (
        <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 11.5, color: SLU.ink2 }}>
          95% CI: {fmtCI(ci, unit)}
        </div>
      )}
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${SLU.rule2}`,
                    fontSize: 10.5, color: SLU.mute, display: 'flex', gap: 12, fontFamily: MONO }}>
        <span>nₐ {n_a}</span>
        <span>nᵇ {n_b}</span>
        {B != null && <span>B {B.toFixed(2)}</span>}
      </div>
    </div>
  );
}

// Positive gap (circle) = the focal group (A) has the higher mean residual;
// negative (triangle) = the reference group (B) does. Matches the axis guides.
function LegendSwatch({ groupA, groupB }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="11" height="11" viewBox="-5.5 -5.5 11 11"><circle r="4" fill={SLU.pos} stroke="#fff" strokeWidth="1" /></svg>
      <span>● {groupA} ahead of {groupB} peers</span>
      <svg width="11" height="11" viewBox="-5.5 -5.5 11 11" style={{ marginLeft: 8 }}>
        <polygon points="0,4 -4,-3 4,-3" fill={SLU.neg} stroke="#fff" strokeWidth="1" />
      </svg>
      <span>▼ {groupA} behind {groupB} peers</span>
    </span>
  );
}

window.ForestFinal = ForestFinal;
