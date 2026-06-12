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

// Export page — builds the full GrowthLens deck (PPTX) and previews it in a
// carousel. ALL content comes from the deck model (engine/deck.js); this file
// only renders: one PPTX layout function and one preview component per slide
// kind. System fonts only (Calibri / Georgia / Consolas) so the file looks
// the same on any machine.

const XP = {
  blue: '003DA5', blueDark: '002A75', gold: '9A7611', goldLight: 'C8A84A',
  ink: '1A1B1F', ink2: '3F4147', mute: '6F727A', rule: 'D9D9DD', rule2: 'EDEDEF',
  neg: '7C3A12', paper: 'FDFCFA',
};
const F_HEAD = 'Calibri', F_BODY = 'Calibri', F_SERIF = 'Georgia', F_MONO = 'Consolas';
const PAGE_W = 13.33, PAGE_H = 7.5;

// window.divColor returns "rgb(r,g,b)" — PptxGenJS wants bare hex.
function rgbToHex(rgb) {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);
  if (!m) return 'FFFFFF';
  return [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0').toUpperCase()).join('');
}

// Standard slide chrome: eyebrow + title + gold rule, and a ruled footer
// with the deck identity left and the page number right.
function chrome(slide, deck, d, eyebrow, title) {
  slide.addText(eyebrow.toUpperCase(), { x: 0.6, y: 0.3, w: 9, h: 0.3, fontFace: F_HEAD, fontSize: 11, color: XP.gold, bold: true, charSpacing: 3 });
  slide.addText(title, { x: 0.6, y: 0.6, w: 12.1, h: 0.55, fontFace: F_SERIF, fontSize: 24, color: XP.ink });
  slide.addShape('rect', { x: 0.6, y: 1.26, w: 0.55, h: 0.035, fill: { color: XP.gold }, line: { type: 'none' } });
  slide.addShape('line', { x: 0.6, y: PAGE_H - 0.46, w: 12.13, h: 0, line: { color: XP.rule2, width: 0.75 } });
  const tag = deck.meta.sample ? 'SAMPLE DATA · ' : '';
  slide.addText(`${tag}${deck.meta.district} · ${deck.meta.year}`,
    { x: 0.6, y: PAGE_H - 0.38, w: 8, h: 0.26, fontFace: F_HEAD, fontSize: 9, color: XP.mute, charSpacing: 2 });
  slide.addText(`GrowthLens · ${d.n} / ${deck.slides.length}`,
    { x: 9.7, y: PAGE_H - 0.38, w: 3.03, h: 0.26, fontFace: F_HEAD, fontSize: 9, color: XP.mute, charSpacing: 2, align: 'right' });
}
const subjWord = (s) => (s === 'ela' ? 'ELA' : 'Math');

