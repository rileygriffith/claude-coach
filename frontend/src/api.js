async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)
  if (res.redirected && res.url.includes('/login')) {
    window.location.href = '/login'
    return null
  }
  return res
}

export async function getMe() {
  return apiFetch('/api/me')
}

export async function getActivities() {
  return apiFetch('/api/activities')
}

export async function getTodaySession() {
  return apiFetch('/api/today-session')
}

export async function generateWorkout(payload) {
  return apiFetch('/api/generate-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function selectWorkout(type) {
  return apiFetch('/api/select-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected: type }),
  })
}

export async function selectWorkoutForDate(type, date) {
  return apiFetch('/api/select-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected: type, date }),
  })
}

export async function getSessionDates() {
  return apiFetch('/api/session-dates')
}

export async function getUnresolvedSessions() {
  return apiFetch('/api/unresolved-sessions')
}

export async function getSession(date) {
  return apiFetch(`/api/session/${date}`)
}

export async function deleteSession(date) {
  return apiFetch(`/api/session/${date}`, { method: 'DELETE' })
}

export async function setSessionResult(date, result, notes) {
  return apiFetch('/api/session-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, result, notes }),
  })
}

export async function getSettings() {
  return apiFetch('/api/settings')
}

export async function saveSetting(key, value) {
  return apiFetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
}

export async function changePassword(current, next) {
  return apiFetch('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current, next }),
  })
}

export async function syncStrava() {
  return apiFetch('/api/sync', { method: 'POST' })
}

export async function getCostEstimate(payload) {
  return apiFetch('/api/cost-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getPRs() {
  return apiFetch('/api/prs')
}

export async function getPromptPreview(payload) {
  return apiFetch('/api/prompt-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
