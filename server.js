require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

// ─── Coaching system prompt ───────────────────────────────────────────────────
// Replace this placeholder with your coaching system prompt.
const COACHING_SYSTEM_PROMPT = `COACHING_SYSTEM_PROMPT_PLACEHOLDER`;
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const WORKOUTS_FILE = path.join(__dirname, 'workouts.json');

// ── Strava token management ────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiry = 0;

async function getStravaToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (data.errors) throw new Error(`Strava error: ${JSON.stringify(data.errors)}`);

  cachedToken = data.access_token;
  tokenExpiry = data.expires_at * 1000 - 60_000; // refresh 1 min before expiry
  return cachedToken;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPace(speedMs) {
  if (!speedMs || speedMs <= 0) return 'N/A';
  const secsPerKm = 1000 / speedMs;
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')} min/km`;
}

function buildRunSummary(runs) {
  return runs
    .map((r) => {
      const distKm = (r.distance / 1000).toFixed(2);
      const pace = formatPace(r.average_speed);
      const date = new Date(r.date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      return (
        `- ${date}: ${distKm}km, pace ${pace}` +
        `, HR ${r.average_heartrate ? Math.round(r.average_heartrate) + ' bpm' : 'N/A'}` +
        `, cadence ${r.average_cadence ? Math.round(r.average_cadence) + ' spm' : 'N/A'}` +
        `, power ${r.average_watts ? Math.round(r.average_watts) + 'W' : 'N/A'}` +
        `, elevation gain ${Math.round(r.total_elevation_gain || 0)}m` +
        `, elapsed time ${Math.floor(r.elapsed_time / 60)}m${r.elapsed_time % 60}s`
      );
    })
    .join('\n');
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /api/activities — fetch and filter runs from Strava
app.get('/api/activities', async (req, res) => {
  try {
    const token = await getStravaToken();
    const response = await fetch(
      'https://www.strava.com/api/v3/athlete/activities?per_page=20',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({ error: `Strava error: ${body}` });
    }

    const activities = await response.json();
    const runs = activities
      .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
      .map((a) => ({
        name: a.name,
        date: a.start_date_local,
        distance: a.distance,             // meters
        elapsed_time: a.elapsed_time,     // seconds
        average_speed: a.average_speed,   // m/s
        average_heartrate: a.average_heartrate || null,
        average_cadence: a.average_cadence || null,
        average_watts: a.average_watts || null,
        total_elevation_gain: a.total_elevation_gain || 0,
      }));

    res.json(runs);
  } catch (err) {
    console.error('[/api/activities]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-workout — call Claude to generate 3 workout options
app.post('/api/generate-workout', async (req, res) => {
  try {
    const { runs } = req.body;
    if (!runs || runs.length === 0) {
      return res.status(400).json({ error: 'No run data provided' });
    }

    const runSummary = buildRunSummary(runs);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: COACHING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here are my recent runs:\n${runSummary}\n\n` +
            `Based on this training history, generate 3 workout options for my next session:\n` +
            `1. A recommended session\n` +
            `2. A harder alternative\n` +
            `3. An easier alternative\n\n` +
            `For each option provide: workout type, distance or structure, target pace, and a one-line rationale.\n\n` +
            `Respond ONLY with valid JSON in exactly this format:\n` +
            `{\n` +
            `  "recommended": { "type": "string", "structure": "string", "target_pace": "string", "rationale": "string" },\n` +
            `  "harder":      { "type": "string", "structure": "string", "target_pace": "string", "rationale": "string" },\n` +
            `  "easier":      { "type": "string", "structure": "string", "target_pace": "string", "rationale": "string" }\n` +
            `}`,
        },
      ],
    });

    const text = message.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude response contained no JSON');
    const workouts = JSON.parse(jsonMatch[0]);

    res.json(workouts);
  } catch (err) {
    console.error('[/api/generate-workout]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/log-workout — append selected workout to local JSON log
app.post('/api/log-workout', async (req, res) => {
  try {
    const { workout } = req.body;
    let log = [];
    if (fs.existsSync(WORKOUTS_FILE)) {
      log = JSON.parse(fs.readFileSync(WORKOUTS_FILE, 'utf8'));
    }
    log.push({ ...workout, logged_at: new Date().toISOString() });
    fs.writeFileSync(WORKOUTS_FILE, JSON.stringify(log, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('[/api/log-workout]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Running coach → http://localhost:${PORT}`);
});