// Round a chart step to a friendly size (1/2/2.5/5 × 10^k).
function niceStep(span, target = 4) {
  const raw = Math.abs(span) / target || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

// "What stands out" — the page's generated takeaways in a paper band with a
// gold edge, the deck's counterpart of the app's overview-card bullets.
function takeawayBand(slide, takeaways, { x = 0.6, y, w = 12.13, h = 1.15, fontSize = 10.5 } = {}) {
  if (!takeaways || !takeaways.length) return;
  slide.addShape('rect', { x, y, w, h, fill: { color: XP.paper }, line: { color: XP.rule2, width: 0.75 } });
  slide.addShape('rect', { x, y, w: 0.045, h, fill: { color: XP.gold }, line: { type: 'none' } });
  slide.addText('WHAT STANDS OUT', { x: x + 0.16, y: y + 0.07, w: w - 0.3, h: 0.22, fontFace: F_HEAD, fontSize: 8.5, bold: true, color: XP.mute, charSpacing: 2 });
  const rows = takeaways.flatMap((t) => mdRuns(t.text, { fontSize, color: XP.ink2 })
    .map((r, i, arr) => ({ ...r, options: { ...r.options, bullet: i === 0 ? { code: '25AA', indent: 10 } : undefined, breakLine: i === arr.length - 1, paraSpaceAfter: 4 } })));
  slide.addText(rows, { x: x + 0.18, y: y + 0.3, w: w - 0.42, h: h - 0.38, fontFace: F_BODY, valign: 'top', lineSpacingMultiple: 1.08 });
}

// ---- PPTX layouts (one per slide kind) -------------------------------------
function layoutCover(pres, slide, deck, d) {
  slide.background = { color: XP.blueDark };
  // Brand glyph — the measurement bar from the favicon: a muted track with
  // gold and light-blue segments and a reference tick.
  slide.addShape('rect', { x: 0.92, y: 1.06, w: 1.7, h: 0.075, fill: { color: '3D5187' }, line: { type: 'none' } });
  slide.addShape('rect', { x: 1.43, y: 1.06, w: 0.6, h: 0.075, fill: { color: XP.goldLight }, line: { type: 'none' } });
  slide.addShape('rect', { x: 2.03, y: 1.06, w: 0.59, h: 0.075, fill: { color: '5A7DC4' }, line: { type: 'none' } });
  slide.addShape('line', { x: 2.03, y: 0.94, w: 0, h: 0.3, line: { color: 'FFFFFF', width: 1.5 } });
  slide.addText('GrowthLens', { x: 0.9, y: 1.4, w: 8, h: 0.8, fontFace: F_SERIF, fontSize: 40, color: 'FFFFFF' });
  slide.addShape('rect', { x: 0.95, y: 2.4, w: 1.0, h: 0.04, fill: { color: XP.goldLight }, line: { type: 'none' } });
  slide.addText(d.district, { x: 0.9, y: 3.0, w: 11.5, h: 1.0, fontFace: F_HEAD, fontSize: 36, bold: true, color: 'FFFFFF' });
  slide.addText(`Growth report · ${d.year} · ${d.subjects.join(' + ')}`,
    { x: 0.9, y: 4.05, w: 11, h: 0.5, fontFace: F_HEAD, fontSize: 17, color: XP.goldLight });
  if (d.sample) {
    slide.addShape('roundRect', { x: 0.9, y: 4.75, w: 3.85, h: 0.42, rectRadius: 0.08,
      fill: { color: '1B3568' }, line: { color: 'C8A84A', width: 1 } });
    slide.addText('SAMPLE DATA — FOR DEMONSTRATION ONLY', { x: 1.0, y: 4.79, w: 3.7, h: 0.34,
      fontFace: F_HEAD, fontSize: 10, bold: true, color: 'FFD27D', charSpacing: 1.5, valign: 'middle' });
  }
  slide.addShape('line', { x: 0.9, y: PAGE_H - 0.85, w: 11.5, h: 0, line: { color: '3D5187', width: 0.75 } });
  slide.addText(`PRiME Center · Saint Louis University · ${d.today}`,
    { x: 0.9, y: PAGE_H - 0.72, w: 11, h: 0.35, fontFace: F_HEAD, fontSize: 10, color: 'B9C4DE', charSpacing: 2 });
  slide.addNotes('Title slide. Set the scene: this is the district’s growth report. Anyone who wants the technical detail can read the methods note linked from the app.');
}

function layoutBullets(slide, bullets, x, y, w, opts = {}) {
  slide.addText(bullets.map((b) => ({
    text: typeof b === 'string' ? b : b.text,
    options: { bullet: { code: '2022', indent: 12 }, breakLine: true, paraSpaceAfter: 8 },
  })), { x, y, w, h: 4.6, fontFace: F_BODY, fontSize: opts.fontSize || 15, color: XP.ink2, valign: 'top', lineSpacingMultiple: 1.15 });
}

// **bold** markers from the insight generators → PPTX runs.
function mdRuns(text, base = {}) {
  return text.split('**').map((seg, i) => ({
    text: seg, options: { ...base, bold: i % 2 === 1 },
  })).filter((r) => r.text !== '');
}

function layoutIntro(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Before the numbers', 'How to read this deck');
  layoutBullets(slide, d.bullets, 0.8, 1.9, 11.6, { fontSize: 17 });
  slide.addNotes('Three ground rules before any figure: zero means a typical year of growth; small groups are steadied; the unit in use. Read them aloud — they prevent the most common misreadings.');
}

function layoutGlance(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Summary', 'Your district at a glance');
  const n = Math.max(1, d.tiles.length);
  const gap = 0.3, tileW = (12.13 - gap * (n - 1)) / n, tileH = 1.85;
  d.tiles.forEach((t, i) => {
    const x = 0.6 + i * (tileW + gap);
    slide.addShape('rect', { x, y: 1.65, w: tileW, h: tileH, fill: { color: XP.paper }, line: { color: XP.rule2, width: 1 } });
    slide.addShape('rect', { x, y: 1.65, w: tileW, h: 0.045, fill: { color: XP.gold }, line: { type: 'none' } });
    slide.addText(t.label.toUpperCase(), { x: x + 0.2, y: 1.82, w: tileW - 0.4, h: 0.45, fontFace: F_HEAD, fontSize: 9.5, bold: true, color: XP.mute, charSpacing: 1.5, valign: 'top' });
    slide.addText(t.value, { x: x + 0.2, y: 2.3, w: tileW - 0.4, h: 0.7, fontFace: F_MONO, fontSize: 32, bold: true, color: XP.blue });
    slide.addText(t.sub, { x: x + 0.2, y: 3.05, w: tileW - 0.4, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  });
  slide.addText('WHAT THE DATA SAYS', { x: 0.6, y: 3.85, w: 5, h: 0.26, fontFace: F_HEAD, fontSize: 9, bold: true, color: XP.mute, charSpacing: 2.5 });
  const rows = d.takeaways.flatMap((t) => mdRuns(t.text, { fontSize: 13, color: XP.ink2 })
    .map((r, i, arr) => ({ ...r, options: { ...r.options, bullet: i === 0 ? { code: '25AA', indent: 14 } : undefined, breakLine: i === arr.length - 1, paraSpaceAfter: 9 } })));
  slide.addText(rows, { x: 0.75, y: 4.15, w: 11.8, h: 2.7, fontFace: F_BODY, valign: 'top', lineSpacingMultiple: 1.12 });
  slide.addNotes('The whole story on one slide. Each bullet is generated from the data behind a later section; the sections carry the detail.');
}

function layoutHeat(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Growth by school & grade');
  const head = [{ text: 'School', options: { bold: true, color: XP.mute, fontSize: 10, align: 'left' } },
    ...d.grades.map((g) => ({ text: `Gr ${g}`, options: { bold: true, color: XP.mute, fontSize: 10, align: 'center' } })),
    { text: 'Overall', options: { bold: true, color: XP.mute, fontSize: 10, align: 'center' } }];
  const body = d.rows.map((r) => [
    { text: r.name, options: { fontFace: F_BODY, fontSize: 11, color: XP.ink, align: 'left' } },
    ...r.cells.map((c) => {
      if (!c) return { text: '', options: { fill: { color: 'FFFFFF' } } };
      if (!c.ok) return { text: 'too few', options: { fontSize: 8, color: XP.mute, align: 'center', fill: { color: 'F4F4F6' } } };
      const fill = rgbToHex(window.divColor(c.z));
      const ink = window.heatCellInk(c.z) === '#fff' ? 'FFFFFF' : XP.ink;
      return { text: c.text, options: { fontFace: F_MONO, fontSize: 10, color: ink, align: 'center', fill: { color: fill } } };
    }),
    r.overall
      ? { text: r.overall.text, options: { fontFace: F_MONO, fontSize: 10, bold: true, align: 'center',
          fill: { color: rgbToHex(window.divColor(r.overall.z)) },
          color: window.heatCellInk(r.overall.z) === '#fff' ? 'FFFFFF' : XP.ink } }
      : { text: '—', options: { align: 'center', color: XP.mute } },
  ]);
  const rowH = Math.min(0.42, 3.7 / (body.length + 1));
  slide.addTable([head, ...body], { x: 0.6, y: 1.55, w: 12.13, rowH,
    colW: [3.4, ...d.grades.map(() => (12.13 - 3.4 - 1.3) / d.grades.length), 1.3],
    border: { type: 'solid', color: 'FFFFFF', pt: 1 }, valign: 'middle', fontFace: F_BODY });
  // Legend chips under the table, where the eye lands after reading it.
  const legendY = 1.55 + rowH * (body.length + 1) + 0.18;
  slide.addShape('rect', { x: 0.62, y: legendY + 0.03, w: 0.22, h: 0.14, fill: { color: rgbToHex(window.divColor(0.2)) }, line: { type: 'none' } });
  slide.addText('growing faster than expected', { x: 0.88, y: legendY - 0.04, w: 2.4, h: 0.26, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  slide.addShape('rect', { x: 3.3, y: legendY + 0.03, w: 0.22, h: 0.14, fill: { color: rgbToHex(window.divColor(-0.2)) }, line: { type: 'none' } });
  slide.addText('growing slower', { x: 3.56, y: legendY - 0.04, w: 1.4, h: 0.26, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  slide.addText('numbers steadied toward the district average, so a few students can’t swing a cell',
    { x: 5.1, y: legendY - 0.04, w: 7.6, h: 0.26, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute, align: 'right' });
  takeawayBand(slide, d.takeaways, { y: PAGE_H - 1.85, h: 1.2 });
  slide.addNotes('Scan rows for schools that are consistently strong or soft, and columns for grades where the whole district leans one way.');
}

// Shape-drawn scatter — the native chart can't put the quadrant crosshair at
// the district averages or keep its axis labels out of the plot.
function layoutScatter(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Scores vs. growth, school by school');
  const px = 0.95, py = 1.75, pw = 7.45, ph = 4.15;
  const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
  const padX = Math.max(0.1, (Math.max(...xs) - Math.min(...xs)) * 0.15);
  const padY = Math.max(0.04, (Math.max(...ys) - Math.min(...ys)) * 0.18);
  const xLo = Math.min(...xs, d.xMean) - padX, xHi = Math.max(...xs, d.xMean) + padX;
  const yLo = Math.min(...ys, d.yMean) - padY, yHi = Math.max(...ys, d.yMean) + padY;
  const sx = (v) => px + ((v - xLo) / (xHi - xLo || 1)) * pw;
  const sy = (v) => py + ph - ((v - yLo) / (yHi - yLo || 1)) * ph;

  slide.addShape('rect', { x: px, y: py, w: pw, h: ph, fill: { color: 'FFFFFF' }, line: { color: XP.rule, width: 1 } });
  // gridlines + tick labels (outside the plot, never rotated)
  const xStep = niceStep(xHi - xLo), yStep = niceStep(yHi - yLo);
  const tickLabel = (t, dp) => (Math.abs(t) < 1e-9 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(dp));
  for (let t = Math.ceil(xLo / xStep) * xStep; t <= xHi + 1e-9; t += xStep) {
    const X = sx(t);
    slide.addShape('line', { x: X, y: py, w: 0, h: ph, line: { color: XP.rule2, width: 0.75 } });
    slide.addText(tickLabel(t, 1),
      { x: X - 0.4, y: py + ph + 0.04, w: 0.8, h: 0.22, fontFace: F_MONO, fontSize: 8.5, color: XP.mute, align: 'center' });
  }
  for (let t = Math.ceil(yLo / yStep) * yStep; t <= yHi + 1e-9; t += yStep) {
    const Y = sy(t);
    slide.addShape('line', { x: px, y: Y, w: pw, h: 0, line: { color: XP.rule2, width: 0.75 } });
    slide.addText(tickLabel(t, 2),
      { x: px - 0.62, y: Y - 0.11, w: 0.56, h: 0.22, fontFace: F_MONO, fontSize: 8.5, color: XP.mute, align: 'right' });
  }
  // district-average crosshair — the quadrant split
  slide.addShape('line', { x: sx(d.xMean), y: py, w: 0, h: ph, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
  slide.addShape('line', { x: px, y: sy(d.yMean), w: pw, h: 0, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
  // quadrant corner labels
  const corner = (tx, x, y, align) => slide.addText(tx, { x, y, w: 2.6, h: 0.34, fontFace: F_HEAD,
    fontSize: 8, italic: true, color: XP.mute, align, valign: 'top', lineSpacingMultiple: 0.95 });
  corner('lower scores\nfaster growth', px + 0.08, py + 0.07, 'left');
  corner('higher scores\nfaster growth', px + pw - 2.68, py + 0.07, 'right');
  corner('lower scores\nslower growth', px + 0.08, py + ph - 0.42, 'left');
  corner('higher scores\nslower growth', px + pw - 2.68, py + ph - 0.42, 'right');
  // dots, with the standouts ringed in gold and named in place
  const standout = new Set([d.best.name, d.worst.name]);
  for (const p of d.points) {
    const X = sx(p.x), Y = sy(p.y), R = 0.075;
    if (standout.has(p.name)) {
      slide.addShape('ellipse', { x: X - R - 0.035, y: Y - R - 0.035, w: 2 * R + 0.07, h: 2 * R + 0.07,
        fill: { type: 'none' }, line: { color: XP.gold, width: 1.5 } });
    }
    slide.addShape('ellipse', { x: X - R, y: Y - R, w: 2 * R, h: 2 * R,
      fill: { color: XP.blue }, line: { color: 'FFFFFF', width: 1 } });
    if (standout.has(p.name)) {
      const left = X > px + pw * 0.62;
      slide.addText(p.name, { x: left ? X - 2.62 : X + 0.14, y: Y - 0.12, w: 2.5, h: 0.24,
        fontFace: F_HEAD, fontSize: 9, bold: true, color: XP.ink, align: left ? 'right' : 'left' });
    }
  }
  slide.addText('This year’s score (standard scale) →', { x: px, y: py + ph + 0.26, w: pw, h: 0.24,
    fontFace: F_HEAD, fontSize: 9.5, color: XP.mute, align: 'center' });
  slide.addText('↑ Growth vs. expected', { x: px - 0.05, y: py - 0.32, w: 3, h: 0.24,
    fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  // right rail: standouts + takeaways
  const rx = 8.95, rw = 3.78;
  slide.addText([
    { text: 'STRONGEST GROWTH\n', options: { fontSize: 8.5, bold: true, color: XP.mute, charSpacing: 2 } },
    { text: `${d.best.name}\n`, options: { fontSize: 13, bold: true, color: XP.ink } },
    { text: `${d.best.text}\n\n`, options: { fontFace: F_MONO, fontSize: 12, color: XP.blue } },
    { text: 'SLOWEST GROWTH\n', options: { fontSize: 8.5, bold: true, color: XP.mute, charSpacing: 2 } },
    { text: `${d.worst.name}\n`, options: { fontSize: 13, bold: true, color: XP.ink } },
    { text: d.worst.text, options: { fontFace: F_MONO, fontSize: 12, color: XP.neg } },
  ], { x: rx, y: 1.75, w: rw, h: 2.1, fontFace: F_BODY, valign: 'top', lineSpacingMultiple: 1.05 });
  takeawayBand(slide, d.takeaways, { x: rx, y: 4.0, w: rw, h: 2.85, fontSize: 10 });
  slide.addNotes('Each dot is a school: right = higher scores this year, up = faster growth than expected. The dashed crosshair is the district average on both measures.');
}

function layoutGroups(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Growth by student group');
  const x0 = 4.05, plotW = 7.0, span = d.domain.max - d.domain.min || 1;
  const xOf = (v) => x0 + ((v - d.domain.min) / span) * plotW;
  // Compress all vertical spacing by one factor so the rows always fit above
  // the takeaway band, however many comparisons the district carries.
  const nSections = d.sections.length;
  const nGroups = d.sections.reduce((t, s) => t + s.groups.length, 0);
  const bandY = PAGE_H - 1.75;
  const avail = bandY - 1.7 - 0.4;   // rows region → above the axis label
  const need = nSections * 0.3 + nGroups * 0.42 + nSections * 0.1;
  const k = Math.min(1, avail / Math.max(0.1, need));
  const secH = 0.3 * k, rowStep = 0.42 * k, trail = 0.1 * k;
  const barH = Math.min(0.2, rowStep * 0.55), diaH = Math.min(0.26, rowStep * 0.68);
  let y = 1.7;
  const zeroX = xOf(0);
  const yTop = y;
  for (const sec of d.sections) {
    slide.addText(sec.title.toUpperCase(), { x: 0.6, y, w: 3, h: 0.26, fontFace: F_HEAD, fontSize: 9, bold: true, color: XP.gold, charSpacing: 2 });
    y += secH;
    for (const g of sec.groups) {
      // label sits right against the plot so the eye doesn't travel
      slide.addText([
        { text: g.label, options: { fontSize: 11, color: XP.ink, bold: true } },
        { text: `   n=${g.n.toLocaleString()}`, options: { fontSize: 8.5, color: XP.mute } },
      ], { x: 0.6, y: y + 0.01, w: 3.3, h: 0.28, fontFace: F_BODY, align: 'right' });
      const color = g.median >= 0 ? XP.blue : XP.neg;
      slide.addShape('rect', { x: xOf(g.q1), y: y + (rowStep - barH) / 2, w: Math.max(0.05, xOf(g.q3) - xOf(g.q1)), h: barH,
        fill: { color, transparency: 82 }, line: { color, width: 1 } });
      slide.addShape('diamond', { x: xOf(g.median) - 0.07, y: y + (rowStep - diaH) / 2, w: 0.14, h: diaH,
        fill: { color: 'FFFFFF' }, line: { color, width: 1.25 } });
      slide.addText(g.text, { x: 11.55, y: y, w: 1.18, h: 0.28, fontFace: F_MONO, fontSize: 10.5, color: XP.ink2, align: 'right' });
      y += rowStep;
    }
    y += trail;
  }
  slide.addShape('line', { x: zeroX, y: yTop - 0.05, w: 0, h: y - yTop + 0.05, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
  slide.addText('↑ typical year of growth', { x: zeroX - 0.9, y: y + 0.04, w: 1.8, h: 0.24, fontFace: F_HEAD, fontSize: 9, color: XP.ink2, align: 'center' });
  slide.addText('box = the middle half of that group’s students · diamond = the typical student',
    { x: 7.6, y: y + 0.04, w: 5.1, h: 0.24, fontFace: F_HEAD, fontSize: 9, color: XP.mute, align: 'right' });
  takeawayBand(slide, d.takeaways, { y: bandY, h: 1.15 });
  slide.addNotes('Same vocabulary as the app’s box plots: where the middle of each group sits, and how much groups overlap.');
}

function layoutGapsOverview(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Gaps between student groups');
  const mk = (t, o = {}) => ({ text: t, options: { fontSize: 11, fontFace: F_BODY, color: XP.ink2, align: 'left', ...o } });
  const head = ['Comparison', 'District-wide gap', 'Likely range', 'Schools leaning that way', 'Schools with enough students']
    .map((t) => mk(t, { bold: true, fontSize: 9.5, color: XP.mute, fill: { color: XP.paper } }));
  const body = d.rows.map((r) => [
    mk(r.label, { bold: true, color: XP.ink }),
    // the gap number carries the figure vocabulary: rust behind, blue ahead
    mk(r.gapText, { fontFace: F_MONO, bold: r.reliable,
      color: !r.reliable ? XP.mute : (r.gapText.startsWith('−') || r.gapText.startsWith('-') ? XP.neg : XP.blue) }),
    mk(r.rangeText, { fontFace: F_MONO, color: XP.mute, fontSize: 10 }),
    mk(r.leaning), mk(r.coverage),
  ]);
  slide.addTable([head, ...body], { x: 0.6, y: 1.7, w: 12.13, rowH: 0.48,
    colW: [3.4, 2.2, 2.73, 2.2, 1.6],
    border: { type: 'solid', color: XP.rule2, pt: 0.75 }, valign: 'middle' });
  const tableBottom = 1.7 + 0.48 * (d.rows.length + 1);
  if (d.skippedNote) slide.addText(d.skippedNote,
    { x: 0.6, y: tableBottom + 0.12, w: 12.1, h: 0.35, fontFace: F_BODY, italic: true, fontSize: 10.5, color: XP.mute });
  takeawayBand(slide, d.takeaways, { y: PAGE_H - 1.95, h: 1.3 });
  slide.addNotes('Negative = the first-named group grew less. A range crossing zero means the difference could plausibly be nothing — those comparisons get no appendix slide.');
}

// Shape-drawn histograms — the app's design: a gray statewide silhouette
// with one visible gold tile per district school. (A stacked chart buries
// 7 schools invisibly inside 1,000-school bars.)
function layoutStateHist(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Statewide', `Where your schools land among all Missouri schools · ${d.year}`);
  const blocks = d.levels.flatMap((lv) => (['ela', 'math']).map((sub) => ({ lv, sub })))
    .filter((b) => b.lv.subjects[b.sub].poolN > 0).slice(0, 4);
  const cols = Math.min(2, blocks.length), rows = Math.ceil(blocks.length / cols);
  const w = cols === 1 ? 9 : 5.95, panelH = rows === 1 ? 4.6 : 2.6;
  blocks.forEach((b, i) => {
    const x = (cols === 1 ? 2.15 : 0.6 + (i % 2) * (w + 0.23));
    const y = 1.5 + Math.floor(i / cols) * (panelH + 0.15);
    const s = b.lv.subjects[b.sub];
    const plotY = y + 0.32, plotH = panelH - 1.0, baseline = plotY + plotH;
    slide.addText([
      { text: `${b.lv.heading} · ${subjWord(b.sub)}`, options: { fontSize: 11, bold: true, color: XP.ink } },
      { text: `   ${s.poolN.toLocaleString()} schools statewide`, options: { fontSize: 9, color: XP.mute } },
    ], { x, y, w, h: 0.28, fontFace: F_HEAD, align: 'left' });
    const x0 = s.bins[0].x0, x1 = s.bins[s.bins.length - 1].x1;
    const xOf = (v) => x + ((v - x0) / (x1 - x0 || 1)) * w;
    const maxC = Math.max(1, ...s.bins.map((c) => c.count));
    const barW = w / s.bins.length;
    for (const c of s.bins) {
      if (c.count === 0) continue;
      const h = (c.count / maxC) * plotH;
      slide.addShape('rect', { x: xOf(c.x0) + 0.008, y: baseline - h, w: Math.max(0.02, barW - 0.016), h,
        fill: { color: 'E8E9EC' }, line: { type: 'none' } });
    }
    // one gold tile per district school, stacked from the axis — visible at
    // any pool size; position carries the meaning
    const tileH = Math.min(0.16, plotH / 5);
    const stackCount = {};
    for (const sch of s.yours) {
      const bi = s.bins.findIndex((c) => sch.z >= c.x0 && sch.z < c.x1);
      const k = bi < 0 ? s.bins.length - 1 : bi;
      const lvl = stackCount[k] || 0;
      stackCount[k] = lvl + 1;
      slide.addShape('rect', { x: xOf(s.bins[k].x0) + 0.008, y: baseline - (lvl + 1) * (tileH + 0.015),
        w: Math.max(0.02, barW - 0.016), h: tileH,
        fill: { color: XP.gold }, line: { color: 'FFFFFF', width: 0.75 } });
    }
    // zero line + sparse axis labels
    slide.addShape('line', { x: xOf(0), y: plotY - 0.06, w: 0, h: plotH + 0.1, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
    slide.addShape('line', { x, y: baseline, w, h: 0, line: { color: XP.rule, width: 1 } });
    const step = niceStep(x1 - x0, 5);
    for (let t = Math.ceil(x0 / step) * step; t <= x1 + 1e-9; t += step) {
      slide.addText(Math.abs(t) < 1e-9 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(1),
        { x: xOf(t) - 0.3, y: baseline + 0.03, w: 0.6, h: 0.2, fontFace: F_MONO, fontSize: 8, color: XP.mute, align: 'center' });
    }
    slide.addText('↑ typical growth', { x: xOf(0) - 0.75, y: baseline + 0.22, w: 1.5, h: 0.2,
      fontFace: F_HEAD, fontSize: 8, color: XP.ink2, align: 'center' });
    const at = s.yours.filter((sch) => sch.z >= 0).length;
    slide.addText([
      { text: `${at} of ${s.yours.length}`, options: { bold: true, color: XP.ink } },
      { text: ` of your schools grew at least as fast as the typical Missouri school`, options: { color: XP.ink2 } },
    ], { x, y: baseline + 0.42, w, h: 0.24, fontFace: F_HEAD, fontSize: 9.5, align: 'left' });
  });
  // legend lives top-right, clear of the per-panel captions
  slide.addText('gold tiles = your schools · gray = every Missouri school of the same type',
    { x: 5.7, y: 1.02, w: 7.03, h: 0.24, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute, align: 'right' });
  const names = d.levels.flatMap((lv) => ['ela', 'math'].flatMap((sub) =>
    lv.subjects[sub].yours.map((s) => `${s.name} (${subjWord(sub)} ${s.z >= 0 ? '+' : '−'}${Math.abs(s.z).toFixed(2)})`)));
  slide.addNotes('Gold = this district’s schools, against every Missouri school of the same type. Zero is a typical year of growth. Yours: ' + names.join('; '));
}

// Shape-drawn trend — the native line chart bridges the cancelled 2020 year
// as if it had data; here consecutive years connect solid and the 2020 gap
// gets a dashed bridge, matching the app.
function layoutStateTrend(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Statewide', 'Growth over time');
  const y0 = Number(d.years[0]), y1 = Number(d.years[d.years.length - 1]);
  const allZ = ['ela', 'math'].flatMap((s) => (d.series[s] || []).map((p) => p.z));
  const ext = Math.max(0.05, ...allZ.map(Math.abs)) * 1.25;
  (['ela', 'math']).forEach((sub, i) => {
    const pts = d.series[sub];
    if (!pts || !pts.length) return;
    const px = 1.05 + i * 6.35, py = 2.0, pw = 5.45, ph = 3.9;
    const xOf = (yr) => px + (y1 === y0 ? pw / 2 : ((Number(yr) - y0) / (y1 - y0)) * pw);
    const yOf = (z) => py + ((ext - z) / (2 * ext)) * ph;
    slide.addText(subjWord(sub), { x: px - 0.1, y: 1.6, w: 3, h: 0.3, fontFace: F_HEAD, fontSize: 12.5, bold: true, color: XP.ink });
    // y gridlines at ±ext/2 and ±ext, labeled; zero dashed
    for (const t of [-ext, -ext / 2, ext / 2, ext]) {
      slide.addShape('line', { x: px, y: yOf(t), w: pw, h: 0, line: { color: XP.rule2, width: 0.75 } });
      slide.addText((t > 0 ? '+' : '−') + Math.abs(t).toFixed(2),
        { x: px - 0.62, y: yOf(t) - 0.1, w: 0.56, h: 0.2, fontFace: F_MONO, fontSize: 8, color: XP.mute, align: 'right' });
    }
    slide.addShape('line', { x: px, y: yOf(0), w: pw, h: 0, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
    slide.addText('0', { x: px - 0.62, y: yOf(0) - 0.1, w: 0.56, h: 0.2, fontFace: F_MONO, fontSize: 8, color: XP.ink2, align: 'right' });
    // segments: solid between consecutive years, dashed across the 2020 gap.
    // A pptx line is its bounding box top-left → bottom-right; flipV makes it
    // ascend, and height must never be negative.
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      const gap = Number(b.year) - Number(a.year) > 1;
      const ax = xOf(a.year), ay = yOf(a.z), bx = xOf(b.year), by = yOf(b.z);
      slide.addShape('line', { x: ax, y: Math.min(ay, by), w: bx - ax, h: Math.abs(by - ay),
        line: { color: XP.blue, width: 2.25, dashType: gap ? 'dash' : 'solid' },
        flipV: by < ay });
    }
    // points + first/last value labels
    pts.forEach((p, j) => {
      slide.addShape('ellipse', { x: xOf(p.year) - 0.055, y: yOf(p.z) - 0.055, w: 0.11, h: 0.11,
        fill: { color: XP.blue }, line: { color: 'FFFFFF', width: 1 } });
      if (j === 0 || j === pts.length - 1) {
        // clamp the label inside the plot so the last value never clips
        const lx = Math.max(px - 0.15, Math.min(xOf(p.year) - 0.4, px + pw - 0.65));
        slide.addText((p.z >= 0 ? '+' : '−') + Math.abs(p.z).toFixed(2),
          { x: lx, y: yOf(p.z) - 0.34, w: 0.8, h: 0.2, fontFace: F_MONO, fontSize: 8.5, bold: true, color: XP.blue, align: 'center' });
      }
    });
    // year labels — every year in range, the cancelled one ghosted
    for (let yr = y0; yr <= y1; yr++) {
      const has = pts.some((p) => Number(p.year) === yr);
      slide.addText(`’${String(yr).slice(2)}`, { x: xOf(yr) - 0.3, y: py + ph + 0.08, w: 0.6, h: 0.2,
        fontFace: F_MONO, fontSize: 8.5, color: has ? XP.mute : XP.rule, align: 'center' });
    }
  });
  slide.addText('0 = a typical year of growth statewide · the dashed stretch crosses 2020, the year state testing was cancelled',
    { x: 0.6, y: PAGE_H - 0.78, w: 12.1, h: 0.24, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  slide.addNotes('District average of statewide growth scores per year. The dashed stretch crosses the cancelled 2020 test year, not missing district data.');
}

function layoutCautions(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Read with care', 'How to read this deck — a few cautions');
  layoutBullets(slide, d.bullets, 0.8, 1.9, 11.6, { fontSize: 15 });
  slide.addNotes('Walk these four points briefly. The full methods note is linked from the app.');
}

function layoutDivider(pres, slide, deck, d) {
  slide.background = { color: XP.paper };
  slide.addText(d.title, { x: 0.9, y: 2.9, w: 11.5, h: 0.8, fontFace: F_SERIF, fontSize: 30, color: XP.ink });
  slide.addText(d.sub, { x: 0.9, y: 3.8, w: 11, h: 0.5, fontFace: F_HEAD, fontSize: 13, color: XP.mute });
  slide.addShape('rect', { x: 0.95, y: 2.75, w: 0.8, h: 0.04, fill: { color: XP.gold }, line: { type: 'none' } });
}

function layoutForest(pres, slide, deck, d) {
  chrome(slide, deck, d, `${subjWord(d.subject)} · appendix`, d.title);
  const rows = d.rows.slice(0, 11);   // one slide's worth; tall districts trade detail for legibility
  // Data-driven axis (the engine's symmetric axis wastes half the plot when
  // every gap leans one way); zero always stays in frame.
  const ciVals = rows.flatMap((r) => r.ci);
  const rawLo = Math.min(0, d.district.gap, ...ciVals), rawHi = Math.max(0, d.district.gap, ...ciVals);
  const padA = Math.max(0.03, (rawHi - rawLo) * 0.08);
  const lo = rawLo - padA, hi = rawHi + padA;
  const x0 = 4.35, plotW = 7.1;
  const xOf = (v) => x0 + ((v - lo) / (hi - lo || 1)) * plotW;
  const rowH = Math.min(0.58, 4.1 / Math.max(1, rows.length));
  const top = 1.7, bottom = top + rows.length * rowH;
  // striped rows behind everything
  rows.forEach((r, i) => {
    if (i % 2 === 1) slide.addShape('rect', { x: 0.6, y: top + i * rowH, w: 12.13, h: rowH,
      fill: { color: XP.paper }, line: { type: 'none' } });
  });
  // reference lines: solid = no gap, dashed gold = the district-wide gap
  slide.addShape('line', { x: xOf(0), y: top - 0.08, w: 0, h: bottom - top + 0.16, line: { color: XP.ink2, width: 1 } });
  slide.addShape('line', { x: xOf(d.district.gap), y: top - 0.08, w: 0, h: bottom - top + 0.16, line: { color: XP.gold, width: 1.5, dashType: 'dash' } });
  rows.forEach((r, i) => {
    const yMid = top + i * rowH + rowH / 2;
    const color = r.gap >= 0 ? XP.blue : XP.neg;
    slide.addText([
      { text: r.name, options: { fontSize: 10.5, color: XP.ink } },
      { text: `  n=${(r.nA + r.nB).toLocaleString()}`, options: { fontSize: 8.5, color: XP.mute } },
    ], { x: 0.66, y: yMid - 0.14, w: 3.55, h: 0.28, fontFace: F_BODY, align: 'left' });
    slide.addShape('line', { x: xOf(r.ci[0]), y: yMid, w: xOf(r.ci[1]) - xOf(r.ci[0]), h: 0, line: { color, width: 2.25 } });
    slide.addShape('line', { x: xOf(r.ci[0]), y: yMid - 0.05, w: 0, h: 0.1, line: { color, width: 1.5 } });
    slide.addShape('line', { x: xOf(r.ci[1]), y: yMid - 0.05, w: 0, h: 0.1, line: { color, width: 1.5 } });
    slide.addShape('diamond', { x: xOf(r.gap) - 0.06, y: yMid - 0.1, w: 0.12, h: 0.2, fill: { color }, line: { color: 'FFFFFF', width: 0.75 } });
    slide.addText(r.text, { x: 11.6, y: yMid - 0.14, w: 1.13, h: 0.28, fontFace: F_MONO, fontSize: 10, bold: true, color, align: 'right' });
  });
  // axis ticks + reference labels below the plot
  const step = niceStep(hi - lo, 5);
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
    slide.addText(Math.abs(t) < 1e-9 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2),
      { x: xOf(t) - 0.35, y: bottom + 0.12, w: 0.7, h: 0.2, fontFace: F_MONO, fontSize: 8.5, color: XP.mute, align: 'center' });
  }
  slide.addText('no gap', { x: xOf(0) - 0.5, y: top - 0.34, w: 1.0, h: 0.22, fontFace: F_HEAD, fontSize: 8.5, color: XP.ink2, align: 'center' });
  slide.addText(`district ${d.district.text}`, { x: xOf(d.district.gap) - 0.9, y: bottom + 0.34, w: 1.8, h: 0.22,
    fontFace: F_HEAD, fontSize: 8.5, bold: true, color: XP.gold, align: 'center' });
  let footY = bottom + 0.62;
  slide.addText(`Bar = the range each school’s true gap most likely falls in · negative = ${d.groupA} students grew less than their ${d.groupB} schoolmates`,
    { x: 0.6, y: footY, w: 12.1, h: 0.26, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  if (d.excluded.length) {
    footY += 0.28;
    slide.addText('Not drawn: ' + d.excluded.map((e) => `${e.name} (${e.reason})`).join(' · '),
      { x: 0.6, y: footY, w: 12.1, h: 0.45, fontFace: F_HEAD, fontSize: 9, italic: true, color: XP.mute });
  }
  if (d.rows.length > rows.length) slide.addText(`+ ${d.rows.length - rows.length} more schools — see the app for the full list`,
    { x: 0.6, y: footY + 0.3, w: 12.1, h: 0.26, fontFace: F_HEAD, fontSize: 9, italic: true, color: XP.mute });
  slide.addNotes(`${d.groupA} minus ${d.groupB}: negative bars mean ${d.groupA} students grew less than their ${d.groupB} schoolmates at that school.`);
}

const PPTX_LAYOUTS = {
  cover: layoutCover, intro: layoutIntro, glance: layoutGlance, heat: layoutHeat,
  scatter: layoutScatter, groups: layoutGroups, gapsOverview: layoutGapsOverview,
  stateHist: layoutStateHist, stateTrend: layoutStateTrend,
  cautions: layoutCautions, divider: layoutDivider, forest: layoutForest,
};

async function buildPPTX(deck) {
  if (typeof window.PptxGenJS !== 'function') throw new Error('PptxGenJS failed to load');
  const pres = new window.PptxGenJS();
  pres.defineLayout({ name: 'GL_WIDE', width: PAGE_W, height: PAGE_H });
  pres.layout = 'GL_WIDE';
  pres.author = 'GrowthLens · PRiME Center, Saint Louis University';
  pres.title = `GrowthLens growth report · ${deck.meta.district}`;
  for (const d of deck.slides) {
    const slide = pres.addSlide();
    (PPTX_LAYOUTS[d.kind] || (() => {}))(pres, slide, deck, d);
  }
  const dist = deck.meta.sample ? 'sample' : deck.meta.district.replace(/[^\w]+/g, '-');
  await pres.writeFile({ fileName: `GrowthLens-${dist}-${new Date().toISOString().slice(0, 10)}.pptx` });
}

// ---- Page shell ------------------------------------------------------------
function ExportPage({ ctx }) {
  const [busy, setBusy] = React.useState(false);
  const [primeRows, setPrimeRows] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    if (window.loadPrimeDb) window.loadPrimeDb().then(
      (rows) => { if (alive) setPrimeRows(rows); }, () => {});
    return () => { alive = false; };
  }, []);

  const bySubject = window.GLStore ? window.GLStore.allSubjectsData() : {};
  const unit = ctx.unit || 'z';
  const unitLabel = unit === 'weeks' ? 'weeks of learning' : 'SD (standard scale)';
  const fmt = { val: (z, opts) => window.fmtVal(z, unit, opts) };
  // District for the statewide section: an upload's code, else the sample default.
  const metas = Object.values(bySubject).map((b) => b.meta).filter(Boolean);
  const anyUploaded = metas.some((m) => m.source === 'uploaded');
  const lea = metas.map((m) => m.districtCode).find(Boolean) || (!anyUploaded ? '016090' : null);
  const prime = primeRows && lea ? { rows: primeRows, lea } : null;
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  const deck = window.GLDeck.buildDeck({ bySubject, prime, unitLabel, mode: ctx.estimate || 'shrunk', fmt, today });

  const exportPPTX = async () => {
    if (busy) return;
    setBusy(true);
    try { await buildPPTX(deck); }
    catch (err) {
      console.error('PPTX export failed:', err);
      alert('Something went wrong while building the deck. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <BriefHeader eyebrow="Export" slice={`${deck.meta.subjects.join(' + ')} · ${deck.meta.year}`}
        title="Download a board-ready deck"
        blurb={'The full picture in one editable PowerPoint: every school and grade, scores against growth, every student group, the gaps between them, and where your schools land statewide — with a school-by-school appendix for the comparisons that show a clear signal. Flip through the preview below; what you see is what downloads.'} />
      <section style={{ background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
        borderTop: `3px solid ${SLU.gold}`, boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
        padding: 24, fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
              {deck.slides.length} slides · {deck.meta.district} · {deck.meta.year}
            </div>
            <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
              Built right here in your browser — nothing is uploaded. Values in {deck.meta.unitLabel}; common system fonts, so it opens the same anywhere.
            </div>
          </div>
          <button onClick={exportPPTX} disabled={busy} style={{
            padding: '10px 18px', borderRadius: 6,
            background: busy ? SLU.mute : SLU.blue, color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, padding: '1px 5px',
                            border: '1px solid rgba(255,255,255,0.45)', borderRadius: 3,
                            letterSpacing: 0.5 }}>PPTX</span>
            {busy ? 'Generating…' : 'Export PPTX →'}
          </button>
        </div>
        <SlideCarousel deck={deck} />
      </section>
    </>
  );
}

// ---- Carousel --------------------------------------------------------------
function SlideCarousel({ deck }) {
  const [idx, setIdx] = React.useState(0);
  const clamp = (i) => Math.max(0, Math.min(deck.slides.length - 1, i));
  const go = (delta) => setIdx((i) => clamp(i + delta));
  React.useEffect(() => { setIdx((i) => clamp(i)); }, [deck.slides.length]);
  const d = deck.slides[idx];
  return (
    <div onKeyDown={(e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    }} tabIndex={0} className="gl-focus" role="group"
       aria-label={`Deck preview, slide ${idx + 1} of ${deck.slides.length}`}
       style={{ outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <CarouselArrow dir={-1} onClick={() => go(-1)} disabled={idx === 0} />
        <div style={{ flex: 1, aspectRatio: '16 / 9', background: '#FDFCFA', borderRadius: 8,
                      border: `1px solid ${SLU.rule2}`, overflow: 'hidden', position: 'relative',
                      boxShadow: '0 2px 10px rgba(15,23,42,0.08)' }}>
          <PreviewSlide d={d} deck={deck} />
        </div>
        <CarouselArrow dir={1} onClick={() => go(1)} disabled={idx === deck.slides.length - 1} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: SLU.mute, fontFamily: MONO }}>
        Slide {idx + 1} of {deck.slides.length} · {previewTitle(d)}
      </div>
    </div>
  );
}

function CarouselArrow({ dir, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
            aria-label={dir < 0 ? 'Previous slide' : 'Next slide'}
            style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${SLU.rule}`,
                     background: '#fff', color: disabled ? SLU.rule : SLU.ink2, fontSize: 16,
                     cursor: disabled ? 'default' : 'pointer', flex: '0 0 auto' }}>
      {dir < 0 ? '←' : '→'}
    </button>
  );
}

// ---- Preview renderers -----------------------------------------------------
function previewTitle(d) {
  return ({ cover: 'Cover', intro: 'How to read this deck', glance: 'Your district at a glance',
    heat: `Growth by school & grade · ${subjWord(d.subject || '')}`,
    scatter: `Scores vs. growth · ${subjWord(d.subject || '')}`,
    groups: `Growth by student group · ${subjWord(d.subject || '')}`,
    gapsOverview: `Gaps between student groups · ${subjWord(d.subject || '')}`,
    stateHist: 'Statewide comparison', stateTrend: 'Statewide growth over time',
    cautions: 'Cautions', divider: 'Appendix', forest: d.title || 'School-by-school detail' })[d.kind] || '';
}

function PvChrome({ d, deck, eyebrow, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '4.5% 5%', fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: LABEL, fontSize: 8.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: SLU.mute }}>{eyebrow}</div>
      <div style={{ fontFamily: SERIF, fontSize: 15, color: SLU.ink, margin: '2px 0 4px' }}>{previewTitle(d)}</div>
      <div style={{ width: 26, height: 2, background: SLU.gold, marginBottom: 8 }} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      <div style={{ fontSize: 7.5, color: SLU.mute, letterSpacing: 1 }}>
        {deck.meta.sample ? 'SAMPLE DATA · ' : ''}{deck.meta.district} · {deck.meta.year} · {d.n}/{deck.slides.length}
      </div>
    </div>
  );
}

// Render **bold** markers the same way KeyTakeaways does.
function pvMd(text) {
  return text.split('**').map((seg, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: SLU.ink, fontWeight: 600 }}>{seg}</strong>
      : <React.Fragment key={i}>{seg}</React.Fragment>);
}

// Mini "What stands out" strip — mirrors the PPTX takeawayBand.
function PvTakeaways({ takeaways, max = 2 }) {
  if (!takeaways || !takeaways.length) return null;
  return (
    <div style={{ marginTop: 6, padding: '4px 7px', background: '#FDFCFA',
                  border: `1px solid ${SLU.rule2}`, borderLeft: `2px solid ${SLU.gold}` }}>
      <div style={{ fontFamily: LABEL, fontSize: 6, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SLU.mute }}>
        What stands out
      </div>
      {takeaways.slice(0, max).map((t, i) => (
        <div key={i} style={{ fontSize: 7.5, lineHeight: 1.35, color: SLU.ink2, marginTop: 2 }}>{pvMd(t.text)}</div>
      ))}
    </div>
  );
}

function PvBullets({ bullets, size = 10 }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8,
                 fontFamily: SERIF, fontSize: size, lineHeight: 1.45, color: SLU.ink2 }}>
      {bullets.map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
          <span aria-hidden="true" style={{ color: SLU.gold, fontSize: size - 2 }}>▪</span>
          <span>{typeof b === 'string' ? b : b.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PvCover({ d, deck }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#002A75', color: '#fff',
                  padding: '7% 6.5%', display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, lineHeight: 1 }}>GrowthLens</div>
      <div style={{ height: 2, width: 34, background: SLU.goldLight, margin: '9px 0 14px' }} />
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{d.district}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: SLU.goldLight }}>
        Growth report · {d.year} · {d.subjects.join(' + ')}
      </div>
      {d.sample && (
        <div style={{ marginTop: 12, fontSize: 10.5, fontWeight: 700, color: '#FFD27D', letterSpacing: 0.3 }}>
          SAMPLE DATA — for demonstration only
        </div>
      )}
      <div style={{ marginTop: 'auto', fontSize: 8.5, color: '#B9C4DE', letterSpacing: 1 }}>
        PRiME Center · Saint Louis University · {d.today}
      </div>
    </div>
  );
}

function PvGlance({ d, deck }) {
  return (
    <PvChrome d={d} deck={deck} eyebrow="Summary">
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {d.tiles.map((t, i) => (
          <div key={i} style={{ flex: 1, border: `1px solid ${SLU.rule2}`, borderRadius: 4,
                                background: '#FDFCFA', padding: '5px 6px', minWidth: 0 }}>
            <div style={{ fontFamily: LABEL, fontSize: 6.5, fontWeight: 700, letterSpacing: 0.8,
                          textTransform: 'uppercase', color: SLU.mute, lineHeight: 1.15 }}>{t.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: SLU.ink, marginTop: 3 }}>{t.value}</div>
            <div style={{ fontSize: 6.5, color: SLU.mute, marginTop: 2 }}>{t.sub}</div>
          </div>
        ))}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5,
                   fontSize: 9, lineHeight: 1.4, color: SLU.ink2 }}>
        {d.takeaways.map((t, i) => (
          <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline',
                               color: t.caveat ? SLU.mute : SLU.ink2, fontStyle: t.caveat ? 'italic' : 'normal' }}>
            <span aria-hidden="true" style={{ color: t.caveat ? SLU.mute : SLU.gold, fontSize: 7 }}>▪</span>
            <span>{pvMd(t.text)}</span>
          </li>
        ))}
      </ul>
    </PvChrome>
  );
}

function PvHeat({ d, deck }) {
  const td = { padding: '1px 2px', textAlign: 'center', fontFamily: MONO, fontSize: 7, lineHeight: 1.2 };
  return (
    <PvChrome d={d} deck={deck} eyebrow={subjWord(d.subject)}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ fontFamily: LABEL, fontSize: 6.5, color: SLU.mute, textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left', padding: '1px 3px', width: '26%' }}>School</th>
            {d.grades.map((g) => <th key={g} style={{ padding: '1px 2px' }}>Gr {g}</th>)}
            <th style={{ padding: '1px 2px' }}>Ovr</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.slice(0, 11).map((r, ri) => (
            <tr key={ri}>
              <td style={{ textAlign: 'left', padding: '1px 3px', fontSize: 7, color: SLU.ink,
                           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
              {r.cells.map((c, ci) => {
                if (!c) return <td key={ci} style={td} />;
                if (!c.ok) return <td key={ci} style={{ ...td, background: '#F4F4F6', color: SLU.mute, fontSize: 6 }}>·</td>;
                return <td key={ci} style={{ ...td, background: window.divColor(c.z), color: window.heatCellInk(c.z) }}>{c.text}</td>;
              })}
              {r.overall
                ? <td style={{ ...td, fontWeight: 700, background: window.divColor(r.overall.z), color: window.heatCellInk(r.overall.z) }}>{r.overall.text}</td>
                : <td style={{ ...td, color: SLU.mute }}>—</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <PvTakeaways takeaways={d.takeaways} />
    </PvChrome>
  );
}

function PvScatter({ d, deck }) {
  const W = 360, H = 200, pad = 18;
  const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
  const xLo = Math.min(...xs, d.xMean), xHi = Math.max(...xs, d.xMean);
  const yLo = Math.min(...ys, d.yMean), yHi = Math.max(...ys, d.yMean);
  const sx = (v) => pad + ((v - xLo) / (xHi - xLo || 1)) * (W - 2 * pad);
  const sy = (v) => (H - pad) - ((v - yLo) / (yHi - yLo || 1)) * (H - 2 * pad);
  return (
    <PvChrome d={d} deck={deck} eyebrow={subjWord(d.subject)}>
      <div style={{ display: 'flex', gap: 8, height: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ flex: 1, minWidth: 0, height: '100%' }}>
          <line x1={sx(d.xMean)} y1={pad} x2={sx(d.xMean)} y2={H - pad} stroke={SLU.rule} strokeDasharray="3 3" />
          <line x1={pad} y1={sy(d.yMean)} x2={W - pad} y2={sy(d.yMean)} stroke={SLU.rule} strokeDasharray="3 3" />
          {d.points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill={SLU.blue} fillOpacity={0.7} />
          ))}
        </svg>
        <div style={{ flex: '0 0 30%', fontSize: 8, lineHeight: 1.25 }}>
          <div style={{ fontFamily: LABEL, fontSize: 6.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: SLU.mute }}>Strongest</div>
          <div style={{ fontWeight: 700, color: SLU.ink }}>{d.best.name}</div>
          <div style={{ fontFamily: MONO, color: SLU.blue, marginBottom: 6 }}>{d.best.text}</div>
          <div style={{ fontFamily: LABEL, fontSize: 6.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: SLU.mute }}>Slowest</div>
          <div style={{ fontWeight: 700, color: SLU.ink }}>{d.worst.name}</div>
          <div style={{ fontFamily: MONO, color: SLU.neg }}>{d.worst.text}</div>
          <PvTakeaways takeaways={d.takeaways} max={1} />
        </div>
      </div>
    </PvChrome>
  );
}

function PvGroups({ d, deck }) {
  const span = d.domain.max - d.domain.min || 1;
  const pct = (v) => `${((v - d.domain.min) / span) * 100}%`;
  return (
    <PvChrome d={d} deck={deck} eyebrow={subjWord(d.subject)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {d.sections.map((sec, si) => (
          <div key={si}>
            <div style={{ fontFamily: LABEL, fontSize: 6.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: SLU.mute, marginBottom: 1 }}>{sec.title}</div>
            {sec.groups.map((g, gi) => {
              const color = g.median >= 0 ? SLU.blue : SLU.neg;
              return (
                <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 7.5, marginBottom: 2 }}>
                  <span style={{ flex: '0 0 28%', color: SLU.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
                  <span style={{ position: 'relative', flex: 1, height: 9, background: '#F4F4F6', borderRadius: 2 }}>
                    <span style={{ position: 'absolute', left: pct(0), top: -1, bottom: -1, width: 1, background: SLU.ink2 }} />
                    <span style={{ position: 'absolute', left: pct(g.q1), width: `${((g.q3 - g.q1) / span) * 100}%`,
                                   top: 1, bottom: 1, background: color, opacity: 0.25, borderRadius: 2 }} />
                    <span style={{ position: 'absolute', left: pct(g.median), transform: 'translateX(-50%)', top: -2, color, fontSize: 8 }}>◆</span>
                  </span>
                  <span style={{ flex: '0 0 14%', textAlign: 'right', fontFamily: MONO, color: SLU.ink2 }}>{g.text}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <PvTakeaways takeaways={d.takeaways} />
    </PvChrome>
  );
}

function PvGapsOverview({ d, deck }) {
  const cell = { padding: '2px 4px', fontSize: 8, textAlign: 'left', verticalAlign: 'top' };
  return (
    <PvChrome d={d} deck={deck} eyebrow={subjWord(d.subject)}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ fontFamily: LABEL, fontSize: 6.5, color: SLU.mute, textTransform: 'uppercase' }}>
            <th style={{ ...cell, width: '28%' }}>Comparison</th>
            <th style={cell}>Gap</th>
            <th style={cell}>Likely range</th>
            <th style={cell}>Leaning</th>
            <th style={cell}>Enough</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${SLU.rule2}` }}>
              <td style={{ ...cell, fontWeight: 700, color: SLU.ink }}>{r.label}</td>
              <td style={{ ...cell, fontFamily: MONO, color: r.reliable ? SLU.ink : SLU.mute }}>{r.gapText}</td>
              <td style={{ ...cell, fontFamily: MONO, color: SLU.mute, fontSize: 7 }}>{r.rangeText}</td>
              <td style={{ ...cell, color: SLU.ink2 }}>{r.leaning}</td>
              <td style={{ ...cell, color: SLU.ink2 }}>{r.coverage}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.skippedNote && (
        <div style={{ marginTop: 6, fontSize: 7.5, fontStyle: 'italic', color: SLU.mute }}>{d.skippedNote}</div>
      )}
      <PvTakeaways takeaways={d.takeaways} />
    </PvChrome>
  );
}

function PvStateHist({ d, deck }) {
  const blocks = d.levels.flatMap((lv) => ['ela', 'math'].map((sub) => ({ lv, sub })))
    .filter((b) => b.lv.subjects[b.sub].poolN > 0).slice(0, 4);
  return (
    <PvChrome d={d} deck={deck} eyebrow="Statewide">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {blocks.map((b, i) => {
          const s = b.lv.subjects[b.sub];
          const maxC = Math.max(1, ...s.bins.map((c) => c.count));
          return (
            <div key={i}>
              <div style={{ fontSize: 7, fontWeight: 700, color: SLU.ink2, marginBottom: 2 }}>
                {b.lv.heading} · {subjWord(b.sub)}
              </div>
              {/* fixed-size gold tiles per district school (a %-height segment
                  would be invisible against a 1,000-school pool) */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 40 }}>
                {s.bins.map((c, bi) => {
                  const yours = s.yours.filter((sch) => sch.z >= c.x0 && sch.z < c.x1).length;
                  return (
                    <div key={bi} style={{ flex: 1, height: '100%', position: 'relative',
                                           display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <div style={{ height: `${(c.count / maxC) * 100}%`, minHeight: c.count > 0 ? 1 : 0,
                                    background: '#E4E5E9' }} />
                      {Array.from({ length: yours }, (_, k) => (
                        <div key={k} style={{ position: 'absolute', bottom: k * 5, left: 0, right: 0,
                                              height: 4, background: SLU.gold, border: '0.5px solid #fff' }} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </PvChrome>
  );
}

function PvStateTrend({ d, deck }) {
  const W = 360, H = 150, pad = 20;
  const all = ['ela', 'math'].flatMap((s) => (d.series[s] || []).map((p) => p.z));
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const sx = (yi) => pad + (d.years.length <= 1 ? 0 : (yi / (d.years.length - 1)) * (W - 2 * pad));
  const sy = (v) => (H - pad) - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const colors = { ela: SLU.blue, math: SLU.gold };
  return (
    <PvChrome d={d} deck={deck} eyebrow="Statewide">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
        <line x1={pad} y1={sy(0)} x2={W - pad} y2={sy(0)} stroke={SLU.rule} strokeDasharray="3 3" />
        {['ela', 'math'].map((sub) => {
          const pts = d.series[sub] || [];
          if (!pts.length) return null;
          const coords = d.years.map((yr, yi) => {
            const p = pts.find((q) => q.year === yr);
            return p ? `${sx(yi)},${sy(p.z)}` : null;
          }).filter(Boolean).join(' ');
          return <polyline key={sub} points={coords} fill="none" stroke={colors[sub]} strokeWidth={2} />;
        })}
      </svg>
    </PvChrome>
  );
}

function PvDivider({ d, deck }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FDFCFA', padding: '0 7%',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: 34, height: 2, background: SLU.gold, marginBottom: 10 }} />
      <div style={{ fontFamily: SERIF, fontSize: 22, color: SLU.ink }}>{d.title}</div>
      <div style={{ marginTop: 6, fontSize: 11, color: SLU.mute }}>{d.sub}</div>
    </div>
  );
}

function PvForest({ d, deck }) {
  const span = d.axis.max - d.axis.min || 1;
  const pct = (v) => `${((v - d.axis.min) / span) * 100}%`;
  const rows = d.rows.slice(0, 11);
  return (
    <PvChrome d={d} deck={deck} eyebrow={`${subjWord(d.subject)} · appendix`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r, i) => {
          const color = r.gap >= 0 ? SLU.blue : SLU.neg;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 7.5 }}>
              <span style={{ flex: '0 0 30%', color: SLU.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ position: 'relative', flex: 1, height: 10 }}>
                <span style={{ position: 'absolute', left: pct(0), top: 0, bottom: 0, width: 1, background: SLU.ink2 }} />
                <span style={{ position: 'absolute', left: pct(d.district.gap), top: 0, bottom: 0, width: 1, background: SLU.gold }} />
                <span style={{ position: 'absolute', left: pct(r.ci[0]), width: `${((r.ci[1] - r.ci[0]) / span) * 100}%`,
                               top: 4, height: 2, background: color }} />
                <span style={{ position: 'absolute', left: pct(r.gap), transform: 'translateX(-50%)', top: -1, color, fontSize: 8 }}>◆</span>
              </span>
              <span style={{ flex: '0 0 14%', textAlign: 'right', fontFamily: MONO, color: SLU.ink2 }}>{r.text}</span>
            </div>
          );
        })}
      </div>
      {d.excluded.length > 0 && (
        <div style={{ marginTop: 5, fontSize: 7, fontStyle: 'italic', color: SLU.mute }}>
          Not drawn: {d.excluded.map((e) => `${e.name} (${e.reason})`).join(' · ')}
        </div>
      )}
    </PvChrome>
  );
}

function PreviewSlide({ d, deck }) {
  switch (d.kind) {
    case 'cover': return <PvCover d={d} deck={deck} />;
    case 'intro': return <PvChrome d={d} deck={deck} eyebrow="Before the numbers"><PvBullets bullets={d.bullets} size={10.5} /></PvChrome>;
    case 'cautions': return <PvChrome d={d} deck={deck} eyebrow="Read with care"><PvBullets bullets={d.bullets} size={10} /></PvChrome>;
    case 'glance': return <PvGlance d={d} deck={deck} />;
    case 'heat': return <PvHeat d={d} deck={deck} />;
    case 'scatter': return <PvScatter d={d} deck={deck} />;
    case 'groups': return <PvGroups d={d} deck={deck} />;
    case 'gapsOverview': return <PvGapsOverview d={d} deck={deck} />;
    case 'stateHist': return <PvStateHist d={d} deck={deck} />;
    case 'stateTrend': return <PvStateTrend d={d} deck={deck} />;
    case 'divider': return <PvDivider d={d} deck={deck} />;
    case 'forest': return <PvForest d={d} deck={deck} />;
    default: return null;
  }
}

window.ExportPage = ExportPage;
