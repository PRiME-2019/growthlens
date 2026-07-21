// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// Admin-panel pure logic — telemetry aggregation, resource-form validation,
// and the published-vs-workbench diff. No DOM, no network; admin.jsx supplies
// rows and file text. UMD: browser → window.GLAdminData, Node → module.exports.
(function (root, factory) {
  const csv = (typeof module !== 'undefined' && module.exports)
    ? require('./csv.js') : root.GLCsv;
  const api = factory(csv);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLAdminData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GLCsv) {
  'use strict';

  // Monday of the ISO week containing the timestamp, as YYYY-MM-DD (UTC).
  function isoWeekStart(iso) {
    const d = new Date(iso);
    const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  const countMap = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const sortedCounts = (m, key) => [...m.entries()]
    .map(([k, count]) => ({ [key]: k, count }))
    .sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key])));

  // '(system)' rows (the keepalive cron) are excluded from EVERYTHING;
  // '(unset)' visitors count as devices/sessions/events and get their own
  // per-district row, but are not a "district seen".
  function summarize(events) {
    const rows = (events || []).filter((e) => e.district_id !== '(system)');
    const devices = new Set(), sessions = new Set(), districts = new Set();
    const weekly = new Map(), pages = new Map(), errors = new Map();
    const byDistrict = new Map();
    for (const e of rows) {
      if (e.device_id) devices.add(e.device_id);
      if (e.session_id) sessions.add(e.session_id);
      if (e.district_id && e.district_id !== '(unset)') districts.add(e.district_id);
      countMap(weekly, isoWeekStart(e.created_at));
      if (e.event === 'page_view' && e.props && e.props.page) countMap(pages, e.props.page);
      if (e.event === 'upload_error' && e.props && e.props.code) countMap(errors, e.props.code);
      const d = byDistrict.get(e.district_id) ||
        { district: e.district_id, firstSeen: e.created_at, lastSeen: e.created_at,
          sessions: new Set(), devices: new Set(), events: 0 };
      d.firstSeen = e.created_at < d.firstSeen ? e.created_at : d.firstSeen;
      d.lastSeen = e.created_at > d.lastSeen ? e.created_at : d.lastSeen;
      if (e.session_id) d.sessions.add(e.session_id);
      if (e.device_id) d.devices.add(e.device_id);
      d.events++;
      byDistrict.set(e.district_id, d);
    }
    return {
      districts: districts.size, devices: devices.size,
      sessions: sessions.size, events: rows.length,
      weekly: [...weekly.entries()].map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week.localeCompare(b.week)),
      topPages: sortedCounts(pages, 'page'),
      uploadErrors: sortedCounts(errors, 'code'),
      perDistrict: [...byDistrict.values()].map((d) => ({
        district: d.district, firstSeen: d.firstSeen, lastSeen: d.lastSeen,
        sessions: d.sessions.size, devices: d.devices.size, events: d.events,
      })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
    };
  }

  function validateResource(r, otherIds) {
    const errs = [];
    const id = String(r.resource_id || '').trim();
    if (!id) errs.push('resource_id is required');
    else if (id.length > 10) errs.push('resource_id must be 10 characters or fewer');
    else if ((otherIds || []).includes(id)) errs.push('resource_id ' + id + ' already exists');
    if (!String(r.title || '').trim()) errs.push('title is required');
    const url = String(r.url || '').trim();
    if (!/^https?:\/\//.test(url)) errs.push('url must start with http:// or https://');
    return errs;
  }

  function validateCrosswalk(row, resourceIds) {
    const errs = [];
    for (const f of ['finding_type', 'subgroup', 'subject', 'grade_band', 'match_strength']) {
      if (!String(row[f] || '').trim()) errs.push(f + ' is required');
    }
    if (!(resourceIds || []).includes(row.resource_id)) {
      errs.push('resource_id ' + (row.resource_id || '(empty)') + ' does not match an existing resource');
    }
    return errs;
  }

  // true = there ARE unpublished changes (workbench differs from the served CSV).
  function diffPublished(columns, dbRows, fileText) {
    return GLCsv.writeCsv(columns, dbRows) !== String(fileText || '').replace(/\r\n/g, '\n');
  }

  return { summarize, validateResource, validateCrosswalk, diffPublished, isoWeekStart };
});
