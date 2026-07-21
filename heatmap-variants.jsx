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

// Heatmap — school × grade residual matrix for the Growth by school & grade page.
// Single direction (diverging color + ▲/▼ glyph + number) after design review.
// Previous H2 (sequential) and H3 (cell-bar) variants were dropped in cleanup.

const GRADES = [3, 4, 5, 6, 7, 8];

function getResidual(s, g) { return s.grades[g]; }
// Displayed value of a cell: shrunken when the engine could compute it, raw
// otherwise (older fixtures, or a grade with <2 reliable schools to pool).
function cellVal(c) { return c.rs != null ? c.rs : c.r; }
// Sorting by Overall must match the Overall column the user sees: the
// data-shipped school-level shrunken value when present, else an n-weighted
// mean of the displayed cells.
function rowMean(s) {
  if (s.overall) return s.overall.rs != null ? s.overall.rs : s.overall.r;
  const cells = GRADES.map(g => getResidual(s, g)).filter(c => c && c.ok);
  const n = cells.reduce((a, c) => a + c.n, 0);
  return n ? cells.reduce((a, c) => a + cellVal(c) * c.n, 0) / n : 0;
}
// Suppressed (ok:false) cells sort as missing — their hidden residuals shouldn't rank rows.
function cellR(s, g, missing) {
  const c = s.grades[g];
  return c && c.ok ? cellVal(c) : missing;
}

// Every key here must be reachable by clicking a column header (ColumnHeader
// cycles desc ↔ asc per column); there is no separate sort dropdown.
const ROW_SORTS = {
  alpha: { label: 'School', fn: (a, b) => schoolLabel(a).localeCompare(schoolLabel(b)) },
  alpha_rev: { label: 'School (Z → A)', fn: (a, b) => schoolLabel(b).localeCompare(schoolLabel(a)) },
  mean_desc: { label: 'Overall (strongest first)', fn: (a, b) => rowMean(b) - rowMean(a) },
  mean_asc:  { label: 'Overall (weakest first)', fn: (a, b) => rowMean(a) - rowMean(b) },
  ...Object.fromEntries(GRADES.flatMap(g => [
    [`g${g}_desc`, { label: `Grade ${g} (strongest first)`, fn: (a, b) => cellR(b, g, -Infinity) - cellR(a, g, -Infinity) }],
    [`g${g}_asc`,  { label: `Grade ${g} (weakest first)`, fn: (a, b) => cellR(a, g, Infinity) - cellR(b, g, Infinity) }],
  ])),
};
const MIN_N = 10;

const N_MODES = {
  inline: { label: 'Always' },
  hover:  { label: 'On hover' },
  off:    { label: 'Off' },
};

// Diverging color scale. SCALE_MAX is where the color saturates — the residuals
// are tight first-stage VAM residuals, so ±0.3 SD makes the school pattern pop.
const SCALE_MAX = 0.3;

// Ink selection by actual background luminance instead of a fixed |r| threshold —
// the old cutoff left a mid-band (|r| ≈ 0.12–0.18) where dark brand glyphs sat on
// medium fills with marginal contrast.
function relLum(rgbStr) {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgbStr);
  if (!m) return 1;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
}
// Number ink: white or near-black, whichever contrasts more with the fill.
function cellInk(r) {
  const L = relLum(divColor(r));
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0605) ? '#fff' : SLU.ink;
}
// Glyph ink: brand pos/neg only on light fills; otherwise follow the number ink.
function glyphInk(r) {
  if (cellInk(r) === '#fff') return '#fff';
  return relLum(divColor(r)) > 0.6 ? (r >= 0 ? SLU.pos : SLU.neg) : SLU.ink;
}

