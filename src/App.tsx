import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Loading } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { isDemo } from './lib/supabase'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'
import { ProjectDetail } from './pages/ProjectDetail'
import { Projects } from './pages/Projects'
import { Sessions } from './pages/Sessions'
import { Settings } from './pages/Settings'
import { Studio } from './pages/Studio'

function Gate() {
  const { ready, session } = useAuth()
  if (!ready) return <Loading />
  if (!isDemo && !session) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:slug" element={<ProjectDetail />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="studio" element={<Studio />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
