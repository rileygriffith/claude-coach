// ── Utilities ─────────────────────────────────────────────────────────────────

function formatPace(speedMs) {
  if (!speedMs || speedMs <= 0) return '—';
  const secsPerKm = 1000 / speedMs;
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

function formatDistance(meters) {
  return (meters / 1000).toFixed(2);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ── State ─────────────────────────────────────────────────────────────────────

let allRuns = [];
let currentWorkouts = null;

// ── Run cards ─────────────────────────────────────────────────────────────────

async function loadActivities() {
  const grid = document.getElementById('runs-grid');
  grid.innerHTML = '<div class="state-msg">Loading your runs…</div>';

  try {
    const res = await fetch('/api/activities');
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Unknown error');
    if (!data.length) {
      grid.innerHTML = '<div class="state-msg">No runs found on Strava yet.</div>';
      return;
    }

    allRuns = data;
    const recent = data.slice(0, 5);

    grid.innerHTML = recent.map((run) => `
      <div class="run-card">
        <div class="run-date">${formatDate(run.date)}</div>
        <div>
          <span class="run-distance">${formatDistance(run.distance)}</span>
          <span class="run-unit">km</span>
        </div>
        <div class="run-stats">
          <div>
            <div class="stat-label">Pace</div>
            <div class="stat-value">${formatPace(run.average_speed)}</div>
          </div>
          <div>
            <div class="stat-label">Time</div>
            <div class="stat-value">${formatElapsed(run.elapsed_time)}</div>
          </div>
          <div>
            <div class="stat-label">Avg HR</div>
            <div class="stat-value">${run.average_heartrate ? Math.round(run.average_heartrate) + ' bpm' : '—'}</div>
          </div>
          <div>
            <div class="stat-label">Elev</div>
            <div class="stat-value">${run.total_elevation_gain ? Math.round(run.total_elevation_gain) + 'm' : '—'}</div>
          </div>
        </div>
      </div>
    `).join('');

    document.getElementById('generate-btn').disabled = false;
  } catch (err) {
    grid.innerHTML = `<div class="state-error">Failed to load activities: ${err.message}</div>`;
  }
}

// ── Generate workouts ─────────────────────────────────────────────────────────

async function generateWorkout() {
  const btn        = document.getElementById('generate-btn');
  const btnText    = document.getElementById('btn-text');
  const btnLoading = document.getElementById('btn-loading');

  btn.disabled = true;
  btnText.hidden = true;
  btnLoading.hidden = false;

  document.getElementById('workouts-section').hidden = true;
  document.getElementById('confirmed-section').hidden = true;

  try {
    const res = await fetch('/api/generate-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runs: allRuns }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');

    currentWorkouts = data;
    renderWorkouts(data);
    document.getElementById('workouts-section').hidden = false;
    document.getElementById('workouts-section').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert('Failed to generate workout: ' + err.message);
  } finally {
    btn.disabled = false;
    btnText.hidden = false;
    btnLoading.hidden = true;
  }
}

function renderWorkouts(workouts) {
  const grid = document.getElementById('workouts-grid');

  const options = [
    { key: 'easier',      label: 'Easier Alternative' },
    { key: 'recommended', label: 'Recommended'         },
    { key: 'harder',      label: 'Harder Alternative'  },
  ];

  grid.innerHTML = options.map(({ key, label }) => {
    const w = workouts[key];
    if (!w) return '';
    return `
      <div class="workout-card ${key}" data-type="${key}">
        <span class="badge">${label}</span>
        <div class="workout-type">${w.type}</div>
        <div class="workout-structure">${w.structure}</div>
        <div class="workout-pace">Target: ${w.target_pace}</div>
        <div class="workout-rationale">${w.rationale}</div>
      </div>
    `;
  }).join('');

  // Attach click handlers
  grid.querySelectorAll('.workout-card').forEach((card) => {
    card.addEventListener('click', () => selectWorkout(card.dataset.type));
  });
}

// ── Select / log workout ──────────────────────────────────────────────────────

async function selectWorkout(type) {
  if (!currentWorkouts) return;
  const workout = currentWorkouts[type];

  // Highlight selected card
  document.querySelectorAll('.workout-card').forEach((c) => c.classList.remove('selected'));
  const selected = document.querySelector(`[data-type="${type}"]`);
  if (selected) selected.classList.add('selected');

  // Log to server (fire and forget — non-blocking)
  fetch('/api/log-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workout: { ...workout, variant: type } }),
  }).catch(console.error);

  // Show confirmed session
  const labels = {
    recommended: 'Recommended',
    harder: 'Harder Alternative',
    easier: 'Easier Alternative',
  };

  document.getElementById('confirmed-card').innerHTML = `
    <span class="badge" style="background:rgba(96,165,250,0.1);color:#60a5fa">${labels[type]}</span>
    <div class="workout-type">${workout.type}</div>
    <div class="workout-structure" style="margin:.4rem 0">${workout.structure}</div>
    <div class="workout-pace">Target: ${workout.target_pace}</div>
    <div class="workout-rationale">${workout.rationale}</div>
    <div class="confirmed-note">✓ Logged as today's session</div>
  `;

  const section = document.getElementById('confirmed-section');
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('generate-btn').addEventListener('click', generateWorkout);
loadActivities();
