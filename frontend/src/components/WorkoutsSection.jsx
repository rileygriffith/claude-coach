import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { selectWorkout } from '../api'
import { formatCost } from '../utils'

function WorkoutCard({ workout, optionKey, isRecommended, isSelected, isActive, onClick }) {
  if (!workout) return null
  const structure = Array.isArray(workout.structure)
    ? workout.structure
    : workout.structure.split('\n')

  return (
    <div
      className={`workout-card ${optionKey}${isActive ? ' carousel-active' : ''}${isSelected ? ' selected' : ''}`}
      onClick={onClick}
    >
      {isRecommended
        ? <span className="rec-badge">Recommended</span>
        : <span className="alt-badge">Alternative</span>}
      <div className="workout-type">{workout.type}</div>
      <div className="workout-structure">
        {structure.map((s, i) => <div key={i} className="workout-step">{s}</div>)}
      </div>
      <div className="workout-pace">Target: {workout.target_pace}</div>
      <div className="workout-rationale">{workout.rationale}</div>
      <div className="workout-selected-note">✓ Selected for today</div>
    </div>
  )
}

export default function WorkoutsSection() {
  const { todaySession, setTodaySession, refreshCalendar } = useApp()
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!todaySession) return null

  const recommended = todaySession.recommended || 'option_a'
  const order = [recommended, ...['option_a', 'option_b', 'option_c'].filter(k => k !== recommended)]
  const costStr = formatCost(todaySession.input_tokens, todaySession.output_tokens)

  function goTo(index) {
    setCurrentIndex(((index % order.length) + order.length) % order.length)
  }

  async function handleCardClick(optionKey) {
    const res = await selectWorkout(optionKey)
    if (res && res.ok) {
      setTodaySession({ ...todaySession, selected: optionKey })
      refreshCalendar()
    }
  }

  return (
    <section id="workouts-section" className="section">
      <div className="workouts-header">
        <h2 className="section-label">Today's Options</h2>
        {costStr && <span className="cost-display">{costStr}</span>}
      </div>
      <div className="workouts-grid">
        <div className="carousel">
          <button className="carousel-btn carousel-prev" onClick={() => goTo(currentIndex - 1)}>&#8592;</button>
          <div className="carousel-track">
            {order.map((key, i) => (
              <WorkoutCard
                key={key}
                workout={todaySession[key]}
                optionKey={key}
                isRecommended={key === recommended}
                isSelected={todaySession.selected === key}
                isActive={i === currentIndex}
                onClick={() => handleCardClick(key)}
              />
            ))}
          </div>
          <button className="carousel-btn carousel-next" onClick={() => goTo(currentIndex + 1)}>&#8594;</button>
        </div>
        <div className="carousel-dots">
          {order.map((_, i) => (
            <span
              key={i}
              className={`carousel-dot${i === currentIndex ? ' active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
