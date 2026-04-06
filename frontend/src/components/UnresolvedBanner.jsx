import { useApp } from '../context/AppContext'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

export default function UnresolvedBanner({ onOpenSession }) {
  const { unresolvedDates, pendingResultDates } = useApp()

  const unresolved = [...unresolvedDates].sort().reverse()
  const pending = pendingResultDates.filter(d => !unresolvedDates.has(d)).sort().reverse()

  if (!unresolved.length && !pending.length) return null

  return (
    <div className="banners">
      {unresolved.map(date => (
        <div key={date} className="pick-workout-banner">
          You ran on {formatDate(date)} but haven't logged which workout you did.
          <button className="banner-link" onClick={() => onOpenSession(date)}>Log it ↗</button>
        </div>
      ))}
      {pending.map(date => (
        <div key={date} className="pick-workout-banner pick-workout-banner--result">
          How did your workout go on {formatDate(date)}?
          <button className="banner-link" onClick={() => onOpenSession(date)}>Log result ↗</button>
        </div>
      ))}
    </div>
  )
}
