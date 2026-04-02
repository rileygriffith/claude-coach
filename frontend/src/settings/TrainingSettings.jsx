import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSetting } from '../api'
import DatePicker from '../components/DatePicker'

export default function TrainingSettings() {
  const [settings, setSettings] = useState(null)
  const goalTimer = useRef(null)
  const crossTimer = useRef(null)
  const injuryTimer = useRef(null)

  useEffect(() => {
    getSettings()
      .then(r => r && r.json())
      .then(data => setSettings(data))
      .catch(() => {})
  }, [])

  if (!settings) return <div className="state-msg">Loading…</div>

  function handleGoalChange(e) {
    const val = e.target.value
    setSettings(s => ({ ...s, goal: val }))
    clearTimeout(goalTimer.current)
    goalTimer.current = setTimeout(() => saveSetting('goal', val.trim()), 600)
  }

  function handleCrossChange(e) {
    const val = e.target.value
    setSettings(s => ({ ...s, cross_training: val }))
    clearTimeout(crossTimer.current)
    crossTimer.current = setTimeout(() => saveSetting('cross_training', val.trim()), 600)
  }

  function handleInjuryChange(e) {
    const val = e.target.value
    setSettings(s => ({ ...s, injury_notes: val }))
    clearTimeout(injuryTimer.current)
    injuryTimer.current = setTimeout(() => saveSetting('injury_notes', val.trim()), 600)
  }

  function handleRaceDistanceChange(e) {
    const val = e.target.value
    setSettings(s => ({ ...s, race_distance: val }))
    saveSetting('race_distance', val)
  }

  function handleRaceDateChange(val) {
    setSettings(s => ({ ...s, race_date: val }))
    saveSetting('race_date', val)
  }

  return (
    <div className="settings-group">
      <div className="settings-group-label">Training</div>
      <div className="settings-field">
        <label>Goal</label>
        <textarea
          className="goal-input"
          rows={2}
          placeholder="e.g. Run a sub-2hr half marathon by June…"
          value={settings.goal || ''}
          onChange={handleGoalChange}
        />
      </div>
      <div className="settings-field settings-row">
        <div>
          <label>Race target</label>
          <select
            className="settings-select"
            value={settings.race_distance || ''}
            onChange={handleRaceDistanceChange}
          >
            <option value="">No race</option>
            <option value="5K">5K</option>
            <option value="10K">10K</option>
            <option value="15K">15K</option>
            <option value="Half Marathon">Half Marathon</option>
            <option value="Marathon">Marathon</option>
            <option value="Ultra">Ultra</option>
          </select>
        </div>
        <div>
          <label>Race date</label>
          <DatePicker value={settings.race_date || ''} onChange={handleRaceDateChange} />
        </div>
      </div>
      <div className="settings-field">
        <label>Cross-training</label>
        <textarea
          className="goal-input"
          rows={2}
          placeholder="e.g. I lift weights 3–4x per week, mostly lower body…"
          value={settings.cross_training || ''}
          onChange={handleCrossChange}
        />
      </div>
      <div className="settings-field">
        <label>Injury notes</label>
        <textarea
          className="goal-input"
          rows={2}
          placeholder="e.g. Recovering from mild plantar fasciitis in left foot…"
          value={settings.injury_notes || ''}
          onChange={handleInjuryChange}
        />
      </div>
    </div>
  )
}
