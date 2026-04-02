import { useApp } from '../context/AppContext'
import { formatDistance, formatPace, formatElapsed, unitLabel, formatDate } from '../utils'

export default function RecentRuns() {
  const { runs, useImperial } = useApp()

  if (!runs.length) {
    return <div className="runs-grid"><div className="state-msg">No runs found on Strava yet.</div></div>
  }

  const recent = runs.slice(0, 5)

  return (
    <div className="runs-grid">
      {recent.map((run, i) => (
        <div key={run.id || i} className="run-card">
          <div className="run-date">{formatDate(run.date)}</div>
          <div>
            <span className="run-distance">{formatDistance(run.distance, useImperial)}</span>
            <span className="run-unit">{unitLabel(useImperial)}</span>
          </div>
          <div className="run-stats">
            <div>
              <div className="stat-label">Pace</div>
              <div className="stat-value">{formatPace(run.average_speed, useImperial)}</div>
            </div>
            <div>
              <div className="stat-label">Time</div>
              <div className="stat-value">{formatElapsed(run.elapsed_time)}</div>
            </div>
            <div>
              <div className="stat-label">Avg HR</div>
              <div className="stat-value">
                {run.average_heartrate ? Math.round(run.average_heartrate) + ' bpm' : '—'}
              </div>
            </div>
            <div>
              <div className="stat-label">Elev</div>
              <div className="stat-value">
                {run.total_elevation_gain ? Math.round(run.total_elevation_gain) + 'm' : '—'}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
