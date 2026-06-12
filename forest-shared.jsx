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
  mute: '#6F727A',    // ≥4.5:1 on white — this gray carries lots of 11–12px labels
  rule: '#D9D9DD',
  rule2: '#EDEDEF',
  // Diverging dot fills (avoid color-only encoding; we always pair with shape/text)
  pos: '#003DA5',     // positive gap — favors the focal group (group A)
  neg: '#7C3A12',     // negative gap — favors the reference group (group B); desaturated rust, not red
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

// Respect prefers-reduced-motion: chart files gate their CSS transitions on this.
const MOTION_OK = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

// Unit conversion: weeks-of-learning depends on year × grade × subject growth
// effect sizes from reference/conversion_factors.json (loaded into
// window.CONVERSION_FACTORS at boot). The display uses the magnitude form
//   weeks = z * (base_weeks / annual_growth_effect_size)
// — the same form the JSON's `formula` field states; its parenthetical level
// form base_weeks * (1 + z / es) adds back the typical year, which would
// obscure signed gap displays in the UI.
//
// Defaults come from window.WOL_OPTS = { year, subject } (set by app-shell
// whenever subject changes). Callers can override year / subject / grade
// per-call via the opts argument. Aggregated displays (school-level gaps,
// district-pooled box plots) pass no grade and get the year × subject average
// across grades 4–8 (grade 3 has no factor — no grade-2 MAP baseline exists).

// The conversion math lives in engine/units.js (pure, Node-tested); these thin
// wrappers resolve the app-state defaults (window.WOL_OPTS + the loaded factors).
const DEFAULT_WOL_YEAR = 2025;

function wolDefaults(opts = {}) {
  const defaults = window.WOL_OPTS || {};
  return {
    year: opts.year != null ? opts.year
        : (defaults.year != null ? defaults.year : DEFAULT_WOL_YEAR),
    subject: String(opts.subject != null ? opts.subject
        : (defaults.subject || 'ela')).toLowerCase(),
    grade: opts.grade != null ? opts.grade : null,
  };
}

// The factor year actually used (after units.js's nearest-year fallback) — so
// footnotes can name the real year instead of the requested one. Null when no
// factors are loaded at all.
function wolFactorYear(opts = {}) {
  const { year, subject } = wolDefaults(opts);
  return window.GLUnits.resolveFactorYear(window.CONVERSION_FACTORS, year, subject);
}

function weeksPerSD(opts = {}) {
  return window.GLUnits.weeksPerSD(window.CONVERSION_FACTORS, wolDefaults(opts));
}

function zToWeeks(z, opts) { return z * weeksPerSD(opts); }

function fmtVal(z, unit, opts) {
  if (unit === 'weeks') {
    const w = zToWeeks(z, opts);
    const r = Math.round(w);
    return `${r >= 0 ? '+' : '−'}${Math.abs(r)} week${Math.abs(r) === 1 ? '' : 's'}`;
  }
  return fmt2(z);
}
function fmtCI(ci, unit, opts) {
  if (unit === 'weeks') {
    return `[${fmtVal(ci[0], 'weeks', opts)}, ${fmtVal(ci[1], 'weeks', opts)}]`;
  }
  return `[${fmt2(ci[0])}, ${fmt2(ci[1])}]`;
}

// Reusable control-bar atoms. (The older Segmented helper was removed; the
// shell defines its own CSegmented with a different visual treatment.)
function Select({ value, onChange, options, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      {label && <span style={{ color: SLU.mute }}>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
              aria-label={label || undefined} style={{
        fontSize: 12, fontFamily: FONT, padding: '4px 8px',
        border: `1px solid ${SLU.rule}`, borderRadius: 6, background: '#fff', color: SLU.ink2,
      }}>
        {Object.entries(options).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
      </select>
    </span>
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
  SLU, FONT, MONO, LABEL, SERIF, AXIS, xScale, MOTION_OK,
  fmt2, fmt2plain, weeksPerSD, wolFactorYear, zToWeeks, fmtVal, fmtCI,
  Select, SectionDivider,
});
