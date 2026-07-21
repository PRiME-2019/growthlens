// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// Publish the Supabase resource workbench back to the static CSVs the app
// serves (reference/evidence_resources.csv + evidence_crosswalk.csv).
// Run by .github/workflows/publish-resources.yml, which commits the result;
// the app never reads Supabase directly — see supabase/schema.sql.
//
// Output dialect must exactly match what engine/resources.js parseCsv reads
// and what git stores: every field quoted, "" for embedded quotes, LF line
// endings, trailing newline. test/publish-resources.test.js proves the
// round-trip is lossless against the shipped files.
'use strict';

const RESOURCE_COLUMNS = [
  'resource_id', 'title', 'series', 'evidence_type', 'subject',
  'grade_band', 'population', 'url', 'notes',
];
const CROSSWALK_COLUMNS = [
  'finding_type', 'subgroup', 'subject', 'grade_band', 'resource_id',
  'match_strength', 'rationale',
];

function writeCsv(header, rows) {
  const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const line = (vals) => vals.map(cell).join(',');
  return [line(header)]
    .concat(rows.map((r) => line(header.map((h) => r[h]))))
    .join('\n') + '\n';
}

async function fetchTable(base, key, table, columns, fetchFn = fetch) {
  const url = `${base}/rest/v1/${table}?select=${columns.join(',')}&order=position.asc`;
  const res = await fetchFn(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  if (!res || !res.ok) {
    throw new Error(`fetching ${table} failed: HTTP ${res ? res.status : 'no response'}`);
  }
  return res.json();
}

async function main() {
  const fs = require('node:fs');
  const path = require('node:path');
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');

  const outDir = path.join(__dirname, '..', 'reference');
  const resources = await fetchTable(base, key, 'resources', RESOURCE_COLUMNS);
  const crosswalk = await fetchTable(base, key, 'resource_crosswalk', CROSSWALK_COLUMNS);
  if (!resources.length || !crosswalk.length) {
    throw new Error(`refusing to publish empty tables (${resources.length} resources, ${crosswalk.length} crosswalk rows)`);
  }
  fs.writeFileSync(path.join(outDir, 'evidence_resources.csv'), writeCsv(RESOURCE_COLUMNS, resources));
  fs.writeFileSync(path.join(outDir, 'evidence_crosswalk.csv'), writeCsv(CROSSWALK_COLUMNS, crosswalk));
  console.log(`published ${resources.length} resources, ${crosswalk.length} crosswalk rows`);
}

module.exports = { RESOURCE_COLUMNS, CROSSWALK_COLUMNS, writeCsv, fetchTable };

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
