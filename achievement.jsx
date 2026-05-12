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
        title="Where each school sits on both dimensions"
        blurb={'Two-axis view of the system: prior achievement on the x-axis (standardized z-score from the state assessment) and growth residual on the y-axis. Dashed lines mark the district mean on each axis and split the plot into four quadrants — high-achievement / high-growth, etc.'} />
      <window.ControlsCard title="Controls"><AchievementControls ctx={ctx} /></window.ControlsCard>
      <AchievementFigure level={level} ctx={ctx} />
    </>
  );
}

function AchievementControls({ ctx }) {
  const showMeans = ctx.achShowMeans !== false;
  return (
    <window.ControlsGrid>
      <window.CGroup title="Slice">
        <window.CSegmented value={ctx.subject} onChange={ctx.setSubject} options={window.SUBJECTS} label="Subject" />
      </window.CGroup>
      <window.CGroup title="Estimate">
        <window.CSegmented value={ctx.estimate} onChange={ctx.setEstimate}
                    options={window.METHOD_OPTS} label="Method"
                    hint={window.METHOD_HINT} optionHints={window.METHOD_OPT_HINTS} />
        <window.CSegmented value={ctx.unit} onChange={ctx.setUnit}
                    options={{ z: 'SD', weeks: 'Weeks' }} label="Units"
                    hint={window.UNIT_HINT} />
      </window.CGroup>
      <window.CGroup title="View">
        <window.CSegmented value={ctx.achLevel || 'school'} onChange={ctx.setAchLevel}
                    options={{ school: 'School', student: 'Student' }} label="Level" />
        <window.CSegmented value={showMeans ? 'on' : 'off'}
                    onChange={(v) => ctx.setAchShowMeans(v === 'on')}
                    options={{ on: 'Show', off: 'Hide' }} label="District means" />
      </window.CGroup>
    </window.ControlsGrid>
  );
}

