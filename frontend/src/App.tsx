import { Navigate, Route, Routes } from 'react-router-dom'
import { homeFor, useAuth } from './auth/context'
import { RequireAuth, RequireRole } from './auth/guards'
import { AppShell } from './layout/AppShell'
import { ArchivePage } from './pages/ArchivePage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { PeoplePage } from './pages/PeoplePage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'

export function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/my-work" element={<RequireRole roles={['employee']}><MyWorkPage /></RequireRole>} />
          <Route path="/dashboard" element={<RequireRole roles={['admin', 'manager']}><DashboardPage /></RequireRole>} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/people" element={<RequireRole roles={['admin', 'manager']}><PeoplePage /></RequireRole>} />
          <Route path="/archive" element={<RequireRole roles={['admin']}><ArchivePage /></RequireRole>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
    </Routes>
  )
}
