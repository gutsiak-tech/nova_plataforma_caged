import { NavLink, Outlet, useSearchParams, type To } from 'react-router-dom'
import clsx from 'clsx'
import {
  Activity,
  Briefcase,
  Building2,
  Info,
  Layers,
  MapPinned,
  Users,
} from 'lucide-react'
import { ScopeProvider } from '../../context/ScopeContext'
import { MonthProvider } from '../../context/MonthContext'
import { ScopeToggle } from './ScopeToggle'
import { MonthToggle } from './MonthToggle'
import { ContextHint } from './ContextHint'
import { CompetenciaBadge } from '../ui/CompetenciaBadge'
import { DataSourceFooter } from '../ui/DataSourceFooter'
import { TerritoryBackground } from '../map/TerritoryBackground'
import { theme } from '../../lib/theme'

const nav = [
  { to: '/', label: 'Visão executiva', icon: Activity },
  { to: '/territorio', label: 'Território', icon: MapPinned },
  { to: '/setores', label: 'Setores', icon: Layers },
  { to: '/ocupacoes', label: 'Ocupações', icon: Briefcase },
  { to: '/perfil', label: 'Perfil demográfico', icon: Users },
  { to: '/salario', label: 'Salários', icon: Building2 },
  { to: '/sobre', label: 'Sobre os dados', icon: Info },
]

function navTarget(pathname: string, searchParams: URLSearchParams): To {
  const search = searchParams.toString()
  if (!search) return pathname
  return { pathname, search }
}

function handleSidebarNavMouseDown(event: React.MouseEvent<HTMLAnchorElement>) {
  // Evita que clique com mouse deixe o link focado e trave o sidebar em focus-within.
  if (event.button === 0) {
    event.preventDefault()
  }
}

function AppShellLayout() {
  const [searchParams] = useSearchParams()

  return (
    <div className={theme.shell.pageGradient}>
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-5 px-4 py-5 md:px-6 lg:ml-4 lg:mr-6 lg:px-0">
        <aside className={theme.shell.sidebarSlotClass} aria-label="Barra lateral">
          <div className={theme.shell.sidebarPanelClass}>
            <div>
              <div className="mb-6 h-12 shrink-0">
                <div className={theme.shell.sidebarBrandRow}>
                  <div className={theme.shell.sidebarBrandIconSlot}>
                    <div className={theme.shell.sidebarBrandIcon}>
                      <img
                        src="/estudio_logo.png"
                        alt=""
                        className={theme.shell.sidebarBrandLogoImage}
                        aria-hidden
                      />
                    </div>
                  </div>
                  <div className={theme.shell.sidebarBrandTextWrap}>
                    <p className={theme.shell.sidebarBrandLabel}>CAGED</p>
                    <p className={theme.shell.sidebarBrandTitle}>Painel analítico</p>
                  </div>
                </div>
              </div>

              <nav className={theme.shell.sidebarNavClass} aria-label="Navegação principal">
                {nav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={navTarget(item.to, searchParams)}
                    end={item.to === '/'}
                    aria-label={item.label}
                    onMouseDown={handleSidebarNavMouseDown}
                    className={({ isActive }) =>
                      clsx(
                        theme.shell.navLinkBase,
                        isActive ? theme.shell.navLinkActive : theme.shell.navLinkInactive,
                      )
                    }
                  >
                    <span className={theme.shell.sidebarNavIconSlot}>
                      <item.icon
                        className={clsx(
                          theme.shell.sidebarNavIcon,
                          'opacity-90',
                        )}
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    </span>
                    <span className={theme.shell.sidebarNavLabel}>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        <main className="relative isolate z-0 min-w-0 flex-1 pb-10">
          <TerritoryBackground />

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <header className={theme.shell.globalHeaderClass}>
              <div className="flex items-start justify-between gap-3 lg:hidden">
                <div>
                  <p className={theme.shell.sidebarBrandLabel}>CAGED</p>
                  <h1 className="text-base font-semibold text-white">Painel analítico</h1>
                </div>
                <CompetenciaBadge compact className="shrink-0" />
              </div>

              <div className={theme.shell.globalControlsRowClass}>
                <ScopeToggle />
                <MonthToggle />
                <div className="hidden shrink-0 self-center lg:block xl:min-w-[22rem]">
                  <ContextHint />
                </div>
              </div>
            </header>

            <nav
              className="mb-5 -mx-1 overflow-x-auto pb-1 lg:hidden"
              aria-label="Navegação rápida"
            >
              <div className="flex min-w-max gap-1.5">
                {nav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={navTarget(item.to, searchParams)}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                        isActive ? theme.shell.mobileNavActive : theme.shell.mobileNavInactive,
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </nav>

            <div className="flex min-h-[calc(100dvh-13rem)] flex-1 flex-col sm:min-h-[calc(100dvh-12rem)]">
              <div className="flex-1">
                <Outlet />
              </div>
              <DataSourceFooter />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <ScopeProvider>
      <MonthProvider>
        <AppShellLayout />
      </MonthProvider>
    </ScopeProvider>
  )
}
