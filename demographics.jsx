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

// Demographics box-plot page.
// One box per group, side-by-side, horizontal layout (groups on y-axis is
// conceptually what the user asked for — i.e. demographic *category* on y;
// here the categories live on the y axis as labeled rows, residuals run
// left-to-right on a shared x axis). District reference line at 0; n shown
// per group; outlier dots beyond the whiskers.

const DEMO_PAGE_FONT = window.FONT;
const DEMO_PAGE_MONO = window.MONO;
const DEMO_PAGE_LABEL = window.LABEL;

function DemographicsPage({ sliceLabel, ctx }) {
  const demoVar = ctx.demoVar || 'frl';

  const districtData = window.DEMO_DATA && window.DEMO_DATA[demoVar];
  const groups = districtData ? districtData.groups : [];
  const label = districtData ? districtData.label : '';
  const districtMean = districtData ? districtData.districtMean : 0;

  return (
    <>
      <window.BriefHeader eyebrow="Demographics" slice={sliceLabel}
                   title="How does the residual distribution vary by subgroup?"
                   blurb={'For each group within the selected demographic, the box shows the inter-quartile range of student residuals against the district baseline; whiskers extend to 1.5 × IQR, with outlier students plotted individually. Compare medians, spread, and tails to see whether differences are concentrated in the middle of the distribution or in the tails.'} />
      <window.ControlsCard title="Controls"><DemographicsControls ctx={ctx} /></window.ControlsCard>
      <DemographicsFigure label={label} groups={groups} districtMean={districtMean} ctx={ctx} />
    </>
  );
}

function DemographicsControls({ ctx }) {
  const demoOptions = {};
  if (window.DEMO_SPECS) {
    Object.entries(window.DEMO_SPECS).forEach(([k, v]) => { demoOptions[k] = v.label; });
  }
  return (
    <window.ControlsGrid>
      <window.CGroup title="Slice">
        <window.CSegmented value={ctx.subject} onChange={ctx.setSubject} options={window.SUBJECTS} label="Subject" />
        <window.CSelect value={ctx.demo} onChange={ctx.setDemo} options={window.DEMOS} label="Subgroup pair" />
      </window.CGroup>
      <window.CGroup title="Estimate">
        <window.CSegmented value={ctx.estimate} onChange={ctx.setEstimate}
                    options={window.METHOD_OPTS} label="Method"
                    hint={window.METHOD_HINT} optionHints={window.METHOD_OPT_HINTS} />
        <window.CSegmented value={ctx.unit} onChange={ctx.setUnit}
                    options={{ z: 'SD', weeks: 'Weeks' }} label="Units"
                    hint={window.UNIT_HINT} />
      </window.CGroup>
      <window.CGroup title="Demographic">
        <window.CSelect value={ctx.demoVar || 'frl'} onChange={ctx.setDemoVar}
                 options={demoOptions} label="Variable" />
      </window.CGroup>
    </window.ControlsGrid>
  );
}

// CSS transition applied to every SVG geometry attribute we tween between
// subject toggles. Geometry properties (x, y, x1, y1, x2, y2, cx, cy, width)
// are CSS-animatable in all modern evergreen browsers; older engines fall
// back to a hard cut rather than breaking.
const DEMO_TWEEN = '460ms cubic-bezier(0.32, 0.72, 0.24, 1)';
const DEMO_TRANSITION = {
  transition: `x ${DEMO_TWEEN}, y ${DEMO_TWEEN}, x1 ${DEMO_TWEEN}, y1 ${DEMO_TWEEN}, x2 ${DEMO_TWEEN}, y2 ${DEMO_TWEEN}, cx ${DEMO_TWEEN}, cy ${DEMO_TWEEN}, width ${DEMO_TWEEN}, transform ${DEMO_TWEEN}, fill ${DEMO_TWEEN}, stroke ${DEMO_TWEEN}`,
};