// Diverging interpolator: residual ∈ [-SCALE_MAX, SCALE_MAX] → blue / white / rust.
// Pair with shape (▲/▼) elsewhere so we never encode by color alone.
function divColor(r) {
  const t = Math.max(-1, Math.min(1, r / SCALE_MAX));
  if (t >= 0) {
    // white → SLU blue
    const k = t;
    const c = (a, b) => Math.round(a + (b - a) * k);
    const r1 = c(247, 0), g1 = c(247, 61), b1 = c(248, 165);
    return `rgb(${r1},${g1},${b1})`;
  }
  // white → desaturated rust
  const k = -t;
  const c = (a, b) => Math.round(a + (b - a) * k);
  const r1 = c(247, 124), g1 = c(247, 58), b1 = c(248, 18);
  return `rgb(${r1},${g1},${b1})`;
}

function HeatmapShell({ children, title, subtitle, controls, footer }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
      borderTop: `3px solid ${SLU.gold}`,
      boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
      padding: 24, fontFamily: FONT,
    }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                      gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2, fontFamily: FONT }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {controls}
        </div>
        {children}
        {footer && <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${SLU.rule2}`,
                                  fontSize: 11.5, color: SLU.mute, lineHeight: 1.5 }}>{footer}</div>}
    </div>
  );
}

function CommonControls({ nMode, setNMode, extra }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <Select value={nMode} onChange={setNMode} options={N_MODES} label="Student counts" />
      {extra}
    </div>
  );
}

function ColumnHeader({ cellW, idW, sort, setSort, showOverall = false, stretch = false }) {
  const sortable = !!setSort;
  const cycle = (descKey, ascKey) => {
    if (!sortable) return;
    const next = sort === descKey ? ascKey : descKey;
    if (window.GLTelemetry) window.GLTelemetry.log('interact', { control: 'heatmap_sort', value: next });
    setSort(next);
  };
  const HCell = ({ children, descKey, ascKey, width, align = 'center', uppercase = false, grow = false }) => {
    const active = sort === descKey || sort === ascKey;
    const dir = sort === ascKey ? '▲' : sort === descKey ? '▼' : '';
    const sharedStyle = {
      width, boxSizing: 'border-box', padding: '0 10px',
      ...(grow ? { flex: '1 1 0', minWidth: width } : {}),
      display: 'flex', alignItems: 'center',
      justifyContent: align === 'left' ? 'flex-start' : 'center',
      gap: 4,
      fontSize: uppercase ? 10.5 : 11,
      fontFamily: uppercase ? LABEL : FONT,
      textTransform: uppercase ? 'uppercase' : 'none',
      letterSpacing: uppercase ? 1.0 : 0,
      color: active ? SLU.blue : SLU.ink2,
      fontWeight: active ? 700 : 600,
      userSelect: 'none',
    };
    if (!sortable) {
      return <div style={sharedStyle}><span>{children}</span></div>;
    }
    return (
      <button type="button" role="columnheader"
              onClick={() => cycle(descKey, ascKey)}
              aria-label={`${typeof children === 'string' ? children : 'Column'} — ${active ? `sorted ${sort === ascKey ? 'ascending' : 'descending'}, activate to flip` : 'activate to sort descending'}`}
              style={{
                ...sharedStyle,
                cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderRadius: 4, outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${SLU.blue}`; }}
              onBlur={(e)  => { e.currentTarget.style.boxShadow = 'none'; }}>
        <span>{children}</span>
        <span style={{ fontSize: 9, color: active ? SLU.blue : SLU.rule, width: 8 }}>
          {dir || '⇅'}
        </span>
      </button>
    );
  };
  return (
    <div role="row" style={{ display: 'flex', width: stretch ? '100%' : 'auto',
                  borderBottom: `1px solid ${SLU.rule}`, paddingBottom: 4, marginBottom: 2,
                  position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
      <HCell width={idW} align="left" uppercase descKey="alpha" ascKey="alpha_rev">School</HCell>
      {GRADES.map(g => (
        <HCell key={g} width={cellW} grow={stretch} descKey={`g${g}_desc`} ascKey={`g${g}_asc`}>{`Grade ${g}`}</HCell>
      ))}
      {showOverall && (
        <HCell width={cellW} grow={stretch} descKey="mean_desc" ascKey="mean_asc">Overall</HCell>
      )}
    </div>
  );
}

function ScaleLegend({ unit = 'z' }) {
  const stops = [-SCALE_MAX, -SCALE_MAX / 2, 0, SCALE_MAX / 2, SCALE_MAX];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: SLU.ink2, fontFamily: MONO, flexWrap: 'wrap' }}>
      <span style={{ color: SLU.mute, fontFamily: FONT }}>below the district average</span>
      <span style={{ display: 'inline-flex' }}>
        {stops.map((t, i) => (
          <span key={i} style={{ width: 22, height: 12, background: divColor(t), borderRight: i < stops.length - 1 ? '1px solid #fff' : 'none' }} />
        ))}
      </span>
      <span style={{ color: SLU.mute, fontFamily: FONT }}>above the district average</span>
      <span style={{ marginLeft: 12 }}>−{SCALE_MAX} ··· 0 ··· +{SCALE_MAX} SD</span>
      {unit === 'weeks' && (
        <span style={{ color: SLU.mute, fontFamily: FONT }}>
          — numbers are in weeks of learning; the colors always follow the SD scale above
        </span>
      )}
    </div>
  );
}

