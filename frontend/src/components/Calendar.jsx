import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getSessionDates, getUnresolvedSessions } from '../api'
import { localDateStr } from '../utils'

export default function Calendar({ onSessionClick }) {
  const {
    runs, unresolvedDates, sessionDates, targetDate, setTargetDate,
    calendarVersion, setSessionDates, setUnresolvedDates,
  } = useApp()

  const today = new Date()
  const [calViewYear, setCalViewYear] = useState(today.getFullYear())
  const [calViewMonth, setCalViewMonth] = useState(today.getMonth())

  useEffect(() => {
    getSessionDates()
      .then(r => r && r.json())
      .then(data => { if (data && data.dates) setSessionDates(new Set(data.dates)) })
      .catch(() => {})

    getUnresolvedSessions()
      .then(r => r && r.json())
      .then(data => { if (data && data.dates) setUnresolvedDates(new Set(data.dates)) })
      .catch(() => {})
  }, [calendarVersion])

  const todayStr = localDateStr(today)
  const runDates = new Set(runs.map(r => r.date.slice(0, 10)))

  const monthName = new Date(calViewYear, calViewMonth, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric'
  })

  function prevMonth() {
    const d = new Date(calViewYear, calViewMonth - 1, 1)
    setCalViewYear(d.getFullYear())
    setCalViewMonth(d.getMonth())
  }

  function nextMonth() {
    const d = new Date(calViewYear, calViewMonth + 1, 1)
    setCalViewYear(d.getFullYear())
    setCalViewMonth(d.getMonth())
  }

  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay()
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate()
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const cells = []
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`blank-${i}`} className="cal-cell empty" />)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const hasRun = runDates.has(dateStr)
    const isToday = dateStr === todayStr
    const isFutureOrToday = dateStr >= todayStr
    const isUnresolved = unresolvedDates.has(dateStr)
    const hasSession = sessionDates.has(dateStr)
    const isTarget = dateStr === targetDate

    let cls = 'cal-cell'
    if (hasRun) cls += ' has-run'
    if (isToday) cls += ' today'
    if (isUnresolved) cls += ' unresolved'
    if (hasSession) cls += ' has-session'
    if (isFutureOrToday && !hasSession) cls += ' future-selectable'
    if (isTarget) cls += ' target-date'

    function handleDayClick(ds, hs) {
      if (hs) {
        onSessionClick(ds)
      } else if (ds >= todayStr) {
        setTargetDate(ds)
      }
    }

    cells.push(
      <div key={dateStr} className={cls} onClick={() => handleDayClick(dateStr, hasSession)}>
        <span className="cal-day-num">{d}</span>
        {hasRun && <span className="cal-dot" />}
      </div>
    )
  }

  return (
    <div id="calendar" className="calendar">
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevMonth}>&#8249;</button>
        <span className="cal-month-label">{monthName}</span>
        <button className="cal-nav-btn" onClick={nextMonth}>&#8250;</button>
      </div>
      <div className="cal-grid">
        {DAY_LABELS.map(d => (
          <div key={d} className="cal-day-label">{d}</div>
        ))}
        {cells}
      </div>
    </div>
  )
}
