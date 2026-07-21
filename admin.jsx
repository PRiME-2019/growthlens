// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.

// Admin panel — OTP login, telemetry summary, resource workbench editor.
// Standalone from the app shell on purpose: it defines its own brand
// constants and touches only engine/csv.js + engine/resources.js, so app
// refactors can't break the panel. Security lives in Supabase RLS — the
// publishable key here is the same public one telemetry.js ships.

const SUPABASE_URL = 'https://slhlkltahmybgkjzuech.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CqONVSh4-PvqZvLgs-_dHw_oGKWTMqf';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN = { blue: '#003DA5', gold: '#9A7611', goldLight: '#C8A84A', bg: '#F7F7F8',
  ink: '#1A1B1F', ink2: '#3F4147', mute: '#6F727A', rule: '#D9D9DD', rule2: '#EDEDEF',
  amber: '#9A6B11', amberBg: '#FBF3E2' };
const FONT = '"Mulish", ui-sans-serif, system-ui, sans-serif';
const SERIF = '"Crimson Pro", ui-serif, Georgia, serif';
const LABEL = '"Archivo Narrow", "Mulish", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

const ADMIN_EMAIL_KEY = 'gl:admin-email';
// Must match Supabase Auth → Email OTP length (set to 8, 2026-07-21).
const OTP_LENGTH = 8;

// Column orders MUST match tools/publish-resources.js — the diff badge and
// the published CSVs depend on identical ordering.
const RESOURCE_COLUMNS = [
  'resource_id', 'title', 'series', 'evidence_type', 'subject',
  'grade_band', 'population', 'url', 'notes',
];
const CROSSWALK_COLUMNS = [
  'finding_type', 'subgroup', 'subject', 'grade_band', 'resource_id',
  'match_strength', 'rationale',
];

// ---- shared bits ------------------------------------------------------------

function Eyebrow({ children }) {
  return <div style={{ fontFamily: LABEL, fontSize: 10.5, fontWeight: 700, color: ADMIN.mute,
    textTransform: 'uppercase', letterSpacing: 1.4 }}>{children}</div>;
}

function Btn({ children, onClick, kind = 'primary', disabled, small, title }) {
  const base = { border: 'none', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
    fontFamily: FONT, fontWeight: 700, fontSize: small ? 12.5 : 13.5,
    padding: small ? '6px 12px' : '9px 18px', opacity: disabled ? 0.55 : 1 };
  const kinds = {
    primary: { background: ADMIN.blue, color: '#fff' },
    ghost: { background: 'none', color: ADMIN.mute, fontWeight: 600 },
    line: { background: '#fff', color: ADMIN.ink2, border: `1px solid ${ADMIN.rule}` },
    danger: { background: '#fff', color: '#8C2F1B', border: '1px solid #D8B4A8' },
  };
  return <button type="button" title={title} onClick={onClick} disabled={disabled}
    style={{ ...base, ...kinds[kind] }}>{children}</button>;
}

function ErrLine({ children }) {
  return children ? <p role="alert" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5,
    color: '#8C2F1B' }}>{children}</p> : null;
}

// ---- login ------------------------------------------------------------------

function CodeBoxes({ value, onChange, onComplete }) {
  const refs = React.useRef([]);
  const last = OTP_LENGTH - 1;
  const set = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(clean);
    if (clean.length === OTP_LENGTH) onComplete(clean);
  };
  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1].focus();
  };
  const handleChange = (i, e) => {
    const d = e.target.value.replace(/\D/g, '');
    if (!d) { set(value.slice(0, i)); return; }
    const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, OTP_LENGTH);
    set(next);
    const focusAt = Math.min(i + d.length, last);
    if (refs.current[focusAt]) refs.current[focusAt].focus();
  };
  const handlePaste = (e) => {
    e.preventDefault();
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    set(digits);
    const at = Math.min(digits.length, last);
    if (refs.current[at]) refs.current[at].focus();
  };
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }} onPaste={handlePaste}>
      {Array.from({ length: OTP_LENGTH }, (_, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric" autoComplete="one-time-code" maxLength={2}
          aria-label={`Digit ${i + 1}`}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          style={{ width: 36, height: 48, textAlign: 'center', fontFamily: MONO,
                   fontSize: 20, fontWeight: 600, color: ADMIN.ink,
                   border: `1.5px solid ${ADMIN.rule}`, borderRadius: 8 }} />
      ))}
    </div>
  );
}

