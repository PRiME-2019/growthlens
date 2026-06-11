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

// Achievement vs Growth scatter.
// Two levels: student (one dot per student, colored by school) and school
// (one dot per school, sized by n). Quadrants split at the district mean on
// both axes, with corner labels.

function AchievementPage({ sliceLabel, ctx }) {
  const level = ctx.achLevel || 'school';
  return (
    <>
      <window.BriefHeader eyebrow="Status & Growth" slice={sliceLabel}
        title="Where each school sits on both fronts"
        blurb={'Two views at once: where students scored this year along the bottom, and how much they grew compared with expectations up the side. The dashed lines mark the district average on each, splitting the chart into four corners — for example, schools that score lower but grow faster.'} />
      <AchievementFigure level={level} ctx={ctx} />
    </>
  );
}

// Two-option pill used on the figure card (same visual as the forest card's
// View toggle): [['school','School'],['student','Student']] etc.
const ACH_TWEEN = window.MOTION_OK === false ? '0ms' : '420ms cubic-bezier(0.32, 0.72, 0.24, 1)';
function PillToggle({ label, value, options, onChange }) {
  const SLU = window.SLU;
  const idx = Math.max(0, options.findIndex(([k]) => k === value));
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: window.LABEL, color: SLU.mute,
                      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        {label}
      </span>
      <div style={{ position: 'relative', display: 'inline-flex', background: SLU.rule2, borderRadius: 999, padding: 3 }}>
        <div style={{
          position: 'absolute', top: 3, bottom: 3, width: 'calc(50% - 3px)',
          left: idx === 0 ? 3 : '50%',
          background: '#fff', borderRadius: 999,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          transition: `left ${ACH_TWEEN}`,
        }} />
        {options.map(([k, text]) => {
          const active = k === value;
          return (
            <button key={k} onClick={() => onChange(k)}
                    aria-pressed={active}
                    style={{
                      position: 'relative', zIndex: 1, border: 'none', background: 'transparent',
                      padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                      fontSize: 12.5, fontWeight: active ? 600 : 500,
                      color: active ? SLU.ink : SLU.ink2, fontFamily: window.FONT,
                    }}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AchievementFigure({ level, ctx }) {
  const SLU = window.SLU;
  const [hover, setHover] = React.useState(null); // school-level tooltip
  // Drop any open tooltip when the view re-plots under it — a stale hover
  // would otherwise pin a phantom tooltip from the previous slice.
  React.useEffect(() => { setHover(null); }, [level, ctx.subject, ctx.estimate, ctx.unit]);
  const data = window.ACH_DATA && window.ACH_DATA[level];
  if (!data) {
    return <div style={{ background: '#fff', border: `1px solid ${SLU.rule2}`, borderRadius: 8,
                          padding: 40, color: SLU.mute, fontSize: 13 }}>No data to show yet.</div>;
  }
  const unit = ctx.unit || 'z';
  const estimate = ctx.estimate || 'shrunk';
  // Student level has no shrinkage (y_shrunk is undefined on student points), so force raw there.
  const yKey = level === 'student' ? 'y_raw' : (estimate === 'shrunk' ? 'y_shrunk' : 'y_raw');
  // y-axis is residuals pooled across grades, so no per-point grade is passed
  // and weeksPerSD returns the year × subject average from window.WOL_OPTS.
  const toUnit = (v) => unit === 'weeks' ? window.zToWeeks(v) : v;
  const unitLabel = unit === 'weeks' ? 'weeks' : 'SD';

  // Cap the student view — a large district would otherwise mount tens of
  // thousands of animated SVG circles. Stride-sampling keeps the shape.
  const MAX_STUDENT_DOTS = 2000;
  const allPoints = data.points;
  const sampled = level === 'student' && allPoints.length > MAX_STUDENT_DOTS;
  const points = sampled
    ? allPoints.filter((_, i) => i % Math.ceil(allPoints.length / MAX_STUDENT_DOTS) === 0)
    : allPoints;

  // Standardize prior achievement against this dataset's own mean / sd
  // rather than the previously hardcoded (50, 10). Falls back gracefully if
  // the column is degenerate.
  const xs = points.map(p => p.x);
  const xBar = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const xVar = xs.reduce((a, b) => a + (b - xBar) ** 2, 0) / Math.max(1, xs.length);
  const xSd = Math.sqrt(xVar) || 1;
  const toZ = (v) => (v - xBar) / xSd;
  const width = 920;
  const height = 540;
  const padL = 64, padR = 28, padT = 36, padB = 56;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // axes domain (x in z-score units)
  let xMin = Infinity, xMax = -Infinity, yMinR = Infinity, yMaxR = -Infinity;
  points.forEach(p => {
    const xz = toZ(p.x);
    if (xz < xMin) xMin = xz;
    if (xz > xMax) xMax = xz;
    if (p[yKey] < yMinR) yMinR = p[yKey];
    if (p[yKey] > yMaxR) yMaxR = p[yKey];
  });
  // make x symmetric around 0 so the district mean reads clean
  const xExtreme = Math.max(Math.abs(xMin), Math.abs(xMax)) * 1.08;
  xMin = -xExtreme; xMax = xExtreme;
  const yExtreme = Math.max(Math.abs(yMinR), Math.abs(yMaxR)) * 1.1;
  const yLo = -yExtreme, yHi = yExtreme;

  const xToPx = (v) => padL + ((v - xMin) / (xMax - xMin)) * plotW;
  const yToPx = (v) => padT + (1 - (toUnit(v) - toUnit(yLo)) / (toUnit(yHi) - toUnit(yLo))) * plotH;

  // District means — weighted by n where available. These typically sit near
  // 0 (zero-reference) but not exactly on it; show them as a separate dashed
  // cross so the user can see the offset.
  let wSum = 0, xwSum = 0, ywSum = 0;
  points.forEach(p => {
    const w = p.n || 1;
    wSum += w;
    xwSum += toZ(p.x) * w;
    ywSum += p[yKey] * w;
  });
  const xMean = wSum ? xwSum / wSum : 0;
  const yMean = wSum ? ywSum / wSum : 0;

  // x ticks — half-SD steps on the z scale, clamped to the plot domain so no
  // stray tick draws left of the y-axis.
  const xTicks = [];
  const xStep = 0.5;
  for (let t = Math.ceil(-xExtreme / xStep) * xStep; t <= xExtreme + 1e-9; t += xStep) {
    xTicks.push(+t.toFixed(2));
  }

  // y ticks — step adapts to the data span (the school view's range can be well
  // under 0.5 SD, which used to leave a single lonely '0' tick); weeks mode
  // scales the same step through the active year × subject conversion factor.
  const ySpanZ = 2 * yExtreme;
  const zStep = ySpanZ > 2 ? 0.5 : ySpanZ > 0.9 ? 0.25 : ySpanZ > 0.35 ? 0.1 : 0.05;
  const yStep = unit === 'weeks'
    ? Math.max(5, Math.round(window.zToWeeks(zStep) / 5) * 5)
    : zStep;
  const yTickMax = toUnit(yHi);
  const yTicks = [];
  for (let t = Math.ceil(-yTickMax / yStep) * yStep; t <= yTickMax + 1e-9; t += yStep) {
    yTicks.push(t);
  }

  // Quadrant counts (split at district mean)
  const q = { hh: 0, hl: 0, lh: 0, ll: 0 }; // (x,y) high/low
  points.forEach(p => {
    const hx = toZ(p.x) >= xMean, hy = p[yKey] >= yMean;
    if (hx && hy) q.hh++;
    else if (hx && !hy) q.hl++;
    else if (!hx && hy) q.lh++;
    else q.ll++;
  });

  return (
    <section style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
      padding: '18px 22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                     flexWrap: 'wrap', gap: 12, rowGap: 14, marginBottom: 4 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
            This year’s score vs. growth — {level === 'school' ? 'school view' : 'student view'}
          </div>
          <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
            x: this year’s score
            <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
            y: growth vs. expected ({unitLabel}) ·
            <span style={{ marginLeft: 4 }}>
              {sampled
                ? `showing ${points.length.toLocaleString()} of ${allPoints.length.toLocaleString()} students`
                : `${points.length.toLocaleString()} points`}
            </span>
            <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
            four corners split at the district average
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap',
                       rowGap: 10, justifyContent: 'flex-end' }}>
          <PillToggle label="View" value={level}
                      options={[['school', 'School'], ['student', 'Student']]}
                      onChange={ctx.setAchLevel} />
          <PillToggle label="District average" value={ctx.achShowMeans !== false ? 'show' : 'hide'}
                      options={[['show', 'Show'], ['hide', 'Hide']]}
                      onChange={(v) => ctx.setAchShowMeans(v === 'show')} />
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}
           role="img" aria-label={`Scatter of this year's score versus growth, ${level} view, ${points.length} points`}>
        {/* plot bg */}
        <rect x={padL} y={padT} width={plotW} height={plotH}
              fill="#FAFAFB" stroke={SLU.rule2} strokeWidth={1} />

        {/* Zero-reference lines — solid */}
        <line x1={xToPx(0)} x2={xToPx(0)} y1={padT} y2={padT + plotH}
              stroke={SLU.ink2} strokeWidth={1} opacity={0.55} />
        <line x1={padL} x2={padL + plotW} y1={yToPx(0)} y2={yToPx(0)}
              stroke={SLU.ink2} strokeWidth={1} opacity={0.55} />

        {/* District-mean cross — dashed, labeled on the right & top */}
        {ctx.achShowMeans !== false && (
          <g>
            <line x1={xToPx(xMean)} x2={xToPx(xMean)} y1={padT} y2={padT + plotH}
                  stroke={SLU.gold} strokeWidth={1.25} strokeDasharray="4 3" opacity={0.95} />
            <line x1={padL} x2={padL + plotW} y1={yToPx(yMean)} y2={yToPx(yMean)}
                  stroke={SLU.gold} strokeWidth={1.25} strokeDasharray="4 3" opacity={0.95} />
            <text x={padL + plotW - 8} y={yToPx(yMean) - 6} fontSize={9.5}
                  fontFamily={window.LABEL} fill={SLU.gold} textAnchor="end"
                  fontWeight={700}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
              District average
            </text>
            <text x={xToPx(xMean)} y={padT - 8} fontSize={9.5}
                  fontFamily={window.LABEL} fill={SLU.gold} textAnchor="middle"
                  fontWeight={700}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
              District average
            </text>
          </g>
        )}

        {/* Corner labels — neutral ink for all four so the gold dashed
            district-mean cross stays the only gold mark in the plot. */}
        <QuadrantLabel x={padL + 12}              y={padT + 22}
                       align="start"
                       title="Lower score · faster growth" sub={`n=${q.lh}`} accent={SLU.ink2} />
        <QuadrantLabel x={padL + plotW - 12}      y={padT + 22}
                       align="end"
                       title="Higher score · faster growth" sub={`n=${q.hh}`} accent={SLU.ink2} />
        <QuadrantLabel x={padL + 12}              y={padT + plotH - 12}
                       align="start" anchorBottom
                       title="Lower score · slower growth" sub={`n=${q.ll}`} accent={SLU.ink2} />
        <QuadrantLabel x={padL + plotW - 12}      y={padT + plotH - 12}
                       align="end" anchorBottom
                       title="Higher score · slower growth" sub={`n=${q.hl}`} accent={SLU.ink2} />

        {/* points — circles get a CSS transition on cx/cy so subject toggles
            tween between positions instead of jumping. We key school-level
            dots by school_id so React reconciles the same element across
            renders. Student-level keeps index keys (no stable id), so those
            dots also tween smoothly. */}
        {points.map((p, i) => {
          const cx = xToPx(toZ(p.x)), cy = yToPx(p[yKey]);
          const color = `hsl(${p.hue}, 62%, 48%)`;
          const tween = window.MOTION_OK === false ? 'none'
            : 'cx 700ms cubic-bezier(.4,0,.2,1), cy 700ms cubic-bezier(.4,0,.2,1)';
          if (level === 'student') {
            return (
              <circle key={i} cx={cx} cy={cy} r={3}
                      fill={color} fillOpacity={0.55}
                      style={{ transition: tween }} />
            );
          }
          // school level: size by n. No on-plot ID label — reveal name on hover.
          const r = 5 + Math.sqrt(p.n || 100) * 0.35;
          const isHover = hover && hover.i === i;
          return (
            <circle key={p.school_id || i} cx={cx} cy={cy} r={isHover ? r + 2 : r}
                    fill={color} fillOpacity={isHover ? 0.95 : 0.78}
                    stroke="#fff" strokeWidth={isHover ? 2 : 1.4}
                    style={{ cursor: 'pointer',
                             transition: window.MOTION_OK === false ? 'none' : `${tween}, r 200ms ease-out` }}
                    onMouseEnter={() => setHover({ i, px: cx, py: cy, point: p, color })}
                    onMouseLeave={() => setHover(h => (h && h.i === i) ? null : h)} />
          );
        })}

        {/* school-level tooltip — drawn last so it sits above everything */}
        {level === 'school' && hover && (() => {
          const p = hover.point;
          const tipW = 200, tipH = 78;
          const px = hover.px, py = hover.py;
          const placeRight = px + tipW + 16 <= width;
          const tx = placeRight ? px + 12 : px - tipW - 12;
          const ty = Math.max(padT + 4, Math.min(padT + plotH - tipH - 4, py - tipH / 2));
          const yVal = (toUnit(p[yKey]) >= 0 ? '+' : '−') + Math.abs(toUnit(p[yKey])).toFixed(2);
          return (
            <g pointerEvents="none">
              <line x1={px} x2={placeRight ? tx : tx + tipW} y1={py} y2={ty + tipH / 2}
                    stroke={hover.color} strokeWidth={1} opacity={0.6} />
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={5}
                    fill="#fff" stroke={hover.color} strokeWidth={1.2}
                    filter="drop-shadow(0 2px 6px rgba(15,23,42,0.12))" />
              <text x={tx + 10} y={ty + 17} fontSize={12.5} fontFamily={window.FONT}
                    fontWeight={700} fill={SLU.ink}>
                {p.school_name || p.school_id}
              </text>
              {/* Skip the code line when it would just repeat the title (uploads
                  have no school names, so school_name === school_id). */}
              {p.school_name && p.school_name !== p.school_id && (
                <text x={tx + 10} y={ty + 32} fontSize={10.5} fontFamily={window.MONO} fill={SLU.mute}>
                  {p.school_id}
                </text>
              )}
              <line x1={tx + 8} x2={tx + tipW - 8} y1={ty + 40} y2={ty + 40}
                    stroke={SLU.rule2} strokeWidth={1} />
              <text x={tx + 10} y={ty + 56} fontSize={11} fontFamily={window.MONO} fill={SLU.ink2}>
                Scored {(toZ(p.x) >= 0 ? '+' : '−') + Math.abs(toZ(p.x)).toFixed(2)} SD
              </text>
              <text x={tx + 10} y={ty + 70} fontSize={11} fontFamily={window.MONO} fill={SLU.ink2}>
                Grew <tspan fill={hover.color} fontWeight={700}>{yVal} {unitLabel}</tspan>
                <tspan dx={6} fill={SLU.mute}>· n={p.n}</tspan>
              </text>
            </g>
          );
        })()}

        {/* axes */}
        <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH}
              stroke={SLU.rule} strokeWidth={1} />
        <line x1={padL} x2={padL} y1={padT} y2={padT + plotH}
              stroke={SLU.rule} strokeWidth={1} />

        {/* x ticks (z-score) */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={xToPx(t)} x2={xToPx(t)} y1={padT + plotH} y2={padT + plotH + 4}
                  stroke={SLU.rule} strokeWidth={1} />
            <text x={xToPx(t)} y={padT + plotH + 16} fontSize={10}
                  fontFamily={window.MONO} fill={SLU.mute} textAnchor="middle">
              {t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(1)}
            </text>
          </g>
        ))}
        <text x={padL + plotW / 2} y={height - 14} fontSize={11}
              fontFamily={window.LABEL} fill={SLU.ink2} textAnchor="middle"
              fontWeight={700} style={{ textTransform: 'uppercase', letterSpacing: 1.0 }}>
          This year’s achievement (status score)
        </text>

        {/* y ticks */}
        {yTicks.map((t, i) => {
          const py = padT + (1 - (t - toUnit(yLo)) / (toUnit(yHi) - toUnit(yLo))) * plotH;
          return (
            <g key={i}>
              <line x1={padL - 4} x2={padL} y1={py} y2={py} stroke={SLU.rule} strokeWidth={1} />
              <text x={padL - 8} y={py + 4} fontSize={10}
                    fontFamily={window.MONO} fill={SLU.mute} textAnchor="end">
                {t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(unit === 'weeks' ? 0 : 1)}
              </text>
            </g>
          );
        })}
        <text x={16} y={padT + plotH / 2} fontSize={11}
              fontFamily={window.LABEL} fill={SLU.ink2} textAnchor="middle"
              fontWeight={700}
              transform={`rotate(-90 16 ${padT + plotH / 2})`}
              style={{ textTransform: 'uppercase', letterSpacing: 1.0 }}>
          Growth vs. expected ({unitLabel})
        </text>
      </svg>

      {/* School color legend — hue was the only school encoding, which left
          non-hovering (and colorblind) users with nothing to read. */}
      {(() => {
        const sps = (window.ACH_DATA && window.ACH_DATA.school && window.ACH_DATA.school.points) || [];
        if (!sps.length) return null;
        const MAX_CHIPS = 24;
        const shown = sps.slice(0, MAX_CHIPS);
        return (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${SLU.rule2}`,
                        display: 'flex', flexWrap: 'wrap', gap: '6px 14px',
                        fontSize: 11, color: SLU.ink2, fontFamily: window.FONT }}>
            {shown.map((p) => (
              <span key={p.school_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%',
                               background: `hsl(${p.hue}, 62%, 48%)`,
                               boxShadow: '0 0 0 1px rgba(0,0,0,0.18)' }} />
                {p.school_name && p.school_name !== p.school_id ? p.school_name : p.school_id}
              </span>
            ))}
            {sps.length > MAX_CHIPS && (
              <span style={{ color: SLU.mute }}>+ {sps.length - MAX_CHIPS} more — hover a dot for its name</span>
            )}
          </div>
        );
      })()}
    </section>
  );
}

function QuadrantLabel({ x, y, title, sub, accent, align, anchorBottom }) {
  const SLU = window.SLU;
  return (
    <g>
      <text x={x} y={y} fontSize={11.5} fontFamily={window.LABEL}
            fill={accent} textAnchor={align}
            fontWeight={700} style={{ textTransform: 'uppercase', letterSpacing: 1.0 }}>
        {title}
      </text>
      <text x={x} y={y + (anchorBottom ? -14 : 14)} fontSize={10.5}
            fontFamily={window.MONO} fill={SLU.mute} textAnchor={align}>
        {sub}
      </text>
    </g>
  );
}

window.AchievementPage = AchievementPage;
