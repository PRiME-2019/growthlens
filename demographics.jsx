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
  // Clamp to a demographic that exists in the active dataset (uploads expose only the engine's
  // 5 comparisons; a stale demo key like 'race' would otherwise render "No data").
  const dd = window.DEMO_DATA || {};
  const demoVar = dd[ctx.demoVar] ? ctx.demoVar : (dd.frl ? 'frl' : Object.keys(dd)[0]);
  // Write the clamp back into ctx so stale state can't silently flip the figure
  // when the dataset changes again later.
  React.useEffect(() => { if (demoVar && demoVar !== ctx.demoVar) ctx.setDemoVar(demoVar); });

  const districtData = dd[demoVar];
  const groups = districtData ? districtData.groups : [];
  const label = districtData ? districtData.label : '';
  // Default to 0 (the residual scale's natural center) if the dataset doesn't
  // carry a districtMean, so the reference line never silently disappears.
  const districtMean = (districtData && districtData.districtMean != null) ? districtData.districtMean : 0;

  return (
    <>
      <window.BriefHeader eyebrow="Demographics" slice={sliceLabel}
                   title="How growth varies from group to group"
                   blurb={'For each group, the box shows the middle of the pack and the line shows the typical student; the whiskers and dots show the full spread. Compare the typical student and the spread across groups to see whether differences sit in the middle or out in the tails.'} />
      <OverviewCardDemo data={districtData} label={label} ctx={ctx} />
      <DemographicsFigure label={label} groups={groups} districtMean={districtMean}
                          demoVar={demoVar} ctx={ctx} />
    </>
  );
}

// CSS transition applied to every SVG geometry attribute we tween between
// subject toggles. Geometry properties (x, y, x1, y1, x2, y2, cx, cy, width)
// are CSS-animatable in all modern evergreen browsers; older engines fall
// back to a hard cut rather than breaking.
const DEMO_TWEEN = window.MOTION_OK === false ? '0ms' : '460ms cubic-bezier(0.32, 0.72, 0.24, 1)';
const DEMO_TRANSITION = {
  transition: `x ${DEMO_TWEEN}, y ${DEMO_TWEEN}, x1 ${DEMO_TWEEN}, y1 ${DEMO_TWEEN}, x2 ${DEMO_TWEEN}, y2 ${DEMO_TWEEN}, cx ${DEMO_TWEEN}, cy ${DEMO_TWEEN}, width ${DEMO_TWEEN}, transform ${DEMO_TWEEN}, fill ${DEMO_TWEEN}, stroke ${DEMO_TWEEN}`,
};

