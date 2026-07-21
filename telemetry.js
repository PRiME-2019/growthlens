// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// GrowthLens usage telemetry — UMD: browser → window.GLTelemetry, Node → module.exports.
// Pure logic (whitelist, truncation, typeahead filter, batching client) lives here so
// node --test can exercise it with stubbed fetch/storage; app-shell.jsx owns the UI.
// Events carry ONLY page/feature names and the self-reported district identity —
// never student data, filenames, row counts, or computed results.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLTelemetry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const IDENTITY_KEY = 'gl:identity';
  const MAX_STR = 120;

  // Per-event props whitelist. An event not listed here cannot be sent at all;
  // a key not listed for its event is silently dropped. This table IS the
  // privacy contract — extend it only alongside the spec
  // (docs/superpowers/specs/2026-07-20-usage-telemetry-design.md).
  const PROPS_ALLOWED = {
    session_start: [],
    identity_set: ['custom'],
    opt_out: [],
    opt_in: [],
    page_view: ['page'],
    upload_ok: ['subject'],
    upload_error: ['subject', 'code'],
    export: ['subjects'],
    interact: ['control', 'value'],
    keepalive: [],
  };

  function truncate(v, n = MAX_STR) {
    const s = String(v);
    return s.length > n ? s.slice(0, n) : s;
  }

  function sanitizeProps(event, props) {
    const allowed = PROPS_ALLOWED[event];
    if (!allowed) return null;
    const out = {};
    for (const k of allowed) {
      const v = props ? props[k] : undefined;
      if (v == null) continue;
      if (Array.isArray(v)) out[k] = v.slice(0, 10).map((x) => truncate(x));
      else if (typeof v === 'boolean' || typeof v === 'number') out[k] = v;
      else out[k] = truncate(v);
    }
    return out;
  }

  // Typeahead over the MO district list: prefix matches first (a user typing
  // "Meh" wants Mehlville at the top), then substring matches, capped.
  function filterDistricts(list, query, limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q || !Array.isArray(list)) return [];
    const starts = [];
    const contains = [];
    for (const d of list) {
      const dl = String(d).toLowerCase();
      if (dl.startsWith(q)) starts.push(d);
      else if (dl.includes(q)) contains.push(d);
    }
    return starts.concat(contains).slice(0, limit);
  }

  return { IDENTITY_KEY, MAX_STR, truncate, sanitizeProps, filterDistricts };
});
