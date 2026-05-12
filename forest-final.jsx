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
// Unit helpers (WEEKS_PER_SD, zToWeeks, fmtVal, fmtCI) live in forest-shared.jsx.

const TRANSITION = '420ms cubic-bezier(0.32, 0.72, 0.24, 1)';

const SORTS_FINAL = {
  gap_desc:  { label: 'Gap (largest →)', fn: (a, b) => b.shrunk_gap - a.shrunk_gap },
  gap_abs:   { label: '|Gap| (largest →)', fn: (a, b) => Math.abs(b.shrunk_gap) - Math.abs(a.shrunk_gap) },
  alpha:     { label: 'School ID', fn: (a, b) => a.school_id.localeCompare(b.school_id) },
  shrink:    { label: 'Shrinkage B (most → least)', fn: (a, b) => a.shrinkage_factor - b.shrinkage_factor },
  n:         { label: 'Total n (largest →)', fn: (a, b) => (b.n_a + b.n_b) - (a.n_a + a.n_b) },
};

const THRESHOLD_MODES = {
  inline: { label: 'Show inline (grayed)' },
  section: { label: 'Section below' },
  hide:   { label: 'Hide' },
};

function ForestFinal({ estimate, unit: unitProp, sort: sortProp, setSort: setSortProp,
                       threshold: thresholdProp, setThreshold: setThresholdProp } = {}) {
  const data = window.GAPS_DATA;
  const mode = estimate || 'shrunk';
  const unit = unitProp || 'z';
  const [view, setView] = React.useState('chart');          // 'chart' | 'table'
  // Sort + Threshold are controlled from the shared Controls card when the
  // parent passes them in; fall back to local state if used standalone.
  const [sortLocal, setSortLocal] = React.useState('gap_desc');
  const [thresholdLocal, setThresholdLocal] = React.useState('inline');
  const sort = sortProp || sortLocal;
  const setSort = setSortProp || setSortLocal;
  const threshold = thresholdProp || thresholdLocal;
  const setThreshold = setThresholdProp || setThresholdLocal;

  const all = [...data.schools].sort(SORTS_FINAL[sort].fn);
  const meets = all.filter(s => s.meets_min_cell);
  const below = all.filter(s => !s.meets_min_cell);
  const visible = threshold === 'hide' ? meets : all;

  const PLOT_W = 560;
  const ROW_H = 26;

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
      padding: 24, fontFamily: FONT,
    }}>
        {/* Title row — figure title + view toggle. Sort & threshold live in the
            shared Controls card above. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 12, rowGap: 14, marginBottom: 14 }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
              ELA gap by school · {data.meta.groupA} − {data.meta.groupB}
            </div>
            <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
              Point estimate with 95% {mode === 'shrunk' ? 'credible' : 'confidence'} interval.
              <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
              district gap {fmtVal(data.meta.districtGap, unit)} · {data.meta.nMeetingThreshold}/{data.meta.nSchools} schools meet n≥{data.meta.minCellSize}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
                         rowGap: 10, justifyContent: 'flex-end' }}>
            <ViewToggle view={view} setView={setView} />
          </div>
        </div>

        {/* Header row */}
        {view === 'chart' && (
          <HeaderRow plotW={PLOT_W} mode={mode} unit={unit} groupA={data.meta.groupA} groupB={data.meta.groupB} districtGap={data.meta.districtGap} />
        )}

        {/* Body */}
        {view === 'table' ? (
          <ForestTable schools={visible} meets={meets} below={below}
                       threshold={threshold} mode={mode} unit={unit}
                       districtGap={data.meta.districtGap} />
        ) : (
          <div>
            {threshold === 'section' ? (
              <>
                {meets.map((s, i) => <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} plotW={PLOT_W} rowH={ROW_H} stripe={i % 2 === 1} />)}
                {below.length > 0 && (
                  <>
                    <SectionDivider label="Below cell-size threshold — interpret with caution" count={below.length} />
                    {below.map((s, i) => <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} plotW={PLOT_W} rowH={ROW_H} stripe={i % 2 === 1} dimmed />)}
                  </>
                )}
              </>
            ) : (
              visible.map((s, i) => (
                <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} plotW={PLOT_W} rowH={ROW_H}
                            stripe={i % 2 === 1} dimmed={threshold === 'inline' && !s.meets_min_cell} />
              ))
            )}
          </div>
        )}

        {/* Footer legend */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${SLU.rule2}`,
                      display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 11.5, color: SLU.mute, lineHeight: 1.5 }}>
          {view === 'chart' ? (
            <>
              <LegendSwatch />
              <span><span style={{ color: SLU.gold, fontWeight: 600 }}>Gold dashed</span> = district-wide gap (Empirical Bayes prior).</span>
              <span><span style={{ color: SLU.ink2 }}>n*</span> marks schools below the n≥{data.meta.minCellSize} cell threshold.</span>
              {unit === 'weeks' && (
                <span><span style={{ color: SLU.ink2, fontWeight: 600 }}>Weeks of learning</span> = SD × {WEEKS_PER_SD} (approx., district-level convention; see methods).</span>
              )}
            </>
          ) : (
            <>
              <span><b style={{ color: SLU.ink2, fontWeight: 600 }}>Gap</b> in {unit === 'weeks' ? 'weeks of learning' : 'SD'}, positive favors {data.meta.groupA}.</span>
              <span><b style={{ color: SLU.ink2, fontWeight: 600 }}>B</b> = shrinkage factor (0 = fully pooled, 1 = no shrinkage).</span>
              <span><span style={{ color: SLU.ink2 }}>n*</span> marks schools below the n≥{data.meta.minCellSize} cell threshold.</span>
              {unit === 'weeks' && (
                <span><span style={{ color: SLU.ink2, fontWeight: 600 }}>Weeks</span> = SD × {WEEKS_PER_SD}.</span>
              )}
            </>
          )}
        </div>
    </div>
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
function ForestTable({ schools, meets, below, threshold, mode, unit, districtGap }) {
  const rows = threshold === 'section'
    ? [...meets, ...below]
    : schools;
  const dividerAt = threshold === 'section' ? meets.length : -1;

  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 12.5,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${SLU.rule}` }}>
            <TH align="left">School</TH>
            <TH>n<sub>{'a'}</sub></TH>
            <TH>n<sub>{'b'}</sub></TH>
            <TH>Gap ({unit === 'weeks' ? 'wk' : 'SD'})</TH>
            <TH>95% CI</TH>
            <TH>vs. district</TH>
            <TH>Shrinkage B</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const gap = mode === 'raw' ? s.raw_gap : s.shrunk_gap;
            const ci  = mode === 'raw' ? s.raw_ci95 : s.shrunk_ci95;
            const dimmed = threshold === 'inline' && !s.meets_min_cell
                          || (threshold === 'section' && i >= dividerAt);
            const sectionStart = i === dividerAt && threshold === 'section' && below.length > 0;
            const vs = gap - districtGap;
            const isNeg = gap < 0;
            return (
              <React.Fragment key={s.school_id}>
                {sectionStart && (
                  <tr>
                    <td colSpan={7} style={{
                      padding: '14px 10px 6px', fontSize: 10.5, fontFamily: LABEL,
                      color: SLU.mute, textTransform: 'uppercase', letterSpacing: 1.0,
                      fontWeight: 700, borderTop: `1px dashed ${SLU.rule}`,
                    }}>
                      Below cell-size threshold — interpret with caution · {below.length}
                    </td>
                  </tr>
                )}
                <tr style={{
                  borderBottom: `1px solid ${SLU.rule2}`,
                  opacity: dimmed ? 0.5 : 1,
                  background: i % 2 === 1 ? '#FAFAFB' : '#fff',
                }}>
                  <TD align="left" mono>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {s.school_id}
                      {!s.meets_min_cell && (
                        <span style={{ fontFamily: FONT, fontSize: 9.5, padding: '1px 4px',
                                        borderRadius: 3, background: SLU.gold, color: '#fff',
                                        letterSpacing: 0.5 }}>n*</span>
                      )}
                    </span>
                  </TD>
                  <TD mono mute>{s.n_a}</TD>
                  <TD mono mute>{s.n_b}</TD>
                  <TD mono bold color={isNeg ? SLU.neg : SLU.pos}>
                    {fmtVal(gap, unit)}
                  </TD>
                  <TD mono mute>{fmtCI(ci, unit)}</TD>
                  <TD mono color={SLU.ink2}>
                    {fmtVal(vs, unit)}
                  </TD>
                  <TD mono mute>{s.shrinkage_factor.toFixed(2)}</TD>
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

function HeaderRow({ plotW, mode, unit, groupA, groupB, districtGap }) {
  const colHead = (label, w, align = 'right') => (
    <div style={{ width: w, padding: '0 10px', textAlign: align,
                  fontSize: 10.5, fontFamily: LABEL, color: SLU.mute, textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
      {label}
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: `1px solid ${SLU.rule}`, paddingBottom: 4 }}>
        {colHead('School', 86, 'left')}
        {colHead(`n ${groupA}`, 60)}
        {colHead(`n ${groupB}`, 60)}
        <div style={{ width: plotW, padding: '0 8px' }}>
          <UnitAxis width={plotW - 16} groupA={groupA} groupB={groupB} unit={unit} />
        </div>
      </div>
    </div>
  );
}

// Custom axis that re-labels ticks based on unit. Tick positions are still in z-domain;
// only the rendered text changes, since z↔weeks is a linear scale.
function UnitAxis({ width, groupA, groupB, unit }) {
  // Same tick positions in z; only labels change since weeks ≈ 12·z is linear.
  const ticks = AXIS.ticks;
  const fmtTick = (t) => {
    if (unit === 'weeks') {
      const w = Math.round(zToWeeks(t));
      return w === 0 ? '0' : (w > 0 ? '+' : '−') + Math.abs(w);
    }
    return t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2);
  };
  const height = 28;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <line x1={xScale(0, width)} x2={xScale(0, width)} y1={height - 6} y2={height} stroke={SLU.ink} strokeWidth={1} />
      {ticks.map(t => (
        <g key={t}>
          <line x1={xScale(t, width)} x2={xScale(t, width)} y1={height - 4} y2={height} stroke={SLU.mute} strokeWidth={1} />
          <text x={xScale(t, width)} y={height - 8} fontSize={10} fontFamily={MONO} fill={SLU.ink2} textAnchor="middle">
            {fmtTick(t)}
          </text>
        </g>
      ))}
      <text x={xScale(0, width) - 6} y={height - 16} fontSize={9.5} fill={SLU.mute} fontFamily={FONT} textAnchor="end">◀ favors {groupB}</text>
      <text x={xScale(0, width) + 6} y={height - 16} fontSize={9.5} fill={SLU.mute} fontFamily={FONT} textAnchor="start">favors {groupA} ▶</text>
      <text x={width} y={12} fontSize={9.5} fill={SLU.mute} fontFamily={FONT} textAnchor="end" fontStyle="italic">
        {unit === 'weeks' ? 'weeks of learning' : 'SD (z-score)'}
      </text>
    </svg>
  );
}

