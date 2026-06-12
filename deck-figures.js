// GrowthLens deck figures — pure SVG-string builders, no DOM. UMD: browser →
// window.GLDeckFigs, Node → module.exports.
//
// Each builder takes a slide descriptor from engine/deck.js and returns
// { svg, w, h } (design units ≈ 100 px per slide inch). The Export page
// rasterizes the SVG to a 3× PNG for the PPTX — figures travel as single
// images that can't be nudged shape-by-shape — and the carousel displays the
// very same SVG, so the preview is exactly what downloads. Words and tables
// stay native PowerPoint; only the data graphics are frozen.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLDeckFigs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = {
    blue: '#003DA5', gold: '#9A7611', ink: '#1A1B1F', ink2: '#3F4147',
    mute: '#6F727A', rule: '#D9D9DD', rule2: '#EDEDEF', neg: '#7C3A12',
    paper: '#FDFCFA', bar: '#E8E9EC',
  };
  const SANS = 'Calibri, Arial, sans-serif';
  const MONO = 'Consolas, Menlo, monospace';

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const subjWord = (s) => (s === 'ela' ? 'ELA' : 'Math');
  const tickLabel = (t, dp) => (Math.abs(t) < 1e-9 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(dp));
  function niceStep(span, target = 4) {
    const raw = Math.abs(span) / target || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
    return 10 * mag;
  }
  const text = (x, y, s, opts = {}) => {
    const { size = 11, fill = C.ink2, anchor = 'start', mono = false, bold = false, italic = false, spacing = null, halo = false } = opts;
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${mono ? MONO : SANS}" font-size="${size}"`
      + ` fill="${fill}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}${italic ? ' font-style="italic"' : ''}`
      + `${halo ? ' paint-order="stroke" stroke="#FFFFFF" stroke-width="3.5" stroke-linejoin="round"' : ''}`
      + `${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;
  };
  const line = (x1, y1, x2, y2, stroke, width = 1, dash = null, opacity = 1) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`
    + ` stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}`
    + `${opacity !== 1 ? ` opacity="${opacity}"` : ''}/>`;
  const rect = (x, y, w, h, fill, opts = {}) =>
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}"`
    + ` fill="${fill}"${opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${opts.strokeW || 1}"` : ''}`
    + `${opts.opacity ? ` opacity="${opts.opacity}"` : ''}${opts.rx ? ` rx="${opts.rx}"` : ''}/>`;
  const diamond = (cx, cy, r, fill, stroke, strokeW = 1.2) =>
    `<polygon points="${cx},${cy - r} ${cx + r * 0.72},${cy} ${cx},${cy + r} ${cx - r * 0.72},${cy}"`
    + ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`;
  const wrap = (w, h, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="#FFFFFF"/>` + body + '</svg>';

  // ---- Scores vs. growth -----------------------------------------------------
  // Quadrant scatter: district-average crosshair, gold-ringed named standouts.
  function scatter(d) {
    const W = 790, H = 500, padL = 64, padR = 14, padT = 30, padB = 56;
    const pw = W - padL - padR, ph = H - padT - padB;
    const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
    const padX = Math.max(0.1, (Math.max(...xs) - Math.min(...xs)) * 0.15);
    const padY = Math.max(0.04, (Math.max(...ys) - Math.min(...ys)) * 0.18);
    const xLo = Math.min(...xs, d.xMean) - padX, xHi = Math.max(...xs, d.xMean) + padX;
    const yLo = Math.min(...ys, d.yMean) - padY, yHi = Math.max(...ys, d.yMean) + padY;
    const sx = (v) => padL + ((v - xLo) / (xHi - xLo || 1)) * pw;
    const sy = (v) => padT + ph - ((v - yLo) / (yHi - yLo || 1)) * ph;
    let b = rect(padL, padT, pw, ph, '#FFFFFF', { stroke: C.rule });
    const xStep = niceStep(xHi - xLo), yStep = niceStep(yHi - yLo);
    for (let t = Math.ceil(xLo / xStep) * xStep; t <= xHi + 1e-9; t += xStep) {
      b += line(sx(t), padT, sx(t), padT + ph, C.rule2, 1);
      b += text(sx(t), padT + ph + 18, tickLabel(t, 1), { size: 10, fill: C.mute, anchor: 'middle', mono: true });
    }
    for (let t = Math.ceil(yLo / yStep) * yStep; t <= yHi + 1e-9; t += yStep) {
      b += line(padL, sy(t), padL + pw, sy(t), C.rule2, 1);
      b += text(padL - 8, sy(t) + 3.5, tickLabel(t, 2), { size: 10, fill: C.mute, anchor: 'end', mono: true });
    }
    b += line(sx(d.xMean), padT, sx(d.xMean), padT + ph, C.ink2, 1.2, '5 4');
    b += line(padL, sy(d.yMean), padL + pw, sy(d.yMean), C.ink2, 1.2, '5 4');
    const corner = (s1, s2, x, y, anchor) =>
      text(x, y, s1, { size: 9.5, fill: C.mute, anchor, italic: true })
      + text(x, y + 12, s2, { size: 9.5, fill: C.mute, anchor, italic: true });
    b += corner('lower scores', 'faster growth', padL + 9, padT + 16, 'start');
    b += corner('higher scores', 'faster growth', padL + pw - 9, padT + 16, 'end');
    b += corner('lower scores', 'slower growth', padL + 9, padT + ph - 18, 'start');
    b += corner('higher scores', 'slower growth', padL + pw - 9, padT + ph - 18, 'end');
    const standout = new Set([d.best.name, d.worst.name]);
    for (const p of d.points) {
      const X = sx(p.x), Y = sy(p.y);
      if (standout.has(p.name)) b += `<circle cx="${X}" cy="${Y}" r="11" fill="none" stroke="${C.gold}" stroke-width="2"/>`;
      b += `<circle cx="${X}" cy="${Y}" r="7" fill="${C.blue}" stroke="#FFFFFF" stroke-width="1.5"/>`;
      if (standout.has(p.name)) {
        const left = X > padL + pw * 0.62;
        b += text(left ? X - 15 : X + 15, Y + 4, p.name, { size: 10.5, fill: C.ink, anchor: left ? 'end' : 'start', bold: true });
      }
    }
    b += text(padL + pw / 2, H - 12, 'This year’s score (standard scale) →', { size: 10.5, fill: C.mute, anchor: 'middle' });
    b += text(padL - 50, padT - 12, '↑ Growth vs. expected', { size: 10.5, fill: C.mute });
    return { svg: wrap(W, H, b), w: W, h: H };
  }

  // ---- Growth by student group -------------------------------------------------
  // Box strips per group with median diamonds; same vocabulary as the app.
  function groups(d) {
    const W = 1213, H = 430, labelW = 330, valueW = 90, top = 8;
    const x0 = labelW + 18, pw = W - x0 - valueW - 20;
    const span = d.domain.max - d.domain.min || 1;
    const xOf = (v) => x0 + ((v - d.domain.min) / span) * pw;
    const nSections = d.sections.length;
    const nGroups = d.sections.reduce((t, s) => t + s.groups.length, 0);
    const avail = H - top - 30;
    const need = nSections * 26 + nGroups * 40 + nSections * 8;
    const k = Math.min(1, avail / Math.max(1, need));
    const secH = 26 * k, rowH = 40 * k, trail = 8 * k;
    const barH = Math.min(18, rowH * 0.52), diaR = Math.min(13, rowH * 0.36);
    let y = top;
    const yTop = y;
    let b = '';
    for (const sec of d.sections) {
      b += text(8, y + secH - 9, sec.title.toUpperCase(), { size: 9.5, fill: C.gold, bold: true, spacing: 1.5 });
      y += secH;
      for (const g of sec.groups) {
        const mid = y + rowH / 2;
        const color = g.median >= 0 ? C.blue : C.neg;
        b += text(labelW, mid + 4, g.label, { size: 12, fill: C.ink, anchor: 'end', bold: true });
        b += text(labelW + 6, mid + 4, ` n=${Number(g.n).toLocaleString()}`, { size: 9, fill: C.mute });
        b += rect(xOf(g.q1), mid - barH / 2, xOf(g.q3) - xOf(g.q1), barH, color, { opacity: 0.18, stroke: color, rx: 2 });
        b += diamond(xOf(g.median), mid, diaR, '#FFFFFF', color, 1.6);
        b += text(W - 12, mid + 4, g.text, { size: 11, fill: C.ink2, anchor: 'end', mono: true });
        y += rowH;
      }
      y += trail;
    }
    b = line(xOf(0), yTop, xOf(0), y, C.ink2, 1.2, '5 4') + b;
    b += text(xOf(0), y + 16, '↑ typical year of growth', { size: 10, fill: C.ink2, anchor: 'middle' });
    b += text(W - 12, y + 16, 'box = the middle half of that group’s students · diamond = the typical student',
      { size: 10, fill: C.mute, anchor: 'end' });
    return { svg: wrap(W, Math.ceil(y + 26), b), w: W, h: Math.ceil(y + 26) };
  }

  // ---- Statewide histograms ----------------------------------------------------
  // The app's design: gray statewide silhouette, one visible gold tile per
  // district school, dashed typical-growth line, per-panel caption.
  function stateHist(d) {
    const blocks = d.levels.flatMap((lv) => ['ela', 'math'].map((sub) => ({ lv, sub })))
      .filter((bk) => bk.lv.subjects[bk.sub].poolN > 0).slice(0, 4);
    const cols = Math.min(2, Math.max(1, blocks.length)), rows = Math.ceil(blocks.length / cols);
    const PW = cols === 1 ? 700 : 596, PH = 240, GAP = 22;
    const W = cols * PW + (cols - 1) * GAP, H = rows * PH;
    let b = '';
    blocks.forEach((bk, i) => {
      const ox = (i % cols) * (PW + GAP), oy = Math.floor(i / cols) * PH;
      const s = bk.lv.subjects[bk.sub];
      const plotY = oy + 30, plotH = PH - 96, baseline = plotY + plotH;
      b += text(ox, oy + 16, `${bk.lv.heading} · ${subjWord(bk.sub)}`, { size: 12, fill: C.ink, bold: true });
      b += text(ox + PW, oy + 16, `${s.poolN.toLocaleString()} schools statewide`, { size: 10, fill: C.mute, anchor: 'end' });
      const x0 = s.bins[0].x0, x1 = s.bins[s.bins.length - 1].x1;
      const xOf = (v) => ox + ((v - x0) / (x1 - x0 || 1)) * PW;
      const maxC = Math.max(1, ...s.bins.map((c) => c.count));
      const barW = PW / s.bins.length;
      for (const c of s.bins) {
        if (!c.count) continue;
        const h = (c.count / maxC) * plotH;
        b += rect(xOf(c.x0) + 0.8, baseline - h, barW - 1.6, h, C.bar);
      }
      const tileH = Math.min(15, plotH / 5);
      const stack = {};
      for (const sch of s.yours) {
        let bi = s.bins.findIndex((c) => sch.z >= c.x0 && sch.z < c.x1);
        if (bi < 0) bi = s.bins.length - 1;
        const lvl = stack[bi] || 0; stack[bi] = lvl + 1;
        b += rect(xOf(s.bins[bi].x0) + 0.8, baseline - (lvl + 1) * (tileH + 1.5), barW - 1.6, tileH,
          C.gold, { stroke: '#FFFFFF', strokeW: 1 });
      }
      b += line(xOf(0), plotY - 6, xOf(0), baseline + 4, C.ink2, 1.2, '5 4');
      b += line(ox, baseline, ox + PW, baseline, C.rule, 1);
      const step = niceStep(x1 - x0, 5);
      for (let t = Math.ceil(x0 / step) * step; t <= x1 + 1e-9; t += step) {
        const tx = Math.max(ox + 13, Math.min(xOf(t), ox + PW - 13));
        b += text(tx, baseline + 15, tickLabel(t, 1), { size: 9.5, fill: C.mute, anchor: 'middle', mono: true });
      }
      b += text(xOf(0), baseline + 30, '↑ typical growth', { size: 9.5, fill: C.ink2, anchor: 'middle' });
      const at = s.yours.filter((sch) => sch.z >= 0).length;
      b += `<text x="${ox}" y="${baseline + 50}" font-family="${SANS}" font-size="11" fill="${C.ink2}">`
        + `<tspan font-weight="bold" fill="${C.ink}">${at} of ${s.yours.length}</tspan>`
        + ` of your schools grew at least as fast as the typical Missouri school</text>`;
      b += text(ox + PW, baseline + 50, 'gold = your schools', { size: 10, fill: C.mute, anchor: 'end' });
    });
    return { svg: wrap(W, H, b), w: W, h: H };
  }

  // ---- Statewide growth over time ------------------------------------------------
  // Solid segments between consecutive years; dashed bridge across 2020.
  function stateTrend(d) {
    const PW = 560, PH = 470, GAP = 90, padL = 56, padR = 16, padT = 42, padB = 40;
    const panels = ['ela', 'math'].filter((s) => (d.series[s] || []).length);
    const W = panels.length * (PW + GAP) - GAP + 10, H = PH;
    const y0 = Number(d.years[0]), y1 = Number(d.years[d.years.length - 1]);
    const allZ = panels.flatMap((s) => d.series[s].map((p) => p.z));
    const ext = Math.max(0.05, ...allZ.map(Math.abs)) * 1.25;
    let b = '';
    panels.forEach((sub, i) => {
      const ox = i * (PW + GAP);
      const pw = PW - padL - padR, ph = PH - padT - padB;
      const xOf = (yr) => ox + padL + (y1 === y0 ? pw / 2 : ((Number(yr) - y0) / (y1 - y0)) * pw);
      const yOf = (z) => padT + ((ext - z) / (2 * ext)) * ph;
      b += text(ox + padL - 6, 20, subjWord(sub), { size: 13.5, fill: C.ink, bold: true });
      for (const t of [-ext, -ext / 2, ext / 2, ext]) {
        b += line(ox + padL, yOf(t), ox + padL + pw, yOf(t), C.rule2, 1);
        b += text(ox + padL - 8, yOf(t) + 3.5, tickLabel(t, 2), { size: 9.5, fill: C.mute, anchor: 'end', mono: true });
      }
      b += line(ox + padL, yOf(0), ox + padL + pw, yOf(0), C.ink2, 1.2, '5 4');
      b += text(ox + padL - 8, yOf(0) + 3.5, '0', { size: 9.5, fill: C.ink2, anchor: 'end', mono: true });
      const pts = d.series[sub];
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], c = pts[j];
        const gap = Number(c.year) - Number(a.year) > 1;
        b += line(xOf(a.year), yOf(a.z), xOf(c.year), yOf(c.z), C.blue, 2.5, gap ? '7 6' : null, gap ? 0.85 : 1);
      }
      pts.forEach((p, j) => {
        b += `<circle cx="${xOf(p.year)}" cy="${yOf(p.z)}" r="5" fill="${C.blue}" stroke="#FFFFFF" stroke-width="1.5"/>`;
        if (j === 0 || j === pts.length - 1) {
          const lx = Math.max(ox + padL + 16, Math.min(xOf(p.year), ox + padL + pw - 16));
          b += text(lx, yOf(p.z) - 12, tickLabel(p.z, 2), { size: 10, fill: C.blue, anchor: 'middle', mono: true, bold: true, halo: true });
        }
      });
      for (let yr = y0; yr <= y1; yr++) {
        const has = pts.some((p) => Number(p.year) === yr);
        b += text(xOf(yr), padT + ph + 22, `’${String(yr).slice(2)}`, { size: 10, fill: has ? C.mute : C.rule, anchor: 'middle', mono: true });
      }
    });
    return { svg: wrap(W, H, b), w: W, h: H };
  }

  // ---- Appendix forest -------------------------------------------------------------
  // Striped rows, CI bars with end caps, median diamonds, labeled reference lines.
  function forest(d) {
    const W = 1213, labelW = 330, valueW = 86;
    const rows = d.rows.slice(0, 11);
    const rowH = Math.min(52, 400 / Math.max(1, rows.length));
    const top = 30, bottom = top + Math.max(1, rows.length) * rowH;
    const H = Math.ceil(bottom + 56);
    const x0 = labelW + 24, pw = W - x0 - valueW - 18;
    const ciVals = rows.flatMap((r) => r.ci);
    const rawLo = Math.min(0, d.district.gap, ...ciVals), rawHi = Math.max(0, d.district.gap, ...ciVals);
    const pad = Math.max(0.03, (rawHi - rawLo) * 0.08);
    const lo = rawLo - pad, hi = rawHi + pad;
    const xOf = (v) => x0 + ((v - lo) / (hi - lo || 1)) * pw;
    let b = '';
    rows.forEach((r, i) => {
      if (i % 2 === 1) b += rect(0, top + i * rowH, W, rowH, C.paper);
    });
    b += line(xOf(0), top - 10, xOf(0), bottom + 10, C.ink2, 1.4);
    b += line(xOf(d.district.gap), top - 10, xOf(d.district.gap), bottom + 10, C.gold, 2, '7 5');
    b += text(xOf(0), top - 16, 'no gap', { size: 10, fill: C.ink2, anchor: 'middle' });
    rows.forEach((r, i) => {
      const mid = top + i * rowH + rowH / 2;
      const color = r.gap >= 0 ? C.blue : C.neg;
      b += text(labelW, mid + 4, r.name, { size: 12, fill: C.ink, anchor: 'end' });
      b += text(labelW + 6, mid + 4, ` n=${Number(r.nA + r.nB).toLocaleString()}`, { size: 9, fill: C.mute });
      b += line(xOf(r.ci[0]), mid, xOf(r.ci[1]), mid, color, 2.5);
      b += line(xOf(r.ci[0]), mid - 6, xOf(r.ci[0]), mid + 6, color, 1.8);
      b += line(xOf(r.ci[1]), mid - 6, xOf(r.ci[1]), mid + 6, color, 1.8);
      b += diamond(xOf(r.gap), mid, 11, color, '#FFFFFF', 1.4);
      b += text(W - 10, mid + 4, r.text, { size: 11.5, fill: color, anchor: 'end', mono: true, bold: true });
    });
    const step = niceStep(hi - lo, 5);
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      b += text(xOf(t), bottom + 22, tickLabel(t, 2), { size: 10, fill: C.mute, anchor: 'middle', mono: true });
    }
    b += text(xOf(d.district.gap), bottom + 42, `district ${d.district.text}`, { size: 10.5, fill: C.gold, anchor: 'middle', bold: true });
    return { svg: wrap(W, H, b), w: W, h: H };
  }

  return { scatter, groups, stateHist, stateTrend, forest };
});
