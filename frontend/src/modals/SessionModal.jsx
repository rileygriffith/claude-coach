import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getSession, deleteSession, selectWorkoutForDate, generateWorkout, getTodaySession, setSessionResult } from '../api'
import { localDateStr } from '../utils'

const RESULT_DEFAULTS = {
  hit: 'Hit all targets as prescribed.',
  partial: 'Hit some targets but not all.',
  missed: 'Could not hit the prescribed targets.',
}

function isRestDay(workout) {
  return workout && workout.type && workout.type.toLowerCase().includes('rest')
}

function ResultPicker({ currentResult, currentNotes, onSave }) {
  const [result, setResult] = useState(currentResult || null)
  const [notes, setNotes] = useState(currentNotes || '')

  function handleResultClick(value) {
    setResult(value)
    let newNotes = notes
    if (!notes.trim()) {
      newNotes = RESULT_DEFAULTS[value] || ''
      setNotes(newNotes)
    }
    onSave(value, newNotes)
  }

  function handleBlur() {
    onSave(result, notes)
  }

  return (
    <div className="result-picker">
      <div className="result-picker-row">
        <span className="result-picker-label">How did it go?</span>
        <div className="result-toggle">
          <button
            className={`result-btn hit${result === 'hit' ? ' active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleResultClick('hit') }}
          >✓ Hit targets</button>
          <button
            className={`result-btn partial${result === 'partial' ? ' active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleResultClick('partial') }}
          >~ Close</button>
          <button
            className={`result-btn missed${result === 'missed' ? ' active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleResultClick('missed') }}
          >✕ Missed</button>
        </div>
      </div>
      <textarea
        className="result-notes"
        placeholder="Add a note…"
        rows={2}
        value={notes}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  )
}

export default function SessionModal({ date, onClose }) {
  const { setTodaySession, refreshCalendar, useImperial } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const today = localDateStr()

  useEffect(() => {
    setLoading(true)
    getSession(date)
      .then(r => r && r.json())
      .then(d => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [date])

  async function handleSelect(key) {
    await selectWorkoutForDate(key, date)
    refreshCalendar()
    if (date === today) {
      const res = await getTodaySession()
      if (res) {
        const d = await res.json()
        if (d && d.session) setTodaySession(d.session)
      }
    }
    onClose()
  }

  async function handleDelete() {
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

  async function handleSaveResult(key, result, notes) {
    await setSessionResult(date, result, notes)
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
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
          {loading && <div className="state-msg">Loading…</div>}
          {error && <div className="state-error">{error}</div>}
          {data && (() => {
            const options = ['option_a', 'option_b', 'option_c']
            const noneChosen = data.selected === 'none'
            return (
              <>
                {options.map(key => {
                  const w = data[key]
                  if (!w) return null
                  const isSelected = data.selected === key
                  const isRec = key === data.recommended
                  const showResult = isSelected && !isRestDay(w)
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
                      {showResult && (
                        <div className="modal-result-inline" onClick={e => e.stopPropagation()}>
                          <ResultPicker
                            currentResult={data.result}
                            currentNotes={data.result_notes}
                            onSave={(result, notes) => handleSaveResult(key, result, notes)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
                <button
                  className={`modal-none-btn${noneChosen ? ' modal-none-chosen' : ''}`}
                  onClick={() => !noneChosen && handleSelect('none')}
                >
                  {noneChosen ? '✓ Did something else' : 'None of the above — did something else'}
                </button>
              </>
            )
          })()}
        </div>
        <div className="modal-footer">
          {date === today && (
            <button className="modal-action-btn modal-regenerate-btn" onClick={handleRegenerate}>
              ↺ Regenerate
            </button>
          )}
          <button className="modal-action-btn modal-delete-btn" onClick={handleDelete}>
            Delete session
          </button>
        </div>
      </div>
    </div>
  )
}
