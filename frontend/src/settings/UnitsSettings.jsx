import { useApp } from '../context/AppContext'

export default function UnitsSettings() {
  const { useImperial, setUseImperial } = useApp()

  return (
    <div className="settings-group">
      <div className="settings-group-label">Units</div>
      <div className="unit-toggle">
        <button
          className={`unit-btn${!useImperial ? ' active' : ''}`}
          onClick={() => setUseImperial(false)}
        >
          km
        </button>
        <button
          className={`unit-btn${useImperial ? ' active' : ''}`}
          onClick={() => setUseImperial(true)}
        >
          mi
        </button>
      </div>
    </div>
  )
}
