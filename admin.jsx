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
  const set = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete(clean);
  };
  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1].focus();
  };
  const handleChange = (i, e) => {
    const d = e.target.value.replace(/\D/g, '');
    if (!d) { set(value.slice(0, i)); return; }
    const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, 6);
    set(next);
    const focusAt = Math.min(i + d.length, 5);
    if (refs.current[focusAt]) refs.current[focusAt].focus();
  };
  const handlePaste = (e) => {
    e.preventDefault();
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    set(digits);
    const at = Math.min(digits.length, 5);
    if (refs.current[at]) refs.current[at].focus();
  };
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }} onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric" autoComplete="one-time-code" maxLength={2}
          aria-label={`Digit ${i + 1}`}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          style={{ width: 42, height: 52, textAlign: 'center', fontFamily: MONO,
                   fontSize: 22, fontWeight: 600, color: ADMIN.ink,
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
      <div style={{ width: 'min(400px, 100%)', background: '#fff', borderRadius: 12,
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
                We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in an hour.
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

// Placeholders — replaced by Tasks 4 and 5.
function SummaryView() { return <div style={{ color: ADMIN.mute }}>Summary coming in Task 4</div>; }
function PublishBar() { return null; }
function EditorTab() { return <div style={{ color: ADMIN.mute }}>Editor coming in Task 5</div>; }

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
