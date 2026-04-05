import { useState } from 'react'
import { syncStrava, getActivities } from '../api'
import { useApp } from '../context/AppContext'

export default function DataSettings() {
  const { setRuns, prSource } = useApp()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncOk, setSyncOk] = useState(false)

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
      <div className="settings-group" style={{ marginBottom: '2rem' }}>
        <div className="settings-group-label">Strava</div>
        <div className="strava-status">
          <button
            className="settings-action-btn"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync from Strava now'}
          </button>
          {syncMsg && (
            <p className="settings-msg" style={{ color: syncOk ? 'var(--accent)' : 'var(--red)', marginTop: 0 }}>
              {syncMsg}
            </p>
          )}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Statistics for Strava</div>
        {prSource === null ? (
          <p className="settings-msg" style={{ color: 'var(--text-muted)' }}>Loading…</p>
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
    </>
  )
}
