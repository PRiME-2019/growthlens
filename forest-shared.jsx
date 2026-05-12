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

// Shared helpers + constants for forest-plot variants.
// Loaded after React + design-canvas, before each variant file.

const SLU = {
  blue: '#003DA5',
  blueDark: '#002A75',
  gold: '#9A7611',
  goldLight: '#C8A84A',
  bg: '#F7F7F8',
  ink: '#1A1B1F',
  ink2: '#3F4147',
  mute: '#7B7E85',
  rule: '#D9D9DD',
  rule2: '#EDEDEF',
  // Diverging dot fills (avoid color-only encoding; we always pair with shape/text)
  pos: '#003DA5',     // gap favors group A (non-FRL)
  neg: '#7C3A12',     // gap favors group B (FRL) — desaturated rust, not red
  pos50: '#5A7DC4',
  neg50: '#A87959',
};

// SLU brand typography (Google Fonts analogs)
//   FONT  — Mulish (analog of Brandon Grotesque) for headings + UI
//   SERIF — Crimson Pro for prose body (per SLU brand)
//   LABEL — Archivo Narrow Bold UPPERCASE for eyebrows / micro-labels
//   MONO  — JetBrains Mono kept for tabular numerics only
const FONT  = '"Mulish", ui-sans-serif, system-ui, -apple-system, sans-serif';
const SERIF = '"Crimson Pro", ui-serif, Georgia, "Times New Roman", serif';
const LABEL = '"Archivo Narrow", "Mulish", ui-sans-serif, sans-serif';
const MONO  = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// Domain extents derived from data (stable axis across variants).
const AXIS = {
  min: -0.55,
  max: 1.25,
  ticks: [-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0, 1.25],
};

// Map x-domain to pixel inside a forest plot of `width` px.
function xScale(x, width) {
  return ((x - AXIS.min) / (AXIS.max - AXIS.min)) * width;
}

// Format helpers
const fmt2 = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
const fmt2plain = (x) => x.toFixed(2);
const fmtB = (b) => b.toFixed(2);

// Unit conversion: weeks-of-learning depends on year × grade × subject growth
// effect sizes from reference/conversion_factors.json (loaded into
// window.CONVERSION_FACTORS at boot). The display uses the magnitude form
//   weeks = z * (base_weeks / annual_growth_effect_size)
// which is the difference-form of the methodological identity
//   weeks_of_learning = base_weeks * (1 + z / es)
// from the data-prep README — the +1 cancels for gaps and would obscure
// signed residual displays in the UI.
//
// Defaults come from window.WOL_OPTS = { year, subject } (set by app-shell
// whenever subject changes). Callers can override year / subject / grade
// per-call via the opts argument. Aggregated displays (school-level gaps,
// district-pooled box plots) pass no grade and get the year × subject average
// across grades 3–8.

const FALLBACK_WEEKS_PER_SD = 132; // ≈ 38 / 0.29 — typical MAP convention if factors unavailable
const DEFAULT_WOL_YEAR = 2025;

function weeksPerSD(opts = {}) {
  const defaults = window.WOL_OPTS || {};
  const year = opts.year != null ? opts.year
             : (defaults.year != null ? defaults.year : DEFAULT_WOL_YEAR);
  const subject = String(opts.subject != null ? opts.subject
             : (defaults.subject || 'ela')).toLowerCase();
  const grade = opts.grade != null ? opts.grade : null;

  const cf = window.CONVERSION_FACTORS;
  if (!cf || !Array.isArray(cf.factors)) return FALLBACK_WEEKS_PER_SD;
  const base = typeof cf.base_weeks === 'number' ? cf.base_weeks : 38;
  const matches = cf.factors.filter(f => f.year === year && f.subject === subject);
  if (matches.length === 0) return FALLBACK_WEEKS_PER_SD;

  let es = null;
  if (grade != null) {
    const exact = matches.find(f => f.grade === grade);
    if (exact) es = exact.annual_growth_effect_size;
  }
  if (es == null) {
    es = matches.reduce((s, f) => s + f.annual_growth_effect_size, 0) / matches.length;
  }
  if (!es || !isFinite(es) || es <= 0) return FALLBACK_WEEKS_PER_SD;
  return base / es;
}

function zToWeeks(z, opts) { return z * weeksPerSD(opts); }

