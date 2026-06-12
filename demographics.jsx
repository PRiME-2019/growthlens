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
// EVERY demographic group at once, in labeled sections on one shared x axis —
// the district-level companion to the gap page's school-by-school view (the
// intro points there for the drill-down). The two race comparisons share a
// White reference group with identical numbers, so they merge into one Race
// section. District reference line at the pooled mean; n per group; outlier
// dots beyond the whiskers.

const DEMO_PAGE_FONT = window.FONT;
const DEMO_PAGE_MONO = window.MONO;
const DEMO_PAGE_LABEL = window.LABEL;

function DemographicsPage({ sliceLabel, ctx }) {
  const dd = window.DEMO_DATA || {};
  // Sections come from engine/deck.js (shared with the Export deck): one per
  // demographic dimension, shared White reference merged into one Race section.
  const sections = window.GLDeck.buildDemoSections(dd);
  const allGroups = sections.flatMap((s) => s.groups);
  // Default to 0 (the residual scale's natural center) if the dataset doesn't
  // carry a districtMean, so the reference line never silently disappears.
  const first = Object.values(dd).find((v) => v && v.districtMean != null);
  const districtMean = first ? first.districtMean : 0;

  return (
    <>
      <window.BriefHeader eyebrow="Growth by student group" slice={sliceLabel}
                   title="How growth varies from group to group"
                   blurb={<>For each group, the box shows the middle of the pack and the diamond
                     marks the typical student; the whiskers and dots show the full spread. Compare
                     the typical student and the spread across groups to see whether differences sit
                     in the middle or out in the tails. To see how any of these gaps plays out school
                     by school, open{' '}
                     <a href="#" onClick={(e) => { e.preventDefault(); ctx.setPage('gap'); }}
                        style={{ color: window.SLU.blue, fontWeight: 600 }}>Group gaps by school</a>.</>} />
      <OverviewCardDemo groups={allGroups} ctx={ctx} />
      <DemographicsFigure sections={sections} districtMean={districtMean} ctx={ctx} />
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
// headline numbers plus generated takeaways across EVERY group, tracking the
// global units setting.
function OverviewCardDemo({ groups, ctx }) {
  if (!groups || groups.length === 0) return null;
  const SLU = window.SLU;
  const unit = ctx.unit || 'z';
  const isWk = unit === 'weeks';
  const fmtV = (v) => {
    const x = isWk ? window.zToWeeks(v) : v;
    return (x >= 0 ? '+' : '−') + (isWk ? Math.abs(Math.round(x)) : Math.abs(x).toFixed(2));
  };
  // Spelled out, with the singular handled — "1 week", "12 weeks".
  const unitTagFor = (v) => isWk
    ? (Math.abs(Math.round(window.zToWeeks(v))) === 1 ? 'week' : 'weeks')
    : 'SD';
  const sorted = [...groups].sort((a, b) => b.median - a.median);
  const hi = sorted[0], lo = sorted[sorted.length - 1];
  // Every grouping slices the same students, so "students included" is the
  // size of the largest single pairing, not the sum across sections.
  const dd = window.DEMO_DATA || {};
  const totalN = Math.max(0, ...Object.values(dd).map((v) =>
    ((v && v.groups) || []).reduce((t, g) => t + g.n, 0)));
  const ds = window.GLStore && window.GLStore.getActiveMeta();
  const yr = (ds && (ds.latestYear || ds.year)) || '2024–25';
  const takeaways = window.GLInsights
    ? window.GLInsights.demographicsTakeaways({ data: { groups }, fmt: { val: (v) => `${fmtV(v)} ${unitTagFor(v)}` } })
    : [];
  const big = { fontSize: 36, fontWeight: 600, fontFamily: DEMO_PAGE_MONO,
                color: SLU.ink, letterSpacing: -1.0, lineHeight: 1 };
  return (
    <window.AuxCard title={`Overview · ${(ctx.subject || 'math').toUpperCase()} · growth by group · ${yr}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 36px', alignItems: 'flex-start' }}>
        {groups.length >= 2 && (
          <div style={{ minWidth: 220 }}>
            <window.StatLabel>Largest difference between groups</window.StatLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={big}>{fmtV(hi.median - lo.median)}</span>
              <span style={{ fontSize: 13, color: SLU.mute, fontWeight: 500 }}>{unitTagFor(hi.median - lo.median)}</span>
            </div>
            <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
              the typical {hi.label} student vs. the typical {lo.label} student — the
              farthest-apart pair of groups below
            </div>
          </div>
        )}
        {totalN > 0 && (
          <div style={{ minWidth: 180 }}>
            <window.StatLabel>Students included</window.StatLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={big}>{totalN.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, color: SLU.mute, marginTop: 6, lineHeight: 1.4 }}>
              every grouping below draws from the same students
            </div>
          </div>
        )}
      </div>
      <window.KeyTakeaways items={takeaways} />
    </window.AuxCard>
  );
}

function DemographicsFigure({ sections, districtMean = 0, ctx }) {
  const SLU = window.SLU;
  const [rowHover, setRowHover] = React.useState(null); // whole-row hover/focus: row.id
  const [measureRef, measuredW] = window.useMeasuredWidth(920);
  const allGroups = sections.flatMap((s) => s.groups);
  if (allGroups.length === 0) {
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
  allGroups.forEach(g => {
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

  // Native pixel width from the card (no viewBox scaling — keeps row heights
  // and type the same size as every other page); floor + sideways scroll
  // protect the fixed label/stats columns at narrow widths.
  const width = Math.max(700, measuredW);
  const leftPad = 220; // group label column
  const rightPad = 140; // stats column
  const topPad = 36;
  const bottomPad = 58;  // ticks + the axis title beneath them
  const rowH = 76;
  const headerH = 38;

  // Lay out section headers and group rows top to bottom.
  const placed = [];
  let yCursor = topPad;
  sections.forEach((sec) => {
    placed.push({ type: 'header', title: sec.title, y: yCursor, h: headerH });
    yCursor += headerH;
    sec.groups.forEach((g, gi) => {
      placed.push({ type: 'group', g, id: `${sec.title}:${g.label}`, y: yCursor, h: rowH,
                    lastInSection: gi === sec.groups.length - 1 });
      yCursor += rowH;
    });
  });
  const plotW = width - leftPad - rightPad;
  const height = yCursor + bottomPad;

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
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2, fontFamily: DEMO_PAGE_FONT }}>
          Growth for every student group, side by side
        </h2>
        <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
          The whole district at once — each box covers the middle half of that group’s
          students, the diamond marks the typical student, and the dots are individual
          students far from the pack.
          <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
          Hover any group for its numbers.
        </div>
      </div>

      <div ref={measureRef} style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block' }}
           role="img" aria-label={`Box plots of growth for every demographic group, ${allGroups.length} groups in ${sections.length} sections`}>
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

        {/* section headers */}
        {placed.filter((r) => r.type === 'header').map((r) => (
          <g key={`h:${r.title}`}>
            <text x={2} y={r.y + r.h - 12} fontSize={10.5} fontFamily={DEMO_PAGE_LABEL}
                  fill={SLU.mute} fontWeight={700}
                  style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
              {r.title}
            </text>
            <line x1={2} x2={width - 2} y1={r.y + r.h - 4} y2={r.y + r.h - 4}
                  stroke={SLU.rule2} strokeWidth={1} />
          </g>
        ))}

        {/* group rows */}
        {placed.filter((r) => r.type === 'group').map((row) => {
          const g = row.g;
          const cy = row.y + rowH / 2;
          // Same 10-student floor as everywhere else — the Upload FAQ promises
          // too-small groups are flagged wherever they appear.
          const tooFew = g.n < 10;
          const boxTop = cy - 18;
          const boxH = 36;
          const x_q1 = xToPx(g.q1);
          const x_q3 = xToPx(g.q3);
          const x_med = xToPx(g.median);
          const x_wLo = xToPx(g.whiskerLo);
          const x_wHi = xToPx(g.whiskerHi);
          const above = g.median >= 0;
          // Match the residual color vocabulary used everywhere else:
          // blue = above district mean, rust (SLU.neg) = below.
          const boxFill = above ? 'rgba(0,61,165,0.10)' : 'rgba(124,58,18,0.12)';
          const boxStroke = above ? SLU.blue : SLU.neg;
          const rowActive = rowHover === row.id;

          return (
            <g key={row.id} opacity={tooFew ? 0.45 : 1}>
              {/* whole-row hover/focus target — the row is the only
                  interactive unit; everything drawn on it is decorative */}
              <rect x={0} y={row.y} width={width} height={rowH} fill="transparent"
                    tabIndex={0} className="gl-focus" role="img"
                    aria-label={`${g.label}: typical student ${fmt(g.median)} ${unitLabel}, middle half ${fmt(g.q1)} to ${fmt(g.q3)}, n=${g.n.toLocaleString()}`}
                    onMouseEnter={() => setRowHover(row.id)}
                    onMouseLeave={() => setRowHover((r) => (r === row.id ? null : r))}
                    onFocus={() => setRowHover(row.id)}
                    onBlur={() => setRowHover((r) => (r === row.id ? null : r))} />
              {rowActive && (
                <rect x={2} y={row.y + 1} width={width - 4} height={rowH - 2} rx={4}
                      fill="rgba(0, 61, 165, 0.04)" pointerEvents="none" />
              )}
              {/* Decorative row content is pointer-transparent so the hover
                  target underneath sees the cursor everywhere in the row. */}
              <g pointerEvents="none">
              {/* row guide (subtle) — skipped on a section's last row */}
              {!row.lastInSection && (
                <line x1={leftPad} x2={leftPad + plotW} y1={row.y + rowH - 2} y2={row.y + rowH - 2}
                      stroke={SLU.rule2} strokeWidth={1} />
              )}

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

              {/* median diamond — the typical student. The mean is deliberately
                  not drawn: a handful of outlier students can drag it, which is
                  exactly the misread the box plot is here to prevent. */}
              <g transform={`translate(${x_med} ${cy})`} style={DEMO_TRANSITION}>
                <polygon points="0,-5 5,0 0,5 -5,0" fill="#fff" stroke={boxStroke} strokeWidth={1.2} />
              </g>
              </g>

              {/* outliers — individual students far from the pack; decorative
                  only, so the whole-row hover works across them too */}
              {(g.outliers || []).map((o, oi) => {
                const rec = typeof o === 'number' ? { residual: o } : o;
                const px = xToPx(rec.residual);
                return (
                  <circle key={oi} cx={px} cy={cy} r={2.4} pointerEvents="none"
                          fill={boxStroke} fillOpacity={0.55} style={DEMO_TRANSITION} />
                );
              })}

              {/* stats column on the right */}
              <g pointerEvents="none">
                <text x={leftPad + plotW + 14} y={cy - 4} fontSize={12} fontFamily={DEMO_PAGE_MONO}
                      fill={SLU.ink} fontWeight={600}>
                  med {fmt(g.median)}
                </text>
                <text x={leftPad + plotW + 14} y={cy + 12} fontSize={11} fontFamily={DEMO_PAGE_MONO}
                      fill={SLU.mute}>
                  IQR {(toUnit(g.q3) - toUnit(g.q1)).toFixed(2)}
                </text>
              </g>
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

        {/* row stats tooltip */}
        {rowHover && (() => {
          const row = placed.find((r) => r.type === 'group' && r.id === rowHover);
          if (!row) return null;
          const g = row.g;
          const cy = row.y + rowH / 2;
          const stroke = g.median >= 0 ? SLU.blue : SLU.neg;
          const tipW = 212, tipH = 80;
          const anchorR = xToPx(g.whiskerHi);
          const placeRight = anchorR + tipW + 24 <= width;
          const tx = Math.max(4, placeRight ? anchorR + 14 : xToPx(g.whiskerLo) - tipW - 14);
          const ty = Math.max(4, Math.min(height - tipH - 4, cy - tipH / 2));
          const line = (label, value, dy) => (
            <g key={label}>
              <text x={tx + 10} y={ty + dy} fontSize={10.5} fontFamily={DEMO_PAGE_FONT} fill={SLU.mute}>{label}</text>
              <text x={tx + tipW - 10} y={ty + dy} fontSize={10.5} fontFamily={DEMO_PAGE_MONO}
                    fill={SLU.ink2} textAnchor="end" fontWeight={600}>{value}</text>
            </g>
          );
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={5}
                    fill="#fff" stroke={stroke} strokeWidth={1.2}
                    filter="drop-shadow(0 2px 6px rgba(15,23,42,0.12))" />
              <text x={tx + 10} y={ty + 18} fontSize={11.5} fontFamily={DEMO_PAGE_FONT}
                    fontWeight={700} fill={SLU.ink}>
                {g.label}
              </text>
              <text x={tx + tipW - 10} y={ty + 18} fontSize={10.5} fontFamily={DEMO_PAGE_MONO}
                    fill={SLU.mute} textAnchor="end">
                n={g.n.toLocaleString()}
              </text>
              <line x1={tx + 8} x2={tx + tipW - 8} y1={ty + 26} y2={ty + 26}
                    stroke={SLU.rule2} strokeWidth={1} />
              {line('Typical student', `${fmt(g.median)} ${unitLabel}`, 42)}
              {line('Middle half', `${fmt(g.q1)} to ${fmt(g.q3)}`, 58)}
              {line('Full spread', `${fmt(g.whiskerLo)} to ${fmt(g.whiskerHi)}`, 74)}
            </g>
          );
        })()}
      </svg>
      </div>
    </section>
  );
}

window.DemographicsPage = DemographicsPage;
