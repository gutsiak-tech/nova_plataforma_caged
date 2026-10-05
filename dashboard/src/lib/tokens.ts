/**
 * Design system tokens for the dashboard.
 *
 * Raw values live in `src/index.css` as CSS variables.
 * This file provides typed accessors so components stop repeating literals.
 */

export const tokens = {
  cssVar(name: `--ds-${string}`) {
    return `var(${name})`
  },

  colors: {
    brand: {
      navy: 'var(--ds-brand-navy)',
      navySecondary: 'var(--ds-brand-navy-secondary)',
      navyDeep: 'var(--ds-brand-navy-deep)',
      gold: 'var(--ds-brand-gold)',
      goldHover: 'var(--ds-brand-gold-hover)',
      white: 'var(--ds-brand-white)',
      whiteSoft: 'var(--ds-brand-white-soft)',
      borderGold: 'var(--ds-border-gold)',
    },
    accent: {
      gold: 'var(--ds-accent-gold)',
      goldHover: 'var(--ds-accent-gold-hover)',
      cyan: 'var(--ds-accent-cyan)',
      sky: 'var(--ds-accent-sky)',
      blue: 'var(--ds-accent-blue)',
      blueBright: 'var(--ds-accent-blue-bright)',
      indigo: 'var(--ds-accent-indigo)',
      purple: 'var(--ds-accent-purple)',
      violet: 'var(--ds-accent-violet)',
      violetBright: 'var(--ds-accent-violet-bright)',
      yellow: 'var(--ds-accent-yellow)',
      green: 'var(--ds-accent-green)',
      emerald: 'var(--ds-accent-emerald)',
      emeraldBright: 'var(--ds-accent-emerald-bright)',
      rose: 'var(--ds-accent-rose)',
    },
    semantic: {
      positive: 'var(--ds-semantic-positive)',
      negative: 'var(--ds-semantic-negative)',
      neutral: 'var(--ds-semantic-neutral)',
    },
    text: {
      primary: 'var(--ds-text-primary)',
      secondary: 'var(--ds-text-secondary)',
      muted: 'var(--ds-text-muted)',
      accentLabel: 'var(--ds-text-accent-label)',
    },
    border: {
      standard: 'var(--ds-border)',
      subtle: 'var(--ds-border-subtle)',
      faint: 'var(--ds-border-faint)',
      gold: 'var(--ds-border-gold)',
    },
    surface: {
      page: 'var(--ds-surface-page)',
      card: 'var(--ds-surface-card)',
      cardStart: 'var(--ds-surface-card-start)',
      cardEnd: 'var(--ds-surface-card-end)',
      chartStart: 'var(--ds-surface-chart-start)',
      chartEnd: 'var(--ds-surface-chart-end)',
      executiveStart: 'var(--ds-surface-executive-start)',
      executiveMid: 'var(--ds-surface-executive-mid)',
      executiveEnd: 'var(--ds-surface-executive-end)',
      kpiExecutiveStart: 'var(--ds-surface-kpi-executive-start)',
      kpiExecutiveEnd: 'var(--ds-surface-kpi-executive-end)',
      kpi: 'var(--ds-surface-kpi)',
      muted: 'var(--ds-surface-muted)',
      sidebar: 'var(--ds-surface-sidebar)',
      selector: 'var(--ds-surface-selector)',
      skeleton: 'var(--ds-surface-skeleton)',
    },
    shell: {
      pageGradient: 'var(--ds-shell-page-gradient)',
      marginLeft: 'var(--ds-shell-margin-left)',
      sidebarWidth: 'var(--ds-sidebar-width)',
      sidebarGap: 'var(--ds-sidebar-gap)',
    },
    selector: {
      activeBorder: 'var(--ds-selector-active-border)',
      activeFrom: 'var(--ds-selector-active-from)',
      activeTo: 'var(--ds-selector-active-to)',
    },
    skeleton: {
      surface: 'var(--ds-surface-skeleton)',
      insetShadow: 'var(--ds-shadow-skeleton-inset)',
    },
    chart: {
      grid: 'var(--ds-chart-grid)',
      tick: 'var(--ds-chart-tick)',
      label: 'var(--ds-chart-label)',
      tooltipBg: 'var(--ds-chart-tooltip-bg)',
      tooltipBorder: 'var(--ds-chart-tooltip-border)',
      tooltipText: 'var(--ds-chart-tooltip-text)',
      cursor: 'var(--ds-chart-cursor)',
    },
    territory: {
      placeholderAccent1: 'var(--ds-bg-placeholder-accent-1)',
      placeholderAccent2: 'var(--ds-bg-placeholder-accent-2)',
    },
  },

  shadow: {
    card: 'var(--ds-shadow-card)',
    executive: 'var(--ds-shadow-executive)',
    kpiExecutive: 'var(--ds-shadow-kpi-executive)',
    chartInset: 'var(--ds-shadow-chart-inset)',
    skeletonInset: 'var(--ds-shadow-skeleton-inset)',
    selectorActive: 'var(--ds-shadow-selector-active)',
    navActive: 'var(--ds-shadow-nav-active)',
    chartHover: 'var(--ds-shadow-chart-hover)',
    selectorInset: 'var(--ds-shadow-selector-inset)',
  },
} as const
