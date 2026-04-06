import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSetting, syncStrava, getActivities } from '../api'
import { useApp } from '../context/AppContext'

export default function CredentialsSettings() {
  const { setRuns, prSource } = useApp()
  const [settings, setSettings] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncOk, setSyncOk] = useState(false)
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

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    const res = await syncStrava()
    setSyncing(false)
    const ok = res && res.ok
    setSyncOk(ok)
    setSyncMsg(ok ? 'Sync complete.' : 'Sync failed — check Strava credentials.')
    if (ok) {
      getActivities()
        .then(r => r && r.json())
        .then(data => { if (Array.isArray(data)) setRuns(data) })
        .catch(() => {})
    }
  }

  const prStatusOk = prSource === 'statistics-for-strava'

  return (
    <>
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

      <div className="settings-group">
        <div className="settings-group-label">Strava</div>
        <div className="settings-field">
          <label>Connection</label>
          <div className="strava-status">
            <span style={{ color: settings.strava_refresh_token ? 'var(--green)' : 'var(--text-muted)' }}>
              {settings.strava_refresh_token ? 'Connected' : 'Not connected'}
            </span>
            <button className="settings-action-btn" onClick={() => { window.location.href = '/strava/connect' }}>
              Reconnect
            </button>
          </div>
        </div>
        <div className="settings-field">
          <label>Sync</label>
          <div className="strava-status">
            <button className="settings-action-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {syncMsg && (
              <span style={{ fontSize: '0.82rem', color: syncOk ? 'var(--accent)' : 'var(--red)' }}>
                {syncMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Statistics for Strava</div>
        <div className="settings-field">
          <label>Connection</label>
          {prSource === null ? (
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Loading…</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: prStatusOk ? 'var(--accent)' : 'var(--text-muted)',
              }} />
              <span style={{ fontSize: '0.88rem', color: prStatusOk ? 'var(--text)' : 'var(--text-muted)' }}>
                {prStatusOk ? 'Connected' : 'Not connected'}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
