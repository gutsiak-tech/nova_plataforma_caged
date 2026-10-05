import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LoadingState } from './components/ui/LoadingState'

const ExecutivePage = lazy(() =>
  import('./pages/ExecutivePage').then((m) => ({ default: m.ExecutivePage })),
)
const TerritoryPage = lazy(() =>
  import('./pages/TerritoryPage').then((m) => ({ default: m.TerritoryPage })),
)
const SectorPage = lazy(() => import('./pages/SectorPage').then((m) => ({ default: m.SectorPage })))
const OccupationPage = lazy(() =>
  import('./pages/OccupationPage').then((m) => ({ default: m.OccupationPage })),
)
const ProfilesPage = lazy(() =>
  import('./pages/ProfilesPage').then((m) => ({ default: m.ProfilesPage })),
)
const SalaryPage = lazy(() => import('./pages/SalaryPage').then((m) => ({ default: m.SalaryPage })))
const AboutDataPage = lazy(() =>
  import('./pages/AboutDataPage').then((m) => ({ default: m.AboutDataPage })),
)

function PageFallback() {
  return <LoadingState label="Carregando página..." />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Suspense fallback={<PageFallback />}>
              <ExecutivePage />
            </Suspense>
          }
        />
        <Route
          path="territorio"
          element={
            <Suspense fallback={<PageFallback />}>
              <TerritoryPage />
            </Suspense>
          }
        />
        <Route
          path="setores"
          element={
            <Suspense fallback={<PageFallback />}>
              <SectorPage />
            </Suspense>
          }
        />
        <Route
          path="ocupacoes"
          element={
            <Suspense fallback={<PageFallback />}>
              <OccupationPage />
            </Suspense>
          }
        />
        <Route
          path="perfil"
          element={
            <Suspense fallback={<PageFallback />}>
              <ProfilesPage />
            </Suspense>
          }
        />
        <Route
          path="salario"
          element={
            <Suspense fallback={<PageFallback />}>
              <SalaryPage />
            </Suspense>
          }
        />
        <Route
          path="sobre"
          element={
            <Suspense fallback={<PageFallback />}>
              <AboutDataPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
