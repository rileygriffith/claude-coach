import { useApp } from '../context/AppContext'

function formatPRTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const PR_LABELS = {
  pr_400m:     '400m',
  pr_half_mi:  '½ Mile',
  pr_1k:       '1K',
  pr_1mile:    '1 Mile',
  pr_2mile:    '2 Mile',
  pr_5k:       '5K',
  pr_10k:      '10K',
  pr_15k:      '15K',
  pr_10mile:   '10 Mile',
  pr_20k:      '20K',
  pr_half:     'Half',
  pr_marathon: 'Marathon',
}

export default function PersonalRecords() {
  const { prs } = useApp()

  const entries = Object.keys(PR_LABELS).filter(key => prs[key])
  if (!entries.length) return null

  return (
    <section className="section">
      <h2 className="section-label">Personal Records</h2>
      <div className="runs-grid">
        {entries.map(key => (
          <div key={key} className="run-card" style={{ textAlign: 'center' }}>
            <div className="run-date">{PR_LABELS[key]}</div>
            <div>
              <span className="run-distance">{formatPRTime(prs[key])}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
