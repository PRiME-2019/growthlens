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

// Data graphics travel as single images (deck-figures.js SVG → 3× PNG): they
// can be resized or deleted whole, but not nudged shape-by-shape — an
// exported figure keeps telling the story it was exported with. Words,
// takeaways, and tables stay native editable PowerPoint.
function svgToPng(svg, w, h, scale = 3) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('figure rasterization failed')); };
    img.src = url;
  });
}

// Fit a figure into a slide box, preserving aspect.
function fitFig(f, maxW, maxH) {
  let w = maxW, h = maxW * f.h / f.w;
  if (h > maxH) { h = maxH; w = maxH * f.w / f.h; }
  return { w, h };
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

// The figure travels as one image (deck-figures.js → PNG); the rail stays
// editable text.
function layoutScatter(pres, slide, deck, d, figs) {
  chrome(slide, deck, d, subjWord(d.subject), 'Scores vs. growth, school by school');
  const f = figs[d.n];
  const { w, h } = fitFig(f, 8.1, 5.05);
  slide.addImage({ data: f.png, x: 0.6, y: 1.6, w, h,
    altText: `Scatter of schools: this year's scores against growth vs. expected, quadrants split at the district averages. Strongest growth ${d.best.name} ${d.best.text}; slowest ${d.worst.name} ${d.worst.text}.` });
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

function layoutGroups(pres, slide, deck, d, figs) {
  chrome(slide, deck, d, subjWord(d.subject), 'Growth by student group');
  const f = figs[d.n];
  const bandY = PAGE_H - 1.75;
  const { w, h } = fitFig(f, 12.13, bandY - 1.55 - 0.12);
  slide.addImage({ data: f.png, x: 0.6 + (12.13 - w) / 2, y: 1.55, w, h,
    altText: 'Box strips of growth for every student group on one scale; the diamond marks the typical student, the dashed line a typical year of growth.' });
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

function layoutStateHist(pres, slide, deck, d, figs) {
  chrome(slide, deck, d, 'Statewide', `Where your schools land among all Missouri schools · ${d.year}`);
  const f = figs[d.n];
  const { w, h } = fitFig(f, 12.13, 5.2);
  slide.addImage({ data: f.png, x: 0.6 + (12.13 - w) / 2, y: 1.55, w, h,
    altText: 'Statewide growth histograms per school type and subject; gold tiles mark this district’s schools, the dashed line a typical year of growth.' });
  slide.addText('gold tiles = your schools · gray = every Missouri school of the same type',
    { x: 5.7, y: 1.02, w: 7.03, h: 0.24, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute, align: 'right' });
  if (d.weeksNote) slide.addText(d.weeksNote,
    { x: 0.6, y: PAGE_H - 0.78, w: 12.1, h: 0.24, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  const names = d.levels.flatMap((lv) => ['ela', 'math'].flatMap((sub) =>
    lv.subjects[sub].yours.map((s) => `${s.name} (${subjWord(sub)} ${s.text})`)));
  slide.addNotes('Gold = this district’s schools, against every Missouri school of the same type. Zero is a typical year of growth. Yours: ' + names.join('; '));
}

function layoutStateTrend(pres, slide, deck, d, figs) {
  chrome(slide, deck, d, 'Statewide', 'Growth over time');
  const f = figs[d.n];
  const { w, h } = fitFig(f, 12.13, 4.85);
  slide.addImage({ data: f.png, x: 0.6 + (12.13 - w) / 2, y: 1.6, w, h,
    altText: 'District-average statewide growth score per year, by subject; the dashed stretch bridges the cancelled 2020 test year.' });
  if (d.weeksNote) slide.addText(d.weeksNote,
    { x: 0.6, y: PAGE_H - 1.02, w: 12.1, h: 0.24, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  slide.addText('0 = a typical year of growth statewide · schools weighted equally · the dashed stretch crosses 2020, the year state testing was cancelled',
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

function layoutForest(pres, slide, deck, d, figs) {
  chrome(slide, deck, d, `${subjWord(d.subject)} · appendix`, d.title);
  const f = figs[d.n];
  const { w, h } = fitFig(f, 12.13, 4.7);
  slide.addImage({ data: f.png, x: 0.6, y: 1.5, w, h,
    altText: `${d.groupA} vs. ${d.groupB} gap at each school with its likely range; district-wide ${d.district.text}.` });
  let footY = 1.5 + h + 0.18;
  slide.addText(`Bar = the range each school’s true gap most likely falls in · negative = ${d.groupA} students grew less than their ${d.groupB} schoolmates`,
    { x: 0.6, y: footY, w: 12.1, h: 0.26, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  if (d.excluded.length) {
    footY += 0.28;
    slide.addText('Not drawn: ' + d.excluded.map((e) => `${e.name} (${e.reason})`).join(' · '),
      { x: 0.6, y: footY, w: 12.1, h: 0.45, fontFace: F_HEAD, fontSize: 9, italic: true, color: XP.mute });
  }
  // the figure draws at most 11 schools (legibility); say so when sliced
  if (d.rows.length > 11) slide.addText(`+ ${d.rows.length - 11} more schools — see the app for the full list`,
    { x: 0.6, y: footY + 0.3, w: 12.1, h: 0.26, fontFace: F_HEAD, fontSize: 9, italic: true, color: XP.mute });
  slide.addNotes(`${d.groupA} minus ${d.groupB}: negative bars mean ${d.groupA} students grew less than their ${d.groupB} schoolmates at that school.`);
}

const PPTX_LAYOUTS = {
  cover: layoutCover, intro: layoutIntro, glance: layoutGlance, heat: layoutHeat,
  scatter: layoutScatter, groups: layoutGroups, gapsOverview: layoutGapsOverview,
  stateHist: layoutStateHist, stateTrend: layoutStateTrend,
  cautions: layoutCautions, divider: layoutDivider, forest: layoutForest,
};

// PptxGenJS (466 KB) is fetched only when a deck is actually exported — the
// script tag is injected on first use and the promise cached for the session.
let PPTXGEN_LOADER = null;
function loadPptxGen() {
  if (window.PptxGenJS) return Promise.resolve();
  if (!PPTXGEN_LOADER) {
    PPTXGEN_LOADER = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
      s.integrity = 'sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ';
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => reject(new Error('PptxGenJS failed to load'));
      document.head.appendChild(s);
    });
    PPTXGEN_LOADER.catch(() => { PPTXGEN_LOADER = null; });   // a failed fetch retries next click
  }
  return PPTXGEN_LOADER;
}

async function buildPPTX(deck) {
  if (window.GLTelemetry) window.GLTelemetry.log('export', {
    subjects: ['math', 'ela'].filter((s) => window.GLStore && window.GLStore.available(s)),
  });
  await loadPptxGen();
  if (typeof window.PptxGenJS !== 'function') throw new Error('PptxGenJS failed to load');
  // Rasterize every data graphic once (SVG → 3× PNG ≈ 300 DPI) before any
  // slide is built — figures land as single un-decomposable images.
  const figs = {};
  for (const d of deck.slides) {
    const builder = window.GLDeckFigs && window.GLDeckFigs[d.kind];
    if (builder) {
      const f = builder(d);
      figs[d.n] = { png: await svgToPng(f.svg, f.w, f.h, 3), w: f.w, h: f.h };
    }
  }
  const pres = new window.PptxGenJS();
  pres.defineLayout({ name: 'GL_WIDE', width: PAGE_W, height: PAGE_H });
  pres.layout = 'GL_WIDE';
  pres.author = 'GrowthLens · PRiME Center, Saint Louis University';
  pres.title = `GrowthLens growth report · ${deck.meta.district}`;
  for (const d of deck.slides) {
    const slide = pres.addSlide();
    (PPTX_LAYOUTS[d.kind] || (() => {}))(pres, slide, deck, d, figs);
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

  const deck = window.GLDeck.buildDeck({
    bySubject, prime, unit, unitLabel, mode: ctx.estimate || 'shrunk', fmt, today,
    // The statewide figures need the numeric factor (axis relabeling), not
    // just formatted strings — same conversion as everywhere else.
    wps: (subject, year) => window.weeksPerSD({ subject, year }),
    factorYear: (subject, year) => window.wolFactorYear({ subject, year }),
  });

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

// The carousel shows the exact SVG the PPTX rasterizes — the preview IS the
// downloaded figure, not an approximation.
function PvFig({ d }) {
  const f = window.GLDeckFigs[d.kind](d);
  return <img alt="" src={'data:image/svg+xml;utf8,' + encodeURIComponent(f.svg)}
              style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '100%', objectFit: 'contain' }} />;
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
  return (
    <PvChrome d={d} deck={deck} eyebrow={subjWord(d.subject)}>
      <div style={{ display: 'flex', gap: 8, height: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}><PvFig d={d} /></div>
        <div style={{ flex: '0 0 28%', fontSize: 8, lineHeight: 1.25 }}>
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
  return (
    <PvChrome d={d} deck={deck} eyebrow={subjWord(d.subject)}>
      <PvFig d={d} />
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
  return (
    <PvChrome d={d} deck={deck} eyebrow="Statewide">
      <PvFig d={d} />
      {d.weeksNote && (
        <div style={{ marginTop: 5, fontSize: 7, fontStyle: 'italic', color: SLU.mute }}>{d.weeksNote}</div>
      )}
    </PvChrome>
  );
}

function PvStateTrend({ d, deck }) {
  return (
    <PvChrome d={d} deck={deck} eyebrow="Statewide">
      <PvFig d={d} />
      {d.weeksNote && (
        <div style={{ marginTop: 5, fontSize: 7, fontStyle: 'italic', color: SLU.mute }}>{d.weeksNote}</div>
      )}
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
  return (
    <PvChrome d={d} deck={deck} eyebrow={`${subjWord(d.subject)} · appendix`}>
      <PvFig d={d} />
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
