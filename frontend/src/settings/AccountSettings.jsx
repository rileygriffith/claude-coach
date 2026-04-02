import { useState } from 'react'
import { changePassword } from '../api'

export default function AccountSettings() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [msgOk, setMsgOk] = useState(false)

  async function handleChangePassword() {
    const res = await changePassword(currentPw, newPw)
    if (!res) return
    const data = await res.json()
    setMsgOk(res.ok)
    setMsg(res.ok ? 'Password updated.' : (data.error || 'Failed.'))
    if (res.ok) {
      setCurrentPw('')
      setNewPw('')
    }
  }

  return (
    <div className="settings-group">
      <div className="settings-group-label">Account</div>
      <div className="settings-field">
        <label>Current password</label>
        <input
          type="password"
          className="settings-input"
          autoComplete="current-password"
          value={currentPw}
          onChange={e => setCurrentPw(e.target.value)}
        />
      </div>
      <div className="settings-field">
        <label>New password</label>
        <input
          type="password"
          className="settings-input"
          autoComplete="new-password"
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
        />
      </div>
      <button className="settings-action-btn" onClick={handleChangePassword}>
        Change password
      </button>
      {msg && (
        <p className="settings-msg" style={{ color: msgOk ? 'var(--accent)' : 'var(--text-muted)' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