// Display transforms:
//   estimate: 'shrunk' (the app default) renders each cell's EB value — the
//             cell pulled toward its grade's pooled district mean, computed by
//             the engine (rs). 'raw' falls back to the as-measured mean, as do
//             cells the engine couldn't shrink (<2 reliable schools in the
//             grade) and older fixtures without rs.
//   unit:     'z' shows SD units; 'weeks' converts via grade × subject × year
//             factors (per-cell grade for the matrix, grade-averaged for the
//             Overall column).
// Color scale stays in SD space so the legend remains comparable across units.
function transformR(c, estimate) {
  if (!c) return c;
  if (estimate !== 'raw' && c.rs != null) return { ...c, r: c.rs };
  return c;
}
function formatUnit(r, unit, opts) {
  if (unit === 'weeks') {
    const w = zToWeeks(r, opts);
    const sign = w > 0 ? '+' : (w < 0 ? '−' : '');
    return `${sign}${Math.abs(w).toFixed(0)}w`;
  }
  // Explicit sign both ways, matching weeks mode — toFixed alone would render
  // "▼ -0.08" next to an unsigned "▲ 0.06".
  const sign = r > 0 ? '+' : (r < 0 ? '−' : '');
  return `${sign}${Math.abs(r).toFixed(2)}`;
}

