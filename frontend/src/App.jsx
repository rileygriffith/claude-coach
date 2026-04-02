import { Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import MainPage from './pages/MainPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppProvider>
  )
}
