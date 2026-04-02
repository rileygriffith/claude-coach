import { useState, useEffect, useRef } from 'react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function formatDisplay(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DatePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewing, setViewing] = useState(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      d.setDate(1)
      return d
    }
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selected, setSelected] = useState(() => {
    return value ? new Date(value + 'T00:00:00') : null
  })
  const [popupStyle, setPopupStyle] = useState({})
  const inputRef = useRef(null)
  const popupRef = useRef(null)

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      setSelected(d)
    } else {
      setSelected(null)
    }
  }, [value])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setPopupStyle({
        position: 'fixed',
        top: `${r.bottom + 4}px`,
        left: `${r.left}px`,
        zIndex: 200,
      })
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleClick() { setIsOpen(false) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [isOpen])

  function handleInputClick(e) {
    e.stopPropagation()
    setIsOpen(open => !open)
  }

  function prevMonth(e) {
    e.stopPropagation()
    setViewing(v => {
      const d = new Date(v)
      d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  function nextMonth(e) {
    e.stopPropagation()
    setViewing(v => {
      const d = new Date(v)
      d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  function handleDayClick(e, dateStr) {
    e.stopPropagation()
    const d = new Date(dateStr + 'T00:00:00')
    setSelected(d)
    onChange(dateStr)
    setIsOpen(false)
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const y = viewing.getFullYear()
  const m = viewing.getMonth()
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  const dayCells = []
  for (let i = 0; i < firstDay; i++) {
    dayCells.push(<div key={`b-${i}`} />)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const date = new Date(y, m, d)
    const isPast = date < today
    const isSel = selected && date.toDateString() === selected.toDateString()
    let cls = 'dp-day'
    if (isSel) cls += ' dp-selected'
    if (isPast) cls += ' dp-past'
    dayCells.push(
      <div
        key={dateStr}
        className={cls}
        onClick={isPast ? undefined : (e) => handleDayClick(e, dateStr)}
      >
        {d}
      </div>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className="settings-input"
        placeholder="Pick a date"
        readOnly
        style={{ cursor: 'pointer' }}
        value={selected ? formatDisplay(selected) : ''}
        onClick={handleInputClick}
      />
      {isOpen && (
        <div
          ref={popupRef}
          className="datepicker-popup"
          style={popupStyle}
          onClick={e => e.stopPropagation()}
        >
          <div className="dp-header">
            <button className="dp-nav" onClick={prevMonth}>&#8249;</button>
            <span className="dp-month">{MONTHS[m]} {y}</span>
            <button className="dp-nav" onClick={nextMonth}>&#8250;</button>
          </div>
          <div className="dp-grid-head">
            {DAYS.map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="dp-grid">
            {dayCells}
          </div>
        </div>
      )}
    </>
  )
}
