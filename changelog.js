// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// Single source of truth for the app version and the user-facing release notes.
// Loaded as a plain script (like data.js) before the React app compiles.
//
// The FIRST entry is the current release: its `version` drives the header badge
// and the "what's new" announcement. Add a new entry at the TOP for each release.
//
// Entry shape:
//   version: 'X.Y'        bare semantic-ish version; compared verbatim against
//                         the last version a visitor dismissed.
//   date:    'YYYY-MM-DD' release date, shown in the changelog modal.
//   stage:   'preview'    optional suffix rendered after the version (e.g. badge
//                         reads "v0.7 preview"). Omit for a plain release.
//   title:   string       short headline for the release.
//   items:   string[]     plain-language, user-facing bullets — what changed for
//                         the person using the tool, not the commit messages.
window.GL_CHANGELOG = [
  {
    version: '0.74',
    date: '2026-09-24',
    stage: 'preview',
    title: 'Behind-the-scenes maintenance',
    items: [
      'Routine site update. Nothing changes in how you use GrowthLens.',
    ],
  },
  {
    version: '0.73',
    date: '2026-07-20',
    stage: 'preview',
    title: 'Tell us your district — and see how GrowthLens is used',
    items: [
      'A one-time prompt asks which district you’re with — pick from the list or type anything. Your answer lives in your browser and shows at the bottom of the sidebar; click it any time to change it.',
      'GrowthLens now records which pages and features are used (never your data, files, or results) so PRiME can improve the parts that matter. Turn it off any time from your district name in the sidebar.',
    ],
  },
  {
    version: '0.72',
    date: '2026-07-02',
    stage: 'preview',
    title: 'Weeks-of-learning numbers now agree everywhere',
    items: [
      'Fixed: with units set to weeks of learning, the per-grade numbers in the Growth by school & grade overview and key takeaways (in the app and in exported decks) converted with a grades 4–8 average factor instead of each grade’s own, so they could disagree with the heat map. Easiest to spot in one-school districts, where the overview now matches the school’s row exactly.',
      'Numbers shown in SD (standard scale) were never affected.',
    ],
  },
  {
    version: '0.71',
    date: '2026-06-23',
    stage: 'preview',
    title: 'Easier uploads & more ways to slice your data',
    items: [
      'Upload the DESE growth export straight as the tab-delimited .txt it downloads as — no need to open it in Excel and save a CSV first.',
      'Three new ways to split your data: gender, gifted & talented, and direct certification (a second income measure alongside free/reduced lunch).',
      'Every demographic split is now optional — a file missing a column still loads, and only the splits your data supports are offered.',
      'Filter the Scores vs. growth page to a single grade.',
      'A “What’s new” panel and an in-app notice whenever the version changes.',
    ],
  },
  {
    version: '0.7',
    date: '2026-06-15',
    stage: 'preview',
    title: 'Preview release',
    items: [
      'First public preview of GrowthLens — upload one file per subject and explore growth entirely in your browser.',
    ],
  },
];

// Convenience pointers derived from the list above.
window.GL_RELEASE = window.GL_CHANGELOG[0];
window.GL_VERSION = window.GL_RELEASE.version;
// Display label for the header badge, e.g. "v0.7 preview".
window.GL_VERSION_LABEL =
  'v' + window.GL_RELEASE.version + (window.GL_RELEASE.stage ? ' ' + window.GL_RELEASE.stage : '');
