import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSetting } from '../api'

export default function CredentialsSettings() {
  const [settings, setSettings] = useState(null)
  const anthropicTimer = useRef(null)

  useEffect(() => {
    getSettings()
      .then(r => r && r.json())
      .then(data => setSettings(data))
      .catch(() => {})
  }, [])

  if (!settings) return <div className="state-msg">Loading…</div>

  function handleAnthropicChange(e) {
    const val = e.target.value
    clearTimeout(anthropicTimer.current)
    anthropicTimer.current = setTimeout(() => {
      if (val) saveSetting('anthropic_api_key', val.trim())
    }, 800)
  }

  return (
    <div className="settings-group">
      <div className="settings-group-label">Anthropic</div>
      <div className="settings-field">
        <label>API key</label>
        <input
          type="password"
          className="settings-input"
          placeholder={settings.anthropic_api_key ? '••••••••••••••••••••' : 'sk-ant-…'}
          autoComplete="off"
          onChange={handleAnthropicChange}
        />
      </div>
    </div>
  )
}
