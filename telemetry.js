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

  // The batching client. All I/O comes in through deps so Node tests can stub
  // it: { fetchFn, storage, uuid, url, key, version, flushAt }. Nothing here
  // may throw into the caller — telemetry must never break the app.
  function createClient(deps) {
    const { fetchFn, storage, uuid, url, key, version = null, flushAt = 20 } = deps;
    let identity = null;
    let sessionId = null;
    let queue = [];

    function writeIdentity() {
      try { storage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* private mode */ }
    }
    function readIdentity() {
      let raw = null;
      try { raw = JSON.parse(storage.getItem(IDENTITY_KEY) || 'null'); } catch { raw = null; }
      if (!raw || typeof raw !== 'object') {
        raw = { district: null, isCustom: false, deviceId: null, optOut: false, setAt: null, dismissedAt: null };
      }
      identity = raw;
      if (!identity.deviceId) { identity.deviceId = uuid(); writeIdentity(); }
    }

    function enqueue(event, props, force) {
      if (!identity) readIdentity();
      if (identity.optOut && !force) return;
      const clean = sanitizeProps(event, props);
      if (clean == null) return;
      queue.push({
        district_id: identity.district == null ? '(unset)' : truncate(identity.district),
        is_custom: !!identity.isCustom,
        device_id: identity.deviceId,
        session_id: sessionId,
        event,
        props: clean,
        app_version: version,
      });
      if (queue.length >= flushAt) flush();
    }

    async function flush(opts) {
      if (!queue.length) return;
      const batch = queue;
      queue = [];
      if (!url || !key) return; // not configured yet — drop, never error
      const send = () => fetchFn(url + '/rest/v1/events', {
        method: 'POST',
        keepalive: !!(opts && opts.keepalive),
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      });
      try { const r = await send(); if (r && r.ok) return; } catch { /* retry below */ }
      try { await send(); } catch { /* drop — telemetry never surfaces errors */ }
    }

    return {
      init() {
        readIdentity();
        sessionId = uuid();
        enqueue('session_start', {});
      },
      log(event, props) { try { enqueue(event, props); } catch { /* never throw */ } },
      flush,
      setIdentity({ district, isCustom }) {
        if (!identity) readIdentity();
        identity.district = truncate(String(district));
        identity.isCustom = !!isCustom;
        identity.setAt = new Date().toISOString();
        writeIdentity();
        enqueue('identity_set', { custom: !!isCustom });
        flush();
      },
      setOptOut(flag) {
        if (!identity) readIdentity();
        identity.optOut = !!flag;
        writeIdentity();
        enqueue(flag ? 'opt_out' : 'opt_in', {}, true);
        flush();
      },
      getIdentity() {
        if (!identity) readIdentity();
        return { ...identity };
      },
      needsPrompt() {
        if (!identity) readIdentity();
        return identity.district == null && !identity.dismissedAt;
      },
      dismissPrompt() {
        if (!identity) readIdentity();
        identity.dismissedAt = new Date().toISOString();
        writeIdentity();
      },
    };
  }

  // ---- Browser bootstrap ----------------------------------------------------
  // Supabase project credentials. The anon key is public by design — RLS
  // allows it to INSERT into public.events and nothing else (see the spec).
  // Empty until the Supabase project exists; the client drops batches
  // silently while unconfigured, so the app behaves identically either way.
  const SUPABASE_URL = '';
  const SUPABASE_ANON_KEY = '';

  const FLUSH_MS = 30000;
  let singleton = null;

  function start() {
    if (typeof window === 'undefined' || !window.document) return null;
    if (singleton) return singleton;
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    singleton = createClient({
      fetchFn: (u, o) => window.fetch(u, o),
      storage: storage || { getItem: () => null, setItem: () => {} },
      uuid: () => (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : 'no-uuid-' + String(Math.random()).slice(2)),
      // window.GL_TELEMETRY_URL / _KEY are test seams (Playwright sets them
      // before load to intercept sends); production uses the constants.
      url: window.GL_TELEMETRY_URL || SUPABASE_URL,
      key: window.GL_TELEMETRY_KEY || SUPABASE_ANON_KEY,
      version: window.GL_VERSION || null,
    });
    singleton.init();
    window.setInterval(() => singleton.flush(), FLUSH_MS);
    window.document.addEventListener('visibilitychange', () => {
      if (window.document.visibilityState === 'hidden') singleton.flush({ keepalive: true });
    });
    return singleton;
  }

  return {
    IDENTITY_KEY, MAX_STR, truncate, sanitizeProps, filterDistricts, createClient,
    start,
    log: (event, props) => { if (singleton) singleton.log(event, props); },
    flush: () => (singleton ? singleton.flush() : Promise.resolve()),
    getIdentity: () => (singleton ? singleton.getIdentity() : null),
    needsPrompt: () => (singleton ? singleton.needsPrompt() : false),
    setIdentity: (v) => { if (singleton) singleton.setIdentity(v); },
    setOptOut: (v) => { if (singleton) singleton.setOptOut(v); },
    dismissPrompt: () => { if (singleton) singleton.dismissPrompt(); },
  };
});