function LoginCard() {
  const [stage, setStage] = React.useState('email');
  const [email, setEmail] = React.useState(() => {
    try { return localStorage.getItem(ADMIN_EMAIL_KEY) || ''; } catch { return ''; }
  });
  const [code, setCode] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

  const sendCode = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setErr(null);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(), options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setErr(/signup|not allowed|not found/i.test(error.message)
        ? 'That email isn’t invited to the admin panel.'
        : error.message);
      return;
    }
    try { localStorage.setItem(ADMIN_EMAIL_KEY, email.trim()); } catch { /* ignore */ }
    setStage('code'); setCode(''); setCooldown(60);
  };
  const verify = async (token) => {
    if (busy) return;
    setBusy(true); setErr(null);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (error) {
      setErr('That code didn’t work — it may have expired. Try again or resend.');
      setCode('');
    }
    // success: onAuthStateChange flips the gate; nothing to do here.
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(440px, 100%)', background: '#fff', borderRadius: 12,
                    border: `1px solid ${ADMIN.rule2}`,
                    boxShadow: '0 20px 60px rgba(26, 27, 31, 0.10)', overflow: 'hidden' }}>
        <div style={{ height: 3, background: ADMIN.goldLight }} />
        <div style={{ padding: '26px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: ADMIN.ink,
                          letterSpacing: -0.4, lineHeight: 1.05 }}>GrowthLens</div>
            <Eyebrow>Admin sign-in</Eyebrow>
          </div>
          {stage === 'email' ? (
            <>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: ADMIN.ink2 }}>
                Enter your email and we’ll send a one-time sign-in code.
              </p>
              <input
                autoFocus type="email" value={email} placeholder="you@example.org"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }}
                aria-label="Email address"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                         fontSize: 14.5, color: ADMIN.ink, border: `1.5px solid ${ADMIN.rule}`,
                         borderRadius: 8 }} />
              <ErrLine>{err}</ErrLine>
              <Btn onClick={sendCode} disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : 'Send code'}
              </Btn>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: ADMIN.ink2 }}>
                We sent an {OTP_LENGTH}-digit code to <strong>{email.trim()}</strong>. It expires in an hour.
              </p>
              <CodeBoxes value={code} onChange={setCode} onComplete={verify} />
              <ErrLine>{err}</ErrLine>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Btn kind="ghost" small onClick={() => { setStage('email'); setErr(null); }}>
                  Use a different email
                </Btn>
                <Btn kind="line" small disabled={cooldown > 0 || busy} onClick={sendCode}>
                  {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                </Btn>
              </div>
              {busy && <p style={{ margin: 0, fontSize: 12.5, color: ADMIN.mute }}>Checking…</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- signed-in shell --------------------------------------------------------

function Shell({ session }) {
  const [tab, setTab] = React.useState('summary');
  const tabs = [
    ['summary', 'Summary'],
    ['resources', 'Resources'],
    ['crosswalk', 'Matching rules'],
  ];
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12,
                       borderBottom: `1px solid ${ADMIN.rule2}`, paddingBottom: 14 }}>
        <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, letterSpacing: -0.3 }}>
          GrowthLens
        </span>
        <span style={{ fontFamily: LABEL, fontSize: 10.5, fontWeight: 700, color: ADMIN.blue,
                       textTransform: 'uppercase', letterSpacing: 1.2,
                       background: 'rgba(0, 61, 165, 0.08)', padding: '2px 8px',
                       borderRadius: 4 }}>Admin</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: ADMIN.mute }}>{session.user.email}</span>
        <Btn kind="ghost" small onClick={() => sb.auth.signOut()}>Sign out</Btn>
      </header>
      <nav style={{ display: 'flex', gap: 4, margin: '14px 0 22px' }}>
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '8px 14px',
                     fontFamily: FONT, fontSize: 13.5, fontWeight: tab === k ? 800 : 600,
                     color: tab === k ? ADMIN.blue : ADMIN.ink2,
                     borderBottom: tab === k ? `2px solid ${ADMIN.blue}` : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'summary' && <SummaryView />}
      {tab !== 'summary' && <PublishBar />}
      {tab === 'resources' && <EditorTab table="resources" />}
      {tab === 'crosswalk' && <EditorTab table="resource_crosswalk" />}
    </div>
  );
}