function HeatmapH1({ estimate = 'shrunk', unit = 'z' } = {}) {
  const data = window.HEATMAP_DATA;
  const [sort, setSort] = React.useState('mean_desc');
  const [nMode, setNMode] = React.useState('hover');
  const [hover, setHover] = React.useState(null);
  const sorted = [...data.schools].sort(ROW_SORTS[sort].fn);
  const cellW = 100, idW = schoolColW(data.schools, 80);

  // Keyboard grid: Tab enters at the first cell, arrows move cell-to-cell,
  // focus reveals the student count (same affordance as hover).
  const cellRefs = React.useRef({});
  const focusPos = React.useRef({ r: 0, c: 0 });
  const onGridKey = (e) => {
    let { r, c } = focusPos.current;
    if (e.key === 'ArrowRight') c++;
    else if (e.key === 'ArrowLeft') c--;
    else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowUp') r--;
    else return;
    e.preventDefault();
    r = Math.max(0, Math.min(sorted.length - 1, r));
    c = Math.max(0, Math.min(GRADES.length, c));   // GRADES.length = Overall column
    const el = cellRefs.current[`${r}-${c}`];
    if (el) { focusPos.current = { r, c }; el.focus(); }
  };
  const gridCellProps = (r, c, hoverKey, label) => ({
    tabIndex: r === 0 && c === 0 ? 0 : -1,
    ref: (el) => { cellRefs.current[`${r}-${c}`] = el; },
    onKeyDown: onGridKey,
    onFocus: () => { focusPos.current = { r, c }; setHover(hoverKey); },
    onBlur: () => setHover(null),
    role: 'gridcell',
    className: 'gl-focus',   // visible keyboard focus even on blank cells
    'aria-label': label,
  });

  return (
    <HeatmapShell
      title="How each grade is doing, school by school"
      subtitle={`Each school’s results compared with the district average — blue cells grew faster than expected, rust cells slower. Shown in ${unit === 'weeks' ? 'weeks of learning' : 'SD (standard scale)'}.`}
      controls={<CommonControls nMode={nMode} setNMode={setNMode} />}
      footer={
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <ScaleLegend unit={unit} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <SuppressedSwatch /> too few students to read reliably (fewer than {MIN_N})
          </span>
          <span style={{ color: SLU.mute }}>Blank cell = grade not served at that school.</span>
          <span style={{ color: SLU.mute }}>Numbers are steadied toward the district average so a few students can’t swing a cell.</span>
          <span style={{ color: SLU.mute }}>Click any column heading to sort.</span>
        </div>
      }
    >
      {/* Scrolls (both axes) at narrow widths / long school lists; the header
          row stays pinned while rows scroll under it. */}
      <div style={{ overflow: 'auto', maxHeight: '72vh' }}>
      <div style={{ minWidth: idW + 7 * cellW }} role="grid"
           aria-label="Growth by school and grade, compared with the district average">
      <ColumnHeader cellW={cellW} idW={idW} sort={sort} setSort={setSort} showOverall stretch />
      {sorted.map((s, i) => {
        const sLabel = schoolLabel(s);
        const hasName = !!(s.school_name && s.school_name !== s.school_id);
        return (
        <div key={s.school_id} role="row" style={{
          display: 'flex', alignItems: 'stretch', height: 26, width: '100%',
          background: i % 2 === 0 ? '#fff' : '#FAFAFB',
        }}>
          <div role="rowheader" title={hasName ? `${sLabel} (${s.school_id})` : undefined}
               style={{ width: idW, boxSizing: 'border-box', padding: '0 10px', display: 'flex', alignItems: 'center',
                        fontFamily: hasName ? FONT : MONO, fontSize: 12, color: SLU.ink2 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sLabel}</span>
          </div>
          {GRADES.map((g, gi) => {
            const raw = getResidual(s, g);
            if (!raw) return (
              <div key={g} {...gridCellProps(i, gi, null, `${sLabel}, grade ${g}: grade not served`)}
                   style={{ width: cellW, boxSizing: 'border-box', flex: '1 1 0', minWidth: cellW,
                            background: '#fff', border: `1px solid ${SLU.rule2}`, outline: 'none' }} />
            );
            const c = transformR(raw, estimate);
            const hoverKey = `${s.school_id}-${g}`;
            const showN = nMode === 'inline' || (nMode === 'hover' && hover === hoverKey);
            const label = c.ok
              ? `${sLabel}, grade ${g}: ${formatUnit(c.r, unit, { grade: g })}${unit === 'weeks' ? ' weeks' : ' SD'}, ${c.n} students`
              : `${sLabel}, grade ${g}: too few students to read reliably (${c.n})`;
            return (
              <div key={g} onMouseEnter={() => setHover(hoverKey)}
                            onMouseLeave={() => setHover(null)}
                            {...gridCellProps(i, gi, hoverKey, label)}
                            style={{
                              width: cellW, boxSizing: 'border-box', flex: '1 1 0', minWidth: cellW, position: 'relative',
                              background: c.ok ? divColor(c.r) : '#fff',
                              borderRight: '1px solid rgba(255,255,255,0.6)',
                              borderBottom: '1px solid rgba(255,255,255,0.6)',
                              backgroundImage: c.ok ? 'none' : `repeating-linear-gradient(45deg, ${SLU.rule} 0 1px, transparent 1px 6px)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: MONO, fontSize: 11, color: c.ok ? cellInk(c.r) : SLU.ink,
                              outline: 'none',
                              boxShadow: hover === hoverKey ? `inset 0 0 0 2px ${SLU.blue}` : 'none',
                            }}>
                {c.ok ? (
                  <>
                    <span style={{ position: 'relative' }}>
                      <span style={{ marginRight: 3, color: glyphInk(c.r) }}>
                        {c.r >= 0 ? '▲' : '▼'}
                      </span>
                      {formatUnit(c.r, unit, { grade: g })}
                    </span>
                    {showN && (
                      <span style={{ position: 'absolute', right: 4, top: 1, fontSize: 9, color: cellInk(c.r) === '#fff' ? 'rgba(255,255,255,0.85)' : SLU.mute }}>
                        n={c.n}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontFamily: FONT, fontSize: 9.5, padding: '1px 4px', borderRadius: 3,
                                  background: SLU.gold, color: '#fff', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>too few</span>
                )}
              </div>
            );
          })}
          {(() => {
            // Overall column: the data-shipped school-level value — the SAME
            // shrinkage the scores-vs-growth scatter uses, so the two always agree.
            // Fallback (older fixtures): n-weighted mean of the displayed cells.
            const ov = s.overall;
            const cells = GRADES.map(g => getResidual(s, g)).filter(c => c && c.ok);
            const totalN = ov ? ov.n : cells.reduce((a, c) => a + c.n, 0);
            const overall = ov
              ? (estimate !== 'raw' && ov.rs != null ? ov.rs : ov.r)
              : (totalN
                  ? cells.reduce((a, c) => a + transformR(c, estimate).r * c.n, 0) / totalN
                  : 0);
            const above = overall >= 0;
            const hoverKey = `${s.school_id}-overall`;
            const label = totalN > 0
              ? `${sLabel}, overall: ${formatUnit(overall, unit)}${unit === 'weeks' ? ' weeks' : ' SD'}, ${totalN} students`
              : `${sLabel}, overall: no reliable cells`;
            return (
              <div onMouseEnter={() => setHover(hoverKey)}
                   onMouseLeave={() => setHover(null)}
                   {...gridCellProps(i, GRADES.length, hoverKey, label)}
                   style={{
                width: cellW, boxSizing: 'border-box', position: 'relative',
                background: divColor(overall),
                borderRight: '1px solid rgba(255,255,255,0.6)',
                borderBottom: '1px solid rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                color: cellInk(overall),
                flex: '1 1 0', minWidth: cellW,
                outline: 'none',
                boxShadow: hover === hoverKey ? `inset 0 0 0 2px ${SLU.blue}` : 'none',
              }}>
                <span style={{ position: 'relative' }}>
                  <span style={{ marginRight: 3, color: glyphInk(overall) }}>
                    {above ? '▲' : '▼'}
                  </span>
                  {formatUnit(overall, unit)}
                </span>
                {(nMode === 'inline' || (nMode === 'hover' && hover === hoverKey)) && totalN > 0 && (
                  <span style={{ position: 'absolute', right: 4, top: 1, fontSize: 9,
                                  color: cellInk(overall) === '#fff' ? 'rgba(255,255,255,0.85)' : SLU.mute }}>
                    n={totalN}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        );
      })}
      </div>
      </div>
    </HeatmapShell>
  );
}

function SuppressedSwatch() {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 12, verticalAlign: 'middle',
      background: '#fff',
      backgroundImage: `repeating-linear-gradient(45deg, ${SLU.rule} 0 1px, transparent 1px 6px)`,
      border: `1px solid ${SLU.rule}`,
    }} />
  );
}

window.HeatmapH1 = HeatmapH1;
window.divColor = divColor;
window.heatCellInk = cellInk;
window.heatGlyphInk = glyphInk;
