import { useApp } from '../context/AppContext'

export default function UnresolvedBanner() {
  const { unresolvedDates } = useApp()

  if (unresolvedDates.size === 0) return null

  return (
    <div className="pick-workout-banner">
      A completed run was detected but you haven't logged which workout you did.
      <a href="#workouts-section" className="banner-link">Select below ↓</a>
    </div>
  )
}
