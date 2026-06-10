# GrowthLens — Friendly Copy Rewrite

**Goal:** Make every word a district employee reads feel friendly, professional, and not-overly-technical — so a principal, curriculum director, data coordinator, or board member finds GrowthLens appealing and easy to follow. Keep the analysis exactly as accurate as it is today; only the *language* changes.

**Scope (approved):** Everything user-facing — the in-app screens, the methods note, and the README intro. Engine code, tests, and inline developer comments are out of scope.

## Who we're writing for

A smart, busy district employee who is **not** a statistician. They lead schools or programs, sit on boards, or coordinate data. They can read a chart and a table; they do not want to decode "empirical-Bayes shrinkage of inverse-variance-weighted residuals." Write as if explaining to a sharp colleague over coffee.

## Voice

- **Friendly and professional.** Warm, plain-spoken, encouraging — never breezy, never stuffy.
- **Second person, active voice, present tense.** "You upload a file and GrowthLens shows you…"
- **Short sentences, one idea each.** Concrete nouns and verbs over abstractions.
- **Plain-language first.** Lead with everyday meaning; put the precise statistical term in parentheses, a tooltip, or a smaller sub-note — never as the only signpost.
- **Reassuring about privacy,** always concretely ("nothing ever leaves your browser tab — you can check that yourself in dev tools").
- **Non-judgmental framing.** The tool helps you *ask better questions, not assign blame*. Numbers describe *what's* happening, not *why*.

## Plain-language-first rule