function AchievementFigure({ level, ctx }) {
  const SLU = window.SLU;
  const [hover, setHover] = React.useState(null); // school-level tooltip
  const data = window.ACH_DATA && window.ACH_DATA[level];
  if (!data) {
    return <div style={{ background: '#fff', border: `1px solid ${SLU.rule2}`, borderRadius: 8,
                          padding: 40, color: SLU.mute, fontSize: 13 }}>No data.</div>;
  }
  const unit = ctx.unit || 'z';
  const estimate = ctx.estimate || 'shrunk';
  const yKey = estimate === 'shrunk' ? 'y_shrunk' : 'y_raw';
  const toUnit = (v) => unit === 'weeks' ? v * 12 : v;
  const unitLabel = unit === 'weeks' ? 'weeks' : 'SD';

  const points = data.points;

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

  // x ticks — half-SD steps on the z scale
  const xTicks = [];
  const xStep = 0.5;
  for (let t = -Math.ceil(xExtreme / xStep) * xStep; t <= xExtreme + 1e-9; t += xStep) {
    xTicks.push(+t.toFixed(2));
  }

  // y ticks
  const yStep = unit === 'weeks' ? 6 : 0.5;
  const yTickMax = toUnit(yHi);
  const yTicks = [];
  for (let t = -Math.ceil(yTickMax / yStep) * yStep; t <= yTickMax; t += yStep) {
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                     gap: 12, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
            Achievement × Growth — {level === 'school' ? 'school-level' : 'student-level'}
          </div>
          <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
            x: prior achievement (standardized z)
            <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
            y: residual ({unitLabel}) ·
            <span style={{ marginLeft: 4 }}>{points.length.toLocaleString()} points</span>
          </div>
        </div>
        <span style={{ fontSize: 11, fontFamily: window.LABEL, color: SLU.mute,
                        textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
          quadrant split at district mean
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
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
                  stroke={SLU.gold} strokeWidth={1.25} strokeDasharray="4 3" opacity={0.95}
                  style={{ transition: 'x1 700ms cubic-bezier(.4,0,.2,1), x2 700ms cubic-bezier(.4,0,.2,1)' }} />
            <line x1={padL} x2={padL + plotW} y1={yToPx(yMean)} y2={yToPx(yMean)}
                  stroke={SLU.gold} strokeWidth={1.25} strokeDasharray="4 3" opacity={0.95}
                  style={{ transition: 'y1 700ms cubic-bezier(.4,0,.2,1), y2 700ms cubic-bezier(.4,0,.2,1)' }} />
            <g transform={`translate(${padL + plotW + 6} ${yToPx(yMean)})`}>
              <text x={0} y={3} fontSize={9.5} fontFamily={window.LABEL} fill={SLU.gold}
                    fontWeight={700}
                    style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                District
              </text>
              <text x={0} y={14} fontSize={9.5} fontFamily={window.LABEL} fill={SLU.gold}
                    fontWeight={700}
                    style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                mean
              </text>
            </g>
            <text x={xToPx(xMean)} y={padT - 8} fontSize={9.5}
                  fontFamily={window.LABEL} fill={SLU.gold} textAnchor="middle"
                  fontWeight={700}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
              District mean
            </text>
          </g>
        )}

        {/* Corner labels — neutral ink for all four so the gold dashed
            district-mean cross stays the only gold mark in the plot. */}
        <QuadrantLabel x={padL + 12}              y={padT + 22}
                       align="start"
                       title="Low Ach · High Growth" sub={`n=${q.lh}`} accent={SLU.ink2} />
        <QuadrantLabel x={padL + plotW - 12}      y={padT + 22}
                       align="end"
                       title="High Ach · High Growth" sub={`n=${q.hh}`} accent={SLU.ink2} />
        <QuadrantLabel x={padL + 12}              y={padT + plotH - 12}
                       align="start" anchorBottom
                       title="Low Ach · Low Growth" sub={`n=${q.ll}`} accent={SLU.ink2} />
        <QuadrantLabel x={padL + plotW - 12}      y={padT + plotH - 12}
                       align="end" anchorBottom
                       title="High Ach · Low Growth" sub={`n=${q.hl}`} accent={SLU.ink2} />

        {/* points — circles get a CSS transition on cx/cy so subject toggles
            tween between positions instead of jumping. We key school-level
            dots by school_id so React reconciles the same element across
            renders. Student-level keeps index keys (no stable id), so those
            dots also tween smoothly. */}
        {points.map((p, i) => {
          const cx = xToPx(toZ(p.x)), cy = yToPx(p[yKey]);
          const color = `hsl(${p.hue}, 62%, 48%)`;
          if (level === 'student') {
            return (
              <circle key={i} cx={cx} cy={cy} r={3}
                      fill={color} fillOpacity={0.55}
                      style={{ transition: 'cx 700ms cubic-bezier(.4,0,.2,1), cy 700ms cubic-bezier(.4,0,.2,1)' }} />
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
                             transition: 'cx 700ms cubic-bezier(.4,0,.2,1), cy 700ms cubic-bezier(.4,0,.2,1), r 200ms ease-out' }}
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
              <text x={tx + 10} y={ty + 32} fontSize={10.5} fontFamily={window.MONO} fill={SLU.mute}>
                {p.school_id}
              </text>
              <line x1={tx + 8} x2={tx + tipW - 8} y1={ty + 40} y2={ty + 40}
                    stroke={SLU.rule2} strokeWidth={1} />
              <text x={tx + 10} y={ty + 56} fontSize={11} fontFamily={window.MONO} fill={SLU.ink2}>
                Achievement {(toZ(p.x) >= 0 ? '+' : '−') + Math.abs(toZ(p.x)).toFixed(2)} z
              </text>
              <text x={tx + 10} y={ty + 70} fontSize={11} fontFamily={window.MONO} fill={SLU.ink2}>
                Residual <tspan fill={hover.color} fontWeight={700}>{yVal} {unitLabel}</tspan>
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
          Prior achievement (z-score)
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
          Growth residual ({unitLabel})
        </text>
      </svg>
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