function fmtVal(z, unit, opts) {
  if (unit === 'weeks') {
    const w = zToWeeks(z, opts);
    const r = Math.round(w);
    return `${r >= 0 ? '+' : '−'}${Math.abs(r)} wk`;
  }
  return fmt2(z);
}
function fmtCI(ci, unit, opts) {
  if (unit === 'weeks') {
    return `[${fmtVal(ci[0], 'weeks', opts)}, ${fmtVal(ci[1], 'weeks', opts)}]`;
  }
  return `[${fmt2(ci[0])}, ${fmt2(ci[1])}]`;
}

// Dot shape: triangle for negative gap (favors group B), circle for positive.
// This pairs the diverging color with shape so colorblind users can read it.
function DotShape({ cx, cy, gap, r = 4.5, fill, stroke, strokeWidth = 0, opacity = 1 }) {
  if (gap < 0) {
    // Down-triangle
    const h = r * 1.55;
    const pts = `${cx},${cy + h * 0.55} ${cx - h},${cy - h * 0.45} ${cx + h},${cy - h * 0.45}`;
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
  }
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
}

// Card shell mimicking SLU .card — white, rounded, subtle shadow, gold-underlined title.
function ForestCard({ title, subtitle, controls, children, footer }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
      border: `1px solid ${SLU.rule2}`,
      padding: 24, fontFamily: FONT, color: SLU.ink,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    paddingBottom: 8, marginBottom: 16,
                    borderBottom: `2px solid ${SLU.gold}` }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.1 }}>{title}</div>
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

// Reusable control-bar atoms. (The older Segmented helper was removed; the
// shell defines its own CSegmented with a different visual treatment.)
function Select({ value, onChange, options, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      {label && <span style={{ color: SLU.mute }}>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        fontSize: 12, fontFamily: FONT, padding: '4px 8px',
        border: `1px solid ${SLU.rule}`, borderRadius: 6, background: '#fff', color: SLU.ink2,
      }}>
        {Object.entries(options).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
      </select>
    </span>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: SLU.ink2 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
             style={{ accentColor: SLU.blue, width: 13, height: 13 }} />
      {children}
    </label>
  );
}

// Axis with tick labels, "favors group A / favors group B" guides.
function Axis({ width, height = 28, groupA, groupB, top = false }) {
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Zero line stub */}
      <line x1={xScale(0, width)} x2={xScale(0, width)}
            y1={top ? height - 6 : 0} y2={top ? height : 6}
            stroke={SLU.ink} strokeWidth={1} />
      {AXIS.ticks.map(t => (
        <g key={t}>
          <line x1={xScale(t, width)} x2={xScale(t, width)}
                y1={top ? height - 4 : 0} y2={top ? height : 4}
                stroke={SLU.mute} strokeWidth={1} />
          <text x={xScale(t, width)} y={top ? height - 8 : height - 4}
                fontSize={10} fontFamily={MONO} fill={SLU.ink2} textAnchor="middle">
            {t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2)}
          </text>
        </g>
      ))}
      {!top && (
        <g>
          <text x={xScale(0, width) - 6} y={height - 16} fontSize={9.5} fill={SLU.mute}
                fontFamily={FONT} textAnchor="end">◀ favors {groupB}</text>
          <text x={xScale(0, width) + 6} y={height - 16} fontSize={9.5} fill={SLU.mute}
                fontFamily={FONT} textAnchor="start">favors {groupA} ▶</text>
        </g>
      )}
    </svg>
  );
}

// Threshold-section divider strip
function SectionDivider({ label, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0 6px', marginTop: 6,
      fontSize: 11, color: SLU.mute, fontFamily: FONT,
      textTransform: 'uppercase', letterSpacing: 0.6,
    }}>
      <span style={{ flex: '0 0 auto' }}>{label}</span>
      {count != null && <span style={{ color: SLU.ink2, fontFamily: MONO }}>({count})</span>}
      <span style={{ flex: '1 1 auto', height: 1, background: SLU.rule }} />
    </div>
  );
}

Object.assign(window, {
  SLU, FONT, MONO, LABEL, SERIF, AXIS, xScale,
  fmt2, fmt2plain, fmtB, weeksPerSD, zToWeeks, fmtVal, fmtCI,
  DotShape, ForestCard, Select, Checkbox, Axis, SectionDivider,
});
