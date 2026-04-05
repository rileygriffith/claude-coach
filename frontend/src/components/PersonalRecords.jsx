import { useApp } from '../context/AppContext'

function formatPRTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const PR_LABELS = [
  { key: 'pr_1mile',    label: '1 Mile' },
  { key: 'pr_5k',       label: '5K' },
  { key: 'pr_10k',      label: '10K' },
  { key: 'pr_half',     label: 'Half' },
  { key: 'pr_marathon', label: 'Marathon' },
]

export default function PersonalRecords() {
  const { prs } = useApp()

  const entries = PR_LABELS.filter(({ key }) => prs[key])
  if (!entries.length) return null

  return (
    <section className="section">
      <h2 className="section-label">Personal Records</h2>
      <div className="runs-grid">
        {entries.map(({ key, label }) => (
          <div key={key} className="run-card" style={{ textAlign: 'center' }}>
            <div className="run-date">{label}</div>
            <div>
              <span className="run-distance">{formatPRTime(prs[key])}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