// District-level context — same scaffolding as the other overview cards:
// headline numbers plus generated takeaways, tracking the global units and
// the group chosen on the figure card below.
function OverviewCardDemo({ data, label, ctx }) {
  if (!data || !data.groups || data.groups.length === 0) return null;
  const SLU = window.SLU;
  const unit = ctx.unit || 'z';
  const isWk = unit === 'weeks';
  const fmtV = (v) => {
    const x = isWk ? window.zToWeeks(v) : v;
    return (x >= 0 ? '+' : '−') + (isWk ? Math.abs(Math.round(x)) : Math.abs(x).toFixed(2));
  };
  const unitTag = isWk ? 'wk' : 'SD';
  const groups = data.groups;
  const sorted = [...groups].sort((a, b) => b.median - a.median);
  const hi = sorted[0], lo = sorted[sorted.length - 1];
  const totalN = groups.reduce((t, g) => t + g.n, 0);
  const ds = window.GLStore && window.GLStore.getActiveMeta();
  const yr = (ds && (ds.latestYear || ds.year)) || '2024–25';
  const takeaways = window.GLInsights
    ? window.GLInsights.demographicsTakeaways({ data, fmt: { val: (v) => `${fmtV(v)} ${unitTag}` } })
    : [];
  const big = { fontSize: 36, fontWeight: 600, fontFamily: DEMO_PAGE_MONO,
                color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 };
  return (
    <window.AuxCard title={`Overview · ${(ctx.subject || 'math').toUpperCase()} · growth by ${label} · ${yr}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 36px', alignItems: 'flex-start' }}>
        {groups.length >= 2 && (
          <div style={{ minWidth: 220 }}>
            <window.StatLabel>Typical-student difference</window.StatLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={big}>{fmtV(hi.median - lo.median)}</span>
              <span style={{ fontSize: 13, color: SLU.mute, fontWeight: 500 }}>{unitTag}</span>
            </div>
            <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
              {hi.label} median minus {lo.label} median
            </div>
          </div>
        )}
        <div style={{ minWidth: 180 }}>
          <window.StatLabel>Students in view</window.StatLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={big}>{totalN.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4, fontFamily: DEMO_PAGE_MONO }}>
            {groups.map((g) => `${g.label} ${g.n.toLocaleString()}`).join(' · ')}
          </div>
        </div>
      </div>
      <window.KeyTakeaways items={takeaways} />
    </window.AuxCard>
  );
}

// Inline group picker for the card header — options come from the active
// dataset's comparisons (window.DEMO_SPECS).
function GroupSelect({ value, onChange }) {
  const SLU = window.SLU;
  const options = {};
  if (window.DEMO_SPECS) {
    Object.entries(window.DEMO_SPECS).forEach(([k, v]) => { options[k] = v.label; });
  }
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: DEMO_PAGE_LABEL, color: SLU.mute,
                      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        Group
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        fontFamily: DEMO_PAGE_FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
        border: `1px solid ${SLU.rule}`, borderRadius: 999, background: '#fff', cursor: 'pointer',
      }}>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}

function DemographicsFigure({ label, groups, districtMean = 0, demoVar, ctx }) {
  const SLU = window.SLU;
  const [hover, setHover] = React.useState(null); // {gKey, oi, px, py, record, boxStroke}
  if (!groups || groups.length === 0) {
    return <div style={{ background: '#fff', border: `1px solid ${SLU.rule2}`, borderRadius: 8,
                          padding: 40, color: SLU.mute, fontSize: 13 }}>No data to show yet.</div>;
  }

  const unit = ctx.unit || 'z';
  // No grade context here — student-level residuals are pooled across grades,
  // so weeksPerSD returns the year × subject average. Subject defaults via
  // window.WOL_OPTS (set by app-shell).
  const toUnit = (v) => unit === 'weeks' ? window.zToWeeks(v) : v;
  const unitLabel = unit === 'weeks' ? 'weeks' : 'SD';
  const fmt = (v) => {
    const x = toUnit(v);
    return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
  };

  // x scale tracks actual residual values — not forced symmetric around 0.
  let xMin = Infinity, xMax = -Infinity;
  groups.forEach(g => {
    xMin = Math.min(xMin, g.whiskerLo, ...((g.outliers || []).map(o => typeof o === 'number' ? o : o.residual)));
    xMax = Math.max(xMax, g.whiskerHi, ...((g.outliers || []).map(o => typeof o === 'number' ? o : o.residual)));
  });
  let span = xMax - xMin;
  if (!(span > 0) || !isFinite(span)) {
    // Degenerate domain (all values identical, or no whisker data at all) —
    // widen it rather than divide by zero into NaN coordinates.
    xMin = (isFinite(xMin) ? xMin : 0) - 0.5;
    xMax = (isFinite(xMax) ? xMax : 0) + 0.5;
    span = xMax - xMin;
  }
  const pad = span * 0.06;
  xMin -= pad;
  xMax += pad;
  const xLo = xMin, xHi = xMax;

  const width = 920;
  const leftPad = 220; // group label column
  const rightPad = 140; // stats column
  const topPad = 36;
  const bottomPad = 58;  // ticks + the axis title beneath them
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
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2, fontFamily: DEMO_PAGE_FONT }}>
            Growth by {label}
          </h2>
          <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
            Across the whole district
            <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
            box = the middle half of students, line = the typical student, diamond = the average, dots = individual outliers
          </div>
        </div>
        <GroupSelect value={demoVar} onChange={ctx.setDemoVar} />
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}
           role="img" aria-label={`Box plots of growth by ${label}, ${groups.length} groups`}>
        {/* district mean reference — computed from pooled student residuals */}
        {toUnit(xLo) <= toUnit(districtMean) && toUnit(districtMean) <= toUnit(xHi) && (
          <g>
            <line x1={meanPx} x2={meanPx} y1={topPad - 6} y2={height - bottomPad + 4}
                  stroke={SLU.ink2} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.7}
                  style={DEMO_TRANSITION} />
            <text x={meanPx} y={topPad - 12} fontSize={10} fontFamily={DEMO_PAGE_LABEL}
                  fill={SLU.ink2} textAnchor="middle" fontWeight={700}
                  style={{ ...DEMO_TRANSITION, textTransform: 'uppercase', letterSpacing: 1.0 }}>
              District average {(toUnit(districtMean) >= 0 ? '+' : '−') + Math.abs(toUnit(districtMean)).toFixed(2)}
            </text>
          </g>
        )}

        {/* group rows */}
        {groups.map((g, i) => {
          const cy = topPad + i * rowH + rowH / 2;
          // Same 10-student floor as everywhere else — the Upload FAQ promises
          // too-small groups are flagged wherever they appear.
          const tooFew = g.n < 10;
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
            <g key={g.key} opacity={tooFew ? 0.45 : 1}>
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
                n={g.n.toLocaleString()}{tooFew && <tspan fill={SLU.gold} fontWeight="700"> · too few</tspan>}
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

              {/* outliers — visible dot rides inside a generous invisible hit
                  area, since a ~5px target is hard to hover precisely */}
              {(g.outliers || []).map((o, oi) => {
                const rec = typeof o === 'number' ? { residual: o } : o;
                const px = xToPx(rec.residual);
                const isHover = hover && hover.gKey === g.key && hover.oi === oi;
                return (
                  <g key={oi} style={{ cursor: 'pointer' }}
                     onMouseEnter={() => setHover({ gKey: g.key, oi, px, py: cy, record: rec, boxStroke, groupLabel: g.label })}
                     onMouseLeave={() => setHover(h => (h && h.gKey === g.key && h.oi === oi) ? null : h)}>
                    <circle cx={px} cy={cy} r={9} fill="transparent" />
                    <circle cx={px} cy={cy} r={isHover ? 4.2 : 2.4}
                            fill={boxStroke} fillOpacity={isHover ? 0.95 : 0.55}
                            stroke={isHover ? '#fff' : 'none'} strokeWidth={isHover ? 1.4 : 0}
                            style={DEMO_TRANSITION} pointerEvents="none" />
                  </g>
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
        {/* Axis title sits with the axis it describes, not up in the header */}
        <text x={leftPad + plotW / 2} y={height - 8} fontSize={11}
              fontFamily={DEMO_PAGE_LABEL} fill={SLU.ink2} textAnchor="middle"
              fontWeight={700} style={{ textTransform: 'uppercase', letterSpacing: 1.0 }}>
          Growth vs. expected ({unitLabel})
        </text>

        {/* outlier tooltip — drawn last so it sits above everything. Uploaded
            outliers are bare residuals (no student/school ids), so the tooltip
            collapses to a compact value + group line instead of placeholders. */}
        {hover && hover.record && (() => {
          const r = hover.record;
          const hasIds = !!(r.student_id || r.school_id);
          const tipW = 168, tipH = hasIds ? 64 : 28;
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
              <text x={tx + 10} y={ty + 18} fontSize={11.5} fontFamily={DEMO_PAGE_MONO}
                    fontWeight={700} fill={SLU.ink}>
                {r.student_id || hover.groupLabel}
              </text>
              <text x={tx + tipW - 10} y={ty + 18} fontSize={11} fontFamily={DEMO_PAGE_MONO}
                    fill={hover.boxStroke} textAnchor="end" fontWeight={700}>
                {resid} {unitLabel}
              </text>
              {hasIds && (
                <g>
                  <line x1={tx + 8} x2={tx + tipW - 8} y1={ty + 24} y2={ty + 24}
                        stroke={SLU.rule2} strokeWidth={1} />
                  <text x={tx + 10} y={ty + 38} fontSize={10.5} fontFamily={DEMO_PAGE_MONO} fill={SLU.ink2}>
                    {hover.groupLabel}
                  </text>
                  <text x={tx + 10} y={ty + 52} fontSize={10} fontFamily={DEMO_PAGE_MONO} fill={SLU.mute}>
                    {r.school_id || ''}{r.grade ? ` · Gr ${r.grade}` : ''}
                  </text>
                </g>
              )}
            </g>
          );
        })()}
      </svg>
    </section>
  );
}

window.DemographicsPage = DemographicsPage;