Keep these precise terms in the product (don't delete them), but always gloss them at least once nearby and never make them the only label: **residual, gap, shrunken / shrinkage, credible interval / confidence interval, SD, weeks of learning, district average**.

**Banish from the everyday UI** (these live only in the methods note): empirical-Bayes, τ² / tau, REML, DerSimonian–Laird, random-effects pooled mean, inverse-variance, in quadrature, golden-section, profile log-likelihood, posterior, one-hot, schema.

## Glossary — term → how we say it

| Precise term | Plain-language version (UI) |
|---|---|
| residual / standardized growth residual | "growth compared with what was expected" · short label: **growth vs. expected** |
| gap | "the difference between two student groups at the same school" |
| shrunken / shrinkage (keep the word) | gloss: "nudged toward the district average so a few students can't swing the result" |
| raw | "each school's own number, exactly as measured" |
| shrinkage factor **B** | "how far this school was nudged toward the district average (0–1)" |
| 95% credible / confidence interval | "the range the real number most likely falls in" |
| SD (standard deviation) | keep as the unit chip; in prose "on a standard scale" |
| τ² / between-school SD | "how much schools really differ from one another" (drop the symbol in UI) |
| minimum-n threshold / below cell-size / small-n cell | "too few students to read reliably" · sub-note "(fewer than N students)" |
| random-effects pooled mean | "district-wide average that gives steadier schools more weight" |
| empirical-Bayes | (drop in UI; methods note keeps it) |
| diverging color scale | "blue = above the district average, rust = below" |
| one-hot / flag column | "a simple Yes/No column" |
| schema validated | "your file checks out" |
| status axis / Z_T | "where students started (prior achievement)" |

## Exact target copy — high-traffic surfaces

These are authoritative; place them verbatim. (Keep the codebase's curly-quote convention — `'` `"` — so JSX apostrophes never break parsing.)

### Landing hero
- Eyebrow: `GrowthLens · v0.4 preview` (unchanged)
- H1: **See where your students are growing — privately, in your browser.**
- Blurb: "Upload one file from your assessment system and GrowthLens turns it into a clear picture of how each school and student group is doing — where growth is strong, where groups are falling behind, and which results rest on too few students to lean on. Not one student record ever leaves your browser tab."

### Landing cards
- 01 Bring data / "Upload your file" — "One row per student, per subject, per year. We look for about a dozen columns; there's a plain-language checklist and a sample file waiting on the upload page."
- 02 Triage / "System Scan" — "A district-wide heat map of how each grade is doing at each school. Spot where growth is consistently strong or soft before you dig into any one group."
- 03 Drill in / "Gap Analysis" — "Pick a subject and two student groups, and see the gap between them at every school — ranked, with the district average for context and small-sample schools clearly flagged."

### Landing FAQ ("What GrowthLens is — and isn't")
- "What it does" — "Shows how each school is doing compared with the district as a whole, steadies the numbers for smaller schools so a few students can't swing the picture, and measures the gap between student groups school by school."
- "How it stays private" — "Everything is figured right here in your browser. Your file is never uploaded to a server, and the methods note spells out exactly how the numbers are made."
- "What it isn't" — "It isn't a way to evaluate individual teachers or students. Groups too small to read reliably are flagged so you don't over-interpret them. And the numbers describe what's happening, not why — use them to ask sharper questions, not to assign blame."

### Upload page
- H1: **Bring one file per subject from your assessment system**
- Blurb: "GrowthLens works with two files — one for reading (ELA) and one for math. Both are read right here in your browser; nothing is uploaded. You can start exploring a subject the moment its file loads cleanly, and add the other whenever you're ready."
- Dropzone ready state: "Looks good — your file checks out and is ready to explore."
- Dropzone idle help: "Drop a {subject} file here, or click to choose one. One row per student, per grade, per year."
- "Expected columns" → card title **"What your file should include"**; intro warmed, keep the table but plain-language the notes.
- Skip link: "Skip for now and explore the sample math data"

### Page blurbs (BriefHeader)
- **System Scan** — title "Where to look first"; blurb: "A district-wide view of how each grade is doing at each school, compared with what the district average would predict. Blue cells are growing faster than expected, rust cells slower. Scan the rows for schools that are consistently strong or soft, and the columns for grades where the whole district is ahead or behind — then dig into a specific subject and group in Gap Analysis."
- **Gap Analysis** — title "Where the gap lives, school by school"; blurb: "For the two groups you choose, GrowthLens measures the gap between them at every school and lines the schools up from largest to smallest. You'll see how big each gap is and which way it leans, the district-wide average for context, and which schools have too few students to read reliably. Use it to tell whether a gap shows up across the system or sits in just a few schools."
- **Status & Growth** — title "Where each school sits on both fronts"; blurb: "Two views at once: where students started (prior achievement) along the bottom, and how much they grew compared with expectations up the side. The dashed lines mark the district average on each, splitting the chart into four corners — for example, schools that start lower but grow faster."
- **Demographics** — title "How growth varies from group to group"; blurb: "For each group, the box shows the middle of the pack and the line shows the typical student; the whiskers and dots show the full spread. Compare the typical student and the spread across groups to see whether differences sit in the middle or out in the tails."
- **Export** — title "Download a board-ready deck"; blurb: "Six slides covering the headline numbers, the schools at each end of the gap, the standout spots from System Scan, and a short methods recap. It's real, editable PowerPoint — text, tables, and shapes, not flattened screenshots."

### Recurring micro-copy
- Privacy chip: "Private — runs in your browser" (keep)
- Below-threshold section divider: **"Too few students to read reliably — handle with care"**
- Forest "n*" note: "marks schools with too few students to read reliably (fewer than {min})"
- Controls "Below threshold" → keep options, friendly labels: "Group at the bottom" / "Mark in place (dimmed)" / "Hide"
- Method control tooltip: "How each school's number is figured. Shrunken gently pulls schools with less data toward the district average, so a handful of students can't swing the result — steadier for small schools, but less extreme. Raw shows each school's own number exactly as measured: honest, but jumpier when only a few students are involved."
- Units tooltip: "How to show the numbers. SD is a standard scale compared with the district average. Weeks converts that into about how many weeks of learning it represents, using Missouri MAP growth norms."

## Figure labels (approved: plain label + precise sub-note)

Axis titles and figure subtitles lead in plain language with the exact term in a smaller note. Examples:
- Forest axis: keep "favors {group}" cues; subtitle leads "Each school's gap, with the range it most likely falls in." Precise sub-note: "95% interval · district average shown as the gold dashed line."
- Achievement axes: x "Where students started" (sub: prior achievement, standard score) · y "Growth vs. expected" (sub: SD or weeks).
- Heatmap subtitle: "Shrunken results vs. the district average. Blue = faster than expected, rust = slower." Sub-note keeps "SD vs. district average."
- Demographics: "x: growth vs. expected ({units})". Keep med/IQR data values; gloss "box = middle half, line = typical student."

## Methods note (keep full rigor; warm the doorways)

Keep every formula, symbol, and caveat. Warm the lede and add a one-sentence plain-language opener to each numbered section so a non-analyst can follow the gist before the math. Keep τ², REML, empirical-Bayes, etc. here — this is the one place they belong.

## README (intro only)

Rewrite the top description and "What it does" list in the same friendly voice. Leave the Architecture / engine / file-map / build sections technical — those are for developers.

## Constraints for the edit pass

- **Text only.** Change display strings and JSX text nodes. Never touch variable names, props, keys, logic, data shapes, or structure.
- **Preserve the curly-quote convention** (`'` `"`) inside JSX so apostrophes don't break the in-browser Babel parse.
- **Don't break template literals** — keep every `${…}` interpolation intact.
- **Keep all numeric/data formatting** (monospaced values, `n=`, SD, signs) exactly as rendered.
- After editing, verify the app still renders and `node --test` still passes (copy changes must not touch the engine).
