// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// GrowthLens CSV writer — the exact all-quoted dialect engine/resources.js
// parseCsv reads and git stores (LF, trailing newline). Shared by
// tools/publish-resources.js (Node) and admin.jsx (browser diff badge).
// UMD: browser → window.GLCsv, Node → module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLCsv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function writeCsv(header, rows) {
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const line = (vals) => vals.map(cell).join(',');
    return [line(header)]
      .concat(rows.map((r) => line(header.map((h) => r[h]))))
      .join('\n') + '\n';
  }
  return { writeCsv };
});
