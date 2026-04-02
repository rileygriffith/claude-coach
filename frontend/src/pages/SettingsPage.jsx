import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TrainingSettings from '../settings/TrainingSettings'
import CredentialsSettings from '../settings/CredentialsSettings'
import AccountSettings from '../settings/AccountSettings'
import DataSettings from '../settings/DataSettings'
import UnitsSettings from '../settings/UnitsSettings'

const TABS = ['training', 'credentials', 'account', 'data', 'units']
const TAB_LABELS = {
  training: 'Training',
  credentials: 'Credentials',
  account: 'Account',
  data: 'Data',
  units: 'Units',
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('training')

  function renderContent() {
    switch (activeTab) {
      case 'training': return <TrainingSettings />
      case 'credentials': return <CredentialsSettings />
      case 'account': return <AccountSettings />
      case 'data': return <DataSettings />
      case 'units': return <UnitsSettings />
      default: return null
    }
  }

  return (
    <div className="app">
      <section className="section settings-panel">
        <div className="settings-page-header">
          <button className="settings-back-btn" onClick={() => navigate('/')} aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <span className="settings-page-title">Settings</span>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav">
            {TABS.map(tab => (
              <button
                key={tab}
                className={`settings-nav-item${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
            <div className="settings-nav-spacer" />
            <form method="POST" action="/logout">
              <button type="submit" className="settings-nav-signout">Sign out</button>
            </form>
          </nav>
          <div className="settings-content">
            {renderContent()}
          </div>
        </div>
      </section>
    </div>
  )
}
