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
      <div className="settings-group">
        <div className="settings-group-label">Data</div>
        <button
          className="settings-action-btn"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : 'Sync from Strava now'}
        </button>
        {syncMsg && (
          <p className="settings-msg" style={{ color: syncOk ? 'var(--accent)' : 'var(--text-muted)' }}>
            {syncMsg}
          </p>
        )}
      </div>
      <div className="settings-group">
        <div className="settings-group-label">Personal Records Source</div>
        {prSource === null ? (
          <p className="settings-msg">Loading…</p>
        ) : (
          <p className="settings-msg" style={{ color: prStatusOk ? 'var(--accent)' : 'var(--text-muted)' }}>
            {prStatusOk
              ? 'Statistics for Strava — GPS-accurate best efforts'
              : 'Calculated from run history — mount Statistics for Strava DB for more accurate PRs'}
          </p>
        )}
      </div>
    </>
  )
}
