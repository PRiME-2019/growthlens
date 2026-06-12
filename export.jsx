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

// Standard slide chrome: eyebrow + title + gold rule + footer.
function chrome(slide, deck, d, eyebrow, title) {
  slide.addText(eyebrow.toUpperCase(), { x: 0.6, y: 0.32, w: 9, h: 0.3, fontFace: F_HEAD, fontSize: 11, color: XP.mute, bold: true, charSpacing: 3 });
  slide.addText(title, { x: 0.6, y: 0.62, w: 12.1, h: 0.55, fontFace: F_SERIF, fontSize: 24, color: XP.ink });
  slide.addShape('rect', { x: 0.6, y: 1.28, w: 0.55, h: 0.035, fill: { color: XP.gold }, line: { type: 'none' } });
  const tag = deck.meta.sample ? 'SAMPLE DATA · ' : '';
  slide.addText(`${tag}${deck.meta.district} · ${deck.meta.year} · GrowthLens · ${d.n}/${deck.slides.length}`,
    { x: 0.6, y: PAGE_H - 0.42, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 9, color: XP.mute, charSpacing: 2 });
}
const subjWord = (s) => (s === 'ela' ? 'ELA' : 'Math');

// ---- PPTX layouts (one per slide kind) -------------------------------------
function layoutCover(pres, slide, deck, d) {
  slide.background = { color: XP.blueDark };
  slide.addText('GrowthLens', { x: 0.9, y: 1.5, w: 8, h: 0.8, fontFace: F_SERIF, fontSize: 40, color: 'FFFFFF' });
  slide.addShape('rect', { x: 0.95, y: 2.45, w: 1.0, h: 0.04, fill: { color: XP.goldLight }, line: { type: 'none' } });
  slide.addText(d.district, { x: 0.9, y: 2.8, w: 11.5, h: 1.0, fontFace: F_HEAD, fontSize: 32, bold: true, color: 'FFFFFF' });
  slide.addText(`Growth report · ${d.year} · ${d.subjects.join(' + ')}`,
    { x: 0.9, y: 3.8, w: 11, h: 0.5, fontFace: F_HEAD, fontSize: 16, color: XP.goldLight });
  if (d.sample) slide.addText('SAMPLE DATA — for demonstration only',
    { x: 0.9, y: 4.5, w: 8, h: 0.4, fontFace: F_HEAD, fontSize: 13, bold: true, color: 'FFD27D' });
  slide.addText(`PRiME Center · Saint Louis University · ${d.today}`,
    { x: 0.9, y: PAGE_H - 0.7, w: 11, h: 0.35, fontFace: F_HEAD, fontSize: 10, color: 'B9C4DE', charSpacing: 2 });
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
  const tileW = Math.min(3.9, 12.1 / Math.max(1, d.tiles.length) - 0.2);
  d.tiles.forEach((t, i) => {
    const x = 0.6 + i * (tileW + 0.25);
    slide.addShape('rect', { x, y: 1.7, w: tileW, h: 1.5, fill: { color: XP.paper }, line: { color: XP.rule2, width: 1 } });
    slide.addText(t.label.toUpperCase(), { x: x + 0.15, y: 1.8, w: tileW - 0.3, h: 0.5, fontFace: F_HEAD, fontSize: 9, bold: true, color: XP.mute, charSpacing: 1.5 });
    slide.addText(t.value, { x: x + 0.15, y: 2.25, w: tileW - 0.3, h: 0.6, fontFace: F_MONO, fontSize: 26, bold: true, color: XP.ink });
    slide.addText(t.sub, { x: x + 0.15, y: 2.85, w: tileW - 0.3, h: 0.3, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  });
  const rows = d.takeaways.flatMap((t) => mdRuns(t.text, { fontSize: 13.5, color: XP.ink2 })
    .map((r, i, arr) => ({ ...r, options: { ...r.options, bullet: i === 0 ? { code: '25AA', indent: 14 } : undefined, breakLine: i === arr.length - 1, paraSpaceAfter: 8 } })));
  slide.addText(rows, { x: 0.8, y: 3.6, w: 11.7, h: 3.3, fontFace: F_BODY, valign: 'top', lineSpacingMultiple: 1.15 });
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
  const rowH = Math.min(0.42, 4.9 / (body.length + 1));
  slide.addTable([head, ...body], { x: 0.6, y: 1.7, w: 12.1, rowH,
    colW: [3.4, ...d.grades.map(() => (12.1 - 3.4 - 1.3) / d.grades.length), 1.3],
    border: { type: 'solid', color: 'FFFFFF', pt: 1 }, valign: 'middle', fontFace: F_BODY });
  slide.addText('Blue = growing faster than expected · rust = slower · numbers steadied toward the district average',
    { x: 0.6, y: PAGE_H - 0.85, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  slide.addNotes('Scan rows for schools that are consistently strong or soft, and columns for grades where the whole district leans one way.');
}

function layoutScatter(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Scores vs. growth, school by school');
  slide.addChart(pres.ChartType.scatter, [
    { name: 'Score', values: d.points.map((p) => p.x) },
    { name: 'Schools', values: d.points.map((p) => p.y) },
  ], {
    x: 0.6, y: 1.6, w: 8.2, h: 5.1,
    lineSize: 0, showLegend: false,
    chartColors: [XP.blue],
    catAxisTitle: 'This year’s score (standard scale)', showCatAxisTitle: true, catAxisTitleFontSize: 10,
    valAxisTitle: 'Growth vs. expected', showValAxisTitle: true, valAxisTitleFontSize: 10,
    lineDataSymbolSize: 9,
  });
  slide.addText([
    { text: 'Strongest growth\n', options: { fontSize: 10, bold: true, color: XP.mute, charSpacing: 1.5 } },
    { text: `${d.best.name}\n`, options: { fontSize: 13, bold: true, color: XP.ink } },
    { text: `${d.best.text}\n\n`, options: { fontFace: F_MONO, fontSize: 12, color: XP.blue } },
    { text: 'Slowest growth\n', options: { fontSize: 10, bold: true, color: XP.mute, charSpacing: 1.5 } },
    { text: `${d.worst.name}\n`, options: { fontSize: 13, bold: true, color: XP.ink } },
    { text: d.worst.text, options: { fontFace: F_MONO, fontSize: 12, color: XP.neg } },
  ], { x: 9.1, y: 1.9, w: 3.5, h: 3.5, fontFace: F_BODY, valign: 'top' });
  slide.addNotes('Each dot is a school: right = higher scores this year, up = faster growth than expected. The two named schools anchor the range.');
}

function layoutGroups(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Growth by student group');
  const x0 = 4.0, plotW = 7.6, span = d.domain.max - d.domain.min || 1;
  const xOf = (v) => x0 + ((v - d.domain.min) / span) * plotW;
  let y = 1.8;
  const zeroX = xOf(0);
  for (const sec of d.sections) {
    slide.addText(sec.title.toUpperCase(), { x: 0.6, y, w: 3, h: 0.3, fontFace: F_HEAD, fontSize: 10, bold: true, color: XP.mute, charSpacing: 2 });
    y += 0.34;
    for (const g of sec.groups) {
      slide.addText(`${g.label}  ·  n=${g.n.toLocaleString()}`, { x: 0.6, y: y + 0.02, w: 3.2, h: 0.3, fontFace: F_BODY, fontSize: 11, color: XP.ink });
      const color = g.median >= 0 ? XP.blue : XP.neg;
      slide.addShape('rect', { x: xOf(g.q1), y: y + 0.05, w: Math.max(0.05, xOf(g.q3) - xOf(g.q1)), h: 0.22,
        fill: { color, transparency: 82 }, line: { color, width: 1 } });
      slide.addShape('diamond', { x: xOf(g.median) - 0.07, y: y + 0.02, w: 0.14, h: 0.28,
        fill: { color: 'FFFFFF' }, line: { color, width: 1.25 } });
      slide.addText(g.text, { x: 12.0, y: y - 0.02, w: 0.95, h: 0.3, fontFace: F_MONO, fontSize: 10.5, color: XP.ink2, align: 'right' });
      y += 0.42;
    }
    y += 0.12;
  }
  slide.addShape('line', { x: zeroX, y: 1.75, w: 0, h: y - 1.8, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
  slide.addText('typical year of growth', { x: zeroX - 0.9, y: y + 0.05, w: 1.8, h: 0.25, fontFace: F_HEAD, fontSize: 9, color: XP.ink2, align: 'center' });
  slide.addText('Box = the middle half of that group’s students · diamond = the typical student',
    { x: 0.6, y: PAGE_H - 0.85, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  slide.addNotes('Same vocabulary as the app’s box plots: where the middle of each group sits, and how much groups overlap.');
}

function layoutGapsOverview(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Gaps between student groups');
  const mk = (t, o = {}) => ({ text: t, options: { fontSize: 11, fontFace: F_BODY, color: XP.ink2, align: 'left', ...o } });
  const head = ['Comparison', 'District-wide gap', 'Likely range', 'Schools leaning that way', 'Schools with enough students']
    .map((t) => mk(t, { bold: true, fontSize: 9.5, color: XP.mute }));
  const body = d.rows.map((r) => [
    mk(r.label, { bold: true, color: XP.ink }),
    mk(r.gapText, { fontFace: F_MONO, color: r.reliable ? XP.ink : XP.mute }),
    mk(r.rangeText, { fontFace: F_MONO, color: XP.mute, fontSize: 10 }),
    mk(r.leaning), mk(r.coverage),
  ]);
  slide.addTable([head, ...body], { x: 0.6, y: 1.8, w: 12.1, rowH: 0.5,
    colW: [3.4, 2.2, 2.7, 2.2, 1.6],
    border: { type: 'solid', color: XP.rule2, pt: 0.75 }, valign: 'middle' });
  if (d.skippedNote) slide.addText(d.skippedNote,
    { x: 0.6, y: 1.85 + 0.5 * (d.rows.length + 1) + 0.15, w: 12.1, h: 0.6, fontFace: F_BODY, italic: true, fontSize: 11, color: XP.mute });
  slide.addNotes('Negative = the first-named group grew less. A range crossing zero means the difference could plausibly be nothing — those comparisons get no appendix slide.');
}

function layoutStateHist(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Statewide', `Where your schools land among all Missouri schools · ${d.year}`);
  const blocks = d.levels.flatMap((lv) => (['ela', 'math']).map((sub) => ({ lv, sub })))
    .filter((b) => b.lv.subjects[b.sub].poolN > 0);
  const w = Math.min(5.9, 12.1 / Math.min(2, blocks.length) - 0.2);
  blocks.slice(0, 4).forEach((b, i) => {
    const x = 0.6 + (i % 2) * (w + 0.35), y = 1.55 + Math.floor(i / 2) * 2.7;
    const s = b.lv.subjects[b.sub];
    slide.addText(`${b.lv.heading} · ${subjWord(b.sub)} · ${s.poolN.toLocaleString()} statewide`,
      { x, y, w, h: 0.28, fontFace: F_HEAD, fontSize: 10.5, bold: true, color: XP.ink2 });
    slide.addChart(pres.ChartType.bar, [
      { name: 'Missouri schools', labels: s.bins.map((c) => c.x0.toFixed(2)), values: s.bins.map((c) => c.count - c.district) },
      { name: 'Your schools', labels: s.bins.map((c) => c.x0.toFixed(2)), values: s.bins.map((c) => c.district) },
    ], { x, y: y + 0.3, w, h: 2.1, barDir: 'col', barGrouping: 'stacked',
         chartColors: ['E4E5E9', XP.gold], showLegend: false, catAxisHidden: false,
         catAxisLabelFontSize: 7, valAxisHidden: true, barGapWidthPct: 8 });
  });
  const names = d.levels.flatMap((lv) => ['ela', 'math'].flatMap((sub) =>
    lv.subjects[sub].yours.map((s) => `${s.name} (${subjWord(sub)} ${s.z >= 0 ? '+' : '−'}${Math.abs(s.z).toFixed(2)})`)));
  slide.addNotes('Gold = this district’s schools, against every Missouri school of the same type. Zero is a typical year of growth. Yours: ' + names.join('; '));
}

function layoutStateTrend(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Statewide', 'Growth over time');
  const years = d.years;
  (['ela', 'math']).forEach((sub, i) => {
    const pts = d.series[sub];
    if (!pts || !pts.length) return;
    const vals = years.map((y) => { const p = pts.find((q) => q.year === y); return p ? p.z : null; });
    slide.addText(subjWord(sub), { x: 0.6 + i * 6.2, y: 1.6, w: 3, h: 0.3, fontFace: F_HEAD, fontSize: 12, bold: true, color: XP.ink });
    slide.addChart(pres.ChartType.line, [{ name: 'District average', labels: years, values: vals }],
      { x: 0.6 + i * 6.2, y: 1.95, w: 5.9, h: 4.4, chartColors: [XP.blue], lineSize: 2.5,
        lineDataSymbol: 'circle', lineDataSymbolSize: 7, showLegend: false,
        valAxisLabelFontSize: 9, catAxisLabelFontSize: 9 });
  });
  slide.addText('0 = a typical year of growth statewide · the 2020 gap is the year state testing was cancelled',
    { x: 0.6, y: PAGE_H - 0.85, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  slide.addNotes('District average of statewide growth scores per year. The missing 2020 point is the cancelled test year, not missing district data.');
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
  const x0 = 4.4, plotW = 7.2, span = d.axis.max - d.axis.min || 1;
  const xOf = (v) => x0 + ((v - d.axis.min) / span) * plotW;
  const rows = d.rows.slice(0, 11);   // one slide's worth; tall districts trade detail for legibility
  const rowH = Math.min(0.42, 4.4 / Math.max(1, rows.length));
  // zero + district reference lines
  slide.addShape('line', { x: xOf(0), y: 1.6, w: 0, h: rows.length * rowH + 0.3, line: { color: XP.ink2, width: 1 } });
  slide.addShape('line', { x: xOf(d.district.gap), y: 1.6, w: 0, h: rows.length * rowH + 0.3, line: { color: XP.gold, width: 1.25, dashType: 'dash' } });
  rows.forEach((r, i) => {
    const y = 1.75 + i * rowH;
    const color = r.gap >= 0 ? XP.blue : XP.neg;
    slide.addText(r.name, { x: 0.6, y: y - 0.05, w: 3.6, h: 0.3, fontFace: F_BODY, fontSize: 10.5, color: XP.ink, align: 'left' });
    slide.addShape('line', { x: xOf(r.ci[0]), y: y + 0.09, w: xOf(r.ci[1]) - xOf(r.ci[0]), h: 0, line: { color, width: 2 } });
    slide.addShape('diamond', { x: xOf(r.gap) - 0.055, y: y + 0.01, w: 0.11, h: 0.18, fill: { color }, line: { color: 'FFFFFF', width: 0.75 } });
    slide.addText(r.text, { x: 11.8, y: y - 0.05, w: 1.1, h: 0.3, fontFace: F_MONO, fontSize: 9.5, color: XP.ink2, align: 'right' });
  });
  let footY = 1.75 + rows.length * rowH + 0.25;
  slide.addText(`District-wide: ${d.district.text} (gold dashed line) · bar = the range each school’s true gap most likely falls in`,
    { x: 0.6, y: footY, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  if (d.excluded.length) {
    footY += 0.3;
    slide.addText('Not drawn: ' + d.excluded.map((e) => `${e.name} (${e.reason})`).join(' · '),
      { x: 0.6, y: footY, w: 12.1, h: 0.5, fontFace: F_HEAD, fontSize: 9.5, italic: true, color: XP.mute });
  }
  if (d.rows.length > rows.length) slide.addText(`+ ${d.rows.length - rows.length} more schools — see the app for the full list`,
    { x: 0.6, y: footY + 0.3, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 9.5, italic: true, color: XP.mute });
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
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 40 }}>
                {s.bins.map((c, bi) => (
                  <div key={bi} style={{ flex: 1, height: `${(c.count / maxC) * 100}%`, minHeight: c.count > 0 ? 1 : 0,
                                         background: '#E4E5E9', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    {c.district > 0 && (
                      <div style={{ height: `${(c.district / c.count) * 100}%`, background: SLU.gold }} />
                    )}
                  </div>
                ))}
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