// ---- telemetry summary ------------------------------------------------------

// Page past PostgREST's 1000-row cap; volume is tiny (hundreds/week).
async function fetchAllEvents(sinceIso) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from('events')
      .select('district_id,device_id,session_id,event,props,created_at')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: '#fff', borderRadius: 10,
                  border: `1px solid ${ADMIN.rule2}`, padding: '14px 16px' }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 600, color: ADMIN.ink,
                    marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Spark({ weekly }) {
  if (!weekly.length) return null;
  const max = Math.max(...weekly.map((w) => w.count));
  const bw = 12, gap = 4, h = 64;
  const width = weekly.length * (bw + gap);
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${ADMIN.rule2}`,
                  padding: '14px 16px' }}>
      <Eyebrow>Events by week</Eyebrow>
      <svg width={width} height={h + 18} style={{ marginTop: 8, maxWidth: '100%' }}
           role="img" aria-label="Weekly event counts">
        {weekly.map((w, i) => {
          const bh = Math.max(2, Math.round((w.count / max) * h));
          return <rect key={w.week} x={i * (bw + gap)} y={h - bh} width={bw} height={bh}
                       fill={ADMIN.blue} rx={2}><title>{`${w.week}: ${w.count}`}</title></rect>;
        })}
        <text x={0} y={h + 14} fontSize={9.5} fontFamily={LABEL} fill={ADMIN.mute}>
          {weekly[0].week}</text>
        <text x={width} y={h + 14} fontSize={9.5} fontFamily={LABEL} fill={ADMIN.mute}
              textAnchor="end">{weekly[weekly.length - 1].week}</text>
      </svg>
    </div>
  );
}

function MiniTable({ title, cols, rows }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${ADMIN.rule2}`,
                  padding: '14px 16px', overflowX: 'auto' }}>
      <Eyebrow>{title}</Eyebrow>
      {rows.length === 0
        ? <div style={{ fontSize: 12.5, color: ADMIN.mute, marginTop: 8 }}>None in this window.</div>
        : (
          <table style={{ borderCollapse: 'collapse', marginTop: 8, width: '100%' }}>
            <thead><tr>
              {cols.map((c) => <th key={c} style={{ textAlign: 'left', fontFamily: LABEL,
                fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase',
                color: ADMIN.mute, padding: '4px 14px 4px 0' }}>{c}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${ADMIN.rule2}` }}>
                  {r.map((v, j) => <td key={j} style={{ fontSize: 13, color: ADMIN.ink2,
                    padding: '6px 14px 6px 0', fontFamily: j === 0 ? FONT : MONO,
                    whiteSpace: 'nowrap' }}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

const day10 = (iso) => String(iso || '').slice(0, 10);

function SummaryView() {
  const [win, setWin] = React.useState('30');
  const [summary, setSummary] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async (w) => {
    setBusy(true); setErr(null);
    try {
      const sinceIso = w === 'all' ? null
        : new Date(Date.now() - Number(w) * 864e5).toISOString();
      const rows = await fetchAllEvents(sinceIso);
      setSummary(window.GLAdminData.summarize(rows));
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  }, []);
  React.useEffect(() => { load(win); }, [win, load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setWin(k)}
            style={{ border: `1px solid ${win === k ? ADMIN.blue : ADMIN.rule}`,
                     background: win === k ? 'rgba(0, 61, 165, 0.08)' : '#fff',
                     color: win === k ? ADMIN.blue : ADMIN.ink2, cursor: 'pointer',
                     fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
                     padding: '6px 12px', borderRadius: 999 }}>{label}</button>
        ))}
        {busy && <span style={{ fontSize: 12.5, color: ADMIN.mute }}>Loading…</span>}
      </div>
      {err && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ErrLine>Couldn’t load events: {err}</ErrLine>
          <Btn kind="line" small onClick={() => load(win)}>Retry</Btn>
        </div>
      )}
      {summary && summary.events === 0 && !busy && (
        <div style={{ color: ADMIN.mute, fontSize: 13.5 }}>No events in this window.</div>
      )}
      {summary && summary.events > 0 && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <StatCard label="Districts seen" value={summary.districts} />
            <StatCard label="Devices" value={summary.devices} />
            <StatCard label="Sessions" value={summary.sessions} />
            <StatCard label="Events" value={summary.events} />
          </div>
          <Spark weekly={summary.weekly} />
          <div style={{ display: 'grid', gap: 14,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <MiniTable title="Top pages" cols={['Page', 'Views']}
              rows={summary.topPages.map((p) => [p.page, p.count])} />
            <MiniTable title="Upload errors" cols={['Code', 'Count']}
              rows={summary.uploadErrors.map((e) => [e.code, e.count])} />
          </div>
          <MiniTable title="Districts"
            cols={['District', 'First seen', 'Last seen', 'Sessions', 'Devices', 'Events']}
            rows={summary.perDistrict.map((d) => [d.district, day10(d.firstSeen),
              day10(d.lastSeen), d.sessions, d.devices, d.events])} />
        </>
      )}
    </div>
  );
}
// ---- resource workbench editor ----------------------------------------------

const TABLE_META = {
  resources: {
    columns: RESOURCE_COLUMNS,
    listCols: ['resource_id', 'title', 'population', 'url'],
    keyOf: (r) => r.resource_id,
    matchKey: 'resource_id',
    label: 'resource',
  },
  resource_crosswalk: {
    columns: CROSSWALK_COLUMNS,
    listCols: ['finding_type', 'subgroup', 'subject', 'grade_band', 'resource_id', 'match_strength'],
    keyOf: (r) => r.id,
    matchKey: 'id',
    label: 'matching rule',
  },
};

// PublishBar and the editor tabs are siblings; a window event keeps the badge
// honest after every save without threading state through Shell.
const workbenchChanged = () => window.dispatchEvent(new Event('gl-workbench-changed'));

function PublishBar() {
  const [dirty, setDirty] = React.useState(null); // null=checking, bool=known
  const [msg, setMsg] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const check = React.useCallback(async () => {
    setDirty(null);
    try {
      const [res, xw, resCsv, xwCsv] = await Promise.all([
        sb.from('resources').select('*').order('position'),
        sb.from('resource_crosswalk').select('*').order('position'),
        fetch('reference/evidence_resources.csv', { cache: 'no-store' }).then((r) => r.text()),
        fetch('reference/evidence_crosswalk.csv', { cache: 'no-store' }).then((r) => r.text()),
      ]);
      if (res.error || xw.error) throw (res.error || xw.error);
      setDirty(
        window.GLAdminData.diffPublished(RESOURCE_COLUMNS, res.data, resCsv) ||
        window.GLAdminData.diffPublished(CROSSWALK_COLUMNS, xw.data, xwCsv),
      );
    } catch { setDirty(false); }
  }, []);
  React.useEffect(() => {
    check();
    window.addEventListener('gl-workbench-changed', check);
    return () => window.removeEventListener('gl-workbench-changed', check);
  }, [check]);

  const publish = async () => {
    setBusy(true); setMsg(null); setErr(null);
    const { error } = await sb.functions.invoke('publish');
    setBusy(false);
    if (error) { setErr(error.message || 'Publish failed'); return; }
    setMsg('Publish started — the site updates when the workflow lands.');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                  background: '#fff', border: `1px solid ${ADMIN.rule2}`, borderRadius: 10,
                  padding: '10px 14px', flexWrap: 'wrap' }}>
      {dirty === null && <span style={{ fontSize: 12.5, color: ADMIN.mute }}>Checking…</span>}
      {dirty === true && (
        <span style={{ fontFamily: LABEL, fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                       textTransform: 'uppercase', color: ADMIN.amber,
                       background: ADMIN.amberBg, padding: '3px 10px', borderRadius: 999 }}>
          Unpublished changes
        </span>
      )}
      {dirty === false && (
        <span style={{ fontSize: 12.5, color: ADMIN.mute }}>Everything published</span>
      )}
      <span style={{ flex: 1 }} />
      {msg && <span style={{ fontSize: 12.5, color: ADMIN.ink2 }}>{msg}{' '}
        <a href="https://github.com/PRiME-2019/growthlens/actions/workflows/publish-resources.yml"
           target="_blank" rel="noopener noreferrer"
           style={{ color: ADMIN.blue, fontWeight: 600 }}>View workflow ↗</a></span>}
      <ErrLine>{err}</ErrLine>
      <Btn onClick={publish} disabled={busy} small>{busy ? 'Publishing…' : 'Publish to site'}</Btn>
    </div>
  );
}

function Field({ name, value, onChange, textarea, options, datalist }) {
  const shared = { width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    fontSize: 13.5, color: ADMIN.ink, border: `1.5px solid ${ADMIN.rule}`, borderRadius: 7,
    fontFamily: FONT };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: LABEL,
                    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', color: ADMIN.mute }}>
      {name}
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={shared}>
          <option value="">— choose —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value} rows={3} onChange={(e) => onChange(e.target.value)}
                  style={{ ...shared, resize: 'vertical' }} />
      ) : (
        <>
          <input value={value} list={datalist ? `${name}-dl` : undefined}
                 onChange={(e) => onChange(e.target.value)} style={shared} />
          {datalist && (
            <datalist id={`${name}-dl`}>
              {datalist.map((d) => <option key={d} value={d} />)}
            </datalist>
          )}
        </>
      )}
    </label>
  );
}

function EditorTab({ table }) {
  const meta = TABLE_META[table];
  const [rows, setRows] = React.useState(null);
  const [resourceIds, setResourceIds] = React.useState([]);
  const [editing, setEditing] = React.useState(null); // { row, isNew }
  const [formErrs, setFormErrs] = React.useState([]);
  const [err, setErr] = React.useState(null);

  const load = React.useCallback(async () => {
    setErr(null);
    const { data, error } = await sb.from(table).select('*').order('position');
    if (error) { setErr(error.message); return; }
    setRows(data);
    if (table === 'resource_crosswalk') {
      const r = await sb.from('resources').select('resource_id').order('position');
      if (!r.error) setResourceIds(r.data.map((x) => x.resource_id));
    }
  }, [table]);
  React.useEffect(() => { load(); }, [load]);

  const write = async (fn) => {
    setErr(null);
    const error = await fn();
    if (error) { setErr(error.message); return false; }
    await load();
    workbenchChanged();
    return true;
  };

  // UNIQUE(position) forbids a naive swap — park A at -1 first.
  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const A = rows[i], B = rows[j];
    const kA = meta.keyOf(A), kB = meta.keyOf(B);
    await write(async () => {
      let r = await sb.from(table).update({ position: -1 }).eq(meta.matchKey, kA);
      if (r.error) return r.error;
      r = await sb.from(table).update({ position: A.position }).eq(meta.matchKey, kB);
      if (r.error) return r.error;
      r = await sb.from(table).update({ position: B.position }).eq(meta.matchKey, kA);
      return r.error;
    });
  };

  const startEdit = (row) => { setEditing({ row: { ...row }, isNew: false, orig: meta.keyOf(row) }); setFormErrs([]); };
  const startAdd = () => {
    const blank = Object.fromEntries(meta.columns.map((c) => [c, '']));
    setEditing({ row: blank, isNew: true, orig: null }); setFormErrs([]);
  };
  const save = async () => {
    const r = editing.row;
    const errs = table === 'resources'
      ? window.GLAdminData.validateResource(r,
          rows.filter((x) => meta.keyOf(x) !== editing.orig).map((x) => x.resource_id))
      : window.GLAdminData.validateCrosswalk(r, resourceIds);
    setFormErrs(errs);
    if (errs.length) return;
    const payload = Object.fromEntries(meta.columns.map((c) => [c, String(r[c] ?? '').trim()]));
    payload.updated_at = new Date().toISOString();
    const ok = await write(async () => {
      if (editing.isNew) {
        payload.position = rows.length ? Math.max(...rows.map((x) => x.position)) + 1 : 1;
        const res = await sb.from(table).insert(payload);
        return res.error;
      }
      const res = await sb.from(table).update(payload).eq(meta.matchKey, editing.orig);
      return res.error;
    });
    if (ok) setEditing(null);
  };
  const remove = async () => {
    if (!window.confirm(`Delete this ${meta.label}? This cannot be undone here.`)) return;
    const ok = await write(async () => {
      const res = await sb.from(table).delete().eq(meta.matchKey, editing.orig);
      return res.error;
    });
    if (ok) setEditing(null);
  };

  if (err && !rows) return <ErrLine>Couldn’t load: {err}</ErrLine>;
  if (!rows) return <div style={{ color: ADMIN.mute, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErrLine>{err}</ErrLine>
      {editing ? (
        <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${ADMIN.rule2}`,
                      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Eyebrow>{editing.isNew ? `New ${meta.label}` : `Edit ${meta.label}`}</Eyebrow>
          <div style={{ display: 'grid', gap: 12,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {meta.columns.map((c) => (
              <div key={c} style={{ gridColumn: (c === 'notes' || c === 'rationale' || c === 'title') ? '1 / -1' : undefined }}>
                <Field name={c}
                  value={String(editing.row[c] ?? '')}
                  onChange={(v) => setEditing((e) => ({ ...e, row: { ...e.row, [c]: v } }))}
                  textarea={c === 'notes' || c === 'rationale'}
                  options={table === 'resource_crosswalk' && c === 'resource_id' ? resourceIds : null}
                  datalist={c === 'match_strength' ? ['direct', 'adjacent'] : null} />
              </div>
            ))}
          </div>
          {formErrs.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {formErrs.map((e, i) => <li key={i}><ErrLine>{e}</ErrLine></li>)}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={save}>Save</Btn>
            <Btn kind="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <span style={{ flex: 1 }} />
            {!editing.isNew && <Btn kind="danger" onClick={remove}>Delete</Btn>}
          </div>
        </div>
      ) : (
        <div>
          <Btn small onClick={startAdd}>Add {meta.label}</Btn>
        </div>
      )}
      <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${ADMIN.rule2}`,
                    padding: '6px 14px 10px', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>
            <th style={{ width: 52 }} />
            {meta.listCols.map((c) => <th key={c} style={{ textAlign: 'left', fontFamily: LABEL,
              fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: ADMIN.mute,
              padding: '8px 14px 4px 0' }}>{c}</th>)}
            <th />
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={meta.keyOf(r)} style={{ borderTop: `1px solid ${ADMIN.rule2}` }}>
                <td style={{ whiteSpace: 'nowrap', padding: '4px 6px 4px 0' }}>
                  <button type="button" aria-label={`Move row ${i + 1} up`} disabled={i === 0}
                    onClick={() => move(i, -1)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer',
                             color: i === 0 ? ADMIN.rule : ADMIN.mute, fontSize: 13 }}>▲</button>
                  <button type="button" aria-label={`Move row ${i + 1} down`} disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer',
                             color: i === rows.length - 1 ? ADMIN.rule : ADMIN.mute, fontSize: 13 }}>▼</button>
                </td>
                {meta.listCols.map((c) => (
                  <td key={c} style={{ fontSize: 13, color: ADMIN.ink2, padding: '7px 14px 7px 0',
                                       maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis',
                                       whiteSpace: 'nowrap' }}>{String(r[c] ?? '')}</td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <Btn kind="line" small onClick={() => startEdit(r)}>Edit</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- gate -------------------------------------------------------------------

function AdminApp() {
  const [session, setSession] = React.useState(undefined);
  React.useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) {
    return <div style={{ display: 'flex', height: '100%', alignItems: 'center',
      justifyContent: 'center', color: ADMIN.mute, fontSize: 14 }}>Checking session…</div>;
  }
  return session ? <Shell session={session} /> : <LoginCard />;
}

window.AdminApp = AdminApp;
