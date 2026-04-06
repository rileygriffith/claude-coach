import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { generateWorkout, getCostEstimate, getPromptPreview, getTodaySession } from '../api'
import { localDateStr } from '../utils'

export default function GenerateModal({ onClose }) {
  const { targetDate, useImperial, setTodaySession, refreshCalendar } = useApp()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [estimateData, setEstimateData] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [error, setError] = useState(null)

  const units = useImperial ? 'miles' : 'km'
  const today = localDateStr()
  const historyDays = 60
  const payload = { units, date: targetDate, today, history_days: historyDays, notes }

  useEffect(() => {
    setPreviewLoading(true)
    Promise.all([
      getCostEstimate(payload).then(r => r && r.json()),
      getPromptPreview(payload).then(r => r && r.json()),
    ])
      .then(([estimate, preview]) => {
        setEstimateData(estimate)
        setPreviewData(preview)
      })
      .catch(err => setError(err.message))
      .finally(() => setPreviewLoading(false))
  }, [])

  async function handleGenerate() {
    setLoading(true)
    try {
      const res = await generateWorkout({
        units,
        notes: notes.trim(),
        date: targetDate,
        history_days: historyDays,
      })
      if (!res || !res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Unknown error')
      }

      // Refetch today session to get fresh data
      const todayRes = await getTodaySession()
      if (todayRes) {
        const todayData = await todayRes.json()
        if (todayData && todayData.session) {
          setTodaySession(todayData.session)
        }
      }

      refreshCalendar()
      onClose()
    } catch (err) {
      alert('Failed to generate workout: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const d = new Date(targetDate + 'T00:00:00')
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  const insertBefore = '\n\nAll distances and paces must be in'
  const basePrompt = previewData ? previewData.prompt : ''
  const displayPrompt = notes.trim() && basePrompt
    ? basePrompt.replace(insertBefore, `\n\nAthlete note: ${notes.trim()}` + insertBefore)
    : basePrompt

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">{label}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {previewLoading ? (
            <div className="state-msg">Loading…</div>
          ) : error ? (
            <div className="state-error">Failed to load preview: {error}</div>
          ) : (
            <>
              <p className="generate-section-label">Cost estimate</p>
              {estimateData && (
                <div className="generate-preview-meta">
                  <div className="generate-preview-row">
                    <span className="generate-preview-label">Model</span>
                    <span>claude-sonnet-4-6</span>
                  </div>
                  <div className="generate-preview-row">
                    <span className="generate-preview-label">Input tokens</span>
                    <span>{estimateData.input_tokens.toLocaleString()}</span>
                  </div>
                  <div className="generate-preview-row">
                    <span className="generate-preview-label">Est. output tokens</span>
                    <span>~{estimateData.estimated_output_tokens}</span>
                  </div>
                  <div className="generate-preview-row">
                    <span className="generate-preview-label">Est. cost</span>
                    <span className="generate-preview-cost">~${estimateData.cost.toFixed(4)}</span>
                  </div>
                </div>
              )}
              {previewData && (
                <>
                  <p className="generate-section-label">Prompt context</p>
                  <div className="generate-preview-meta">
                    {previewData.goal && (
                      <div className="generate-preview-row">
                        <span className="generate-preview-label">Goal</span>
                        <span className="generate-preview-goal">{previewData.goal}</span>
                      </div>
                    )}
                    <div className="generate-preview-row">
                      <span className="generate-preview-label">Training philosophy</span>
                      <span>80/20 polarized</span>
                    </div>
                    <div className="generate-preview-row">
                      <span className="generate-preview-label">History window</span>
                      <span>
                        {(() => {
                          const fmt = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          return previewData.oldest_run && previewData.newest_run
                            ? `${previewData.history_days} days · ${fmt(previewData.oldest_run)} – ${fmt(previewData.newest_run)} · ${previewData.run_count} runs`
                            : `${previewData.history_days} days`
                        })()}
                      </span>
                    </div>
                    {previewData.days_since_last_run !== null && previewData.days_since_last_run !== undefined && (
                      <div className="generate-preview-row">
                        <span className="generate-preview-label">Days since last run</span>
                        <span>
                          {previewData.days_since_last_run === 0
                            ? 'Today'
                            : previewData.days_since_last_run === 1
                            ? 'Yesterday'
                            : `${previewData.days_since_last_run} days ago`}
                        </span>
                      </div>
                    )}
                    {previewData.last_prescribed && (
                      <div className="generate-preview-row">
                        <span className="generate-preview-label">Last prescribed</span>
                        <span>{previewData.last_prescribed}</span>
                      </div>
                    )}
                    {(previewData.race_distance || previewData.race_date) && (
                      <div className="generate-preview-row">
                        <span className="generate-preview-label">Race target</span>
                        <span>
                          {[
                            previewData.race_distance,
                            previewData.race_date ? (() => {
                              const rd = new Date(previewData.race_date + 'T12:00:00')
                              const daysOut = Math.round((rd - new Date()) / 86400000)
                              const lbl = rd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              return `${lbl} (${daysOut === 0 ? 'today' : daysOut === 1 ? 'tomorrow' : daysOut + ' days out'})`
                            })() : null
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                  <textarea
                    className="generate-notes"
                    placeholder="Any notes for Claude? (e.g. feeling tired, skipped yesterday…)"
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                  <details className="generate-preview-details">
                    <summary>Preview prompt</summary>
                    <pre className="prompt-preview">{displayPrompt}</pre>
                  </details>
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="generate-btn"
            style={{ margin: 0 }}
            onClick={handleGenerate}
            disabled={loading || previewLoading}
          >
            {loading ? 'Analyzing your training…' : 'Send to Claude'}
          </button>
          <button
            className="modal-action-btn"
            style={{ color: 'var(--text-muted)' }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
