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

// Heatmap — School × grade residual matrix for System Scan.
// Single direction (diverging color + ▲/▼ glyph + number) after design review.
// Previous H2 (sequential) and H3 (cell-bar) variants were dropped in cleanup.

const GRADES = [3, 4, 5, 6, 7, 8];

function getResidual(s, g) { return s.grades[g]; }
function rowMean(s) {
  const xs = GRADES.map(g => getResidual(s, g)).filter(c => c && c.ok).map(c => c.r);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function rowVar(s) {
  const xs = GRADES.map(g => getResidual(s, g)).filter(c => c && c.ok).map(c => c.r);
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

const ROW_SORTS = {
  alpha: { label: 'School ID', fn: (a, b) => a.school_id.localeCompare(b.school_id) },
  alpha_rev: { label: 'School ID (Z → A)', fn: (a, b) => b.school_id.localeCompare(a.school_id) },
  mean_desc: { label: 'Overall mean (high → low)', fn: (a, b) => rowMean(b) - rowMean(a) },
  mean_asc:  { label: 'Overall mean (low → high)', fn: (a, b) => rowMean(a) - rowMean(b) },
  var_desc:  { label: 'Variance across grades (high → low)', fn: (a, b) => rowVar(b) - rowVar(a) },
  ...Object.fromEntries(GRADES.flatMap(g => [
    [`g${g}_desc`, { label: `Grade ${g} (high → low)`, fn: (a, b) => (b.grades[g]?.r ?? -Infinity) - (a.grades[g]?.r ?? -Infinity) }],
    [`g${g}_asc`,  { label: `Grade ${g} (low → high)`, fn: (a, b) => (a.grades[g]?.r ??  Infinity) - (b.grades[g]?.r ??  Infinity) }],
  ])),
};
const MIN_N = 10;

const N_MODES = {
  inline: { label: 'Inline' },
  hover:  { label: 'On hover' },
  off:    { label: 'Off' },
};

// Diverging interpolator: residual ∈ [-0.5, 0.5] → blue / white / rust.
// Pair with shape (▲/▼) elsewhere so we never encode by color alone.
function divColor(r) {
  const t = Math.max(-1, Math.min(1, r / 0.5));
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
            <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>{title}</div>
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
      <Select value={nMode} onChange={setNMode} options={N_MODES} label="Show n" />
      {extra}
    </div>
  );
}

function ColumnHeader({ cellW, idW, sort, setSort, showOverall = false, stretch = false }) {
  const sortable = !!setSort;
  const cycle = (descKey, ascKey) => {
    if (!sortable) return;
    setSort(sort === descKey ? ascKey : descKey);
  };
  const HCell = ({ children, descKey, ascKey, width, align = 'center', uppercase = false, grow = false }) => {
    const active = sort === descKey || sort === ascKey;
    const dir = sort === ascKey ? '▲' : sort === descKey ? '▼' : '';
    const ariaSort = sort === ascKey ? 'ascending' : sort === descKey ? 'descending' : (sortable ? 'none' : undefined);
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
      <button type="button"
              onClick={() => cycle(descKey, ascKey)}
              aria-sort={ariaSort}
              aria-label={`${typeof children === 'string' ? children : 'Column'} — sort ${active ? (sort === ascKey ? 'ascending' : 'descending') : 'descending'}`}
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
    <div style={{ display: 'flex', width: stretch ? '100%' : 'auto',
                  borderBottom: `1px solid ${SLU.rule}`, paddingBottom: 4, marginBottom: 2 }}>
      <HCell width={idW} align="left" uppercase descKey="alpha" ascKey="alpha_rev">School</HCell>
      {GRADES.map(g => (
        <HCell key={g} width={cellW} grow={stretch} descKey={`g${g}_desc`} ascKey={`g${g}_asc`}>Grade {g}</HCell>
      ))}
      {showOverall && (
        <HCell width={cellW} grow={stretch} descKey="mean_desc" ascKey="mean_asc">Overall</HCell>
      )}
    </div>
  );
}

function ScaleLegend() {
  const stops = [-0.5, -0.25, 0, 0.25, 0.5];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: SLU.ink2, fontFamily: MONO }}>
      <span style={{ color: SLU.mute, fontFamily: FONT }}>below avg</span>
      <span style={{ display: 'inline-flex' }}>
        {stops.map((t, i) => (
          <span key={i} style={{ width: 22, height: 12, background: divColor(t), borderRight: i < stops.length - 1 ? '1px solid #fff' : 'none' }} />
        ))}
      </span>
      <span style={{ color: SLU.mute, fontFamily: FONT }}>above avg</span>
      <span style={{ marginLeft: 12 }}>−0.5 ··· 0 ··· +0.5 SD</span>
    </div>
  );
}