// (UnitToggle removed — units live in the shared Controls card.)

function ForestRow({ s, mode, unit, plotW, rowH, stripe, dimmed }) {
  const [hover, setHover] = React.useState(false);
  const gap = mode === 'raw' ? s.raw_gap : s.shrunk_gap;
  const ci = mode === 'raw' ? s.raw_ci95 : s.shrunk_ci95;
  const innerW = plotW - 16;
  const xPct = (x) => `${((x - AXIS.min) / (AXIS.max - AXIS.min)) * 100}%`;
  const left = xPct(ci[0]);
  const right = xPct(ci[1]);
  const dotX = xPct(gap);
  const opacity = dimmed ? 0.42 : 1;
  const isNeg = gap < 0;
  const dotXNum = ((gap - AXIS.min) / (AXIS.max - AXIS.min)) * innerW;
  const tipOnLeft = dotXNum > innerW * 0.55;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: rowH,
      background: stripe ? '#FAFAFB' : '#fff',
    }}>
      <div style={{ width: 86, padding: '0 10px', fontFamily: MONO, fontSize: 12, color: dimmed ? SLU.mute : SLU.ink2,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
        {s.school_id}
        {!s.meets_min_cell && (
          <span style={{ fontFamily: FONT, fontSize: 9.5, padding: '1px 4px', borderRadius: 3,
                          background: SLU.gold, color: '#fff', letterSpacing: 0.5 }}>n*</span>
        )}
      </div>
      <NumCell w={60} value={s.n_a} dim={dimmed} mute />
      <NumCell w={60} value={s.n_b} dim={dimmed} mute />
      {/* Plot strip */}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
           onFocus={() => setHover(true)} onBlur={() => setHover(false)}
           tabIndex={0}
           role="img"
           aria-label={`${s.school_id}: gap ${fmtVal(gap, unit)} ${unit === 'weeks' ? 'weeks' : 'SD'}, 95% CI ${fmtCI(ci, unit)}, n ${s.n_a + s.n_b}, shrinkage B ${s.shrinkage_factor.toFixed(2)}`}
           style={{ width: plotW, padding: '0 8px', position: 'relative', height: rowH,
                    background: hover ? 'rgba(0, 61, 165, 0.04)' : 'transparent',
                    cursor: 'crosshair', outline: 'none',
                    boxShadow: hover ? `inset 0 0 0 1px ${SLU.blue}33` : 'none' }}>
        <div style={{ position: 'absolute', left: 8, right: 8, top: 0, bottom: 0 }}>
          {/* Zero rule */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: xPct(0), width: 1, background: SLU.rule }} />
          {/* District gap rule (Bayes prior) */}
          <div style={{ position: 'absolute', top: 2, bottom: 2, left: xPct(window.GAPS_DATA.meta.districtGap),
                        width: 1, borderLeft: `1px dashed ${SLU.gold}` }} />
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
        </div>
        {hover && (
          <Tooltip
            schoolId={s.school_id}
            gap={gap} ci={ci} unit={unit} mode={mode}
            n_a={s.n_a} n_b={s.n_b}
            B={s.shrinkage_factor}
            anchorLeftPct={dotX}
            tipOnLeft={tipOnLeft}
            isNeg={isNeg}
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

function NumCell({ w, value, dim, mute, bold, color, animated }) {
  const c = color || (mute ? SLU.mute : SLU.ink2);
  return (
    <div style={{
      width: w, padding: '0 10px', textAlign: 'right',
      fontFamily: MONO, fontSize: 11.5, fontWeight: bold ? 600 : 400,
      color: dim ? SLU.mute : c,
      transition: animated ? `color ${TRANSITION}` : 'none',
    }}>
      {animated ? <AnimatedNum value={value} /> : value}
    </div>
  );
}

// Crossfades old → new so the digit change reads as part of the same motion as the bars.
function AnimatedNum({ value }) {
  const [shown, setShown] = React.useState(value);
  const [opacity, setOpacity] = React.useState(1);
  React.useEffect(() => {
    if (value === shown) return;
    setOpacity(0);
    const t = setTimeout(() => { setShown(value); setOpacity(1); }, 180);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span style={{ display: 'inline-block', transition: 'opacity 180ms ease-out', opacity }}>
      {shown}
    </span>
  );
}

// Tooltip — anchored to the dot, flips side near the right edge so it doesn't clip.
// White-bg variant matches the demographics / achievement tooltip vocabulary.
function Tooltip({ schoolId, gap, ci, unit, mode, n_a, n_b, B, anchorLeftPct, tipOnLeft, isNeg }) {
  const offset = 14;
  const accent = isNeg ? SLU.neg : SLU.pos;
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
          {mode === 'shrunk' ? 'shrunken' : 'raw'}
        </span>
      </div>
      <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 16, fontWeight: 600, color: accent }}>
        {fmtVal(gap, unit)}
      </div>
      <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 11.5, color: SLU.ink2 }}>
        95% CI: {fmtCI(ci, unit)}
      </div>
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${SLU.rule2}`,
                    fontSize: 10.5, color: SLU.mute, display: 'flex', gap: 12, fontFamily: MONO }}>
        <span>nₐ {n_a}</span>
        <span>nᵇ {n_b}</span>
        <span>B {B.toFixed(2)}</span>
      </div>
    </div>
  );
}

function LegendSwatch() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="11" height="11" viewBox="-5.5 -5.5 11 11"><circle r="4" fill={SLU.pos} stroke="#fff" strokeWidth="1" /></svg>
      <span>● gap favors non-FRL</span>
      <svg width="11" height="11" viewBox="-5.5 -5.5 11 11" style={{ marginLeft: 8 }}>
        <polygon points="0,4 -4,-3 4,-3" fill={SLU.neg} stroke="#fff" strokeWidth="1" />
      </svg>
      <span>▼ gap favors FRL</span>
    </span>
  );
}

window.ForestFinal = ForestFinal;
window.SORTS_FINAL = SORTS_FINAL;
window.THRESHOLD_MODES = THRESHOLD_MODES;
