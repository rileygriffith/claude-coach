import { useState } from 'react'
import Header from '../components/Header'
import UnresolvedBanner from '../components/UnresolvedBanner'
import GenerateSection from '../components/GenerateSection'
import WorkoutsSection from '../components/WorkoutsSection'
import Calendar from '../components/Calendar'
import RecentRuns from '../components/RecentRuns'
import PersonalRecords from '../components/PersonalRecords'
import GenerateModal from '../modals/GenerateModal'
import SessionModal from '../modals/SessionModal'

export default function MainPage() {
  const [sessionModalDate, setSessionModalDate] = useState(null)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)

  return (
    <div className="app">
      <Header />
      <UnresolvedBanner onOpenSession={setSessionModalDate} />
      <GenerateSection onOpenModal={() => setGenerateModalOpen(true)} />
      <WorkoutsSection />
      <section className="section">
        <h2 className="section-label">Training Calendar</h2>
        <Calendar onSessionClick={setSessionModalDate} />
      </section>
      <PersonalRecords />
      <section className="section">
        <h2 className="section-label">Recent Runs</h2>
        <RecentRuns />
      </section>
      {sessionModalDate && (
        <SessionModal date={sessionModalDate} onClose={() => setSessionModalDate(null)} />
      )}
      {generateModalOpen && (
        <GenerateModal onClose={() => setGenerateModalOpen(false)} />
      )}
    </div>
  )
}