// Display transforms:
//   estimate: 'raw' / 'shrunk' — currently descriptive only (see comment below).
//   unit:     'z' shows SD units; 'weeks' converts via grade × subject × year
//             factors (per-cell grade for the matrix, grade-averaged for the
//             Overall column).
// Color scale stays in SD space so the legend remains comparable across units.

// The synthetic heatmap dataset stores one residual per cell. Until raw/
// shrunken pairs are available end-to-end (see GAPS_DATA for the forest's
// real implementation), the toggle is descriptive only — we render the stored
// value and let the subtitle indicate which estimator it represents.
function transformR(c /* , estimate */) {
  if (!c || !c.ok) return c;
  return { ...c, _rDisplay: c.r };
}
function formatUnit(r, unit, opts) {
  if (unit === 'weeks') {
    const w = zToWeeks(r, opts);
    const sign = w > 0 ? '+' : (w < 0 ? '−' : '');
    return `${sign}${Math.abs(w).toFixed(0)}w`;
  }
  return fmt2plain(r);
}

function HeatmapH1({ estimate = 'shrunk', unit = 'z', sortKey, setSortKey } = {}) {
  const data = window.HEATMAP_DATA;
  // Controlled when the shell passes in setSortKey; uncontrolled otherwise.
  const [sortLocal, setSortLocal] = React.useState(sortKey || 'mean_desc');
  const sort    = setSortKey ? (sortKey || 'mean_desc') : sortLocal;
  const setSort = setSortKey || setSortLocal;
  const [nMode, setNMode] = React.useState('hover');
  const [hover, setHover] = React.useState(null);
  const sorted = [...data.schools].sort(ROW_SORTS[sort].fn);
  const cellW = 100, idW = 80;

  return (
    <HeatmapShell
      title="System Scan · ELA mean residual by school × grade"
      subtitle={`${estimate === 'raw' ? 'Raw' : 'Shrunken'} estimates · ${unit === 'weeks' ? 'weeks of learning vs. district' : 'SD vs. district average'} · diverging color scale.`}
      controls={<CommonControls nMode={nMode} setNMode={setNMode} />}
      footer={
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <ScaleLegend />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <SuppressedSwatch /> below cell-size threshold (n &lt; {MIN_N})
          </span>
          <span style={{ color: SLU.mute }}>Click any column header to sort.</span>
        </div>
      }
    >
      <ColumnHeader cellW={cellW} idW={idW} sort={sort} setSort={setSort} showOverall stretch />
      {sorted.map((s, i) => (
        <div key={s.school_id} style={{
          display: 'flex', alignItems: 'stretch', height: 26, width: '100%',
          background: i % 2 === 0 ? '#fff' : '#FAFAFB',
        }}>
          <div style={{ width: idW, boxSizing: 'border-box', padding: '0 10px', display: 'flex', alignItems: 'center',
                        fontFamily: MONO, fontSize: 12, color: SLU.ink2 }}>
            {s.school_id}
          </div>
          {GRADES.map(g => {
            const raw = getResidual(s, g);
            if (!raw) return <div key={g} style={{ width: cellW, boxSizing: 'border-box', flex: '1 1 0', minWidth: cellW, background: '#fff', border: `1px solid ${SLU.rule2}` }} />;
            const c = transformR(raw, estimate);
            const showN = nMode === 'inline' || (nMode === 'hover' && hover === `${s.school_id}-${g}`);
            return (
              <div key={g} onMouseEnter={() => setHover(`${s.school_id}-${g}`)}
                            onMouseLeave={() => setHover(null)}
                            style={{
                              width: cellW, boxSizing: 'border-box', flex: '1 1 0', minWidth: cellW, position: 'relative',
                              background: c.ok ? divColor(c.r) : '#fff',
                              borderRight: '1px solid rgba(255,255,255,0.6)',
                              borderBottom: '1px solid rgba(255,255,255,0.6)',
                              backgroundImage: c.ok ? 'none' : `repeating-linear-gradient(45deg, ${SLU.rule} 0 1px, transparent 1px 6px)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: MONO, fontSize: 11, color: Math.abs(c.r) > 0.3 ? '#fff' : SLU.ink,
                            }}>
                {c.ok ? (
                  <>
                    <span style={{ position: 'relative' }}>
                      <span style={{ marginRight: 3, color: c.r >= 0 ? (Math.abs(c.r) > 0.3 ? '#fff' : SLU.pos) : (Math.abs(c.r) > 0.3 ? '#fff' : SLU.neg) }}>
                        {c.r >= 0 ? '▲' : '▼'}
                      </span>
                      {formatUnit(c.r, unit, { grade: g })}
                    </span>
                    {showN && (
                      <span style={{ position: 'absolute', right: 4, top: 1, fontSize: 9, color: Math.abs(c.r) > 0.3 ? 'rgba(255,255,255,0.85)' : SLU.mute }}>
                        n={c.n}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontFamily: FONT, fontSize: 9.5, padding: '1px 4px', borderRadius: 3,
                                  background: SLU.gold, color: '#fff', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>n &lt; {MIN_N}</span>
                )}
              </div>
            );
          })}
          {(() => {
            // Student-weighted mean of transformed residuals (so the Overall cell
            // honors the raw/shrunken toggle). Rendered with the same color +
            // triangle vocabulary as the per-grade cells.
            const cells = GRADES.map(g => getResidual(s, g)).filter(c => c && c.ok);
            const totalN = cells.reduce((a, c) => a + c.n, 0);
            const overall = totalN
              ? cells.reduce((a, c) => {
                  const r = transformR(c, estimate).r;
                  return a + r * c.n;
                }, 0) / totalN
              : 0;
            const dark = Math.abs(overall) > 0.3;
            const above = overall >= 0;
            return (
              <div onMouseEnter={() => setHover(`${s.school_id}-overall`)}
                   onMouseLeave={() => setHover(null)}
                   style={{
                width: cellW, boxSizing: 'border-box', position: 'relative',
                background: divColor(overall),
                borderRight: '1px solid rgba(255,255,255,0.6)',
                borderBottom: '1px solid rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                color: dark ? '#fff' : SLU.ink,
                flex: '1 1 0', minWidth: cellW,
              }}>
                <span style={{ position: 'relative' }}>
                  <span style={{ marginRight: 3, color: above ? (dark ? '#fff' : SLU.pos) : (dark ? '#fff' : SLU.neg) }}>
                    {above ? '▲' : '▼'}
                  </span>
                  {formatUnit(overall, unit)}
                </span>
                {(nMode === 'inline' || (nMode === 'hover' && hover === `${s.school_id}-overall`)) && totalN > 0 && (
                  <span style={{ position: 'absolute', right: 4, top: 1, fontSize: 9,
                                  color: dark ? 'rgba(255,255,255,0.85)' : SLU.mute }}>
                    n={totalN}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      ))}
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
