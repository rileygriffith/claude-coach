import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getSession, deleteSession, selectWorkoutForDate, generateWorkout, getTodaySession,
  setSessionResult, createRun, updateRun, deleteRun,
} from '../api'
import { localDateStr } from '../utils'

const MILE_METERS = 1609.34

function isRestDay(workout) {
  return workout && workout.type && workout.type.toLowerCase().includes('rest')
}

export default function SessionModal({ date: initialDate, onClose }) {
  const { runs, setRuns, setTodaySession, refreshCalendar, useImperial } = useApp()
  const today = localDateStr()

  const [date, setDate] = useState(initialDate || today)
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [result, setResult] = useState(null)
  const [resultNotes, setResultNotes] = useState('')

  const [name, setName] = useState('')
  const [distance, setDistance] = useState('')
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [heartrate, setHeartrate] = useState('')
  const [elevation, setElevation] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const loggedRun = runs.find(r => r.date.slice(0, 10) === date) || null
  const unitLabel = useImperial ? 'mi' : 'km'

  // Load the prescribed session (if any) whenever the selected date changes
  useEffect(() => {
    let cancelled = false
    setSessionLoading(true)
    setShowAlternatives(false)
    getSession(date)
      .then(r => r && r.json())
      .then(d => {
        if (cancelled) return
        if (d && !d.error) {
          setSession(d)
          setResult(d.result || null)
          setResultNotes(d.result_notes || '')
        } else {
          setSession(null)
          setResult(null)
          setResultNotes('')
        }
      })
      .catch(() => { if (!cancelled) setSession(null) })
      .finally(() => { if (!cancelled) setSessionLoading(false) })
    return () => { cancelled = true }
  }, [date])

  // Populate the run-entry fields from whichever run backs the selected date
  useEffect(() => {
    const elapsed = loggedRun?.elapsed_time || 0
    setName(loggedRun?.name || '')
    setDistance(loggedRun ? (useImperial ? (loggedRun.distance / MILE_METERS) : (loggedRun.distance / 1000)).toFixed(2) : '')
    setHours(loggedRun ? Math.floor(elapsed / 3600) || '' : '')
    setMinutes(loggedRun ? Math.floor((elapsed % 3600) / 60) || '' : '')
    setSeconds(loggedRun ? (elapsed % 60) || '' : '')
    setHeartrate(loggedRun?.average_heartrate || '')
    setElevation(loggedRun?.total_elevation_gain || '')
    setFormError(null)
  }, [loggedRun?.id])

  const options = ['option_a', 'option_b', 'option_c']
  const noneChosen = session?.selected === 'none'
  const hasSelection = !!(session?.selected && session.selected !== null)
  const selectedWorkout = hasSelection && !noneChosen ? session[session.selected] : null
  const showResultToggle = !showAlternatives && ((selectedWorkout && !isRestDay(selectedWorkout)) || noneChosen)
  const visibleOptions = hasSelection && !noneChosen && !showAlternatives
    ? options.filter(key => key === session.selected)
    : options

  // Default the run name to the prescribed workout's type, but only while creating new
  useEffect(() => {
    if (!loggedRun && !name && selectedWorkout?.type) setName(selectedWorkout.type)
  }, [selectedWorkout?.type])

  async function handleSelect(key) {
    const newSelected = session.selected === key ? null : key
    await selectWorkoutForDate(newSelected, date)
    refreshCalendar()
    if (date === today) {
      const res = await getTodaySession()
      if (res) {
        const d = await res.json()
        if (d && d.session) setTodaySession(d.session)
      }
    }
    setSession(s => ({ ...s, selected: newSelected }))
    setShowAlternatives(false)
  }

  async function handleDeleteSession() {
    if (!confirm('Delete this session? This cannot be undone.')) return
    await deleteSession(date)
    refreshCalendar()
    if (date === today) setTodaySession(null)
    onClose()
  }

  async function handleRegenerate() {
    onClose()
    const res = await generateWorkout({
      units: useImperial ? 'miles' : 'km',
      soreness: 'none',
      date: today,
      history_days: 60,
    })
    if (res && res.ok) {
      const todayRes = await getTodaySession()
      if (todayRes) {
        const d = await todayRes.json()
        if (d && d.session) setTodaySession(d.session)
      }
      refreshCalendar()
    }
  }

  function handleResultClick(value) {
    const next = result === value ? null : value
    setResult(next)
    setSessionResult(date, next, resultNotes.trim()).then(() => refreshCalendar())
  }

  function handleResultNotesBlur() {
    if (result) setSessionResult(date, result, resultNotes.trim()).then(() => refreshCalendar())
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSaveRun() {
    setFormError(null)
    const dist = parseFloat(distance)
    const totalSeconds = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0)
    if (!date)               return setFormError('Date is required.')
    if (!(dist > 0))         return setFormError('Enter a distance greater than zero.')
    if (!(totalSeconds > 0)) return setFormError('Enter a duration greater than zero.')

    const meters = dist * (useImperial ? MILE_METERS : 1000)
    // Match the server's normalized local-time format so `new Date(run.date)` parses
    // as local time rather than UTC midnight (which would shift the displayed day).
    const isoDate = `${date}T12:00:00`
    const payload = {
      date,
      name: name.trim() || 'Run',
      distance: meters,
      elapsed_time: totalSeconds,
      average_heartrate: heartrate ? Number(heartrate) : null,
      total_elevation_gain: elevation ? Number(elevation) : 0,
    }

    setSaving(true)
    try {
      const res = loggedRun ? await updateRun(loggedRun.id, payload) : await createRun(payload)
      if (!res || !res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save run')
      }
      const data = await res.json()
      const savedRun = loggedRun
        ? { ...loggedRun, ...payload, date: isoDate, average_speed: meters / totalSeconds }
        : { id: data.id, ...payload, date: isoDate, average_speed: meters / totalSeconds, sport_type: 'Run' }
      setRuns(rs => {
        const without = rs.filter(r => r.id !== savedRun.id)
        return [...without, savedRun].sort((a, b) => b.date.localeCompare(a.date))
      })
      refreshCalendar()
      onClose()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRun() {
    if (!loggedRun) return
    if (!confirm('Delete this run? This cannot be undone.')) return
    setSaving(true)
    try {
      const res = await deleteRun(loggedRun.id)
      if (!res || !res.ok) throw new Error('Failed to delete run')
      setRuns(rs => rs.filter(r => r.id !== loggedRun.id))
      refreshCalendar()
      onClose()
    } catch (err) {
      setFormError(err.message)
      setSaving(false)
    }
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">{dateLabel}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {sessionLoading && <div className="state-msg">Loading…</div>}

          {session && visibleOptions.map(key => {
            const w = session[key]
            if (!w) return null
            const isSelected = session.selected === key
            const isRec = key === session.recommended
            return (
              <div
                key={key}
                className={`modal-workout${isSelected ? ' modal-workout-selected' : ''} modal-workout-selectable`}
                onClick={() => handleSelect(key)}
              >
                <div className="modal-workout-header">
                  {isRec
                    ? <span className="rec-badge">Recommended</span>
                    : <span className="alt-badge">Alternative</span>}
                  {isSelected && <span className="modal-chosen">✓ Chosen</span>}
                </div>
                <div className="workout-type">{w.type}</div>
                <div className="workout-structure">
                  {(Array.isArray(w.structure) ? w.structure : w.structure.split('\n')).map((s, i) => (
                    <div key={i} className="workout-step">{s}</div>
                  ))}
                </div>
                <div className="workout-pace">Target: {w.target_pace}</div>
                <div className="workout-rationale">{w.rationale}</div>
              </div>
            )
          })}
          {showResultToggle && (
            <div className="modal-result-section">
              <div className="modal-result-header">How did it go?</div>
              <div className="result-toggle">
                <button
                  className={`result-btn hit${result === 'hit' ? ' active' : ''}`}
                  onClick={() => handleResultClick('hit')}
                >✓ Hit targets</button>
                <button
                  className={`result-btn partial${result === 'partial' ? ' active' : ''}`}
                  onClick={() => handleResultClick('partial')}
                >~ Close</button>
                <button
                  className={`result-btn missed${result === 'missed' ? ' active' : ''}`}
                  onClick={() => handleResultClick('missed')}
                >✕ Missed</button>
              </div>
            </div>
          )}

          {!showAlternatives && (
            <>
              <div className="modal-result-header modal-section-header">Your run</div>
              <div className="settings-field">
                <label>Date</label>
                <input className="settings-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="settings-field">
                <label>Name</label>
                <input className="settings-input" type="text" placeholder="Morning Run" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="settings-row">
                <div className="settings-field">
                  <label>Distance ({unitLabel})</label>
                  <input className="settings-input" type="number" inputMode="decimal" min="0" step="0.01"
                    value={distance} onChange={e => setDistance(e.target.value)} />
                </div>
                <div className="settings-field">
                  <label>Duration</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input className="settings-input" type="number" inputMode="numeric" min="0" placeholder="hh"
                      value={hours} onChange={e => setHours(e.target.value)} />
                    <input className="settings-input" type="number" inputMode="numeric" min="0" max="59" placeholder="mm"
                      value={minutes} onChange={e => setMinutes(e.target.value)} />
                    <input className="settings-input" type="number" inputMode="numeric" min="0" max="59" placeholder="ss"
                      value={seconds} onChange={e => setSeconds(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-field">
                  <label>Avg heart rate (bpm)</label>
                  <input className="settings-input" type="number" inputMode="numeric" min="0" placeholder="optional"
                    value={heartrate} onChange={e => setHeartrate(e.target.value)} />
                </div>
                <div className="settings-field">
                  <label>Elevation gain (ft)</label>
                  <input className="settings-input" type="number" inputMode="numeric" min="0" placeholder="optional"
                    value={elevation} onChange={e => setElevation(e.target.value)} />
                </div>
              </div>

              {showResultToggle && (
                <div className="settings-field">
                  <label>Note</label>
                  <textarea
                    className="result-notes"
                    placeholder="Add a note…"
                    rows={2}
                    value={resultNotes}
                    onChange={(e) => setResultNotes(e.target.value)}
                    onBlur={handleResultNotesBlur}
                  />
                </div>
              )}

              {formError && <div className="state-error">{formError}</div>}
            </>
          )}
          {session && hasSelection && !noneChosen && (
            <button
              className="modal-show-alternatives-btn"
              onClick={() => setShowAlternatives(v => !v)}
            >
              {showAlternatives ? 'Hide alternatives' : 'Switch workout ↕'}
            </button>
          )}
          {session && (!hasSelection || showAlternatives || noneChosen) && (
            <button
              className={`modal-none-btn${noneChosen ? ' modal-none-chosen' : ''}`}
              onClick={() => !noneChosen && handleSelect('none')}
            >
              {noneChosen ? '✓ Did something else' : 'None of the above — did something else'}
            </button>
          )}
        </div>
        <div className="modal-footer">
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {session && (
              <button className="modal-action-btn modal-delete-btn" style={{ marginLeft: 0 }} onClick={handleDeleteSession}>
                Delete session
              </button>
            )}
            {loggedRun && (
              <button className="modal-action-btn modal-delete-btn" style={{ marginLeft: 0 }} onClick={handleDeleteRun} disabled={saving}>
                Delete run
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
            {date === today && (
              <button className="modal-action-btn modal-regenerate-btn" onClick={handleRegenerate}>
                ↺ Regenerate
              </button>
            )}
            {!showAlternatives && (
              <button className="modal-action-btn modal-regenerate-btn" onClick={handleSaveRun} disabled={saving}>
                {saving ? 'Saving…' : 'Save run'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
