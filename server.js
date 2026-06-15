require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const path       = require('path');
const Database   = require('better-sqlite3');
const Anthropic  = require('@anthropic-ai/sdk');
const bcrypt     = require('bcryptjs');

// ── Database ───────────────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, 'data');
require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'coach.db'));

// ── Schema ─────────────────────────────────────────────────────────────────────
// Base tables — safe to re-run, CREATE TABLE IF NOT EXISTS is idempotent.

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id                   INTEGER PRIMARY KEY,
    name                 TEXT,
    date                 TEXT,
    distance             REAL,
    elapsed_time         INTEGER,
    average_speed        REAL,
    average_heartrate    REAL,
    average_cadence      REAL,
    average_watts        REAL,
    total_elevation_gain REAL,
    sport_type           TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS workout_sessions (
    date       TEXT PRIMARY KEY,
    option_a   TEXT,
    option_b   TEXT,
    option_c   TEXT,
    selected   TEXT,
    created_at TEXT
  );
`);

// ── Migrations ─────────────────────────────────────────────────────────────────
// ALTER TABLE fails if the column already exists — the catch is intentional.
// Add new columns here; do not remove or reorder existing entries.

try { db.exec('ALTER TABLE runs ADD COLUMN workout_type TEXT'); } catch (_) {}                          // added: workout type tag from prescribed session
try { db.exec('ALTER TABLE workout_sessions ADD COLUMN recommended TEXT'); } catch (_) {}              // added: track which option Claude recommended
try { db.exec('ALTER TABLE workout_sessions ADD COLUMN input_tokens INTEGER'); } catch (_) {}          // added: token usage tracking
try { db.exec('ALTER TABLE workout_sessions ADD COLUMN output_tokens INTEGER'); } catch (_) {}         // added: token usage tracking
try { db.exec('ALTER TABLE workout_sessions ADD COLUMN result TEXT'); } catch (_) {}                   // added: hit/partial/missed workout result
try { db.exec('ALTER TABLE workout_sessions ADD COLUMN result_notes TEXT'); } catch (_) {}             // added: optional notes on result

function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── Personal record targets ────────────────────────────────────────────────────
// label is shown in the UI and coaching prompt.
// low/high are used for fallback calculation from whole-run distances.

const PR_TARGETS = [
  { key: 'pr_400m',     dist: 400,   label: '400m',         low: 380,   high: 430   },
  { key: 'pr_half_mi',  dist: 805,   label: '½ Mile',       low: 780,   high: 850   },
  { key: 'pr_1k',       dist: 1000,  label: '1K',           low: 950,   high: 1100  },
  { key: 'pr_1mile',    dist: 1609,  label: '1 Mile',       low: 1500,  high: 1800  },
  { key: 'pr_2mile',    dist: 3219,  label: '2 Mile',       low: 3000,  high: 3500  },
  { key: 'pr_5k',       dist: 5000,  label: '5K',           low: 4800,  high: 5500  },
  { key: 'pr_10k',      dist: 10000, label: '10K',          low: 9500,  high: 11000 },
  { key: 'pr_15k',      dist: 15000, label: '15K',          low: 14000, high: 16000 },
  { key: 'pr_10mile',   dist: 16093, label: '10 Mile',      low: 15500, high: 17000 },
  { key: 'pr_20k',      dist: 20000, label: '20K',          low: 19000, high: 21000 },
  { key: 'pr_half',     dist: 21097, label: 'Half Marathon', low: 20000, high: 22500 },
  { key: 'pr_marathon', dist: 42195, label: 'Marathon',     low: 41000, high: 43500 },
];

// ── Coaching system prompt ─────────────────────────────────────────────────────

const COACHING_PROMPT = `You are an experienced running coach who adapts to each athlete's goals — whether that's building a base, getting faster, training for a race, or simply running consistently. You follow the 80/20 polarized training method: approximately 80% of training at low intensity (easy, conversational pace, Zone 1-2) and 20% at high intensity (Zone 4-5), avoiding the gray zone in between. Always give precise, concrete targets based on the athlete's recent performance data and stated goal. If a goal is provided, let it shape the type and specificity of the workouts you prescribe.`;


// ── Express setup ──────────────────────────────────────────────────────────────

// ── Session secret ─────────────────────────────────────────────────────────────
// Auto-generate on first run and persist in DB so restarts don't invalidate sessions.

let sessionSecret = getSetting('session_secret');
if (!sessionSecret) {
  sessionSecret = require('crypto').randomBytes(32).toString('hex');
  setSetting('session_secret', sessionSecret);
}

