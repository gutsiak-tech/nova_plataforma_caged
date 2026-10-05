/**
 * Small, pragmatic design system presets.
 *
 * Goal: avoid scattering long Tailwind class strings while keeping layout/behavior unchanged.
 * Visual values reference CSS variables from `src/index.css` via `src/lib/tokens.ts`.
 */

import type { Scope } from '../api/types'
import { tokens } from './tokens'

const executiveSurfaceClass = [
  'border border-[color:var(--ds-border-faint)]',
  'bg-[color:var(--ds-surface-executive-start)]',
  'shadow-[var(--ds-shadow-executive)]',
].join(' ')

const executiveSurfaceInactiveClass = [
  'border border-[color:var(--ds-border-faint)]',
  'bg-[color:var(--ds-surface-executive-end)]',
  'shadow-[var(--ds-shadow-executive)]',
].join(' ')

const emphasizedKpiSurfaceClass = executiveSurfaceClass
const compareChipSurfaceClass = executiveSurfaceClass

const executiveKpiSurfaceClass = [
  'border border-[color:var(--ds-border-faint)]',
  'bg-[color:var(--ds-surface-kpi-executive-start)]',
  'shadow-[var(--ds-shadow-kpi-executive)]',
].join(' ')

export const theme = {
  /** Superfície glass compartilhada — mesma base dos KPIs (Admissões, Desligamentos, Saldo). */
  surface: {
    glassClass: 'border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-muted)]',
  },

  card: {
    baseClass: 'glass rounded-2xl p-5 md:p-6',
    translucentClass: 'rounded-xl p-5 md:p-6',
    hoverClass: 'transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-chart-hover)]',
  },

  loadingState: {
    labelClass: 'text-sm font-medium text-[color:var(--ds-text-secondary)]',
    spinnerClass:
      'h-8 w-8 shrink-0 rounded-full border-2 border-[color:var(--ds-border-faint)] border-t-[color:var(--ds-brand-gold)] animate-spin',
    blockClass:
      'h-32 animate-pulse rounded-2xl border border-[color:var(--ds-border-subtle)] bg-[color:var(--ds-surface-skeleton)] shadow-[var(--ds-shadow-skeleton-inset)]',
  },

  kpiTile: {
    baseClass:
      'rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-muted)] p-4',
    emphasizedSurfaceClass: emphasizedKpiSurfaceClass,
    emphasizedBaseClass: `rounded-2xl p-5 ${emphasizedKpiSurfaceClass}`,
    executiveBaseClass: `flex min-h-[11rem] flex-col rounded-xl px-5 pb-0 pt-4 ${executiveKpiSurfaceClass}`,
    executiveBodyClass: 'relative z-10 flex flex-1 flex-col pb-3',
    executiveValueSlotClass: 'mt-0.5 flex min-h-[2.75rem] items-end md:min-h-[3rem]',
    executiveDeltaSlotClass: 'mt-2 min-h-[1.375rem] leading-5',
    executiveVsSlotClass: 'mt-1 min-h-[1.25rem] leading-5',
    executiveSparklineClass: 'relative z-0 h-9 w-full shrink-0 overflow-hidden opacity-90',
    labelClass: 'text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-primary)]',
    emphasizedLabelClass:
      'text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ds-text-secondary)]',
    executiveLabelClass:
      'mt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)]',
    valueClass: 'mt-2 text-2xl font-semibold tracking-tight tabular-nums md:text-3xl',
    executiveValueClass:
      'min-w-[11ch] text-[2rem] font-bold tabular-nums leading-none tracking-tight md:text-4xl',
    hintClass: 'mt-1.5 text-xs font-medium tabular-nums text-[color:var(--ds-text-muted)]',
    emphasizedHintClass: 'mt-2 text-xs font-medium tabular-nums text-[color:var(--ds-text-muted)]',
    executiveDeltaClass: 'text-sm font-semibold tabular-nums',
    executiveVsClass: 'text-xs text-[color:var(--ds-text-secondary)]',
    tonePositive: 'text-[color:var(--ds-semantic-positive)]',
    toneNegative: 'text-[color:var(--ds-semantic-negative)]',
    toneNeutral: 'text-[color:var(--ds-text-primary)]',
    emphasizedTonePositive: 'text-[color:var(--ds-semantic-positive)]',
    emphasizedToneNegative: 'text-[color:var(--ds-semantic-negative)]',
    emphasizedToneNeutral: 'text-[color:var(--ds-text-primary)]',
  },

  kpiAccents: {
    blue: {
      iconBg: 'bg-[color:var(--ds-kpi-accent-blue-bg)] ring-[color:var(--ds-kpi-accent-blue-ring)]',
      iconColor: 'text-[color:var(--ds-brand-gold)]',
      spark: tokens.colors.brand.gold,
    },
    purple: {
      iconBg: 'bg-[color:var(--ds-kpi-accent-purple-bg)] ring-[color:var(--ds-kpi-accent-purple-ring)]',
      iconColor: 'text-[color:var(--ds-brand-gold-hover)]',
      spark: tokens.colors.brand.goldHover,
    },
    green: {
      iconBg: 'bg-[color:var(--ds-kpi-accent-green-bg)] ring-[color:var(--ds-kpi-accent-green-ring)]',
      iconColor: 'text-[color:var(--ds-brand-gold)]',
      spark: tokens.colors.brand.gold,
    },
  },

  compareChip: {
    baseClass: 'rounded-xl px-5 py-4 transition-[box-shadow,border-color] duration-200',
    activeClass: `${compareChipSurfaceClass} ring-1 ring-inset ring-[color:var(--ds-border-gold)]`,
    inactiveClass: `${compareChipSurfaceClass} hover:border-[color:var(--ds-border-subtle)]`,
    executiveBaseClass:
      'rounded-xl px-4 py-3.5 transition-[box-shadow,border-color,background-color] duration-200',
    executiveActiveClass: `${executiveSurfaceClass} ring-1 ring-inset`,
    executiveInactiveClass: `${executiveSurfaceInactiveClass} hover:border-[color:var(--ds-border-subtle)]`,
    executiveIconBoxClass:
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-muted)] ring-1 ring-inset ring-[color:var(--ds-border-faint)]',
    skeletonIconClass: 'h-9 w-9 shrink-0 rounded-lg bg-[color:var(--ds-border-subtle)]',
    skeletonLineSmClass: 'h-3 w-16 rounded bg-[color:var(--ds-border-subtle)]',
    skeletonLineMdClass: 'h-5 w-24 rounded bg-[color:var(--ds-border)]',
    skeletonLineLgClass: 'h-3 w-32 rounded bg-[color:var(--ds-border-faint)]',
    labelClass:
      'text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ds-text-secondary)]',
    valueClass: 'mt-1.5 text-lg font-semibold tabular-nums text-[color:var(--ds-text-primary)]',
    detailClass: 'mt-1.5 text-xs text-[color:var(--ds-text-secondary)]',
    executiveLabelClass:
      'text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)]',
    executiveValueClass: 'mt-1 text-lg font-bold tabular-nums text-[color:var(--ds-text-primary)] md:text-xl',
    executiveDetailClass: 'mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]',
  },

  scopeAccents: {
    br: {
      ring: 'ring-[color:var(--ds-scope-br-ring)]',
      icon: 'text-[color:var(--ds-brand-gold)]',
      glow: 'shadow-[var(--ds-scope-br-glow)]',
    },
    pr: {
      ring: 'ring-[color:var(--ds-scope-pr-ring)]',
      icon: 'text-[color:var(--ds-brand-gold-hover)]',
      glow: 'shadow-[var(--ds-scope-pr-glow)]',
    },
    rmc: {
      ring: 'ring-[color:var(--ds-scope-rmc-ring)]',
      icon: 'text-[color:var(--ds-brand-white-soft)]',
      glow: 'shadow-[var(--ds-scope-rmc-glow)]',
    },
  } satisfies Record<Scope, { ring: string; icon: string; glow: string }>,

  dataSourceNote: {
    compactClass:
      'border-t border-[color:var(--ds-border-faint)] pt-4 text-xs leading-relaxed text-[color:var(--ds-text-muted)]',
    panelClass:
      'rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-muted)] p-3.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]',
    titleClass: 'font-medium text-[color:var(--ds-text-secondary)]',
    highlightClass: 'text-[color:var(--ds-brand-white-soft)]',
  },

  dataSourceFooter: {
    className:
      'mt-8 flex flex-wrap items-center justify-center gap-1.5 pt-2 text-center text-xs text-[color:var(--ds-text-muted)]',
  },

  chartCard: {
    surfaceClass: [
      'border border-[color:var(--ds-border-faint)]',
      'bg-[color:var(--ds-surface-chart-start)]',
      'shadow-[var(--ds-shadow-executive)]',
    ].join(' '),
    executiveSurfaceClass: executiveSurfaceClass,
    footerClass: 'mt-4 border-t border-[color:var(--ds-border-faint)] pt-3',
    actionClass:
      'rounded-full border border-[color:var(--ds-border-subtle)] bg-[color:var(--ds-surface-muted)] px-3.5 py-1.5 text-xs font-medium text-[color:var(--ds-text-secondary)] transition-colors hover:border-[color:var(--ds-border-gold)] hover:bg-[color:var(--ds-surface-selector)] hover:text-[color:var(--ds-brand-gold)]',
  },

  executive: {
    pageStack: 'space-y-7',
    heroSection: 'max-w-3xl pt-2 lg:pt-4',
    heroEyebrow:
      'inline-flex items-center rounded-full border border-[color:var(--ds-border-subtle)] bg-[color:var(--ds-surface-executive-start)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-accent-label)] shadow-[var(--ds-shadow-executive)]',
    kpiGrid: 'grid gap-3 sm:gap-4 md:grid-cols-3 md:gap-4',
    compareSection: 'space-y-4',
    compareGrid: 'grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-3',
    chartGrid: 'grid gap-4 lg:grid-cols-2 lg:gap-5',
    chartSection: 'space-y-4',
    chartHoverClass:
      'transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-chart-hover)]',
    heroTitle:
      'mt-3 text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--ds-text-primary)] md:text-4xl lg:text-[2.5rem] lg:leading-[1.12] xl:text-[2.75rem]',
    heroSubtitle: 'mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--ds-text-secondary)]',
  },

  chartTable: {
    toggleClass:
      'inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--ds-border-subtle)] bg-[color:var(--ds-surface-muted)] text-[color:var(--ds-text-secondary)] transition-colors hover:border-[color:var(--ds-border-gold)] hover:text-[color:var(--ds-brand-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-border-gold)]',
    toggleActiveClass:
      'border-[color:var(--ds-border-gold)] bg-[color:var(--ds-kpi-accent-blue-bg)] text-[color:var(--ds-brand-gold)]',
    panelClass: 'mt-4 border-t border-[color:var(--ds-border-faint)] pt-4',
  },

  shell: {
    pageGradient: `min-h-screen bg-[color:var(--ds-surface-page)] bg-[image:var(--ds-shell-page-gradient)]`,
    sidebarSlotClass: 'relative z-30 hidden shrink-0 lg:block lg:w-[var(--ds-sidebar-width)]',
    sidebarPanelClass: [
      'group/sidebar sticky top-5 flex h-[calc(100vh-2.5rem)] w-[var(--ds-sidebar-width)] flex-col overflow-hidden',
      'rounded-2xl border border-[color:var(--ds-border-faint)] bg-[color:var(--ds-surface-sidebar)] px-2 py-4',
      'shadow-[var(--ds-shadow-executive)] transition-[width,box-shadow] duration-200 ease-out',
      'hover:w-[var(--ds-sidebar-width-expanded)] focus-within:w-[var(--ds-sidebar-width-expanded)]',
      'hover:shadow-[var(--ds-shadow-card)] focus-within:shadow-[var(--ds-shadow-card)]',
    ].join(' '),
    sidebarBrandRow:
      'mx-auto flex h-12 min-h-12 w-12 shrink-0 items-center group-hover/sidebar:mx-0 group-hover/sidebar:w-full group-focus-within/sidebar:mx-0 group-focus-within/sidebar:w-full',
    sidebarBrandIconSlot: 'flex h-12 w-12 shrink-0 items-center justify-center',
    sidebarBrandIcon: 'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg',
    sidebarBrandLogoImage: 'h-12 w-12 shrink-0 object-contain',
    sidebarBrandTextWrap:
      'min-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 ease-out max-w-0 group-hover/sidebar:max-w-[10rem] group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-[10rem] group-focus-within/sidebar:opacity-100',
    sidebarBrandLabel: 'text-sm font-bold leading-none tracking-wide text-[color:var(--ds-text-primary)]',
    sidebarBrandTitle: 'mt-1 text-xs leading-none text-[color:var(--ds-text-muted)]',
    sidebarNavClass:
      'flex flex-col items-center gap-2 group-hover/sidebar:items-stretch group-focus-within/sidebar:items-stretch',
    sidebarNavIconSlot: 'flex h-11 w-12 shrink-0 items-center justify-center',
    sidebarNavIcon: 'h-6 w-6 shrink-0 stroke-[2.25]',
    sidebarNavLabel:
      'min-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 ease-out max-w-0 group-hover/sidebar:max-w-[11rem] group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-[11rem] group-focus-within/sidebar:opacity-100',
    navLinkBase:
      'mx-auto flex h-11 min-h-11 w-12 shrink-0 items-center rounded-xl pr-2 text-sm font-medium ring-1 ring-inset ring-transparent shadow-none transition-[color,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--ds-border-gold)] group-hover/sidebar:mx-0 group-hover/sidebar:w-full group-focus-within/sidebar:mx-0 group-focus-within/sidebar:w-full',
    navLinkActive:
      'bg-[color:var(--ds-surface-selector)] text-[color:var(--ds-brand-gold)] shadow-[var(--ds-shadow-nav-active)] ring-[color:var(--ds-border-gold)]',
    navLinkInactive:
      'text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-muted)] hover:text-[color:var(--ds-brand-white)]',
    mobileNavActive:
      'bg-[color:var(--ds-surface-selector)] text-[color:var(--ds-brand-gold)] ring-1 ring-[color:var(--ds-border-gold)]',
    mobileNavInactive:
      'bg-[color:var(--ds-surface-muted)] text-[color:var(--ds-text-secondary)] ring-1 ring-[color:var(--ds-border-faint)] hover:bg-[color:var(--ds-surface-selector)] hover:text-[color:var(--ds-brand-white)]',
    globalHeaderClass: 'mb-6 space-y-5',
    globalControlsRowClass:
      'flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-center xl:gap-6',
  },

  selector: {
    labelClass:
      'text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-muted)]',
    containerClass: [
      'inline-flex max-w-full flex-wrap rounded-full border border-[color:var(--ds-border-subtle)]',
      'bg-[color:var(--ds-surface-selector)] p-1 shadow-[var(--ds-shadow-selector-inset)]',
    ].join(' '),
    buttonClass:
      'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-border-gold)]',
    toggleButtonBaseClass:
      'relative h-8 shrink-0 rounded-full border border-transparent px-3 text-sm font-medium tabular-nums transition-[color,background-color,box-shadow,border-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-border-gold)]',
    scopeButtonClass: 'w-[5.5rem]',
    monthButtonClass: 'min-w-[4.75rem]',
    toggleButtonActiveClass: [
      'border-[color:var(--ds-selector-active-border)]',
      'bg-[color:var(--ds-selector-active-from)]',
      'text-[color:var(--ds-brand-navy-deep)] shadow-[var(--ds-shadow-selector-active)]',
    ].join(' '),
    toggleButtonInactiveClass:
      'text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-brand-white)]',
    loadingContainerClass: 'min-w-[7rem] animate-pulse opacity-60',
    inactiveTextClass: 'text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-brand-white)]',
    activeTextClass: 'font-semibold text-[color:var(--ds-brand-navy-deep)]',
    pillClass:
      'absolute inset-0 rounded-full bg-[color:var(--ds-selector-active-from)] shadow-[var(--ds-shadow-selector-active)]',
  },

  typography: {
    heroLabel: 'text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ds-brand-gold)]',
    heroTitle:
      'mt-2 text-balance text-3xl font-semibold leading-tight tracking-tight text-[color:var(--ds-text-primary)] md:text-4xl lg:text-[2.5rem] lg:leading-[1.12] xl:text-[2.75rem]',
    heroTitleExecutive:
      'mt-2.5 text-balance text-3xl font-semibold leading-tight tracking-tight text-[color:var(--ds-text-primary)] md:text-4xl lg:text-[2.5rem] lg:leading-[1.12] xl:text-[2.75rem]',
    pageSubtitle: 'mt-2 max-w-2xl text-sm text-[color:var(--ds-text-secondary)]',
    sectionTitle: 'text-base font-semibold tracking-tight text-[color:var(--ds-text-primary)] md:text-lg',
    sectionSubtitle: 'mt-1 max-w-prose text-sm text-[color:var(--ds-text-secondary)]',
    smallMuted: 'text-xs text-[color:var(--ds-text-muted)]',
  },

  doc: {
    bodyClass: 'text-sm leading-relaxed text-[color:var(--ds-text-secondary)]',
    emphasisClass: 'font-medium text-[color:var(--ds-brand-white-soft)]',
    layerClass: 'text-[color:var(--ds-text-secondary)]',
    codeClass: 'rounded bg-[color:var(--ds-surface-selector)] px-1 font-mono text-xs text-[color:var(--ds-brand-white-soft)]',
    endpointClass: 'shrink-0 font-mono text-xs text-[color:var(--ds-brand-white-soft)]',
    badgeClass:
      'rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-muted)] px-3 py-1 text-sm text-[color:var(--ds-text-secondary)]',
  },
} as const
