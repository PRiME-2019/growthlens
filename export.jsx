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

// Export page — builds a PPTX deck of key GrowthLens results from window data.
// Uses PptxGenJS (loaded from CDN in index.html) to generate native
// PowerPoint shapes/text — fully editable downstream.
//
// The page itself shows preview cards approximating each slide so a user can
// see what they'll get before generating.

function ExportPage({ ctx }) {
  const data = window.GAPS_DATA;
  const heat = window.HEATMAP_DATA;
  // Hooks must run unconditionally — keep them all above the no-data return.
  const schools = data ? data.schools : [];

  // Slice + summary stats reused on multiple slides.
  const summary = React.useMemo(() => {
    const eligible = schools.filter(s => s.meets_min_cell !== false);
    // Gaps are focal − reference: negative = the focal group (A) trails.
    // Ascending puts the widest deficits first.
    const sorted = [...eligible].sort((a, b) => a.shrunk_gap - b.shrunk_gap);
    // Slide 03: actual deficits only, worst first (up to 5). Slide 04: schools
    // at or above parity, best first (up to 3). Disjoint by construction —
    // a least-bad deficit is never relabeled as a bright spot.
    const widest   = sorted.filter(s => s.shrunk_gap < 0).slice(0, 5);
    const atParity = sorted.filter(s => s.shrunk_gap >= 0).reverse().slice(0, 3);
    const meetingThreshold = eligible.length;
    return { sorted, widest, atParity, meetingThreshold };
  }, [schools]);
  const [busy, setBusy] = React.useState(false);

  if (!data) return null;
  const { meta } = data;

  const subjectLabel = (meta.subject || 'ela').toUpperCase();
  // The page header shows only the school year (no subject or group comparison);
  // the deck carries the full slice via sliceText, stamped with the active
  // dataset's year rather than a hardcoded one.
  const ds = window.GLStore && window.GLStore.getActiveMeta();
  const yearLabel = (ds && (ds.latestYear || ds.year)) || '2024–25';
  // Stamp sample-data decks so a demo deck can't pass for district results.
  const isDemo = !ds || ds.source !== 'uploaded';
  const sliceText = `${subjectLabel} · ${meta.groupA} − ${meta.groupB} · ${yearLabel}${isDemo ? ' · sample data' : ''}`;
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  const slides = [
    {
      n: '01', kind: 'cover',
      title: 'GrowthLens · District Report',
      sub: sliceText,
      meta: `PRiME Center · Saint Louis University · ${today}`,
    },
    {
      n: '02', kind: 'headline',
      title: 'The headline numbers',
      bullets: [
        ['District gap',     fmt2(meta.districtGap) + ' SD'],
        ['How much schools differ', Math.sqrt(Math.max(0, meta.tauSquared)).toFixed(2) + ' SD'],
        ['Schools with enough students', `${summary.meetingThreshold} / ${schools.length}`],
      ],
    },
    {
      n: '03', kind: 'widest-gaps',
      title: 'Schools with the widest gaps',
      rows: summary.widest,
      empty: `No school shows a measurable ${meta.groupA} − ${meta.groupB} deficit.`,
    },
    {
      n: '04', kind: 'parity',
      title: `Where ${meta.groupA} students are keeping pace`,
      rows: summary.atParity,
      empty: `No school reached parity this year — every measured gap leans toward ${meta.groupB}.`,
    },
    {
      n: '05', kind: 'hotspots',
      title: 'Standout schools and grades',
      hot: scanHotspots(heat),
    },
    {
      n: '06', kind: 'methods',
      title: 'How to read this deck — a few cautions',
    },
  ];

  const exportPPTX = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await buildPPTX({ slides, meta, schools, summary, heat, today, sliceText });
    } catch (err) {
      // Without this, a failed build only logged an unhandled rejection while
      // the button quietly returned to its idle label.
      console.error('PPTX export failed:', err);
      alert('Something went wrong while building the deck. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BriefHeader eyebrow="Export" slice={String(yearLabel)}
        title="Download a board-ready deck"
        blurb={'Six slides covering the headline numbers, the schools at each end of the gap, the standout school-and-grade spots, and a short methods recap. It’s real, editable PowerPoint — text, tables, and shapes, not flattened screenshots.'} />

      <section style={{
        background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
        borderTop: `3px solid ${SLU.gold}`,
        boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
        padding: 24, fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                       gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
              {slides.length} slides · {sliceText}
            </div>
            <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
              Built right here in your browser — nothing is uploaded. The deck shows shrunken estimates on the standard (SD) scale.
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {slides.map(s => <SlideCard key={s.n} slide={s} meta={meta} sliceText={sliceText} today={today} schools={schools} summary={summary} />)}
        </div>
      </section>
    </>
  );
}

function fmt2(x) { return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2); }

// Identify 3 hottest negative and 3 hottest positive school×grade cells from
// the heatmap dataset (or null if heat data isn't loaded yet). Uses the
// shrunken cell values (rs) when present, matching the on-screen heatmap.
function scanHotspots(heat) {
  if (!heat) return null;
  const cells = [];
  for (const s of heat.schools) {
    for (const g of [3, 4, 5, 6, 7, 8]) {
      const c = s.grades?.[g];
      if (c && c.ok) cells.push({ school: window.schoolLabel(s), grade: g, r: c.rs != null ? c.rs : c.r, n: c.n });
    }
  }
  cells.sort((a, b) => a.r - b.r);
  return {
    cold: cells.slice(0, 3),
    hot:  cells.slice(-3).reverse(),
  };
}

// ---- Slide preview cards ---------------------------------------------------
function SlideCard({ slide, meta, sliceText, today, schools, summary }) {
  return (
    <div style={{
      background: '#FDFCFA', borderRadius: 6, border: `1px solid ${SLU.rule2}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ aspectRatio: '16 / 9', position: 'relative',
                     background: slide.kind === 'cover' ? SLU.blueDark : '#fff',
                     borderBottom: `1px solid ${SLU.rule2}` }}>
        <SlideBody slide={slide} meta={meta} sliceText={sliceText} today={today} schools={schools} summary={summary} />
        <div style={{
          position: 'absolute', top: 6, left: 8,
          fontFamily: LABEL, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: slide.kind === 'cover' ? 'rgba(255,255,255,0.55)' : SLU.mute,
        }}>{slide.n}</div>
      </div>
      <div style={{ padding: '8px 12px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: SLU.ink }}>{slide.title}</div>
      </div>
    </div>
  );
}

function SlideBody({ slide, meta, sliceText, today, summary }) {
  if (slide.kind === 'cover') {
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '10% 8%', color: '#fff',
                     display: 'flex', flexDirection: 'column', justifyContent: 'center',
                     fontFamily: FONT }}>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 22, letterSpacing: -0.4, lineHeight: 1 }}>GrowthLens</div>
        <div style={{ height: 1, width: 24, background: SLU.goldLight, margin: '6px 0 10px' }} />
        <div style={{ fontFamily: LABEL, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.4, opacity: 0.75 }}>District Report</div>
        <div style={{ marginTop: 14, fontFamily: SERIF, fontWeight: 500, fontSize: 11, color: SLU.goldLight }}>{sliceText}</div>
        <div style={{ marginTop: 'auto', fontSize: 7, opacity: 0.55, fontFamily: LABEL, textTransform: 'uppercase', letterSpacing: 1.2 }}>PRiME · SLU · {today}</div>
      </div>
    );
  }
  if (slide.kind === 'headline') {
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '8% 6% 6%', fontFamily: FONT,
                     display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: SLU.ink }}>{slide.title}</div>
        <div style={{ height: 1, background: SLU.rule2 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {slide.bullets.map(([k, v], i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ fontSize: 6.5, fontFamily: LABEL, textTransform: 'uppercase', letterSpacing: 1, color: SLU.mute }}>{k}</div>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: SLU.ink, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === 'widest-gaps' || slide.kind === 'parity') {
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '8% 6% 6%', fontFamily: FONT }}>
        <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: SLU.ink }}>{slide.title}</div>
        <div style={{ height: 1, background: SLU.rule2, marginTop: 4 }} />
        {slide.rows.length === 0 ? (
          <div style={{ marginTop: 12, fontFamily: SERIF, fontSize: 9, fontStyle: 'italic', color: SLU.mute }}>
            {slide.empty}
          </div>
        ) : (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {slide.rows.map((s, i) => (
              <div key={s.school_id} style={{ display: 'flex', alignItems: 'baseline', gap: 6,
                                                fontFamily: MONO, fontSize: 8 }}>
                <span style={{ width: s.school_name ? 90 : 36, color: SLU.ink2,
                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{schoolLabel(s)}</span>
                <span style={{ flex: 1, color: s.shrunk_gap >= 0 ? SLU.blue : SLU.neg, fontWeight: 600 }}>
                  {fmt2(s.shrunk_gap)}
                </span>
                <span style={{ color: SLU.mute }}>n={s.n_a + s.n_b}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (slide.kind === 'hotspots') {
    const h = slide.hot;
    if (!h) return <Empty />;
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '8% 6% 6%', fontFamily: FONT }}>
        <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: SLU.ink }}>{slide.title}</div>
        <div style={{ height: 1, background: SLU.rule2, marginTop: 4 }} />
        <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
          {['hot', 'cold'].map(k => (
            <div key={k} style={{ flex: 1 }}>
              <div style={{ fontSize: 6.5, fontFamily: LABEL, textTransform: 'uppercase', letterSpacing: 1, color: SLU.mute }}>
                {k === 'hot' ? 'Above district' : 'Below district'}
              </div>
              {h[k].map((c, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 8, color: SLU.ink2, marginTop: 2 }}>
                  {c.school} · G{c.grade} <span style={{ color: c.r >= 0 ? SLU.blue : SLU.neg, fontWeight: 600 }}>{fmt2(c.r)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === 'methods') {
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '8% 6% 6%', fontFamily: FONT }}>
        <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: SLU.ink }}>{slide.title}</div>
        <div style={{ height: 1, background: SLU.rule2, marginTop: 4 }} />
        <ul style={{ margin: 6, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3,
                      fontFamily: SERIF, fontSize: 8, color: SLU.ink2, lineHeight: 1.4 }}>
          <li>— Numbers nudged toward the district average (shrinkage), so a few students can’t swing a school</li>
          <li>— Groups with too few students to read reliably are flagged</li>
          <li>— Describes what’s happening, not why — use it to ask sharper questions</li>
        </ul>
      </div>
    );
  }
  return null;
}

function Empty() {
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: SLU.mute, fontSize: 10 }}>—</div>;
}

// ---- PPTX generation -------------------------------------------------------
async function buildPPTX({ slides, meta, schools, summary, heat, today, sliceText }) {
  if (typeof window.PptxGenJS !== 'function') {
    alert('PptxGenJS not loaded.');
    return;
  }
  const pres = new window.PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5"
  pres.author = 'GrowthLens';
  pres.title  = 'GrowthLens District Report';

  // RUST = negative gaps (matches the figures); GOLD stays reserved for
  // district-reference marks.
  const BLUE = '003DA5', INK = '1A1B1F', MUTE = '6F727A', GOLD = '9A7611',
        GOLD_LIGHT = 'C8A84A', RUST = '7C3A12', RULE = 'EDEDEF', BG = 'FAFAFB';
  const FONT_FACE = 'Mulish';
  const SERIF_FACE = 'Crimson Pro';
  const MONO_FACE = 'JetBrains Mono';

  // ---- 01 cover
  const s1 = pres.addSlide();
  s1.background = { color: '002A75' };
  s1.addText('GrowthLens', { x: 0.7, y: 2.0, w: 8, h: 1.2, fontFace: SERIF_FACE, fontSize: 60, bold: true, color: 'FFFFFF' });
  s1.addShape('rect', { x: 0.72, y: 3.25, w: 0.6, h: 0.05, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT } });
  s1.addText('District Report', { x: 0.7, y: 3.4, w: 8, h: 0.35, fontFace: FONT_FACE, fontSize: 12, color: 'FFFFFF', charSpacing: 4 });
  s1.addText(sliceText, { x: 0.7, y: 3.9, w: 12, h: 0.5, fontFace: SERIF_FACE, fontSize: 22, italic: true, color: GOLD_LIGHT });
  s1.addText(`PRiME Center · Saint Louis University · ${today}`, {
    x: 0.7, y: 6.7, w: 12, h: 0.3, fontFace: FONT_FACE, fontSize: 10, color: 'FFFFFF', transparency: 50, charSpacing: 4,
  });

  // ---- 02 headline
  const s2 = pres.addSlide();
  s2.addNotes(`The headline numbers. The district gap is a district-wide average that gives steadier schools more weight, shown with the range the real number most likely falls in (its 95% interval). The second number says how much schools really differ from one another. The last number tells the audience how many schools had enough students to include.`);
  addHeader(s2, '02 · The headline numbers', `The district gap, how much schools differ from one another, and how many schools had enough students to include.`);
  const tau = Math.sqrt(Math.max(0, meta.tauSquared)).toFixed(2);
  const re = (window.districtMeanRE && window.districtMeanRE(schools, meta.tauSquared)) || null;
  const muStr = re ? (re.mu >= 0 ? '+' : '−') + Math.abs(re.mu).toFixed(2) : fmt2(meta.districtGap);
  const ciStr = re ? `[${(re.ciLo>=0?'+':'−')}${Math.abs(re.ciLo).toFixed(2)}, ${(re.ciHi>=0?'+':'−')}${Math.abs(re.ciHi).toFixed(2)}]` : '';
  const stats = [
    { k: 'District gap',          v: muStr + ' SD',                            note: ciStr ? `Likely range ${ciStr}` : `${meta.groupA} − ${meta.groupB}` },
    { k: 'How much schools differ',      v: tau + ' SD',                               note: `On a standard scale — bigger means schools vary more` },
    { k: 'Schools with enough students', v: `${summary.meetingThreshold} / ${schools.length}`, note: 'at least the minimum number of students' },
  ];
  stats.forEach((s, i) => {
    const x = 0.7 + i * 4.2, y = 2.4;
    s2.addText(s.k, { x, y, w: 4, h: 0.3, fontFace: FONT_FACE, fontSize: 10, color: MUTE, bold: true, charSpacing: 3 });
    s2.addText(s.v, { x, y: y + 0.4, w: 4, h: 1.0, fontFace: MONO_FACE, fontSize: 48, bold: true, color: INK });
    s2.addText(s.note, { x, y: y + 1.6, w: 4, h: 0.4, fontFace: FONT_FACE, fontSize: 11, color: MUTE, italic: true });
  });
  // distribution strip with auto-range so dots don't pile at the edges;
  // zero-side schools carry null estimates and have no dot to draw
  const dots = schools.filter(s => Number.isFinite(s.shrunk_gap));
  const gaps = dots.map(s => s.shrunk_gap);
  const stripLo = Math.min(meta.districtGap - 0.05, ...gaps);
  const stripHi = Math.max(meta.districtGap + 0.05, ...gaps);
  const stripPad = Math.max(0.05, (stripHi - stripLo) * 0.1);
  const sMin = stripLo - stripPad, sMax = stripHi + stripPad;
  const stripX = (g) => 0.7 + ((g - sMin) / (sMax - sMin)) * 12;
  s2.addShape('rect', { x: 0.7, y: 5.2, w: 12, h: 0.04, fill: { color: 'D9D9DD' }, line: { color: 'D9D9DD' } });
  dots.forEach((s) => {
    const px = stripX(s.shrunk_gap);
    s2.addShape('ellipse', { x: px - 0.08, y: 5.13, w: 0.16, h: 0.16,
                              fill: { color: INK }, line: { color: 'FFFFFF', width: 0.5 } });
  });
  const dx = stripX(meta.districtGap);
  s2.addShape('line', { x: dx, y: 4.85, w: 0, h: 0.7, line: { color: GOLD, width: 1.5, dashType: 'dash' } });
  s2.addText(`District: ${muStr}`, { x: dx + 0.05, y: 4.78, w: 1.8, h: 0.3, fontFace: MONO_FACE, fontSize: 9, color: GOLD });
  s2.addText('Each dot is one school’s gap, nudged toward the district average (shrunken). The dashed line is the district-wide average.', {
    x: 0.7, y: 5.7, w: 12, h: 0.3, fontFace: FONT_FACE, fontSize: 10, color: MUTE, italic: true,
  });

  // ---- 03 widest gaps (most negative — focal group trails the furthest)
  const s3 = pres.addSlide();
  if (summary.widest.length) {
    s3.addNotes(`The schools with the widest gaps — where ${meta.groupA} students trail ${meta.groupB} the furthest. When the likely range doesn’t cross zero, the gap is probably real and not just a quirk of a small sample. Schools with too few students to read reliably aren’t shown here.`);
    addHeader(s3, '03 · Schools with the widest gaps', `Where ${meta.groupA} students trail ${meta.groupB} the furthest, with each number nudged toward the district average and the range it most likely falls in.`);
    addGapTable(s3, pres, summary.widest, BLUE, RUST, MUTE, RULE, INK, FONT_FACE, MONO_FACE);
  } else {
    s3.addNotes(`No school shows a measurable ${meta.groupA} deficit in this slice — a result worth saying out loud.`);
    addHeader(s3, '03 · Schools with the widest gaps', null);
    s3.addText(`No school shows a measurable ${meta.groupA} − ${meta.groupB} deficit.`, {
      x: 0.7, y: 3, w: 12, h: 0.5, fontFace: SERIF_FACE, fontSize: 16, italic: true, color: MUTE,
    });
  }

  // ---- 04 parity or better (gap ≥ 0 — focal group keeping pace or ahead)
  const s4 = pres.addSlide();
  if (summary.atParity.length) {
    s4.addNotes(`Schools whose measured gap is at or above zero — ${meta.groupA} students growing as fast as or faster than ${meta.groupB}. Worth studying for whatever they’re doing well.`);
    addHeader(s4, `04 · Where ${meta.groupA} students are keeping pace`, `Schools whose measured gap is at or above zero — ${meta.groupA} students growing as fast as or faster than ${meta.groupB}.`);
    addGapTable(s4, pres, summary.atParity, BLUE, RUST, MUTE, RULE, INK, FONT_FACE, MONO_FACE);
  } else {
    s4.addNotes(`No school reached parity this year — every measured gap leans toward ${meta.groupB}. Use the widest-gaps slide to target support, and revisit this slide next year.`);
    addHeader(s4, `04 · Where ${meta.groupA} students are keeping pace`, null);
    s4.addText(`No school reached parity this year — every measured gap leans toward ${meta.groupB}.`, {
      x: 0.7, y: 3, w: 12, h: 0.5, fontFace: SERIF_FACE, fontSize: 16, italic: true, color: MUTE,
    });
  }

  // ---- 05 system scan hotspots
  const s5 = pres.addSlide();
  s5.addNotes('The standout spots from the school-by-grade view — a good place to start. The ones above the district average are worth studying for practices you could share; the ones below are where extra support is most needed.');
  addHeader(s5, '05 · Standout schools and grades', 'The three school-and-grade cells growing fastest, and the three growing slowest, compared with the district average.');
  const hs = scanHotspots(heat);
  if (hs) {
    const cols = [
      { title: 'Above district average', list: hs.hot,  color: BLUE },
      { title: 'Below district average', list: hs.cold, color: RUST },
    ];
    cols.forEach((c, i) => {
      const x = 0.7 + i * 6.2;
      s5.addText(c.title, { x, y: 2.4, w: 5.5, h: 0.35, fontFace: FONT_FACE, fontSize: 11, bold: true, color: MUTE, charSpacing: 3 });
      c.list.forEach((cell, j) => {
        const y = 3.0 + j * 0.85;
        s5.addText(`${cell.school} · Grade ${cell.grade}`, { x, y, w: 3.5, h: 0.4, fontFace: FONT_FACE, fontSize: 16, bold: true, color: INK });
        s5.addText(`n = ${cell.n}`, { x, y: y + 0.4, w: 3, h: 0.3, fontFace: FONT_FACE, fontSize: 11, color: MUTE });
        s5.addText(fmt2(cell.r), { x: x + 3.7, y, w: 1.8, h: 0.55, fontFace: MONO_FACE, fontSize: 28, bold: true, color: c.color, align: 'right' });
      });
    });
  } else {
    s5.addText('School-and-grade growth data isn’t loaded yet.', { x: 0.7, y: 3, w: 12, h: 0.5, fontFace: FONT_FACE, fontSize: 14, color: MUTE });
  }

  // ---- 06 methods
  const s6 = pres.addSlide();
  s6.addNotes('How to read this slide. Walk through the four points briefly: how the numbers are steadied for small schools, how groups with too few students are flagged, that this describes what’s happening rather than why, and that everything runs privately in the browser. Anyone who wants the full detail can read the methods note linked from the app.');
  addHeader(s6, '06 · How to read this deck — a few cautions', null);
  const notes = [
    ['Steadier for small schools', 'Each school’s gap is nudged toward the district average (we call this shrinkage), so a handful of students can’t swing the result. Schools with fewer students are nudged more.'],
    ['Too few students', `Groups with fewer than ${meta.minCellSize ?? 10} students are flagged as too few to read reliably. (A configurable minimum is planned for a future release.)`],
    ['Describes what, not why', 'These numbers show where gaps show up. They don’t explain what’s causing them. Use this report to ask sharper questions, not to assign blame.'],
    ['Private by design', 'Everything is figured right here in the browser. No student file is ever uploaded.'],
  ];
  notes.forEach(([k, v], i) => {
    const y = 2.4 + i * 0.95;
    s6.addText(k, { x: 0.7, y, w: 3.0, h: 0.4, fontFace: FONT_FACE, fontSize: 14, bold: true, color: INK });
    s6.addText(v, { x: 3.9, y, w: 9, h: 0.8, fontFace: SERIF_FACE, fontSize: 13, color: '3F4147' });
  });

  // Footer: slice + method + threshold on every non-cover slide, and slide numbers everywhere.
  const minN = meta.minCellSize ?? 10;
  const footer = `${sliceText}  ·  shrunken estimates (nudged toward the district average)  ·  n ≥ ${minN}`;
  pres.slides.forEach((sl, idx) => {
    if (idx > 0) {
      sl.addText(footer, {
        x: 0.7, y: 7.05, w: 11.0, h: 0.3, fontFace: MONO_FACE, fontSize: 9, color: MUTE,
      });
    }
    sl.addText(`${String(idx + 1).padStart(2, '0')} / ${pres.slides.length}`, {
      x: 12.1, y: 7.05, w: 1.0, h: 0.3, fontFace: MONO_FACE, fontSize: 9, color: MUTE, align: 'right',
    });
  });

  // Speaker notes for cover slide
  pres.slides[0].addNotes('Title slide. Set the scene: this is the district report for the subject and the two groups you’re looking at. Point anyone who wants the technical detail to the methods note linked from the app.');

  const filename = `GrowthLens-${meta.subject}-${meta.demographic || 'subgroup'}-${new Date().toISOString().slice(0,10)}.pptx`;
  await pres.writeFile({ fileName: filename });
}

function addHeader(slide, eyebrow, blurb) {
  slide.addText(eyebrow, { x: 0.7, y: 0.6, w: 12, h: 0.4, fontFace: 'Mulish', fontSize: 11, color: '6F727A', bold: true, charSpacing: 4 });
  // eslint-disable-next-line no-unused-expressions
  slide.addShape('rect', { x: 0.7, y: 1.05, w: 12, h: 0.02, fill: { color: 'EDEDEF' }, line: { color: 'EDEDEF' } });
  if (blurb) {
    slide.addText(blurb, { x: 0.7, y: 1.25, w: 12, h: 0.6, fontFace: 'Crimson Pro', fontSize: 16, italic: true, color: '3F4147' });
  }
}

function addGapTable(slide, pres, rows, BLUE, RUST, MUTE, RULE, INK, FONT_FACE, MONO_FACE) {
  const head = [
    { text: 'School',     options: { bold: true, color: MUTE, fontSize: 10, fontFace: FONT_FACE, charSpacing: 3 } },
    { text: 'Gap',        options: { bold: true, color: MUTE, fontSize: 10, fontFace: FONT_FACE, charSpacing: 3, align: 'right' } },
    { text: 'Likely range',     options: { bold: true, color: MUTE, fontSize: 10, fontFace: FONT_FACE, charSpacing: 3, align: 'right' } },
    { text: 'Students',          options: { bold: true, color: MUTE, fontSize: 10, fontFace: FONT_FACE, charSpacing: 3, align: 'right' } },
    { text: 'Nudge (0–1)',options: { bold: true, color: MUTE, fontSize: 10, fontFace: FONT_FACE, charSpacing: 3, align: 'right' } },
  ];
  const body = rows.map(r => [
    { text: window.schoolLabel(r), options: { fontFace: r.school_name ? FONT_FACE : MONO_FACE, fontSize: 14, color: INK } },
    { text: fmt2(r.shrunk_gap), options: { fontFace: MONO_FACE, fontSize: 14, color: r.shrunk_gap >= 0 ? BLUE : RUST, bold: true, align: 'right' } },
    { text: `[${fmt2(r.shrunk_ci95[0])}, ${fmt2(r.shrunk_ci95[1])}]`, options: { fontFace: MONO_FACE, fontSize: 12, color: '3F4147', align: 'right' } },
    { text: String(r.n_a + r.n_b), options: { fontFace: MONO_FACE, fontSize: 13, color: '3F4147', align: 'right' } },
    { text: r.shrinkage_factor.toFixed(2), options: { fontFace: MONO_FACE, fontSize: 13, color: MUTE, align: 'right' } },
  ]);
  slide.addTable([head, ...body], {
    x: 0.7, y: 2.4, w: 12,
    colW: [2.6, 1.8, 3.4, 1.5, 2.7],
    rowH: 0.46,
    border: { type: 'solid', color: RULE, pt: 0.5 },
    fontFace: FONT_FACE,
  });
}

window.ExportPage = ExportPage;