const app = express();
app.set('trust proxy', 1); // trust first proxy (nginx, Caddy, NPM, etc.)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new SqliteStore({ client: db }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto', // automatically use secure cookies over HTTPS, plain over HTTP
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Auth ───────────────────────────────────────────────────────────────────────

// Simple in-memory rate limiting for login attempts
const loginAttempts = new Map(); // ip → { count, resetAt }
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_LOGIN_ATTEMPTS) return false;
  rec.count++;
  return true;
}

function authPageHTML({ title, subtitle, fields, action, buttonText, error }) {
  const errorMessages = {
    invalid:   'Incorrect username or password.',
    rate:      'Too many attempts. Try again in 15 minutes.',
    missing:   'Username and password are required.',
    short:     'Password must be at least 8 characters.',
    mismatch:  'Passwords do not match.',
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Running Coach — ${title}</title>
  <link rel="icon" type="image/png" href="/icon.png" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d; color: #e8e8e8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .card {
      background: #161616; border: 1px solid #2a2a2a; border-radius: 14px;
      padding: 2.5rem 2rem; width: 100%; max-width: 340px;
    }
    h1 { font-size: 1.3rem; font-weight: 700; margin-bottom: 0.25rem; }
    p.sub { color: #888; font-size: 0.85rem; margin-bottom: 1.75rem; }
    .field { margin-bottom: 1rem; }
    label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #888; margin-bottom: 0.4rem; }
    input {
      width: 100%; background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 8px;
      color: #e8e8e8; font-size: 0.95rem; padding: 0.65rem 0.875rem;
      outline: none; transition: border-color 0.15s;
    }
    input:focus { border-color: #60a5fa; }
    button {
      margin-top: 0.5rem; width: 100%; background: #60a5fa; color: #000;
      border: none; border-radius: 8px; padding: 0.7rem; font-size: 0.95rem;
      font-weight: 600; cursor: pointer; transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .error { color: #f87171; font-size: 0.82rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Running Coach</h1>
    <p class="sub">${subtitle}</p>
    <form method="POST" action="${action}">
      ${fields.map(f => `
      <div class="field">
        <label for="${f.id}">${f.label}</label>
        <input id="${f.id}" name="${f.name}" type="${f.type}" autocomplete="${f.autocomplete || 'off'}"${f.autofocus ? ' autofocus' : ''} />
      </div>`).join('')}
      <button type="submit">${buttonText}</button>
      ${error && errorMessages[error] ? `<p class="error">${errorMessages[error]}</p>` : ''}
    </form>
  </div>
</body>
</html>`;
}

function requireAuth(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  if (!getSetting('auth_password_hash')) return res.redirect('/setup');
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// First-run setup — only accessible before credentials are created
app.get('/setup', (req, res) => {
  if (getSetting('auth_password_hash')) return res.redirect('/login');
  res.send(authPageHTML({
    title:      'Setup',
    subtitle:   'Create your account to get started.',
    action:     '/setup',
    buttonText: 'Create account',
    error:      req.query.error,
    fields: [
      { id: 'username', name: 'username', label: 'Username', type: 'text',     autocomplete: 'username',     autofocus: true },
      { id: 'password', name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password' },
      { id: 'confirm',  name: 'confirm',  label: 'Confirm password', type: 'password', autocomplete: 'new-password' },
    ],
  }));
});

app.post('/setup', async (req, res) => {
  if (getSetting('auth_password_hash')) return res.status(403).send('Already set up.');
  const { username, password, confirm } = req.body;
  if (!username || !password)      return res.redirect('/setup?error=missing');
  if (password.length < 8)         return res.redirect('/setup?error=short');
  if (password !== confirm)        return res.redirect('/setup?error=mismatch');
  const hash = await bcrypt.hash(password, 12);
  setSetting('auth_username',      username.trim());
  setSetting('auth_password_hash', hash);
  req.session.authenticated = true;
  res.redirect('/');
});

app.get('/login', (req, res) => {
  if (!getSetting('auth_password_hash')) return res.redirect('/setup');
  if (req.session.authenticated) return res.redirect('/');
  res.send(authPageHTML({
    title:      'Login',
    subtitle:   'Sign in to continue.',
    action:     '/login',
    buttonText: 'Sign in',
    error:      req.query.error,
    fields: [
      { id: 'username', name: 'username', label: 'Username', type: 'text',     autocomplete: 'username',          autofocus: true },
      { id: 'password', name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' },
    ],
  }));
});

app.post('/login', async (req, res) => {
  if (!checkRateLimit(req.ip)) return res.redirect('/login?error=rate');
  const { username, password } = req.body;
  const storedUsername = getSetting('auth_username', '');
  const storedHash     = getSetting('auth_password_hash', '');
  // Always run bcrypt.compare to avoid timing-based username enumeration
  const passwordMatch = storedHash ? await bcrypt.compare(password || '', storedHash) : false;
  if (username === storedUsername && passwordMatch) {
    loginAttempts.delete(req.ip);
    req.session.authenticated = true;
    return res.redirect('/');
  }
  res.redirect('/login?error=invalid');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/icon.png', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'icon.png')));

app.use(requireAuth);

// ── Onboarding (post-login setup wizard) ──────────────────────────────────────

function isConfigured() {
  return !!getSetting('anthropic_api_key');
}

function requireConfigured(req, res, next) {
  const exempt = ['/onboarding'];
  if (exempt.some(p => req.path.startsWith(p))) return next();
  if (req.path.startsWith('/api/onboarding')) return next();
  if (!isConfigured()) return res.redirect('/onboarding');
  next();
}

app.use(requireConfigured);

function onboardingPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Running Coach — Setup</title>
  <link rel="icon" type="image/png" href="/icon.png" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d; color: #e8e8e8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem 1rem;
    }
    .card {
      background: #161616; border: 1px solid #2a2a2a; border-radius: 14px;
      padding: 2.5rem 2rem; width: 100%; max-width: 480px;
    }
    .logo { font-size: 1.3rem; font-weight: 700; margin-bottom: 0.25rem; }
    .sub  { color: #888; font-size: 0.85rem; margin-bottom: 2rem; }
    h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.35rem; }
    .section-sub { color: #888; font-size: 0.82rem; margin-bottom: 1.25rem; line-height: 1.5; }
    .instructions {
      background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
      padding: 1rem 1.1rem; margin-bottom: 1.25rem; font-size: 0.82rem;
      color: #aaa; line-height: 1.75;
    }
    .instructions ol { padding-left: 1.25rem; }
    .instructions li { margin-bottom: 0.25rem; }
    .instructions a { color: #60a5fa; text-decoration: none; }
    .instructions a:hover { text-decoration: underline; }
    .field { margin-bottom: 1rem; }
    label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #888; margin-bottom: 0.4rem; }
    input {
      width: 100%; background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 8px;
      color: #e8e8e8; font-size: 0.95rem; padding: 0.65rem 0.875rem;
      outline: none; transition: border-color 0.15s; font-family: monospace;
    }
    input:focus { border-color: #60a5fa; }
    .btn {
      width: 100%; background: #60a5fa; color: #000;
      border: none; border-radius: 8px; padding: 0.7rem; font-size: 0.95rem;
      font-weight: 600; cursor: pointer; transition: opacity 0.15s; margin-top: 0.25rem;
    }
    .btn:hover:not(:disabled) { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .error   { color: #f87171; font-size: 0.82rem; margin-top: 0.75rem; }
    .hidden  { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Running Coach</div>
    <p class="sub">Let's get you set up.</p>

    <h2>Anthropic API Key</h2>
    <p class="section-sub">Used to generate workout recommendations with Claude.</p>
    <div class="instructions">
      <ol>
        <li>Go to <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a></li>
        <li>Sign in or create an account</li>
        <li>Navigate to <strong>API Keys</strong> and create a new key</li>
        <li>Paste it below</li>
      </ol>
    </div>
    <div class="field">
      <label for="anthropic-key">API Key</label>
      <input id="anthropic-key" type="password" placeholder="sk-ant-…" autocomplete="off" />
    </div>
    <button class="btn" id="anthropic-btn">Verify &amp; Continue</button>
    <p class="error hidden" id="anthropic-error"></p>
  </div>

  <script>
    document.getElementById('anthropic-btn').addEventListener('click', async () => {
      const btn = document.getElementById('anthropic-btn');
      const err = document.getElementById('anthropic-error');
      const key = document.getElementById('anthropic-key').value.trim();
      err.classList.add('hidden');
      if (!key) { err.textContent = 'Please enter your API key.'; err.classList.remove('hidden'); return; }
      btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const r = await fetch('/api/onboarding/anthropic', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Verification failed.');
        window.location.href = '/';
      } catch (e) {
        err.textContent = e.message; err.classList.remove('hidden');
        btn.disabled = false; btn.textContent = 'Verify & Continue';
      }
    });
  </script>
</body>
</html>`;
}

app.get('/onboarding', (req, res) => {
  if (isConfigured()) return res.redirect('/');
  res.send(onboardingPageHTML());
});

app.post('/api/onboarding/anthropic', async (req, res) => {
  const { key } = req.body;
  if (!key || !key.startsWith('sk-ant-')) return res.status(400).json({ error: 'That doesn\'t look like a valid Anthropic API key.' });
  try {
    // Lightweight validation — count tokens on a tiny message
    const client = new Anthropic({ apiKey: key });
    await client.messages.countTokens({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] });
    setSetting('anthropic_api_key', key);
    res.json({ ok: true });
  } catch (err) {
    res.status(401).json({ error: 'API key is invalid or has no access. Check and try again.' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

function getAnthropicClient() {
  return new Anthropic({ apiKey: getSetting('anthropic_api_key') });
}

function formatPRTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Compute PRs from the runs DB by finding the fastest run within each distance window.
function computePRs() {
  for (const { key, dist: meters, low, high } of PR_TARGETS) {
    const best = db.prepare(
      'SELECT elapsed_time, distance FROM runs WHERE distance >= ? AND distance <= ? ORDER BY elapsed_time / distance ASC LIMIT 1'
    ).get(low, high);
    if (best) {
      const scaled = Math.round(best.elapsed_time * (meters / best.distance));
      setSetting(key, String(scaled));
    }
  }
}

function getRunsFromDB() {
  return db.prepare('SELECT * FROM runs ORDER BY date DESC').all();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildRunSummary(runs, sessionMap = {}) {
  return runs.map(r => {
    const distMi = (r.distance / 1609.34).toFixed(2);
    const secsPerMile = 1609.34 / r.average_speed;
    const mins = Math.floor(secsPerMile / 60);
    const secs = Math.round(secsPerMile % 60);
    const pace = r.average_speed > 0
      ? `${mins}:${String(secs).padStart(2, '0')} min/mi`
      : 'N/A';
    const date = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const entry = sessionMap[r.date.slice(0, 10)];
    const resultLabel = entry?.result === 'hit'    ? 'hit targets'
                      : entry?.result === 'partial' ? 'hit some targets'
                      : entry?.result === 'missed'  ? 'missed targets'
                      : null;
    const resultStr = resultLabel
      ? `; result: ${resultLabel}${entry.result_notes ? `: ${entry.result_notes}` : ''}`
      : '';
    return (
      `- ${date}: ${distMi}mi, pace ${pace}` +
      `, HR ${r.average_heartrate ? Math.round(r.average_heartrate) + ' bpm' : 'N/A'}` +
      `, cadence ${r.average_cadence ? Math.round(r.average_cadence) + ' spm' : 'N/A'}` +
      `, power ${r.average_watts ? Math.round(r.average_watts) + 'W' : 'N/A'}` +
      `, elevation gain ${Math.round(r.total_elevation_gain || 0)}ft` +
      `, elapsed ${Math.floor(r.elapsed_time / 60)}m${r.elapsed_time % 60}s` +
      (entry ? `, workout: ${entry.type}${entry.target_pace && entry.target_pace !== 'N/A' ? ` at ${entry.target_pace}` : ''}${resultStr}` : '')
    );
  }).join('\n');
}

function buildPromptContent(runs, units = 'miles', notes = '', targetDate = null, clientToday = null, historyDays = 60) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - historyDays);
  runs = runs.filter(r => new Date(r.date) >= cutoff);

  const goal = getSetting('goal', '');

  // Build date → workout entry map from sessions with a selection
  const sessions = db.prepare('SELECT date, option_a, option_b, option_c, recommended, selected, result, result_notes FROM workout_sessions').all();
  const sessionMap = {};
  for (const s of sessions) {
    const key = s.selected || s.recommended;
    if (key && s[key]) {
      try {
        const w = JSON.parse(s[key]);
        sessionMap[s.date] = { type: w.type, target_pace: w.target_pace, result: s.result, result_notes: s.result_notes };
      } catch (_) {}
    }
  }

  const runSummary = runs.length ? buildRunSummary(runs, sessionMap) : '(no runs found)';
  const unitInstruction = units === 'miles'
    ? 'All distances and paces must be in miles and min/mi.'
    : 'All distances and paces must be in kilometers and min/km.';
  const crossTraining = getSetting('cross_training', '');
  const injuryNotes   = getSetting('injury_notes',   '');
  const raceDistance  = getSetting('race_distance',  '');
  const raceDate      = getSetting('race_date',      '');

  const prLines = PR_TARGETS
    .map(({ key, label }) => {
      const val = getSetting(key);
      return val ? `${label}: ${formatPRTime(parseInt(val))}` : null;
    })
    .filter(Boolean);

  const goalSection = goal
    ? `\n\n━━━ ATHLETE'S CURRENT GOAL ━━━\n${goal}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    : '';
  const crossTrainingSection = crossTraining
    ? `\n\n━━━ CROSS-TRAINING CONTEXT ━━━\n${crossTraining}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    : '';
  const raceSection = (raceDistance && raceDate)
    ? `\n\n━━━ UPCOMING RACE ━━━\n${raceDistance} on ${raceDate}\n━━━━━━━━━━━━━━━━━━━━━\n`
    : raceDistance
    ? `\n\n━━━ UPCOMING RACE ━━━\n${raceDistance} (date TBD)\n━━━━━━━━━━━━━━━━━━━━━\n`
    : '';
  const injurySection = injuryNotes
    ? `\n\n━━━ INJURY / HEALTH NOTES ━━━\n${injuryNotes}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    : '';
  const prSection = prLines.length
    ? `\n\n━━━ PERSONAL RECORDS ━━━\n${prLines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━\n`
    : '';
  const sorenessSection = notes && notes.trim()
    ? `\n\nAthlete note: ${notes.trim()}`
    : '';
  const today = clientToday || localDateStr();
  const workoutDate = targetDate || today;
  const workoutDateFormatted = new Date(workoutDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const daysAhead = targetDate && targetDate > today
    ? Math.round((new Date(targetDate) - new Date(today)) / 86400000)
    : 0;
  const futureDateSection = daysAhead > 0
    ? `\n\nNote: This workout is being planned ${daysAhead} day${daysAhead > 1 ? 's' : ''} in advance (for ${targetDate}). The athlete will have had time to recover from any recent fatigue — do not recommend rest based solely on recent training load.`
    : '';

  return (
    `You are generating this workout for ${workoutDateFormatted}.\n\nHere are my recent runs:\n${runSummary}${goalSection}${raceSection}${crossTrainingSection}${injurySection}${prSection}${sorenessSection}${futureDateSection}\n\n` +
    `${unitInstruction} ` +
    `Based on this training history, generate one recommended option for the athlete's next session, plus two alternatives. ` +
    `Alternatives can differ in intensity, duration, or type — choose what would genuinely serve the athlete best. ` +
    `For each workout provide specific, concrete targets — exact paces, distances, rep structures, rest intervals. Be precise, not vague. ` +
    `Structure steps based on what the workout actually requires — not every workout needs multiple phases.\n\n` +
    `Respond ONLY with valid JSON in exactly this format:\n` +
    `{\n` +
    `  "recommended": "option_a",\n` +
    `  "option_a": { "type": "string", "structure": ["step 1", "step 2", "...one string per distinct phase or segment"], "target_pace": "string", "rationale": "2 sentences max" },\n` +
    `  "option_b": { "type": "string", "structure": ["step 1", "step 2", "...one string per distinct phase or segment"], "target_pace": "string", "rationale": "2 sentences max" },\n` +
    `  "option_c": { "type": "string", "structure": ["step 1", "step 2", "...one string per distinct phase or segment"], "target_pace": "string", "rationale": "2 sentences max" }\n` +
    `}`
  );
}

// ── Settings API ───────────────────────────────────────────────────────────────

app.get('/api/me', (_req, res) => {
  res.json({ username: getSetting('auth_username', '') });
});

app.get('/api/settings', (_req, res) => {
  const raceDate = getSetting('race_date', '');
  if (raceDate && new Date(raceDate + 'T23:59:59') < new Date()) {
    setSetting('race_date', '');
    setSetting('race_distance', '');
    console.log('[settings] Race target cleared — date has passed');
  }
  const INTERNAL_KEYS = ['last_synced_at'];
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => { if (!INTERNAL_KEYS.includes(r.key)) s[r.key] = r.value; });
  res.json(s);
});

app.get('/api/prs', (_req, res) => {
  const prs = {};
  const dates = {};
  for (const { key, dist, low, high } of PR_TARGETS) {
    const run = db.prepare(
      'SELECT elapsed_time, distance, date FROM runs WHERE distance >= ? AND distance <= ? ORDER BY elapsed_time / distance ASC LIMIT 1'
    ).get(low, high);
    if (run) {
      prs[key] = Math.round(run.elapsed_time * (dist / run.distance));
      dates[key] = run.date.slice(0, 10);
    }
  }
  res.json({ prs, dates, source: 'runs-db' });
});

app.post('/api/settings', (req, res) => {
  const ALLOWED = ['goal', 'cross_training', 'injury_notes', 'race_distance', 'race_date', 'anthropic_api_key'];
  const { key, value } = req.body;
  if (!ALLOWED.includes(key)) return res.status(400).json({ error: 'Invalid setting key' });
  setSetting(key, value);
  res.json({ ok: true });
});

app.post('/api/change-password', async (req, res) => {
  const { current, next } = req.body;
  const storedHash = getSetting('auth_password_hash', '');
  const match = storedHash ? await bcrypt.compare(current || '', storedHash) : false;
  if (!match) return res.status(401).json({ error: 'Current password incorrect' });
  if (!next || next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  setSetting('auth_password_hash', await bcrypt.hash(next, 12));
  res.json({ ok: true });
});

// ── Activities API ─────────────────────────────────────────────────────────────

app.get('/api/activities', (_req, res) => {
  try {
    res.json(getRunsFromDB());
  } catch (err) {
    console.error('[/api/activities]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Manual run entry ───────────────────────────────────────────────────────────

function readRunBody(body) {
  const {
    name, date, distance, elapsed_time,
    average_heartrate, average_cadence, average_watts,
    total_elevation_gain, sport_type, workout_type,
  } = body || {};

  if (!date)                                  throw new Error('Date is required.');
  if (!(distance > 0))                        throw new Error('Distance must be greater than zero.');
  if (!(elapsed_time > 0))                    throw new Error('Duration must be greater than zero.');

  return {
    name:                 name || 'Run',
    // Store a local-time datetime (matching the historical Strava `start_date_local`
    // format) so `new Date(run.date)` parses as local time instead of UTC midnight.
    date:                 date.length === 10 ? `${date}T12:00:00` : date,
    distance:             Number(distance),
    elapsed_time:         Math.round(Number(elapsed_time)),
    average_speed:        Number(distance) / Number(elapsed_time),
    average_heartrate:    average_heartrate    ? Number(average_heartrate)    : null,
    average_cadence:      average_cadence      ? Number(average_cadence)      : null,
    average_watts:        average_watts        ? Number(average_watts)        : null,
    total_elevation_gain: total_elevation_gain ? Number(total_elevation_gain) : 0,
    sport_type:           sport_type || 'Run',
    workout_type:         workout_type || null,
  };
}

app.post('/api/runs', (req, res) => {
  try {
    const r = readRunBody(req.body);
    const result = db.prepare(`
      INSERT INTO runs
        (name, date, distance, elapsed_time, average_speed,
         average_heartrate, average_cadence, average_watts, total_elevation_gain, sport_type, workout_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.name, r.date, r.distance, r.elapsed_time, r.average_speed,
      r.average_heartrate, r.average_cadence, r.average_watts, r.total_elevation_gain, r.sport_type, r.workout_type
    );
    computePRs();
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/runs/:id', (req, res) => {
  try {
    const r = readRunBody(req.body);
    const result = db.prepare(`
      UPDATE runs SET
        name = ?, date = ?, distance = ?, elapsed_time = ?, average_speed = ?,
        average_heartrate = ?, average_cadence = ?, average_watts = ?, total_elevation_gain = ?, sport_type = ?, workout_type = ?
      WHERE id = ?
    `).run(
      r.name, r.date, r.distance, r.elapsed_time, r.average_speed,
      r.average_heartrate, r.average_cadence, r.average_watts, r.total_elevation_gain, r.sport_type, r.workout_type,
      req.params.id
    );
    if (result.changes === 0) return res.status(404).json({ error: 'No run with that id' });
    computePRs();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/runs/:id', (req, res) => {
  const result = db.prepare('DELETE FROM runs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'No run with that id' });
  computePRs();
  res.json({ ok: true });
});

// ── Cost estimate ──────────────────────────────────────────────────────────────

app.post('/api/cost-estimate', async (req, res) => {
  try {
    const runs = getRunsFromDB();
    const { units = 'miles', notes = '', date, today, history_days } = req.body || {};
    const promptContent = buildPromptContent(runs, units, notes, date || localDateStr(), today || null, history_days || 60);
    const { input_tokens } = await getAnthropicClient().messages.countTokens({
      model: 'claude-sonnet-4-6',
      system: COACHING_PROMPT,
      messages: [{ role: 'user', content: promptContent }],
    });
    const estimatedOutput = 400;
    const cost = (input_tokens / 1_000_000) * 3 + (estimatedOutput / 1_000_000) * 15;
    res.json({ input_tokens, estimated_output_tokens: estimatedOutput, cost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prompt preview ─────────────────────────────────────────────────────────────

app.post('/api/prompt-preview', async (req, res) => {
  try {
    const allRuns = getRunsFromDB();
    const { units = 'miles', notes = '', date, today, history_days } = req.body || {};
    const days = history_days || 60;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const runs = allRuns.filter(r => new Date(r.date) >= cutoff);
    const systemPrompt = COACHING_PROMPT;
    const userContent = buildPromptContent(runs, units, notes, date || localDateStr(), today || null, days);
    const oldest = runs.length ? runs[runs.length - 1].date.slice(0, 10) : null;
    const newest = runs.length ? runs[0].date.slice(0, 10) : null;
    const daysSinceLastRun = newest
      ? Math.round((new Date() - new Date(newest + 'T12:00:00')) / 86400000)
      : null;
    const lastSession = db.prepare(
      `SELECT date, selected, recommended, option_a, option_b, option_c
       FROM workout_sessions ORDER BY date DESC LIMIT 1`
    ).get();
    let lastPrescribed = null;
    if (lastSession) {
      const key = lastSession.selected || lastSession.recommended;
      if (key && lastSession[key]) {
        try {
          const w = JSON.parse(lastSession[key]);
          lastPrescribed = w.type || null;
        } catch (_) {}
      }
    }
    res.json({
      prompt: `[System prompt]\n${systemPrompt}\n\n[User message]\n${userContent}`,
      run_count: runs.length,
      history_days: days,
      oldest_run: oldest,
      newest_run: newest,
      days_since_last_run: daysSinceLastRun,
      last_prescribed: lastPrescribed,
      goal: getSetting('goal', ''),
      race_distance: getSetting('race_distance', ''),
      race_date: getSetting('race_date', ''),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generate workout ───────────────────────────────────────────────────────────

app.post('/api/generate-workout', async (req, res) => {
  try {
    const runs = getRunsFromDB();
    if (!runs.length) return res.status(400).json({ error: 'No runs logged yet — add a run first.' });

    const { units = 'miles', notes = '', date, history_days } = req.body || {};
    const sessionDate = date || localDateStr();
    const message = await getAnthropicClient().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     COACHING_PROMPT,
      messages:   [{ role: 'user', content: buildPromptContent(runs, units, notes, sessionDate, null, history_days || 60) }],
    });

    const text      = message.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude response contained no JSON');
    const workouts = JSON.parse(jsonMatch[0]);

    const { input_tokens, output_tokens } = message.usage;
    const cost = (input_tokens / 1_000_000) * 3 + (output_tokens / 1_000_000) * 15;
    db.prepare(`
      INSERT OR REPLACE INTO workout_sessions (date, option_a, option_b, option_c, recommended, selected, input_tokens, output_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(sessionDate, JSON.stringify(workouts.option_a), JSON.stringify(workouts.option_b), JSON.stringify(workouts.option_c), workouts.recommended || 'option_a', input_tokens, output_tokens, new Date().toISOString());

    res.json({ workouts, cost, input_tokens, output_tokens });
  } catch (err) {
    console.error('[/api/generate-workout]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Today's session ────────────────────────────────────────────────────────────

app.get('/api/today-session', (_req, res) => {
  const today = localDateStr();
  const session = db.prepare('SELECT * FROM workout_sessions WHERE date = ?').get(today);
  if (!session) return res.json({ session: null });
  // Check if a run was completed today
  const todayRun = db.prepare("SELECT id FROM runs WHERE date LIKE ? LIMIT 1").get(`${today}%`);
  res.json({
    session: {
      option_a: JSON.parse(session.option_a),
      option_b: JSON.parse(session.option_b),
      option_c: JSON.parse(session.option_c),
      recommended: session.recommended || 'option_a',
      selected: session.selected,
      result: session.result || null,
      result_notes: session.result_notes || null,
      input_tokens: session.input_tokens,
      output_tokens: session.output_tokens,
    },
    run_completed_today: !!todayRun,
  });
});

app.post('/api/select-workout', (req, res) => {
  const { selected, date } = req.body;
  if (selected !== null && !['option_a', 'option_b', 'option_c', 'none'].includes(selected)) {
    return res.status(400).json({ error: 'Invalid selection' });
  }
  const targetDate = date || localDateStr();
  const result = db.prepare('UPDATE workout_sessions SET selected = ? WHERE date = ?').run(selected, targetDate);
  if (result.changes === 0) return res.status(404).json({ error: 'No session for that date' });

  // Tag the run(s) on that date with the workout type
  const session = db.prepare('SELECT * FROM workout_sessions WHERE date = ?').get(targetDate);
  if (session && session[selected]) {
    const workout = JSON.parse(session[selected]);
    db.prepare("UPDATE runs SET workout_type = ? WHERE date LIKE ?").run(workout.type, `${targetDate}%`);
  }

  res.json({ ok: true });
});

app.post('/api/session-result', (req, res) => {
  const { date, result, notes } = req.body;
  if (result !== null && !['hit', 'partial', 'missed'].includes(result)) {
    return res.status(400).json({ error: 'Invalid result' });
  }
  const targetDate = date || localDateStr();
  const r = db.prepare('UPDATE workout_sessions SET result = ?, result_notes = ? WHERE date = ?').run(result, notes ?? null, targetDate);
  if (r.changes === 0) return res.status(404).json({ error: 'No session for that date' });
  res.json({ ok: true });
});

// ── Session lookup ─────────────────────────────────────────────────────────────

app.get('/api/session-dates', (_req, res) => {
  const rows = db.prepare('SELECT date FROM workout_sessions').all();
  res.json({ dates: rows.map(r => r.date) });
});

app.get('/api/session/:date', (req, res) => {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE date = ?').get(req.params.date);
  if (!session) return res.status(404).json({ error: 'No session for that date' });
  res.json({
    date: session.date,
    option_a: JSON.parse(session.option_a),
    option_b: JSON.parse(session.option_b),
    option_c: JSON.parse(session.option_c),
    recommended: session.recommended || 'option_a',
    selected: session.selected,
    result: session.result || null,
    result_notes: session.result_notes || null,
    input_tokens: session.input_tokens,
    output_tokens: session.output_tokens,
  });
});

// ── Delete session ─────────────────────────────────────────────────────────────

app.delete('/api/session/:date', (req, res) => {
  const { date } = req.params;
  // Also clear the workout_type from any runs on that date
  db.prepare("UPDATE runs SET workout_type = NULL WHERE date LIKE ?").run(`${date}%`);
  const result = db.prepare('DELETE FROM workout_sessions WHERE date = ?').run(date);
  if (result.changes === 0) return res.status(404).json({ error: 'No session for that date' });
  res.json({ ok: true });
});

// ── Unresolved sessions (run completed but no workout selected) ────────────────

app.get('/api/unresolved-sessions', (_req, res) => {
  // Sessions where a run exists on that date but no selection was made
  const sessions = db.prepare('SELECT date FROM workout_sessions WHERE selected IS NULL').all();
  const unresolved = sessions
    .filter(s => db.prepare("SELECT id FROM runs WHERE date LIKE ? LIMIT 1").get(`${s.date}%`))
    .map(s => s.date);
  res.json({ dates: unresolved });
});

// ── Pending results (workout selected but hit/miss not logged) ─────────────────

app.get('/api/pending-results', (_req, res) => {
  const sessions = db.prepare(
    "SELECT date, selected FROM workout_sessions WHERE selected IS NOT NULL AND selected != 'none' AND result IS NULL"
  ).all();
  const pending = sessions
    .filter(s => db.prepare("SELECT id FROM runs WHERE date LIKE ? LIMIT 1").get(`${s.date}%`))
    .map(s => s.date);
  res.json({ dates: pending });
});

// ── Unlogged sessions (workout planned but no run logged yet) ──────────────────

app.get('/api/unlogged-sessions', (_req, res) => {
  const sessions = db.prepare('SELECT date FROM workout_sessions').all();
  const unlogged = sessions
    .filter(s => !db.prepare("SELECT id FROM runs WHERE date LIKE ? LIMIT 1").get(`${s.date}%`))
    .map(s => s.date);
  res.json({ dates: unlogged });
});

// SPA fallback — must be after all API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4218;
app.listen(PORT, () => console.log(`Running coach → http://localhost:${PORT}`));
