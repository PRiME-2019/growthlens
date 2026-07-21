// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// Browser smoke for /admin.html — login flow, summary, editor, publish bar.
// Supabase is fully intercepted (no live calls, no real emails); the only
// network the page touches is the local server and the CDN pins.
//
// Requires Playwright (not vendored — the app itself has no dependencies):
//   npm install playwright          (any scratch dir works; msedge channel
//                                    uses the installed Edge, no download)
// Run:
//   python -m http.server 8123      (from the repo root, separate shell)
//   node tools/verify-admin.js      (BASE_URL env overrides the default)
// Exits 0 with every line reading PASS; exits 1 otherwise.
'use strict';

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8123';
const SUPA = 'https://slhlkltahmybgkjzuech.supabase.co';
const OTP_LENGTH = 8;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  sub: 'u1', email: 'admin@test.invalid', role: 'authenticated',
  aud: 'authenticated', exp: 4102444800, iat: 1750000000 })}.sig`;
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated',
  email: 'admin@test.invalid', app_metadata: {}, user_metadata: {},
  created_at: '2026-01-01T00:00:00Z' };
const SESSION = { access_token: FAKE_JWT, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: USER };

const EVENTS = [
  { district_id: 'Columbia 93', device_id: 'd1', session_id: 's1', event: 'session_start',
    props: {}, created_at: '2026-07-13T10:00:00Z' },
  { district_id: 'Columbia 93', device_id: 'd1', session_id: 's1', event: 'page_view',
    props: { page: 'scan' }, created_at: '2026-07-13T10:01:00Z' },
  { district_id: '(system)', device_id: null, session_id: null, event: 'keepalive',
    props: {}, created_at: '2026-07-16T12:00:00Z' },
];
const RES = [{ resource_id: 'R01', title: 'Alpha', series: 's', evidence_type: 'synthesis',
  subject: 'any', grade_band: 'all', population: 'mll', url: 'https://a.org', notes: '',
  position: 1, updated_at: null }];
const XW = [{ id: 1, finding_type: 'subgroup_gap', subgroup: 'mll', subject: 'any',
  grade_band: 'any', resource_id: 'R01', match_strength: 'general', rationale: 'r',
  position: 1, updated_at: null }];

let failures = 0;
const expect = (cond, label) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + label);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  let publishCalls = 0;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));

  await ctx.route(`${SUPA}/**`, (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/auth/v1/otp') return json({});
    if (p === '/auth/v1/verify') return json(SESSION);
    if (p === '/auth/v1/user') return json(USER);
    if (p === '/auth/v1/logout') return json({}, 204);
    if (p.startsWith('/auth/v1/token')) return json(SESSION);
    if (p === '/rest/v1/events') return json(EVENTS);
    if (p === '/rest/v1/resources') return json(RES);
    if (p === '/rest/v1/resource_crosswalk') return json(XW);
    if (p === '/functions/v1/publish') { publishCalls++; return json({ ok: true }); }
    return json([]);
  });

  // Login
  await page.goto(`${BASE_URL}/admin.html`, { waitUntil: 'networkidle' });
  expect(await page.getByText('Admin sign-in').count() === 1, 'login card renders');
  await page.getByLabel('Email address').fill('admin@test.invalid');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Digit 1').waitFor({ state: 'visible' });
  expect(await page.getByLabel(`Digit ${OTP_LENGTH}`).count() === 1,
    `${OTP_LENGTH} code boxes render`);
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Digit 1',
    'focus lands on the first code box');
  for (let i = 1; i <= OTP_LENGTH; i++) {
    await page.getByLabel(`Digit ${i}`).pressSequentially(String(i % 10));
  }
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ state: 'visible', timeout: 10000 });
  expect(true, 'auto-verify reaches the shell');

  // Summary
  await page.getByText('Districts seen').waitFor({ state: 'visible', timeout: 10000 });
  expect(await page.getByText('(system)').count() === 0, '(system) filtered from summary');
  expect(await page.getByText('Columbia 93').count() >= 1, 'district rollup renders');

  // Editor + publish bar
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await page.getByText('Alpha').waitFor({ state: 'visible', timeout: 10000 });
  expect(true, 'resources list renders');
  await page.getByText('Unpublished changes').waitFor({ state: 'visible', timeout: 10000 });
  expect(true, 'diff badge shows against canned rows');
  await page.getByRole('button', { name: 'Publish to site' }).click();
  await page.getByText('Publish started').waitFor({ state: 'visible', timeout: 10000 });
  expect(publishCalls === 1, 'publish invokes the edge function');

  expect(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SCRIPT FAIL', e); process.exit(1); });
