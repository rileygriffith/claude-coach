import React, { createContext, useContext, useState, useEffect } from 'react'
import { localDateStr } from '../utils'
import { getMe, getActivities, getTodaySession, getSessionDates, getUnresolvedSessions } from '../api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [useImperial, setUseImperialState] = useState(
    () => localStorage.getItem('useImperial') !== 'false'
  )
  const [runs, setRuns] = useState([])
  const [todaySession, setTodaySession] = useState(null)
  const [targetDate, setTargetDate] = useState(() => localDateStr())
  const [username, setUsername] = useState('')
  const [unresolvedDates, setUnresolvedDates] = useState(new Set())
  const [sessionDates, setSessionDates] = useState(new Set())
  const [calendarVersion, setCalendarVersion] = useState(0)

  function setUseImperial(val) {
    localStorage.setItem('useImperial', val ? 'true' : 'false')
    setUseImperialState(val)
  }

  function refreshCalendar() {
    setCalendarVersion(v => v + 1)
  }

  useEffect(() => {
    getMe()
      .then(r => r && r.json())
      .then(data => { if (data && data.username) setUsername(data.username) })
      .catch(() => {})

    getActivities()
      .then(r => r && r.json())
      .then(data => { if (Array.isArray(data)) setRuns(data) })
      .catch(() => {})

    getTodaySession()
      .then(r => r && r.json())
      .then(data => { if (data && data.session) setTodaySession(data.session) })
      .catch(() => {})

    getSessionDates()
      .then(r => r && r.json())
      .then(data => { if (data && data.dates) setSessionDates(new Set(data.dates)) })
      .catch(() => {})

    getUnresolvedSessions()
      .then(r => r && r.json())
      .then(data => { if (data && data.dates) setUnresolvedDates(new Set(data.dates)) })
      .catch(() => {})
  }, [])

  const value = {
    useImperial, setUseImperial,
    runs, setRuns,
    todaySession, setTodaySession,
    targetDate, setTargetDate,
    username, setUsername,
    unresolvedDates, setUnresolvedDates,
    sessionDates, setSessionDates,
    calendarVersion,
    refreshCalendar,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  return useContext(AppContext)
}
