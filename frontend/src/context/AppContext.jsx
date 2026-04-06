import React, { createContext, useContext, useState, useEffect } from 'react'
import { localDateStr } from '../utils'
import { getMe, getActivities, getTodaySession, getSessionDates, getUnresolvedSessions, getPRs, getPendingResults } from '../api'

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
  const [prs, setPRs] = useState({})
  const [prSource, setPRSource] = useState(null)
  const [pendingResultDates, setPendingResultDates] = useState([])

  function setUseImperial(val) {
    localStorage.setItem('useImperial', val ? 'true' : 'false')
    setUseImperialState(val)
  }

  function refreshCalendar() {
    setCalendarVersion(v => v + 1)
    getUnresolvedSessions()
      .then(r => r && r.json())
      .then(data => { if (data && data.dates) setUnresolvedDates(new Set(data.dates)) })
      .catch(() => {})
    getPendingResults()
      .then(r => r && r.json())
      .then(data => { if (data?.dates) setPendingResultDates(data.dates) })
      .catch(() => {})
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

    getPRs()
      .then(r => r && r.json())
      .then(data => {
        if (data) {
          setPRs(data.prs || {})
          setPRSource(data.source || null)
        }
      })
      .catch(() => {})

    getPendingResults()
      .then(r => r && r.json())
      .then(data => { if (data?.dates) setPendingResultDates(data.dates) })
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
    prs,
    prSource,
    pendingResultDates,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  return useContext(AppContext)
}
