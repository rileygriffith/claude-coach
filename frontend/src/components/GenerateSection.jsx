import { useApp } from '../context/AppContext'

export default function GenerateSection({ onOpenModal }) {
  const { todaySession, targetDate } = useApp()

  if (todaySession !== null) return null

  const d = new Date(targetDate + 'T00:00:00')
  const label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  return (
    <section className="section generate-section">
      <button className="generate-btn" onClick={onOpenModal}>
        Generate Workout for {label}
      </button>
    </section>
  )
}