function DemographicsFigure({ label, groups, districtMean = 0, ctx }) {
  const SLU = window.SLU;
  const [hover, setHover] = React.useState(null); // {gKey, oi, px, py, record, boxStroke}
  if (!groups || groups.length === 0) {
    return <div style={{ background: '#fff', border: `1px solid ${SLU.rule2}`, borderRadius: 8,
                          padding: 40, color: SLU.mute, fontSize: 13 }}>No data.</div>;
  }

  const unit = ctx.unit || 'z';
  // No grade context here — student-level residuals are pooled across grades,
  // so weeksPerSD returns the year × subject average. Subject defaults via
  // window.WOL_OPTS (set by app-shell).
  const toUnit = (v) => unit === 'weeks' ? window.zToWeeks(v) : v;
  const unitLabel = unit === 'weeks' ? 'weeks' : 'SD';
  const fmt = (v) => {
    const x = toUnit(v);
    return (x >= 0 ? '+' : '') + x.toFixed(2);
  };

  // x scale tracks actual residual values — not forced symmetric around 0.
  let xMin = Infinity, xMax = -Infinity;
  groups.forEach(g => {
    xMin = Math.min(xMin, g.whiskerLo, ...((g.outliers || []).map(o => typeof o === 'number' ? o : o.residual)));
    xMax = Math.max(xMax, g.whiskerHi, ...((g.outliers || []).map(o => typeof o === 'number' ? o : o.residual)));
  });
  const span = xMax - xMin;
  const pad = span * 0.06;
  xMin -= pad;
  xMax += pad;
  const xLo = xMin, xHi = xMax;

  const width = 920;
  const leftPad = 220; // group label column
  const rightPad = 140; // stats column
  const topPad = 36;
  const bottomPad = 44;
  const rowH = 84;
  const plotW = width - leftPad - rightPad;
  const height = topPad + groups.length * rowH + bottomPad;

  const xToPx = (v) => leftPad + ((toUnit(v) - toUnit(xLo)) / (toUnit(xHi) - toUnit(xLo))) * plotW;
  const meanPx = xToPx(districtMean);

  // x-axis ticks — nice round numbers within the data range. In weeks mode,
  // the step scales with the active conversion factor so half-SD-equivalent
  // ticks land on round-week multiples.
  const tickStep = unit === 'weeks'
    ? Math.max(5, Math.round(window.zToWeeks(0.5) / 5) * 5)
    : 0.5;
  const tickStart = Math.ceil(toUnit(xLo) / tickStep) * tickStep;
  const tickEnd = Math.floor(toUnit(xHi) / tickStep) * tickStep;
  const ticks = [];
  for (let t = tickStart; t <= tickEnd + 1e-9; t += tickStep) {
    ticks.push(Number(t.toFixed(6)));
  }

  return (
    <section style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
      padding: '18px 22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                     gap: 12, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
            Student residuals by {label}
          </div>
          <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
            District-wide · all schools pooled
            <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
            box = IQR, whisker = 1.5 × IQR, dots = outliers, vertical line = group median
          </div>
        </div>
        <span style={{ fontSize: 11, fontFamily: DEMO_PAGE_LABEL, color: SLU.mute,
                        textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
          x: residual ({unitLabel})
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {/* district mean reference — computed from pooled student residuals */}
        {toUnit(xLo) <= toUnit(districtMean) && toUnit(districtMean) <= toUnit(xHi) && (
          <g>
            <line x1={meanPx} x2={meanPx} y1={topPad - 6} y2={height - bottomPad + 4}
                  stroke={SLU.ink2} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.7}
                  style={DEMO_TRANSITION} />
            <text x={meanPx} y={topPad - 12} fontSize={10} fontFamily={DEMO_PAGE_LABEL}
                  fill={SLU.ink2} textAnchor="middle" fontWeight={700}
                  style={{ ...DEMO_TRANSITION, textTransform: 'uppercase', letterSpacing: 1.0 }}>
              District mean {(toUnit(districtMean) >= 0 ? '+' : '−') + Math.abs(toUnit(districtMean)).toFixed(2)}
            </text>
          </g>
        )}

        {/* group rows */}
        {groups.map((g, i) => {
          const cy = topPad + i * rowH + rowH / 2;
          const boxTop = cy - 18;
          const boxH = 36;
          const x_q1 = xToPx(g.q1);
          const x_q3 = xToPx(g.q3);
          const x_med = xToPx(g.median);
          const x_mean = xToPx(g.mean);
          const x_wLo = xToPx(g.whiskerLo);
          const x_wHi = xToPx(g.whiskerHi);
          const above = g.median >= 0;
          // Match the residual color vocabulary used everywhere else:
          // blue = above district mean, rust (SLU.neg) = below.
          const boxFill = above ? 'rgba(0,61,165,0.10)' : 'rgba(124,58,18,0.12)';
          const boxStroke = above ? SLU.blue : SLU.neg;

          return (
            <g key={g.key}>
              {/* row guide (subtle) */}
              <line x1={leftPad} x2={leftPad + plotW} y1={cy + rowH / 2 - 2} y2={cy + rowH / 2 - 2}
                    stroke={SLU.rule2} strokeWidth={1} opacity={i === groups.length - 1 ? 0 : 1} />

              {/* group label + meta */}
              <text x={leftPad - 14} y={cy - 4} fontSize={14} fontWeight={700}
                    textAnchor="end" fill={SLU.ink} fontFamily={DEMO_PAGE_FONT}>
                {g.label}
              </text>
              <text x={leftPad - 14} y={cy + 14} fontSize={11} fill={SLU.mute}
                    textAnchor="end" fontFamily={DEMO_PAGE_MONO}>
                n={g.n.toLocaleString()}
              </text>

              {/* whisker */}
              <line x1={x_wLo} x2={x_wHi} y1={cy} y2={cy} stroke={boxStroke} strokeWidth={1.4} style={DEMO_TRANSITION} />
              <line x1={x_wLo} x2={x_wLo} y1={cy - 7} y2={cy + 7} stroke={boxStroke} strokeWidth={1.4} style={DEMO_TRANSITION} />
              <line x1={x_wHi} x2={x_wHi} y1={cy - 7} y2={cy + 7} stroke={boxStroke} strokeWidth={1.4} style={DEMO_TRANSITION} />

              {/* box */}
              <rect x={x_q1} y={boxTop} width={Math.max(2, x_q3 - x_q1)} height={boxH}
                    fill={boxFill} stroke={boxStroke} strokeWidth={1.4} style={DEMO_TRANSITION} />

              {/* median */}
              <line x1={x_med} x2={x_med} y1={boxTop} y2={boxTop + boxH}
                    stroke={boxStroke} strokeWidth={2.4} style={DEMO_TRANSITION} />

              {/* mean diamond (subtle) */}
              <g transform={`translate(${x_mean} ${cy})`} style={DEMO_TRANSITION}>
                <polygon points="0,-5 5,0 0,5 -5,0" fill="#fff" stroke={boxStroke} strokeWidth={1.2} />
              </g>

              {/* outliers */}
              {(g.outliers || []).map((o, oi) => {
                const rec = typeof o === 'number' ? { residual: o } : o;
                const px = xToPx(rec.residual);
                const isHover = hover && hover.gKey === g.key && hover.oi === oi;
                return (
                  <circle key={oi} cx={px} cy={cy} r={isHover ? 4.2 : 2.4}
                          fill={boxStroke} fillOpacity={isHover ? 0.95 : 0.55}
                          stroke={isHover ? '#fff' : 'none'} strokeWidth={isHover ? 1.4 : 0}
                          style={{ ...DEMO_TRANSITION, cursor: 'pointer' }}
                          onMouseEnter={() => setHover({ gKey: g.key, oi, px, py: cy, record: rec, boxStroke, groupLabel: g.label })}
                          onMouseLeave={() => setHover(h => (h && h.gKey === g.key && h.oi === oi) ? null : h)} />
                );
              })}

              {/* stats column on the right */}
              <text x={leftPad + plotW + 14} y={cy - 4} fontSize={12} fontFamily={DEMO_PAGE_MONO}
                    fill={SLU.ink} fontWeight={600}>
                med {fmt(g.median)}
              </text>
              <text x={leftPad + plotW + 14} y={cy + 12} fontSize={11} fontFamily={DEMO_PAGE_MONO}
                    fill={SLU.mute}>
                IQR {(toUnit(g.q3) - toUnit(g.q1)).toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* x-axis */}
        <line x1={leftPad} x2={leftPad + plotW}
              y1={height - bottomPad + 4} y2={height - bottomPad + 4}
              stroke={SLU.rule} strokeWidth={1} />
        {ticks.map(t => {
          const px = leftPad + ((t - toUnit(xLo)) / (toUnit(xHi) - toUnit(xLo))) * plotW;
          return (
            <g key={t}>
              <line x1={px} x2={px} y1={height - bottomPad + 4} y2={height - bottomPad + 8}
                    stroke={SLU.rule} strokeWidth={1} />
              <text x={px} y={height - bottomPad + 22} fontSize={10} fontFamily={DEMO_PAGE_MONO}
                    fill={SLU.mute} textAnchor="middle">
                {t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(unit === 'weeks' ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* outlier tooltip — drawn last so it sits above everything */}
        {hover && hover.record && (() => {
          const r = hover.record;
          const tipW = 168, tipH = 64;
          const px = hover.px;
          const py = hover.py;
          // Flip the tooltip to whichever side has room.
          const placeRight = px + tipW + 16 <= width;
          const tx = placeRight ? px + 10 : px - tipW - 10;
          const ty = Math.max(4, Math.min(height - tipH - 4, py - tipH / 2));
          const resid = (toUnit(r.residual) >= 0 ? '+' : '−') + Math.abs(toUnit(r.residual)).toFixed(2);
          return (
            <g pointerEvents="none">
              <line x1={px} x2={placeRight ? tx : tx + tipW} y1={py} y2={ty + tipH / 2}
                    stroke={hover.boxStroke} strokeWidth={1} opacity={0.6} />
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={5}
                    fill="#fff" stroke={hover.boxStroke} strokeWidth={1.2}
                    filter="drop-shadow(0 2px 6px rgba(15,23,42,0.12))" />
              <text x={tx + 10} y={ty + 16} fontSize={11.5} fontFamily={DEMO_PAGE_MONO}
                    fontWeight={700} fill={SLU.ink}>
                {r.student_id || 'student'}
              </text>
              <text x={tx + tipW - 10} y={ty + 16} fontSize={11} fontFamily={DEMO_PAGE_MONO}
                    fill={hover.boxStroke} textAnchor="end" fontWeight={700}>
                {resid} {unitLabel}
              </text>
              <line x1={tx + 8} x2={tx + tipW - 8} y1={ty + 24} y2={ty + 24}
                    stroke={SLU.rule2} strokeWidth={1} />
              <text x={tx + 10} y={ty + 38} fontSize={10.5} fontFamily={DEMO_PAGE_MONO} fill={SLU.ink2}>
                {hover.groupLabel}
              </text>
              <text x={tx + 10} y={ty + 52} fontSize={10} fontFamily={DEMO_PAGE_MONO} fill={SLU.mute}>
                {r.school_id || ''}{r.grade ? ` · Gr ${r.grade}` : ''}
              </text>
            </g>
          );
        })()}
      </svg>
    </section>
  );
}

window.DemographicsPage = DemographicsPage;
